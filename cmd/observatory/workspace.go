package main

import (
	"database/sql"
	"earthquake-observatory/internal/observatory"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
)

func workspaceReply(writer http.ResponseWriter, value any, err error) {
	writer.Header().Set("Content-Type", "application/json")
	writer.Header().Set("Cache-Control", "no-store")
	if err != nil {
		code := http.StatusInternalServerError
		if errors.Is(err, sql.ErrNoRows) {
			code = http.StatusNotFound
		}
		writer.WriteHeader(code)
		json.NewEncoder(writer).Encode(map[string]string{"error": err.Error()})
		return
	}
	json.NewEncoder(writer).Encode(value)
}

func workspaceBody(writer http.ResponseWriter, request *http.Request, value any) bool {
	if !strings.HasPrefix(request.Header.Get("Content-Type"), "application/json") {
		http.Error(writer, `{"error":"JSON required"}`, http.StatusUnsupportedMediaType)
		return false
	}
	decoder := json.NewDecoder(http.MaxBytesReader(writer, request.Body, 42<<20))
	if err := decoder.Decode(value); err != nil {
		http.Error(writer, `{"error":"Invalid JSON or request exceeds 42 MiB"}`, http.StatusBadRequest)
		return false
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		http.Error(writer, `{"error":"Expected one JSON value"}`, http.StatusBadRequest)
		return false
	}
	return true
}

func registerWorkspaceRoutes(mux *http.ServeMux, service *observatory.Service, store *observatory.Store) {
	handle := func(pattern string, handler http.HandlerFunc) {
		mux.HandleFunc(pattern, func(writer http.ResponseWriter, request *http.Request) {
			writer.Header().Set("Content-Type", "application/json")
			writer.Header().Set("Cache-Control", "no-store")
			if request.Method != "GET" && (request.Header.Get("Origin") != "http://"+request.Host || request.Header.Get("Sec-Fetch-Site") != "same-origin") {
				http.Error(writer, `{"error":"Same-origin request required"}`, http.StatusForbidden)
				return
			}
			handler(writer, request)
		})
	}
	handle("GET /api/investigations", func(writer http.ResponseWriter, request *http.Request) {
		values, err := store.Investigations()
		workspaceReply(writer, values, err)
	})
	handle("POST /api/investigations", func(writer http.ResponseWriter, request *http.Request) {
		var value observatory.Investigation
		if !workspaceBody(writer, request, &value) {
			return
		}
		result, err := store.SaveInvestigation(value)
		if err != nil {
			writer.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(writer).Encode(map[string]string{"error": err.Error()})
			return
		}
		workspaceReply(writer, result, nil)
	})
	handle("GET /api/investigations/{id}", func(writer http.ResponseWriter, request *http.Request) {
		value, err := store.Investigation(request.PathValue("id"))
		workspaceReply(writer, value, err)
	})
	handle("PATCH /api/investigations/{id}", func(writer http.ResponseWriter, request *http.Request) {
		var value struct {
			Name  string `json:"name"`
			Notes string `json:"notes"`
		}
		if !workspaceBody(writer, request, &value) {
			return
		}
		err := store.EditInvestigation(request.PathValue("id"), value.Name, value.Notes)
		workspaceReply(writer, map[string]bool{"saved": err == nil}, err)
	})
	handle("DELETE /api/investigations/{id}", func(writer http.ResponseWriter, request *http.Request) {
		err := store.DeleteInvestigation(request.PathValue("id"))
		workspaceReply(writer, map[string]bool{"deleted": err == nil}, err)
	})
	handle("GET /api/cache", func(writer http.ResponseWriter, request *http.Request) {
		value, err := store.CacheInfo()
		workspaceReply(writer, value, err)
	})
	handle("GET /api/cache/{id}", func(writer http.ResponseWriter, request *http.Request) {
		value, err := store.Cached(request.PathValue("id"))
		workspaceReply(writer, value, err)
	})
	clear := func(writer http.ResponseWriter, request *http.Request) {
		err := store.DeleteCache(request.PathValue("id"))
		if err == nil {
			service.ClearResponseCache()
		}
		workspaceReply(writer, map[string]bool{"deleted": err == nil}, err)
	}
	handle("DELETE /api/cache", clear)
	handle("DELETE /api/cache/{id}", clear)
	handle("GET /api/history/jobs/{id}", func(writer http.ResponseWriter, request *http.Request) {
		value, found := service.HistoryProgress(request.PathValue("id"))
		if !found {
			workspaceReply(writer, nil, sql.ErrNoRows)
			return
		}
		workspaceReply(writer, value, nil)
	})
	handle("DELETE /api/history/jobs/{id}", func(writer http.ResponseWriter, request *http.Request) {
		found := service.CancelHistory(request.PathValue("id"))
		if !found {
			workspaceReply(writer, nil, sql.ErrNoRows)
			return
		}
		workspaceReply(writer, map[string]bool{"cancellationRequested": true}, nil)
	})
}
