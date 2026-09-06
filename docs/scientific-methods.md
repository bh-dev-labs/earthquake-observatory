# Scientific methods and interpretation

## Coordinates and selection

USGS GeoJSON positions are longitude, latitude, source depth (km). Timestamps are UTC epoch milliseconds. Optional values remain null, including missing magnitude/depth. Negative magnitudes and depths are retained. Globe markers represent surface epicentres; source depth affects colour only. Marker radius is clamp(3 + 1.35 × magnitude, 3, 13) pixels, a display mapping without damage/energy meaning. Null magnitude uses 3 pixels; null depth uses grey. Depth bins: <70, [70,300), ≥300 km.

D3 orthographic projection provides spherical rotation, clipping and path resampling. Far-side points are rejected by great-circle angle ≥90° (with a 0.001 rad limb margin). Map is equirectangular: distortion increases toward the poles. The geographic model is a sphere, not terrain or an ellipsoid. North remains upright, with no camera roll. Camera changes do not modify event membership. Canvas click tolerance is 7 CSS pixels of accumulated movement; pinch sequences never select a marker. Overlap chooser is based on screen proximity among visible markers only.

Explicit rectangular filters use inclusive boundaries, with west > east denoting an antimeridian crossing. Area suggestions partition the globe into 20-degree cells; pole cells are shorter. This is an app grouping, not a named tectonic region or hazard classification. Suggested areas ignore the currently selected rectangle so the user can move between areas; the table/globe still use the selected rectangle. Nearby filtering uses spherical distance with radius 6371.0088 km and an explicit symmetric time interval in the currently loaded dataset.

## Time, replay and charts

Historical date inputs mean 00:00 UTC. RFC3339 API offsets are converted to UTC before upstream formatting. Boundaries must have millisecond precision. Internal intervals are [start,end); the USGS inclusive end parameter is end minus 1 ms. History is limited to 31 days, 50,000 events, 64 partition queries and two minutes; retries can add upstream attempts. A 20,000-record response triggers recursive time partitioning. IDs deduplicate partition membership. Dense millisecond partitions fail clearly rather than silently truncating.

Replay is cumulative through an inclusive cursor. Seeking recomputes membership, so future observations disappear when seeking backward. Replay and camera rotation are separate. Camera movement and event selection pause animations. Hidden tabs do not advance either clock. Charts and exports describe the active cursor, not the entire historical period.

Count bins use UTC boundaries: hourly for spans up to three days, six-hourly up to fourteen days, then daily or wider bins to bound long imported spans to approximately 120 bins. First/last bins may be partial. Magnitude histogram bins are [m,m+1), from −2 through 10; missing magnitudes excluded. Depth/magnitude scatter excludes either missing coordinate. No completeness magnitude, aftershock relationship, Gutenberg–Richter fit or energy aggregation is inferred.

## Depth section

The Tonga preset runs from 170°E,22°S to 170°W,22°S with a 400 km total corridor. Users can select other endpoints and widths of 1-2,000 km. Coincident and nearly antipodal endpoints are rejected because they do not define a stable unique arc. For angular distance d and bearing difference θ, cross-track = R asin(sin(d)sin(θ)); along-track = R atan2(sin(d)cos(θ),cos(d)). Include points only within half the width and between endpoints. The globe guide samples this spherical corridor at 65 points per edge; connecting segments remain a display approximation.

The section includes known depths even when magnitude is missing. Depth is positive down; axes include negative depths and scale to the observations. Vertical exaggeration reflects the rendered dimensions and changes with viewport width. This is not fitted slab geometry. Uncertainty appears in the details panel, not as plotted confidence bands.

## Uncertainty and revisions

Available horizontal/depth/magnitude error estimates, azimuthal gap, residual RMS, nearest-station distance and station count appear under **Source uncertainty & quality**. Snapshot fields take precedence. Missing values can be supplemented from current detail or the preferred available origin product and are labelled as current source detail. Such values never alter a pin. Provider estimates do not share a guaranteed confidence level across networks; unavailable is not zero. Missing felt/shaking fields do not establish that no reports or products exist.

Revision comparison matches IDs and returned aliases, comparing magnitude/type, depth, coordinates, origin time, status, description and felt/shaking fields. An absent record is not automatically deleted: queries, export filters and rolling windows can change membership without any catalog revision.

## Magnitude illustration

Magnitude illustration uses 10^(B−A) for amplitude and approximately 10^(1.5(B−A)) for energy, with compatible-scale assumptions. Inputs are illustrative, not automatically drawn from mixed catalog magnitude types. Neither ratio predicts local shaking or impact. Sources are in the shared registry.

## Reproducibility

Dataset IDs are SHA-256(query + newline + original JSON). Saved GeoJSON exports contain exact matching features, filters, replay cursor, retrieval metadata, app version and a SHA-256 of JSON.stringify({type,features}). The raw recent source payload is retained in SQLite; historical partitions are normalized to one deduplicated snapshot. CSV text is quoted and potentially executable spreadsheet text receives a leading apostrophe; numeric negative values remain numeric text. GeoJSON preserves source text.

USGS can revise its catalog during partition retrieval. Newest revision wins within a response collection; this does not establish transactional catalog consistency. Rolling-feed absence never deletes an event as a claim about USGS. Explicit merged/deleted-event reconciliation is a remaining publication gate; the cache retains raw alternate-ID fields and preserves selected missing records as outside the current dataset.
