import { geoDistance } from "d3-geo";
export type Event = {
  type: "Feature";
  id: string;
  geometry: { type: "Point"; coordinates: [number, number, number | null] };
  properties: {
    mag: number | null;
    place: string;
    time: number;
    updated: number;
    magType: string;
    status: string;
    url: string;
    type: string;
    net: string;
    felt: number | null;
    cdi: number | null;
    mmi: number | null;
    types: string;
    ids: string;
    horizontalError?: number | null;
    depthError?: number | null;
    magError?: number | null;
    gap?: number | null;
    rms?: number | null;
    dmin?: number | null;
    nst?: number | null;
  };
};
export type Dataset = {
  id: string;
  query: string;
  fetched: string;
  complete: boolean;
  stale: boolean;
  error?: string;
  data: { type: "FeatureCollection"; features: Event[] };
};
export type Region = {
  name: string;
  west: number;
  east: number;
  south: number;
  north: number;
};
export type Filters = {
  min: string;
  max: string;
  depthMin: string;
  depthMax: string;
  text: string;
  region: Region | null;
};
export const defaults: Filters = {
  min: "",
  max: "",
  depthMin: "",
  depthMax: "",
  text: "",
  region: null,
};
export function within(lon: number, lat: number, r: Region) {
  return (
    lat >= r.south &&
    lat <= r.north &&
    (r.west <= r.east
      ? lon >= r.west && lon <= r.east
      : lon >= r.west || lon <= r.east)
  );
}
export function filterEvents(events: Event[], f: Filters, cursor = Infinity) {
  return events.filter((e) => {
    const p = e.properties,
      [lon, lat, d] = e.geometry.coordinates;
    return (
      p.type === "earthquake" &&
      p.status !== "deleted" &&
      p.time <= cursor &&
      (f.min === "" || (p.mag !== null && p.mag >= +f.min)) &&
      (f.max === "" || (p.mag !== null && p.mag <= +f.max)) &&
      (f.depthMin === "" || (d !== null && d >= +f.depthMin)) &&
      (f.depthMax === "" || (d !== null && d <= +f.depthMax)) &&
      p.place?.toLowerCase().includes(f.text.toLowerCase()) &&
      (!f.region || within(lon, lat, f.region))
    );
  });
}
export const regions: Region[] = [
  { name: "Japan", west: 125, east: 150, south: 25, north: 48 },
  { name: "Alaska & Aleutians", west: 165, east: -130, south: 48, north: 73 },
  { name: "California & Nevada", west: -126, east: -113, south: 30, north: 43 },
  { name: "Tonga & Fiji", west: 170, east: -165, south: -30, north: -12 },
  { name: "Indonesia", west: 94, east: 142, south: -12, north: 8 },
  { name: "Türkiye & Syria", west: 32, east: 45, south: 33, north: 42 },
  { name: "Andes", west: -83, east: -65, south: -57, north: 5 },
  { name: "New Zealand", west: 165, east: 180, south: -48, north: -33 },
];
export function areaGroups(events: Event[]) {
  const groups = new Map<string, { region: Region; events: Event[] }>();
  for (const e of events) {
    const [lon, lat] = e.geometry.coordinates;
    const west = Math.min(160, Math.floor((lon + 180) / 20) * 20 - 180),
      south = Math.min(70, Math.floor((lat + 90) / 20) * 20 - 90);
    const key = `${west},${south}`;
    if (!groups.has(key)) {
      const name = `${Math.abs(south + 10)}°${south + 10 >= 0 ? "N" : "S"}, ${Math.abs(west + 10)}°${west + 10 >= 0 ? "E" : "W"}`;
      groups.set(key, {
        region: {
          name,
          west,
          east: west + 20,
          south,
          north: Math.min(90, south + 20),
        },
        events: [],
      });
    }
    groups.get(key)!.events.push(e);
  }
  return [...groups.values()].sort((a, b) => b.events.length - a.events.length);
}
// The stylesheet owns every colour. Canvas and SVG cannot resolve var(),
// so they read the resolved token here; the cache is cleared when the theme
// changes. Fallbacks keep the module usable under Node in tests.
const fallbacks: Record<string, string> = {
  "--depth-shallow": "#f2ac2f",
  "--depth-mid": "#b8446f",
  "--depth-deep": "#4a1d6a",
  "--depth-unknown": "#8b969c",
  "--ink": "#243740",
  "--ink-muted": "#52656d",
  "--surface": "#ffffff",
  "--accent": "#28685d",
  "--globe-ocean": "#e3eef0",
  "--globe-land": "#91adb0",
  "--globe-edge": "#b5cdd0",
  "--globe-graticule": "#bfd3d6",
  "--plate": "#865c77",
  "--plate-label": "#62445b",
  "--marker-edge": "#ffffff",
  "--chart-bar": "#28685d",
  "--chart-bar-soft": "#708f98",
  "--chart-grid": "#dbe1e3",
};
let resolved: Record<string, string> | null = null;
export function refreshPalette() {
  resolved = null;
}
export function token(name: keyof typeof fallbacks | string): string {
  if (!resolved) {
    resolved = { ...fallbacks };
    if (typeof document !== "undefined") {
      const computed = getComputedStyle(document.documentElement);
      for (const key of Object.keys(fallbacks)) {
        const value = computed.getPropertyValue(key).trim();
        if (value) resolved[key] = value;
      }
    }
  }
  return resolved[name] ?? fallbacks[name] ?? "#000";
}
export function color(depth: number | null) {
  return token(
    depth === null
      ? "--depth-unknown"
      : depth < 70
        ? "--depth-shallow"
        : depth < 300
          ? "--depth-mid"
          : "--depth-deep",
  );
}
export const radius = (mag: number | null) =>
  Math.max(3, Math.min(13, 3 + (mag ?? 0) * 1.35));
