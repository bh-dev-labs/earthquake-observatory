import { test } from "node:test";
import assert from "node:assert/strict";
import { corridorLines, uncertainty } from "./science";
import { defaultSection, parseCollection } from "./data";
import { transect } from "./model";

test("corridor guide uses the same spherical width as membership", () => {
  for (const section of [
    defaultSection,
    {
      start: [0, 60] as [number, number],
      end: [90, 60] as [number, number],
      width: 200,
    },
  ]) {
    const lines = corridorLines(section);
    assert.equal(lines.coordinates[0].length, 65);
    for (const edge of lines.coordinates.slice(1, 3))
      for (const point of edge) {
        assert.ok(
          Math.abs(
            Math.abs(
              transect(point, section.start, section.end, section.width).cross,
            ) -
              section.width / 2,
          ) < 0.0001,
        );
      }
  }
});
test("uncertainty retains missing values and distinguishes live detail", () => {
  const event = parseCollection({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "us-test",
        geometry: { type: "Point", coordinates: [0, 0, 2] },
        properties: { time: 1000, updated: 1000, depthError: 0 },
      },
    ],
  }).features[0];
  const values = uncertainty(event, {
    type: "Feature",
    id: event.id,
    properties: {
      products: {
        origin: [
          {
            preferredWeight: 1,
            properties: {
              "horizontal-error": "1.5",
              "depth-error": "9",
              "azimuthal-gap": "",
            },
          },
        ],
      },
    },
  });
  assert.deepEqual(
    values.find((value) => value.key === "depthError"),
    {
      key: "depthError",
      label: "Depth uncertainty",
      unit: "km",
      value: 0,
      live: false,
    },
  );
  assert.equal(
    values.find((value) => value.key === "horizontalError")?.live,
    true,
  );
  assert.equal(values.find((value) => value.key === "gap")?.value, null);
});
