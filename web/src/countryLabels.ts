import { geoArea, geoCentroid, geoContains, geoDistance } from "d3-geo";
import type { FeatureCollection, Polygon, Position } from "geojson";

export type CountryLabel = {
  name: string;
  coordinate: [number, number];
  area: number;
};

// Which names appear is decided here, once per zoom and canvas size, in
// geographic terms. The frame loop only projects that fixed set, so turning
// the globe never adds or removes a name except by fading at the limb.
export type LabelPlan = {
  label: CountryLabel;
  halfWidth: number;
  size: number;
  opacity: number;
}[];

const short: Record<string, string> = {
  "United States of America": "United States",
  "Dem. Rep. Congo": "DR Congo",
  "Central African Rep.": "Central African Republic",
  "Bosnia and Herz.": "Bosnia and Herzegovina",
  "Dominican Rep.": "Dominican Republic",
  "Fr. S. Antarctic Lands": "French Southern Lands",
  "Falkland Is.": "Falkland Islands",
};

// The centroid of a bent or fragmented shape can fall outside it (Chile,
// Norway, Indonesia). When it does, take the interior grid point farthest
// from the outline instead, a cheap stand-in for a pole of inaccessibility.
function anchor(polygon: Polygon): [number, number] {
  const centroid = geoCentroid(polygon);
  if (geoContains(polygon, centroid)) return centroid;
  const ring = polygon.coordinates[0];
  let west = Infinity,
    east = -Infinity,
    south = Infinity,
    north = -Infinity;
  for (const [x, y] of ring) {
    west = Math.min(west, x);
    east = Math.max(east, x);
    south = Math.min(south, y);
    north = Math.max(north, y);
  }
  const clearance = ([x, y]: Position) => {
    const stretch = Math.cos((y * Math.PI) / 180);
    let nearest = Infinity;
    for (const [vx, vy] of ring) {
      const dx = (vx - x) * stretch,
        dy = vy - y;
      nearest = Math.min(nearest, dx * dx + dy * dy);
    }
    return nearest;
  };
  let best = centroid,
    bestClearance = -1;
  const steps = 16;
  for (let i = 1; i < steps; i++)
    for (let j = 1; j < steps; j++) {
      const point: [number, number] = [
        west + ((east - west) * i) / steps,
        south + ((north - south) * j) / steps,
      ];
      if (!geoContains(polygon, point)) continue;
      const value = clearance(point);
      if (value > bestClearance) {
        bestClearance = value;
        best = point;
      }
    }
  return best;
}

export function countryLabels(countries: FeatureCollection): CountryLabel[] {
  return countries.features
    .map((country) => {
      const geometry =
        country.geometry.type === "MultiPolygon"
          ? country.geometry.coordinates
              .map((coordinates) => ({ type: "Polygon" as const, coordinates }))
              .sort((first, second) => geoArea(second) - geoArea(first))[0]
          : (country.geometry as Polygon);
      const name = String(country.properties?.name || "");
      return {
        name: short[name] || name,
        coordinate: anchor(geometry),
        area: geoArea(geometry),
      };
    })
    .filter(
      (country) => country.name && country.coordinate.every(Number.isFinite),
    )
    .sort((first, second) => second.area - first.area);
}

export function labelSize(rank: number) {
  return rank < 12 ? 13 : 11;
}

function smoothstep(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

// Give every country a permanent geographic anchor and an admission scale.
// All higher-priority anchors reserve space, even while hidden. This makes
// zoom visibility monotone: a newly admitted name never evicts an old one.
// Camera movement does not participate in admission or move labels aside.
export function planLabels(
  countries: CountryLabel[],
  measure: (name: string, size: number) => number,
  scale: number,
  _zoom: number,
  gap = 6,
): LabelPlan {
  const plan: LabelPlan = [];
  countries.forEach((label, rank) => {
    const size = labelSize(rank);
    const halfWidth = measure(label.name, size) / 2 + 4;
    const [lon, lat] = label.coordinate;
    let admissionScale = 0;
    for (const other of plan) {
      const [otherLon, otherLat] = other.label.coordinate;
      const delta = Math.abs(lon - otherLon);
      const dx =
        ((Math.min(delta, 360 - delta) * Math.PI) / 180) *
        Math.max(
          Math.cos((lat * Math.PI) / 180),
          Math.cos((otherLat * Math.PI) / 180),
        );
      const dy = (Math.abs(lat - otherLat) * Math.PI) / 180;
      admissionScale = Math.max(
        admissionScale,
        Math.min(
          dx > 1e-9 ? (halfWidth + other.halfWidth + gap) / dx : Infinity,
          dy > 1e-9 ? (16 + gap) / dy : Infinity,
        ),
      );
    }
    plan.push({
      label,
      halfWidth,
      size,
      opacity: smoothstep((scale - admissionScale) / 45),
    });
  });
  return plan;
}

// Labels fade across a broad band before the limb instead of cutting off
// at one angle, so a rotating globe eases names in rather than popping them.
export function countryLabelOpacity(
  country: CountryLabel,
  centre: [number, number],
  flat: boolean,
) {
  if (flat) return 1;
  const distance = geoDistance(country.coordinate, centre);
  return smoothstep((Math.PI / 2 - 0.12 - distance) / 0.3);
}

export function countryLabelVisible(
  country: CountryLabel,
  centre: [number, number],
  flat: boolean,
) {
  return countryLabelOpacity(country, centre, flat) > 0;
}
