package main

import (
	"context"
	"earthquake-observatory/internal/observatory"
	"embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

//go:embed dist
var assets embed.FS

// version is the single source of truth for the release string; the release
// script overrides it with -ldflags "-X main.version=$version".
var version = "dev"

var requests atomic.Uint64

// reply writes a JSON body. Validation failures are the caller's mistake
// (400); anything else means USGS or storage failed (502).
func reply(w http.ResponseWriter, v any, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	if err != nil {
		status := http.StatusBadGateway
		if errors.Is(err, observatory.ErrInvalid) {
			status = http.StatusBadRequest
		}
		w.WriteHeader(status)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	if d, ok := v.(observatory.Dataset); ok {
		d.WriteJSON(w)
		return
	}
	json.NewEncoder(w).Encode(v)
}

// secure wraps every route with the loopback-only policy and response
// headers. It is the single place the browser-facing security posture lives.
func secure(next http.Handler, requests *atomic.Uint64) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := requests.Add(1)
		w.Header().Set("X-Request-ID", fmt.Sprint(id))
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
		w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
		host, _, _ := net.SplitHostPort(r.Host)
		if host != "127.0.0.1" && host != "localhost" && host != "::1" {
			http.Error(w, "loopback host required", 403)
			return
		}
		// Browsers treat every localhost port as the same site, so a page on
		// another local port could still trigger GET routes that write the
		// cache or fan out to USGS. Only same-origin pages, direct navigation
		// and non-browser clients (no Sec-Fetch-Site header) reach the API.
		if site := r.Header.Get("Sec-Fetch-Site"); site == "cross-site" || (strings.HasPrefix(r.URL.Path, "/api/") && site != "" && site != "same-origin" && site != "none") {
			http.Error(w, "cross-site request denied", 403)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	addr := flag.String("addr", "127.0.0.1:8787", "loopback listen address")
	data := flag.String("data-dir", "", "SQLite directory")
	demo := flag.Bool("demo", false, "start with bundled historical data")
	noBrowser := flag.Bool("no-browser", false, "do not open browser")
	backup := flag.String("backup", "", "write consistent SQLite backup then exit")
	check := flag.Bool("check-db", false, "check database and exit")
	flag.Parse()
	if *data == "" {
		base, err := os.UserConfigDir()
		if err != nil {
			panic(err)
		}
		*data = filepath.Join(base, "EarthquakeObservatory")
	}
	if _, statErr := os.Stat(*data); os.IsNotExist(statErr) {
		// A directory this program creates is private; one the user chose
		// (perhaps their home or the repository) keeps whatever mode it has.
		if err := os.MkdirAll(*data, 0700); err != nil {
			panic(err)
		}
		if err := os.Chmod(*data, 0700); err != nil {
			slog.Warn("Could not restrict data directory", "path", *data, "error", err)
		}
	}
	dbPath := filepath.Join(*data, "observatory.db")
	store, err := observatory.Open(dbPath)
	if err != nil {
		panic(err)
	}
	defer store.DB.Close()
	// Investigation notes and cached catalogs must not be readable by other
	// local accounts even when the directory itself is shared.
	for _, suffix := range []string{"", "-wal", "-shm"} {
		if err := os.Chmod(dbPath+suffix, 0600); err != nil && !os.IsNotExist(err) {
			slog.Warn("Could not restrict database file", "path", dbPath+suffix, "error", err)
		}
	}
	if *backup != "" {
		if err := store.Backup(*backup); err != nil {
			panic(err)
		}
		if err := os.Chmod(*backup, 0600); err != nil {
			panic(err)
		}
		fmt.Println("Backup written:", *backup)
		return
	}
	if *check {
		if err := store.Check(); err != nil {
			panic(err)
		}
		fmt.Println("Database integrity: ok")
		return
	}
	svc := observatory.NewService(store)
	static, _ := fs.Sub(assets, "dist")
	mux := http.NewServeMux()
	registerWorkspaceRoutes(mux, svc, store)
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		reply(w, map[string]string{"status": "ok", "version": version}, nil)
	})
	mux.HandleFunc("GET /api/ready", func(w http.ResponseWriter, r *http.Request) {
		reply(w, map[string]bool{"ready": store.Check() == nil}, nil)
	})
	mux.HandleFunc("GET /api/config", func(w http.ResponseWriter, r *http.Request) { reply(w, map[string]bool{"demo": *demo}, nil) })
	mux.HandleFunc("GET /api/recent", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		d, e := svc.Recent(r.Context(), q.Get("period"), q.Get("level"))
		reply(w, d, e)
	})
	const demoQuery = "Bundled USGS historical snapshot: 2023-02-06 to 2023-02-13 UTC; M4+; retrieved 2026-09-06 UTC"
	mux.HandleFunc("GET /api/demo", func(w http.ResponseWriter, r *http.Request) {
		// The bundle never changes, so one save per database is enough; a
		// repeat visit must not pay for 600 upserts or evict a cached feed.
		if d, e := store.Latest(demoQuery); e == nil {
			reply(w, d, nil)
			return
		}
		b, e := fs.ReadFile(static, "data/demo.geojson")
		if e != nil {
			reply(w, nil, e)
			return
		}
		d, e := store.Save(demoQuery, b)
		reply(w, d, e)
	})
	// Syntactic parsing only; semantic limits are the service's to enforce.
	interval := func(w http.ResponseWriter, q url.Values) (time.Time, time.Time, float64, bool) {
		a, e1 := time.Parse(time.RFC3339Nano, q.Get("start"))
		b, e2 := time.Parse(time.RFC3339Nano, q.Get("end"))
		m, e3 := strconv.ParseFloat(q.Get("min"), 64)
		if e1 != nil || e2 != nil || e3 != nil {
			reply(w, nil, fmt.Errorf("%w: start and end must be RFC3339 timestamps and min a number", observatory.ErrInvalid))
			return a, b, m, false
		}
		return a, b, m, true
	}
	mux.HandleFunc("GET /api/history", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		a, b, m, ok := interval(w, q)
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Minute)
		defer cancel()
		var d observatory.Dataset
		var e error
		if job := q.Get("job"); job != "" {
			d, e = svc.HistoryTracked(ctx, a, b, m, job)
		} else {
			d, e = svc.History(ctx, a, b, m)
		}
		reply(w, d, e)
	})
	mux.HandleFunc("GET /api/history/count", func(w http.ResponseWriter, r *http.Request) {
		a, b, m, ok := interval(w, r.URL.Query())
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()
		n, e := svc.Count(ctx, a, b, m)
		if e != nil {
			reply(w, nil, e)
			return
		}
		reply(w, map[string]int{"count": n}, nil)
	})
	mux.HandleFunc("GET /api/detail/{id}", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if !observatory.ValidID(id) {
			w.WriteHeader(400)
			return
		}
		raw, e := svc.Fetch(r.Context(), "https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/"+id+".geojson")
		if e != nil {
			reply(w, nil, e)
			return
		}
		var v map[string]any
		if e = json.Unmarshal(raw, &v); e != nil || v["type"] != "Feature" || v["id"] != id {
			reply(w, nil, fmt.Errorf("invalid USGS detail response"))
			return
		}
		reply(w, v, nil)
	})
	mux.HandleFunc("GET /api/metrics", func(w http.ResponseWriter, r *http.Request) {
		reply(w, map[string]uint64{"requests": requests.Load()}, nil)
	})
	mux.HandleFunc("POST /api/quit", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Origin") != "http://"+r.Host || r.Header.Get("Sec-Fetch-Site") != "same-origin" {
			http.Error(w, "same-origin required", 403)
			return
		}
		reply(w, map[string]string{"status": "stopping"}, nil)
		go func() { time.Sleep(100 * time.Millisecond); stop() }()
	})
	files := http.FileServerFS(static)
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/assets/") {
			// Vite names bundles by content hash, so a changed file is a new
			// URL. Set after the policy checks so a 403 is never cached.
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		files.ServeHTTP(w, r)
	})
	handler := secure(mux, &requests)
	if !strings.HasPrefix(*addr, "127.0.0.1:") && !strings.HasPrefix(*addr, "localhost:") && !strings.HasPrefix(*addr, "[::1]:") {
		panic("only loopback addresses are supported")
	}
	listener, err := net.Listen("tcp", *addr)
	if err != nil {
		fmt.Fprintln(os.Stderr, "Cannot start:", err, "\nAn existing observatory may be running. Open http://"+*addr+" or choose -addr 127.0.0.1:8788")
		os.Exit(1)
	}
	// History requests may legitimately stream for two minutes; the write
	// timeout stays above that so the deadline inside the handler is the one
	// that fires. Investigation bodies are capped at 42 MiB by the handler.
	server := &http.Server{Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 2 * time.Minute, WriteTimeout: 3 * time.Minute, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 64 << 10}
	go func() {
		<-ctx.Done()
		c, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		server.Shutdown(c)
	}()
	u := "http://" + listener.Addr().String()
	slog.Info("Earthquake Observatory ready", "url", u, "data", *data)
	if !*noBrowser {
		var c *exec.Cmd
		switch runtime.GOOS {
		case "darwin":
			c = exec.Command("open", u)
		case "windows":
			c = exec.Command("rundll32", "url.dll,FileProtocolHandler", u)
		default:
			c = exec.Command("xdg-open", u)
		}
		if e := c.Start(); e != nil {
			slog.Warn("Open this URL in a browser", "url", u)
		} else {
			go c.Wait()
		}
	}
	if err = server.Serve(listener); err != nil && err != http.ErrServerClosed {
		panic(err)
	}
}
