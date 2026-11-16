import { ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";

export type AccountProps = {
  name: string;
  email: string | null;
  initials: string;
  /** Sidebar footer (name beside the avatar) or the mobile top bar (avatar only). */
  placement: "sidebar" | "topbar";
};

// Shared by the real popover trigger and its pre-hydration placeholder, so the
// two are pixel-identical and swapping one for the other never shifts layout.

export function accountTriggerClass(placement: AccountProps["placement"]) {
  return cn(
    "flex items-center rounded-lg text-left outline-hidden transition-colors duration-(--dur-1) focus-visible:ring-2 focus-visible:ring-ring",
    placement === "sidebar"
      ? "h-12 w-full gap-3 overflow-hidden px-2 hover:bg-accent data-[popup-open]:bg-accent sidebar-collapsed:w-10 sidebar-collapsed:px-1"
      : "size-11 justify-center rounded-full"
  );
}

/** Initials on the brand fill. No image support is needed, so no Base UI Avatar. */
export function UserAvatar({
  initials,
  className,
}: {
  initials: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-caption font-semibold text-primary-foreground select-none",
        className
      )}
    >
      {initials}
    </span>
  );
}

/** What the trigger shows: avatar, then name and chevrons in the sidebar. */
export function AccountTriggerFace({
  name,
  initials,
  placement,
}: Pick<AccountProps, "name" | "initials" | "placement">) {
  return (
    <>
      <UserAvatar initials={initials} />
      {placement === "sidebar" && (
        <>
          <span className="min-w-0 flex-1 truncate text-body-sm font-medium transition-opacity duration-(--dur-1) sidebar-collapsed:opacity-0">
            {name}
          </span>
          <ChevronsUpDown
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground transition-opacity duration-(--dur-1) sidebar-collapsed:opacity-0"
          />
        </>
      )}
    </>
  );
}
