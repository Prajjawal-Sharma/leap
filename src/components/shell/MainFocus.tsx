"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Moves keyboard and screen-reader focus to <main id="main"> after a
 * client-side navigation, so the next Tab starts in the new page rather than
 * back in the sidebar. Not on first load (the browser owns focus then), and
 * with preventScroll: Next has already scrolled the page to the top, and a
 * second scroll would fight it.
 */
export function MainFocus() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [pathname]);

  return null;
}

/** First focusable element on every dashboard page. */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="glass fixed top-3 left-3 z-50 -translate-y-20 rounded-lg px-4 py-2.5 text-body-sm font-medium text-foreground outline-hidden transition-transform duration-(--dur-2) ease-out focus-visible:translate-y-0 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
    >
      Skip to content
    </a>
  );
}
