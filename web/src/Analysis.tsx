import { memo } from "preact/compat";
import {
  color,
  comparison,
  distance,
  token,
  transect,
  type Event,
} from "./model";
import { useState } from "preact/hooks";

const HOUR = 3600000,
  DAY = 86400000;
const pad = (n: number) => String(n).padStart(2, "0");

// Bin width follows the loaded span: a 24-hour dataset binned by day is two
// bars and tells nobody anything.
function timeBins(events: Event[]) {
  if (!events.length)
    return { bins: [] as { start: number; count: number }[], size: DAY };
  const times = events.map((e) => e.properties.time);
  const min = Math.min(...times),
    max = Math.max(...times);
  const span = max - min;
  const size = span <= 3 * DAY ? HOUR : span <= 14 * DAY ? 6 * HOUR : DAY;
  const counts = new Map<number, number>();
  for (let t = Math.floor(min / size) * size; t <= max; t += size)
    counts.set(t, 0);
  for (const time of times) {
    const key = Math.floor(time / size) * size;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return {
    bins: [...counts]
      .sort((a, b) => a[0] - b[0])
      .map(([start, count]) => ({ start, count })),
    size,
  };
}

function binName(size: number) {
  return size === DAY
    ? "UTC days"
    : size === 6 * HOUR
      ? "6-hour UTC bins"
      : "hourly UTC bins";
}

function binLabel(start: number, size: number) {
  const d = new Date(start);
  return size === DAY
    ? `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    : `${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00`;
}

function binFull(start: number, size: number) {
  const d = new Date(start);
  return size === DAY
    ? d.toISOString().slice(0, 10)
    : d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

// Only the bins that carry data, plus one empty bin of breathing room, so a
// handful of M1 events are not squeezed into a tenth of the axis.
function magnitudeBins(events: Event[]) {
  const values = events
    .map((e) => e.properties.mag)
    .filter((m): m is number => m !== null);
  if (!values.length) return [];
  const lo = Math.max(-2, Math.floor(Math.min(...values)) - 1),
    hi = Math.min(10, Math.floor(Math.max(...values)) + 1);
  return Array.from({ length: hi - lo + 1 }, (_, i) => ({
    label: lo + i,
    count: values.filter((m) => m >= lo + i && m < lo + i + 1).length,
  }));
}

function ticks(lo: number, hi: number, count = 5) {
  if (!(hi > lo)) return [lo];
  const step = (hi - lo) / count;
  return Array.from({ length: count + 1 }, (_, i) => lo + i * step);
}

function AnalysisView({
  events,
  select,
  selected,
  section,
  query,
}: {
  events: Event[];
  select: (e: Event) => void;
  selected: string;
  section: boolean;
  query: string;
}) {
  const [a, setA] = useState(4),
    [b, setB] = useState(5);
  const { bins, size } = timeBins(events);
  const peak = Math.max(1, ...bins.map((b) => b.count));
  // Label at most a dozen bars; hourly bins on a week of data would collide.
  const stride = Math.ceil(bins.length / 12);
  const mags = magnitudeBins(events);
  const mpeak = Math.max(1, ...mags.map((m) => m.count));
  const points = events.filter(
    (e) => e.geometry.coordinates[2] !== null && e.properties.mag !== null,
  );
  const depths = points.map((e) => e.geometry.coordinates[2]!),
    magValues = points.map((e) => e.properties.mag!);
  const maxDepth = points.length ? Math.max(10, Math.max(...depths)) : 100;
  const magLo = points.length ? Math.floor(Math.min(...magValues) * 2) / 2 : 0,
    magHi = points.length ? Math.ceil(Math.max(...magValues) * 2) / 2 : 6;
  const magSpan = Math.max(0.5, magHi - magLo);
  const plotX = (m: number) => 48 + ((m - magLo) / magSpan) * 452;
  const plotY = (d: number) => 34 + (d / maxDepth) * 150;
  const ratio = comparison(a, b);
  const start: [number, number] = [170, -22],
    end: [number, number] = [-170, -22];
  const cross = points
    .map((e) => ({
      e,
      ...transect(
        e.geometry.coordinates.slice(0, 2) as [number, number],
        start,
        end,
      ),
    }))
    .filter((e) => e.inside);
  return (
    <section id="analysis" class="analysis">
      <h2>Read the observations</h2>
      <p class="muted">
        {events.length} observations · All charts follow filters and the
        cumulative replay cursor. UTC. Missing values excluded only from plots
        needing them.
      </p>
      <div class="charts">
        <div>
          <h3>Events over time</h3>
          <svg
            id="timeline-chart"
            viewBox="0 0 520 240"
            role="img"
            aria-label={`Counts per ${binName(size)}: ${bins.map((b) => `${binFull(b.start, size)}: ${b.count}`).join(", ")}`}
          >
            <title>Earthquake observations per {binName(size)}</title>
            <rect width="520" height="240" fill={token("--surface")} />
            <text x="30" y="18" font-size="12" fill={token("--ink")}>
              USGS observations · {binName(size)} · n={events.length}
            </text>
            <line
              x1="34"
              x2="500"
              y1="170"
              y2="170"
              stroke={token("--chart-grid")}
            />
            {bins.map((bin, i) => {
              const w = Math.max(1, 466 / Math.max(1, bins.length) - 2),
                x = 35 + (i * 466) / Math.max(1, bins.length),
                h = (bin.count / peak) * 125;
              return (
                <g key={bin.start}>
                  <rect
                    x={x}
                    y={170 - h}
                    width={w}
                    height={h}
                    fill={token("--chart-bar")}
                  >
                    <title>
                      {binFull(bin.start, size)}: {bin.count}
                    </title>
                  </rect>
                  {i % stride === 0 && (
                    <text
                      x={x}
                      y="188"
                      font-size="9"
                      fill={token("--ink-muted")}
                      transform={`rotate(30 ${x} 188)`}
                    >
                      {binLabel(bin.start, size)}
                    </text>
                  )}
                  {bins.length <= 24 && bin.count > 0 && (
                    <text
                      x={x}
                      y={164 - h}
                      font-size="10"
                      fill={token("--ink-muted")}
                    >
                      {bin.count}
                    </text>
                  )}
                </g>
              );
            })}
            <text x="12" y="228" font-size="9" fill={token("--ink-muted")}>
              Bins are half-open [start, start + width); the first and last may
              be partial.
            </text>
          </svg>
          <details>
            <summary>Counts as text</summary>
            {bins.map((bin) => (
              <p key={bin.start}>
                {binFull(bin.start, size)}: {bin.count}
              </p>
            ))}
          </details>
        </div>
        <div>
          <h3>Magnitude distribution</h3>
          <svg
            viewBox="0 0 520 240"
            role="img"
            aria-label={`Magnitude bins: ${mags.map((m) => `${m.label} to ${m.label + 1}: ${m.count}`).join(", ")}`}
          >
            <title>
              Magnitude histogram; left inclusive, right exclusive bins
            </title>
            <line
              x1="28"
              x2="500"
              y1="180"
              y2="180"
              stroke={token("--chart-grid")}
            />
            {mags.map((m, i) => {
              const w = Math.min(40, 460 / Math.max(1, mags.length) - 6),
                x = 32 + (i * 460) / Math.max(1, mags.length),
                h = (m.count / mpeak) * 140;
              return (
                <g key={m.label}>
                  <rect
                    x={x}
                    y={180 - h}
                    width={w}
                    height={h}
                    fill={token("--chart-bar-soft")}
                  />
                  <text
                    x={x}
                    y="199"
                    font-size="11"
                    fill={token("--ink-muted")}
                  >
                    {m.label}
                  </text>
                  {m.count > 0 && (
                    <text
                      x={x}
                      y={174 - h}
                      font-size="10"
                      fill={token("--ink-muted")}
                    >
                      {m.count}
                    </text>
                  )}
                </g>
              );
            })}
            <text x="30" y="226" font-size="12" fill={token("--ink")}>
              Magnitude · bins [m, m+1) · mixed reported types
            </text>
          </svg>
        </div>
        <div>
          <h3>Depth versus magnitude</h3>
          <svg
            viewBox="0 0 520 240"
            role="img"
            aria-label={`Depth versus magnitude for ${points.length} records, magnitude ${magLo} to ${magHi}, depth 0 to ${Math.ceil(maxDepth)} kilometres. Depth increases downward; every event is also in the table.`}
          >
            <text x="10" y="15" font-size="12" fill={token("--ink")}>
              Depth (km) ↓ versus magnitude · n={points.length}
            </text>
            {ticks(0, maxDepth, 4).map((d) => (
              <g key={d}>
                <line
                  x1="48"
                  x2="500"
                  y1={plotY(d)}
                  y2={plotY(d)}
                  stroke={token("--chart-grid")}
                />
                <text
                  x="4"
                  y={plotY(d) + 4}
                  font-size="9"
                  fill={token("--ink-muted")}
                >
                  {Math.round(d)}
                </text>
              </g>
            ))}
            {ticks(magLo, magHi, 5).map((m) => (
              <g key={m}>
                <line
                  x1={plotX(m)}
                  x2={plotX(m)}
                  y1="34"
                  y2="184"
                  stroke={token("--chart-grid")}
                />
                <text
                  x={plotX(m)}
                  y="198"
                  font-size="9"
                  text-anchor="middle"
                  fill={token("--ink-muted")}
                >
                  {m.toFixed(1)}
                </text>
              </g>
            ))}
            {/* Deliberately unkeyed: these marks carry no identity or DOM
                state, and keyed reconciliation of 20,000 circles costs about
                280ms per filter change where positional diffing costs none. */}
            {points.map((e) => (
              <circle
                onClick={() => select(e)}
                cx={plotX(e.properties.mag!)}
                cy={plotY(e.geometry.coordinates[2]!)}
                r={selected === e.id ? 6 : 3}
                fill={color(e.geometry.coordinates[2])}
                stroke={selected === e.id ? token("--ink") : "none"}
              >
                <title>
                  {e.properties.place} · M {e.properties.mag} ·{" "}
                  {e.geometry.coordinates[2]} km
                </title>
              </circle>
            ))}
            <text
              x="270"
              y="220"
              font-size="12"
              text-anchor="middle"
              fill={token("--ink")}
            >
              Magnitude →
            </text>
          </svg>
        </div>
      </div>
      {section && (
        <div class="depth-section">
          <h3>Tonga depth section</h3>
          <p>
            170°E to 170°W at 22°S · great-circle transect · 400 km total
            corridor · {cross.length} observations. Depth increases downward.
            Horizontal distance {Math.round(distance(start, end))} km; vertical
            scale −20 to 750 km. Vertical exaggeration{" "}
            {((0.3 * distance(start, end)) / 720).toFixed(2)}× (relative to
            horizontal distance).
          </p>
          <svg
            viewBox="0 0 800 300"
            role="img"
            aria-label="Tonga depth section; depth positive downward"
          >
            <line x1="50" x2="770" y1="30" y2="30" stroke={token("--ink")} />
            {[0, 200, 400, 600].map((d) => (
              <g key={d}>
                <line
                  x1="50"
                  x2="770"
                  y1={30 + d * 0.3}
                  y2={30 + d * 0.3}
                  stroke={token("--chart-grid")}
                />
                <text x="3" y={35 + d * 0.3} font-size="12">
                  {d} km
                </text>
              </g>
            ))}
            {cross.map(({ e, along }) => (
              <circle
                key={e.id}
                cx={50 + (along / distance(start, end)) * 720}
                cy={30 + e.geometry.coordinates[2]! * 0.3}
                r={selected === e.id ? 8 : 5}
                fill={color(e.geometry.coordinates[2])}
                stroke={
                  selected === e.id ? token("--ink") : token("--marker-edge")
                }
                onClick={() => select(e)}
              >
                <title>
                  {e.properties.place}: {e.geometry.coordinates[2]} km
                </title>
              </circle>
            ))}
            <text x="50" y="285">
              0 km — Along-transect distance →{" "}
              {Math.round(distance(start, end))} km
            </text>
          </svg>
          <details>
            <summary>Section events — keyboard selection</summary>
            {cross.map(({ e, along }) => (
              <button key={e.id} onClick={() => select(e)}>
                {e.properties.place} · {along.toFixed(0)} km along · depth{" "}
                {e.geometry.coordinates[2]} km
              </button>
            ))}
          </details>
        </div>
      )}
      <details>
        <summary>Illustrative magnitude comparison</summary>
        <p>
          For compatible magnitude scales: relative amplitude ≈ 10^(difference);
          approximate energy ≈ 10^(1.5 × difference). This illustration is not a
          comparison of mixed catalog types and does not estimate local shaking.
        </p>
        <label>
          Magnitude A{" "}
          <input
            type="number"
            min="0"
            max="9"
            step="0.1"
            value={a}
            onInput={(e) =>
              setA(Math.max(0, Math.min(9, +e.currentTarget.value)))
            }
          />
        </label>
        <label>
          Magnitude B{" "}
          <input
            type="number"
            min="0"
            max="9"
            step="0.1"
            value={b}
            onInput={(e) =>
              setB(Math.max(0, Math.min(9, +e.currentTarget.value)))
            }
          />
        </label>
        <p>
          B / A: {ratio.amplitude.toPrecision(3)}× amplitude; approximately{" "}
          {ratio.energy.toPrecision(3)}× energy.
        </p>
        <a
          href="https://www.usgs.gov/programs/earthquake-hazards/earthquake-magnitude-energy-release-and-shaking-intensity"
          target="_blank"
          rel="noreferrer"
        >
          USGS explanation and assumptions
        </a>
      </details>
      <p class="muted">
        Catalog counts reflect detection and reporting coverage. A rise in
        counts alone is not evidence that underlying seismicity is increasing.
      </p>
    </section>
  );
}

export const Analysis = memo(AnalysisView);
