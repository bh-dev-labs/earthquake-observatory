# Astra build prompt: Earthquake Observatory — Interactive Earth

## How to use this prompt

Open your intended project folder in your coding environment, select Astra, and give it this file with the instruction: **“Read this specification and implement the application. Begin with repository inspection and proceed through the release gates.”**

This is a build specification, not evidence that the resulting program is release-ready. Astra must produce and verify the implementation. The default architecture is Go with a browser interface; Python is optional for independent scientific checks, and Rust is reserved for a demonstrated need. You do not need all three languages in one application.

Updated brief: the original program featured a rotatable Earth showing seismic activity. Preserve that central experience and make education a first-class product requirement.

The prompt begins below.

---

## 1. Your assignment

Act as the lead software engineer, scientific visualization designer, and quality reviewer for **Earthquake Observatory**, a professional application for exploring earthquake observations from USGS.

I previously built an earthquake project with a rotatable globe of Earth displaying seismic activity. Preserve and substantially improve that central experience. I want to rebuild it to a standard I could confidently publish and maintain, and I want it to teach people how to understand the observations. I enjoy Go, Rust, and Python. I want a working, polished product with understandable code and documentation, rather than a demonstration or a scaffold.

Build the application in the available workspace. Inspect existing files and repository instructions first. Reuse suitable existing work without overwriting unrelated changes. If no previous implementation is present, start a new project; do not invent details of my old program.

Make reasonable implementation decisions and document them. Ask only questions whose answers would materially change the product or prevent safe progress. Continue through implementation, testing, visual review, and release preparation. Do not stop after a plan or after the first working screen.

Treat “publishable” as an evidence-based release standard: scientific correctness, coherent design, reliable data handling, accessible interactions, reproducible builds, maintainability, and honest operating limits. Prepare the release locally. Public deployment, paid services, and external publication require an explicit request from me.

## 2. Product purpose and boundaries

Help curious people answer:

- Where have earthquakes been recorded recently?
- How do depth and magnitude vary across a selected region?
- What happened during a chosen historical period?
- How does a recorded sequence unfold over time?
- What data and filters support the view I am sharing or exporting?

The signature experience is a genuinely rotatable, zoomable 3D Earth showing seismic activity, coordinated with a timeline, event explorer, and contextual learning panel. The globe is a required scientific navigation surface, not an optional decoration. A synchronized 2D map is an alternate view. Selecting an event in one view highlights it in the others. A historical replay should make a sequence understandable without implying a physical wave simulation.

This is an observational and educational application. It must not predict earthquakes, invent hazard scores, or present itself as an emergency warning service. A brief About statement is sufficient; avoid obstructive warnings throughout the interface.

The coding model helps build the software. Version 1 must operate without runtime LLM calls, model subscriptions, or generated scientific commentary.

## 3. Architecture and language decisions

Default to:

- **Go backend:** upstream data access, validation, caching, persistence, application API, exports, and serving the production frontend.
- **SQLite:** persistent event records, retrieval metadata, and bounded cached datasets. Use migrations and a documented backup/restore approach.
- **TypeScript browser frontend:** choose a maintained framework and mapping/charting libraries after verifying current official documentation. Explain why the choices suit this product. Keep frontend complexity proportional to its actual interactions. Select a maintained globe-capable rendering stack after a short proof of concept for geographic accuracy, point picking, plate overlays, performance, and mobile support. Prefer a library with established geographic primitives over custom globe mathematics. Document asset licenses and whether any service or account is required.
- **Python only if useful:** small independent analysis or fixture-validation tools; it must not be required to run the normal application.
- **Rust only if justified:** do not add a second compiled backend or WebAssembly component without measured benefit.

Prefer a modular monolith and same-origin application API. Avoid microservices, Kubernetes, mandatory cloud accounts, or a queue server for this release. Aim for a compiled Go executable that serves built frontend assets. Verify SQLite driver implications for each target operating system before promising portable binaries.

