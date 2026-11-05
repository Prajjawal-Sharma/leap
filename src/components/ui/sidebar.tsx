"use client"

import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { PanelLeftIcon } from "lucide-react"
import {
  SIDEBAR_COOKIE_MAX_AGE,
  SIDEBAR_COOKIE_NAME,
} from "@/lib/ui/sidebar-state"

// Restyled to docs/DESIGN.md §6.1 for the app shell: a floating glass panel
// that collapses to an icon rail. Only the floating + icon combination is
// styled — it is the only one the app uses — and the parts the shell does not
// need (rail, input, sub-menus, menu actions, skeleton, mobile sheet; phones
// get the tab bar, §6.2) were dropped from the shadcn original.
//
// Collapsed-rail labels are CSS tooltips (SidebarRailTooltip) rather than
// Base UI tooltips: they only ever sit to the right of a fixed rail, so no
// positioning engine is needed, and leaving floating-ui out keeps the shell
// off every dashboard page's critical path.

const SIDEBAR_WIDTH = "16rem" // 256px
const SIDEBAR_WIDTH_ICON = "3.5rem" // 56px
const SIDEBAR_KEYBOARD_SHORTCUT = "b"
// Same boundaries as the sidebar-collapsed variant in globals.css, in the
// same range syntax, so CSS and JS agree even at fractional widths.
const TABLET_QUERY = "(width >= 48rem) and (width < 64rem)"
const DESKTOP_QUERY = "(width >= 48rem)"

type SidebarContextProps = {
  /** What is on screen now. */
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  toggleSidebar: () => void
  /** No choice stored yet and not hydrated: the server cannot know `state`. */
  stateUnknown: boolean
  setTooltipsDismissed: (dismissed: boolean) => void
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }

  return context
}

const subscribeNever = () => () => {}

function subscribeTablet(callback: () => void) {
  const mql = window.matchMedia(TABLET_QUERY)
  mql.addEventListener("change", callback)
  return () => mql.removeEventListener("change", callback)
}

