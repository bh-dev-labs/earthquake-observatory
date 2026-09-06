import { useMemo, useRef } from "preact/hooks";

// Keeps a callback's identity stable across renders while always calling the
// newest closure. Without this, every inline handler is a new prop each render
// and memo() on a child never bails out.
export function useStable<A extends unknown[], R>(fn: (...args: A) => R) {
  const latest = useRef(fn);
  latest.current = fn;
  return useMemo(
    () =>
      (...args: A) =>
        latest.current(...args),
    [],
  );
}
