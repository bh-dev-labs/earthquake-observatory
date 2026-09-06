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
import { useMeasure } from "./hooks";
import type { Section } from "./data";

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
  const size =
    span <= 3 * DAY
      ? HOUR
      : span <= 14 * DAY
        ? 6 * HOUR
        : Math.max(1, Math.ceil(span / DAY / 120)) * DAY;
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

// Prose form: "each hour", "each six-hour period", "each day".
function binUnit(size: number) {
  return size >= DAY
    ? size === DAY
      ? "day"
      : `${size / DAY}-day period`
    : size === 6 * HOUR
      ? "six-hour period"
      : "hour";
}

function binName(size: number) {
  return size >= DAY
    ? `${size / DAY}-day UTC bins`
    : size === 6 * HOUR
      ? "6-hour UTC bins"
      : "hourly UTC bins";
}

function binLabel(start: number, size: number) {
  const d = new Date(start);
  return size >= DAY
    ? `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    : `${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00`;
}

function binFull(start: number, size: number) {
  const d = new Date(start);
  return size >= DAY
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

// Fixed pixel padding: charts draw at their measured size, so a label is
// thirteen real pixels whatever the window does.
const PAD = { left: 52, right: 18, top: 46, bottom: 42 };
const PLOT = { top: PAD.top, bottom: 260 - PAD.bottom };

// Whole-number gridlines up to a rounded maximum at or above the peak, so
// the tallest bar sits under a labelled line instead of running off the top.
function countStep(peak: number) {
  return Math.max(1, Math.ceil(Math.max(1, peak) / 4));
}
function axisMax(peak: number) {
  const step = countStep(peak);
  return step * Math.max(1, Math.ceil(Math.max(1, peak) / step));
}
function countTicks(peak: number) {
  const step = countStep(peak),
    max = axisMax(peak);
  const out: number[] = [];
  for (let v = 0; v <= max; v += step) out.push(v);
  return out;
}
function barY(value: number, peak: number) {
  return PLOT.bottom - (value / axisMax(peak)) * (PLOT.bottom - PLOT.top);
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
  sectionConfig,
  query,
}: {
  events: Event[];
  select: (e: Event) => void;
  selected: string;
  section: boolean;
  sectionConfig: Section;
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
  const [timelineRef, timelineWidth] = useMeasure<HTMLDivElement>();
  const [magRef, magWidth] = useMeasure<HTMLDivElement>();
  const [depthRef, depthWidth] = useMeasure<HTMLDivElement>();
  const tw = Math.max(320, timelineWidth || 900);
  const mw = Math.max(280, magWidth || 480);
  const dw = Math.max(280, depthWidth || 480);
  const magX = (m: number, width: number) =>
    PAD.left + ((m - magLo) / magSpan) * (width - PAD.left - PAD.right);
  const depthY = (d: number) =>
    PLOT.top + (d / maxDepth) * (PLOT.bottom - PLOT.top);
  const ratio = comparison(a, b);
  const { start, end, width } = sectionConfig;
  const cross = events
    .filter((event) => event.geometry.coordinates[2] !== null)
    .map((e) => ({
      e,
      ...transect(
        e.geometry.coordinates.slice(0, 2) as [number, number],
        start,
        end,
        width,
      ),
    }))
    .filter((e) => e.inside);
  const sectionDepths = cross.map((point) => point.e.geometry.coordinates[2]!);
  const sectionMin = Math.min(0, ...sectionDepths);
  const sectionMax = Math.max(100, ...sectionDepths);
  const sectionY = (depth: number) =>
    30 + ((depth - sectionMin) / (sectionMax - sectionMin)) * 220;
  const sectionWidth = Math.max(260, tw - 40);
  const sectionPlotWidth = sectionWidth - 68;
  const [sectionPage, setSectionPage] = useState(0);
  const actualSectionPage = Math.max(
    0,
    Math.min(sectionPage, Math.ceil(cross.length / 40) - 1),
  );
  return (
    <section id="analysis" class="analysis">
      <h2>Read the observations</h2>
      <p class="muted">
        {events.length} observations · All charts follow filters and the
        cumulative replay cursor. UTC. Missing values excluded only from plots
        needing them.
      </p>
      <div class="charts">
        <div class="chart-wide" ref={timelineRef}>
          <h3>Events over time</h3>
          <p class="chart-note">
            How many earthquakes were recorded in each {binUnit(size)} of the
            loaded period. A taller bar means more earthquakes.
          </p>
          <svg
            id="timeline-chart"
            width={tw}
            height={260}
            viewBox={`0 0 ${tw} 260`}
            role="img"
            aria-label={`Counts per ${binName(size)}: ${bins.map((b) => `${binFull(b.start, size)}: ${b.count}`).join(", ")}`}
          >
            <title>Earthquake observations per {binName(size)}</title>
            <rect width={tw} height="260" fill={token("--surface")} />
            {countTicks(peak).map((v) => (
              <g key={v}>
                <line
                  x1={PAD.left}
                  x2={tw - PAD.right}
                  y1={barY(v, peak)}
                  y2={barY(v, peak)}
                  stroke={token("--chart-grid")}
                />
                <text
                  x={PAD.left - 10}
                  y={barY(v, peak) + 5}
                  font-size="13"
                  text-anchor="end"
                  fill={token("--ink-muted")}
                >
                  {v}
                </text>
              </g>
            ))}
            {bins.map((bin, i) => {
              const slot =
                  (tw - PAD.left - PAD.right) / Math.max(1, bins.length),
                x = PAD.left + i * slot,
                w = Math.max(1, slot - 3),
                y = barY(bin.count, peak);
              return (
                <g key={bin.start}>
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={PLOT.bottom - y}
                    fill={token("--chart-bar")}
                  >
                    <title>
                      {binFull(bin.start, size)}: {bin.count}
                    </title>
                  </rect>
                  {i %
                    Math.ceil(
                      bins.length / Math.max(2, Math.floor(tw / 110)),
                    ) ===
                    0 && (
                    <text
                      x={x + w / 2}
                      y={PLOT.bottom + 20}
                      font-size="13"
                      text-anchor="middle"
                      fill={token("--ink-muted")}
                    >
                      {binLabel(bin.start, size)}
                    </text>
                  )}
                </g>
              );
            })}
            <text
              x={PAD.left}
              y="20"
              font-size="13"
              fill={token("--ink-muted")}
            >
              Earthquakes per {binUnit(size)} · n={events.length}
            </text>
            <text
              x={(tw + PAD.left) / 2}
              y="252"
              font-size="13"
              text-anchor="middle"
              fill={token("--ink-muted")}
            >
              Time (UTC) →
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
        <div ref={magRef}>
          <h3>Magnitude distribution</h3>
          <p class="chart-note">
            How many earthquakes fell in each magnitude step. Most earthquakes
            are small ones.
          </p>
          <svg
            width={mw}
            height={260}
            viewBox={`0 0 ${mw} 260`}
            role="img"
            aria-label={`Magnitude bins: ${mags.map((m) => `${m.label} to ${m.label + 1}: ${m.count}`).join(", ")}`}
          >
            <title>
              Magnitude histogram; left inclusive, right exclusive bins
            </title>
            {countTicks(mpeak).map((v) => (
              <g key={v}>
                <line
                  x1={PAD.left}
                  x2={mw - PAD.right}
                  y1={barY(v, mpeak)}
                  y2={barY(v, mpeak)}
                  stroke={token("--chart-grid")}
                />
                <text
                  x={PAD.left - 10}
                  y={barY(v, mpeak) + 5}
                  font-size="13"
                  text-anchor="end"
                  fill={token("--ink-muted")}
                >
                  {v}
                </text>
              </g>
            ))}
            {mags.map((m, i) => {
              const slot =
                  (mw - PAD.left - PAD.right) / Math.max(1, mags.length),
                x = PAD.left + i * slot,
                w = Math.min(56, slot - 8),
                y = barY(m.count, mpeak);
              return (
                <g key={m.label}>
                  <rect
                    x={x + (slot - w) / 2}
                    y={y}
                    width={Math.max(2, w)}
                    height={PLOT.bottom - y}
                    fill={token("--chart-bar-soft")}
                  >
                    <title>
                      M {m.label} to {m.label + 1}: {m.count}
                    </title>
                  </rect>
                  <text
                    x={x + slot / 2}
                    y={PLOT.bottom + 20}
                    font-size="13"
                    text-anchor="middle"
                    fill={token("--ink-muted")}
                  >
                    {m.label}
                  </text>
                </g>
              );
            })}
            <text
              x={PAD.left}
              y="20"
              font-size="13"
              fill={token("--ink-muted")}
            >
              Number of earthquakes
            </text>
            <text
              x={(mw + PAD.left) / 2}
              y="252"
              font-size="13"
              text-anchor="middle"
              fill={token("--ink-muted")}
            >
              Magnitude · bins [m, m+1) →
            </text>
          </svg>
        </div>
        <div ref={depthRef}>
          <h3>Depth versus magnitude</h3>
          <p class="chart-note">
            Each dot is one earthquake: how strong it was, and how deep below
            the surface it started. Deeper is lower.
          </p>
          <svg
            width={dw}
            height={260}
            viewBox={`0 0 ${dw} 260`}
            role="img"
            aria-label={`Depth versus magnitude for ${points.length} records, magnitude ${magLo} to ${magHi}, depth 0 to ${Math.ceil(maxDepth)} kilometres. Depth increases downward; every event is also in the table.`}
          >
            {ticks(0, maxDepth, 4).map((d) => (
              <g key={d}>
                <line
                  x1={PAD.left}
                  x2={dw - PAD.right}
                  y1={depthY(d)}
                  y2={depthY(d)}
                  stroke={token("--chart-grid")}
                />
                <text
                  x={PAD.left - 10}
                  y={depthY(d) + 5}
                  font-size="13"
                  text-anchor="end"
                  fill={token("--ink-muted")}
                >
                  {Math.round(d)}
                </text>
              </g>
            ))}
            {ticks(magLo, magHi, 5).map((m) => (
              <text
                key={m}
                x={magX(m, dw)}
                y={PLOT.bottom + 20}
                font-size="13"
                text-anchor="middle"
                fill={token("--ink-muted")}
              >
                {m.toFixed(1)}
              </text>
            ))}
            {/* Deliberately unkeyed: these marks carry no identity or DOM
                state, and keyed reconciliation of 20,000 circles costs about
                280ms per filter change where positional diffing costs none. */}
            {points.map((e) => (
              <circle
                onClick={() => select(e)}
                cx={magX(e.properties.mag!, dw)}
                cy={depthY(e.geometry.coordinates[2]!)}
                r={selected === e.id ? 7 : 4}
                fill={color(e.geometry.coordinates[2])}
                stroke={selected === e.id ? token("--ink") : "none"}
                stroke-width="2"
              >
                <title>
                  {e.properties.place} · M {e.properties.mag} ·{" "}
                  {e.geometry.coordinates[2]} km
                </title>
              </circle>
            ))}
            <text x="4" y="20" font-size="13" fill={token("--ink-muted")}>
              Depth (km) ↓ · n={points.length}
            </text>
            <text
              x={(dw + PAD.left) / 2}
              y="252"
              font-size="13"
              text-anchor="middle"
              fill={token("--ink-muted")}
            >
              Magnitude →
            </text>
          </svg>
        </div>
      </div>
      {section && (
        <div class="depth-section">
          <h3>Depth section</h3>
          <p>
            {start.join(", ")} to {end.join(", ")} (longitude, latitude) ·
            great-circle transect · {width} km total corridor · {cross.length}{" "}
            observations. Depth increases downward. Horizontal distance{" "}
            {Math.round(distance(start, end))} km; vertical scale {sectionMin}{" "}
            to {sectionMax} km. Vertical exaggeration{" "}
            {(
              (220 * distance(start, end)) /
              (sectionPlotWidth * (sectionMax - sectionMin))
            ).toFixed(2)}
            × (relative to horizontal distance).
          </p>
          <svg
            width={sectionWidth}
            height="300"
            viewBox={`0 0 ${sectionWidth} 300`}
            role="img"
            aria-label="Custom depth section; depth positive downward"
          >
            <line
              x1="50"
              x2={sectionWidth - 18}
              y1="30"
              y2="30"
              stroke={token("--ink")}
            />
            {ticks(sectionMin, sectionMax, 4).map((d) => (
              <g key={d}>
                <line
                  x1="50"
                  x2={sectionWidth - 18}
                  y1={sectionY(d)}
                  y2={sectionY(d)}
                  stroke={token("--chart-grid")}
                />
                <text x="3" y={sectionY(d) + 5} font-size="12">
                  {Math.round(d)} km
                </text>
              </g>
            ))}
            {cross.map(({ e, along }) => (
              <circle
                key={e.id}
                cx={50 + (along / distance(start, end)) * sectionPlotWidth}
                cy={sectionY(e.geometry.coordinates[2]!)}
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
            <text x="50" y="270" font-size="12">
              0
            </text>
            <text
              x={sectionWidth - 18}
              y="270"
              font-size="12"
              text-anchor="end"
            >
              {Math.round(distance(start, end))}
            </text>
            <text
              x={(sectionWidth + 32) / 2}
              y="293"
              font-size="12"
              text-anchor="middle"
            >
              Along-transect distance (km)
            </text>
          </svg>
          <details>
            <summary>Section events — keyboard selection</summary>
            {cross
              .slice(actualSectionPage * 40, actualSectionPage * 40 + 40)
              .map(({ e, along }) => (
                <button key={e.id} onClick={() => select(e)}>
                  {e.properties.place} · {along.toFixed(0)} km along · depth{" "}
                  {e.geometry.coordinates[2]} km
                </button>
              ))}
            <div class="button-row">
              <button
                disabled={!actualSectionPage}
                onClick={() => setSectionPage(actualSectionPage - 1)}
              >
                Previous section events
              </button>
              <span>
                Page {actualSectionPage + 1} of{" "}
                {Math.max(1, Math.ceil(cross.length / 40))}
              </span>
              <button
                disabled={(actualSectionPage + 1) * 40 >= cross.length}
                onClick={() => setSectionPage(actualSectionPage + 1)}
              >
                Next section events
              </button>
            </div>
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