Use maintained stable dependencies compatible with the actual environment. Pin versions and commit lockfiles. Do not assume remembered version numbers are current. Record consequential decisions in short architecture decision records.

If the workspace mandates another hosting stack, explain the constraint and choose the smallest compatible adaptation before implementing. Preserve the product and scientific requirements.

## 4. Verify the upstream contract

Read the official sources before coding the adapter and record the verification date in `docs/sources.md`:

- [USGS GeoJSON summary feeds](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php)
- [USGS catalog API](https://earthquake.usgs.gov/fdsnws/event/1/)
- [USGS GeoJSON event details](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson_detail.php)
- [ComCat field definitions](https://earthquake.usgs.gov/data/comcat/)

Contract baseline checked on 2026-09-06: use summary feeds for recent activity and catalog queries for historical searches. The catalog currently limits a query to 20,000 events; its offset starts at 1. GeoJSON coordinates are longitude, latitude, depth; timestamps are epoch milliseconds. Reverify these details and error semantics during implementation. Sources: [summary format](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php), [catalog contract](https://earthquake.usgs.gov/fdsnws/event/1/).

Follow source links for detailed products when available. Their presence varies by event; do not fabricate missing material. See the [detail format](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson_detail.php).

If browsing or upstream access is unavailable, implement against attributed fixtures and identify the unverified integration as a release blocker. Do not claim a live check passed.

## 5. Data pipeline and persistence

Create an explicit adapter boundary between upstream payloads and the application model. Preserve optional values as nullable; zero must not stand in for missing magnitude, depth, or counts. Keep the original payload or a content-addressed snapshot sufficient to audit an exported dataset.

Store event identity, source revision time, retrieval time, normalized fields, and provenance. Use idempotent transactional upserts. Prevent an older response from overwriting a newer event revision. Design and document reconciliation for alternate IDs, merged events, and explicit deletions. Absence from a rolling feed alone is not proof of deletion.

Separate the event cache from dataset membership. Each successful retrieval should identify its actual query, covered interval, members, completeness state, and fetch time. A collection of cached events is not proof that an arbitrary requested interval has been fully retrieved.

Implement:

- Timeouts, cancellation, response-size limits, bounded concurrency, retry backoff with jitter, and handling of throttling and transient failures.
- Shared backend polling and request coalescing so every visitor does not initiate an upstream fetch. Use a configurable recent-feed cadence, initially 60 seconds, subject to current provider guidance.
- Conditional requests where supported, sensible cache expiry, and last-known-good results after a failed refresh.
- Separate states for initial loading, refreshing, stale cached results, partial retrieval, no matching events, and actual upstream failure.
- Historical retrieval that cannot silently truncate: use bounded time partitions, deduplicate boundary events, and reconcile requested coverage. Freeze the upper time bound when a search begins. Handle an exceptionally dense partition with a documented fallback or a clear incomplete result.
- Progress and cancellation for larger searches; configurable range, event-count, disk, and execution-time budgets. Explain limits before starting an oversized job.
- Atomic dataset publication: users must not see a half-updated dataset presented as complete.
- An overlap/revalidation strategy for revised historical observations and a stated limit on consistency while the upstream catalog is changing.
- Cache retention and cleanup that preserve datasets explicitly saved for reproducibility, or clearly explain their expiration.

## 6. Required version 1 features

### A. Live explorer

Provide recent-period presets, magnitude and depth ranges, and an explicit geographic filter. Default to earthquake event types and make any broader selection visible.

Use the 3D globe by default, with a synchronized 2D map option, efficient point rendering or clustering, and a documented magnitude-size mapping. Colour by depth using a perceptually ordered, colour-vision-friendly palette. Provide legends, units, cluster counts, and distinct selection styling. Do not use marker size as an unexplained damage or energy estimate.

Keep geographic filtering explicit: a “Search this area” action or visible toggle should determine whether panning changes results. Handle regions crossing the date line. Account for projection limitations near the poles. A table must remain usable when the map or tile provider fails.

Provide a searchable, sortable, keyboard-accessible event table with magnitude/type, location, depth, event time, and review status. Explain whether text search matches loaded event descriptions; do not imply full place-name geocoding.

### A2. Required globe behaviour

Implement drag rotation, wheel/pinch zoom, reset view, north-up reset, and keyboard-accessible rotation/zoom buttons. A selected event should smoothly move into view unless reduced motion is enabled. Stop camera motion on user input. **Auto-rotation is required.** Provide a visible Auto-rotate on/off control next to the globe controls, with a slow, smooth default speed (approximately one revolution every two minutes) and a compact speed adjustment. Start off on first use and remember the user’s chosen setting locally. Rotate around the geographic polar axis while preserving the current viewing latitude and zoom.

Pause rotation immediately when the user drags, pinches, uses camera controls, or selects an earthquake. Keep it paused while event details are being inspected; show a clear “Resume rotation” action rather than unexpectedly restarting it. Camera rotation and historical event playback are separate controls and states. Stop animation when the page is hidden and resume only when appropriate to the existing user state. Honour reduced-motion preferences by starting without rotation or animated camera transitions; allow deliberate opt-in. Use time-based animation for consistent speed across devices, avoid unnecessary rendering when paused, and test that rotation neither changes dataset filters nor disrupts marker selection. Include auto-rotation behaviour in the globe release tests.

Render a restrained Earth surface with recognizable land/ocean geography and optional geographic labels. Use licensed assets that can be bundled for demo mode. Avoid day/night shading that makes events unreadable. Test coordinate placement with known landmarks and events in every hemisphere; verify longitude orientation, poles, and the date line.

Default markers show **epicentre locations at the surface**, with colour indicating source depth. Do not place markers above the Earth in proportion to depth. Hide or properly occlude far-side markers so they cannot appear to belong to the visible hemisphere. Include an explicit “visible hemisphere only” scope if offered; rotating the camera alone must not silently filter the global dataset or change totals. Never cluster events across opposite sides of the planet.

Provide a switchable, sourced tectonic-plate boundary overlay with legend and plate names. Distinguish boundary types only when supported by the chosen dataset. Verify geometry, provenance, redistribution rights, date/version, and geographic resolution; do not trace an illustrative picture and present it as precise geospatial data. State that boundary lines are a simplified model and do not identify the causative fault of every event.

Globe, 2D map, table, replay, charts, and learning activities must share event IDs and filter state. Switching view preserves selection and dataset. Preserve the intended geographic focus as closely as projections allow. Expose the active view and camera state in share links.

Use instancing/batching or the renderer's efficient point primitives rather than thousands of DOM markers. Handle graphics-context loss, unsupported WebGL, and reduced-capability devices with an explanatory 2D/table fallback. Test hit detection at different zoom levels, near the limb, and in dense clusters.

### B. Event details

**Required primary interaction: click or tap seismic activity directly on the globe to learn about that earthquake.** This must work in both free exploration and historical replay, not only through the event table.

Implement the complete selection workflow:

1. Hover on desktop offers a compact preview: magnitude, location, depth, and time. Clicking or tapping selects the event and opens a persistent information panel. Hover must never be the only way to access information.
2. Give the selected marker a clearly visible outline or halo. Preserve selection until the user selects another event or explicitly closes it. Blank-space taps should not accidentally dismiss a panel while rotating the globe.
3. Distinguish a drag from a click using a tested movement threshold. Support touch without accidentally selecting events during a pinch or rotation. Do not select markers hidden behind Earth.
4. When markers overlap, show an accessible event chooser or expand the cluster. List magnitude, place, and time so the user can choose deliberately. A cluster is a group of events, not a single large earthquake; never give it an event magnitude.
5. Open a side panel on desktop and an accessible bottom sheet on mobile. Keep enough of the globe visible to retain geographic context. Provide close/back controls, sensible focus management, and Escape support. Do not rotate or zoom away from the selected region unexpectedly.
6. Show basic cached information immediately, with a separate loading state for additional details. A failed detail request must leave the selected event and basic information intact and offer retry.
7. Highlight the same event in the table, timeline, and depth section wherever it is represented. Pause replay when opening event details and provide an explicit resume action; resuming must not silently close the panel.
8. If refreshed data revises the selected event, preserve selection by identity and indicate that its information changed. If filters exclude it, explain that it is outside the current selection rather than silently changing the event. Handle removed or merged records explicitly.

Organize the panel into readable layers:

- **Overview:** magnitude and magnitude type, location description, event date/time with time zone, depth in kilometres, coordinates, and review status. Show unavailable fields as unavailable.
- **Understand this event:** brief sourced explanations of its reported depth, magnitude type, and review status. Distinguish general education from event-specific interpretation. Do not infer a responsible fault, plate interaction, damage, or aftershock status solely from location.
- **Available observations:** show felt-report count, reported or modelled intensity, and links to available ShakeMap, Did You Feel It?, PAGER, or other appropriate USGS products. Label each product's meaning and source. Do not render a scalar intensity as a geographic shaking map or confuse report count with population affected.
- **Source and freshness:** event ID, source network, source update time, application retrieval time, and a prominent “Open original USGS event” link.
- **Explore further:** copy an event link, centre the globe, or explore nearby observations using a visible, editable radius and time interval. Label nearby events as nearby observations unless a sourced relationship is available.

Any educational interpretation must be deterministic and sourced; selecting an event must not require an LLM call. Add “What does this mean?” help beside technical terms. Keep the first screen concise, with additional scientific fields expandable.

Show the selected event's identifying information, coordinates, depth, magnitude type, source timestamps, review status, and original USGS page. Include available impact-related products with accurate labels and source attribution.

Distinguish magnitude, shaking intensity, and impact estimates. Preserve negative magnitudes and valid negative depths; explain unusual values through sourced help text. A tsunami-related source flag must never become an application-generated warning. Verify terminology against [ComCat definitions](https://earthquake.usgs.gov/data/comcat/).

Load additional detail on demand, cache it, and keep the basic record available if detail retrieval fails. Render all upstream descriptions as untrusted text unless explicitly sanitized.

### C. Historical exploration and replay

Support a custom date interval, explicit time zone, region, and magnitude/depth filters. Include several useful geographic presets with their boundaries visible and documented.

Replay a frozen retrieved dataset using play, pause, seek, restart, and adjustable speed. Provide a visible replay clock. Define cumulative versus trailing-window display clearly; implement at least one coherent mode completely. Event pulses indicate display time only, not seismic wave travel or felt area.

Freeze live updates during historical playback. Define precisely whether charts and counts describe the complete selected dataset or the replay cursor/window, and label that scope. Seeking backward must restore the correct state without duplicates or lingering future events.

### D. Coordinated scientific views

Include event counts over time, a magnitude histogram, and depth versus magnitude. Use one shared filter specification so map, table, charts, and exports agree.

Show sample size, units, time-zone labels, bin definitions, missing-value exclusions, and dataset completeness. Partial time bins must be identifiable. State that observed catalog counts reflect detection/reporting coverage; they are not automatically evidence that underlying seismicity is increasing.

Do not add Gutenberg–Richter fitting, aftershock classification, or energy aggregation to version 1 merely for sophistication. Put them in a future roadmap unless their assumptions, references, and independent validation are implemented. Geographic proximity alone must not label events as aftershocks.

### E. Sharing and exports

Encode validated filters, map view, and selected event in a shareable URL. Convert relative intervals to absolute timestamps when sharing a historical view. Explain that a URL reapplies a query; it is not an immutable record of an evolving catalog.

Export the complete selected dataset, not just a table page, as UTF-8 CSV and GeoJSON. Provide a companion metadata JSON containing filters, time zone, retrieval timestamps, completeness, dataset hash, app version, and field definitions. Export against a frozen dataset revision.

Provide a publication-quality PNG or SVG export for at least the timeline chart, with title, units, source, interval, and applied filters. Verify that its content matches the screen. Map image export is optional until tile permissions and rendering restrictions are resolved.

Protect spreadsheet users from formula injection in text fields and document any export escaping. Preserve numeric meaning and unmodified source text in the canonical machine-readable dataset.

### F. Demonstration mode

Bundle a small attributed historical fixture with retrieval date and a reproducible import command. Mark demo mode persistently and unmistakably; never imply fixture timestamps are live observations.

The fixture, charts, table, and a legally redistributable local map fallback should work without external services. Do not bundle map tiles without permission. Keep synthetic test fixtures separate from the real demonstration dataset.

### G. Education: Explore and Learn

Education is a required part of version 1, integrated into the same real-data experience. Target a curious adult with no seismology background. Offer brief explanations first, with optional deeper detail. Do not require accounts, scoring, or a chatbot.

Provide an **Explore** mode for free investigation and a **Learn** mode containing four complete guided activities. Each activity has one question, a reliable attributed dataset, two to four meaningful interactions, an evidence-based explanation, source links, and a short reflection. Preserve the user's original view when starting an activity and offer a clear return action.

Use the pattern **notice → change something → compare → explain**. Learning steps should actually operate the globe, overlays, replay, or charts. Avoid a slideshow of text laid over an unchanged visualization.

Required activities:

| Activity | User action | Learning outcome and constraint |
|---|---|---|
| Why do earthquakes form belts? | Rotate Earth, then reveal plate boundaries and compare several regions | See the relationship between many earthquake locations and plate boundaries, while retaining intraplate exceptions; do not claim all events occur on boundaries |
| How can an earthquake be deep inside Earth? | Compare a documented subduction region's surface view with a depth cross-section | Distinguish epicentre from hypocentre and inspect depth patterns; do not claim every event is a precisely located point on a plate surface |
| Does larger magnitude mean stronger shaking everywhere? | Compare sourced records/products and adjust an explicitly illustrative magnitude comparison | Distinguish source magnitude from location-dependent intensity; do not calculate local shaking from magnitude alone |
| What changes during an earthquake sequence? | Replay a verified historical interval, pause, and inspect counts over time | Understand temporal clustering and catalog observations; describe aftershock relationships only where independently sourced and do not turn clustering into a prediction |

Use curated, versioned historical snapshots so lessons remain coherent even when the live feed is quiet or unavailable. Identify them as historical lessons. Verify event IDs, periods, and any factual claims; do not invent historical values to make a lesson work. Provide lesson reset and a compact progress indicator. Optional local progress persistence is sufficient.

Implement a linked **depth cross-section** for at least the selected subduction lesson. Show the transect and sampling corridor on the globe/map, plot along-transect distance against depth positive downward, and link plotted points back to events. State corridor width, projection method, and any vertical exaggeration. Use real coordinates, consistent units, and tested point-in-corridor selection. Do not draw a fitted slab or interior structure unless it comes from a separately sourced model. A full transparent globe/cutaway is a future option; the validated cross-section is required now.

Provide a small magnitude comparison tool using a clearly sourced, explicitly approximate relationship for compatible magnitudes. Label assumptions and distinguish relative amplitude from approximate energy. Use illustrative inputs rather than indiscriminately comparing incompatible catalog magnitude types. Avoid sensational comparisons or damage predictions.

Add contextual help for magnitude, magnitude type, depth, epicentre/hypocentre, intensity, review status, and data completeness. Define concepts in plain language with small accurate diagrams where useful. Keep lessons and glossary in structured local content files with source URLs and review dates; explanations should be reviewable without editing application logic.

Suggested starting sources to verify and cite:

- [USGS: tectonic plates](https://www.usgs.gov/media/images/tectonic-plates-earth) — introductory plate/event relationship; find a separate licensed machine-readable boundary dataset.
- [USGS: understanding plate motions](https://pubs.usgs.gov/gip/dynamic/understanding.html) — boundary types and tectonic processes.
- [USGS: earthquake depth](https://www.usgs.gov/faqs/what-depth-do-earthquakes-occur-what-significance-depth) — depth and its physical meaning.
- [USGS: magnitude, energy, and shaking intensity](https://www.usgs.gov/programs/earthquake-hazards/earthquake-magnitude-energy-release-and-shaking-intensity) — distinctions and comparison-tool assumptions.

A lesson passes review only if its observations are reproducible from its bundled dataset, its controls work, its explanation matches the evidence, and it remains usable without the 3D renderer. Record scientific content review separately from code tests. Never describe an unreviewed lesson as expert-validated.

## 7. Visual and interaction standard

### Required author credit

Display an author credit in the production application's footer and About page, including desktop and mobile layouts. It should be readable and understated, not hidden in source comments. The email may be a `mailto:` link. Keep author credit separate from USGS data attribution and third-party asset credits; do not imply institutional or USGS endorsement. Include a release check for the exact visible wording.


Aim for the clarity of a well-designed scientific observatory. The map and data should dominate; decorative cards and oversized metrics should not displace them.

Desktop composition: compact title/status bar; concise filter controls; large globe as the primary surface; adjacent event details or contextual learning panel; timeline and analysis below or in a resizable secondary panel. Mobile composition: deliberate Earth/List/Learn/Analysis navigation, with an accessible filter drawer and event-detail sheet. Keep globe controls usable without trapping page scrolling.

Use restrained typography, consistent spacing, readable numbers, clear selected states, and enough contrast for quiet labels. Depth colours must mean the same thing everywhere. Reserve prominent colour for selection and consequential data states. Avoid constant pulsing, decorative space effects, gradients behind charts, or alarming red for every earthquake. The required globe must remain geographically informative and readable.

Implement keyboard navigation, visible focus, labelled controls, accessible dialogs, non-colour status cues, and reduced-motion support. Target WCAG 2.2 AA and verify applicable requirements against current official guidance. Provide a useful textual equivalent for chart and map information. Never announce every background refresh to screen readers.

Review at approximately 1440px, 1024px, and 390px widths. Check touch interactions and mobile Safari where tooling permits. If unavailable, record the missing verification rather than claiming compatibility. Light and dark themes are optional; one thoroughly polished theme is sufficient for release.

### Required footer references

In the real application's footer, show the author credit alongside a compact **Data & references** group. Keep source links readable on desktop and mobile. Include these directly accessible links:

- **Earthquake data: USGS** — https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
- **Historical catalog** — https://earthquake.usgs.gov/fdsnws/event/1/
- **Earthquake science** — https://www.usgs.gov/programs/earthquake-hazards/earthquake-magnitude-energy-release-and-shaking-intensity
- **Map & globe credits** — an in-app credits section identifying the actual geography, Earth imagery, plate-boundary, and map-tile sources used, with original source links and applicable licenses.
- **All references** — an in-app Sources & References page with the complete scientific and data bibliography.

Create that Sources & References page as a readable public-facing resource, separate from developer documentation. Group entries into earthquake observations, scientific explanations, geographic/imagery assets, and software acknowledgements. For each source record its title, organization/author, original URL, purpose in the program, and verification date; include dataset version and license where applicable. Keep it synchronized with `docs/sources.md` and the structured lesson references through a shared source registry where practical. Verify links during release preparation.

Credit only sources and assets actually used. Do not insert guessed provider credits or imply institutional endorsement. Keep any provider-mandated attribution visible on the globe/map itself in addition to these footer links; a credits page is not a substitute for legally required on-map attribution. Distinguish USGS observations from illustrative demo data in both the active view and its footer. Add release checks for the visible author credit, working footer links, source-page content, and readable mobile wrapping.

## 8. Scientific correctness and reproducibility

Document the units, time conversions, geographic calculations, bin boundaries, null handling, and selection semantics in `docs/scientific-methods.md`. Cite authoritative sources for scientific interpretations. Distinguish an observed measurement, an app calculation, and an explanatory statement.

Use UTC internally and an explicit display-zone setting. Define date-only input semantics and use consistent half-open intervals internally, accounting for upstream boundary behaviour. Test daylight-saving transitions and millisecond precision.

Verify spatial calculations against independently known points, including the antimeridian. Record projection limitations. Do not treat geographic distances as planar screen distances.

Do not imply a magnitude is automatically moment magnitude. Do not translate arbitrary mixed magnitude types into precise energy or destructive power. Label unavailable values accurately and describe catalog coverage limitations where users interpret comparisons.

Every chart and export must trace to an identifiable dataset and filter state. Reproduction from a saved snapshot must be possible without contacting USGS.

## 9. Security, reliability, and operations

Validate application query parameters and use parameterized SQL. Allowlist upstream hosts and validate redirects; do not build an arbitrary URL proxy from source links. Apply request limits and rate limiting to expensive public endpoints. Escape external text, restrict CORS, and configure appropriate HTTP security headers without breaking maps.

Keep secrets out of the repository and browser. Document any map-provider browser token restrictions, usage allowances, attribution, and cost implications. Choose a provider whose terms permit the intended use; free development endpoints are not automatically appropriate for public traffic.

Add structured logs, request IDs, basic operational counters, and liveness/readiness endpoints. Report data freshness separately from process health so an upstream outage does not create restart loops. Implement graceful shutdown and a tested SQLite backup/restore workflow.

Document the initial single-instance deployment model, persistent volume requirements, restart behaviour, and scaling boundary. Do not claim highly available multi-instance support without implementing its storage and scheduler coordination.

Provide an accessible About/Data Sources page, data and map attribution, third-party notices, and a short privacy statement that reflects actual external requests. Do not use official logos or imply USGS endorsement. Propose a source-code license and make any unresolved ownership/license choice explicit before publication.

## 10. Tests and measurable release gates

Build tests around failure risks and user outcomes, not implementation details. Required coverage:

| Area | Evidence required |
|---|---|
| Data parsing | Null values, malformed payloads, coordinate order, units, valid negative values, unknown optional fields |
| Time and filters | Boundaries, display zones, daylight saving, matching map/table/chart/export membership |
| Ingestion | Duplicate IDs, newer/older revisions, rollback on failure, merged/deleted records, rolling-feed expiry |
| Large retrievals | Partition boundaries, limit response, duplicates, cancellation, incomplete coverage, mid-query updates |
| Reliability | Timeout, throttling, upstream error, stale cache, invalid detail response, failed tiles, recovery |
| Replay | Deterministic seek/play/pause, backward seek, equal timestamps, excluded future events |
| Globe | Landmark placement, far-side occlusion, dense-point picking, pole/date-line behaviour, rotation/zoom controls, view switching, graphics fallback |
| Event selection | Click/tap versus drag, overlapping-event chooser, immediate cached details, failed-detail retry, keyboard equivalent, panel focus/close, revised/filtered/merged events, replay pause/resume |
| Education | All four lessons completed end-to-end, sourced content, dataset reproducibility, reset/return behaviour, non-3D equivalent |
| Depth section | Known-point projection, corridor inclusion, depth direction, units/exaggeration labels, linked selection |
| Comparison tool | Independently checked formulas, assumptions, units, illustrative inputs, no invented shaking estimates |
| Exports | Correct full dataset, null handling, escaping, metadata/hash, chart labels and values |
| Accessibility | Automated checks plus manual keyboard/focus review of core workflows |
| End-to-end | Recent view → filters → selection → historical search → replay → export → reopen shared URL |
| Packaging | Fresh install, migrate, start, demo mode, restart, backup/restore, production frontend build |

Use deterministic, small fixtures for automated CI. Keep live-provider checks separate and opt-in so upstream availability cannot make unit tests flaky.

Measure performance on a documented machine/browser with a deterministic 20,000-event stress dataset. Initial targets: cached filtering under 200ms at p95 and common interactions without visible long freezes. Use clustering, indexed queries, and virtualized rows where justified. Measure backend time separately from rendering and upstream latency. Benchmark globe rotation and event picking with the same stress dataset; target at least 30 fps during normal interaction on the documented reference device, using measured adaptive rendering if needed. Include memory behaviour during repeated view changes and lesson resets. If a target fails, fix it or record the measured shortfall; never invent benchmark results.

Run the UI and inspect screenshots. Conduct two explicit review passes: first for scientific/data correctness, then for visual quality and interaction coherence. Fix significant findings and keep a brief review log. A passing build is not visual verification.

## 11. Delivery workflow

Proceed in working increments while retaining the full release goal:

1. Inspect the repository and available tools. Summarize assumptions, select dependencies using official sources, and write the implementation plan and architecture decisions.
2. Build a vertical slice: retrieve or load an attributed dataset, persist it, expose an API, and render a coordinated rotatable globe and list. Run it immediately.
3. Complete filtering, details, historical retrieval, and revision/completeness handling.
4. Complete replay, charts, exports, shareable views, demo mode, and all four guided activities with the linked depth section.
5. Harden accessibility, failure handling, scientific methods, and resource limits.
6. Run meaningful tests and both review passes. Resolve release-blocking findings.
7. Package a local release candidate, document operation, and provide an evidence-backed handoff.

Give concise progress updates explaining outcomes and remaining risks. Maintain `docs/implementation-status.md` with completed work, exact failing commands, decisions, and next actions so another session can resume. Do not silently remove difficult requirements. Mark genuine blockers precisely and complete unaffected work.

Do not claim an external deployment, operating-system test, live data check, accessibility audit, or performance result that you did not execute. Distinguish a configured CI workflow from a workflow that actually ran successfully.

## 12. Required deliverables

Deliver an organized repository with:

- Complete application source, dependency locks, schema migrations, and attributed fixtures.
- README with screenshots, product purpose, exact prerequisites, a short quick start, and troubleshooting.
- Clear Windows PowerShell and macOS/Linux development instructions. Identify which were actually exercised.
- Repeatable commands for development, tests, production build, demo mode, database maintenance, and release packaging.
- CI for formatting, linting/static checks, tests, and builds. Include a dependency vulnerability check with triage of applicable findings.
- Optional container packaging with non-root runtime, persistent storage, and health checks if it improves deployment simplicity.
- `docs/architecture.md`, `docs/scientific-methods.md`, `docs/sources.md`, `docs/operations.md`, and `docs/implementation-status.md`.
- API documentation, export schemas, configuration reference, third-party notices, changelog, and release notes.
- `docs/release-readiness.md` mapping each release gate to actual evidence, known limitations, and unresolved blockers.
- Versioned lesson content, an accessible glossary, attributed plate-boundary/Earth assets, and a record of educational content review.
- A five-minute demonstration script showing globe rotation, an event selection, a guided depth activity, replay, export, and one graceful failure/recovery case.

The final handoff must tell me what works, how to start it, what was verified, where the release candidate is, and what—if anything—still blocks publication. Use plain language and concrete commands.

## 13. Definition of done

The application starts from documented instructions, presents a genuinely rotatable Earth with directly selectable seismic activity and a complete event-information panel, works with real data and an honest offline demonstration, keeps its views consistent, teaches through four functioning guided activities, exports reproducible results, handles failures gracefully, and has a polished interface verified in a running browser.

No placeholder buttons, fabricated observations, silent truncation, unexplained scientific claims, or mandatory unfinished features may remain in the release path. All required version 1 features must be complete or explicitly recorded as publication blockers. Future ideas belong in the roadmap, not in nonfunctional navigation.

Begin now with repository inspection and implementation. Make the product concrete and reviewable before requesting any publication decision.
