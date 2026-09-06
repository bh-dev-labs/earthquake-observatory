import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs/promises";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:8787");
await page.getByText("618 earthquakes", { exact: true }).waitFor();
await page.waitForTimeout(500);
await fs.mkdir("docs/screenshots", { recursive: true });
await page.screenshot({ path: "docs/screenshots/desktop.png", fullPage: true });
await page
  .getByRole("button", { name: "Auto-rotate: off", exact: true })
  .click();
await page.waitForTimeout(150);
await page.getByRole("button", { name: "Rotate right", exact: true }).click();
await page
  .getByRole("button", { name: "Resume rotation", exact: true })
  .waitFor();
await page.locator(".area").first().click();
await page.locator(".filter-note").waitFor();
await page.locator(".event-link").first().click();
await page.locator(".magnitude").waitFor();
await page.waitForTimeout(450);
// A clipped page screenshot, not an element one: element captures composite
// fixed-position nodes into the crop, which drew the off-screen skip link
// across the heading in the documentation image.
{
  await page.locator(".observatory").scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const box = await page.locator(".observatory").boundingBox();
  await page.screenshot({
    path: "docs/screenshots/selection.png",
    clip: {
      x: box.x,
      y: Math.max(0, box.y),
      width: box.width,
      height: Math.min(
        box.height,
        page.viewportSize().height - Math.max(0, box.y),
      ),
    },
  });
}
await page.getByRole("button", { name: "2D map", exact: true }).click();
await page.getByRole("button", { name: "3D globe", exact: true }).click();
await page
  .getByRole("button", { name: "Close event details", exact: true })
  .click();
await page.getByRole("button", { name: "Clear filters", exact: true }).click();
await page.getByRole("button", { name: "Restart", exact: true }).click();
await page.getByRole("button", { name: "Show all", exact: true }).click();
const download = page.waitForEvent("download");
await page
  .getByRole("button", { name: "Export GeoJSON snapshot", exact: true })
  .click();
const d = await download;
await d.saveAs("/private/tmp/atlas-export.json");
const snapshot = JSON.parse(
  await fs.readFile("/private/tmp/atlas-export.json", "utf8"),
);
if (snapshot.features.length !== 618) throw Error("Export membership mismatch");
await page.getByRole("button", { name: "Learn", exact: true }).click();
await page
  .getByRole("button", {
    name: "How can an earthquake be deep inside Earth?",
    exact: true,
  })
  .click();
await page
  .getByRole("heading", { name: "Depth section", exact: true })
  .waitFor();
await page.getByRole("button", { name: "Next step", exact: true }).click();
await page.getByRole("button", { name: "Next step", exact: true }).click();
await page
  .getByRole("button", { name: "Complete & reflect", exact: true })
  .click();
await page
  .getByRole("button", { name: "Return to my exploration", exact: true })
  .click();
if (
  !(await page
    .getByRole("link", {
      name: "Built by Bruce Hoppe · Source on GitHub",
      exact: true,
    })
    .isVisible())
)
  throw Error("Missing visible author credit");
const axe = await new AxeBuilder({ page }).analyze();
await fs.writeFile(
  "docs/accessibility-results.json",
  JSON.stringify(
    {
      generated: new Date().toISOString(),
      violations: axe.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    },
    null,
    2,
  ),
);
for (const width of [1024, 390]) {
  await page.setViewportSize({ width, height: 950 });
  await page.screenshot({
    path: `docs/screenshots/${width}.png`,
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  if (overflow) throw Error("Page overflow at " + width);
}
await page.locator(".event-link").first().click();
await page.locator("canvas").scrollIntoViewIfNeeded();
await page.waitForTimeout(450);
await page.screenshot({ path: "docs/screenshots/mobile-selection.png" });
console.log(
  JSON.stringify({
    errors,
    accessibilityViolations: axe.violations.length,
    exportCount: snapshot.features.length,
  }),
);
await browser.close();
if (errors.length) process.exitCode = 1;
