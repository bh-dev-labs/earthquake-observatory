# 0.2.0 — local release candidate

New Go application with embedded Preact/TypeScript frontend and SQLite persistence. Includes rotatable geographic globe and flat map, direct event selection, current activity cells, filters, event details, historical queries, replay, charts, four guided activities, linked Tonga section, magnitude illustration, exports, snapshot import and references.

Packages target macOS Apple silicon, macOS Intel and Windows 11 x64. No runtime Go/Node installation is needed. Public publication is not claimed: see docs/release-readiness.md for executed evidence and unresolved gates, including operating-system validation and code signing.

Refreshed 2026-09-06 after PR #1 merged: optional country names, compact event sidebar, responsive layouts, historical progress and cancellation, source uncertainty, custom transects, snapshot validation, stable snapshot identity and request supersession fixes. The Saved investigations panel was removed; existing database records are retained. See docs/review-2026-09-06.md for current verification.

0.2.0: recent periods can be loaded at any USGS magnitude threshold (all, M1.0+, M2.5+, M4.5+, significant) through a Detail control that travels in shared links; historical retrievals obtain a catalog size estimate first and refuse an interval over the 50,000-event budget before partitioning; browser regression checks repaired. See CHANGELOG.md.

Country-label refresh: cached text images move at fractional pixel positions, smaller countries participate in geographic spacing, and zoom fades names in without displacing existing labels. Verified with 27 frontend tests, Go tests/vet, rotation and responsive browser checks, and a freshly extracted Apple Silicon package. Intel macOS and Windows runtime testing remain outstanding.
