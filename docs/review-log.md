# Review log

## Pass 1 — scientific and data correctness

Reviewed coordinate order, UTC milliseconds, null/negative values, depth colour bins, epicentre semantics, clipping, antimeridian regions, source revision ordering, immutable exports, partition boundaries, cumulative replay and sourced explanations. Tests independently check landmark orientations, distances, corridor membership and comparison ratios. Corrected cached-fetch freshness and section scale annotation. USGS live recent retrieval succeeded. The bundled historical query contains 618 real events; eight candidates lie near the Tonga transect before exact corridor filtering. No expert validation is claimed.

## Pass 2 — visual and interaction coherence

Viewed running Chromium screenshots at desktop and phone widths. Globe is the dominant surface, with a restrained land/ocean palette and persistent event information. Region cards and event table remain usable on narrow screens without page-level overflow. Added mobile details sheet and desktop selection scrolling. Automated axe found one count-label contrast issue, then corrected it. Verified direct globe selection, drag rejection, explicit rotation resume, shared selection and offline detail preservation. Final automated results are recorded separately; screenshots are evidence of rendered appearance, not proof of Safari/Windows compatibility.
