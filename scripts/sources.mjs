import { sources } from "../web/src/content.ts";
import fs from "node:fs/promises";
const lines = [
  "# Sources and verification",
  "",
  "Checked 2026-09-06 UTC (2026-09-05 local America/Toronto). Original specification carries a UTC September 6 baseline. Documentation review used official USGS pages and upstream software/asset documentation.",
  "",
];
for (const s of sources)
  lines.push(
    `## ${s.title}`,
    `${s.author}. [Original source](${s.url}).`,
    s.purpose,
    `Verification: ${s.verified}.`,
    "",
  );
const paths = ["earth.json", "plates.json", "demo.geojson"];
const crypto = await import("node:crypto");
for (const file of paths) {
  const b = await fs.readFile("web/public/data/" + file);
  lines.push(
    `- ${file}: SHA-256 ${crypto.createHash("sha256").update(b).digest("hex")}`,
  );
}
lines.push(
  "",
  "Historical fixture query: https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=2023-02-06&endtime=2023-02-13&minmagnitude=4&eventtype=earthquake&orderby=time-asc",
  "Retrieved 2026-09-06 UTC; 618 source records. This is real historical observation data, never illustrative/synthetic. Synthetic test events exist only in tests. To reproduce, download the query to web/public/data/demo.geojson, inspect changes and regenerate asset hashes; the mutable catalog may now differ.",
  "Upstream place-name encoding: 125 of the 618 place descriptions contain a question mark where a non-Latin-1 letter belongs, so Nurdagi appears as `Nurda??` and Pazarcik as `Pazarc?k`. This originates at USGS, not in this application: a fresh query returns byte-identical records, and characters inside Latin-1 (Ç, á, ç, é, ë, í, ö, ü) arrive intact while Turkish g-breve, dotless i and s-cedilla do not. Place descriptions are reproduced exactly as the catalog supplies them; correcting them here would alter an observational record, so the limitation is documented instead. Coordinates, magnitudes, depths and times are unaffected.",
  "Geography: world-atlas 2.0.2 countries-110m.json; land object used. Plates: PB2002_boundaries.json from fraxen/tectonicplates master; exact SHA above pins the bundled version. See plate-source.md and plate-license.md.",
  "Plate boundary coordinates are a coarse global model, with no claimed fault-level precision. Uniform lines deliberately avoid unverified boundary-type interpretation. No map tiles or imagery are bundled.",
);
await fs.writeFile("docs/sources.md", lines.join("\n"));
