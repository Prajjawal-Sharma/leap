"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActivePath } from "@/lib/ui/account";
import { cn } from "@/lib/utils";

import { AccountMenu } from "./AccountMenu";
import { LeapMark } from "./LeapMark";
import { TAB_NAV } from "./nav";

type Account = { name: string; email: string | null; initials: string };

/** Phones (< 768px): slim glass bar with the mark and the avatar menu. */
export function MobileTopBar({ account }: { account: Account }) {
  return (
    <header className="glass-bar sticky top-0 z-30 flex items-center justify-between px-4 pt-[env(safe-area-inset-top)] md:hidden">
      <Link
        href="/jobs"
        aria-label="Leap — Jobs"
        className="flex h-14 items-center gap-2 rounded-lg outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        <LeapMark className="size-7" />
        <span className="text-title-3">Leap</span>
      </Link>
      <AccountMenu placement="topbar" {...account} />
    </header>
  );
}

/**
 * Phones: floating glass pill inset 12px, five tabs, icon over an 11px label.
 * Labels on glass use --foreground (DESIGN §5.2): the active tab is marked by
 * the brand capsule, a brand icon and a semibold label, never by colour alone.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] md:hidden"
    >
      <ul className="glass pointer-events-auto flex items-stretch gap-0.5 rounded-full p-1">
        {TAB_NAV.map(({ href, label, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <li key={href} className="min-w-0 flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-full px-0.5 text-foreground outline-hidden transition-colors duration-(--dur-1) focus-visible:ring-2 focus-visible:ring-ring",
                  active && "bg-tab-on"
                )}
              >
                <Icon
                  aria-hidden
                  className={cn("size-6", active && "text-brand-text")}
                />
                <span
                  className={cn(
                    // "Applications" must fit at 375px: 11px with tight tracking.
                    "max-w-full truncate text-[11px] leading-[14px] tracking-tight",
                    active ? "font-semibold" : "font-medium"
                  )}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
