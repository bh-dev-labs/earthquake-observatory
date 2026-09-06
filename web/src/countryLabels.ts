import { geoArea, geoCentroid, geoDistance } from "d3-geo";
import type { FeatureCollection } from "geojson";

export type CountryLabel = {
  name: string;
  coordinate: [number, number];
  area: number;
};

export function countryLabels(countries: FeatureCollection): CountryLabel[] {
  return countries.features
    .map((country) => {
      const geometry =
        country.geometry.type === "MultiPolygon"
          ? country.geometry.coordinates
              .map((coordinates) => ({ type: "Polygon" as const, coordinates }))
              .sort((first, second) => geoArea(second) - geoArea(first))[0]
          : country.geometry;
      return {
        name: String(country.properties?.name || ""),
        coordinate: geoCentroid(geometry),
        area: geoArea(geometry),
      };
    })
    .filter(
      (country) => country.name && country.coordinate.every(Number.isFinite),
    )
    .sort((first, second) => second.area - first.area);
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
