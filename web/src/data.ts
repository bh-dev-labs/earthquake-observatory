import {
  defaults,
  type Dataset,
  type Event,
  type Filters,
  type Region,
} from "./model";

export type Mode =
  "hour" | "day" | "week" | "month" | "demo" | "history" | "snapshot";
// USGS publishes each recent period at five magnitude thresholds; "all" is the
// default and the largest. Ignored by the history, demo and snapshot modes.
export const levels = ["all", "1.0", "2.5", "4.5", "significant"] as const;
export type Level = (typeof levels)[number];
export type Query = {
  mode: Mode;
  start?: string;
  end?: string;
  min?: string;
  level?: Level;
};
export type Section = {
  start: [number, number];
  end: [number, number];
  width: number;
};
export const defaultSection: Section = {
  start: [170, -22],
  end: [-170, -22],
  width: 400,
};
export type View = {
  mode: Mode;
  query: Query;
  filters: Filters;
  camera: { lon: number; lat: number; zoom: number };
  flat: boolean;
  plates: boolean;
  countries: boolean;
  section: boolean;
  transect: Section;
  selected?: string;
  cursor: number | null;
  zone: string;
  near: { radius: number; hours: number } | null;
};
export type Detail = {
  type: "Feature";
  id: string;
  properties: { products?: Record<string, unknown>; [key: string]: unknown };
};
export const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const date = (value: unknown): value is number =>
  finite(value) &&
  Number.isSafeInteger(value) &&
  Math.abs(value) <= 8640000000000000;
const optionalNumber = (value: unknown) => value == null || finite(value);
const point = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  finite(value[0]) &&
  finite(value[1]) &&
  Math.abs(value[0]) <= 180 &&
  Math.abs(value[1]) <= 90;

export function validRegion(value: unknown): value is Region {
  return (
    record(value) &&
    typeof value.name === "string" &&
    point([value.west, value.south]) &&
    point([value.east, value.north]) &&
    (value.south as number) <= (value.north as number)
  );
}

export function validSection(value: unknown): value is Section {
  if (
    !record(value) ||
    !point(value.start) ||
    !point(value.end) ||
    !finite(value.width) ||
    value.width < 1 ||
    value.width > 2000
  )
    return false;
  const radians = Math.PI / 180;
  const cosine =
    Math.sin(value.start[1] * radians) * Math.sin(value.end[1] * radians) +
    Math.cos(value.start[1] * radians) *
      Math.cos(value.end[1] * radians) *
      Math.cos((value.end[0] - value.start[0]) * radians);
  return cosine < 0.99999999 && cosine > -0.99999999;
}

export function parseCollection(value: unknown): Dataset["data"] {
  if (
    !record(value) ||
    value.type !== "FeatureCollection" ||
    !Array.isArray(value.features) ||
    value.features.length > 50000
  )
    throw Error("Invalid snapshot: expected up to 50,000 GeoJSON events");
  const features = value.features.map((feature: unknown): Event => {
    if (
      !record(feature) ||
      feature.type !== "Feature" ||
      typeof feature.id !== "string" ||
      !/^[a-zA-Z0-9_-]{2,80}$/.test(feature.id) ||
      !record(feature.geometry) ||
      feature.geometry.type !== "Point" ||
      !Array.isArray(feature.geometry.coordinates) ||
      feature.geometry.coordinates.length !== 3 ||
      !point(feature.geometry.coordinates.slice(0, 2)) ||
      !optionalNumber(feature.geometry.coordinates[2]) ||
      !record(feature.properties)
    )
      throw Error("Invalid snapshot event geometry or ID");
    const properties = feature.properties;
    if (
      !date(properties.time) ||
      !date(properties.updated) ||
      !optionalNumber(properties.mag)
    )
      throw Error("Invalid snapshot event magnitude or timestamp");
    for (const key of [
      "felt",
      "cdi",
      "mmi",
      "horizontalError",
      "depthError",
      "magError",
      "gap",
      "rms",
      "dmin",
      "nst",
    ])
      if (!optionalNumber(properties[key]))
        throw Error(`Invalid snapshot field: ${key}`);
    for (const key of [
      "place",
      "magType",
      "status",
      "url",
      "type",
      "net",
      "types",
      "ids",
    ])
      if (properties[key] != null && typeof properties[key] !== "string")
        throw Error(`Invalid snapshot field: ${key}`);
    return {
      ...feature,
      properties: {
        ...properties,
        mag: properties.mag ?? null,
        felt: properties.felt ?? null,
        cdi: properties.cdi ?? null,
        mmi: properties.mmi ?? null,
        place: properties.place ?? "",
        magType: properties.magType ?? "",
        status: properties.status ?? "",
        url: properties.url ?? "",
        type: properties.type ?? "earthquake",
        net: properties.net ?? "",
        types: properties.types ?? "",
        ids: properties.ids ?? "",
      },
    } as Event;
  });
  return { type: "FeatureCollection", features };
}

