import type { Dataset, Event } from "./model";
import { parseDataset, parseView, record, type View } from "./data";

export type Investigation = {
  id: string;
  name: string;
  notes: string;
  created: string;
  bytes: number;
};
export type SavedInvestigation = Investigation & {
  snapshot: Dataset;
  view: View;
};
export type CacheEntry = {
  id: string;
  query: string;
  fetched: string;
  bytes: number;
  events: number;
};
export type CacheInfo = {
  entries: CacheEntry[];
  cacheBytes: number;
  pinnedBytes: number;
  databaseBytes: number;
};
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw Error(
      record(value) && typeof value.error === "string"
        ? value.error
        : `Operation failed (HTTP ${response.status})`,
    );
  return value as T;
}
export async function readInvestigation(
  id: string,
): Promise<SavedInvestigation> {
  const value = await api<SavedInvestigation>(
    "/api/investigations/" + encodeURIComponent(id),
  );
  return {
    ...value,
    snapshot: parseDataset(value.snapshot),
    view: parseView(value.view),
  };
}
type Scalar = string | number | null;
export type Revision = {
  before: Event;
  after: Event;
  changes: { field: string; before: Scalar; after: Scalar }[];
};
const fields: { name: string; value: (event: Event) => Scalar }[] = [
  { name: "Event ID", value: (event) => event.id },
  { name: "Magnitude", value: (event) => event.properties.mag },
  { name: "Magnitude type", value: (event) => event.properties.magType },
  { name: "Depth (km)", value: (event) => event.geometry.coordinates[2] },
  { name: "Longitude", value: (event) => event.geometry.coordinates[0] },
  { name: "Latitude", value: (event) => event.geometry.coordinates[1] },
  { name: "Origin time", value: (event) => event.properties.time },
  { name: "Review status", value: (event) => event.properties.status },
  { name: "Description", value: (event) => event.properties.place },
  { name: "Felt reports", value: (event) => event.properties.felt },
  { name: "CDI", value: (event) => event.properties.cdi },
  { name: "MMI", value: (event) => event.properties.mmi },
];
const latest = (events: Event[]) => {
  const values = new Map<string, Event>();
  for (const event of events) {
    const previous = values.get(event.id);
    if (!previous || event.properties.updated >= previous.properties.updated)
      values.set(event.id, event);
  }
  return values;
};
export function compareSnapshots(before: Event[], after: Event[]) {
  const older = latest(before),
    newer = latest(after);
  const aliases = new Map<string, Event>();
  for (const event of newer.values())
    for (const id of event.properties.ids?.split(",") ?? [])
      if (id) aliases.set(id, event);
  const matched = new Set<string>();
  const missing: Event[] = [],
    changed: Revision[] = [];
  for (const previous of older.values()) {
    const current = newer.get(previous.id) ?? aliases.get(previous.id);
    if (!current) {
      missing.push(previous);
      continue;
    }
    matched.add(current.id);
    const changes = fields
      .map((field) => ({
        field: field.name,
        before: field.value(previous) ?? null,
        after: field.value(current) ?? null,
      }))
      .filter((change) => change.before !== change.after);
    if (changes.length)
      changed.push({ before: previous, after: current, changes });
  }
  return {
    changed,
    missing,
    added: [...newer.values()].filter((event) => !matched.has(event.id)),
  };
}
