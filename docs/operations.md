# Operations and configuration

One local process, one user, one SQLite database. This is not a public multi-instance deployment. HTTP Host and cross-site checks restrict browser access to loopback; only same-origin scripts, assets and fetches are allowed by CSP. No arbitrary URL proxy, analytics or runtime model calls exist.

Flags: `-addr` (default 127.0.0.1:8787), `-data-dir` (default OS user config/EarthquakeObservatory), `-demo`, `-no-browser`, `-backup PATH`, `-check-db`.

Recent requests share a 60-second cached response and serialize refreshes. The browser requests refresh each minute when visible, outside history/replay/inspection. Backend concurrency is bounded at four upstream requests, with one historical job. HTTP timeout 30 seconds, retries up to three with jitter for transient/throttling responses, 32 MiB response cap. Conditional validators are retained in a bounded memory cache. Event detail cache expires after five minutes. The last good recent dataset survives an upstream error and is clearly stale. A historical job publishes atomically only on success; browser cancellation cancels its request context.

SQLite migration 1 is idempotent on startup (see store.go). Transactional upserts refuse older event revisions. Cache retention: latest 40 datasets; unreferenced events/members are removed. Export files are user-owned and never expired by the application. SQLite can reuse freed pages; it does not automatically shrink its file. No hard disk-byte budget is implemented yet.

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
