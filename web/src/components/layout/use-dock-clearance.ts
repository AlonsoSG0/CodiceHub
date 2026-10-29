import { useEffect, type RefObject } from "react";

/** The custom property every surface that ends at the window edge reads to leave room for the floating dock. */
export const DOCK_CLEARANCE_VARIABLE = "--dock-clearance";

/**
 * Publishes the dock's measured height, so a page can keep its last line at a fixed distance from it instead of
 * guessing a padding that the dock outgrows. The height comes from layout (`offsetHeight`) rather than from the
 * bounding rect, because an unpinned dock is translated down and its rect would report only the peeking strip.
 */
export function useDockClearance(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const root = document.documentElement;

    const publish = () => {
      const height = element.offsetHeight;
      // jsdom reports 0 for every element; there the stylesheet's fallback value stays in charge.
      if (height > 0) root.style.setProperty(DOCK_CLEARANCE_VARIABLE, `${height}px`);
    };

    publish();
    if (typeof ResizeObserver !== "function") return () => root.style.removeProperty(DOCK_CLEARANCE_VARIABLE);

    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty(DOCK_CLEARANCE_VARIABLE);
    };
  }, [ref]);
}
