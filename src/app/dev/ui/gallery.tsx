"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookmarkIcon,
  BriefcaseIcon,
  FileTextIcon,
  MessageSquareIcon,
  SearchIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { toast } from "sonner";

import { CompanyMark } from "@/components/leap/CompanyMark";
import { EmptyState } from "@/components/leap/EmptyState";
import { ErrorState } from "@/components/leap/ErrorState";
import { FitMeter } from "@/components/leap/FitMeter";
import { PageHeader } from "@/components/leap/PageHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSolidSurfaces } from "@/lib/theme/provider";

/* -------------------------------------------------------------------------- */

const COLOUR_TOKENS = [
  "--background",
  "--foreground",
  "--card",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--primary",
  "--brand-text",
  "--brand-soft",
  "--border",
  "--input",
  "--ring",
  "--success",
  "--warning",
  "--destructive",
  "--faint",
];

const TYPE_ROWS = [
  { token: "title-1", meta: "28/34 · 650", cls: "text-title-1", sample: "Jobs" },
  {
    token: "title-2",
    meta: "20/28 · 600",
    cls: "text-title-2",
    sample: "Software Engineer, Data Migration",
  },
  { token: "title-3", meta: "16/22 · 600", cls: "text-title-3", sample: "Skill overlap" },
  {
    token: "body",
    meta: "15/24",
    cls: "text-body",
    sample: "Ranked by fit with your primary resume.",
  },
  {
    token: "body-sm",
    meta: "14/20",
    cls: "text-body-sm text-muted-foreground",
    sample: "MongoDB · California, US",
  },
  {
    token: "caption",
    meta: "12/16 · 500",
    cls: "text-caption text-muted-foreground",
    sample: "Applied · 15 Jul",
  },
];

const MOTION_ROWS = [
  { name: "Ease out", value: "cubic-bezier(0.2, 0, 0, 1) · 120 / 200 / 300 ms" },
  { name: "Spring", value: "linear(…) · 500 ms · about 5% overshoot" },
  { name: "Press", value: "scale(0.97) on pointer-down · transform and opacity only" },
];

const COMPANIES = ["Squarespace", "MongoDB", "Airbnb", "Klarna"];

const SEGMENTS = ["light", "dark", "system"];

/* -------------------------------------------------------------------------- */

/**
 * Prints a token's *computed* value, so the gallery can never drift from
 * globals.css — and so each panel reports the value for its own theme.
 *
 * Writes through the ref rather than React state: an effect may update an
 * external system, but calling setState in one is what React 19's
 * react-hooks/set-state-in-effect rejects.
 */
function TokenValue({ name }: { name: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.textContent =
      getComputedStyle(element).getPropertyValue(name).trim() || "—";
  }, [name]);

  return <span ref={ref} className="font-mono text-caption text-muted-foreground" />;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-title-3 text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

/* -------------------------------------------------------------------------- */

