import { useEffect, useRef, useState } from "preact/hooks";
import {
  errorMessage,
  parseDataset,
  parseQuery,
  queryURL,
  RequestGate,
  type Mode,
  type Query,
} from "./data";
import type { Dataset } from "./model";

export type Progress = {
  id: string;
  state: string;
  requests: number;
  partitions: number;
  events: number;
  error?: string;
};

export function useDataset(onLoaded: (dataset: Dataset) => void) {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [query, setQuery] = useState<Query>({ mode: "day" });
  const [frozen, setFrozen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const gate = useRef(new RequestGate());
  const failed = useRef<Query | null>(null);
  const job = useRef<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const callback = useRef(onLoaded);
  callback.current = onLoaded;
  function stop() {
    const ticket = gate.current.cancel();
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
    if (job.current)
      void fetch("/api/history/jobs/" + job.current, {
        method: "DELETE",
      }).catch(() => {});
    job.current = null;
    return ticket;
  }
  function cancel() {
    const ticket = stop();
    setBusy(false);
    setProgress((previous) =>
      previous ? { ...previous, state: "cancelled" } : null,
    );
    return ticket;
  }
  function replace(next: Dataset | null, committed: Query, offline = true) {
    cancel();
    failed.current = null;
    setError("");
    setProgress(null);
    setDataset(next);
    setQuery(committed);
    setFrozen(offline);
  }
  async function load(mode: Mode, historical?: Query): Promise<Dataset | null> {
    let requested: Query;
    try {
      requested = parseQuery(historical ?? { mode });
    } catch (reason) {
      setError(errorMessage(reason));
      return null;
    }
    stop();
    const current = gate.current.start();
    failed.current = requested;
    setBusy(true);
    setError("");
    setProgress(null);
    let finalProgress: (() => Promise<void>) | null = null;
    try {
      let url = queryURL(requested);
      if (requested.mode === "history") {
        const id = crypto.randomUUID();
        job.current = id;
        url += "&job=" + id;
        setProgress({
          id,
          state: "running",
          requests: 0,
          partitions: 0,
          events: 0,
        });
        const update = async () => {
          try {
            const response = await fetch("/api/history/jobs/" + id, {
              signal: current.signal,
            });
            if (response.ok) {
              const value: Progress = await response.json();
              if (gate.current.current(current.ticket)) setProgress(value);
            }
          } catch {}
        };
        finalProgress = update;
        poll.current = setInterval(() => void update(), 500);
      }
      const response = await fetch(url, { signal: current.signal });
      const body: unknown = await response.json().catch(() => null);
      if (!gate.current.current(current.ticket)) return null;
      if (poll.current) clearInterval(poll.current);
      poll.current = null;
      if (finalProgress) await finalProgress();
      if (!response.ok)
        throw Error(
          body && typeof body === "object" && "error" in body
            ? String(body.error)
            : `Retrieval failed (HTTP ${response.status})`,
        );
      const next = parseDataset(body);
      if (!gate.current.current(current.ticket)) return null;
      setDataset(next);
      setQuery(requested);
      setFrozen(false);
      failed.current = null;
      setProgress((previous) =>
        previous
          ? {
              ...previous,
              state: "complete",
              events: next.data.features.length,
            }
          : null,
      );
      callback.current(next);
      return next;
    } catch (reason) {
      if (gate.current.current(current.ticket)) {
        setError(errorMessage(reason));
        setProgress((previous) =>
          previous
            ? { ...previous, state: "failed", error: errorMessage(reason) }
            : null,
        );
      }
      return null;
    } finally {
      if (gate.current.current(current.ticket)) {
        if (poll.current) clearInterval(poll.current);
        poll.current = null;
        job.current = null;
        setBusy(false);
      }
    }
  }
  useEffect(() => () => stop(), []);
  return {
    dataset,
    query,
    mode: frozen ? ("snapshot" as const) : query.mode,
    busy,
    error,
    setError,
    progress,
    load,
    cancel,
    replace,
    checkpoint: () => gate.current.checkpoint(),
    isCurrent: (ticket: number) => gate.current.current(ticket),
    retry: () =>
      failed.current
        ? load(failed.current.mode, failed.current)
        : Promise.resolve(null),
  };
}
