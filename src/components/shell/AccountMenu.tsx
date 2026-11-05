"use client";

import { lazy, Suspense } from "react";

import {
  AccountTriggerFace,
  accountTriggerClass,
  type AccountProps,
} from "./AccountTrigger";
import { ChunkBoundary } from "./ChunkBoundary";

const AccountMenuPanel = lazy(() => import("./AccountMenuPanel"));

/**
 * The account menu, code-split: the popover and everything in it load as their
 * own chunk instead of on every dashboard page's first load. The server still
 * renders the real trigger, and React replays a click that lands before the
 * chunk arrives, so nothing is lost. The Suspense fallback is the same
 * trigger, non-interactive, for the moment before that.
 *
 * If the chunk cannot load at all, the rest of the dashboard keeps working and
 * the trigger becomes a reload button: a full reload fetches the chunk afresh,
 * which React's cached failed lazy load cannot.
 */
export function AccountMenu(props: AccountProps) {
  const face = <AccountTriggerFace {...props} />;
  return (
    <ChunkBoundary
      fallback={
        <button
          type="button"
          onClick={() => window.location.reload()}
          aria-label={`Account menu, ${props.name}: reload to open`}
          className={accountTriggerClass(props.placement)}
        >
          {face}
        </button>
      }
    >
      <Suspense
        fallback={
          <span className={accountTriggerClass(props.placement)}>{face}</span>
        }
      >
        <AccountMenuPanel {...props} />
      </Suspense>
    </ChunkBoundary>
  );
}
