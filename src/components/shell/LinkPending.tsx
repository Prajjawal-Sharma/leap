"use client";

import { useLinkStatus } from "next/link";

/**
 * Rendered inside a nav <Link>. While that link's navigation is pending (the
 * route was not prefetched recently, so the server has to answer first), it
 * renders a hidden marker the link styles itself from with
 * `has-[[data-link-pending]]:…`. The click shows at once instead of the old
 * page and old active item sitting there for seconds.
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  return pending ? <span hidden data-link-pending="" /> : null;
}
