# Architecture decisions

A single Go process binds to loopback, owns a SQLite cache, and serves embedded production assets. The executable opens the default browser. No runtime Node, Python, remote fonts, tiles, accounts or LLMs are needed. Preact and TypeScript keep view state coordinated; Vite builds the assets. modernc.org/sqlite avoids C toolchains when cross compiling.

The globe uses D3's spherical orthographic projection into Canvas, with real geographic rotation and hemisphere clipping. This is a three-dimensional geographic sphere rendered without WebGL, rather than a perspective terrain mesh. D3 supplies geographic primitives, clipping, distance and graticules; Canvas batches markers. A synchronized equirectangular map uses the same coordinates and data. This deliberately avoids graphics-context and GPU requirements. Natural Earth 110m geography is local and suited to global context, not street-level navigation.

Design follows the supplied image: ocean #e3eef0, land #91adb0, ink #243740, paper #ffffff, panels #f4f6f6, selection #28685d. System humanist sans fonts avoid network requests. Globe and selection panel dominate; activity regions precede the event table. Depth uses a sequential yellow/teal/purple scale with text labels.

API datasets are immutable snapshots identified by SHA-256. SQLite stores original JSON, query, retrieval metadata, and transactional event revisions separately from memberships. Live requests coalesce behind a mutex and share a 60-second cache. Historical queries split at the USGS response cap and publish only after completion. Historical snapshots are repeatable observations of a mutable catalog, not a transactional view of USGS.

Plan: build ingestion/store/API and globe; coordinate filters, areas and replay; complete educational controls and export; test failures, geography and consumer builds; record release gaps explicitly.
