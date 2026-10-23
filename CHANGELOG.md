# Changelog

## Unreleased

- Updated every dependency: Go 1.27.3 with modernc.org/sqlite 1.61.0; Preact 11, Vite 8.3, Playwright 1.64, TypeScript tooling; GitHub Actions checkout v7, setup-go v7 and setup-node v7.1 pinned by commit, CI on Node 26.
- Hardened the local API: GET routes with side effects now reject requests from pages on other localhost ports (browsers treat every localhost port as one site), validation errors return HTTP 400 instead of 502, the data directory is forced to 0700 and backups to 0600, the server has read/write timeouts and a header cap, hashed assets are served immutable, and the release script uses the user's own Go caches and runs `go mod verify`.
- Faster saves and responses: stored event payloads are the original USGS bytes (no second JSON encoding, a third of the memory), orphaned events are swept only when a dataset is evicted, and dataset responses stream their validated payload instead of re-encoding it. The demo bundle is served from the cache after its first save.
- Lighter rendering: chart series and the depth transect are memoised (the transect is skipped while hidden), time-zone offsets are computed once rather than on every table render, the globe no longer rebuilds the graticule or copies the event list each frame, and extents use a single pass instead of argument spreading, which threw on very large snapshots.
- Added `.claude/agents/critic.md` and `.claude/agents/test-agent.md`, project-specific review and test-writing agents for Claude Code.

## 0.2.1 (local release candidate)

- Restored the on-screen author credit — "A Bruce Hoppe Project" — to the footer and About panel, and to README, without a repository link. The copyright remains recorded as a source comment and in LICENSE, which ships in every archive; the About panel keeps the statement that the project is independent of the USGS.

## 0.2.0 (local release candidate)

- Added the USGS magnitude-threshold summary feeds. A Detail control selects `all`, `M1.0+`, `M2.5+`, `M4.5+` or significant-only for any recent period; the choice is carried in shared view links. The 30-day feed drops from roughly 8 MiB to a few hundred KiB at `M4.5+`.
- Historical retrievals ask the catalog for a size estimate first and refuse a search whose estimate exceeds the 50,000-event budget rather than spending the 64-request partition budget to discover it. The guard lives in the server, so shared links, retries and direct API calls are covered; the estimate is shown as "expected" in retrieval progress, and `/api/history/count` exposes it on its own.
- The Detail control reflects the committed query, so a failed or cancelled threshold change falls back to what is actually loaded; a shared link with an unknown threshold is reported as invalid rather than silently loading the largest feed.
- Refactored country labels to reuse cached text rasters with fractional-pixel movement, removing whole-pixel snapping and per-frame glyph rendering. All countries now participate in geographic spacing instead of a global top-country quota; zoom fades names in without evicting existing names, and hemisphere visibility eases at the limb. Browser checks verify raster reuse during rotation, globe/map toggles and responsive layouts.
- Repaired the browser checks: `browser-check.mjs` waited for a lesson heading renamed in 8b3ec0a, and the workspace/extended checks addressed the period picker by a now-ambiguous selector.

## 0.1.0 package refresh (2026-09-06)

- Merged PR #1: optional country labels, compact event sidebar and responsive layouts. Removed the Saved investigations panel from the interface; database records remain intact. The investigation/cache additions below describe backend capabilities retained from earlier work.

- Stabilized historical snapshot IDs when multiple events share a timestamp.
- Prevented superseded responses from clearing the active historical progress poll.
- Fixed shared-region validation and bounded drawing loops; malformed snapshots no longer reach rendering.
- Extracted typed loading and committed queries. Imports invalidate pending work, Retry repeats failed queries, links ignore unsent edits, and pagination clamps when results shrink.
- Normalize historical timestamps to UTC and reject submillisecond boundaries; added bounded progress and cancellation status.
- Added SQLite-pinned investigations, saved views, editable notes, offline reopening, query reruns, revision comparisons and comparison CSV export.
- Added cache inspection/reopening/removal without deleting pins; backups include investigations and notes.
- Added source-labelled uncertainty fields and corrected missing-report language. Detail caches use a five-minute TTL and frontend revision invalidation.
- Added custom spherical transects, a Tonga preset, selected-event endpoints and readable mobile axes; settings survive pinned/shared views and appear in export metadata.
- Added snapshot checksum verification and isolated browser regression tests with desktop/mobile pixel and accessibility checks.

- Attribution avoids publishing an email address, and states that the project is independent of the USGS.
- The release string is single-sourced from `package.json` and reaches Go through `-ldflags`; an unflagged build reports `dev`.
- Colour moved to CSS custom properties with a dark theme, and depth now uses one sequential light-to-dark ramp instead of three unrelated hues.
- Event table sorts from its column headers with `aria-sort`, across five columns in both directions.
- The globe accepts the keyboard: arrows rotate, +/- zoom, N steps through visible markers, Enter opens one, and each landing is announced.
- Charts bin time by the loaded span (hourly, six-hourly or daily), trim empty magnitude bins, and draw real axes scaled to the data.
- Interface split into memoised components so rotation no longer re-renders the table and charts sixty times a second.
- Fixed the region preset whose displayed option cleared the region it named.
- Fixed list reconciliation: keyed rows no longer mispair selection state when sorting or paging.
- Stopping the server moved out of the reference links; felt-report fields collapse to one sentence when nothing was reported.
- Saving a 20,000-event dataset is about 38% faster through prepared statements; the response cache evicts its oldest entry rather than an arbitrary one.

## 0.1.0 (2026-09-06 UTC)

- Initial local Earthquake Observatory application and offline USGS snapshot.
- Selectable current activity areas coordinated with globe and event filters.
- Reproducible source build and macOS/Windows release archives.
