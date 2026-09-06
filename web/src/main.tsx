import { render } from "preact";
import {
  useEffect,
  useRef,
  useState,
  useMemo,
  useLayoutEffect,
} from "preact/hooks";
import { Globe, type Camera } from "./Globe";
import { Analysis } from "./Analysis";
import { EventTable } from "./EventTable";
import { SelectedEvent } from "./SelectedEvent";
import { Replay } from "./Replay";
import { ActivityAreas } from "./ActivityAreas";
import { EarthPanel } from "./EarthPanel";
import { useStable } from "./hooks";
import { sources, glossary, lessons } from "./content";
import {
  areaGroups,
  color,
  csvCell,
  defaults,
  distance,
  download,
  filterEvents,
  regions,
  type Dataset,
  type Event,
  type Filters,
  type Region,
} from "./model";
import "./style.css";
const repository = "https://github.com/bruce-hoppe_uoft/seismic_atlas";
type SortKey = "mag" | "place" | "depth" | "time" | "status";
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
const storedAuto = () => {
  try {
    return (
      localStorage.getItem("auto") === "true" &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
};
function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null),
    [mode, setMode] = useState("day"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [filters, setFilters] = useState<Filters>({ ...defaults }),
    [camera, setCamera] = useState<Camera>({ lon: 150, lat: 15, zoom: 1 }),
    [flat, setFlat] = useState(false),
    [plates, setPlates] = useState(false),
    [selected, setSelected] = useState<Event | null>(null),
    [auto, setAuto] = useState(storedAuto),
    [autoWanted, setAutoWanted] = useState(storedAuto),
    [speed, setSpeed] = useState(1),
    [playing, setPlaying] = useState(false),
    [cursor, setCursor] = useState(Infinity),
    [replaySpeed, setReplaySpeed] = useState(1),
    [textPage, setTextPage] = useState(""),
    [learn, setLearn] = useState(false),
    [lesson, setLesson] = useState(-1),
    [step, setStep] = useState(0),
    [section, setSection] = useState(false),
    [sort, setSort] = useState<SortKey>("time"),
    [descending, setDescending] = useState(true),
    [page, setPage] = useState(0),
    [start, setStart] = useState("2023-02-06"),
    [end, setEnd] = useState("2023-02-13"),
    [history, setHistory] = useState(false),
    [detail, setDetail] = useState<any>(null),
    [detailError, setDetailError] = useState(""),
    [detailBusy, setDetailBusy] = useState(false),
    [near, setNear] = useState(false),
    [nearRadius, setNearRadius] = useState(300),
    [nearHours, setNearHours] = useState(24),
    [zone, setZone] = useState("UTC"),
    [version, setVersion] = useState("");
  const abort = useRef<AbortController | null>(null),
    selectionToken = useRef(0),
    cache = useRef(new Map<string, any>()),
    saved = useRef<any>(null),
    detailHeading = useRef<HTMLHeadingElement>(null),
    selectionOrigin = useRef<HTMLElement | null>(null),
    request = useRef(0),
    initialized = useRef(false),
    loadRef = useRef<any>(null);
  const modalState = useRef(textPage);
  modalState.current = textPage;
  useLayoutEffect(() => {
    if (!textPage) return;
    const previous = document.activeElement as HTMLElement;
    document.querySelector<HTMLButtonElement>(".modal-close")?.focus();
    return () => previous?.focus();
  }, [textPage]);
  const lessonSession = useRef(0);
  const motion = useRef(0);
  const pause = () => {
    cancelAnimationFrame(motion.current);
    setAuto(false);
    setPlaying(false);
  };
  const change = (key: keyof Filters, value: any) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  };
  async function load(next: string, url?: string) {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const ticket = ++request.current;
    setBusy(true);
    setError("");
    setPlaying(false);
    try {
      const response = await fetch(
        url || (next === "demo" ? "/api/demo" : "/api/recent?period=" + next),
        { signal: controller.signal },
      );
      const d = await response.json();
      if (!response.ok) throw Error(d.error || "Data retrieval failed");
      if (ticket !== request.current) return;
      setDataset(d);
      setMode(next);
      setCursor(Infinity);
      setPage(0);
      setSelected((prev) => {
        if (!prev) return prev;
        const current = d.data.features.find(
          (e: Event) =>
            e.id === prev.id || e.properties.ids?.split(",").includes(prev.id),
        );
        if (current && current.id !== prev.id)
          setMessage(
            `USGS now identifies the selected event as ${current.id} (previously ${prev.id}).`,
          );
        if (
          current &&
          current.id === prev.id &&
          current.properties.updated !== prev.properties.updated
        )
          setMessage("The selected event has been revised by USGS.");
        return current || prev;
      });
    } catch (e: any) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      if (ticket === request.current) setBusy(false);
    }
  }
  loadRef.current = load;
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const q = new URLSearchParams(location.search);
    try {
      const state = JSON.parse(q.get("view") || "null");
      if (state) {
        if (
          ["day", "week", "hour", "month", "demo", "history"].includes(
            state.mode,
          )
        ) {
          if (state.filters && typeof state.filters.text === "string") {
            const f = { ...defaults, ...state.filters };
            for (const key of ["min", "max", "depthMin", "depthMax"])
              if (f[key] !== "" && !Number.isFinite(+f[key])) f[key] = "";
            if (
              f.region &&
              ![
                f.region.west,
                f.region.east,
                f.region.north,
                f.region.south,
              ].every(Number.isFinite)
            )
              f.region = null;
            setFilters(f);
          }
          if (
            state.camera &&
            Number.isFinite(state.camera.lon) &&
            Number.isFinite(state.camera.lat)
          )
            setCamera({
              lon: Math.max(-180, Math.min(180, state.camera.lon)),
              lat: Math.max(-85, Math.min(85, state.camera.lat)),
              zoom: Math.max(0.65, Math.min(2.5, state.camera.zoom || 1)),
            });
          setFlat(!!state.flat);
          setStart(state.start || start);
          setEnd(state.end || end);
          load(
            state.mode,
            state.mode === "history"
              ? `/api/history?start=${encodeURIComponent(new Date(state.start).toISOString())}&end=${encodeURIComponent(new Date(state.end).toISOString())}&min=${encodeURIComponent(state.filters?.min || "-2")}`
              : undefined,
          ).then(() => {
            if (state.selected) selectionToken.current = -1;
            if (Number.isFinite(state.cursor)) setCursor(state.cursor);
            if (state.zone) {
              try {
                new Intl.DateTimeFormat(undefined, { timeZone: state.zone });
                setZone(state.zone);
              } catch {}
            }
            setPlates(!!state.plates);
            setSection(!!state.section);
          });
          return;
        }
      }
    } catch {
      setMessage("The shared view was invalid; showing defaults.");
    }
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => load(c.demo ? "demo" : "day"))
      .catch(() => load("demo"));
  }, []);
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((h) => setVersion(h.version))
      .catch(() => {});
  }, []);
  useEffect(() => {
    const id = setInterval(() => {
      if (
        !document.hidden &&
        !busy &&
        !playing &&
        !selected &&
        lesson < 0 &&
        ["hour", "day", "week", "month"].includes(mode)
      )
        loadRef.current(mode);
    }, 60000);
    return () => clearInterval(id);
  }, [mode, busy, playing, selected, lesson]);
  useEffect(() => {
    if (dataset && selectionToken.current === -1) {
      const state = JSON.parse(
        new URLSearchParams(location.search).get("view") || "{}",
      );
      const e = dataset.data.features.find((e) => e.id === state.selected);
      selectionToken.current = 0;
      if (e) choose(e);
    }
  }, [dataset]);
  const all = useMemo(() => {
    const latest = new Map<string, Event>();
    for (const e of dataset?.data.features || []) {
      const old = latest.get(e.id);
      if (!old || e.properties.updated >= old.properties.updated)
        latest.set(e.id, e);
    }
    return [...latest.values()];
  }, [dataset]);
  const filtered = useMemo(() => {
    let result = filterEvents(all, filters, cursor);
    if (near && selected)
      result = result.filter(
        (e) =>
          distance(
            e.geometry.coordinates.slice(0, 2) as [number, number],
            selected.geometry.coordinates.slice(0, 2) as [number, number],
          ) <= nearRadius &&
          Math.abs(e.properties.time - selected.properties.time) <=
            nearHours * 3600000,
      );
    return result;
  }, [all, filters, cursor, near, selected, nearRadius, nearHours]);
  const ordered = useMemo(() => {
    const direction = descending ? -1 : 1;
    const value = (e: Event) =>
      sort === "mag"
        ? (e.properties.mag ?? -Infinity)
        : sort === "depth"
          ? (e.geometry.coordinates[2] ?? Infinity)
          : sort === "place"
            ? e.properties.place || ""
            : sort === "status"
              ? e.properties.status || ""
              : e.properties.time;
    return [...filtered].sort((a, b) => {
      const x = value(a),
        y = value(b);
      return typeof x === "string" || typeof y === "string"
        ? direction * String(x).localeCompare(String(y))
        : direction * (x - y);
    });
  }, [filtered, sort, descending]);
  // Each column opens in the direction people expect to read it first.
  function sortBy(key: SortKey) {
    if (key === sort) setDescending(!descending);
    else {
      setSort(key);
      setDescending(key === "time" || key === "mag");
    }
    setPage(0);
  }
  const areas = useMemo(
    () =>
      areaGroups(filterEvents(all, { ...filters, region: null }, cursor)).slice(
        0,
        10,
      ),
    [all, filters, cursor],
  );
  const reported =
    !!selected &&
    (selected.properties.felt != null ||
      selected.properties.cdi != null ||
      selected.properties.mmi != null);
  const custom =
    !!filters.region && !regions.some((r) => r.name === filters.region!.name);
  const times = useMemo(() => all.map((e) => e.properties.time), [all]),
    lo = times.length ? Math.min(...times) : 0,
    hi = times.length ? Math.max(...times) : 1;
  useEffect(() => {
    if (!playing) return;
    let frame = 0,
      last = 0;
    const tick = (t: number) => {
      if (document.hidden) {
        last = 0;
      } else {
        if (last)
          setCursor((c) => {
            const n =
              (Number.isFinite(c) ? c : lo) +
              ((t - last) / 1000) * Math.max(1, (hi - lo) / 60) * replaySpeed;
            if (n >= hi) {
              setPlaying(false);
              return hi;
            }
            return n;
          });
        last = t;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, replaySpeed, lo, hi]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (modalState.current) setTextPage("");
        else closeSelection();
      }
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, []);
  const stableChoose = useStable((e: Event) => choose(e));
  const stableClose = useStable(() => closeSelection());
  const stablePause = useStable(() => pause());
  const stableToggleAuto = useStable(() => toggleAuto());
  const clearRegion = useStable(() => {
    change("region", null);
    setNear(false);
  });
  const stableShare = useStable(() => share());
  const stableGetDetail = useStable((e: Event) => getDetail(e));
  const centreOnSelection = useStable(() => {
    if (!selected) return;
    pause();
    setCamera({
      ...camera,
      lon: selected.geometry.coordinates[0],
      lat: selected.geometry.coordinates[1],
    });
  });
  const stableChange = useStable((key: keyof Filters, value: any) =>
    change(key, value),
  );
  const stableFocusRegion = useStable((r: Region) => focusRegion(r));
  const stableSortBy = useStable((key: SortKey) => sortBy(key));
  const stableDisplayTime = useStable((t: number) => displayTime(t));
  const stableExport = useStable((kind: string) => exportData(kind));
  const importSnapshot = useStable(async (file: File) => {
    try {
      if (file.size > 40 * 1024 * 1024) throw Error("Snapshot exceeds 40 MiB");
      const d = JSON.parse(await file.text());
      if (
        d.type !== "FeatureCollection" ||
        !Array.isArray(d.features) ||
        d.features.length > 50000 ||
        !d.features.every(
          (e: any) =>
            typeof e.id === "string" &&
            e.geometry?.type === "Point" &&
            e.geometry.coordinates?.length === 3 &&
            e.geometry.coordinates.slice(0, 2).every(Number.isFinite) &&
            Math.abs(e.geometry.coordinates[0]) <= 180 &&
            Math.abs(e.geometry.coordinates[1]) <= 90 &&
            Number.isFinite(e.properties?.time) &&
            typeof e.properties?.place === "string",
        )
      )
        throw Error("Invalid snapshot");
      pause();
      setDataset({
        id: d.metadata?.dataset || "imported",
        query: d.metadata?.query || "Imported snapshot",
        fetched: d.metadata?.retrieved || new Date().toISOString(),
        complete: !!d.metadata?.complete,
        stale: false,
        data: d,
      });
      setMode("history");
      setFilters({ ...defaults });
      setCursor(Infinity);
      setSelected(null);
      setMessage(
        "Snapshot reopened locally. No upstream retrieval was needed.",
      );
    } catch (err: any) {
      setError(err.message);
    }
  });
  function closeSelection() {
    selectionToken.current++;
    setSelected(null);
    setDetail(null);
    setNear(false);
    selectionOrigin.current?.focus();
  }
  async function getDetail(e: Event) {
    const token = ++selectionToken.current;
    setDetail(null);
    setDetailError("");
    setDetailBusy(false);
    if (cache.current.has(e.id)) {
      setDetail(cache.current.get(e.id));
      return;
    }
    setDetailBusy(true);
    try {
      const r = await fetch("/api/detail/" + encodeURIComponent(e.id));
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      cache.current.set(e.id, d);
      if (token === selectionToken.current) setDetail(d);
    } catch (err: any) {
      if (token === selectionToken.current)
        setDetailError(err.message || "Additional observations unavailable");
    } finally {
      if (token === selectionToken.current) setDetailBusy(false);
    }
  }
  function choose(e: Event) {
    pause();
    selectionOrigin.current = document.activeElement as HTMLElement;
    setSelected(e);
    setNear(false);
    const target = {
      ...camera,
      lon: e.geometry.coordinates[0],
      lat: e.geometry.coordinates[1],
    };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches)
      setCamera(target);
    else {
      const begin = performance.now(),
        from = { ...camera },
        delta = ((target.lon - from.lon + 540) % 360) - 180;
      const move = (t: number) => {
        const k = Math.min(1, (t - begin) / 420),
          ease = k * k * (3 - 2 * k);
        setCamera({
          ...from,
          lon: ((from.lon + delta * ease + 540) % 360) - 180,
          lat: from.lat + (target.lat - from.lat) * ease,
        });
        if (k < 1) motion.current = requestAnimationFrame(move);
      };
      motion.current = requestAnimationFrame(move);
    }
    getDetail(e);
    setTimeout(() => {
      detailHeading.current?.focus({ preventScroll: true });
      if (innerWidth > 720)
        detailHeading.current?.scrollIntoView({ block: "nearest" });
    }, 0);
  }
  function focusRegion(r: Region) {
    pause();
    change("region", r);
    let east = r.east < r.west ? r.east + 360 : r.east;
    setCamera({
      lon: (((r.west + east) / 2 + 540) % 360) - 180,
      lat: (r.north + r.south) / 2,
      zoom: 1.35,
    });
  }
  function toggleAuto() {
    const next = !auto;
    setAuto(next);
    setAutoWanted(next);
    localStorage.setItem("auto", String(next));
    if (next) setPlaying(false);
  }
  async function share() {
    const value = {
      mode,
      filters,
      camera,
      flat,
      start,
      end,
      selected: selected?.id,
      cursor: Number.isFinite(cursor) ? cursor : null,
      zone,
      plates,
      section,
    };
    const u = new URL(location.href);
    u.search = "";
    u.searchParams.set("view", JSON.stringify(value));
    try {
      await navigator.clipboard.writeText(u.href);
      setMessage(
        "View link copied. It reapplies a query; export a snapshot for an immutable record.",
      );
    } catch {
      setMessage(u.href);
    }
  }
  async function exportData(kind: string) {
    if (!dataset) return;
    const frozen = { type: "FeatureCollection", features: filtered },
      canonical = JSON.stringify(frozen);
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(canonical),
    );
    const hash = [...new Uint8Array(bytes)]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    const meta = {
      version,
      source: "USGS",
      dataset: dataset.id,
      query: dataset.query,
      retrieved: dataset.fetched,
      complete: dataset.complete,
      stale: dataset.stale,
      filters,
      cursor: Number.isFinite(cursor) ? new Date(cursor).toISOString() : null,
      near: near
        ? { event: selected?.id, radiusKm: nearRadius, hours: nearHours }
        : null,
      timeZone: zone,
      sha256: hash,
      fieldDefinitions: {
        coordinates: "longitude degrees, latitude degrees, source depth km",
        mag: "reported magnitude; type in magType",
        time: "UTC epoch milliseconds",
      },
      count: filtered.length,
    };
    if (kind === "csv") {
      const rows = [
        [
          "id",
          "magnitude",
          "magnitude_type",
          "place",
          "longitude",
          "latitude",
          "depth_km",
          "time_utc",
          "review_status",
        ],
        ...filtered.map((e) => [
          e.id,
          e.properties.mag,
          e.properties.magType,
          e.properties.place,
          ...e.geometry.coordinates,
          utc(e.properties.time),
          e.properties.status,
        ]),
      ];
      download(
        "earthquakes.csv",
        rows.map((r) => r.map(csvCell).join(",")).join("\r\n"),
        "text/csv;charset=utf-8",
      );
      download("earthquakes.metadata.json", JSON.stringify(meta, null, 2));
    } else
      download(
        "earthquakes.snapshot.json",
        JSON.stringify({ ...frozen, metadata: meta }, null, 2),
      );
    setMessage(
      `Exported ${filtered.length} observations from the current filters and replay cursor.`,
    );
  }
  function chartExport() {
    const svg = document
      .querySelector("#timeline-chart")!
      .cloneNode(true) as SVGElement;
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("viewBox", "0 0 520 300");
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", "10");
    text.setAttribute("y", "248");
    text.setAttribute("font-size", "8");
    text.textContent = `Query: ${dataset?.query}`;
    svg.append(text);
    const label = text.cloneNode() as SVGTextElement;
    label.setAttribute("y", "265");
    label.textContent = `Filters: M ${filters.min || "any"} to ${filters.max || "any"}; depth ${filters.depthMin || "any"} to ${filters.depthMax || "any"} km; ${filters.region?.name || "global"}; text ${filters.text || "none"}`;
    svg.append(label);
    download(
      "earthquake-timeline.svg",
      new XMLSerializer().serializeToString(svg),
      "image/svg+xml",
    );
  }
  async function startLesson(i: number) {
    const session = ++lessonSession.current;
    if (lesson < 0)
      saved.current = {
        dataset,
        mode,
        filters,
        camera,
        selected,
        cursor,
        plates,
        flat,
      };
    pause();
    setLesson(i);
    setStep(0);
    setSelected(null);
    setFilters({ ...defaults });
    setSection(i === 1);
    await load("demo");
    if (session !== lessonSession.current) return;
    if (i === 1) focusRegion(regions[3]);
    else if (i === 3) focusRegion(regions[5]);
    else setCamera({ lon: 150, lat: 15, zoom: 1 });
    setPlates(i === 0);
  }
  function returnExplore() {
    lessonSession.current++;
    abort.current?.abort();
    request.current++;
    setBusy(false);
    pause();
    if (saved.current) {
      const s = saved.current;
      setDataset(s.dataset);
      setMode(s.mode);
      setFilters(s.filters);
      setCamera(s.camera);
      setSelected(s.selected);
      setCursor(s.cursor);
      setPlates(s.plates);
      setFlat(s.flat);
    }
    setLesson(-1);
    setLearn(false);
    setSection(false);
  }
  const displayTime = (t: number) =>
    zone === "UTC"
      ? utc(t)
      : new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "long",
          timeZone: zone,
        }).format(t);
  const products = useMemo(() => detail?.properties?.products || {}, [detail]);
  return (
    <>
      <a href="#events" class="skip">
        Skip to event list
      </a>
      <main>
        <header>
          <div class="brand">
            <span class="brand-mark" aria-hidden="true">
              ◎
            </span>
            <div>
              <h1>Earthquake Observatory</h1>
              <p>Explore our restless planet</p>
            </div>
          </div>
          <nav aria-label="Main">
            <button
              class={!learn ? "active" : ""}
              onClick={() => (lesson >= 0 ? returnExplore() : setLearn(false))}
            >
              Explore
            </button>
            <button
              class={learn ? "active" : ""}
              onClick={() => setLearn(true)}
            >
              Learn
            </button>
            <button onClick={() => setTextPage("About & references")}>
              About
            </button>
          </nav>
          <span class="status">
            {mode === "demo"
              ? "Historical demonstration"
              : mode === "history"
                ? "Historical catalog"
                : "USGS recent observations"}
          </span>
        </header>
        <div class="toolbar">
          <label>
            Period{" "}
            <select
              value={mode}
              disabled={busy || lesson >= 0}
              onChange={(e) => {
                const v = e.currentTarget.value;
                if (v === "history") setHistory(true);
                else {
                  setHistory(false);
                  load(v);
                }
              }}
            >
              <option value="hour">Past hour</option>
              <option value="day">Past 24 hours</option>
              <option value="week">Past 7 days</option>
              <option value="month">Past 30 days</option>
              <option value="history">Custom history…</option>
              <option value="demo">Offline historical demo</option>
            </select>
          </label>
          <div class="range-field" role="group" aria-label="Magnitude range">
            <span class="range-label">Magnitude</span>
            <label>
              from{" "}
              <input
                type="number"
                min="-2"
                max="10"
                step="0.1"
                placeholder="Any"
                value={filters.min}
                onInput={(e) => change("min", e.currentTarget.value)}
              />
            </label>
            <label>
              to{" "}
              <input
                type="number"
                min="-2"
                max="10"
                step="0.1"
                placeholder="Any"
                value={filters.max}
                onInput={(e) => change("max", e.currentTarget.value)}
              />
            </label>
          </div>
          <button
            onClick={() => load(mode)}
            disabled={busy || mode === "history" || lesson >= 0}
          >
            {busy ? "Retrieving…" : "Refresh data"}
          </button>
          <button onClick={share}>Copy view link</button>
          <span class="muted">{filtered.length} earthquakes</span>
        </div>
        {history && (
          <form
            class="history"
            onSubmit={(e) => {
              e.preventDefault();
              load(
                "history",
                `/api/history?start=${encodeURIComponent(new Date(start + "T00:00:00Z").toISOString())}&end=${encodeURIComponent(new Date(end + "T00:00:00Z").toISOString())}&min=${filters.min || "-2"}`,
              );
            }}
          >
            <label>
              Start, inclusive UTC{" "}
              <input
                type="date"
                required
                value={start}
                onInput={(e) => setStart(e.currentTarget.value)}
              />
            </label>
            <label>
              End, exclusive UTC{" "}
              <input
                type="date"
                required
                value={end}
                onInput={(e) => setEnd(e.currentTarget.value)}
              />
            </label>
            <button disabled={busy}>Retrieve history</button>
            <p>
              Up to 31 days, 50,000 events and 2 minutes. A failed or cancelled
              search preserves the previous dataset.
            </p>
          </form>
        )}
        {busy && (
          <div class="notice" role="status">
            {dataset
              ? "Retrieving a replacement dataset; the previous snapshot remains visible."
              : "Loading USGS observations…"}{" "}
            <button
              onClick={() => {
                abort.current?.abort();
                setBusy(false);
                setMessage("Retrieval cancelled.");
              }}
            >
              Cancel retrieval
            </button>
          </div>
        )}
        {error && (
          <div class="notice error" role="alert">
            {error}. <button onClick={() => load(mode)}>Retry</button>
            <button onClick={() => load("demo")}>
              Open offline historical demo
            </button>
          </div>
        )}
        {message && (
          <div class="notice" role="status">
            {message}
            <button onClick={() => setMessage("")}>Dismiss</button>
          </div>
        )}
        {dataset && (
          <div class={"freshness " + (dataset.stale ? "stale" : "")}>
            {dataset.stale
              ? "Stale cached observations — refresh failed. "
              : ""}
            {mode === "demo"
              ? "Bundled historical observations · 6–12 February 2023 · M4+ · not live. "
              : ""}
            Retrieved {new Date(dataset.fetched).toLocaleString()} ·{" "}
            {dataset.complete ? "Retrieval complete" : "Partial retrieval"} ·
            Earthquake types only
          </div>
        )}
        {learn && (
          <section class="learning">
            <h2>Learn with real observations</h2>
            {lesson < 0 ? (
              <>
                <p>
                  Four guided activities use a fixed USGS snapshot. Your
                  exploration is restored when you return.
                </p>
                <div class="lesson-grid">
                  {lessons.map((l, i) => (
                    <button key={l.title} onClick={() => startLesson(i)}>
                      {l.title}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h3>{lessons[lesson].question}</h3>
                <p>
                  Step {step + 1} of 3: {lessons[lesson].steps[step]}
                </p>
                <div class="button-row">
                  <button onClick={() => startLesson(lesson)}>
                    Reset activity
                  </button>
                  <button
                    disabled={step === 0}
                    onClick={() => setStep(step - 1)}
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => {
                      if (step < 2) setStep(step + 1);
                      else
                        setMessage(
                          "Activity complete. Reflection: " +
                            lessons[lesson].reflection,
                        );
                    }}
                  >
                    {step < 2 ? "Next step" : "Complete & reflect"}
                  </button>
                  <button onClick={returnExplore}>
                    Return to my exploration
                  </button>
                </div>
                <p>
                  {lessons[lesson].explain}{" "}
                  <a
                    href={sources[lessons[lesson].source].url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Read the source
                  </a>
                </p>
                {lesson === 1 && (
                  <button onClick={() => setSection(!section)}>
                    {section ? "Hide" : "Open"} depth section
                  </button>
                )}
                {lesson === 2 && (
                  <a href="#analysis">Open magnitude comparison in Analysis</a>
                )}
              </>
            )}
          </section>
        )}
        <section class="observatory">
          <EarthPanel
            events={filtered}
            selectedId={selected?.id || ""}
            onSelect={stableChoose}
            camera={camera}
            setCamera={setCamera}
            flat={flat}
            setFlat={setFlat}
            plates={plates}
            setPlates={setPlates}
            region={filters.region}
            section={section}
            auto={auto}
            autoWanted={autoWanted}
            toggleAuto={stableToggleAuto}
            speed={speed}
            setSpeed={setSpeed}
            pause={stablePause}
          />
          <aside class="details" aria-label="Earthquake information">
            {selected ? (
              <SelectedEvent
                selected={selected}
                inView={filtered.some((e) => e.id === selected.id)}
                zone={zone}
                displayTime={stableDisplayTime}
                closeSelection={stableClose}
                detailHeading={detailHeading}
                setTextPage={setTextPage}
                reported={reported}
                detailBusy={detailBusy}
                detailError={detailError}
                getDetail={stableGetDetail}
                products={products}
                detailLoaded={!!detail}
                fetched={dataset?.fetched || ""}
                centreOnSelection={centreOnSelection}
                share={stableShare}
                near={near}
                setNear={setNear}
                nearRadius={nearRadius}
                setNearRadius={setNearRadius}
                nearHours={nearHours}
                setNearHours={setNearHours}
              />
            ) : (
              <>
                <p class="eyebrow">Explore the observations</p>
                <h2>Select an earthquake</h2>
                <p>
                  Tap a marker on Earth or choose an event from the list. Its
                  magnitude, depth and source information will appear here.
                </p>
                <div class="selection-illustration" aria-hidden="true">
                  <span>◎</span>
                  <div>
                    Surface location
                    <br />
                    <small>↓ source depth</small>
                  </div>
                </div>
                <h3>A moving planet, carefully observed</h3>
                <p>
                  Marker colour follows one scale from light to dark: the palest
                  markers are shallower than 70 km, the darkest are deeper than
                  300 km.
                </p>
                <p>
                  The globe shows epicentres. Rotating Earth changes your
                  viewpoint; it does not change global counts.
                </p>
                <button onClick={() => setTextPage("Glossary")}>
                  Understand the terms
                </button>
                <hr />
                <h3>Start with an area</h3>
                <p>
                  Choose a current activity area below to focus the globe and
                  see its recorded earthquakes.
                </p>
              </>
            )}
          </aside>
        </section>
        <Replay
          mode={mode}
          cursor={cursor}
          setCursor={setCursor}
          displayTime={stableDisplayTime}
          hasEvents={all.length > 0}
          playing={playing}
          setPlaying={setPlaying}
          setAuto={setAuto}
          lo={lo}
          hi={hi}
          replaySpeed={replaySpeed}
          setReplaySpeed={setReplaySpeed}
        />
        <ActivityAreas
          mode={mode}
          areas={areas}
          activeRegion={filters.region?.name || ""}
          focusRegion={stableFocusRegion}
          clearRegion={clearRegion}
        />
        <EventTable
          filtered={filtered}
          ordered={ordered}
          zone={zone}
          setZone={setZone}
          filters={filters}
          change={stableChange}
          custom={custom}
          focusRegion={stableFocusRegion}
          setFilters={setFilters}
          setNear={setNear}
          sort={sort}
          descending={descending}
          sortBy={stableSortBy}
          selectedId={selected?.id || ""}
          choose={stableChoose}
          displayTime={stableDisplayTime}
          page={page}
          setPage={setPage}
          hasDataset={!!dataset}
          exportData={stableExport}
          importSnapshot={importSnapshot}
        />
        <Analysis
          events={filtered}
          selected={selected?.id || ""}
          select={stableChoose}
          section={section}
          query={dataset?.query || ""}
        />
        <div class="chart-actions">
          <button onClick={chartExport}>Export timeline SVG</button>
          <button onClick={() => setSection(!section)}>
            {section ? "Hide" : "Show"} Tonga depth section
          </button>
        </div>
        <footer>
          <a href={repository} target="_blank" rel="noreferrer">
            Built by Bruce Hoppe · Source on GitHub
          </a>
          <div>
            <strong>Data & references</strong>
            <a href={sources[0].url} target="_blank" rel="noreferrer">
              Earthquake data: USGS
            </a>
            <a href={sources[1].url} target="_blank" rel="noreferrer">
              Historical catalog
            </a>
            <a href={sources[4].url} target="_blank" rel="noreferrer">
              Earthquake science
            </a>
            <button onClick={() => setTextPage("Map & globe credits")}>
              Map & globe credits
            </button>
            <button onClick={() => setTextPage("Sources & references")}>
              All references
            </button>
          </div>
          <p>
            {mode === "demo"
              ? "Bundled historical USGS observations, not live."
              : "USGS observations; catalog solutions may change."}{" "}
            An educational observatory, not a prediction or emergency warning
            service. No USGS endorsement.
          </p>
          <div class="shutdown">
            <button
              class="quit"
              onClick={async () => {
                if (
                  confirm(
                    "Stop the local Earthquake Observatory server? The page will no longer load until you start the application again.",
                  )
                ) {
                  await fetch("/api/quit", { method: "POST" });
                  setMessage(
                    "Observatory stopped. You can close this tab and reopen the application when needed.",
                  );
                }
              }}
            >
              Stop the local server
            </button>
            <span class="muted">
              Ends the application running on this computer.
            </span>
          </div>
        </footer>
        {textPage && (
          <div class="modal-backdrop">
            <section
              class="modal"
              role="dialog"
              aria-modal="true"
              aria-label={textPage}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setTextPage("");
                  return;
                }
                if (e.key === "Tab") {
                  const elements =
                    e.currentTarget.querySelectorAll<HTMLElement>(
                      "button,a,input,select,summary",
                    );
                  const first = elements[0],
                    last = elements[elements.length - 1];
                  if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last?.focus();
                  } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first?.focus();
                  }
                }
              }}
            >
              <button
                class="modal-close"
                autoFocus
                onClick={() => setTextPage("")}
              >
                Close
              </button>
              <h2>{textPage}</h2>
              {textPage === "Glossary" ? (
                glossary.map(([title, body]) => (
                  <div key={title}>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                ))
              ) : (
                <>
                  <p>
                    Earthquake Observatory {version || "…"} · local release
                    candidate
                  </p>
                  <p>
                    Explore earthquake observations and learn how to read them.
                    No accounts, telemetry, LLM calls, map tokens or remote
                    fonts. Live retrieval contacts USGS through this local Go
                    server. Clicking source links opens the source website.
                  </p>
                  <p>
                    Built by Bruce Hoppe. Source code, licence and issue
                    tracker:{" "}
                    <a href={repository} target="_blank" rel="noreferrer">
                      {repository.replace("https://", "")}
                    </a>
                    . An independent educational project, not affiliated with or
                    endorsed by the University of Toronto or the USGS.
                  </p>
                  {[
                    "Earthquake observations",
                    "Scientific explanations",
                    "Geographic assets",
                    "Software",
                  ].map((group) => (
                    <section key={group}>
                      <h3>{group}</h3>
                      {sources
                        .filter((s) => s.group === group)
                        .map((s) => (
                          <p>
                            <a href={s.url} target="_blank" rel="noreferrer">
                              {s.title}
                            </a>
                            <br />
                            {s.author}. {s.purpose}
                            <br />
                            <small>Documentation checked {s.verified}</small>
                          </p>
                        ))}
                    </section>
                  ))}
                </>
              )}
            </section>
          </div>
        )}
      </main>
    </>
  );
}
render(<App />, document.getElementById("app")!);
