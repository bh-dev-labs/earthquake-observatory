import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { feature } from "topojson-client";
import type { FeatureCollection } from "geojson";
import { countryLabels, countryLabelVisible } from "./countryLabels";
import { parseView } from "./data";

const geography = JSON.parse(
  readFileSync(new URL("../public/data/earth.json", import.meta.url), "utf8"),
);
const labels = countryLabels(
  feature(
    geography,
    geography.objects.countries,
  ) as unknown as FeatureCollection,
);

test("country names come from bundled geography with mainland anchors", () => {
  assert.ok(labels.length > 170);
  for (const name of ["Canada", "Japan", "France"]) {
    assert.ok(labels.some((country) => country.name === name));
  }
  const france = labels.find((country) => country.name === "France")!;
  assert.ok(france.coordinate[0] > -5 && france.coordinate[0] < 10);
  assert.ok(france.coordinate[1] > 40 && france.coordinate[1] < 52);
  assert.ok(
    labels.every((country) => country.coordinate.every(Number.isFinite)),
  );
  assert.ok(
    labels.every(
      (country, index) => index === 0 || labels[index - 1].area >= country.area,
    ),
  );
});

test("country labels hide the far side of the globe but remain available on the flat map", () => {
  const japan = labels.find((country) => country.name === "Japan")!;
  assert.equal(countryLabelVisible(japan, [140, 35], false), true);
  assert.equal(countryLabelVisible(japan, [-40, -35], false), false);
  assert.equal(countryLabelVisible(japan, [-40, -35], true), true);
});

test("country-name state is independent of plates and older shared views default to off", () => {
  const view = parseView({ mode: "demo", countries: true, plates: false });
  assert.equal(view.countries, true);
  assert.equal(view.plates, false);
  assert.equal(parseView(JSON.parse(JSON.stringify(view))).countries, true);
  assert.equal(parseView({ mode: "demo", plates: true }).countries, false);
  assert.equal(parseView({ mode: "demo", countries: "true" }).countries, false);
});
