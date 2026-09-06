export const sources = [
  {
    group: "Earthquake observations",
    title: "USGS GeoJSON summary feeds",
    author: "U.S. Geological Survey",
    url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php",
    purpose:
      "Recent observations; longitude, latitude, depth in km and UTC epoch milliseconds.",
  },
  {
    group: "Earthquake observations",
    title: "USGS historical catalog",
    author: "U.S. Geological Survey",
    url: "https://earthquake.usgs.gov/fdsnws/event/1/",
    purpose:
      "Historical intervals; at most 20,000 events per request; offsets start at 1.",
  },
  {
    group: "Earthquake observations",
    title: "USGS event details",
    author: "U.S. Geological Survey",
    url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson_detail.php",
    purpose: "Optional event products and observations.",
  },
  {
    group: "Scientific explanations",
    title: "ComCat field definitions",
    author: "U.S. Geological Survey",
    url: "https://earthquake.usgs.gov/data/comcat/",
    purpose:
      "Magnitude types, depth, review status, felt reports and intensity.",
  },
  {
    group: "Scientific explanations",
    title: "Magnitude, energy and shaking intensity",
    author: "U.S. Geological Survey",
    url: "https://www.usgs.gov/programs/earthquake-hazards/earthquake-magnitude-energy-release-and-shaking-intensity",
    purpose:
      "Magnitude and intensity distinction; illustrative amplitude and approximate energy ratios.",
  },
  {
    group: "Scientific explanations",
    title: "Earthquake depth",
    author: "U.S. Geological Survey",
    url: "https://www.usgs.gov/faqs/what-depth-do-earthquakes-occur-what-significance-depth",
    purpose: "Shallow, intermediate and deep earthquakes; subduction context.",
  },
  {
    group: "Geographic assets",
    title: "Natural Earth",
    author: "Natural Earth contributors; world-atlas 2.0.2",
    url: "https://www.naturalearthdata.com/about/terms-of-use/",
    purpose:
      "Bundled 1:110 million land, public domain; no tiles or satellite imagery.",
  },
  {
    group: "Geographic assets",
    title: "PB2002 tectonic boundaries",
    author:
      "Peter Bird; Hugo Ahlenius / Nordpil; GeoJSON conversion by csterling",
    url: "https://github.com/fraxen/tectonicplates",
    purpose:
      "Simplified global boundary lines, PB2002 (2003), conversion 2014. Open Data Commons Attribution License 1.0. Uniform line style; no fault attribution.",
  },
  {
    group: "Software",
    title: "D3 geographic projections",
    author: "Mike Bostock and contributors",
    url: "https://d3js.org/d3-geo",
    purpose: "ISC; spherical rotation, clipping and geographic paths.",
  },
  {
    group: "Software",
    title: "Preact",
    author: "Preact contributors",
    url: "https://preactjs.com",
    purpose: "MIT; interface components.",
  },
  {
    group: "Software",
    title: "SQLite for Go",
    author: "modernc.org contributors",
    url: "https://pkg.go.dev/modernc.org/sqlite",
    purpose: "BSD-3-Clause; portable persistent cache.",
  },
].map((x) => ({ ...x, verified: "2026-09-06 UTC" }));
export const glossary = [
  [
    "Magnitude",
    "A measure of earthquake size at its source. The reported magnitude type identifies how it was estimated; not every value is moment magnitude.",
  ],
  [
    "Depth",
    "Source depth below the reference surface, in kilometres. Negative depths can reflect reference elevation or location uncertainty; they are not silently set to zero.",
  ],
  [
    "Epicentre and hypocentre",
    "The hypocentre is the source location inside Earth. The epicentre is its surface location. Globe markers show epicentres; marker colour represents depth.",
  ],
  [
    "Intensity",
    "Shaking at a particular location. Intensity varies with distance, depth and local conditions; magnitude alone does not give local shaking.",
  ],
  [
    "Review status",
    "Automatic solutions may be revised. Reviewed means a human analyst has reviewed the solution; it does not mean uncertainty is zero.",
  ],
  [
    "Completeness",
    "A completed retrieval covers its stated query, not every physical earthquake. Detection and reporting vary geographically and through time.",
  ],
];
export const lessons = [
  {
    title: "Why do earthquakes form belts?",
    question: "Where do recorded earthquakes align with plate boundaries?",
    steps: [
      "Rotate the historical Earth and notice the event pattern.",
      "Reveal boundaries and compare Japan, the Andes and the Pacific.",
      "Select an event away from a boundary and compare its context.",
    ],
    explain:
      "Many earthquakes concentrate near plate boundaries, while some occur within plates. These simplified lines describe a global model, not the responsible fault of each event.",
    reflection:
      "What can the boundary overlay explain, and what can it not tell you about one earthquake?",
    source: 7,
  },
  {
    title: "How can an earthquake be deep inside Earth?",
    question: "Do epicentres show how deep an earthquake starts?",
    steps: [
      "Focus on Tonga & Fiji in the historical snapshot.",
      "Open the depth section; select both a shallow and a deep observation.",
      "Compare their surface markers with their depths below the surface.",
    ],
    explain:
      "Subducting lithosphere can host earthquakes hundreds of kilometres deep. The surface marker is the epicentre. This section shows reported source locations and does not fit or infer a slab.",
    reflection:
      "Why can two nearby surface markers have very different source depths?",
    source: 5,
  },
  {
    title: "Does larger magnitude mean stronger shaking everywhere?",
    question: "How does source size differ from shaking at a place?",
    steps: [
      "Select a historical event and inspect its reported magnitude type.",
      "Open available USGS observations and look for intensity or felt reports.",
      "Adjust the illustrative magnitude comparison below.",
    ],
    explain:
      "Magnitude describes source size; intensity describes shaking at a location. Approximate energy and amplitude ratios do not predict damage or local shaking. Product availability differs between records.",
    reflection:
      "What other information would you need to compare shaking at two places?",
    source: 4,
  },
  {
    title: "What changes during an earthquake sequence?",
    question: "Are observations evenly spaced through this historical week?",
    steps: [
      "Focus on Türkiye & Syria and restart replay at the beginning.",
      "Play, pause and compare the daily counts.",
      "Select an event, then seek backward to compare the visible observations.",
    ],
    explain:
      "The February 6–12, 2023 catalog contains temporal clustering. Counts describe recorded events in this query; proximity and timing alone do not establish aftershock relationships or predict future events.",
    reflection: "What changes when you raise the minimum magnitude?",
    source: 1,
  },
];