function SidebarProvider({
  defaultOpen,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  /**
   * The `sidebar_state` cookie, read on the server so a collapsed sidebar
   * never flashes open. `undefined` (no choice yet) is "auto": collapsed on
   * tablets, expanded on desktop — by CSS, see the sidebar-collapsed variant
   * in globals.css.
   */
  defaultOpen?: boolean
}) {
  const [preference, setPreference] = React.useState<boolean | undefined>(
    defaultOpen
  )
  // Only consulted in auto mode, for tooltips and the toggle's direction;
  // layout itself never waits on it.
  const isTablet = React.useSyncExternalStore(
    subscribeTablet,
    () => window.matchMedia(TABLET_QUERY).matches,
    () => false
  )
  const open = preference ?? !isTablet
  const hydrated = React.useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  )
  // WCAG 1.4.13: rail tooltips can be dismissed with Escape without moving
  // the pointer or focus. Cleared when focus moves or the pointer leaves.
  const [tooltipsDismissed, setTooltipsDismissed] = React.useState(false)

  const setOpen = React.useCallback((value: boolean) => {
    setPreference(value)
    const secure = window.location.protocol === "https:" ? "; secure" : ""
    document.cookie = `${SIDEBAR_COOKIE_NAME}=${value}; path=/; samesite=lax; max-age=${SIDEBAR_COOKIE_MAX_AGE}${secure}`
  }, [])

  const toggleSidebar = React.useCallback(() => {
    setOpen(!open)
  }, [open, setOpen])

  // ⌘/Ctrl+B — the component's own shortcut, the only global key handler.
  // Held keys auto-repeat (one toggle per press, not a flapping sidebar), IME
  // composition is left alone, and below md there is no sidebar to toggle.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !event.repeat &&
        !event.isComposing &&
        window.matchMedia(DESKTOP_QUERY).matches &&
        event.key.toLowerCase() === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleSidebar])

  const state = open ? "expanded" : "collapsed"

  const stateUnknown = preference === undefined && !hydrated

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      toggleSidebar,
      stateUnknown,
      setTooltipsDismissed,
    }),
    [state, open, setOpen, toggleSidebar, stateUnknown]
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      {/* Deliberately no data-slot: this wrapper encloses every page's
          content, and globals.css scopes the kit's reduced-motion and
          border-colour rules to [data-slot] subtrees. */}
      <div
        data-sidebar="wrapper"
        data-sidebar-state={
          preference === undefined ? "auto" : preference ? "expanded" : "collapsed"
        }
        data-rail-tooltips={tooltipsDismissed ? "dismissed" : undefined}
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          } as React.CSSProperties
        }
        className={cn("group/sidebar-wrapper flex min-h-dvh w-full", className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

function Sidebar({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const { state, setTooltipsDismissed } = useSidebar()

  // Escape dismisses a rail tooltip shown by hover too, so it is listened for
  // while the pointer is over the sidebar — scoped, not a global shortcut.
  const onEscape = React.useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") setTooltipsDismissed(true)
    },
    [setTooltipsDismissed]
  )
  React.useEffect(
    () => () => window.removeEventListener("keydown", onEscape),
    [onEscape]
  )

  // Hidden below md: phones get the bottom tab bar instead (DESIGN §6.2).
  return (
    <div
      className="group peer hidden text-sidebar-foreground md:block"
      data-state={state}
      data-variant="floating"
      data-collapsible="icon"
      data-slot="sidebar"
    >
      {/* Reserves the sidebar's width in the page flow. */}
      <div
        data-slot="sidebar-gap"
        className="relative w-[calc(var(--sidebar-width)+--spacing(4))] shrink-0 bg-transparent transition-[width] duration-(--dur-3) ease-out sidebar-collapsed:w-[calc(var(--sidebar-width-icon)+--spacing(4))]"
      />
      {/* left: the landscape notch (viewport-fit=cover); body padding covers
          in-flow content, this fixed panel needs it explicitly. */}
      <div
        data-slot="sidebar-container"
        className={cn(
          "fixed inset-y-0 left-[env(safe-area-inset-left)] z-20 flex h-dvh w-[calc(var(--sidebar-width)+--spacing(4))] p-2 transition-[width] duration-(--dur-3) ease-out sidebar-collapsed:w-[calc(var(--sidebar-width-icon)+--spacing(4))]",
          className
        )}
        onPointerEnter={() => window.addEventListener("keydown", onEscape)}
        onPointerLeave={() => {
          window.removeEventListener("keydown", onEscape)
          setTooltipsDismissed(false)
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setTooltipsDismissed(true)
        }}
        onFocus={() => setTooltipsDismissed(false)}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="glass flex size-full flex-col rounded-xl"
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar, open, stateUnknown } = useSidebar()

  // Before hydration in auto mode the server cannot tell whether CSS shows
  // the rail collapsed (tablet) or expanded, so it claims neither.
  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      aria-expanded={stateUnknown ? undefined : open}
      aria-label={
        stateUnknown ? "Toggle sidebar" : open ? "Collapse sidebar" : "Expand sidebar"
      }
      className={cn("text-muted-foreground hover:text-foreground", className)}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <PanelLeftIcon />
    </Button>
  )
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("mt-auto flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn("mx-2 w-auto bg-sidebar-border", className)}
      {...props}
    />
  )
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        // Collapsed on a viewport tall enough for every rail item, overflow is
        // visible so the rail tooltips can sit outside the panel. Below 32rem
        // (landscape phones) the rail scrolls instead — otherwise its items
        // would spill over the account button in the footer.
        "no-scrollbar flex min-h-0 flex-1 flex-col gap-0 overflow-x-hidden overflow-y-auto sidebar-collapsed:[@media(min-height:32rem)]:overflow-visible",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  )
}

