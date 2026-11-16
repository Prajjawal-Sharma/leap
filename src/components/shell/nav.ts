import {
  BriefcaseBusiness,
  ChartNoAxesColumn,
  FileText,
  MessageSquare,
  SquareKanban,
  User,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

// DESIGN §6.1: main group in this order, then "You". Applications carries the
// active-pipeline count badge.
export const MAIN_NAV: readonly NavItem[] = [
  { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/applications", label: "Applications", icon: SquareKanban },
  { href: "/resume", label: "Resume", icon: FileText },
  { href: "/chat", label: "Chat", icon: MessageSquare },
];

export const PROFILE_NAV: NavItem = {
  href: "/profile",
  label: "Profile",
  icon: User,
};

/** Shown as "Soon" with no link until the insights page exists. */
export const INSIGHTS_SOON = { label: "Insights", icon: ChartNoAxesColumn };

// DESIGN §6.2: the five tabs. Insights joins when it is built.
export const TAB_NAV: readonly NavItem[] = [...MAIN_NAV, PROFILE_NAV];