export function parseDataset(value: unknown): Dataset {
  if (
    !record(value) ||
    typeof value.id !== "string" ||
    typeof value.query !== "string" ||
    typeof value.fetched !== "string" ||
    !Number.isFinite(Date.parse(value.fetched)) ||
    typeof value.complete !== "boolean" ||
    typeof value.stale !== "boolean"
  )
    throw Error("Invalid dataset envelope");
  return {
    id: value.id,
    query: value.query,
    fetched: value.fetched,
    complete: value.complete,
    stale: value.stale,
    error: typeof value.error === "string" ? value.error : undefined,
    data: parseCollection(value.data),
  };
}

export async function parseSnapshot(file: File): Promise<Dataset> {
  if (file.size > 40 * 1024 * 1024) throw Error("Snapshot exceeds 40 MiB");
  const raw: unknown = JSON.parse(await file.text());
  const data = parseCollection(raw);
  const metadata = record(raw) && record(raw.metadata) ? raw.metadata : {};
  if (typeof metadata.sha256 === "string") {
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        JSON.stringify({
          type: "FeatureCollection",
          features: (raw as Record<string, unknown>).features,
        }),
      ),
    );
    const hash = [...new Uint8Array(bytes)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    if (hash !== metadata.sha256) throw Error("Snapshot checksum mismatch");
  }
  return {
    id: typeof metadata.dataset === "string" ? metadata.dataset : "imported",
    query:
      typeof metadata.query === "string" ? metadata.query : "Imported snapshot",
    fetched:
      typeof metadata.retrieved === "string" &&
      Number.isFinite(Date.parse(metadata.retrieved))
        ? metadata.retrieved
        : new Date().toISOString(),
    complete: metadata.complete === true,
    stale: metadata.stale === true,
    data,
  };
}

export function parseQuery(value: unknown): Query {
  if (
    !record(value) ||
    !["hour", "day", "week", "month", "demo", "history", "snapshot"].includes(
      String(value.mode),
    )
  )
    throw Error("Invalid query mode");
  if (value.mode !== "history") {
    // Absent means the default; a present but unknown threshold is a
    // damaged link and is reported like any other invalid field.
    if (value.level != null && !levels.includes(value.level as Level))
      throw Error("Invalid magnitude threshold");
    return { mode: value.mode as Mode, level: (value.level as Level) ?? "all" };
  }
  if (typeof value.start !== "string" || typeof value.end !== "string")
    throw Error("Missing historical interval");
  const start = Date.parse(value.start),
    end = Date.parse(value.end);
  const min = value.min == null || value.min === "" ? "-2" : String(value.min);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    end - start > 31 * 86400000 ||
    !Number.isFinite(+min) ||
    +min < -2 ||
    +min > 10
  )
    throw Error("Invalid historical interval or magnitude");
  return {
    mode: "history",
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    min,
  };
}

