package observatory

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	_ "modernc.org/sqlite"
	"time"
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
type Store struct{ DB *sql.DB }

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	_, err = db.Exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY);
 INSERT OR IGNORE INTO schema_version VALUES(1);
 CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, updated INTEGER NOT NULL, payload BLOB NOT NULL);
 CREATE TABLE IF NOT EXISTS datasets(id TEXT PRIMARY KEY, query TEXT NOT NULL, fetched TEXT NOT NULL, payload BLOB NOT NULL);
 CREATE TABLE IF NOT EXISTS members(dataset TEXT NOT NULL, event TEXT NOT NULL, PRIMARY KEY(dataset,event));
 CREATE INDEX IF NOT EXISTS datasets_query ON datasets(query,fetched);`)
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
	hash := sha256.Sum256(append([]byte(query+"\n"), raw...))
	id := hex.EncodeToString(hash[:])
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
	for _, e := range c.Features {
		b, _ := json.Marshal(e)
		if _, err = events.Exec(e.ID, e.Properties.Updated, b); err != nil {
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
	// Keep the latest 40 cached datasets; exports are the durable user-owned snapshots.
	if _, err = tx.Exec(`DELETE FROM members WHERE dataset IN (SELECT id FROM datasets ORDER BY fetched DESC LIMIT -1 OFFSET 40); DELETE FROM datasets WHERE id NOT IN (SELECT id FROM datasets ORDER BY fetched DESC LIMIT 40); DELETE FROM events WHERE id NOT IN (SELECT event FROM members)`); err != nil {
		return Dataset{}, err
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
