# Local API and export schema

All endpoints are GET, same-origin JSON except static assets. Version 0.1.0.

| Endpoint | Result |
|---|---|
| `/api/health` | process status and version |
| `/api/ready` | database readiness |
| `/api/config` | default demo preference |
| `/api/recent?period=hour|day|week|month` | complete recent feed or last-good stale snapshot |
| `/api/demo` | embedded historical observations |
| `/api/history?start=RFC3339&end=RFC3339&min=-2` | atomic half-open historical query; documented budgets apply |
| `/api/detail/{USGS-event-id}` | allowlisted USGS GeoJSON event details |

Dataset envelope: `id`, `query`, `fetched` UTC RFC3339, `complete`, `stale`, optional `error`, `data` GeoJSON FeatureCollection. Initial upstream failure returns HTTP 502 with `error`; stale recovery returns HTTP 200 with `stale:true`. Syntactically invalid history inputs return 400. Semantically rejected history currently returns 502 and a descriptive message.

GeoJSON export adds a foreign `metadata` member containing app version, source, dataset ID, exact query, retrieval time, filters, cursor, nearby constraints, display time zone, selected-feature hash and field definitions. All matching records are exported, independent of table pagination. CSV fields: id, magnitude, magnitude_type, place, longitude, latitude, depth_km, time_utc, review_status. Null values are empty CSV cells and JSON null. Metadata companion is JSON. Timeline SVG includes chart title, UTC bins, source/query and filters.
