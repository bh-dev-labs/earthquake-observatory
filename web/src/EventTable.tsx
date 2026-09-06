import { memo } from "preact/compat";
import {
  color,
  defaults,
  regions,
  timeZoneGroups,
  zoneLabel,
  zoneOffset,
  type Event,
  type Filters,
  type Region,
} from "./model";

type Props = {
  filtered: Event[];
  ordered: Event[];
  zone: string;
  setZone: (v: string) => void;
  filters: Filters;
  change: (key: keyof Filters, value: unknown) => void;
  custom: boolean;
  focusRegion: (r: Region) => void;
  setFilters: (f: Filters) => void;
  setNear: (v: boolean) => void;
  sort: string;
  descending: boolean;
  sortBy: (key: any) => void;
  selectedId: string;
  choose: (e: Event) => void;
  displayTime: (t: number) => string;
  page: number;
  setPage: (n: number) => void;
  hasDataset: boolean;
  exportData: (kind: string) => void;
  importSnapshot: (file: File) => void;
};

const fmt = (v: number | null | undefined, digits = 1) =>
  v == null ? "Unavailable" : v.toFixed(digits);
// Built once: the zone list and its offsets do not change while the page is open.
const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const zoneGroups = timeZoneGroups();

function EventTableView({
  filtered,
  ordered,
  zone,
  setZone,
  filters,
  change,
  custom,
  focusRegion,
  setFilters,
  setNear,
  sort,
  descending,
  sortBy,
  selectedId,
  choose,
  displayTime,
  page,
  setPage,
  hasDataset,
  exportData,
  importSnapshot,
}: Props) {
  return (
    <section id="events" class="events">
      <div class="section-heading">
        <h2>
          Event explorer <span class="count">{filtered.length}</span>
        </h2>
        <label>
          Display time zone{" "}
          <select value={zone} onChange={(e) => setZone(e.currentTarget.value)}>
            <option value="UTC">UTC — catalog standard</option>
            <option value={localZone}>
              Local · {localZone.replace(/_/g, " ")} ({zoneOffset(localZone)})
            </option>
            {zoneGroups.map(([region, zones]) => (
              <optgroup key={region} label={region}>
                {zones.map((z) => (
                  <option key={z.value} value={z.value}>
                    {z.label} ({zoneOffset(z.value)})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      <div class="table-filters">
        <label>
          Search loaded descriptions{" "}
          <input
            type="search"
            placeholder="e.g. Japan"
            value={filters.text}
            onInput={(e) => change("text", e.currentTarget.value)}
          />
        </label>
        <div
          class="range-field"
          role="group"
          aria-label="Depth range in kilometres"
        >
          <span class="range-label">Depth (km)</span>
          <label>
            from{" "}
            <input
              type="number"
              placeholder="Any"
              value={filters.depthMin}
              onInput={(e) => change("depthMin", e.currentTarget.value)}
            />
          </label>
          <label>
            to{" "}
            <input
              type="number"
              placeholder="Any"
              value={filters.depthMax}
              onInput={(e) => change("depthMax", e.currentTarget.value)}
            />
          </label>
        </div>
        <label>
          Region preset{" "}
          <select
            value={
              custom
                ? -2
                : filters.region
                  ? regions.findIndex((r) => r.name === filters.region!.name)
                  : -1
            }
            onChange={(e) => {
              const i = +e.currentTarget.value;
              if (i >= 0) focusRegion(regions[i]);
              else change("region", null);
            }}
          >
            <option value="-1">Global — every region</option>
            {custom && (
              <option value={-2} disabled>
                {filters.region!.name} (set on the map)
              </option>
            )}
            {regions.map((r, i) => (
              <option key={r.name} value={i}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            setFilters({ ...defaults });
            setNear(false);
          }}
        >
          Clear filters
        </button>
      </div>
      <details>
        <summary>
          Explicit geographic bounds{" "}
          {filters.region ? "— " + filters.region.name : ""}
        </summary>
        <p>
          Longitude west greater than east crosses the date line. Panning never
          changes this filter.
        </p>
        <div class="button-row">
          {(["west", "east", "south", "north"] as const).map((key) => (
            <label key={key}>
              {key}{" "}
              <input
                type="number"
                min={key === "west" || key === "east" ? -180 : -90}
                max={key === "west" || key === "east" ? 180 : 90}
                value={
                  filters.region?.[key] ??
                  { west: -180, east: 180, south: -90, north: 90 }[key]
                }
                onChange={(e) => {
                  const limit = key === "west" || key === "east" ? 180 : 90;
                  change("region", {
                    ...(filters.region || {
                      name: "Custom bounds",
                      west: -180,
                      east: 180,
                      south: -90,
                      north: 90,
                    }),
                    name: "Custom bounds",
                    [key]: Math.max(
                      -limit,
                      Math.min(limit, +e.currentTarget.value),
                    ),
                  });
                }}
              />
            </label>
          ))}
        </div>
      </details>
      {filters.region && (
        <p class="filter-note">
          Region filter: {filters.region.name} · W {filters.region.west}°, E{" "}
          {filters.region.east}°, S {filters.region.south}°, N{" "}
          {filters.region.north}°{" "}
          <button onClick={() => change("region", null)}>Clear region</button>
        </p>
      )}
      <div class="table-wrap">
        <table>
          <caption class="sr-only">
            Earthquakes matching all active filters and replay time
          </caption>
          <thead>
            <tr>
              {(
                [
                  ["mag", "Magnitude / type"],
                  ["place", "Location"],
                  ["depth", "Depth"],
                  ["time", `Time · ${zoneLabel(zone)}`],
                  ["status", "Review"],
                ] as const
              ).map(([key, label]) => (
                <th
                  key={key}
                  aria-sort={
                    sort !== key
                      ? "none"
                      : descending
                        ? "descending"
                        : "ascending"
                  }
                >
                  <button
                    class="sort-header"
                    onClick={() => sortBy(key)}
                    title={`Sort by ${label}`}
                  >
                    {label}
                    <span aria-hidden="true">
                      {sort !== key ? "↕" : descending ? "↓" : "↑"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordered.slice(page * 40, page * 40 + 40).map((e) => (
              <tr key={e.id} class={selectedId === e.id ? "selected" : ""}>
                <td>
                  <span
                    class="dot"
                    style={{ background: color(e.geometry.coordinates[2]) }}
                  />
                  {fmt(e.properties.mag)} <small>{e.properties.magType}</small>
                </td>
                <td>
                  <button class="event-link" onClick={() => choose(e)}>
                    {e.properties.place || e.id}
                  </button>
                </td>
                <td>{fmt(e.geometry.coordinates[2])} km</td>
                <td>{displayTime(e.properties.time)}</td>
                <td>{e.properties.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && (
        <p>
          No matching observations. Try clearing the region, search or magnitude
          filters.
        </p>
      )}
      <div class="pagination">
        <button disabled={page === 0} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>
          Page {page + 1} of {Math.max(1, Math.ceil(filtered.length / 40))}
        </span>
        <button
          disabled={(page + 1) * 40 >= filtered.length}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
        <button disabled={!hasDataset} onClick={() => exportData("csv")}>
          Export CSV + metadata
        </button>
        <button disabled={!hasDataset} onClick={() => exportData("json")}>
          Export GeoJSON snapshot
        </button>
        <label class="import">
          Reopen snapshot{" "}
          <input
            type="file"
            accept=".json,.geojson"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) importSnapshot(file);
            }}
          />
        </label>
      </div>
    </section>
  );
}

export const EventTable = memo(EventTableView);