function SidebarGroupLabel({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div"> & React.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "flex h-8 shrink-0 items-center rounded-md px-3 text-caption text-muted-foreground transition-opacity duration-(--dur-1) ease-out sidebar-collapsed:opacity-0",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "sidebar-group-label",
      sidebar: "group-label",
    },
  })
}

function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("w-full text-body-sm", className)}
      {...props}
    />
  )
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-0.5", className)}
      {...props}
    />
  )
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  )
}

// Rows are 40px and full width; collapsed they become a 40px square centred
// in the 56px rail. Labels fade rather than slide (motion tokens, §5.5) and
// are clipped by the square's overflow.
const sidebarMenuButtonVariants = cva(
  "peer/menu-button group/menu-button flex h-10 w-full pointer-coarse:h-11 items-center gap-3 overflow-hidden rounded-lg px-3 text-left text-body-sm text-foreground outline-hidden transition-[background-color,color] duration-(--dur-1) ease-out hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring sidebar-collapsed:w-10 sidebar-collapsed:px-3 aria-disabled:pointer-events-none data-active:bg-brand-soft data-active:font-medium data-active:text-brand-text [&_svg]:size-[18px] [&_svg]:shrink-0 [&>span]:truncate [&>span]:transition-opacity [&>span]:duration-(--dur-1) sidebar-collapsed:[&>span]:opacity-0",
  {
    variants: {
      variant: {
        default: "",
      },
      size: {
        default: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * The label beside a collapsed rail item, shown while the item is hovered or
 * holds keyboard focus. Decorative (aria-hidden): the item keeps its full
 * accessible name. Render it inside a SidebarMenuItem, after the button.
 */
function SidebarRailTooltip({
  className,
  children,
  ...props
}: React.ComponentProps<"span">) {
  return (
    // The outer span bridges the gap to the rail (padding, not margin) so the
    // pointer can move onto the label without it disappearing (WCAG 1.4.13);
    // it only takes pointer events while shown. The label is opaque rather
    // than glass: inside the sidebar's own backdrop-filter it could not blur
    // what lies outside the panel.
    <span
      aria-hidden
      data-slot="sidebar-rail-tooltip"
      className={cn(
        "pointer-events-none absolute top-1/2 left-full z-30 hidden -translate-y-1/2 pl-3 opacity-0 transition-opacity duration-(--dur-1) ease-out sidebar-collapsed:block group-hover/menu-item:pointer-events-auto group-hover/menu-item:opacity-100 group-has-[:focus-visible]/menu-item:opacity-100 group-data-[rail-tooltips=dismissed]/sidebar-wrapper:hidden",
        className
      )}
      {...props}
    >
      <span className="block rounded-xl border border-border bg-popover px-3 py-1.5 text-caption whitespace-nowrap text-popover-foreground shadow-lg">
        {children}
      </span>
    </span>
  )
}

function SidebarMenuButton({
  render,
  isActive = false,
  variant = "default",
  size = "default",
  className,
  ...props
}: useRender.ComponentProps<"button"> &
  React.ComponentProps<"button"> & {
    isActive?: boolean
  } & VariantProps<typeof sidebarMenuButtonVariants>) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(sidebarMenuButtonVariants({ variant, size }), className),
      },
      props
    ),
    render,
    state: {
      slot: "sidebar-menu-button",
      sidebar: "menu-button",
      size,
      active: isActive,
    },
  })
}

function SidebarMenuBadge({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        "pointer-events-none absolute top-1/2 right-3 flex h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-full px-1.5 text-caption text-muted-foreground tabular-nums transition-opacity duration-(--dur-1) select-none sidebar-collapsed:opacity-0 peer-data-active/menu-button:text-brand-text",
        className
      )}
      {...props}
    />
  )
}

export {
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
  SidebarProvider,
  SidebarRailTooltip,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
}
