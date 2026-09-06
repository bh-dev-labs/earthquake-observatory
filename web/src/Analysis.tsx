import { memo } from "preact/compat";
import { color, comparison, distance, transect, type Event } from "./model";
import { useState } from "preact/hooks";
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
  const bins = new Map<string, number>();
  for (const e of events) {
    const day = new Date(e.properties.time).toISOString().slice(0, 10);
    bins.set(day, (bins.get(day) || 0) + 1);
  }
  if (events.length) {
    const min = Math.min(...events.map((e) => e.properties.time)),
      max = Math.max(...events.map((e) => e.properties.time));
    for (
      let t = Math.floor(min / 86400000) * 86400000;
      t <= max;
      t += 86400000
    ) {
      const key = new Date(t).toISOString().slice(0, 10);
      if (!bins.has(key)) bins.set(key, 0);
    }
  }
  const days = [...bins].sort(),
    peak = Math.max(1, ...bins.values());
  const mags = Array.from({ length: 13 }, (_, i) => ({
    label: i - 2,
    count: events.filter(
      (e) =>
        e.properties.mag !== null &&
        e.properties.mag >= i - 2 &&
        e.properties.mag < i - 1,
    ).length,
  }));
  const mpeak = Math.max(1, ...mags.map((m) => m.count));
  const maxDepth = Math.max(
    100,
    ...events.map((e) => e.geometry.coordinates[2] ?? 0),
  );
  const points = events.filter(
    (e) => e.geometry.coordinates[2] !== null && e.properties.mag !== null,
  );
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
            aria-label={`Daily UTC counts: ${days.map((d) => d.join(": ")).join(", ")}`}
          >
            <title>Earthquake observations per UTC day</title>
            <rect width="520" height="240" fill="white" />
            <text x="30" y="18" font-size="12">
              USGS observations · UTC days · n={events.length}
            </text>
            {days.map(([day, count], i) => (
              <g>
                <rect
                  x={35 + (i * 450) / Math.max(1, days.length)}
                  y={170 - (count / peak) * 125}
                  width={Math.max(1, 440 / Math.max(1, days.length) - 3)}
                  height={(count / peak) * 125}
                  fill="#28685d"
                />
                <text
                  x={35 + (i * 450) / Math.max(1, days.length)}
                  y="188"
                  font-size="9"
                  transform={`rotate(30 ${35 + (i * 450) / Math.max(1, days.length)} 188)`}
                >
                  {day.slice(5)}
                </text>
                <text
                  x={35 + (i * 450) / Math.max(1, days.length)}
                  y={164 - (count / peak) * 125}
                  font-size="10"
                >
                  {count}
                </text>
              </g>
            ))}
            <text x="12" y="228" font-size="9">
              Daily bins [00:00, next 00:00 UTC); edge days may be partial.
            </text>
          </svg>
          <details>
            <summary>Daily counts as text</summary>
            {days.map(([d, n]) => (
              <p>
                {d}: {n}
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
            {mags.map((m, i) => (
              <g>
                <rect
                  x={30 + i * 36}
                  y={180 - (m.count / mpeak) * 140}
                  width="28"
                  height={(m.count / mpeak) * 140}
                  fill="#708f98"
                />
                <text x={32 + i * 36} y="199" font-size="11">
                  {m.label}
                </text>
                <text
                  x={30 + i * 36}
                  y={174 - (m.count / mpeak) * 140}
                  font-size="10"
                >
                  {m.count}
                </text>
              </g>
            ))}
            <text x="30" y="226" font-size="12">
              Magnitude · bins [m, m+1) · mixed reported types
            </text>
          </svg>
        </div>
        <div>
          <h3>Depth versus magnitude</h3>
          <svg
            viewBox="0 0 520 240"
            role="img"
            aria-label={`Depth versus magnitude for ${points.length} records. Depth increases downward; events are also available in the table.`}
          >
            <text x="10" y="15" font-size="12">
              Depth (km) ↓ · 0 to {Math.ceil(maxDepth)}
            </text>
            {points.map((e) => (
              <circle
                onClick={() => select(e)}
                cx={40 + ((e.properties.mag! + 2) / 12) * 440}
                cy={35 + (e.geometry.coordinates[2]! / maxDepth) * 145}
                r={selected === e.id ? 6 : 3}
                fill={color(e.geometry.coordinates[2])}
                stroke={selected === e.id ? "#243740" : "none"}
              >
                <title>
                  {e.properties.place} · M {e.properties.mag} ·{" "}
                  {e.geometry.coordinates[2]} km
                </title>
              </circle>
            ))}
            <text x="35" y="220" font-size="12">
              Magnitude: −2 (left) to 10 (right) · n={points.length}
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
            <line x1="50" x2="770" y1="30" y2="30" stroke="#243740" />
            {[0, 200, 400, 600].map((d) => (
              <g>
                <line
                  x1="50"
                  x2="770"
                  y1={30 + d * 0.3}
                  y2={30 + d * 0.3}
                  stroke="#dbe1e3"
                />
                <text x="3" y={35 + d * 0.3} font-size="12">
                  {d} km
                </text>
              </g>
            ))}
            {cross.map(({ e, along }) => (
              <circle
                cx={50 + (along / distance(start, end)) * 720}
                cy={30 + e.geometry.coordinates[2]! * 0.3}
                r={selected === e.id ? 8 : 5}
                fill={color(e.geometry.coordinates[2])}
                stroke={selected === e.id ? "#243740" : "white"}
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
              <button onClick={() => select(e)}>
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