export const visible = (point: [number, number], center: [number, number]) =>
  geoDistance(point, center) < Math.PI / 2 - 0.001;
export const distance = (a: [number, number], b: [number, number]) =>
  geoDistance(a, b) * 6371.0088;
export function comparison(a: number, b: number) {
  return { amplitude: 10 ** (b - a), energy: 10 ** (1.5 * (b - a)) };
}
// Great-circle along/cross-track projection; bearings measured clockwise from north.
export function bearing(a: [number, number], b: [number, number]) {
  const r = Math.PI / 180,
    p = a[1] * r,
    q = b[1] * r,
    l = (b[0] - a[0]) * r;
  return Math.atan2(
    Math.sin(l) * Math.cos(q),
    Math.cos(p) * Math.sin(q) - Math.sin(p) * Math.cos(q) * Math.cos(l),
  );
}
export function transect(
  point: [number, number],
  a: [number, number],
  b: [number, number],
  width = 400,
) {
  const d = geoDistance(a, point),
    theta = bearing(a, point) - bearing(a, b),
    cross =
      Math.asin(Math.max(-1, Math.min(1, Math.sin(d) * Math.sin(theta)))) *
      6371.0088,
    along = Math.atan2(Math.sin(d) * Math.cos(theta), Math.cos(d)) * 6371.0088;
  return {
    along,
    cross,
    inside:
      Math.abs(cross) <= width / 2 && along >= 0 && along <= distance(a, b),
  };
}
export function csvCell(v: unknown) {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (typeof v === "string" && /^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function download(
  name: string,
  data: string,
  type = "application/json",
) {
  const u = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}

// Every zone the browser's ICU data knows, grouped by region for a select.
// Intl.supportedValuesOf is the source of truth, so no timezone table ships
// with the app; older engines fall back to UTC and the local zone alone.
export function timeZoneGroups() {
  let zones: string[] = [];
  try {
    zones = (Intl as any).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    zones = [];
  }
  const groups = new Map<string, { value: string; label: string }[]>();
  for (const zone of zones) {
    const slash = zone.indexOf("/");
    const region =
      slash < 0 ? "Other" : zone.slice(0, slash).replace(/_/g, " ");
    if (!groups.has(region)) groups.set(region, []);
    groups.get(region)!.push({
      value: zone,
      label: (slash < 0 ? zone : zone.slice(slash + 1)).replace(/_/g, " "),
    });
  }
  return [...groups].sort((a, b) => a[0].localeCompare(b[0]));
}

// Current offset from UTC, shown so a reader can place the zone without
// converting a timestamp in their head.
export function zoneOffset(zone: string, at = Date.now()) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      timeZoneName: "shortOffset",
    }).formatToParts(at);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

// Short form for headings: "UTC", or "Toronto (GMT-4)".
export function zoneLabel(zone: string) {
  if (zone === "UTC") return "UTC";
  const city = zone.slice(zone.indexOf("/") + 1).replace(/_/g, " ");
  const offset = zoneOffset(zone);
  return offset ? `${city} (${offset})` : city;
}
