package observatory

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func fixture(mag, depth string, updated int) []byte {
	return []byte(fmt.Sprintf(`{"type":"FeatureCollection","features":[{"type":"Feature","id":"us-test","properties":{"mag":%s,"place":"test","time":1000,"updated":%d,"type":"earthquake"},"geometry":{"type":"Point","coordinates":[179,-22,%s]}}]}`, mag, updated, depth))
}
func TestParse(t *testing.T) {
	for _, pair := range [][2]string{{"null", "null"}, {"-1.2", "-3"}, {"4", "100"}} {
		c, e := Parse(fixture(pair[0], pair[1], 2))
		if e != nil || len(c.Features) != 1 {
			t.Fatal(e)
		}
	}
	for _, raw := range []string{`{}`, `{"type":"FeatureCollection","features":null}`, strings.ReplaceAll(string(fixture("1", "1", 1)), "179", "200")} {
		if _, e := Parse([]byte(raw)); e == nil {
			t.Fatal("accepted invalid input")
		}
	}
}
func TestStoreRevisionMembershipBackup(t *testing.T) {
	dir := t.TempDir()
	s, e := Open(filepath.Join(dir, "db"))
	if e != nil {
		t.Fatal(e)
	}
	defer s.DB.Close()
	d, e := s.Save("one", fixture("5", "10", 10))
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.Save("two", fixture("2", "10", 2)); e != nil {
		t.Fatal(e)
	}
	var raw []byte
	s.DB.QueryRow("SELECT payload FROM events WHERE id='us-test'").Scan(&raw)
	var f Feature
	json.Unmarshal(raw, &f)
	if *f.Properties.Mag != 5 {
		t.Fatal("old revision replaced newer")
	}
	old, _ := s.Latest("one")
	if old.ID != d.ID {
		t.Fatal("snapshot changed")
	}
	if _, e = s.Save("broken", []byte(`{}`)); e == nil {
		t.Fatal("invalid save")
	}
	if _, e = s.Latest("broken"); e == nil {
		t.Fatal("partial publish")
	}
	if e = s.Backup(filepath.Join(dir, "backup")); e != nil {
		t.Fatal(e)
	}
	b, e := Open(filepath.Join(dir, "backup"))
	if e != nil {
		t.Fatal(e)
	}
	defer b.DB.Close()
	if e = b.Check(); e != nil {
		t.Fatal(e)
	}
	if _, e = b.Latest("one"); e != nil {
		t.Fatal(e)
	}
}

type transport func(*http.Request) (*http.Response, error)

