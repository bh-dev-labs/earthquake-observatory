package observatory

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type Investigation struct {
	ID       string          `json:"id"`
	Name     string          `json:"name"`
	Notes    string          `json:"notes"`
	Created  string          `json:"created"`
	View     json.RawMessage `json:"view,omitempty"`
	Snapshot *Dataset        `json:"snapshot,omitempty"`
	Bytes    int64           `json:"bytes"`
}
type CacheEntry struct {
	ID      string `json:"id"`
	Query   string `json:"query"`
	Fetched string `json:"fetched"`
	Bytes   int64  `json:"bytes"`
	Events  int    `json:"events"`
}
type CacheInfo struct {
	Entries       []CacheEntry `json:"entries"`
	CacheBytes    int64        `json:"cacheBytes"`
	PinnedBytes   int64        `json:"pinnedBytes"`
	DatabaseBytes int64        `json:"databaseBytes"`
}

const (
	maxPinnedInvestigations = 20
	maxPinnedBytes          = 200 << 20
)

func validNotes(name, notes string) bool {
	return strings.TrimSpace(name) != "" && len(name) <= 120 && len(notes) <= 10000
}

func (s *Store) SaveInvestigation(value Investigation) (Investigation, error) {
	if !validNotes(value.Name, value.Notes) || value.Snapshot == nil || len(value.View) > 64<<10 || len(value.Snapshot.Data) > 40<<20 {
		return Investigation{}, fmt.Errorf("invalid investigation or size limit exceeded")
	}
	var view map[string]any
	if err := json.Unmarshal(value.View, &view); err != nil || view == nil {
		return Investigation{}, fmt.Errorf("invalid investigation view")
	}
	collection, err := Parse(value.Snapshot.Data)
	if err != nil {
		return Investigation{}, err
	}
	if len(collection.Features) > 50000 {
		return Investigation{}, fmt.Errorf("snapshot exceeds 50,000 events")
	}
	if _, err := time.Parse(time.RFC3339Nano, value.Snapshot.Fetched); err != nil {
		return Investigation{}, fmt.Errorf("invalid snapshot retrieval time")
	}
	raw, err := json.Marshal(value.Snapshot)
	if err != nil {
		return Investigation{}, err
	}
	value.ID = rand.Text()
	value.Name = strings.TrimSpace(value.Name)
	value.Created = time.Now().UTC().Format(time.RFC3339Nano)
	value.Bytes = int64(len(raw))
	tx, err := s.DB.Begin()
	if err != nil {
		return Investigation{}, err
	}
	defer tx.Rollback()
	var count, bytes int64
	if err = tx.QueryRow("SELECT count(*), coalesce(sum(length(snapshot)), 0) FROM investigations").Scan(&count, &bytes); err != nil {
		return Investigation{}, err
	}
	if count >= maxPinnedInvestigations {
		return Investigation{}, fmt.Errorf("pinned investigation limit reached (%d); delete an existing pin first", maxPinnedInvestigations)
	}
	if bytes+int64(len(raw)) > maxPinnedBytes {
		return Investigation{}, fmt.Errorf("pinned investigation storage limit reached (%d MiB); delete an existing pin first", maxPinnedBytes>>20)
	}
	if _, err = tx.Exec("INSERT INTO investigations VALUES(?,?,?,?,?,?)", value.ID, value.Name, value.Notes, value.Created, []byte(value.View), raw); err != nil {
		return Investigation{}, err
	}
	if err = tx.Commit(); err != nil {
		return Investigation{}, err
	}
	return value, nil
}

func (s *Store) Investigations() ([]Investigation, error) {
	rows, err := s.DB.Query("SELECT id,name,notes,created,length(snapshot) FROM investigations ORDER BY created DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := []Investigation{}
	for rows.Next() {
		var value Investigation
		if err := rows.Scan(&value.ID, &value.Name, &value.Notes, &value.Created, &value.Bytes); err != nil {
			return nil, err
		}
		values = append(values, value)
	}
	return values, rows.Err()
}

func (s *Store) Investigation(id string) (Investigation, error) {
	var value Investigation
	var raw []byte
	err := s.DB.QueryRow("SELECT id,name,notes,created,view,snapshot,length(snapshot) FROM investigations WHERE id=?", id).Scan(&value.ID, &value.Name, &value.Notes, &value.Created, &value.View, &raw, &value.Bytes)
	if err != nil {
		return value, err
	}
	err = json.Unmarshal(raw, &value.Snapshot)
	return value, err
}

func (s *Store) EditInvestigation(id, name, notes string) error {
	if !validNotes(name, notes) {
		return fmt.Errorf("name must be 1-120 bytes; notes at most 10,000 bytes")
	}
	result, err := s.DB.Exec("UPDATE investigations SET name=?,notes=? WHERE id=?", strings.TrimSpace(name), notes, id)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err == nil && count == 0 {
		return sql.ErrNoRows
	}
	return err
}

func (s *Store) DeleteInvestigation(id string) error {
	result, err := s.DB.Exec("DELETE FROM investigations WHERE id=?", id)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err == nil && count == 0 {
		return sql.ErrNoRows
	}
	return err
}

func (s *Store) Cached(id string) (Dataset, error) {
	var value Dataset
	err := s.DB.QueryRow("SELECT id,query,fetched,payload FROM datasets WHERE id=?", id).Scan(&value.ID, &value.Query, &value.Fetched, &value.Data)
	value.Complete = true
	value.Stale = true
	return value, err
}

func (s *Store) CacheInfo() (CacheInfo, error) {
	value := CacheInfo{Entries: []CacheEntry{}}
	rows, err := s.DB.Query("SELECT id,query,fetched,length(payload),(SELECT count(*) FROM members WHERE dataset=datasets.id) FROM datasets ORDER BY fetched DESC")
	if err != nil {
		return value, err
	}
	for rows.Next() {
		var entry CacheEntry
		if err = rows.Scan(&entry.ID, &entry.Query, &entry.Fetched, &entry.Bytes, &entry.Events); err != nil {
			rows.Close()
			return value, err
		}
		value.Entries = append(value.Entries, entry)
		value.CacheBytes += entry.Bytes
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return value, err
	}
	if err = s.DB.QueryRow("SELECT coalesce(sum(length(snapshot)),0) FROM investigations").Scan(&value.PinnedBytes); err != nil {
		return value, err
	}
	var pages, pageSize int64
	if err = s.DB.QueryRow("PRAGMA page_count").Scan(&pages); err != nil {
		return value, err
	}
	if err = s.DB.QueryRow("PRAGMA page_size").Scan(&pageSize); err != nil {
		return value, err
	}
	value.DatabaseBytes = pages * pageSize
	return value, nil
}

func (s *Store) DeleteCache(id string) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if id == "" {
		_, err = tx.Exec("DELETE FROM members; DELETE FROM datasets; DELETE FROM events")
	} else {
		_, err = tx.Exec("DELETE FROM members WHERE dataset=?", id)
		if err == nil {
			_, err = tx.Exec("DELETE FROM datasets WHERE id=?", id)
		}
		if err == nil {
			_, err = tx.Exec("DELETE FROM events WHERE id NOT IN (SELECT event FROM members)")
		}
	}
	if err != nil {
		return err
	}
	return tx.Commit()
}
