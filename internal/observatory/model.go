package observatory

import (
	"encoding/json"
	"fmt"
	"math"
)

type Properties struct {
	Mag     *float64 `json:"mag"`
	Place   string   `json:"place"`
	Time    int64    `json:"time"`
	Updated int64    `json:"updated"`
	URL     string   `json:"url"`
	Detail  string   `json:"detail"`
	MagType string   `json:"magType"`
	Status  string   `json:"status"`
	Type    string   `json:"type"`
	Net     string   `json:"net"`
	IDs     string   `json:"ids"`
	Felt    *int     `json:"felt"`
	CDI     *float64 `json:"cdi"`
	MMI     *float64 `json:"mmi"`
	Types   string   `json:"types"`
}
type Feature struct {
	Type       string     `json:"type"`
	ID         string     `json:"id"`
	Properties Properties `json:"properties"`
	Geometry   struct {
		Type        string     `json:"type"`
		Coordinates []*float64 `json:"coordinates"`
	} `json:"geometry"`
}
type Collection struct {
	Type     string    `json:"type"`
	Features []Feature `json:"features"`
}

func Parse(raw []byte) (Collection, error) {
	var c Collection
	if err := json.Unmarshal(raw, &c); err != nil {
		return c, err
	}
	if c.Type != "FeatureCollection" || c.Features == nil {
		return c, fmt.Errorf("expected GeoJSON FeatureCollection")
	}
	for _, f := range c.Features {
		p := f.Geometry.Coordinates
		if f.ID == "" || f.Geometry.Type != "Point" || len(p) != 3 || p[0] == nil || p[1] == nil || math.Abs(*p[0]) > 180 || math.Abs(*p[1]) > 90 || f.Properties.Time <= 0 {
			return c, fmt.Errorf("invalid earthquake %q", f.ID)
		}
	}
	return c, nil
}
