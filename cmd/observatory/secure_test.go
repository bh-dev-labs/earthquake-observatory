package main

import (
	"earthquake-observatory/internal/observatory"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

func TestSecureRejectsOtherLocalPortsForAPI(t *testing.T) {
	var counter atomic.Uint64
	handler := secure(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) }), &counter)
	cases := []struct {
		path, host, site string
		want             int
	}{
		{"/api/recent", "127.0.0.1:8787", "same-origin", 200},
		{"/api/recent", "127.0.0.1:8787", "none", 200},
		{"/api/recent", "127.0.0.1:8787", "", 200},
		{"/api/recent", "localhost:8787", "same-site", 403},
		{"/api/recent", "127.0.0.1:8787", "cross-site", 403},
		{"/", "127.0.0.1:8787", "same-site", 200},
		{"/", "127.0.0.1:8787", "cross-site", 403},
		{"/api/recent", "evil.example:8787", "same-origin", 403},
		{"/api/recent", "127.0.0.1", "", 403},
	}
	for _, c := range cases {
		request := httptest.NewRequest("GET", "http://"+c.host+c.path, nil)
		request.Host = c.host
		if c.site != "" {
			request.Header.Set("Sec-Fetch-Site", c.site)
		}
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != c.want {
			t.Errorf("%s host=%s site=%q: got %d want %d", c.path, c.host, c.site, response.Code, c.want)
		}
	}
	if counter.Load() != uint64(len(cases)) {
		t.Fatalf("request counter %d", counter.Load())
	}
}

func TestSecureHeadersAndRejectedAssetsNotCached(t *testing.T) {
	var counter atomic.Uint64
	handler := secure(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}), &counter)
	for _, path := range []string{"/", "/assets/index-abc.js"} {
		request := httptest.NewRequest("GET", "http://127.0.0.1:8787"+path, nil)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		h := response.Header()
		if h.Get("Content-Security-Policy") == "" || h.Get("X-Content-Type-Options") != "nosniff" {
			t.Fatalf("%s missing security headers", path)
		}
	}
	request := httptest.NewRequest("GET", "http://127.0.0.1:8787/assets/index-abc.js", nil)
	request.Header.Set("Sec-Fetch-Site", "cross-site")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != 403 || response.Header().Get("Cache-Control") != "" {
		t.Fatalf("rejected asset must not be cacheable: %d %q", response.Code, response.Header().Get("Cache-Control"))
	}
}

func TestReplyStatusByErrorKind(t *testing.T) {
	cases := map[error]int{
		nil: 200,
		fmt.Errorf("%w: bad period", observatory.ErrInvalid): 400,
		fmt.Errorf("USGS returned HTTP 503"):                 502,
	}
	for err, want := range cases {
		response := httptest.NewRecorder()
		reply(response, map[string]string{"ok": "yes"}, err)
		if response.Code != want || response.Header().Get("Cache-Control") != "no-store" {
			t.Errorf("%v: got %d want %d", err, response.Code, want)
		}
	}
}
