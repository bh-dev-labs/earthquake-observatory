# Local API and export schema

Local same-origin JSON API. Investigation/cache/job endpoints are unreleased source additions, not yet included in existing 0.1.0 archives. Mutations require `Origin: http://<request-host>` and `Sec-Fetch-Site: same-origin`; JSON bodies require `Content-Type: application/json`.

| Endpoint | Result |
|---|---|
| `/api/health` | process status and version |
| `/api/ready` | database readiness |
| `/api/config` | default demo preference |
| `/api/recent?period=hour\|day\|week\|month&level=all\|1.0\|2.5\|4.5\|significant` | complete recent feed or last-good stale snapshot; `level` selects the USGS magnitude threshold and defaults to `all` |
| `/api/demo` | embedded historical observations |
| `/api/history?start=RFC3339&end=RFC3339&min=-2` | atomic half-open historical query; documented budgets apply |
| `/api/history/count?start=RFC3339&end=RFC3339&min=-2` | `{"count":N}` for the same interval `/api/history` would retrieve; the same estimate `/api/history` performs itself before partitioning |
| `/api/detail/{USGS-event-id}` | allowlisted USGS GeoJSON event details |

## Investigations, cache and progress

| Method and endpoint | Result |
|---|---|
| `GET /api/investigations` | summaries: `id`, `name`, `notes`, `created`, `bytes` |
| `POST /api/investigations` | create from `{name, notes, view, snapshot}`; `snapshot` is a dataset envelope |
| `GET /api/investigations/{id}` | summary plus immutable `snapshot` and saved `view` |
| `PATCH /api/investigations/{id}` | edit `{name, notes}` without changing observations |
| `DELETE /api/investigations/{id}` | delete a pinned investigation |
| `GET /api/cache` | `entries`, `cacheBytes`, `pinnedBytes`, `databaseBytes`; entries include ID, query, fetched time, bytes and event count |
| `GET /api/cache/{id}` | reopen a cached dataset without upstream retrieval; marked unverified/stale |
| `DELETE /api/cache/{id}` | remove one rolling-cache dataset |
| `DELETE /api/cache` | clear the rolling cache, preserving pins |
| `GET /api/history/jobs/{id}` | `id`, `state`, `requests`, `partitions`, `events`, optional `error` |
| `DELETE /api/history/jobs/{id}` | request cancellation; final status reports the outcome |
| `POST /api/quit` | stop the server |

Supply a unique `job` parameter to `/api/history` to track it. IDs use 2-80 ASCII letters, digits, underscores or hyphens. States are `running`, `complete`, `failed`, or `cancelled`. Requests count upstream attempts including retries; partitions count completed leaf intervals, not an estimated total. Status is memory-only, bounded to 32 records; missing jobs return 404. Cancellation after completion does not undo publication.

`/api/history` asks the catalog for a count before partitioning and refuses with a descriptive error when the estimate exceeds the 50,000-event budget, so shared links, retries and direct callers are all guarded without spending the 64-request budget to discover overflow. The estimate is advisory: if the count fails or times out (8 seconds) the retrieval proceeds under the partition and event budgets alone. A successful estimate appears as `expected` in the job's progress record. `/api/history/count` exposes the same estimate on its own; it applies the interval validation `/api/history` applies, takes no historical slot, and its count is reported in the job's `requests`.

Recent threshold feeds are cached, keyed and stored per level, so switching thresholds does not evict the previous one. `all_month` is roughly 8 MiB where `4.5_month` is a few hundred KiB.

Historical RFC3339 offsets are normalized to UTC. Boundaries must have millisecond precision; submillisecond boundaries are rejected, not silently rounded. Saved views separate a committed query from display filters and contain camera, replay, selected event, time zone, nearby constraints and transect settings. Reopening a pin is offline; query reruns are explicit. Snapshot export metadata includes the active transect endpoints and total width. Import validates event fields and verifies the feature checksum when present.

Dataset envelope: `id`, `query`, `fetched` UTC RFC3339, `complete`, `stale`, optional `error`, `data` GeoJSON FeatureCollection. Initial upstream failure returns HTTP 502 with `error`; stale recovery returns HTTP 200 with `stale:true`. Syntactically invalid history inputs return 400. Semantically rejected history currently returns 502 and a descriptive message.

GeoJSON export adds a foreign `metadata` member containing app version, source, dataset ID, exact query, retrieval time, filters, cursor, nearby constraints, display time zone, selected-feature hash and field definitions. All matching records are exported, independent of table pagination. CSV fields: id, magnitude, magnitude_type, place, longitude, latitude, depth_km, time_utc, review_status. Null values are empty CSV cells and JSON null. Metadata companion is JSON. Timeline SVG includes chart title, UTC bins, source/query and filters.
