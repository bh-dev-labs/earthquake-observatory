import { useEffect, useRef, useState } from "preact/hooks";
import {
  geoOrthographic,
  geoEquirectangular,
  geoPath,
  geoGraticule10,
} from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection } from "geojson";
import {
  countryLabels,
  countryLabelOpacity,
  type CountryLabel,
} from "./countryLabels";
import { validRegion, type Section } from "./data";
import { corridorLines } from "./science";
import {
  color,
  radius,
  refreshPalette,
  token,
  visible,
  type Event,
  type Region,
} from "./model";
export type Camera = { lon: number; lat: number; zoom: number };
type Props = {
  events: Event[];
  selected: string;
  onSelect: (e: Event) => void;
  camera: Camera;
  setCamera: (c: Camera) => void;
  flat: boolean;
  plates: boolean;
  countries: boolean;
  region: Region | null;
  section: boolean;
  transect: Section;
  auto: boolean;
  speed: number;
  pause: () => void;
};
let earthPromise: Promise<any> | null = null,
  platePromise: Promise<any> | null = null;
export function Globe(p: Props) {
  const ref = useRef<HTMLCanvasElement>(null),
    live = useRef(p);
  live.current = p;
  const [earth, setEarth] = useState<any>(null),
    [countries, setCountries] = useState<CountryLabel[]>([]),
    [plates, setPlates] = useState<any>(null),
    [error, setError] = useState(""),
    [hover, setHover] = useState(""),
    [choices, setChoices] = useState<Event[]>([]),
    [size, setSize] = useState([800, 600]),
    [theme, setTheme] = useState(0),
    [cursor, setCursor] = useState(""),
    [spoken, setSpoken] = useState("");
  const hits = useRef<{ e: Event; x: number; y: number; r: number }[]>([]);
  // Names drawn last frame keep their place first, so a larger neighbour
  // rotating into view cannot evict them and cascade the rest.
  const shownLabels = useRef(new Set<string>());
  const pointers = useRef(new Map<number, [number, number]>());
  const drag = useRef({ x: 0, y: 0, moved: 0, pinch: 0, multi: false });
  useEffect(() => {
    earthPromise ??= fetch("/data/earth.json")
      .then((r) => r.json())
      .then((t) => ({
        land: feature(t, t.objects.land),
        countries: countryLabels(
          feature(t, t.objects.countries) as unknown as FeatureCollection,
        ),
      }));
    platePromise ??= fetch("/data/plates.json").then((r) => r.json());
    earthPromise
      .then((geography) => {
        setEarth(geography.land);
        setCountries(geography.countries);
      })
      .catch(() =>
        setError("Geography unavailable. Event list remains usable."),
      );
    platePromise
      .then(setPlates)
      .catch(() => setError("Plate overlay unavailable."));
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    const repaint = () => {
      refreshPalette();
      setTheme((n) => n + 1);
    };
    scheme.addEventListener("change", repaint);
    const resize = () => {
      const width = ref.current?.parentElement?.clientWidth;
      if (!width) return;
      const height = Math.round(
        Math.min(640, innerHeight * 0.55, Math.max(240, width * 0.7)),
      );
      setSize((previous) =>
        previous[0] === width && previous[1] === height
          ? previous
          : [width, height],
      );
    };
    const ro = new ResizeObserver(resize);
    if (ref.current) ro.observe(ref.current.parentElement!);
    window.addEventListener("resize", resize);
    resize();
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resize);
      scheme.removeEventListener("change", repaint);
    };
  }, []);
  useEffect(() => {
    if (!p.auto || p.flat) return;
    let frame = 0,
      last = 0;
    const tick = (t: number) => {
      if (!document.hidden) {
        if (last) {
          const q = live.current;
          q.setCamera({
            ...q.camera,
            lon:
              ((q.camera.lon + ((t - last) / 1000) * 3 * q.speed + 540) % 360) -
              180,
          });
        }
        last = t;
      } else last = 0;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [p.auto, p.speed, p.flat]);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Canvas unavailable. Use the event table below.");
      return;
    }
    const [w, h] = size,
      dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.height = h + "px";
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const proj = p.flat
      ? geoEquirectangular()
          .rotate([-p.camera.lon, 0, 0])
          .scale(Math.min(w / 6.5, h / 3.25) * p.camera.zoom)
          .translate([w / 2, h / 2])
      : geoOrthographic()
          .rotate([-p.camera.lon, -p.camera.lat, 0])
          .scale(Math.min(w, h) * 0.46 * p.camera.zoom)
          .translate([w / 2, h / 2])
          .clipAngle(90);
    const path = geoPath(proj, ctx);
    ctx.beginPath();
    path({ type: "Sphere" });
    ctx.fillStyle = token("--globe-ocean");
    ctx.fill();
    ctx.strokeStyle = token("--globe-edge");
    ctx.stroke();
    if (earth) {
      ctx.beginPath();
      path(earth);
      ctx.fillStyle = token("--globe-land");
      ctx.fill();
    }
    ctx.beginPath();
    path(geoGraticule10());
    ctx.strokeStyle = token("--globe-graticule");
    ctx.lineWidth = 0.55;
    ctx.stroke();
    if (p.plates && plates) {
      ctx.beginPath();
      path(plates);
      ctx.strokeStyle = token("--plate");
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.font = "11px sans-serif";
      ctx.fillStyle = token("--plate-label");
      for (const [name, coord] of [
        ["Pacific", [190, 0]],
        ["North American", [-100, 45]],
        ["Eurasian", [65, 45]],
        ["African", [20, 0]],
        ["Antarctic", [20, -70]],
        ["Indo-Australian", [100, -25]],
        ["South American", [-55, -20]],
      ] as [string, [number, number]][]) {
        if (p.flat || visible(coord, [p.camera.lon, p.camera.lat])) {
          const xy = proj(coord);
          if (xy) ctx.fillText(name, xy[0] - 20, xy[1]);
        }
      }
    }
    if (p.region && validRegion(p.region)) {
      const r = p.region;
      const lines: any = { type: "MultiLineString", coordinates: [] };
      const east = r.east < r.west ? r.east + 360 : r.east;
      const norm = (x: number) => ((x + 540) % 360) - 180;
      const top = [],
        bottom = [],
        left = [],
        right = [];
      for (let offset = 0; offset <= Math.min(360, east - r.west); offset++) {
        const x = r.west + offset;
        top.push([norm(x), r.north]);
        bottom.push([norm(x), r.south]);
      }
      for (
        let offset = 0;
        offset <= Math.min(180, r.north - r.south);
        offset++
      ) {
        const y = r.south + offset;
        left.push([r.west, y]);
        right.push([r.east, y]);
      }
      lines.coordinates = [top, bottom, left, right];
      ctx.beginPath();
      path(lines);
      ctx.strokeStyle = token("--accent");
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (p.section) {
      ctx.beginPath();
      const corridor = corridorLines(p.transect);
      path({ type: "LineString", coordinates: corridor.coordinates[0] || [] });
      ctx.strokeStyle = token("--ink");
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      path({
        type: "MultiLineString",
        coordinates: corridor.coordinates.slice(1),
      });
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (p.countries) {
      const occupied: {
        left: number;
        right: number;
        top: number;
        bottom: number;
      }[] = [];
      const kept = new Set<string>();
      ctx.save();
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = token("--ink-strong");
      ctx.strokeStyle = token("--globe-ocean");
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      const previous = shownLabels.current;
      const candidates = [
        ...countries.filter((country) => previous.has(country.name)),
        ...countries.filter((country) => !previous.has(country.name)),
      ];
      for (const country of candidates) {
        const alpha = countryLabelOpacity(
          country,
          [p.camera.lon, p.camera.lat],
          p.flat,
        );
        if (alpha <= 0) continue;
        const point = proj(country.coordinate);
        if (!point) continue;
        // Whole-pixel anchors: text re-antialiased at a new subpixel offset
        // every frame reads as shimmer while the globe turns.
        const leftToRight = Math.round(point[0]),
          topToBottom = Math.round(point[1]);
        const halfWidth = ctx.measureText(country.name).width / 2 + 4;
        const box = {
          left: leftToRight - halfWidth,
          right: leftToRight + halfWidth,
          top: topToBottom - 9,
          bottom: topToBottom + 9,
        };
        if (
          box.left < 4 ||
          box.right > w - 4 ||
          box.top < 4 ||
          box.bottom > h - 4
        )
          continue;
        if (
          occupied.some(
            (other) =>
              box.left < other.right &&
              box.right > other.left &&
              box.top < other.bottom &&
              box.bottom > other.top,
          )
        )
          continue;
        occupied.push(box);
        kept.add(country.name);
        ctx.globalAlpha = alpha;
        ctx.strokeText(country.name, leftToRight, topToBottom);
        ctx.fillText(country.name, leftToRight, topToBottom);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      shownLabels.current = kept;
    }
    hits.current = [];
    const ordered = [
      ...p.events.filter((e) => e.id !== p.selected),
      ...p.events.filter((e) => e.id === p.selected),
    ];
    for (const e of ordered) {
      const [lon, lat, depth] = e.geometry.coordinates;
      if (!p.flat && !visible([lon, lat], [p.camera.lon, p.camera.lat]))
        continue;
      const xy = proj([lon, lat]);
      if (!xy) continue;
      const [x, y] = xy;
      if (x < 0 || x > w || y < 0 || y > h) continue;
      const r = radius(e.properties.mag);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color(depth);
      ctx.globalAlpha = p.selected && e.id !== p.selected ? 0.75 : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = token("--marker-edge");
      ctx.lineWidth = 1;
      ctx.stroke();
      if (e.id === p.selected) {
        ctx.beginPath();
        ctx.arc(x, y, r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = token("--ink");
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (e.id === cursor && e.id !== p.selected) {
        ctx.beginPath();
        ctx.arc(x, y, r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = token("--accent");
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      hits.current.push({ e, x, y, r });
    }
  }, [
    earth,
    countries,
    plates,
    p.events,
    p.selected,
    p.camera,
    p.flat,
    p.plates,
    p.countries,
    p.region,
    p.section,
    p.transect,
    size,
    theme,
    cursor,
  ]);
  const local = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as [number, number];
  };
  const announce = (e: Event) =>
    setSpoken(
      `M ${e.properties.mag ?? "unknown"}, ${e.properties.place}, depth ${
        e.geometry.coordinates[2] ?? "unknown"
      } kilometres. Press Enter to open its details.`,
    );
  function step(delta: number) {
    const drawn = hits.current;
    if (!drawn.length) {
      setSpoken("No earthquakes are visible on this side of Earth.");
      return;
    }
    const at = drawn.findIndex((h) => h.e.id === cursor);
    const next = drawn[(at + delta + drawn.length) % drawn.length];
    setCursor(next.e.id);
    announce(next.e);
  }
  function onKeyDown(ev: KeyboardEvent) {
    const q = live.current;
    const keys: Record<string, () => void> = {
      ArrowLeft: () =>
        q.setCamera({
          ...q.camera,
          lon: ((q.camera.lon - 10 + 540) % 360) - 180,
        }),
      ArrowRight: () =>
        q.setCamera({
          ...q.camera,
          lon: ((q.camera.lon + 10 + 540) % 360) - 180,
        }),
      ArrowUp: () =>
        q.setCamera({ ...q.camera, lat: Math.min(85, q.camera.lat + 10) }),
      ArrowDown: () =>
        q.setCamera({ ...q.camera, lat: Math.max(-85, q.camera.lat - 10) }),
      "+": () =>
        q.setCamera({ ...q.camera, zoom: Math.min(2.5, q.camera.zoom + 0.2) }),
      "=": () =>
        q.setCamera({ ...q.camera, zoom: Math.min(2.5, q.camera.zoom + 0.2) }),
      "-": () =>
        q.setCamera({ ...q.camera, zoom: Math.max(0.65, q.camera.zoom - 0.2) }),
    };
    if (keys[ev.key]) {
      ev.preventDefault();
      q.pause();
      keys[ev.key]();
      return;
    }
    if (ev.key === "n" || ev.key === "N") {
      ev.preventDefault();
      q.pause();
      step(ev.shiftKey ? -1 : 1);
      return;
    }
    if (ev.key === "Enter" || ev.key === " ") {
      const target = hits.current.find((h) => h.e.id === cursor);
      if (target) {
        ev.preventDefault();
        q.onSelect(target.e);
      }
    }
  }
  const pick = (x: number, y: number) =>
    hits.current
      .filter((h) => Math.hypot(x - h.x, y - h.y) < Math.max(10, h.r + 3))
      .reverse();
  return (
    <div class="canvas-wrap">
      <canvas
        ref={ref}
        role="application"
        aria-label="Interactive Earth. Arrow keys rotate, plus and minus zoom, N steps through the earthquakes in view, Enter opens the one you land on. Every event is also in the table below."
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          p.pause();
          setChoices([]);
          ref.current!.setPointerCapture(e.pointerId);
          const q = local(e);
          pointers.current.set(e.pointerId, q);
          if (pointers.current.size === 1)
            drag.current = {
              x: q[0],
              y: q[1],
              moved: 0,
              pinch: 0,
              multi: false,
            };
          else {
            drag.current.multi = true;
            const a = [...pointers.current.values()];
            drag.current.pinch = Math.hypot(
              a[0][0] - a[1][0],
              a[0][1] - a[1][1],
            );
          }
        }}
        onPointerMove={(e) => {
          const [x, y] = local(e);
          if (pointers.current.has(e.pointerId)) {
            const old = pointers.current.get(e.pointerId)!;
            pointers.current.set(e.pointerId, [x, y]);
            drag.current.moved += Math.hypot(x - old[0], y - old[1]);
            if (pointers.current.size > 1) {
              const a = [...pointers.current.values()],
                d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]);
              if (drag.current.pinch)
                p.setCamera({
                  ...p.camera,
                  zoom: Math.min(
                    2.5,
                    Math.max(0.65, (p.camera.zoom * d) / drag.current.pinch),
                  ),
                });
              drag.current.pinch = d;
            } else
              p.setCamera({
                ...p.camera,
                lon: ((p.camera.lon - (x - old[0]) * 0.3 + 540) % 360) - 180,
                lat: Math.max(
                  -85,
                  Math.min(85, p.camera.lat + (y - old[1]) * 0.3),
                ),
              });
          } else {
            const h = pick(x, y)[0];
            setHover(
              h
                ? `M ${h.e.properties.mag ?? "—"} · ${h.e.properties.place} · ${h.e.geometry.coordinates[2] ?? "Unavailable"} km · ${new Date(h.e.properties.time).toISOString()}`
                : "",
            );
          }
        }}
        onPointerUp={(e) => {
          const [x, y] = local(e);
          pointers.current.delete(e.pointerId);
          if (!drag.current.multi && drag.current.moved < 7) {
            const h = pick(x, y);
            if (h.length === 1) p.onSelect(h[0].e);
            else if (h.length > 1) setChoices(h.map((v) => v.e));
          }
        }}
        onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
        onWheel={(e) => {
          if (document.activeElement === ref.current || e.ctrlKey) {
            e.preventDefault();
            p.pause();
            p.setCamera({
              ...p.camera,
              zoom: Math.max(
                0.65,
                Math.min(2.5, p.camera.zoom * Math.exp(-e.deltaY * 0.002)),
              ),
            });
          }
        }}
        tabIndex={0}
      />
      <p class="sr-only" aria-live="polite">
        {spoken}
      </p>
      {hover && (
        <div class="hover" role="tooltip">
          {hover}
        </div>
      )}
      {error && <p role="status">{error}</p>}
      {choices.length > 0 && (
        <div class="chooser">
          <strong>{choices.length} overlapping observations</strong>
          <button onClick={() => setChoices([])}>Close chooser</button>
          {choices.map((e) => (
            <button
              key={e.id}
              onClick={() => {
                p.onSelect(e);
                setChoices([]);
              }}
            >
              M {e.properties.mag ?? "—"} · {e.properties.place} ·{" "}
              {new Date(e.properties.time).toISOString()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
