package observatory

import (
	"encoding/json"
	"path/filepath"
	"testing"
)

func TestPinnedInvestigationsSurviveCacheDeletionAndBackup(t *testing.T) {
	directory := t.TempDir()
	store, err := Open(filepath.Join(directory, "db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.DB.Close()
	snapshot, err := store.Save("test", fixture("4", "10", 3))
	if err != nil {
		t.Fatal(err)
	}
	saved, err := store.SaveInvestigation(Investigation{Name: "Study", Notes: "Initial", View: json.RawMessage(`{"mode":"demo"}`), Snapshot: &snapshot})
	if err != nil {
		t.Fatal(err)
	}
	if err = store.EditInvestigation(saved.ID, "Renamed", "Revised note"); err != nil {
		t.Fatal(err)
	}
	if err = store.DeleteCache(""); err != nil {
		t.Fatal(err)
	}
	info, err := store.CacheInfo()
	if err != nil || len(info.Entries) != 0 || info.PinnedBytes == 0 {
		t.Fatalf("cache info: %+v, %v", info, err)
	}
	restored, err := store.Investigation(saved.ID)
	if err != nil || restored.Name != "Renamed" || restored.Notes != "Revised note" || string(restored.Snapshot.Data) != string(snapshot.Data) {
		t.Fatalf("saved snapshot changed: %+v %v", restored, err)
	}
	backup := filepath.Join(directory, "backup")
	if err = store.Backup(backup); err != nil {
		t.Fatal(err)
	}
	copy, err := Open(backup)
	if err != nil {
		t.Fatal(err)
	}
	defer copy.DB.Close()
	if _, err = copy.Investigation(saved.ID); err != nil {
		t.Fatal(err)
	}
	if err = store.DeleteInvestigation(saved.ID); err != nil {
		t.Fatal(err)
	}
	values, err := store.Investigations()
	if err != nil || len(values) != 0 {
		t.Fatalf("delete failed: %v", err)
	}
}

func TestInvalidInvestigationDoesNotPublish(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.DB.Close()
	if _, err = store.SaveInvestigation(Investigation{Name: "bad"}); err == nil {
		t.Fatal("invalid investigation accepted")
	}
	values, err := store.Investigations()
	if err != nil || len(values) != 0 {
		t.Fatal("invalid save published")
	}
}
