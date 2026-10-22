import Link from "next/link";
import { redirect } from "next/navigation";

import SidebarFooter from "@/components/features/SidebarFooter";
import { createServerSupabase } from "@/lib/supabase-server";
import { ACTIVE_STATUSES } from "@/types/applications";

type NavItem = {
  href: string;
  label: string;
  // The pipeline badge sits next to "Applications". Other items leave it
  // undefined and the badge stays hidden.
  badge?: "active_applications";
};

const NAV_ITEMS: readonly NavItem[] = [
  { href: "/jobs", label: "Jobs" },
  { href: "/resume", label: "Resume" },
  { href: "/profile", label: "Profile" },
  { href: "/applications", label: "Applications", badge: "active_applications" },
  { href: "/chat", label: "Chat" },
  { href: "/insights", label: "Insights" },
];

async function fetchActiveApplicationCount(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>
): Promise<number> {
  // head:true asks PostgREST to return only the Content-Range count without
  // the row payload — cheap enough to run on every dashboard navigation.
  // RLS scopes the count to the current user; no user_id filter needed.
  const { count, error } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .in("status", ACTIVE_STATUSES as unknown as string[]);
  if (error) {
    console.warn(
      `[dashboard/layout] active application count failed: ${error.message}`
    );
    return 0;
  }
  return count ?? 0;
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const activeApplications = await fetchActiveApplicationCount(supabase);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col md:flex-row">
      <aside className="md:w-60 md:min-h-screen border-b md:border-b-0 md:border-r border-white/10 bg-black/40 px-4 py-5 md:py-8 flex flex-col">
        <Link href="/jobs" className="block text-lg font-semibold mb-6">
          <span className="text-[#6366f1]">Leap</span>
        </Link>
        <nav className="flex md:flex-col gap-1 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const showBadge =
              item.badge === "active_applications" && activeApplications > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-2 rounded-md text-sm text-neutral-300 hover:bg-white/5 hover:text-white whitespace-nowrap flex items-center justify-between gap-2"
              >
                <span>{item.label}</span>
                {showBadge && (
                  <span
                    aria-label={`${activeApplications} active applications`}
                    className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-[#6366f1]/20 text-[#a5a8f5] text-[10px] font-semibold ring-1 ring-[#6366f1]/30 tabular-nums"
                  >
                    {activeApplications}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <SidebarFooter userEmail={user.email ?? null} />
      </aside>
      <main className="flex-1 px-4 py-6 md:px-8 md:py-10">{children}</main>
    </div>
  );
}
