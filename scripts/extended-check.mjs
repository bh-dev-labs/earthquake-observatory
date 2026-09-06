import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
const checks = [];
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const demo = JSON.parse(
  await fs.readFile("web/public/data/demo.geojson", "utf8"),
);
await page.route("**/api/detail/**", (r) =>
  r.fulfill({
    status: 502,
    contentType: "application/json",
    body: JSON.stringify({ error: "Injected offline detail failure" }),
  }),
);
await page.goto("http://127.0.0.1:8787");
await page.getByText("618 earthquakes", { exact: true }).waitFor();
await page.locator(".event-link").first().click();
await page
  .getByText("Injected offline detail failure", { exact: false })
  .waitFor();
assert.ok(await page.locator(".magnitude").isVisible());
checks.push("Failed details preserve basic selection and retry");
await page.waitForTimeout(500);
await page
  .getByRole("button", { name: "Close event details", exact: true })
  .click();
await page.locator("canvas").scrollIntoViewIfNeeded();
const box = await page.locator("canvas").boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
if (await page.locator(".chooser").isVisible())
  await page.locator(".chooser button").nth(1).click();
await page.locator(".magnitude").waitFor();
checks.push("Direct globe marker selection after centering");
await page
  .getByRole("button", { name: "Copy event link", exact: true })
  .click();
const link = await page.evaluate(() => navigator.clipboard.readText());
const other = await context.newPage();
await other.goto(link);
await other.locator(".magnitude").waitFor();
await other.close();
checks.push("Shared URL restores selected event");
await page
  .getByRole("button", { name: "Close event details", exact: true })
  .click();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 25, {
  steps: 8,
});
await page.mouse.up();
assert.equal(await page.locator(".magnitude").count(), 0);
checks.push("Drag does not select");
await page.getByRole("button", { name: "Learn", exact: true }).click();
const names = [
  "Why do earthquakes form belts?",
  "How can an earthquake be deep inside Earth?",
  "Does larger magnitude mean stronger shaking everywhere?",
  "What changes during an earthquake sequence?",
];
for (const name of names) {
  await page.getByRole("button", { name, exact: true }).click();
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await page
    .getByRole("button", { name: "Complete & reflect", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Return to my exploration", exact: true })
    .click();
  await page.getByRole("button", { name: "Learn", exact: true }).click();
}
checks.push("All four activity navigation/reset/return flows");
await page.getByRole("button", { name: "Explore", exact: true }).click();
await page.getByRole("button", { name: "About", exact: true }).click();
await page.getByRole("dialog").waitFor();
await page.keyboard.press("Escape");
await page.getByRole("dialog").waitFor({ state: "hidden" });
checks.push("Dialog Escape");
await page.route("**/api/recent?*", (r) =>
  r.fulfill({
    status: 502,
    contentType: "application/json",
    body: JSON.stringify({ error: "Injected upstream outage" }),
  }),
);
await page.locator(".toolbar select").first().selectOption("day");
await page.getByRole("alert").waitFor();
assert.ok(await page.getByText("618 earthquakes", { exact: true }).isVisible());
await page
  .getByRole("button", { name: "Open offline historical demo", exact: true })
  .click();
await page.getByText("618 earthquakes", { exact: true }).waitFor();
checks.push("Initial live failure retains historical data; demo recovery");
await page.locator(".toolbar select").first().selectOption("history");
await page
  .getByRole("button", { name: "Retrieve history", exact: true })
  .click();
await page.waitForFunction(
  () => document.querySelector(".status")?.textContent === "Historical catalog",
  null,
  { timeout: 120000 },
);
checks.push("Live historical retrieval through UI");
// 20k reproducible stress data: deliberate synthetic observations, only in test harness.
const stress = {
  type: "FeatureCollection",
  features: Array.from({ length: 20000 }, (_, i) => {
    const e = structuredClone(demo.features[i % demo.features.length]);
    e.id = "stress-" + i;
    e.geometry.coordinates = [
      ((i * 137.508) % 360) - 180,
      ((i * 19.173) % 170) - 85,
      i % 700,
    ];
    e.properties.time = 1675641600000 + i * 10000;
    e.properties.place = "Synthetic stress " + i;
    return e;
  }),
};
await page.locator("input[type=file]").setInputFiles({
  name: "stress.json",
  mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify(stress)),
});
await page.getByText("20000 earthquakes", { exact: true }).waitFor();
const measurements = [];
for (let i = 0; i < 12; i++) {
  const t = performance.now();
  await page
    .getByLabel("Search loaded descriptions", { exact: true })
    .fill(i % 2 ? "" : "stress 1");
  await page.waitForTimeout(30);
  measurements.push(performance.now() - t);
}
await page.getByLabel("Search loaded descriptions", { exact: true }).fill("");
await page
  .getByRole("button", {
    name: /Auto-rotate: off|Resume rotation/,
    exact: true,
  })
  .click();
const frame = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const times = [];
      let last = performance.now(),
        start = last;
      function f(t) {
        times.push(t - last);
        last = t;
        if (t - start < 3000) requestAnimationFrame(f);
        else
          resolve({
            frames: times.length,
            duration: t - start,
            fps: (times.length / (t - start)) * 1000,
            maxFrame: Math.max(...times),
          });
      }
      requestAnimationFrame(f);
    }),
);
await page
  .getByRole("button", { name: "Auto-rotate: on", exact: true })
  .click();
const baseline = await page.evaluate(() => ({
  circles: document.querySelectorAll("svg circle").length,
  rows: document.querySelectorAll("tbody tr").length,
}));
for (let i = 0; i < 10; i++) {
  await page.getByRole("button", { name: "2D map", exact: true }).click();
  await page.getByRole("button", { name: "3D globe", exact: true }).click();
}
const after = await page.evaluate(() => ({
  circles: document.querySelectorAll("svg circle").length,
  rows: document.querySelectorAll("tbody tr").length,
}));
assert.deepEqual(after, baseline);
checks.push("Ten repeated view switches retain bounded DOM membership");
const mem = await page.evaluate(() =>
  performance.memory
    ? {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
      }
    : null,
);
const result = {
  checks,
  errors,
  stress: {
    count: 20000,
    interactionMilliseconds: measurements,
    frame,
    memory: mem,
    environment:
      "macOS arm64, headless Chromium 153, viewport 1440x1050; Playwright wall times include automation overhead",
  },
};
await fs.writeFile(
  "docs/extended-test-results.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result));
await browser.close();
assert.equal(errors.length, 0);
