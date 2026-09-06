import { test } from "node:test";
import assert from "node:assert/strict";
import {
  freshDetail,
  parseDetail,
  parseSnapshot,
  parseCollection,
  parseView,
  parseQuery,
  queryURL,
  validRegion,
  clampPage,
  RequestGate,
  validSection,
} from "./data";

const collection = () => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "us-test",
      geometry: { type: "Point", coordinates: [10, 20, null] },
      properties: {
        mag: null,
        time: 1000,
        updated: 2000,
        place: "Test",
        type: "earthquake",
      },
    },
  ],
});
test("snapshots reject invalid rendering fields and preserve nulls", () => {
  assert.equal(parseCollection(collection()).features[0].properties.mag, null);
  for (const field of ["mag", "time", "updated", "place"]) {
    const data = collection();
    Object.assign(data.features[0].properties, {
      [field]: field === "place" ? {} : "invalid",
    });
    assert.throws(() => parseCollection(data));
  }
  const data = collection();
  data.features[0].properties.time = 1e20;
  assert.throws(() => parseCollection(data));
});
test("shared bounds cannot enter unbounded drawing loops", () => {
  assert.equal(
    validRegion({ name: "bad", west: 1e20, east: 1e20, south: 0, north: 1 }),
    false,
  );
  assert.throws(() =>
    parseView({
      mode: "demo",
      filters: {
        region: { name: "bad", west: 0, east: 1, south: 10, north: 0 },
      },
    }),
  );
  assert.equal(
    parseView({ mode: "demo", camera: { zoom: "oops" } }).camera.zoom,
    1,
  );
});
test("committed queries survive editable filter and date changes", () => {
  const query = parseQuery({
    mode: "history",
    start: "2023-02-06",
    end: "2023-02-13",
    min: "4",
  });
  const view = parseView({
    mode: "history",
    query,
    start: "2023-03-01",
    end: "2023-03-05",
    filters: { min: "2" },
  });
  assert.equal(view.query.start, "2023-02-06T00:00:00.000Z");
  assert.equal(view.query.min, "4");
  assert.match(queryURL(view.query), /min=4/);
  assert.equal(
    parseQuery({
      mode: "history",
      start: "2023-02-06T05:00:00+05:00",
      end: "2023-02-07T05:00:00+05:00",
    }).start,
    "2023-02-06T00:00:00.000Z",
  );
});
test("replacement and cancellation invalidate older requests", () => {
  const gate = new RequestGate();
  const first = gate.start();
  gate.cancel();
  assert.equal(first.signal.aborted, true);
  assert.equal(gate.current(first.ticket), false);
  assert.equal(gate.current(gate.start().ticket), true);
});
test("pagination clamps empty and shrinking results", () => {
  assert.equal(clampPage(1, 2), 0);
  assert.equal(clampPage(5, 0), 0);
  assert.equal(clampPage(3, 81), 2);
});
test("detail cache expires and invalidates revised event records", () => {
  const detail = parseDetail(
    { type: "Feature", id: "us-test", properties: { products: {} } },
    "us-test",
  );
  const cached = { detail, fetched: 1000, updated: 2000 };
  assert.ok(freshDetail(cached, 2000, 300999));
  assert.equal(freshDetail(cached, 2000, 301000), false);
  assert.equal(freshDetail(cached, 2001, 1001), false);
  assert.equal(freshDetail(cached, 2000, 0), false);
  assert.throws(() =>
    parseDetail({ type: "Feature", id: "other", properties: {} }, "us-test"),
  );
});
test("snapshot checksums detect modified observations", async () => {
  const value = collection();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  const sha256 = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const snapshot = { ...value, metadata: { sha256 } };
  assert.equal(
    (await parseSnapshot(new File([JSON.stringify(snapshot)], "snapshot.json")))
      .data.features.length,
    1,
  );
  snapshot.features[0].properties.place = "Modified";
  await assert.rejects(
    () => parseSnapshot(new File([JSON.stringify(snapshot)], "snapshot.json")),
    /checksum mismatch/,
  );
});
test("transects reject coincident and antipodal endpoints", () => {
  assert.equal(validSection({ start: [0, 0], end: [0, 0], width: 100 }), false);
  assert.equal(
    validSection({ start: [0, 0], end: [180, 0], width: 100 }),
    false,
  );
  assert.equal(
    validSection({ start: [170, -22], end: [-170, -22], width: 400 }),
    true,
  );
});
