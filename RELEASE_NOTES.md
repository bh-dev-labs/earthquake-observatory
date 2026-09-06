# 0.1.0 — local release candidate

New Go application with embedded Preact/TypeScript frontend and SQLite persistence. Includes rotatable geographic globe and flat map, direct event selection, current activity cells, filters, event details, historical queries, replay, charts, four guided activities, linked Tonga section, magnitude illustration, exports, snapshot import and references.

Packages target macOS Apple silicon, macOS Intel and Windows 11 x64. No runtime Go/Node installation is needed. Public publication is not claimed: see docs/release-readiness.md for executed evidence and unresolved gates, including operating-system validation and code signing.

Refreshed 2026-09-06 after PR #1 merged: optional country names, compact event sidebar, responsive layouts, historical progress and cancellation, source uncertainty, custom transects, snapshot validation, stable snapshot identity and request supersession fixes. The Saved investigations panel was removed; existing database records are retained. See docs/review-2026-09-06.md for current verification.
