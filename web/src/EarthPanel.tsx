import { memo } from "preact/compat";
import { Globe, type Camera } from "./Globe";
import { color, type Event, type Region } from "./model";
import type { Section } from "./data";

type Props = {
  events: Event[];
  selectedId: string;
  onSelect: (e: Event) => void;
  camera: Camera;
  setCamera: (c: Camera) => void;
  flat: boolean;
  setFlat: (v: boolean) => void;
  plates: boolean;
  setPlates: (v: boolean) => void;
  countries: boolean;
  setCountries: (v: boolean) => void;
  region: Region | null;
  section: boolean;
  transect: Section;
  auto: boolean;
  autoWanted: boolean;
  toggleAuto: () => void;
  speed: number;
  setSpeed: (v: number) => void;
  pause: () => void;
};

function EarthPanelView({
  events,
  selectedId,
  onSelect,
  camera,
  setCamera,
  flat,
  setFlat,
  plates,
  setPlates,
  countries,
  setCountries,
  region,
  section,
  transect,
  auto,
  autoWanted,
  toggleAuto,
  speed,
  setSpeed,
  pause,
}: Props) {
  return (
    <div class="earth-panel">
      <div class="earth-heading">
        <h2>{flat ? "Earth · flat map" : "Earth · globe"}</h2>
        <span>Drag to rotate · Tap an event · N steps through markers</span>
        <button
          onClick={() => {
            pause();
            setFlat(!flat);
          }}
        >
          {flat ? "3D globe" : "2D map"}
        </button>
      </div>
      <Globe
        events={events}
        selected={selectedId}
        onSelect={onSelect}
        camera={camera}
        setCamera={setCamera}
        flat={flat}
        plates={plates}
        countries={countries}
        region={region}
        section={section}
        transect={transect}
        auto={auto}
        speed={speed}
        pause={pause}
      />
      <div class="globe-controls">
        <button
          aria-label="Rotate left"
          onClick={() => {
            pause();
            setCamera({
              ...camera,
              lon: ((camera.lon - 20 + 540) % 360) - 180,
            });
          }}
        >
          ←
        </button>
        <button
          aria-label="Rotate up"
          onClick={() => {
            pause();
            setCamera({ ...camera, lat: Math.min(85, camera.lat + 15) });
          }}
        >
          ↑
        </button>
        <button
          onClick={() => {
            pause();
            setCamera({ lon: 150, lat: 15, zoom: 1 });
          }}
        >
          Reset view
        </button>
        <button
          aria-label="Rotate down"
          onClick={() => {
            pause();
            setCamera({ ...camera, lat: Math.max(-85, camera.lat - 15) });
          }}
        >
          ↓
        </button>
        <button
          aria-label="Rotate right"
          onClick={() => {
            pause();
            setCamera({
              ...camera,
              lon: ((camera.lon + 20 + 540) % 360) - 180,
            });
          }}
        >
          →
        </button>
        <button
          aria-label="Zoom in"
          onClick={() => {
            pause();
            setCamera({
              ...camera,
              zoom: Math.min(2.5, camera.zoom + 0.2),
            });
          }}
        >
          ＋
        </button>
        <button
          aria-label="Zoom out"
          onClick={() => {
            pause();
            setCamera({
              ...camera,
              zoom: Math.max(0.65, camera.zoom - 0.2),
            });
          }}
        >
          −
        </button>
      </div>
      <div class="globe-controls">
        <button aria-pressed={auto} onClick={toggleAuto}>
          {auto
            ? "Auto-rotate: on"
            : autoWanted
              ? "Resume rotation"
              : "Auto-rotate: off"}
        </button>
        <label>
          Speed{" "}
          <select
            value={speed}
            onChange={(e) => setSpeed(+e.currentTarget.value)}
          >
            <option value="0.5">½×</option>
            <option value="1">1×</option>
            <option value="2">2×</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={plates}
            onChange={(e) => setPlates(e.currentTarget.checked)}
          />{" "}
          Plate boundaries
        </label>
        <label>
          <input
            type="checkbox"
            checked={countries}
            onChange={(e) => setCountries(e.currentTarget.checked)}
          />{" "}
          Country names
        </label>
      </div>
      <p class="legend">
        <span>
          <i style={{ background: color(0) }} />
          Shallow &lt;70 km
        </span>
        <span>
          <i style={{ background: color(100) }} />
          70–300 km
        </span>
        <span>
          <i style={{ background: color(400) }} />
          Deep ≥300 km
        </span>
      </p>
      <p class="map-credit">
        Natural Earth ·{" "}
        {plates
          ? "PB2002: Bird / Ahlenius / Nordpil, ODC-BY · simplified boundaries"
          : "Surface epicentres; colour shows source depth"}
        <br />
        Larger circles are larger magnitudes. Drag to rotate; arrow keys and +/−
        work once the globe has focus.
      </p>
    </div>
  );
}

export const EarthPanel = memo(EarthPanelView);
