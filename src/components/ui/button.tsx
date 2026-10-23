"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"

// DESIGN §5.4: controls are radius 8 (rounded-sm here, since --radius is 12).
// DESIGN §9: touch targets are >= 44px on mobile and settle to 36-40px on
// desktop. `press` carries the scale(0.97) feedback and drops it under
// prefers-reduced-motion — never `transition-all` (DESIGN §5.5).
const buttonVariants = cva(
  "press group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm border border-transparent bg-clip-padding text-body-sm font-medium whitespace-nowrap outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-accent aria-expanded:bg-accent",
        outline:
          "border-border bg-card hover:bg-accent aria-expanded:bg-accent",
        ghost: "hover:bg-accent aria-expanded:bg-accent",
        // The foundations board draws destructive as a bordered red control,
        // not a solid fill — a solid --destructive in dark is a light colour
        // and reads as a warning block.
        destructive:
          "border-destructive/40 text-destructive hover:bg-destructive/10 focus-visible:border-destructive focus-visible:ring-destructive/30",
        link: "text-brand-text underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 md:h-9",
        sm: "h-10 px-3 md:h-8 text-caption",
        lg: "h-12 px-5 md:h-10 text-body",
        icon: "size-11 md:size-9",
        "icon-sm": "size-10 md:size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    /** Shows a spinner, blocks input, and keeps the button's width. */
    loading?: boolean
  }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size }), loading && "relative", className)}
      {...props}
    >
      {loading ? (
        <>
          <Loader2Icon aria-hidden className="absolute size-4 animate-spin" />
          {/* Still laid out, just not painted, so the width cannot jump. */}
          <span className="invisible inline-flex items-center gap-1.5">
            {children}
          </span>
        </>
      ) : (
        children
      )}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
