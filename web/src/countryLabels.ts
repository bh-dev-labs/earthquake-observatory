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

// Fixed zoom tiers keep the set of candidate names deterministic: a country
// is either in the tier for this zoom or not, regardless of where the globe
// is pointing. Larger countries get a slightly larger face.
export function labelBudget(zoom: number) {
  return Math.round(18 * zoom * zoom);
}

export function labelSize(rank: number) {
  return rank < 12 ? 13 : 11;
}

// Choose which candidates may coexist at a given map scale, in pixels per
// radian. Pairs are tested on the local tangent plane, so the answer does not
// depend on the camera; near the limb foreshortening brings labels closer,
// but there they are already fading out.
export function planLabels(
  countries: CountryLabel[],
  measure: (name: string, size: number) => number,
  scale: number,
  zoom: number,
  gap = 6,
): LabelPlan {
  const plan: LabelPlan = [];
  const budget = labelBudget(zoom);
  const lineHeight = 16;
  countries.slice(0, budget).forEach((label, rank) => {
    const size = labelSize(rank);
    const halfWidth = measure(label.name, size) / 2 + 4;
    const [lon, lat] = label.coordinate;
    const stretch = Math.cos((lat * Math.PI) / 180);
    const conflict = plan.some((other) => {
      const [otherLon, otherLat] = other.label.coordinate;
      let dLon = Math.abs(lon - otherLon);
      if (dLon > 180) dLon = 360 - dLon;
      const dx =
        ((dLon * Math.PI) / 180) *
        scale *
        Math.max(stretch, Math.cos((otherLat * Math.PI) / 180));
      const dy = ((Math.abs(lat - otherLat) * Math.PI) / 180) * scale;
      return dx < halfWidth + other.halfWidth + gap && dy < lineHeight + gap;
    });
    if (!conflict) plan.push({ label, halfWidth, size });
  });
  return plan;
}

// Labels fade over the last 0.2 rad before the limb instead of cutting off
// at one angle, so a rotating globe eases names in rather than popping them.
export function countryLabelOpacity(
  country: CountryLabel,
  centre: [number, number],
  flat: boolean,
) {
  if (flat) return 1;
  const distance = geoDistance(country.coordinate, centre);
  return Math.max(0, Math.min(1, (Math.PI / 2 - 0.05 - distance) / 0.2));
}

export function countryLabelVisible(
  country: CountryLabel,
  centre: [number, number],
  flat: boolean,
) {
  return countryLabelOpacity(country, centre, flat) > 0;
}
