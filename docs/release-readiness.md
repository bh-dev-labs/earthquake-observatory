# Release readiness — 0.1.0 local candidate

This is a functioning local release candidate. **It is not a claim that every publication gate in the much larger build specification is complete.** Source, runtime functionality and cross-platform archives are delivered; the remaining gates below are explicit.

## Executed evidence

Host: macOS arm64, Go 1.27.1, Node 26.8.1, headless Chromium 153.0.8010.12. Verification date 2026-09-06 UTC / September 5 America/Toronto.

| Gate | Result and evidence |
|---|---|
| Production frontend | `npm ci`, `npm run build`, TypeScript strict check and Vite production bundle passed; embedded in Go. |
| Formatting/static checks | `npm run format:check`, `gofmt`, `go vet ./...` passed. |
| Data parsing | Go tests cover malformed payloads, coordinate range/order, nulls, negative depth/magnitude, unknown optional raw fields. |
| Persistence | Tests cover newer/older revisions, immutable source snapshots, failed publication, absent rolling-feed members, backup/restore and integrity. |
| Historical retrieval | Tests cover partition cap, boundary deduplication, cancellation, range budget and mid-partition failure with no partial publication. Live historical query also passed through the UI. |
| Reliability | Tests cover 429 retry, conditional 304 response reuse, stale cache and cache freshness. Browser-injected detail and recent outages preserve usable data and recover to offline demo. |
| Time/filter geography | Eight frontend tests cover date-line regions, known landmarks in each hemisphere, far-side occlusion, null/negative filters, backward seek, equal timestamps, UTC/DST conversion, corridor and comparison formulas, CSV escaping and area membership. |
| Globe selection | Browser tests click a centred globe marker, resolve overlap if present, reject drag-as-click, switch map/globe and restore shared selection. Rotation pauses on camera input; explicit resume verified. |
| Replay | Shared cumulative filtering and backward seek tested; restart/show-all and pause interactions exercised in browser. No physical wave simulation is claimed. |
| Lessons | All four navigation/reset/return flows exercised, with a real fixed 618-record USGS dataset. Depth-section entry and completion exercised. Scientific explanations reviewed against sources in this session; not externally expert-validated. |
| Exports | Browser export contains 618 records, independent of table pagination. Canonical snapshot import drives 20,000-event stress check. CSV escaping and magnitude comparison have deterministic unit checks. |
| Accessibility | axe Chromium scan: zero violations after count-label correction. Keyboard rotation buttons, selection alternatives, dialog Escape and focus placement exercised. This is not a full WCAG conformance audit. |
| Responsive visual review | Screenshots at 1440, 1024 and 390 px; no document-level horizontal overflow. Desktop/phone images reviewed. Mobile details sheet has separate screenshot evidence. |
| Live provider | Actual recent query returned 183 observations, complete and not stale, fetched 2026-09-06T00:51:30Z. Count is a snapshot, not a lasting current count. Live historical query passed separately. |
| Performance | 20,000 synthetic events: filtering p95 ≈0.85 ms in Node (100 measured iterations). Chromium rotation ≈37.5 fps; browser filter interactions ≈136–180 ms including test overhead in the initial measured run. Final run: 37.18 fps, 133–173 ms interactions; heap after ten view switches 624 MB (unforced GC, not a leak determination). Raw measurements in `extended-test-results.json`. |
| Dependency vulnerabilities | `npm audit` reports zero; `go run golang.org/x/vuln/cmd/govulncheck@latest ./...` reports no vulnerabilities. Scan results are time-specific. |
| Packaging | macOS arm64, macOS amd64 and Windows amd64 cross-builds succeeded. Extracted macOS arm64 archive passed startup, embedded assets, demo, running backup, restart, clean-directory restore and integrity checks; see `consumer-test-results.json`. Native macOS Launch Services launch, live-mode configuration and ad-hoc signature verification also passed. Windows and Intel execution remain unverified. |
| Attribution/license | Exact credit `coded by bruce.hoppe@utoronto.ca` in production footer and About; browser check asserts footer visibility. README, QUICKSTART, MIT LICENSE and third-party notices included in archives. |
| CI | Workflow configured for Linux/macOS/Windows; no hosted CI run is claimed. |

## Remaining publication gates and deliberate operating limits

- **Native platform acceptance:** run the extracted app on Intel macOS and Windows 11, including browser auto-open, first-run security prompts, restart, export and restore. Cross-compilation and PE/Mach-O inspection do not substitute for these runs. Mobile Safari, VoiceOver/NVDA, actual touch/pinch devices and reduced-capability hardware have not been exercised.
- **Public-download signing:** macOS bundles are locally ad-hoc signed, not Developer ID signed/notarized. Windows executable is not Authenticode signed. These are local redistributable archives, not frictionless signed public installers.
- **Catalog reconciliation:** returned alternate IDs can remap selected records; explicit returned `deleted` status is excluded and identified. There is no periodic deleted/merged catalog audit, durable alias/tombstone schema, or historical overlap revalidation scheduler. Missing rolling-feed membership is correctly not treated as deletion.
- **Resource controls:** current cache is bounded by 40 datasets and each upstream body by 32 MiB, but no configurable disk-byte quota, low-disk recovery workflow or user-pinned database snapshot manager is implemented. Durable reproducibility uses user-owned export files. Historical progress is indeterminate retrieval status with cancellation, not per-partition progress reporting.
- **Scientific/detail precision:** historical partitions are collected from a mutable catalog without snapshot isolation. The source-provided uncertainty fields are preserved in raw recent payloads but not fully surfaced. The Tonga corridor's drawn guide is approximate, while membership uses the tested spherical formula. PB2002 boundary lines are coarse, uniformly styled and do not identify causative faults.
- **Full release-test breadth:** focused tests cover the listed outcomes, not all permutations in the specification. Long-duration memory-leak soak, automated failed-Canvas fallback, every dense/polar hit-picking case, source-link availability for every event product, all keyboard-only lesson interactions and an external scientific content review remain open. The event table remains a non-canvas alternative.
- **Sharing limits:** links point to a local running server and reapply a query; they are not externally hosted. Imported arbitrary snapshots should be shared as files. CSV plus companion metadata uses two downloads, which some browsers require permission to allow.

## Re-run

```sh
npm ci
npm run build
npm test
npm run format:check
go test -race ./...
go vet ./...
# Start demo binary at 127.0.0.1:8787, then:
node scripts/browser-check.mjs
node scripts/extended-check.mjs
node --experimental-strip-types scripts/filter-benchmark.mjs
./scripts/release.sh
node scripts/consumer-check.mjs
```

Browser tests use synthetic fixtures only inside the test harness. Extended tests include an opt-in real historical API request; deterministic unit tests do not need USGS availability.
