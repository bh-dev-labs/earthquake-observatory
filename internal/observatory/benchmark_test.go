package observatory

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"testing"
)

// BenchmarkSaveLarge covers the widest realistic write: a month of history at
// the 20,000-event partition limit. Prepared statements took this from roughly
// 222ms to 137ms per save on an M5.
func BenchmarkSaveLarge(b *testing.B) {
	features := make([]map[string]any, 20000)
	for i := range features {
		features[i] = map[string]any{"type": "Feature", "id": fmt.Sprintf("ev%06d", i),
			"properties": map[string]any{"mag": 4.2, "place": "bench", "time": 1700000000000 + i, "updated": 1700000000000 + i, "type": "earthquake"},
			"geometry":   map[string]any{"type": "Point", "coordinates": []float64{10, 20, 30}}}
	}
	raw, _ := json.Marshal(map[string]any{"type": "FeatureCollection", "features": features})
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
