import { useLayoutEffect, useState } from "preact/hooks";
import { defaultSection, validSection, type Section } from "./data";
import type { Event } from "./model";

const draftOf = (value: Section) => ({
  startLon: String(value.start[0]),
  startLat: String(value.start[1]),
  endLon: String(value.end[0]),
  endLat: String(value.end[1]),
  width: String(value.width),
});
export function TransectEditor({
  value,
  selected,
  onApply,
}: {
  value: Section;
  selected: Event | null;
  onApply: (value: Section) => void;
}) {
  const [draft, setDraft] = useState(draftOf(value));
  const [error, setError] = useState("");
  useLayoutEffect(() => {
    setDraft(draftOf(value));
    setError("");
  }, [value]);
  return (
    <form
      class="transect-editor"
      onSubmit={(event) => {
        event.preventDefault();
        const next: Section = {
          start: [+draft.startLon, +draft.startLat],
          end: [+draft.endLon, +draft.endLat],
          width: +draft.width,
        };
        if (!validSection(next)) {
          setError(
            "Choose distinct, non-antipodal endpoints and a corridor width of 1-2,000 km.",
          );
          return;
        }
        setError("");
        onApply(next);
      }}
    >
      <fieldset>
        <legend>Great-circle transect</legend>
        <div class="transect-fields">
          {(
            [
              ["startLon", "Start longitude", 180],
              ["startLat", "Start latitude", 90],
              ["endLon", "End longitude", 180],
              ["endLat", "End latitude", 90],
              ["width", "Corridor width (km)", 2000],
            ] as const
          ).map(([key, label, limit]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                required
                min={key === "width" ? 1 : -limit}
                max={limit}
                step="any"
                value={draft[key]}
                onInput={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    [key]: event.currentTarget.value,
                  }))
                }
              />
            </label>
          ))}
        </div>
        <div class="button-row">
          <button type="submit">Apply transect</button>
          <button type="button" onClick={() => onApply(defaultSection)}>
            Tonga preset
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() =>
              selected &&
              setDraft((previous) => ({
                ...previous,
                startLon: String(selected.geometry.coordinates[0]),
                startLat: String(selected.geometry.coordinates[1]),
              }))
            }
          >
            Selected event as start
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() =>
              selected &&
              setDraft((previous) => ({
                ...previous,
                endLon: String(selected.geometry.coordinates[0]),
                endLat: String(selected.geometry.coordinates[1]),
              }))
            }
          >
            Selected event as end
          </button>
        </div>
      </fieldset>
      {error && (
        <p role="alert" class="notice error">
          {error}
        </p>
      )}
    </form>
  );
}
