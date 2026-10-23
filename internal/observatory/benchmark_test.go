package observatory

import (
	"encoding/json"
	"fmt"
	"io"
	"path/filepath"
	"testing"
)

// BenchmarkSaveLarge covers the widest realistic write: a month of history at
// the 20,000-event partition limit. Prepared statements took this from roughly
// 222ms to 137ms per save on an M5.
func benchRaw(n int) []byte {
	features := make([]map[string]any, n)
	for i := range features {
		features[i] = map[string]any{"type": "Feature", "id": fmt.Sprintf("ev%06d", i),
			"properties": map[string]any{"mag": 4.2, "place": "bench", "time": 1700000000000 + i, "updated": 1700000000000 + i, "type": "earthquake"},
			"geometry":   map[string]any{"type": "Point", "coordinates": []float64{10, 20, 30}}}
	}
	raw, _ := json.Marshal(map[string]any{"type": "FeatureCollection", "features": features})
	return raw
}

func BenchmarkSaveLarge(b *testing.B) {
	raw := benchRaw(20000)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		s, err := Open(filepath.Join(b.TempDir(), "b.db"))
		if err != nil {
			b.Fatal(err)
		}
		if _, err := s.Save(fmt.Sprintf("bench %d", i), raw); err != nil {
			b.Fatal(err)
		}
		s.DB.Close()
	}
}

// BenchmarkSaveSteadyState measures the path real use takes: a database
// already holding the 40-dataset cap, so every save also evicts one dataset
// and sweeps orphaned events.
func BenchmarkSaveSteadyState(b *testing.B) {
	raw := benchRaw(20000)
	s, err := Open(filepath.Join(b.TempDir(), "b.db"))
	if err != nil {
		b.Fatal(err)
	}
	defer s.DB.Close()
	for i := 0; i < 40; i++ {
		if _, err := s.Save(fmt.Sprintf("warm %d", i), raw); err != nil {
			b.Fatal(err)
		}
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := s.Save(fmt.Sprintf("bench %d", i), raw); err != nil {
			b.Fatal(err)
		}
	}
}

// BenchmarkWriteJSON compares streaming a dataset with json.Encoder, which
// re-validates and buffers the RawMessage payload.
func BenchmarkWriteJSON(b *testing.B) {
	d := Dataset{ID: "x", Query: "q", Fetched: "now", Complete: true, Data: benchRaw(20000)}
	b.Run("direct", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			d.WriteJSON(io.Discard)
		}
	})
	b.Run("encoder", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			json.NewEncoder(io.Discard).Encode(d)
		}
	})
}
