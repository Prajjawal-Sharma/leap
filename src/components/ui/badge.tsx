import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// DESIGN §7: a badge carries status and nothing else — a neutral pill with a
// small coloured dot, where the label does the talking. Status never arrives
// as a block of colour, so there is no filled variant here.
const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-4xl border border-border bg-muted px-2.5 py-0.5 text-caption font-medium whitespace-nowrap text-foreground transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      // Tints the dot, not the pill.
      status: {
        neutral: "[--badge-dot:var(--faint)]",
        brand: "[--badge-dot:var(--brand-text)]",
        warning: "[--badge-dot:var(--warning)]",
        success: "[--badge-dot:var(--success)]",
        destructive: "[--badge-dot:var(--destructive)]",
      },
    },
    defaultVariants: {
      status: "neutral",
    },
  }
)

type BadgeProps = useRender.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    /** Shows the 6px status dot. Off for plain labels such as "Soon". */
    dot?: boolean
  }

function Badge({
  className,
  status = "neutral",
  dot = false,
  render,
  children,
  ...props
}: BadgeProps) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ status }), className),
        children: (
          <>
            {dot ? (
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full bg-(--badge-dot)"
              />
            ) : null}
            {children}
          </>
        ),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      status,
    },
  })
}

export { Badge, badgeVariants }
