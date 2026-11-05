import { redirect } from "next/navigation";

import Chat from "@/components/features/Chat";
import { createServerSupabase } from "@/lib/supabase-server";
import type { ChatMessage } from "@/types/chat";

export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 50;

async function fetchHistory(): Promise<ChatMessage[]> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, role, content, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(HISTORY_LIMIT);

  if (error) {
    console.warn(`[/chat] history fetch failed: ${error.message}`);
    return [];
  }
  return (data ?? []) as ChatMessage[];
}

export default async function ChatPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const initialMessages = await fetchHistory();

  return (
    // Fills the viewport inside the shell: on phones minus the top bar (56),
    // main's top padding (24) and the tab-bar clearance (104) plus both safe
    // areas; from md up minus main's vertical padding (32 + 40). dvh, never vh.
    <section className="flex flex-col h-[calc(100dvh-184px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] md:h-[calc(100dvh-72px)]">
      <header className="flex flex-col gap-1 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Career Chat
          </h1>
          <span className="text-[10px] font-semibold uppercase tracking-wider rounded-full bg-[#6366f1]/20 ring-1 ring-[#6366f1]/30 text-[#a5a8f5] px-2 py-0.5">
            AI
          </span>
        </div>
        <p className="text-sm text-neutral-400">
          Ask anything about your job search. This is an AI and can make mistakes — please double-check responses.
        </p>
      </header>

      <Chat initialMessages={initialMessages} />
    </section>
  );
}
