# Operations and configuration

One local process, one user, one SQLite database. This is not a public multi-instance deployment. HTTP Host and cross-site checks restrict browser access to loopback; only same-origin scripts, assets and fetches are allowed by CSP. No arbitrary URL proxy, analytics or runtime model calls exist.

Flags: `-addr` (default 127.0.0.1:8787), `-data-dir` (default OS user config/EarthquakeObservatory), `-demo`, `-no-browser`, `-backup PATH`, `-check-db`.

Recent requests share a 60-second cached response and serialize refreshes. The browser requests refresh each minute when visible, outside history/replay/inspection. Backend concurrency is bounded at four upstream requests, with one historical job. HTTP timeout 30 seconds, retries up to three with jitter for transient/throttling responses, 32 MiB response cap. Conditional validators are retained in a bounded memory cache. Event detail cache expires after five minutes. The last good recent dataset survives an upstream error and is clearly stale. A historical job publishes atomically only on success; browser cancellation cancels its request context.

SQLite schema versions 1 and 2 are installed idempotently on startup. Version 2 adds investigations without rewriting existing cache data. Transactional upserts refuse older event revisions. Cache retention: latest 40 datasets; unreferenced events/members are removed. Investigations store immutable dataset envelopes and views separately, with editable names and notes. At most 20 investigations and 200 MiB of pinned snapshot data are retained; delete an existing pin before adding another when either limit is reached. Export files do not expire automatically. SQLite reuses freed pages but does not automatically shrink its file.

Reopened snapshots do not auto-refresh; rerunning the saved query is explicit. Frontend detail entries expire after five minutes, invalidate when an event's update timestamp changes, and are capped at 32. Historical jobs expose actual upstream attempts, completed leaf partitions and collected events. Cancellation aborts the browser request and requests server cancellation. At most 32 job records are retained in memory, evicting finished records first.

**Local cache** reports cached payload bytes, pinned payload bytes and allocated database pages, not total filesystem usage including WAL/journal overhead. Clearing the rolling cache also clears the server response cache but preserves pins and the current browser view. Delete pins separately. Names are limited to 120 UTF-8 bytes, notes to 10,000 bytes, views to 64 KiB, and snapshots to 40 MiB/50,000 events. Pinned investigations are capped at 20 entries and 200 MiB of snapshot payloads.

Mutation endpoints require matching `Origin` and `Sec-Fetch-Site: same-origin` headers. Investigation JSON requests are capped at 42 MiB. These checks are not authentication for public hosting. Notes are local and not encrypted by the application. Backups include investigations and notes.

## Backup and restore

With the app running or stopped, invoke the packaged binary with the same data directory:

```sh
earthquake-observatory -data-dir ./data -backup ./observatory-backup.db
```

`VACUUM INTO` creates a consistent standalone backup and refuses to replace an existing file. To restore, stop every instance using the target directory. Create a **new empty directory**, copy the backup there as `observatory.db`, and start with `-data-dir` pointing to that directory. Never mix an old WAL/SHM with a replacement database.

```sh
mkdir restored-data
cp observatory-backup.db restored-data/observatory.db
earthquake-observatory -data-dir ./restored-data -check-db
earthquake-observatory -data-dir ./restored-data
```

PowerShell uses `New-Item -ItemType Directory restored-data` and `Copy-Item observatory-backup.db restored-data/observatory.db`.

`/api/health` reports process health; data freshness belongs to each response and does not trigger restart loops. `/api/ready` checks SQLite. Logs include startup URL/data location; responses include request IDs. Shutdown handles Ctrl+C with a five-second drain. A loopback bind failure reports the existing URL and an alternate-port option.