func (f transport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

// History asks the catalog for an estimate before partitioning. Answer that
// request here so the transports below keep their per-call arithmetic.
func countAware(n int, inner transport) transport {
	return func(r *http.Request) (*http.Response, error) {
		if strings.Contains(r.URL.Path, "/count") {
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(fmt.Sprintf(`{"count":%d,"maxAllowed":20000}`, n))), Header: make(http.Header)}, nil
		}
		return inner(r)
	}
}
func TestStaleRecoveryAndValidation(t *testing.T) {
	s, _ := Open(filepath.Join(t.TempDir(), "db"))
	defer s.DB.Close()
	svc := NewService(s)
	n := 0
	svc.Client.Transport = transport(func(r *http.Request) (*http.Response, error) {
		n++
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(string(fixture("1", "2", 3)))), Header: make(http.Header)}, nil
	})
	d, e := svc.Recent(context.Background(), "day", "")
	if e != nil {
		t.Fatal(e)
	}
	svc.Recent(context.Background(), "day", "")
	if n != 1 {
		t.Fatal("cache not shared")
	}
	s.DB.Exec("UPDATE datasets SET fetched=?", time.Now().Add(-time.Hour).UTC().Format(time.RFC3339Nano))
	svc.Client.Transport = transport(func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 400, Body: io.NopCloser(strings.NewReader("bad")), Header: make(http.Header)}, nil
	})
	stale, e := svc.Recent(context.Background(), "day", "")
	if e != nil || !stale.Stale || stale.ID != d.ID {
		t.Fatal("stale data not preserved")
	}
	if _, e = svc.Fetch(context.Background(), "http://localhost/secret"); e == nil {
		t.Fatal("proxy accepted")
	}
	if _, e = svc.Recent(context.Background(), "evil", ""); e == nil {
		t.Fatal("invalid period")
	}
	if _, e = svc.Recent(context.Background(), "day", "../../secret"); e == nil {
		t.Fatal("invalid level")
	}
}
func TestThresholdFeedAndCount(t *testing.T) {
	s, _ := Open(filepath.Join(t.TempDir(), "db"))
	defer s.DB.Close()
	svc := NewService(s)
	seen := ""
	svc.Client.Transport = transport(func(r *http.Request) (*http.Response, error) {
		seen = r.URL.String()
		body := string(fixture("1", "2", 3))
		if strings.Contains(r.URL.Path, "/count") {
			body = `{"count":1234,"maxAllowed":20000}`
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})
	if _, e := svc.Recent(context.Background(), "month", "4.5"); e != nil {
		t.Fatal(e)
	}
	if seen != "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson" {
		t.Fatal("wrong threshold feed:", seen)
	}
	end := time.Now().UTC().Truncate(time.Millisecond)
	n, e := svc.Count(context.Background(), end.Add(-24*time.Hour), end, 4)
	if e != nil || n != 1234 {
		t.Fatal("count not reported:", n, e)
	}
	if !strings.Contains(seen, "/fdsnws/event/1/count?") || !strings.Contains(seen, "minmagnitude=4") {
		t.Fatal("wrong count query:", seen)
	}
	if _, e = svc.Count(context.Background(), end, end.Add(24*time.Hour), 4); e == nil {
		t.Fatal("future interval accepted")
	}
}
func TestHistoryEstimateGuard(t *testing.T) {
	s, _ := Open(filepath.Join(t.TempDir(), "db"))
	defer s.DB.Close()
	svc := NewService(s)
	queries := 0
	feed := func(r *http.Request) (*http.Response, error) {
		queries++
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(string(fixture("1", "2", 3)))), Header: make(http.Header)}, nil
	}
	svc.Client.Transport = countAware(historyBudget+1, feed)
	_, e := svc.History(context.Background(), time.UnixMilli(1000), time.UnixMilli(5000), 0)
	if e == nil || !strings.Contains(e.Error(), "exceed") || queries != 0 {
		t.Fatalf("oversize estimate not refused before partitioning: %v, %d queries", e, queries)
	}
	svc.Client.Transport = countAware(historyBudget, feed)
	if _, e = svc.History(context.Background(), time.UnixMilli(1000), time.UnixMilli(5000), 0); e != nil || queries != 1 {
		t.Fatalf("estimate at the budget refused: %v", e)
	}
	// A count the catalog cannot answer must not block the retrieval.
	svc.Client.Transport = transport(func(r *http.Request) (*http.Response, error) {
		if strings.Contains(r.URL.Path, "/count") {
			return &http.Response{StatusCode: 503, Body: io.NopCloser(strings.NewReader("busy")), Header: make(http.Header)}, nil
		}
		return feed(r)
	})
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	if _, e = svc.History(ctx, time.UnixMilli(1000), time.UnixMilli(5000), 0); e != nil || queries != 2 {
		t.Fatalf("failed estimate blocked retrieval: %v", e)
	}
}
func TestHistoricalCancellationBudgetAndAtomicity(t *testing.T) {
	s, _ := Open(filepath.Join(t.TempDir(), "db"))
	defer s.DB.Close()
	svc := NewService(s)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, e := svc.History(ctx, time.Now().Add(-time.Hour), time.Now(), 0); e == nil {
		t.Fatal("cancel ignored")
	}
	if _, e := svc.History(context.Background(), time.Now().Add(-32*24*time.Hour), time.Now(), 0); e == nil {
		t.Fatal("range accepted")
	}
}
func TestDensePartitions(t *testing.T) {
	s, _ := Open(filepath.Join(t.TempDir(), "db"))
	defer s.DB.Close()
	svc := NewService(s)
	calls := 0
	a := time.UnixMilli(1000).UTC()
	b := time.UnixMilli(5000).UTC()
	svc.Client.Transport = countAware(1, func(r *http.Request) (*http.Response, error) {
		calls++
		c, _ := Parse(fixture("1", "2", 3))
		if calls == 1 {
			e := c.Features[0]
			c.Features = make([]Feature, 20000)
			for i := range c.Features {
				c.Features[i] = e
			}
		}
		raw, _ := json.Marshal(c)
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(string(raw))), Header: make(http.Header)}, nil
	})
	d, e := svc.History(context.Background(), a, b, 0)
	if e != nil {
		t.Fatal(e)
	}
	c, _ := Parse(d.Data)
	if calls != 3 || len(c.Features) != 1 {
		t.Fatalf("partition/dedup: %d calls, %d events", calls, len(c.Features))
	}
}

