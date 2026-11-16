import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge only knows Tailwind's default font sizes. Without this it
// reads the DESIGN §5.3 type scale (text-caption, text-body-sm, …) as text
// *colours*, so `cn("text-caption text-muted-foreground")` silently dropped
// the size. Registering the scale makes size and colour separate groups again.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display", "title-1", "title-2", "title-3", "body", "body-sm", "caption"],
    },
  },
});

/**
 * Merge Tailwind class lists, letting later classes win over earlier ones.
 * shadcn components call this; keep the signature as they expect it.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
