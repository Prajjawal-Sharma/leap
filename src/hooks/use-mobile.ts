"use client"

import * as React from "react"

const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(callback: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", callback)
  return () => mql.removeEventListener("change", callback)
}

/**
 * The viewport is an external store, so it is read through
 * useSyncExternalStore: React 19's react-hooks/set-state-in-effect rejects the
 * shipped setState-on-mount version, and this has no mount-render cascade.
 * The server snapshot is `false` — same as the original hook's `!!undefined`.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  )
}
