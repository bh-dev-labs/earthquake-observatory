import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCollection } from "./data";
import { compareSnapshots } from "./revisions";

const event = (id: string, mag: number | null = null) =>
  parseCollection({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id,
        geometry: { type: "Point", coordinates: [0, 0, null] },
        properties: { mag, time: 1000, updated: 2000 },
      },
    ],
  }).features[0];
test("revision comparison distinguishes changes, additions, and absence", () => {
  const before = event("us-one"),
    after = event("us-one", 4);
  const result = compareSnapshots(
    [before, event("us-missing")],
    [after, event("us-new")],
  );
  assert.deepEqual(result.changed[0].changes, [
    { field: "Magnitude", before: null, after: 4 },
  ]);
  assert.equal(result.missing[0].id, "us-missing");
  assert.equal(result.added[0].id, "us-new");
});
test("aliases and duplicate revisions compare against newest event", () => {
  const revised = event("us-new", 3);
  revised.properties.ids = ",us-old,us-new,";
  const old = event("us-old", 2);
  const outdated = structuredClone(old);
  outdated.properties.updated = 1000;
  outdated.properties.mag = 1;
  const result = compareSnapshots([old, outdated], [revised]);
  assert.equal(result.added.length, 0);
  assert.equal(result.missing.length, 0);
  assert.equal(
    result.changed[0].changes.find((change) => change.field === "Magnitude")
      ?.before,
    2,
  );
});
