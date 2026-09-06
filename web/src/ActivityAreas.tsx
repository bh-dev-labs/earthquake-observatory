import { memo } from "preact/compat";
import type { Event, Region } from "./model";

type Props = {
  mode: string;
  areas: { region: Region; events: Event[] }[];
  activeRegion: string;
  focusRegion: (r: Region) => void;
  clearRegion: () => void;
};

const fmt = (v: number | null | undefined, digits = 1) =>
  v == null ? "Unavailable" : v.toFixed(digits);

function ActivityAreasView({
  mode,
  areas,
  activeRegion,
  focusRegion,
  clearRegion,
}: Props) {
  return (
    <section class="activity">
      <div class="section-heading">
        <h2>
          {mode === "demo" || mode === "history"
            ? "Activity in this historical dataset"
            : "Current areas of activity"}
        </h2>
        <button onClick={clearRegion}>Show all areas</button>
      </div>
      <p class="muted">
        Most populated 20° geographic cells in the loaded observations, after
        magnitude, depth, text and replay filters. Select one to focus and
        filter Earth. Counts describe recorded activity, not hazard.
      </p>
      <div class="area-grid">
        {areas.map(({ region: r, events }) => (
          <button
            key={r.name}
            class={activeRegion === r.name ? "area selected" : "area"}
            onClick={() => focusRegion(r)}
          >
            <strong>{r.name}</strong>
            <span>{events.length} observations</span>
            <small>
              Largest M{" "}
              {events.some((e) => e.properties.mag !== null)
                ? fmt(
                    Math.max(
                      ...events.map((e) => e.properties.mag ?? -Infinity),
                    ),
                  )
                : "Unavailable"}{" "}
              · {events[0]?.properties.place}
            </small>
          </button>
        ))}
      </div>
      {!areas.length && (
        <p>
          No areas match these filters. Clear filters or choose a longer period.
        </p>
      )}
    </section>
  );
}

export const ActivityAreas = memo(ActivityAreasView);
