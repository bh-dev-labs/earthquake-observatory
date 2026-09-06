import { memo } from "preact/compat";
import type { Ref } from "preact";
import { zoneLabel, type Event } from "./model";

type Props = {
  selected: Event;
  inView: boolean;
  zone: string;
  displayTime: (t: number) => string;
  closeSelection: () => void;
  detailHeading: Ref<HTMLHeadingElement>;
  setTextPage: (v: string) => void;
  reported: boolean;
  detailBusy: boolean;
  detailError: string;
  getDetail: (e: Event) => void;
  products: Record<string, unknown>;
  detailLoaded: boolean;
  fetched: string;
  centreOnSelection: () => void;
  share: () => void;
  near: boolean;
  setNear: (v: boolean) => void;
  nearRadius: number;
  setNearRadius: (v: number) => void;
  nearHours: number;
  setNearHours: (v: number) => void;
};

const fmt = (v: number | null | undefined, digits = 1) =>
  v == null ? "Unavailable" : v.toFixed(digits);
const utc = (t: number) =>
  new Date(t).toISOString().replace("T", " ").replace(".000Z", " UTC");
const safeURL = (s: string) => {
  try {
    const u = new URL(s);
    return u.protocol === "https:" &&
      (u.hostname === "earthquake.usgs.gov" || u.hostname === "www.usgs.gov")
      ? u.href
      : "";
  } catch {
    return "";
  }
};

function SelectedEventView({
  selected,
  inView,
  zone,
  displayTime,
  closeSelection,
  detailHeading,
  setTextPage,
  reported,
  detailBusy,
  detailError,
  getDetail,
  products,
  detailLoaded,
  fetched,
  centreOnSelection,
  share,
  near,
  setNear,
  nearRadius,
  setNearRadius,
  nearHours,
  setNearHours,
}: Props) {
  return (
    <>
      <div class="detail-top">
        <span>Selected earthquake</span>
        <button onClick={closeSelection} aria-label="Close event details">
          ×
        </button>
      </div>
      <h2 class="magnitude" ref={detailHeading} tabIndex={-1}>
        {fmt(selected.properties.mag)}{" "}
        <small>
          {selected.properties.magType || "Magnitude type unavailable"}
        </small>
      </h2>
      <h3>{selected.properties.place || "Location description unavailable"}</h3>
      <p class="selection-note">
        ●{" "}
        {inView
          ? "Selected on globe"
          : "Outside current filters, replay time or dataset"}
      </p>
      <dl>
        <div>
          <dt>Depth</dt>
          <dd>{fmt(selected.geometry.coordinates[2])} km</dd>
        </div>
        <div>
          <dt>Review status</dt>
          <dd>{selected.properties.status || "Unavailable"}</dd>
        </div>
        <div class="wide">
          <dt>Event time · {zoneLabel(zone)}</dt>
          <dd>{displayTime(selected.properties.time)}</dd>
        </div>
        <div>
          <dt>Latitude</dt>
          <dd>{fmt(selected.geometry.coordinates[1], 3)}°</dd>
        </div>
        <div>
          <dt>Longitude</dt>
          <dd>{fmt(selected.geometry.coordinates[0], 3)}°</dd>
        </div>
      </dl>
      <hr />
      <h3>What am I looking at?</h3>
      <p>
        {selected.properties.status === "deleted" && (
          <strong>USGS marks this event deleted. </strong>
        )}
        The marker shows the surface location above the earthquake. Its colour
        represents source depth. Magnitude describes source size, not shaking at
        your location.
      </p>
      <button onClick={() => setTextPage("Glossary")}>
        Explain depth & magnitude
      </button>
      <details open={reported}>
        <summary>Felt and shaking reports</summary>
        {reported ? (
          <>
            <dl class="reports">
              {selected.properties.felt != null && (
                <div>
                  <dt>Felt reports</dt>
                  <dd>{selected.properties.felt}</dd>
                </div>
              )}
              {selected.properties.cdi != null && (
                <div>
                  <dt>Reported intensity (CDI)</dt>
                  <dd>{selected.properties.cdi}</dd>
                </div>
              )}
              {selected.properties.mmi != null && (
                <div>
                  <dt>Modelled intensity (MMI)</dt>
                  <dd>{selected.properties.mmi}</dd>
                </div>
              )}
            </dl>
            <p class="muted">
              Report counts are not population affected. Intensity values are
              not a shaking map.
            </p>
          </>
        ) : (
          <p class="muted">
            Nobody submitted a felt report for this earthquake, and USGS
            published no shaking estimate.
          </p>
        )}
      </details>
      <div class="products">
        <h4>Related USGS products</h4>
        {detailBusy && <p>Loading additional product links…</p>}
        {detailError && (
          <p>
            {detailError}{" "}
            <button onClick={() => getDetail(selected)}>Retry details</button>
          </p>
        )}
        {Object.entries(products)
          .filter(([key]) =>
            [
              "shakemap",
              "dyfi",
              "losspager",
              "moment-tensor",
              "origin",
            ].includes(key),
          )
          .map(([key]) => (
            <p key={key}>
              <a
                href={
                  safeURL(selected.properties.url) +
                  "/" +
                  (key === "losspager" ? "pager" : key)
                }
                target="_blank"
                rel="noreferrer"
              >
                {key === "dyfi"
                  ? "Did You Feel It? — felt reports"
                  : key === "shakemap"
                    ? "ShakeMap — modelled shaking"
                    : key === "losspager"
                      ? "PAGER — impact estimates"
                      : key + " — USGS product"}
              </a>
            </p>
          ))}
        {detailLoaded && !Object.keys(products).length && (
          <p class="muted">No additional USGS products were returned.</p>
        )}
      </div>
      <details>
        <summary>Source & freshness</summary>
        <p>
          Event ID: {selected.id}
          <br />
          Network: {selected.properties.net || "Unavailable"}
          <br />
          Source updated: {utc(selected.properties.updated)}
          <br />
          App retrieved: {fetched}
        </p>
      </details>
      {safeURL(selected.properties.url) && (
        <a
          class="source-link"
          href={safeURL(selected.properties.url)}
          target="_blank"
          rel="noreferrer"
        >
          Open original USGS event ↗
        </a>
      )}
      <div class="button-row">
        <button onClick={() => centreOnSelection()}>Centre globe</button>
        <button onClick={share}>Copy event link</button>
      </div>
      <details>
        <summary>Nearby observations</summary>
        <label>
          Radius (km){" "}
          <input
            type="number"
            value={nearRadius}
            min="1"
            max="20000"
            onInput={(e) =>
              setNearRadius(
                Math.max(1, Math.min(20000, +e.currentTarget.value)),
              )
            }
          />
        </label>
        <label>
          Time ± hours{" "}
          <input
            type="number"
            value={nearHours}
            min="1"
            max="744"
            onInput={(e) =>
              setNearHours(Math.max(1, Math.min(744, +e.currentTarget.value)))
            }
          />
        </label>
        <button onClick={() => setNear(!near)}>
          {near ? "Clear nearby filter" : "Show nearby in loaded dataset"}
        </button>
        <p>
          Uses the loaded dataset and current filters. Nearby does not imply an
          aftershock relationship.
        </p>
      </details>
    </>
  );
}

export const SelectedEvent = memo(SelectedEventView);
