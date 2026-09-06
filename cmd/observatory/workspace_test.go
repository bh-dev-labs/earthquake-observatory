package main

import (
	"bytes"
	"earthquake-observatory/internal/observatory"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestWorkspaceMutationProtectionAndRoundTrip(t *testing.T) {
	store, err := observatory.Open(filepath.Join(t.TempDir(), "db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.DB.Close()
	mux := http.NewServeMux()
	registerWorkspaceRoutes(mux, observatory.NewService(store), store)
	request := func(method, path string, body []byte, sameOrigin bool) *httptest.ResponseRecorder {
		request := httptest.NewRequest(method, "http://127.0.0.1:8787"+path, bytes.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		if sameOrigin {
			request.Header.Set("Origin", "http://127.0.0.1:8787")
			request.Header.Set("Sec-Fetch-Site", "same-origin")
		}
		response := httptest.NewRecorder()
		mux.ServeHTTP(response, request)
		return response
	}
	for _, path := range []string{"/api/cache", "/api/investigations/test", "/api/history/jobs/test"} {
		if response := request("DELETE", path, nil, false); response.Code != 403 {
			t.Fatalf("unprotected mutation %s: %d", path, response.Code)
		}
	}
	snapshot, err := store.Save("empty", []byte(`{"type":"FeatureCollection","features":[]}`))
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(observatory.Investigation{Name: "Pinned", View: json.RawMessage(`{"mode":"demo"}`), Snapshot: &snapshot})
	response := request("POST", "/api/investigations", raw, true)
	if response.Code != 200 {
		t.Fatal(response.Body.String())
	}
	var saved observatory.Investigation
	json.Unmarshal(response.Body.Bytes(), &saved)
	if response = request("DELETE", "/api/cache", nil, true); response.Code != 200 {
		t.Fatal(response.Body.String())
	}
	if response = request("GET", "/api/investigations/"+saved.ID, nil, false); response.Code != 200 {
		t.Fatal(response.Body.String())
	}
	if response = request("POST", "/api/investigations", []byte(`{} {}`), true); response.Code != 400 {
		t.Fatal("trailing JSON accepted")
	}
	if response = request("GET", "/api/investigations/missing", nil, false); response.Code != 404 {
		t.Fatal("missing snapshot not 404")
	}
}