func TestConditionalAndDetailCache(t *testing.T) {
	s, _ := Open(filepath.Join(t.TempDir(), "db"))
	defer s.DB.Close()
	svc := NewService(s)
	calls := 0
	svc.Client.Transport = transport(func(r *http.Request) (*http.Response, error) {
		calls++
		if calls > 1 {
			if r.Header.Get("If-None-Match") != "revision" {
				t.Error("missing conditional header")
			}
			return &http.Response{StatusCode: 304, Body: io.NopCloser(strings.NewReader("")), Header: make(http.Header)}, nil
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(string(fixture("1", "2", 3)))), Header: http.Header{"Etag": []string{"revision"}}}, nil
	})
	u := "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson"
	a, e := svc.Fetch(context.Background(), u)
	if e != nil {
		t.Fatal(e)
	}
	b, e := svc.Fetch(context.Background(), u)
	if e != nil || string(a) != string(b) || calls != 2 {
		t.Fatal("conditional request failed", e)
	}
}
func TestRefreshUnchangedUpdatesFetchTime(t *testing.T) {
	s, _ := Open(filepath.Join(t.TempDir(), "db"))
	defer s.DB.Close()
	d, _ := s.Save("q", fixture("1", "2", 3))
	s.DB.Exec("UPDATE datasets SET fetched='2000-01-01T00:00:00Z'")
	s.Save("q", fixture("1", "2", 3))
	next, _ := s.Latest("q")
	if next.ID != d.ID || strings.HasPrefix(next.Fetched, "2000") {
		t.Fatal("unchanged response freshness incorrect")
	}
}
func TestRetriesAndCancellation(t *testing.T) {
	s, _ := Open(filepath.Join(t.TempDir(), "db"))
	defer s.DB.Close()
	svc := NewService(s)
	calls := 0
	svc.Client.Transport = transport(func(r *http.Request) (*http.Response, error) {
		calls++
		status := 429
		body := "throttled"
		if calls == 2 {
			status = 200
			body = string(fixture("1", "2", 3))
		}
		return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})
	if _, e := svc.Fetch(context.Background(), "https://earthquake.usgs.gov/test"); e != nil || calls != 2 {
		t.Fatal("retry failed", e)
	}
}
func TestRawSnapshotPreservesOptionalUnknownFields(t *testing.T) {
	s, _ := Open(filepath.Join(t.TempDir(), "db"))
	defer s.DB.Close()
	raw := strings.ReplaceAll(string(fixture("null", "-2", 3)), `"place":"test"`, `"place":"test","newOptionalField":{"future":true}`)
	d, e := s.Save("raw", []byte(raw))
	if e != nil {
		t.Fatal(e)
	}
	if string(d.Data) != raw {
		t.Fatal("raw audit payload lost")
	}
}

func TestMidPartitionFailureNeverPublishes(t *testing.T) {
	s, _ := Open(filepath.Join(t.TempDir(), "db"))
	defer s.DB.Close()
	svc := NewService(s)
	calls := 0
	svc.Client.Transport = countAware(1, func(r *http.Request) (*http.Response, error) {
		calls++
		c, _ := Parse(fixture("1", "2", 3))
		status := 200
		if calls == 1 {
			f := c.Features[0]
			c.Features = make([]Feature, 20000)
			for i := range c.Features {
				c.Features[i] = f
			}
		}
		if calls == 3 {
			status = 400
		}
		raw, _ := json.Marshal(c)
		return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(string(raw))), Header: make(http.Header)}, nil
	})
	if _, e := svc.History(context.Background(), time.UnixMilli(1000), time.UnixMilli(5000), 0); e == nil {
		t.Fatal("failed partition published")
	}
	var count int
	s.DB.QueryRow("SELECT count(*) FROM datasets").Scan(&count)
	if count != 0 {
		t.Fatal("partial dataset stored")
	}
}
func TestMissingFeedMemberIsNotDeletion(t *testing.T) {
	s, _ := Open(filepath.Join(t.TempDir(), "db"))
	defer s.DB.Close()
	s.Save("old", fixture("1", "2", 3))
	s.Save("new", []byte(`{"type":"FeatureCollection","features":[]}`))
	var count int
	s.DB.QueryRow("SELECT count(*) FROM events WHERE id='us-test'").Scan(&count)
	if count != 1 {
		t.Fatal("rolling absence deleted event")
	}
}
func TestInvalidID(t *testing.T) {
	for _, id := range []string{"../secret", "https://evil.com", "a?b", "", "a"} {
		if ValidID(id) {
			t.Fatal("invalid ID accepted", id)
		}
	}
	if !ValidID("us7000abcd") {
		t.Fatal("valid ID rejected")
	}
}

