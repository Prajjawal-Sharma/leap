import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/shell/AppSidebar";
import { MainFocus, SkipLink } from "@/components/shell/MainFocus";
import { MobileTabBar, MobileTopBar } from "@/components/shell/MobileNav";
import { LazyToaster } from "@/components/shell/LazyToaster";
import { SidebarProvider } from "@/components/ui/sidebar";
import { displayName, initials } from "@/lib/ui/account";
import { SIDEBAR_COOKIE_NAME, parseSidebarCookie } from "@/lib/ui/sidebar-state";
import { createServerSupabase } from "@/lib/supabase-server";
import { ACTIVE_STATUSES } from "@/types/applications";

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

async function fetchFullName(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string
): Promise<string | null> {
  // Only the name, for the account menu. RLS limits profiles to the caller's
  // own row; the id filter just selects it.
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.warn(`[dashboard/layout] profile name fetch failed: ${error.message}`);
    return null;
  }
  return (data?.full_name as string | null | undefined) ?? null;
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

  const [activeApplications, fullName, cookieStore] = await Promise.all([
    fetchActiveApplicationCount(supabase),
    fetchFullName(supabase, user.id),
    cookies(),
  ]);

  const name = displayName(fullName, user.email);
  const account = { name, email: user.email ?? null, initials: initials(name) };

  return (
    <SidebarProvider
      defaultOpen={parseSidebarCookie(cookieStore.get(SIDEBAR_COOKIE_NAME)?.value)}
    >
      <SkipLink />
      <AppSidebar activeApplications={activeApplications} account={account} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar account={account} />
        <main
          id="main"
          tabIndex={-1}
          className="w-full min-w-0 max-w-[1200px] flex-1 px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+104px)] outline-none md:px-6 md:pt-8 md:pb-10"
        >
          {children}
        </main>
      </div>
      <MobileTabBar />
      <MainFocus />
      <LazyToaster />
    </SidebarProvider>
  );
}
