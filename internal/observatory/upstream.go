package observatory

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"math/rand/v2"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"
)

type responseCache struct {
	body           []byte
	etag, modified string
	fetched        time.Time
}

type Service struct {
	Store     *Store
	Client    *http.Client
	mu        sync.Mutex
	slots     chan struct{}
	network   chan struct{}
	cacheMu   sync.Mutex
	responses map[string]responseCache
}

func NewService(s *Store) *Service {
	return &Service{Store: s, slots: make(chan struct{}, 1), network: make(chan struct{}, 4), responses: make(map[string]responseCache), Client: &http.Client{Timeout: 30 * time.Second, CheckRedirect: func(r *http.Request, via []*http.Request) error {
		if r.URL.Scheme != "https" || r.URL.Host != "earthquake.usgs.gov" || len(via) > 3 {
			return fmt.Errorf("redirect rejected")
		}
		return nil
	}}}
}
func (s *Service) Fetch(ctx context.Context, u string) ([]byte, error) {
	parsed, err := url.Parse(u)
	if err != nil || parsed.Scheme != "https" || parsed.Host != "earthquake.usgs.gov" {
		return nil, fmt.Errorf("invalid upstream")
	}
	select {
	case s.network <- struct{}{}:
		defer func() { <-s.network }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	s.cacheMu.Lock()
	cached, hasCached := s.responses[u]
	s.cacheMu.Unlock()
	if hasCached && strings.Contains(u, "/detail/") && time.Since(cached.fetched) < 5*time.Minute {
		return cached.body, nil
	}
	var last error
	for attempt := 0; attempt < 3; attempt++ {
		req, err := http.NewRequestWithContext(ctx, "GET", u, nil)
		if err != nil {
			return nil, err
		}
		if hasCached {
			if cached.etag != "" {
				req.Header.Set("If-None-Match", cached.etag)
			}
			if cached.modified != "" {
				req.Header.Set("If-Modified-Since", cached.modified)
			}
		}
		req.Header.Set("User-Agent", "EarthquakeObservatory/0.1 (local educational application)")
		res, err := s.Client.Do(req)
		if err == nil {
			b, readErr := io.ReadAll(io.LimitReader(res.Body, 32<<20+1))
			res.Body.Close()
			if res.StatusCode == 304 && hasCached {
				return cached.body, nil
			}
			if res.StatusCode == 204 {
				return []byte(`{"type":"FeatureCollection","features":[]}`), nil
			}
			if res.StatusCode == 200 {
				if readErr != nil {
					return nil, readErr
				}
				if len(b) > 32<<20 {
					return nil, fmt.Errorf("response exceeds 32 MiB")
				}
				if json.Valid(b) {
					s.cacheMu.Lock()
					if len(s.responses) >= 32 {
						// Evict the least recently fetched entry rather than an
						// arbitrary one, so a busy detail view keeps its cache.
						oldest, found := "", time.Time{}
						for key, entry := range s.responses {
							if found.IsZero() || entry.fetched.Before(found) {
								oldest, found = key, entry.fetched
							}
						}
						delete(s.responses, oldest)
					}
					s.responses[u] = responseCache{b, res.Header.Get("ETag"), res.Header.Get("Last-Modified"), time.Now()}
					s.cacheMu.Unlock()
				}
				return b, nil
			}
			last = fmt.Errorf("USGS returned HTTP %d", res.StatusCode)
			if res.StatusCode != 429 && res.StatusCode < 500 {
				return nil, last
			}
		} else {
			last = err
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(time.Duration(500*(1<<attempt)+rand.IntN(250)) * time.Millisecond):
		}
	}
	return nil, last
}
func (s *Service) Recent(ctx context.Context, period string) (Dataset, error) {
	if period != "hour" && period != "day" && period != "week" && period != "month" {
		return Dataset{}, fmt.Errorf("period must be hour, day, week or month")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	query := "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_" + period + ".geojson"
	old, oldErr := s.Store.Latest(query)
	t, _ := time.Parse(time.RFC3339Nano, old.Fetched)
	if oldErr == nil && time.Since(t) < 60*time.Second {
		return old, nil
	}
	raw, err := s.Fetch(ctx, query)
	if err == nil {
		var d Dataset
		d, err = s.Store.Save(query, raw)
		if err == nil {
			return d, nil
		}
	}
	if oldErr == nil {
		old.Stale = true
		old.Error = err.Error()
		return old, nil
	}
	return Dataset{}, err
}
func (s *Service) History(ctx context.Context, start, end time.Time, min float64) (Dataset, error) {
	select {
	case s.slots <- struct{}{}:
		defer func() { <-s.slots }()
	default:
		return Dataset{}, fmt.Errorf("another historical search is running; try again shortly")
	}
	if !end.After(start) || end.Sub(start) > 31*24*time.Hour || end.After(time.Now().Add(time.Minute)) || min < -2 || min > 10 || math.IsNaN(min) || math.IsInf(min, 0) {
		return Dataset{}, fmt.Errorf("use a past UTC interval of 1 millisecond to 31 days and magnitude -2 to 10")
	}
	query := fmt.Sprintf("USGS catalog [%s,%s) magnitude >= %g", start.Format(time.RFC3339Nano), end.Format(time.RFC3339Nano), min)
	all := map[string]Feature{}
	calls := 0
	var part func(time.Time, time.Time) error
	part = func(a, b time.Time) error {
		calls++
		if calls > 64 {
			return fmt.Errorf("64-request budget exceeded; narrow the interval")
		}
		q := url.Values{"format": {"geojson"}, "starttime": {a.Format("2006-01-02T15:04:05.000Z")}, "endtime": {b.Add(-time.Millisecond).Format("2006-01-02T15:04:05.000Z")}, "minmagnitude": {fmt.Sprint(min)}, "eventtype": {"earthquake"}, "limit": {"20000"}, "orderby": {"time-asc"}}
		raw, err := s.Fetch(ctx, "https://earthquake.usgs.gov/fdsnws/event/1/query?"+q.Encode())
		if err != nil {
			return err
		}
		c, err := Parse(raw)
		if err != nil {
			return err
		}
		if len(c.Features) >= 20000 {
			if b.Sub(a) <= time.Millisecond {
				return fmt.Errorf("dense millisecond; incomplete query rejected")
			}
			mid := a.Add(b.Sub(a) / 2).Truncate(time.Millisecond)
			if !mid.After(a) {
				return fmt.Errorf("partition resolution exceeded")
			}
			if err = part(a, mid); err != nil {
				return err
			}
			return part(mid, b)
		}
		for _, e := range c.Features {
			if e.Properties.Time < a.UnixMilli() || e.Properties.Time >= b.UnixMilli() {
				continue
			}
			old, ok := all[e.ID]
			if !ok || e.Properties.Updated >= old.Properties.Updated {
				all[e.ID] = e
			}
		}
		if len(all) > 50000 {
			return fmt.Errorf("50,000-event budget exceeded; narrow the query")
		}
		return nil
	}
	if err := part(start, end); err != nil {
		return Dataset{}, err
	}
	c := Collection{Type: "FeatureCollection", Features: []Feature{}}
	for _, e := range all {
		c.Features = append(c.Features, e)
	}
	sort.Slice(c.Features, func(i, j int) bool { return c.Features[i].Properties.Time < c.Features[j].Properties.Time })
	raw, _ := json.Marshal(c)
	return s.Store.Save(query, raw)
}
func ValidID(id string) bool {
	if len(id) < 2 || len(id) > 80 {
		return false
	}
	for _, c := range id {
		if !strings.ContainsRune("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-", c) {
			return false
		}
	}
	return true
}
