"use client";

import { lazy, Suspense } from "react";

import {
  AccountTriggerFace,
  accountTriggerClass,
  type AccountProps,
} from "./AccountTrigger";

const AccountMenuPanel = lazy(() => import("./AccountMenuPanel"));

/**
 * The account menu, code-split: the popover and everything in it load as their
 * own chunk instead of on every dashboard page's first load. The server still
 * renders the real trigger, and React replays a click that lands before the
 * chunk arrives, so nothing is lost. The fallback is the same trigger,
 * non-interactive, for the moment before that.
 */
export function AccountMenu(props: AccountProps) {
  return (
    <Suspense
      fallback={
        <span className={accountTriggerClass(props.placement)}>
          <AccountTriggerFace {...props} />
        </span>
      }
    >
      <AccountMenuPanel {...props} />
    </Suspense>
  );
}
