"use client";

import { Loader2, LogOut, Monitor, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Theme } from "@/lib/theme/config";
import { useTheme } from "@/lib/theme/provider";

import {
  AccountTriggerFace,
  UserAvatar,
  accountTriggerClass,
  type AccountProps,
} from "./AccountTrigger";

const THEMES: ReadonlyArray<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

// Loaded lazily by AccountMenu: Base UI's popover (and the floating-ui
// positioning under it), the theme control, the switch and sonner stay off the
// dashboard's critical path until hydration reaches the trigger.
export default function AccountMenuPanel({
  name,
  email,
  initials,
  placement,
}: AccountProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { theme, setTheme, forced, solid, setSolid } = useTheme();
  const themeCaptionId = useId();
  const solidId = useId();
  const solidHintId = useId();

  // Same sequence SidebarFooter used: sign out on the browser client, push to
  // /login so the new state shows at once, then refresh so the server-rendered
  // shell drops the stale session. Errors surface as a toast.
  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const supabase = createBrowserSupabase();
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      router.push("/login");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign out failed";
      toast.error(message);
      setSigningOut(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={placement === "topbar" ? `Account menu, ${name}` : undefined}
        className={accountTriggerClass(placement)}
      >
        <AccountTriggerFace name={name} initials={initials} placement={placement} />
      </PopoverTrigger>

      <PopoverContent
        side={placement === "sidebar" ? "top" : "bottom"}
        align={placement === "sidebar" ? "start" : "end"}
        sideOffset={8}
        className="w-72 gap-0 p-0"
      >
        <div className="flex items-center gap-3 p-3">
          <UserAvatar initials={initials} className="size-10" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-sm font-medium" title={name}>
              {name}
            </p>
            {email && (
              <p className="truncate text-caption text-muted-foreground" title={email}>
                {email}
              </p>
            )}
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="mt-0.5 inline-block rounded-sm text-caption text-brand-text underline-offset-2 outline-hidden hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              View profile
            </Link>
          </div>
        </div>

        <Separator />

        <div className="space-y-2 p-3">
          <p className="text-caption text-foreground">Theme</p>
          <ToggleGroup
            aria-label="Theme"
            aria-describedby={forced ? themeCaptionId : undefined}
            value={[theme]}
            onValueChange={(value) => {
              const next = value[0] as Theme | undefined;
              if (next) setTheme(next);
            }}
            disabled={forced}
            spacing={0}
            className="grid w-full grid-cols-3 rounded-lg bg-muted p-0.5"
          >
            {THEMES.map(({ value, label, icon: Icon }) => (
              <ToggleGroupItem
                key={value}
                value={value}
                className="h-10 gap-1.5 rounded-md! px-2 text-caption aria-pressed:bg-seg-thumb aria-pressed:shadow-sm md:h-8"
              >
                <Icon aria-hidden />
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {forced && (
            <p id={themeCaptionId} className="text-caption text-muted-foreground">
              Light theme arrives soon
            </p>
          )}
        </div>

        <div className="flex items-start justify-between gap-3 px-3 pb-3">
          <div className="min-w-0">
            <label htmlFor={solidId} className="text-body-sm text-foreground">
              Solid surfaces
            </label>
            <p id={solidHintId} className="text-caption text-muted-foreground">
              Turns off transparency and blur
            </p>
          </div>
          <Switch
            id={solidId}
            aria-describedby={solidHintId}
            checked={solid}
            onCheckedChange={setSolid}
            className="mt-1"
          />
        </div>

        <Separator />

        <div className="p-1.5">
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            aria-busy={signingOut}
            className="flex h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-body-sm text-foreground outline-hidden transition-colors duration-(--dur-1) hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70 md:h-9"
          >
            {signingOut ? (
              <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <LogOut aria-hidden className="size-4" />
            )}
            Sign out
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
