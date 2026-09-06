import { filterEvents, defaults } from "../web/src/model.ts";
import { performance } from "node:perf_hooks";
import fs from "node:fs/promises";
const raw = JSON.parse(
  await fs.readFile("web/public/data/demo.geojson", "utf8"),
);
const es = Array.from({ length: 20000 }, (_, i) => ({
  ...raw.features[i % raw.features.length],
  id: String(i),
}));
const times = [];
for (let i = 0; i < 110; i++) {
  const t = performance.now();
  filterEvents(es, { ...defaults, min: "4.5", text: i % 2 ? "Japan" : "" });
  if (i >= 10) times.push(performance.now() - t);
}
times.sort((a, b) => a - b);
const result = {
  count: es.length,
  p95Milliseconds: times[94],
  iterations: 100,
  runtime: process.version,
  platform: process.platform,
  arch: process.arch,
  generated: new Date().toISOString(),
};
await fs.writeFile(
  "docs/filter-benchmark.json",
  JSON.stringify(result, null, 2),
);
console.log(result);