func TestHistoryTimestampTiesKeepSnapshotIdentity(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.DB.Close()
	collection, err := Parse(fixture("1", "2", 3))
	if err != nil {
		t.Fatal(err)
	}
	base := collection.Features[0]
	collection.Features = nil
	for i := 31; i >= 0; i-- {
		event := base
		event.ID = fmt.Sprintf("us-%02d", i)
		collection.Features = append(collection.Features, event)
	}
	raw, err := json.Marshal(collection)
	if err != nil {
		t.Fatal(err)
	}
	service := NewService(store)
	service.Client.Transport = transport(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(string(raw))), Header: make(http.Header)}, nil
	})
	var previous string
	for attempt := 0; attempt < 3; attempt++ {
		result, err := service.History(context.Background(), time.UnixMilli(1000), time.UnixMilli(5000), 0)
		if err != nil {
			t.Fatal(err)
		}
		parsed, err := Parse(result.Data)
		if err != nil {
			t.Fatal(err)
		}
		for i, event := range parsed.Features {
			if event.ID != fmt.Sprintf("us-%02d", i) {
				t.Fatalf("timestamp ties are not canonical: %s at %d", event.ID, i)
			}
		}
		if previous != "" && previous != result.ID {
			t.Fatal("unchanged history changed snapshot ID")
		}
		previous = result.ID
	}
}

func TestHistoryOffsetsAndProgress(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.DB.Close()
	service := NewService(store)
	service.Client.Transport = countAware(1, func(request *http.Request) (*http.Response, error) {
		query := request.URL.Query()
		if query.Get("starttime") != "1970-01-01T00:00:01.000Z" || query.Get("endtime") != "1970-01-01T00:00:04.999Z" {
			t.Errorf("wrong UTC interval: %v", query)
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(string(fixture("1", "2", 3)))), Header: make(http.Header)}, nil
	})
	zone := time.FixedZone("offset", 5*3600)
	result, err := service.HistoryTracked(context.Background(), time.UnixMilli(1000).In(zone), time.UnixMilli(5000).In(zone), 0, "utc-test")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(result.Query, "1970-01-01T00:00:01Z") {
		t.Fatal(result.Query)
	}
	progress, exists := service.HistoryProgress("utc-test")
	if !exists || progress.State != "complete" || progress.Requests != 2 || progress.Partitions != 1 || progress.Events != 1 || progress.Expected != 1 {
		t.Fatalf("bad progress: %+v", progress)
	}
	if _, err = service.History(context.Background(), time.UnixMilli(1000).Add(time.Nanosecond), time.UnixMilli(5000), 0); err == nil {
		t.Fatal("submillisecond boundary accepted")
	}
}

func TestTrackedHistoryCancellation(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.DB.Close()
	service := NewService(store)
	started := make(chan struct{})
	service.Client.Transport = countAware(1, func(request *http.Request) (*http.Response, error) {
		close(started)
		<-request.Context().Done()
		return nil, request.Context().Err()
	})
	done := make(chan error, 1)
	go func() {
		_, err := service.HistoryTracked(context.Background(), time.UnixMilli(1000), time.UnixMilli(5000), 0, "cancel-test")
		done <- err
	}()
	<-started
	if !service.CancelHistory("cancel-test") {
		t.Fatal("cancel missing")
	}
	if err := <-done; err == nil {
		t.Fatal("cancel succeeded unexpectedly")
	}
	progress, _ := service.HistoryProgress("cancel-test")
	if progress.State != "cancelled" {
		t.Fatalf("bad state: %+v", progress)
	}
	var count int
	store.DB.QueryRow("SELECT count(*) FROM datasets").Scan(&count)
	if count != 0 {
		t.Fatal("cancelled data published")
	}
}
