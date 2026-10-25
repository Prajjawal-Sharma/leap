import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class lists, letting later classes win over earlier ones.
 * shadcn components call this; keep the signature as they expect it.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
