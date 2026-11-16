"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// Survives the dashboard layout unmounting (e.g. a trip to /login and back):
// once the shell has mounted in this tab, any later mount is a client-side
// navigation.
let shellMountedBefore = false;

/**
 * True only for the page the browser itself loaded. Entering the dashboard by
 * client navigation (sign-in, the 404 page's link) mounts the layout fresh but
 * is still a navigation, and should move focus like any other.
 */
function isInitialDocumentLoad(): boolean {
  if (shellMountedBefore) return false;
  const entry = performance.getEntriesByType("navigation")[0];
  if (!entry) return true;
  try {
    return new URL(entry.name).pathname === window.location.pathname;
  } catch {
    return true;
  }
}

/**
 * Moves keyboard and screen-reader focus to <main id="main"> after a
 * client-side navigation, so the next Tab starts in the new page rather than
 * back in the sidebar. Not on the browser's own page load (the browser owns
 * focus then), and with preventScroll: Next has already scrolled the page to
 * the top, and a second scroll would fight it.
 */
export function MainFocus() {
  const pathname = usePathname();
  const initialLoad = useRef<boolean | null>(null);
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (initialLoad.current === null) {
      initialLoad.current = isInitialDocumentLoad();
      shellMountedBefore = true;
    }
    if (lastPath.current === null) {
      lastPath.current = pathname;
      if (initialLoad.current) return;
    } else if (lastPath.current === pathname) {
      // StrictMode's second effect run in development: same path, no move.
      return;
    }
    lastPath.current = pathname;
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
