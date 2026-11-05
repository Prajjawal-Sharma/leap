"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRailTooltip,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { isActivePath } from "@/lib/ui/account";

import { AccountMenu } from "./AccountMenu";
import { LeapMark } from "./LeapMark";
import { INSIGHTS_SOON, MAIN_NAV, PROFILE_NAV, type NavItem } from "./nav";

type Props = {
  activeApplications: number;
  account: { name: string; email: string | null; initials: string };
};

function NavLink({ item, badge }: { item: NavItem; badge?: number }) {
  const pathname = usePathname();
  const active = isActivePath(pathname, item.href);
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        render={
          <Link href={item.href} aria-current={active ? "page" : undefined} />
        }
      >
        <Icon aria-hidden />
        <span>{item.label}</span>
      </SidebarMenuButton>
      {badge ? (
        <SidebarMenuBadge aria-label={`${badge} active applications`}>
          {badge}
        </SidebarMenuBadge>
      ) : null}
      <SidebarRailTooltip>
        {badge ? `${item.label} · ${badge}` : item.label}
      </SidebarRailTooltip>
    </SidebarMenuItem>
  );
}

function InsightsSoon() {
  const Icon = INSIGHTS_SOON.icon;
  // Not a link and not focusable: there is no page yet. aria-disabled tells
  // assistive tech why it is inert.
  return (
    <SidebarMenuItem>
      <div
        aria-disabled="true"
        className="flex h-10 w-full items-center gap-3 overflow-hidden rounded-lg px-3 text-body-sm text-faint sidebar-collapsed:w-10 [&_svg]:size-[18px] [&_svg]:shrink-0"
      >
        <Icon aria-hidden />
        <span className="flex-1 truncate transition-opacity duration-(--dur-1) sidebar-collapsed:opacity-0">
          {INSIGHTS_SOON.label}
        </span>
        <span className="rounded-full border border-border px-2 py-0.5 text-caption text-muted-foreground transition-opacity duration-(--dur-1) sidebar-collapsed:opacity-0">
          Soon
        </span>
      </div>
      <SidebarRailTooltip>Insights · soon</SidebarRailTooltip>
    </SidebarMenuItem>
  );
}

export function AppSidebar({ activeApplications, account }: Props) {
  return (
    <Sidebar aria-label="Main">
      <SidebarHeader className="flex-row items-center gap-2 p-3 sidebar-collapsed:flex-col sidebar-collapsed:px-2">
        <Link
          href="/jobs"
          aria-label="Leap — Jobs"
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg outline-hidden focus-visible:ring-2 focus-visible:ring-ring sidebar-collapsed:flex-none"
        >
          <LeapMark />
          <span className="truncate text-title-3 transition-opacity duration-(--dur-1) sidebar-collapsed:hidden">
            Leap
          </span>
        </Link>
        <SidebarTrigger />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {MAIN_NAV.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  badge={item.href === "/applications" ? activeApplications : undefined}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="pt-0">
          <SidebarSeparator className="mx-1 mb-2 hidden sidebar-collapsed:block" />
          <SidebarGroupLabel className="sidebar-collapsed:hidden">You</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <NavLink item={PROFILE_NAV} />
              <InsightsSoon />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <AccountMenu placement="sidebar" {...account} />
      </SidebarFooter>
    </Sidebar>
  );
}
