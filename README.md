# Earthquake Observatory

A local Go application for exploring USGS earthquake observations on a rotatable globe, with current activity areas, event details, historical replay, scientific charts and guided learning. The interface follows the supplied observatory reference. It runs without accounts, API keys, Node or Go on the recipient's computer.

![Earthquake Observatory](docs/screenshots/selection.png)

## Run a packaged release

Download/extract the appropriate archive in `release/`:

- macOS Apple silicon: `darwin-arm64`; open **Earthquake Observatory.app**.
- macOS Intel: `darwin-amd64`; open **Earthquake Observatory.app**.
- Windows 11 x64: `windows-amd64`; run **earthquake-observatory.exe**. Keep its console open while using the app; Ctrl+C stops it.

The app opens `http://127.0.0.1:8787`. Only the local computer can access the server. Live data needs internet access; the offline historical demo and all geography are embedded. These local release candidates are not Developer ID notarized or Authenticode signed. See the exact test boundaries in [release readiness](docs/release-readiness.md).

## Development

The current source adds saved investigations, revision comparisons, cache controls, retrieval progress, source uncertainty and custom transects. Existing `release/` archives have not been rebuilt for these unreleased changes; build from source to use them.

Prerequisites: Go 1.26+ (tested with 1.27.1), Node 22.12+ (tested with 26.8.1), npm. Python 3 is used only to create ZIP archives. Pinned dependencies are in go.mod/go.sum and package-lock.json.

macOS/Linux:

```sh
npm ci
npm run build
go run ./cmd/observatory
```

Windows PowerShell:

```powershell
npm ci
npm run build
go run ./cmd/observatory
# Build a standalone executable:
go build -trimpath -o earthquake-observatory.exe ./cmd/observatory
.\earthquake-observatory.exe
```

These PowerShell instructions are supplied but have not been exercised on Windows in this macOS session.

```sh
# Offline start, custom port and isolated cache
go run ./cmd/observatory -demo -addr 127.0.0.1:8788 -data-dir ./local-data
# Automated checks
npm test
npm run check
npm run format:check
npm run test:browser
go test -race ./...
go vet ./...
# Browser QA: run a demo instance at :8787 first
npx playwright install chromium
node scripts/browser-check.mjs
# Build all three release archives (macOS host)
./scripts/release.sh
```

## Explore

Select a **Current area of activity** to centre Earth and apply visible bounds. Cells are 20° latitude/longitude and sorted by recorded event count; they are not hazard scores. Clear the region to return to global results. Region presets include Japan, Alaska, California, Indonesia, Tonga, the Andes and New Zealand. Custom bounds can cross the date line.

Drag to rotate, pinch to zoom, or focus the canvas before using the wheel. Buttons provide keyboard equivalents. Select markers directly; overlapping markers open a chooser. Event selection pauses both camera rotation and replay. Resume each explicitly. The 2D map, table, charts and exports share the same filters and replay cursor.

**Learn** offers four guided activities on a fixed, real USGS snapshot. **Show depth section** opens a linked great-circle cross-section with editable endpoints and corridor width, a Tonga preset, and buttons to use the selected earthquake as an endpoint. All educational explanations are deterministic and sourced.

**Export GeoJSON snapshot** saves every matching event and provenance metadata. Reopen that file offline using **Reopen snapshot**. CSV exports also download a metadata companion; browsers may request permission for multiple downloads. A shared link reapplies a query on a running observatory; it is not a publicly hosted URL or an immutable catalog snapshot.

## Investigations and source details

For a repeatable study, enter a name and notes under **Saved investigations**, then choose **Pin current snapshot**. This saves the full loaded dataset and its view separately from the rolling cache. **Save name & notes** changes annotations without changing observations. **Reopen pinned snapshot** restores it offline; **Run saved query** retrieves the original query without replacing the pinned copy. Imported snapshots without a query cannot be rerun.

Choose **Compare revisions** to compare the selected investigation with the current dataset. Inspect changed, added and absent records and export a comparison CSV. Absence is not evidence of catalog deletion, especially when source queries differ. Expand **Local cache** to inspect, reopen or remove cached datasets. Clearing the cache retains pinned investigations. Database backups include pins and notes.

Historical searches report upstream requests, completed partitions and observations. Cancellation preserves the prior dataset; Retry repeats the failed dates and magnitude threshold. Copied history links use the successfully loaded query, not unsubmitted edits. Selected-event **Source uncertainty & quality** shows available source error estimates and station-quality fields. Missing values remain unavailable, not zero; current-detail values are labelled because they may be newer than a snapshot.

`npm run test:browser` builds and runs deterministic Chromium checks with its own temporary database and loopback port. Install Chromium first with `npx playwright install chromium`. The suite does not contact USGS or delete existing user data.

## Troubleshooting

- Port already in use: open the existing URL or launch with `-addr 127.0.0.1:8788`.
- USGS unavailable: an existing recent cache is returned with a stale label. Choose **Offline historical demo** if no cached data exists.
- No events: clear filters and nearby selection, show all replay times, or use a longer period.
- Blank geography: events remain accessible in the table. Bundled files mean no map-provider account is required.
- Close/stop: choose **Stop the local server** at the foot of the page, or press Ctrl+C in its terminal.

Read [QUICKSTART](QUICKSTART.md), [operations](docs/operations.md), [scientific methods](docs/scientific-methods.md), [API](docs/api.md), [sources](docs/sources.md), and [release evidence](docs/release-readiness.md).

Licensed under the [MIT License](LICENSE). Third-party licenses are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). This is an educational observatory, not an earthquake prediction or emergency warning service.


Built by Bruce Hoppe · [github.com/bruce-hoppe_uoft/earthquake-observatory](https://github.com/bruce-hoppe_uoft/earthquake-observatory)
