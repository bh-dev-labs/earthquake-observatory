import { geoInterpolate } from "d3-geo";
import { bearing, type Event } from "./model";
import { record, validSection, type Detail, type Section } from "./data";

export function uncertainty(event: Event, detail: Detail | null) {
  const origins = detail?.properties.products?.origin;
  const preferred = Array.isArray(origins)
    ? origins
        .filter(record)
        .filter((origin) => origin.status !== "DELETE")
        .sort(
          (left, right) =>
            Number(right.preferredWeight ?? 0) -
              Number(left.preferredWeight ?? 0) ||
            Number(right.updateTime ?? 0) - Number(left.updateTime ?? 0),
        )[0]
    : null;
  const origin =
    preferred && record(preferred.properties) ? preferred.properties : {};
  return (
    [
      ["horizontalError", "horizontal-error", "Horizontal uncertainty", "km"],
      ["depthError", "depth-error", "Depth uncertainty", "km"],
      [
        "magError",
        "magnitude-error",
        "Magnitude uncertainty",
        "magnitude units",
      ],
      ["gap", "azimuthal-gap", "Azimuthal gap", "degrees"],
      ["rms", "standard-error", "Travel-time residual RMS", "s"],
      ["dmin", "minimum-distance", "Nearest-station distance", "degrees"],
      ["nst", "number-stations-used", "Stations used", ""],
    ] as const
  ).map(([key, productKey, label, unit]) => {
    const snapshot = event.properties[key];
    const raw = detail?.properties[key] ?? origin[productKey];
    const live =
      (typeof raw === "number" ||
        (typeof raw === "string" && raw.trim() !== "")) &&
      Number.isFinite(Number(raw)) &&
      Number(raw) >= 0
        ? Number(raw)
        : null;
    const value =
      snapshot != null && Number.isFinite(snapshot) && snapshot >= 0
        ? snapshot
        : live;
    return { key, label, unit, value, live: snapshot == null && value != null };
  });
}

function destination(
  point: [number, number],
  angle: number,
  kilometres: number,
): [number, number] {
  const radians = Math.PI / 180;
  const latitude = point[1] * radians;
  const delta = kilometres / 6371.0088;
  const targetLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(delta) +
      Math.cos(latitude) * Math.sin(delta) * Math.cos(angle),
  );
  const longitude =
    point[0] * radians +
    Math.atan2(
      Math.sin(angle) * Math.sin(delta) * Math.cos(latitude),
      Math.cos(delta) - Math.sin(latitude) * Math.sin(targetLatitude),
    );
  return [((longitude / radians + 540) % 360) - 180, targetLatitude / radians];
}

export function corridorLines(section: Section) {
  if (!validSection(section))
    return { type: "MultiLineString" as const, coordinates: [] };
  const interpolate = geoInterpolate(section.start, section.end);
  const center: [number, number][] = [],
    left: [number, number][] = [],
    right: [number, number][] = [];
  for (let index = 0; index <= 64; index++) {
    const fraction = index / 64;
    const point = interpolate(fraction) as [number, number];
    const ahead = interpolate(
      fraction === 1 ? fraction - 0.0001 : fraction + 0.0001,
    ) as [number, number];
    const direction = bearing(point, ahead) + (fraction === 1 ? Math.PI : 0);
    center.push(point);
    left.push(destination(point, direction - Math.PI / 2, section.width / 2));
    right.push(destination(point, direction + Math.PI / 2, section.width / 2));
  }
  return {
    type: "MultiLineString" as const,
    coordinates: [
      center,
      left,
      right,
      [left[0], center[0], right[0]],
      [left[64], center[64], right[64]],
    ],
  };
}
