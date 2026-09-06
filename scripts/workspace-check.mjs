import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "observatory-workspace-"));
const executable = path.join(
  root,
  process.platform === "win32" ? "observatory.exe" : "observatory",
);
execFileSync("go", ["build", "-o", executable, "./cmd/observatory"]);
const server = spawn(executable, [
  "-demo",
  "-no-browser",
  "-addr",
  "127.0.0.1:0",
  "-data-dir",
  path.join(root, "data"),
]);
const exited = new Promise((resolve) => server.once("exit", resolve));
let browser;
let page;
const checks = [];
const errors = [];
try {
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Server did not start")),
      30000,
    );
    server.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    server.once("exit", (code) => {
      clearTimeout(timer);
      reject(Error(`Server exited early: ${code}`));
    });
    let output = "";
    server.stderr.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/url=(http:\/\/127\.0\.0\.1:\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  const demo = JSON.parse(
    await fs.readFile("web/public/data/demo.geojson", "utf8"),
  );
  const envelope = {
    id: "browser-fixture",
    query: "Mock February query",
    fetched: new Date().toISOString(),
    complete: true,
    stale: false,
    data: demo,
  };
  await context.route("**/api/detail/**", (route) =>
    route.fulfill({
      json: {
        type: "Feature",
        id: new URL(route.request().url()).pathname.split("/").pop(),
        properties: {
          products: {
            origin: [
              {
                preferredWeight: 1,
                properties: {
                  "horizontal-error": "1.25",
                  "depth-error": "2.5",
                },
              },
            ],
          },
        },
      },
    }),
  );
  await context.route("**/api/recent?*", (route) =>
    route.fulfill({ json: envelope }),
  );
  await context.route("**/api/history?*", (route) =>
    route.fulfill({ json: envelope }),
  );
  const count = (amount) =>
    page.getByText(`${amount} earthquakes`, { exact: true }).waitFor();
  const upload = async (data) =>
    page.locator("input[type=file]").setInputFiles({
      name: "snapshot.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(data)),
    });
  await page.goto(base);
  await count(618);

  const badView = {
    mode: "demo",
    filters: {
      text: "",
      region: { name: "invalid", west: 1e20, east: 1e20, south: 0, north: 1 },
    },
  };
  await page.goto(
    base + "?view=" + encodeURIComponent(JSON.stringify(badView)),
  );
  await count(618);
  await page
    .getByText("The shared view was invalid; showing defaults.", {
      exact: false,
    })
    .waitFor();
  checks.push("Out-of-range shared coordinates rejected without hanging");

  const invalid = structuredClone(demo.features[0]);
  invalid.properties.mag = "invalid";
  await upload({ type: "FeatureCollection", features: [invalid] });
  await page
    .getByRole("alert")
    .filter({ hasText: "Invalid snapshot" })
    .waitFor();
  await count(618);
  checks.push(
    "Malformed snapshot preserves previous dataset without renderer errors",
  );
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await upload({ ...demo, features: demo.features.slice(0, 2) });
  await count(2);
  assert.equal(
    await page.locator(".pagination span").innerText(),
    "Page 1 of 1",
  );
  assert.equal(await page.locator(".events tbody tr").count(), 2);
  checks.push("Shrinking snapshot clamps table pagination");

  let release, started, finished;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const intercepted = new Promise((resolve) => {
    started = resolve;
  });
  const completed = new Promise((resolve) => {
    finished = resolve;
  });
  const delayed = async (route) => {
    started();
    await gate;
    await route.fulfill({ json: envelope }).catch(() => {});
    finished();
  };
  await page.route("**/api/recent?*", delayed);
  await page.locator(".toolbar select").selectOption("day");
  await intercepted;
  await upload({ ...demo, features: demo.features.slice(0, 3) });
  await count(3);
  release();
  await completed;
  await count(3);
  await page.unroute("**/api/recent?*", delayed);
  checks.push("Pending retrieval cannot overwrite an imported snapshot");

  const historyRequests = [];
  const history = async (route) => {
    const query = new URL(route.request().url()).searchParams;
    historyRequests.push({
      start: query.get("start"),
      end: query.get("end"),
      min: query.get("min"),
    });
    if (historyRequests.length === 1)
      return route.fulfill({
        status: 502,
        json: { error: "Injected historical failure" },
      });
    return route.fulfill({ json: envelope });
  };
  await page.route("**/api/history?*", history);
  await page.locator(".toolbar select").selectOption("history");
  await page
    .getByRole("button", { name: "Retrieve history", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Injected historical failure" })
    .waitFor();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await count(618);
  assert.deepEqual(historyRequests[0], historyRequests[1]);
  checks.push("Historical retry repeats original interval and magnitude");
  await page.locator("input[type=date]").first().fill("2023-03-01");
  await page.locator("input[type=date]").nth(1).fill("2023-03-05");
  await page
    .getByRole("button", { name: "Copy view link", exact: true })
    .click();
  await page.getByText("View link copied.", { exact: false }).waitFor();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  const view = JSON.parse(new URL(link).searchParams.get("view"));
  assert.equal(view.query.start, "2023-02-06T00:00:00.000Z");
  checks.push(
    "Shared history retains committed query despite unsubmitted edits",
  );

  await page.getByLabel("Name", { exact: true }).fill("February study");
  await page
    .getByLabel("Notes", { exact: true })
    .fill("Initial interpretation");
  await page
    .getByRole("button", { name: "Pin current snapshot", exact: true })
    .click();
  await page
    .getByText("Snapshot pinned. Notes and view saved locally.")
    .waitFor();
  await page
    .getByLabel("Notes", { exact: true })
    .fill("Revised interpretation");
  await page
    .getByRole("button", { name: "Save name & notes", exact: true })
    .click();
  await page.getByText("Notes saved; pinned observations unchanged.").waitFor();
  const altered = structuredClone(demo.features.slice(0, 2));
  altered[0].properties.mag += 1;
  altered[0].properties.updated += 1;
  await upload({ ...demo, features: altered });
  await count(2);
  await page
    .getByRole("button", { name: "Compare revisions", exact: true })
    .click();
  await page.getByText("1 changed", { exact: false }).waitFor();
  assert.match(
    await page.locator(".revision-comparison tbody").innerText(),
    /Magnitude/,
  );
  const downloadReady = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export comparison CSV", exact: true })
    .click();
  const downloaded = await downloadReady;
  assert.match(await fs.readFile(await downloaded.path(), "utf8"), /Magnitude/);
  await page
    .getByRole("button", { name: "Reopen pinned snapshot", exact: true })
    .click();
  await count(618);
  await page.reload();
  await count(618);
  await page
    .getByLabel("Investigation", { exact: true })
    .selectOption({ label: "February study" });
  await page
    .getByRole("button", { name: "Reopen pinned snapshot", exact: true })
    .waitFor({ state: "visible" });
  await page
    .getByRole("button", { name: "Reopen pinned snapshot", exact: true })
    .click();
  await count(618);
  assert.equal(
    await page.getByLabel("Notes", { exact: true }).inputValue(),
    "Revised interpretation",
  );
  await page
    .getByRole("button", { name: "Run saved query", exact: true })
    .click();
  await page
    .locator(".status")
    .filter({ hasText: "Historical catalog" })
    .waitFor();
  checks.push(
    "Pinned investigation, editable notes, offline reopen, query rerun, and revision CSV",
  );

  await page.locator(".events .event-link").first().click();
  await page.getByText("Source uncertainty & quality", { exact: true }).click();
  await page
    .locator(".uncertainty")
    .getByText("1.25 km", { exact: false })
    .waitFor();
  await page
    .getByRole("button", { name: "Close event details", exact: true })
    .click();
  checks.push("Current source uncertainty displayed with provenance");
  await page
    .getByRole("button", { name: "Show depth section", exact: true })
    .click();
  await page.getByLabel("Start longitude", { exact: true }).fill("-130");
  await page.getByLabel("Start latitude", { exact: true }).fill("30");
  await page.getByLabel("End longitude", { exact: true }).fill("-110");
  await page.getByLabel("End latitude", { exact: true }).fill("45");
  await page.getByLabel("Corridor width (km)", { exact: true }).fill("200");
  await page
    .getByRole("button", { name: "Apply transect", exact: true })
    .click();
  await page
    .locator(".depth-section")
    .getByText("-130, 30 to -110, 45", { exact: false })
    .waitFor();
  await page.getByLabel("Name", { exact: true }).fill("Custom transect");
  await page
    .getByRole("button", { name: "Pin current snapshot", exact: true })
    .click();
  await page
    .getByText("Snapshot pinned. Notes and view saved locally.")
    .waitFor();
  await page.getByRole("button", { name: "Tonga preset", exact: true }).click();
  await page
    .getByRole("button", { name: "Reopen pinned snapshot", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Start longitude", { exact: true }).inputValue(),
    "-130",
  );
  checks.push(
    "Custom transect updates map/chart and survives saved-view restoration",
  );

  await page.getByText("Local cache", { exact: true }).click();
  await page
    .getByRole("button", { name: "Clear rolling cache", exact: true })
    .click();
  await page
    .getByText("Rolling cache cleared. Pinned investigations retained.")
    .waitFor();
  await page
    .getByRole("button", { name: "Reopen pinned snapshot", exact: true })
    .click();
  await count(618);
  checks.push("Cache clearing preserves pinned investigations");

  const canvasHash = async () =>
    page.locator("canvas").evaluate((canvas) => {
      const pixels = canvas
        .getContext("2d")
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let hash = 0;
      const colors = new Set();
      for (let index = 0; index < pixels.length; index += 256) {
        hash = (hash * 31 + pixels[index]) | 0;
        colors.add(
          `${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`,
        );
      }
      return { hash, colors: colors.size };
    });
  assert.ok((await canvasHash()).colors > 5);
  const initial = await canvasHash();
  await page
    .getByRole("button", {
      name: /Auto-rotate: off|Resume rotation/,
      exact: true,
    })
    .click();
  await page.waitForFunction((initialHash) => {
    const canvas = document.querySelector("canvas");
    const pixels = canvas
      .getContext("2d")
      .getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0;
    for (let index = 0; index < pixels.length; index += 256)
      hash = (hash * 31 + pixels[index]) | 0;
    return hash !== initialHash;
  }, initial.hash);
  await page
    .getByRole("button", { name: "Auto-rotate: on", exact: true })
    .click();
  const screenshots = [];
  for (const [name, width, height] of [
    ["desktop", 1440, 1050],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator("canvas").scrollIntoViewIfNeeded();
    assert.ok((await canvasHash()).colors > 5);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `${name} horizontal overflow`,
    );
    const report = await new AxeBuilder({ page }).analyze();
    assert.deepEqual(
      report.violations.map((value) => ({
        id: value.id,
        impact: value.impact,
      })),
      [],
      `${name} accessibility violations`,
    );
    const target = path.join(root, `${name}.png`);
    await page.screenshot({ path: target, fullPage: true });
    screenshots.push(target);
  }
  checks.push(
    "Desktop/mobile nonblank animated canvas, no horizontal overflow, zero axe violations",
  );
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, errors, screenshots }, null, 2));
} catch (reason) {
  if (page) {
    console.error(
      JSON.stringify(
        {
          errors,
          alerts: await page.getByRole("alert").allTextContents(),
          transect: await page
            .locator(".transect-editor input")
            .evaluateAll((inputs) =>
              inputs.map((input) => ({
                label: input.parentElement.textContent,
                value: input.value,
                valid: input.validity.valid,
              })),
            ),
        },
        null,
        2,
      ),
    );
    await page.screenshot({
      path: path.join(root, "failure.png"),
      fullPage: true,
    });
    console.error("Failure screenshot:", path.join(root, "failure.png"));
  }
  throw reason;
} finally {
  await browser?.close();
  server.kill("SIGINT");
  await exited;
}
