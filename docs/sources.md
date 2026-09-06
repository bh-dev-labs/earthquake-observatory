# Sources and verification

Checked 2026-09-06 UTC (2026-09-05 local America/Toronto). Original specification carries a UTC September 6 baseline. Documentation review used official USGS pages and upstream software/asset documentation.

## USGS GeoJSON summary feeds
U.S. Geological Survey. [Original source](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php).
Recent observations; longitude, latitude, depth in km and UTC epoch milliseconds.
Verification: 2026-09-06 UTC.

## USGS historical catalog
U.S. Geological Survey. [Original source](https://earthquake.usgs.gov/fdsnws/event/1/).
Historical intervals; at most 20,000 events per request; offsets start at 1.
Verification: 2026-09-06 UTC.

## USGS event details
U.S. Geological Survey. [Original source](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson_detail.php).
Optional event products and observations.
Verification: 2026-09-06 UTC.

## ComCat field definitions
U.S. Geological Survey. [Original source](https://earthquake.usgs.gov/data/comcat/).
Magnitude types, depth, review status, felt reports and intensity.
Verification: 2026-09-06 UTC.

## Magnitude, energy and shaking intensity
U.S. Geological Survey. [Original source](https://www.usgs.gov/programs/earthquake-hazards/earthquake-magnitude-energy-release-and-shaking-intensity).
Magnitude and intensity distinction; illustrative amplitude and approximate energy ratios.
Verification: 2026-09-06 UTC.

## Earthquake depth
U.S. Geological Survey. [Original source](https://www.usgs.gov/faqs/what-depth-do-earthquakes-occur-what-significance-depth).
Shallow, intermediate and deep earthquakes; subduction context.
Verification: 2026-09-06 UTC.

## Natural Earth
Natural Earth contributors; world-atlas 2.0.2. [Original source](https://www.naturalearthdata.com/about/terms-of-use/).
Bundled 1:110 million land, public domain; no tiles or satellite imagery.
Verification: 2026-09-06 UTC.

## PB2002 tectonic boundaries
Peter Bird; Hugo Ahlenius / Nordpil; GeoJSON conversion by csterling. [Original source](https://github.com/fraxen/tectonicplates).
Simplified global boundary lines, PB2002 (2003), conversion 2014. Open Data Commons Attribution License 1.0. Uniform line style; no fault attribution.
Verification: 2026-09-06 UTC.

## D3 geographic projections
Mike Bostock and contributors. [Original source](https://d3js.org/d3-geo).
ISC; spherical rotation, clipping and geographic paths.
Verification: 2026-09-06 UTC.

## Preact
Preact contributors. [Original source](https://preactjs.com).
MIT; interface components.
Verification: 2026-09-06 UTC.

## SQLite for Go
modernc.org contributors. [Original source](https://pkg.go.dev/modernc.org/sqlite).
BSD-3-Clause; portable persistent cache.
Verification: 2026-09-06 UTC.

- earth.json: SHA-256 2516c915867c7baf18ddec727aec46c315541a07cfb3d79a6559b05d5e94eee8
- plates.json: SHA-256 42b3e0876a7e40f133e958ba7ab85f8851b5c693a046fbc3b138e7751863d92a
- demo.geojson: SHA-256 5583d80bda51a78a61c191e2968a36448d3e072b015e17847a20fd36cf3104d7

Historical fixture query: https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=2023-02-06&endtime=2023-02-13&minmagnitude=4&eventtype=earthquake&orderby=time-asc
Retrieved 2026-09-06 UTC; 618 source records. This is real historical observation data, never illustrative/synthetic. Synthetic test events exist only in tests. To reproduce, download the query to web/public/data/demo.geojson, inspect changes and regenerate asset hashes; the mutable catalog may now differ.
Geography: world-atlas 2.0.2 countries-110m.json; land object used. Plates: PB2002_boundaries.json from fraxen/tectonicplates master; exact SHA above pins the bundled version. See plate-source.md and plate-license.md.
Plate boundary coordinates are a coarse global model, with no claimed fault-level precision. Uniform lines deliberately avoid unverified boundary-type interpretation. No map tiles or imagery are bundled.