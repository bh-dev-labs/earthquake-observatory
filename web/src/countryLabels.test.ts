import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { feature } from "topojson-client";
import type { FeatureCollection } from "geojson";
import {
  countryLabels,
  countryLabelOpacity,
  countryLabelVisible,
  labelBudget,
  planLabels,
} from "./countryLabels";
import { geoContains } from "d3-geo";
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

test("anchors sit inside their country and long names are shortened", () => {
  const collection = feature(
    geography,
    geography.objects.countries,
  ) as unknown as FeatureCollection;
  for (const name of ["Chile", "Norway", "Indonesia", "Vietnam", "Japan"]) {
    const country = collection.features.find(
      (f) => f.properties?.name === name,
    )!;
    const label = labels.find((l) => l.name === name)!;
    assert.ok(
      geoContains(country as never, label.coordinate),
      `${name} anchor is outside the country`,
    );
  }
  assert.ok(labels.some((l) => l.name === "United States"));
  assert.ok(!labels.some((l) => l.name === "United States of America"));
});

test("a label plan depends on zoom and scale, never on the camera", () => {
  const measure = (name: string, size: number) => name.length * size * 0.55;
  const near = planLabels(labels, measure, 380, 1);
  const far = planLabels(labels, measure, 250, 0.65);
  const close = planLabels(labels, measure, 950, 2.5);
  assert.ok(far.length < near.length && near.length < close.length);
  assert.ok(near.length <= labelBudget(1));
  assert.deepEqual(
    planLabels(labels, measure, 380, 1).map((entry) => entry.label.name),
    near.map((entry) => entry.label.name),
  );
  // Nothing in a plan overlaps on the tangent plane at that scale.
  for (const a of near)
    for (const b of near) {
      if (a === b) continue;
      const [alon, alat] = a.label.coordinate,
        [blon, blat] = b.label.coordinate;
      let dLon = Math.abs(alon - blon);
      if (dLon > 180) dLon = 360 - dLon;
      const dx =
        ((dLon * Math.PI) / 180) *
        380 *
        Math.max(
          Math.cos((alat * Math.PI) / 180),
          Math.cos((blat * Math.PI) / 180),
        );
      const dy = ((Math.abs(alat - blat) * Math.PI) / 180) * 380;
      assert.ok(
        dx >= a.halfWidth + b.halfWidth + 6 || dy >= 22,
        `${a.label.name} overlaps ${b.label.name}`,
      );
    }
  // Big names lead: the largest countries are always in the smallest plan.
  for (const name of ["Russia", "Canada", "China", "Brazil", "Australia"])
    assert.ok(
      far.some((entry) => entry.label.name === name),
      name,
    );
});

test("country labels hide the far side of the globe but remain available on the flat map", () => {
  const japan = labels.find((country) => country.name === "Japan")!;
  assert.equal(countryLabelVisible(japan, [140, 35], false), true);
  assert.equal(countryLabelVisible(japan, [-40, -35], false), false);
  assert.equal(countryLabelVisible(japan, [-40, -35], true), true);
});

test("country labels ease in over the limb rather than popping", () => {
  const japan = labels.find((country) => country.name === "Japan")!;
  assert.equal(countryLabelOpacity(japan, [140, 35], false), 1);
  assert.equal(countryLabelOpacity(japan, [-40, -35], false), 0);
  assert.equal(countryLabelOpacity(japan, [-40, -35], true), 1);
  // Sweep the camera away from Japan: opacity is monotone, never a step.
  let last = 1;
  for (let lon = 140; lon >= -40; lon -= 1) {
    const next = countryLabelOpacity(japan, [lon, 35], false);
    assert.ok(next <= last + 1e-9, `opacity rose at ${lon}`);
    assert.ok(last - next < 0.35, `opacity jumped at ${lon}`);
    last = next;
  }
});

test("country-name state is independent of plates and older shared views default to off", () => {
  const view = parseView({ mode: "demo", countries: true, plates: false });
  assert.equal(view.countries, true);
  assert.equal(view.plates, false);
  assert.equal(parseView(JSON.parse(JSON.stringify(view))).countries, true);
  assert.equal(parseView({ mode: "demo", plates: true }).countries, false);
  assert.equal(parseView({ mode: "demo", countries: "true" }).countries, false);
});
