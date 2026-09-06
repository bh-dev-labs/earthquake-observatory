import { useEffect, useMemo, useRef, useState } from "preact/hooks";

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

// Measures an element so a chart can use real pixels. An SVG with a fixed
// viewBox scales its text with its container, which is why chart labels
// shrank to nine or ten pixels in a three-column grid.
export function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const ro = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry.contentRect.width)),
    );
    ro.observe(node);
    setWidth(Math.round(node.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