export function queryURL(query: Query) {
  if (query.mode === "snapshot")
    throw Error("Reopen this snapshot from saved investigations or a file");
  if (query.mode === "demo") return "/api/demo";
  if (query.mode === "history")
    return (
      "/api/history?" +
      new URLSearchParams({
        start: query.start!,
        end: query.end!,
        min: query.min!,
      })
    );
  return (
    "/api/recent?" +
    new URLSearchParams({ period: query.mode, level: query.level ?? "all" })
  );
}

export function parseView(value: unknown): View {
  if (!record(value)) throw Error("Invalid shared view");
  const source = record(value.filters) ? value.filters : {};
  const filters: Filters = { ...defaults };
  for (const key of ["min", "max", "depthMin", "depthMax"] as const) {
    if (source[key] != null && source[key] !== "") {
      if (
        (typeof source[key] !== "string" && typeof source[key] !== "number") ||
        !Number.isFinite(Number(source[key]))
      )
        throw Error("Invalid numeric filter");
      filters[key] = String(source[key]);
    }
  }
  if (source.text != null && typeof source.text !== "string")
    throw Error("Invalid text filter");
  filters.text = typeof source.text === "string" ? source.text : "";
  if (source.region != null) {
    if (!validRegion(source.region)) throw Error("Invalid geographic bounds");
    filters.region = source.region;
  }
  const camera = record(value.camera) ? value.camera : {};
  if (value.transect != null && !validSection(value.transect))
    throw Error("Invalid transect");
  const zone = typeof value.zone === "string" ? value.zone : "UTC";
  new Intl.DateTimeFormat(undefined, { timeZone: zone });
  const query = parseQuery(
    value.query ?? {
      mode: value.mode,
      start: value.start,
      end: value.end,
      min: source.min,
    },
  );
  const near =
    record(value.near) &&
    finite(value.near.radius) &&
    finite(value.near.hours) &&
    value.near.radius >= 1 &&
    value.near.radius <= 20000 &&
    value.near.hours >= 1 &&
    value.near.hours <= 744
      ? { radius: value.near.radius, hours: value.near.hours }
      : null;
  return {
    mode: query.mode,
    query,
    filters,
    camera: {
      lon: finite(camera.lon) ? Math.max(-180, Math.min(180, camera.lon)) : 150,
      lat: finite(camera.lat) ? Math.max(-85, Math.min(85, camera.lat)) : 15,
      zoom: finite(camera.zoom)
        ? Math.max(0.65, Math.min(2.5, camera.zoom))
        : 1,
    },
    flat: value.flat === true,
    plates: value.plates === true,
    countries: value.countries === true,
    section: value.section === true,
    transect: validSection(value.transect) ? value.transect : defaultSection,
    selected: typeof value.selected === "string" ? value.selected : undefined,
    cursor: date(value.cursor) ? value.cursor : null,
    zone,
    near,
  };
}

export function clampPage(page: number, count: number) {
  return Math.max(0, Math.min(page, Math.ceil(count / 40) - 1));
}
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Operation failed";

export type CachedDetail = { detail: Detail; fetched: number; updated: number };
export function freshDetail(
  cached: CachedDetail | undefined,
  updated: number,
  now = Date.now(),
): cached is CachedDetail {
  return (
    !!cached &&
    cached.updated === updated &&
    now >= cached.fetched &&
    now - cached.fetched < 300000
  );
}
export function parseDetail(value: unknown, id: string): Detail {
  if (
    !record(value) ||
    value.type !== "Feature" ||
    value.id !== id ||
    !record(value.properties) ||
    (value.properties.products != null && !record(value.properties.products))
  )
    throw Error("Invalid event detail response");
  return value as Detail;
}

export class RequestGate {
  private ticket = 0;
  private controller: AbortController | null = null;
  cancel() {
    this.controller?.abort();
    return ++this.ticket;
  }
  checkpoint() {
    return this.ticket;
  }
  start() {
    this.cancel();
    this.controller = new AbortController();
    return { ticket: this.ticket, signal: this.controller.signal };
  }
  current(ticket: number) {
    return ticket === this.ticket;
  }
}
