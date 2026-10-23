package observatory

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"time"

	_ "modernc.org/sqlite"
)

type Dataset struct {
	ID       string          `json:"id"`
	Query    string          `json:"query"`
	Fetched  string          `json:"fetched"`
	Complete bool            `json:"complete"`
	Stale    bool            `json:"stale"`
	Error    string          `json:"error,omitempty"`
	Data     json.RawMessage `json:"data"`
}

// WriteJSON encodes the dataset without re-validating and buffering the
// (already validated) GeoJSON payload, which json.Encoder would do for a
// RawMessage; on an 8 MiB feed that is tens of milliseconds and 20 MB of
// garbage per response.
func (d Dataset) WriteJSON(w io.Writer) error {
	type header struct {
		ID       string `json:"id"`
		Query    string `json:"query"`
		Fetched  string `json:"fetched"`
		Complete bool   `json:"complete"`
		Stale    bool   `json:"stale"`
		Error    string `json:"error,omitempty"`
	}
	head, err := json.Marshal(header{d.ID, d.Query, d.Fetched, d.Complete, d.Stale, d.Error})
	if err != nil {
		return err
	}
	data := d.Data
	if len(data) == 0 {
		data = []byte("null")
	}
	head = append(head[:len(head)-1], `,"data":`...)
	for _, part := range [][]byte{head, data, []byte("}\n")} {
		if _, err = w.Write(part); err != nil {
			return err
		}
	}
	return nil
}

type Store struct{ DB *sql.DB }

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	_, err = db.Exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA cache_size=-65536; PRAGMA temp_store=MEMORY;
 CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY);
 INSERT OR IGNORE INTO schema_version VALUES(1);
 CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, updated INTEGER NOT NULL, payload BLOB NOT NULL);
 CREATE TABLE IF NOT EXISTS datasets(id TEXT PRIMARY KEY, query TEXT NOT NULL, fetched TEXT NOT NULL, payload BLOB NOT NULL);
 CREATE TABLE IF NOT EXISTS members(dataset TEXT NOT NULL, event TEXT NOT NULL, PRIMARY KEY(dataset,event));
 CREATE INDEX IF NOT EXISTS datasets_query ON datasets(query,fetched);
 CREATE INDEX IF NOT EXISTS members_event ON members(event);
 CREATE TABLE IF NOT EXISTS investigations(id TEXT PRIMARY KEY, name TEXT NOT NULL, notes TEXT NOT NULL, created TEXT NOT NULL, view BLOB NOT NULL, snapshot BLOB NOT NULL);
 INSERT OR IGNORE INTO schema_version VALUES(2);`)
	if err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db}, nil
}
func (s *Store) Save(query string, raw []byte) (Dataset, error) {
	c, err := Parse(raw)
	if err != nil {
		return Dataset{}, err
	}
	// Hash without copying the feed; all_month is about 8 MiB.
	hasher := sha256.New()
	hasher.Write([]byte(query))
	hasher.Write([]byte{'\n'})
	hasher.Write(raw)
	id := hex.EncodeToString(hasher.Sum(nil))
	now := time.Now().UTC().Format(time.RFC3339Nano)
	tx, err := s.DB.Begin()
	if err != nil {
		return Dataset{}, err
	}
	defer tx.Rollback()
	// A 20,000-event history would otherwise re-plan the same two statements
	// 40,000 times inside this transaction.
	events, err := tx.Prepare(`INSERT INTO events VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET updated=excluded.updated,payload=excluded.payload WHERE excluded.updated>=events.updated`)
	if err != nil {
		return Dataset{}, err
	}
	defer events.Close()
	members, err := tx.Prepare(`INSERT OR IGNORE INTO members VALUES(?,?)`)
	if err != nil {
		return Dataset{}, err
	}
	defer members.Close()
	if len(c.Raw) != len(c.Features) {
		return Dataset{}, fmt.Errorf("collection raw bytes out of step with features")
	}
	for i, e := range c.Features {
		if _, err = events.Exec(e.ID, e.Properties.Updated, []byte(c.Raw[i])); err != nil {
			return Dataset{}, err
		}
	}
	if _, err = tx.Exec(`INSERT INTO datasets VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET fetched=excluded.fetched`, id, query, now, raw); err != nil {
		return Dataset{}, err
	}
	for _, e := range c.Features {
		if _, err = members.Exec(id, e.ID); err != nil {
			return Dataset{}, err
		}
	}
	// Keep the latest 40 cached datasets; exports are the durable user-owned
	// snapshots. The orphan sweep over events only runs when a dataset was
	// actually evicted, since it touches every member row.
	if _, err = tx.Exec(`DELETE FROM members WHERE dataset IN (SELECT id FROM datasets ORDER BY fetched DESC LIMIT -1 OFFSET 40)`); err != nil {
		return Dataset{}, err
	}
	evicted, err := tx.Exec(`DELETE FROM datasets WHERE id NOT IN (SELECT id FROM datasets ORDER BY fetched DESC LIMIT 40)`)
	if err != nil {
		return Dataset{}, err
	}
	if n, _ := evicted.RowsAffected(); n > 0 {
		if _, err = tx.Exec(`DELETE FROM events WHERE NOT EXISTS (SELECT 1 FROM members WHERE members.event=events.id)`); err != nil {
			return Dataset{}, err
		}
	}
	if err = tx.Commit(); err != nil {
		return Dataset{}, err
	}
	return Dataset{id, query, now, true, false, "", raw}, nil
}
func (s *Store) Latest(query string) (Dataset, error) {
	var d Dataset
	err := s.DB.QueryRow(`SELECT id,query,fetched,payload FROM datasets WHERE query=? ORDER BY fetched DESC LIMIT 1`, query).Scan(&d.ID, &d.Query, &d.Fetched, &d.Data)
	d.Complete = true
	return d, err
}
func (s *Store) Backup(path string) error { _, err := s.DB.Exec(`VACUUM INTO ?`, path); return err }
func (s *Store) Check() error {
	var result string
	if err := s.DB.QueryRow(`PRAGMA integrity_check`).Scan(&result); err != nil {
		return err
	}
	if result != "ok" {
		return fmt.Errorf("integrity: %s", result)
	}
	return nil
}