function Panel({ theme }: { theme: "light" | "dark" }) {
  const [saved, setSaved] = useState(true);
  const [notify, setNotify] = useState(true);
  const [segment, setSegment] = useState("light");
  const [agreed, setAgreed] = useState(true);

  return (
    <div
      className={`${theme} min-w-0 overflow-hidden rounded-xl border border-border bg-background text-foreground`}
    >
      <div className="space-y-8 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-title-2 capitalize">{theme}</h2>
          <code className="font-mono text-caption text-muted-foreground">
            {theme === "light" ? ":root, .light" : ".dark"}
          </code>
        </div>

        <Section title="Colour">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {COLOUR_TOKENS.map((token) => (
              <div key={token} className="min-w-0 space-y-1.5">
                <div
                  className="h-11 w-full rounded-sm border border-border"
                  style={{ background: `var(${token})` }}
                />
                <div className="truncate text-caption text-foreground">
                  {token.replace("--", "")}
                </div>
                <TokenValue name={token} />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type · system UI stack">
          <div className="space-y-3">
            {TYPE_ROWS.map((row) => (
              <div
                key={row.token}
                className="grid gap-1 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-baseline sm:gap-4"
              >
                <span className="text-caption text-muted-foreground">
                  {row.token} · {row.meta}
                </span>
                <span className={row.cls}>{row.sample}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Controls">
          <Row>
            <Button>Apply on company site</Button>
            <Button variant="secondary">Tailor resume</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="destructive">Delete resume</Button>
          </Row>
          <Row>
            <Button loading>Apply on company site</Button>
            <Button disabled>Disabled</Button>
            <Button size="sm" variant="secondary">
              Small
            </Button>
            <Button size="icon" variant="outline" aria-label="Filters">
              <SlidersHorizontalIcon />
            </Button>
          </Row>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="relative">
              <SearchIcon
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input placeholder="Search roles, companies or skills" className="pl-9" />
            </div>
            <Select defaultValue="all">
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                <SelectItem value="remote">Remote</SelectItem>
                <SelectItem value="india">India</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Row>
            <Toggle aria-label="Remote only">Remote</Toggle>

            <Button
              variant={saved ? "secondary" : "outline"}
              onClick={() => setSaved((value) => !value)}
              className={saved ? "bg-brand-soft text-brand-text" : undefined}
            >
              <BookmarkIcon aria-hidden />
              {saved ? "Saved" : "Save"}
            </Button>

            <div className="flex items-center gap-2">
              <Switch
                id={`${theme}-notify`}
                checked={notify}
                onCheckedChange={setNotify}
              />
              <Label htmlFor={`${theme}-notify`}>{notify ? "On" : "Off"}</Label>
            </div>

            {/* Segmented control: one thumb that actually travels, on the
                spring, so the overshoot in --ease-spring is visible. */}
            <ToggleGroup
              value={[segment]}
              onValueChange={(value) => setSegment(value[0] ?? segment)}
              className="relative rounded-sm bg-muted p-0.5"
            >
              <span
                aria-hidden
                className="absolute top-0.5 bottom-0.5 left-0.5 rounded-sm bg-seg-thumb shadow-sm transition-transform duration-[var(--dur-spring)] ease-spring motion-reduce:transition-none"
                style={{
                  width: `calc((100% - 4px) / ${SEGMENTS.length})`,
                  transform: `translateX(${SEGMENTS.indexOf(segment) * 100}%)`,
                }}
              />
              {SEGMENTS.map((option) => (
                <ToggleGroupItem
                  key={option}
                  value={option}
                  className="relative z-10 h-10 rounded-sm bg-transparent px-3 text-body-sm capitalize hover:bg-transparent md:h-8"
                >
                  {option}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Row>

          <Row>
            <Badge dot status="brand">Applied · 15 Jul</Badge>
            <Badge dot status="warning">Interviewing</Badge>
            <Badge dot status="success">Offered</Badge>
            <Badge dot status="neutral">Viewed · 15 May</Badge>
            <Badge className="text-brand-text">Resume tailored</Badge>
            <Badge className="text-muted-foreground">Soon</Badge>
          </Row>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${theme}-note`}>Note</Label>
              <Textarea id={`${theme}-note`} placeholder="Why this role fits…" />
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`${theme}-agree`}
                  checked={agreed}
                  onCheckedChange={(value) => setAgreed(value === true)}
                />
                <Label htmlFor={`${theme}-agree`}>Remote roles only</Label>
              </div>
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback>PS</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            </div>
          </div>

          <Tabs defaultValue="overlap">
            <TabsList>
              <TabsTrigger value="overlap">Skill overlap</TabsTrigger>
              <TabsTrigger value="about">About</TabsTrigger>
            </TabsList>
            <TabsContent value="overlap" className="pt-3 text-body-sm text-muted-foreground">
              Resume skills found in this description, and what it asks for
              that the resume does not show.
            </TabsContent>
            <TabsContent value="about" className="pt-3 text-body-sm text-muted-foreground">
              Description at reading width.
            </TabsContent>
          </Tabs>

          <Separator />
        </Section>

        <Section title="Fit meter and company marks">
          <div className="flex flex-wrap items-center gap-5">
            <FitMeter value={68} size="xs" />
            <FitMeter value={67} size="md" />
            <FitMeter value={82} size="lg" showSuffix={false} label="ATS score 82 out of 100" />
            <div className="text-body-sm">
              <div className="text-title-3 text-foreground">ATS score</div>
              <div className="text-muted-foreground">
                xs row · md detail · lg resume
              </div>
            </div>
          </div>
          <Row>
            {COMPANIES.map((company) => (
              <CompanyMark key={company} company={company} />
            ))}
            <CompanyMark company="🚀 Rocket Labs" />
            <CompanyMark company="株式会社カドカワ" />
            <CompanyMark company="" />
          </Row>
        </Section>

        <Section title="Overlays · glass chrome, paper content">
          <Row>
            <Dialog>
              <DialogTrigger render={<Button variant="outline">Dialog</Button>} />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Keep tailored resume?</DialogTitle>
                  <DialogDescription>
                    This saves a copy for Software Engineer at MongoDB. Your
                    primary resume is unchanged.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose render={<Button variant="ghost">Discard</Button>} />
                  <DialogClose render={<Button>Keep tailored resume</Button>} />
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <AlertDialog>
              <AlertDialogTrigger
                render={<Button variant="destructive">Alert dialog</Button>}
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this resume?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Applications already sent keep the copy they used. This
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction>Delete resume</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Sheet>
              <SheetTrigger render={<Button variant="outline">Sheet</Button>} />
              <SheetContent side="right">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                  <SheetDescription>
                    Narrow the feed. Paper body, glass footer.
                  </SheetDescription>
                </SheetHeader>
                <SheetFooter className="glass-bar-top">
                  <Button className="w-full">Show results</Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>

            <Drawer>
              <DrawerTrigger render={<Button variant="outline">Drawer</Button>} />
              <DrawerContent>
                <DrawerHeader>
                  <DrawerTitle>Software Engineer 2</DrawerTitle>
                  <DrawerDescription>
                    MongoDB · Dublin, Ireland. Swipe down to dismiss.
                  </DrawerDescription>
                </DrawerHeader>
                <DrawerFooter className="glass-bar-top">
                  <Button className="w-full">Apply on company site</Button>
                  <DrawerClose render={<Button variant="ghost">Close</Button>} />
                </DrawerFooter>
              </DrawerContent>
            </Drawer>

            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline">Menu</Button>} />
              <DropdownMenuContent>
                <DropdownMenuItem>Profile</DropdownMenuItem>
                <DropdownMenuItem>Solid surfaces</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Popover>
              <PopoverTrigger render={<Button variant="outline">Popover</Button>} />
              <PopoverContent>
                <p className="text-body-sm text-muted-foreground">
                  Glass chrome floating over paper content.
                </p>
              </PopoverContent>
            </Popover>

            <Tooltip>
              <TooltipTrigger render={<Button variant="outline">Tooltip</Button>} />
              <TooltipContent>Ranked by fit</TooltipContent>
            </Tooltip>

            <Button
              variant="outline"
              onClick={() => toast.success("Resume uploaded", {
                description: "We scored it against your target roles.",
              })}
            >
              Toast
            </Button>
          </Row>
        </Section>

        <Section title="Glass · chrome only">
          {/* Chrome has to have something passing beneath it to read as glass. */}
          <div className="relative h-60 overflow-y-auto rounded-xl border border-border bg-background p-3">
            <div className="space-y-2 pb-16">
              {[68, 68, 67, 67, 66, 66].map((fit, index) => (
                <Card key={index} className="flex-row items-center gap-3 px-3 py-2.5">
                  <CompanyMark company={COMPANIES[index % COMPANIES.length]} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-title-3">Software Engineer 2</div>
                    <div className="truncate text-body-sm text-muted-foreground">
                      MongoDB · Dublin, Ireland
                    </div>
                  </div>
                  <FitMeter value={fit} size="xs" />
                </Card>
              ))}
            </div>

            <nav
              aria-label="Gallery tab bar sample"
              className="glass pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-around rounded-xl px-2 py-1.5"
            >
              {[
                { icon: BriefcaseIcon, label: "Jobs", active: true },
                { icon: FileTextIcon, label: "Resume", active: false },
                { icon: MessageSquareIcon, label: "Chat", active: false },
              ].map(({ icon: Icon, label, active }) => (
                <span
                  key={label}
                  className={`flex min-w-16 flex-col items-center gap-0.5 rounded-lg px-3 py-1 ${
                    active ? "bg-tab-on" : ""
                  }`}
                >
                  <Icon
                    aria-hidden
                    className={`size-5 ${active ? "text-brand-text" : "text-foreground"}`}
                  />
                  {/* DESIGN §5.2: labels on glass are --foreground, active included. */}
                  <span
                    className={`text-[11px] text-foreground ${active ? "font-semibold" : ""}`}
                  >
                    {label}
                  </span>
                </span>
              ))}
            </nav>
          </div>
        </Section>

        <Section title="States">
          <EmptyState
            title="No saved roles yet"
            body="Save a role from the feed and it shows up here, with its fit and status."
            action={<Button variant="secondary">Browse jobs</Button>}
          />
          <ErrorState onRetry={() => toast("Retried")} />
        </Section>

        <Section title="Motion">
          <dl className="space-y-2">
            {MOTION_ROWS.map((row) => (
              <div
                key={row.name}
                className="grid gap-0.5 sm:grid-cols-[110px_minmax(0,1fr)] sm:gap-4"
              >
                <dt className="text-body-sm text-foreground">{row.name}</dt>
                <dd className="font-mono text-caption break-words text-muted-foreground">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function Gallery() {
  const [solid, setSolid] = useSolidSurfaces();

  return (
    <main className="min-h-dvh bg-background px-4 py-8 md:px-8">
      <div className="mx-auto max-w-[1400px] space-y-8">
        <PageHeader
          title="Leap foundations"
          description="Tokens and components from docs/DESIGN.md v0.2, light and dark side by side. Glass on chrome, paper for content."
          actions={
            <div className="flex items-center gap-2">
              <Switch id="solid-surfaces" checked={solid} onCheckedChange={setSolid} />
              <Label htmlFor="solid-surfaces">Solid surfaces</Label>
            </div>
          }
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel theme="light" />
          <Panel theme="dark" />
        </div>
      </div>

      {/* Mounted here rather than in the root layout: no page uses toasts yet. */}
      <Toaster />
    </main>
  );
}
