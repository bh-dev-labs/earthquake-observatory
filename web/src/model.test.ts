import { test } from "node:test";
import assert from "node:assert/strict";
import { geoOrthographic } from "d3-geo";
import {
  within,
  visible,
  transect,
  distance,
  comparison,
  csvCell,
  filterEvents,
  defaults,
  type Event,
  areaGroups,
} from "./model";
const event = (
  id: string,
  lon = 0,
  lat = 0,
  mag: number | null = 1,
  depth: number | null = 10,
  time = 1000,
) =>
  ({
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [lon, lat, depth] },
    properties: { mag, place: "test", time, updated: time, type: "earthquake" },
  }) as Event;
test("antimeridian region includes both sides without Greenwich", () => {
  const r = { name: "test", west: 170, east: -170, south: -30, north: 0 };
  assert.ok(within(175, -20, r));
  assert.ok(within(-175, -20, r));
  assert.ok(!within(0, -20, r));
});
test("known landmarks centre and far-side occlusion in each hemisphere", () => {
  for (const p of [
    [116.4, 39.9],
    [-122.4, 37.8],
    [151.2, -33.9],
    [-70.7, -33.4],
    [179.9, 0],
    [0, 89.9],
  ] as [number, number][]) {
    const proj = geoOrthographic().rotate([-p[0], -p[1]]).translate([400, 300]);
    const xy = proj(p)!;
    assert.ok(Math.abs(xy[0] - 400) < 0.001 && Math.abs(xy[1] - 300) < 0.001);
    assert.ok(visible(p, p));
    assert.ok(!visible([p[0] + 180, -p[1]], p));
  }
});
test("east is right at Greenwich and north is up", () => {
  const p = geoOrthographic();
  assert.ok(p([20, 0])![0] > p([0, 0])![0]);
  assert.ok(p([0, 20])![1] < p([0, 0])![1]);
});
test("nulls do not become zero; negatives retained; backward seek deterministic", () => {
  const es = [
    event("a", 0, 0, -1, -3, 1000),
    event("b", 0, 0, null, null, 2000),
    event("c", 0, 0, 2, 100, 2000),
  ];
  assert.equal(filterEvents(es, defaults).length, 3);
  assert.deepEqual(
    filterEvents(es, { ...defaults, min: "0" }).map((e) => e.id),
    ["c"],
  );
  assert.equal(filterEvents(es, defaults, 2000).length, 3);
  assert.deepEqual(
    filterEvents(es, defaults, 1000).map((e) => e.id),
    ["a"],
  );
  assert.equal(filterEvents(es, { ...defaults, depthMin: "0" }).length, 1);
});
test("great-circle distance and corridor", () => {
  assert.ok(Math.abs(distance([0, 0], [1, 0]) - 111.195) < 0.01);
  const s = transect([5, 0], [0, 0], [10, 0], 100);
  assert.ok(s.inside);
  assert.ok(Math.abs(s.along - 555.975) < 0.1);
  assert.ok(Math.abs(s.cross) < 0.0001);
  assert.ok(!transect([5, 2], [0, 0], [10, 0], 100).inside);
  assert.ok(!transect([-1, 0], [0, 0], [10, 0]).inside);
  assert.ok(transect([180, 0], [170, 0], [-170, 0]).inside);
});
test("magnitude ratios and safe CSV", () => {
  assert.equal(comparison(4, 5).amplitude, 10);
  assert.ok(Math.abs(comparison(4, 5).energy - 31.6227766) < 1e-6);
  assert.equal(csvCell("=CMD()"), '"\'=CMD()"');
  assert.equal(csvCell(-1), '"-1"');
  assert.equal(csvCell(null), "");
});
test("geographic cell counts preserve membership including poles", () => {
  const es = [event("a", 180, 90), event("b", -180, -90), event("c", 0, 0)];
  const groups = areaGroups(es);
  assert.equal(
    groups.reduce((s, g) => s + g.events.length, 0),
    3,
  );
  for (const g of groups)
    for (const e of g.events)
      assert.ok(
        within(e.geometry.coordinates[0], e.geometry.coordinates[1], g.region),
      );
});
test("UTC epoch conversion independent of DST zone", () => {
  const a = Date.parse("2024-03-10T01:59:59-05:00"),
    b = Date.parse("2024-03-10T03:00:00-04:00");
  assert.equal(b - a, 1000);
  assert.equal(new Date(a + 123).toISOString(), "2024-03-10T06:59:59.123Z");
});
