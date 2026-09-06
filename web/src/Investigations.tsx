import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { memo } from "preact/compat";
import {
  api,
  compareSnapshots,
  readInvestigation,
  type CacheInfo,
  type Investigation,
  type SavedInvestigation,
} from "./revisions";
import { errorMessage, parseDataset, type Query, type View } from "./data";
import { csvCell, download, type Dataset } from "./model";

const bytes = (value: number) => (value / 1048576).toFixed(2) + " MiB";
const shown = (value: string | number | null, field: string) =>
  value == null
    ? "Unavailable"
    : field === "Origin time"
      ? new Date(value).toISOString()
      : String(value);

function InvestigationsView({
  dataset,
  getView,
  disabled,
  onOpen,
  onRun,
}: {
  dataset: Dataset | null;
  getView: () => View;
  disabled: boolean;
  onOpen: (dataset: Dataset, view: View) => void;
  onRun: (query: Query, view: View) => void;
}) {
  const [items, setItems] = useState<Investigation[]>([]);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState<SavedInvestigation | null>(null);
  const [cache, setCache] = useState<CacheInfo | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [compare, setCompare] = useState(false);
  const [page, setPage] = useState(0);
  const [kind, setKind] = useState("changed");
  const selection = useRef(0);
  async function refresh() {
    setItems(await api<Investigation[]>("/api/investigations"));
  }
  useEffect(() => {
    void refresh().catch((reason) => setError(errorMessage(reason)));
  }, []);
  async function action(work: () => Promise<void>) {
    setWorking(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setWorking(false);
    }
  }
  async function choose(id: string) {
    const ticket = ++selection.current;
    setSelected(id);
    setSaved(null);
    setCompare(false);
    setPage(0);
    const summary = items.find((item) => item.id === id);
    setName(summary?.name ?? "");
    setNotes(summary?.notes ?? "");
    if (!id) return;
    try {
      const next = await readInvestigation(id);
      if (ticket === selection.current) setSaved(next);
    } catch (reason) {
      if (ticket === selection.current) setError(errorMessage(reason));
    }
  }
  const differences = useMemo(
    () =>
      saved && dataset
        ? compareSnapshots(saved.snapshot.data.features, dataset.data.features)
        : null,
    [saved, dataset],
  );
  const rows = useMemo(
    () =>
      !differences
        ? []
        : kind === "changed"
          ? differences.changed.map((revision) => ({
              id: revision.after.id,
              place: revision.after.properties.place,
              changes: revision.changes
                .map(
                  (change) =>
                    `${change.field}: ${shown(change.before, change.field)} -> ${shown(change.after, change.field)}`,
                )
                .join("; "),
            }))
          : (kind === "added" ? differences.added : differences.missing).map(
              (event) => ({
                id: event.id,
                place: event.properties.place,
                changes:
                  kind === "added"
                    ? "Present only in current dataset"
                    : "Absent from current dataset; not evidence of deletion",
              }),
            ),
    [differences, kind],
  );
  const currentPage = Math.max(
    0,
    Math.min(page, Math.ceil(rows.length / 40) - 1),
  );
  const blocked = disabled || working;
  return (
    <section class="investigations" aria-label="Saved investigations">
      <div class="section-heading">
        <h2>Saved investigations</h2>
        <button disabled={working} onClick={() => void action(refresh)}>
          Refresh list
        </button>
      </div>
      {error && (
        <p role="alert" class="notice error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" class="notice">
          {message}
        </p>
      )}
      <div class="investigation-grid">
        <label>
          Investigation
          <select
            aria-label="Investigation"
            value={selected}
            disabled={working}
            onChange={(event) => void choose(event.currentTarget.value)}
          >
            <option value="">New investigation</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Name
          <input
            value={name}
            maxLength={120}
            onInput={(event) => setName(event.currentTarget.value)}
          />
        </label>
        <label class="investigation-notes">
          Notes
          <textarea
            rows={2}
            value={notes}
            maxLength={10000}
            onInput={(event) => setNotes(event.currentTarget.value)}
          />
        </label>
      </div>
      <div class="button-row">
        <button
          disabled={blocked || !dataset || !name.trim()}
          onClick={() =>
            void action(async () => {
              const result = await api<SavedInvestigation>(
                "/api/investigations",
                "POST",
                { name, notes, view: getView(), snapshot: dataset },
              );
              await refresh();
              setSelected(result.id);
              setSaved(result);
              setCompare(false);
              setMessage("Snapshot pinned. Notes and view saved locally.");
            })
          }
        >
          Pin current snapshot
        </button>
        <button
          disabled={blocked || !saved || !name.trim()}
          onClick={() =>
            void action(async () => {
              await api("/api/investigations/" + selected, "PATCH", {
                name,
                notes,
              });
              await refresh();
              setSaved((previous) =>
                previous ? { ...previous, name, notes } : null,
              );
              setMessage("Notes saved; pinned observations unchanged.");
            })
          }
        >
          Save name & notes
        </button>
        <button
          disabled={blocked || !saved}
          onClick={() => saved && onOpen(saved.snapshot, saved.view)}
        >
          Reopen pinned snapshot
        </button>
        <button
          disabled={blocked || !saved || saved.view.query.mode === "snapshot"}
          onClick={() => saved && onRun(saved.view.query, saved.view)}
        >
          Run saved query
        </button>
        <button
          disabled={blocked || !saved || !dataset}
          aria-pressed={compare}
          onClick={() => {
            setCompare(!compare);
            setPage(0);
          }}
        >
          Compare revisions
        </button>
        <button
          disabled={blocked || !saved}
          onClick={() => {
            if (!confirm("Delete this pinned investigation and its notes?"))
              return;
            void action(async () => {
              await api("/api/investigations/" + selected, "DELETE");
              await refresh();
              await choose("");
              setMessage("Investigation deleted.");
            });
          }}
        >
          Delete investigation
        </button>
      </div>
      {saved && (
        <p class="muted">
          Pinned {new Date(saved.created).toLocaleString()} ·{" "}
          {saved.snapshot.data.features.length} observations ·{" "}
          {bytes(saved.bytes)} · {saved.snapshot.query}
        </p>
      )}
      {compare && differences && saved && dataset && (
        <div class="revision-comparison">
          <h3>Revisions: {saved.name} to current dataset</h3>
          <p>
            {differences.changed.length} changed · {differences.added.length}{" "}
            added · {differences.missing.length} absent. Absence does not
            establish catalog deletion.
          </p>
          {saved.snapshot.query !== dataset.query && (
            <p class="notice">
              These datasets use different source queries. Membership changes
              can reflect their coverage.
            </p>
          )}
          <label>
            Changes
            <select
              value={kind}
              onChange={(event) => {
                setKind(event.currentTarget.value);
                setPage(0);
              }}
            >
              <option value="changed">Revised observations</option>
              <option value="added">Added observations</option>
              <option value="missing">Absent observations</option>
            </select>
          </label>
          <div class="table-wrap">
            <table>
              <caption class="sr-only">Revision comparison</caption>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Location</th>
                  <th>Changes</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice(currentPage * 40, currentPage * 40 + 40)
                  .map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>{row.place}</td>
                      <td>{row.changes}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!rows.length && <p>No observations in this category.</p>}
          <div class="button-row">
            <button
              disabled={!currentPage}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous revisions
            </button>
            <span>
              Page {currentPage + 1} of{" "}
              {Math.max(1, Math.ceil(rows.length / 40))}
            </span>
            <button
              disabled={(currentPage + 1) * 40 >= rows.length}
              onClick={() => setPage(currentPage + 1)}
            >
              Next revisions
            </button>
            <button
              onClick={() =>
                download(
                  "revision-comparison.csv",
                  [
                    ["event", "location", "changes"],
                    ...rows.map((row) => [row.id, row.place, row.changes]),
                  ]
                    .map((row) => row.map(csvCell).join(","))
                    .join("\r\n"),
                  "text/csv;charset=utf-8",
                )
              }
            >
              Export comparison CSV
            </button>
          </div>
        </div>
      )}
      <details
        class="cache-manager"
        onToggle={(event) => {
          if (event.currentTarget.open)
            void api<CacheInfo>("/api/cache")
              .then(setCache)
              .catch((reason) => setError(errorMessage(reason)));
        }}
      >
        <summary>Local cache</summary>
        <div class="button-row">
          <button
            disabled={working}
            onClick={() =>
              void action(async () =>
                setCache(await api<CacheInfo>("/api/cache")),
              )
            }
          >
            Refresh cache
          </button>
          <button
            disabled={blocked || !cache?.entries.length}
            onClick={() => {
              if (
                !confirm(
                  "Clear the rolling cache? Pinned investigations remain saved.",
                )
              )
                return;
              void action(async () => {
                await api("/api/cache", "DELETE");
                setCache(await api<CacheInfo>("/api/cache"));
                setMessage(
                  "Rolling cache cleared. Pinned investigations retained.",
                );
              });
            }}
          >
            Clear rolling cache
          </button>
        </div>
        {cache && (
          <>
            <p>
              {cache.entries.length} cached datasets · {bytes(cache.cacheBytes)}{" "}
              cache · {bytes(cache.pinnedBytes)} pinned ·{" "}
              {bytes(cache.databaseBytes)} allocated database pages
            </p>
            <div class="table-wrap">
              <table>
                <caption class="sr-only">Cached datasets</caption>
                <thead>
                  <tr>
                    <th>Query</th>
                    <th>Retrieved</th>
                    <th>Events</th>
                    <th>Size</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cache.entries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.query}</td>
                      <td>{new Date(entry.fetched).toLocaleString()}</td>
                      <td>{entry.events}</td>
                      <td>{bytes(entry.bytes)}</td>
                      <td>
                        <button
                          disabled={blocked}
                          onClick={() =>
                            void action(async () => {
                              const next = parseDataset(
                                await api("/api/cache/" + entry.id),
                              );
                              onOpen(next, {
                                ...getView(),
                                mode: "snapshot",
                                query: { mode: "snapshot" },
                                selected: undefined,
                                cursor: null,
                                near: null,
                              });
                            })
                          }
                        >
                          Open cached snapshot
                        </button>
                        <button
                          disabled={blocked}
                          onClick={() => {
                            if (!confirm("Remove this cached dataset?")) return;
                            void action(async () => {
                              await api("/api/cache/" + entry.id, "DELETE");
                              setCache(await api<CacheInfo>("/api/cache"));
                            });
                          }}
                        >
                          Remove cache entry
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </details>
    </section>
  );
}
export const Investigations = memo(InvestigationsView);
