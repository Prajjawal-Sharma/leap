import { NextResponse, type NextRequest } from "next/server";

import { buildSystemPrompt } from "@/lib/ai/chat-context";
import {
  GeminiError,
  streamGemini,
  type GeminiContent,
} from "@/lib/ai/gemini-client";
import { nextUtcMidnight, utcDay } from "@/lib/chat/quota";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { createServerSupabase } from "@/lib/supabase-server";
import type { ChatRole } from "@/types/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HISTORY_LIMIT = 30;
const MAX_MESSAGE_LEN = 4000;
// Per-user daily cap on user messages. 30 covers heavy legitimate use while
// bounding worst-case spend on the paid Tier-1 Gemini key; tune post-launch.
// Counted in public.chat_usage (migration 0007), which users can read but not
// write, so Clear chat no longer resets it.
const CHAT_DAILY_LIMIT = 30;

type StoredMessage = {
  role: ChatRole;
  content: string;
};

const toGeminiContents = (
  history: StoredMessage[],
  next: string
): GeminiContent[] => {
  const contents: GeminiContent[] = history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  contents.push({ role: "user", parts: [{ text: next }] });
  return contents;
};

// Gives back the slot consume_chat_quota took when the request fails before
// any model text was streamed. refund_chat_quota is executable by
// service_role only — if users could call it they could loop it and never
// hit the cap — hence the admin client. Best effort: a failed refund costs
// the user one message and is logged, never surfaced.
async function refundQuota(userId: string, day: string): Promise<void> {
  try {
    const admin = createAdminSupabase();
    const { error } = await admin.rpc("refund_chat_quota", {
      p_user_id: userId,
      p_day: day,
    });
    if (error) {
      console.error(`[api/chat] quota refund failed: ${error.message}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[api/chat] quota refund failed: ${msg}`);
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = typeof body.message === "string" ? body.message.trim() : "";
  if (raw.length === 0) {
    return NextResponse.json(
      { error: "message is required" },
      { status: 400 }
    );
  }
  const message = raw.slice(0, MAX_MESSAGE_LEN);

  // Daily cap — consumed before the user row is inserted and before any
  // Gemini call, so a capped message is never persisted or billed. The RPC
  // is one atomic check-and-increment on the caller's own chat_usage row, so
  // parallel requests cannot both slip under the limit. The day is UTC; it
  // is captured here so a refund lands on the day that was charged.
  const now = new Date();
  const quotaDay = utcDay(now);
  const resetsAt = nextUtcMidnight(now).toISOString();

  const { data: used, error: quotaErr } = await supabase.rpc(
    "consume_chat_quota",
    { p_limit: CHAT_DAILY_LIMIT }
  );

  if (quotaErr || typeof used !== "number") {
    return NextResponse.json(
      { error: quotaErr?.message ?? "quota check failed" },
      { status: 500 }
    );
  }

  if (used === -1) {
    return NextResponse.json(
      {
        error: "daily_limit_reached",
        limit: CHAT_DAILY_LIMIT,
        resets_at: resetsAt,
      },
      { status: 429 }
    );
  }

  // From here until the first model chunk arrives, every failure returns the
  // slot: nothing was spent on the paid key yet.
  const { data: historyRows, error: historyErr } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  if (historyErr) {
    await refundQuota(user.id, quotaDay);
    return NextResponse.json({ error: historyErr.message }, { status: 500 });
  }

  // Query was DESC for the limit; flip to chronological for the model.
  const history = ((historyRows ?? []) as StoredMessage[]).slice().reverse();

  const { error: insertUserErr } = await supabase
    .from("chat_messages")
    .insert({ user_id: user.id, role: "user", content: message });

  if (insertUserErr) {
    await refundQuota(user.id, quotaDay);
    return NextResponse.json(
      { error: insertUserErr.message },
      { status: 500 }
    );
  }

  let systemPrompt: string;
  try {
    systemPrompt = await buildSystemPrompt(supabase, user.id);
  } catch (err) {
    await refundQuota(user.id, quotaDay);
    const msg = err instanceof Error ? err.message : "context build failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Pull the first chunk before committing to a 200. streamGemini throws on
  // a model error part, so a non-2xx or a thrown call surfaces here, before
  // any text exists — refund and answer with the error status. Only this one
  // chunk is held; the rest is piped through as it arrives. A failure after
  // the first chunk is not refunded: tokens were spent.
  let iterator: AsyncIterator<string>;
  let first: IteratorResult<string>;
  try {
    const iterable = await streamGemini(toGeminiContents(history, message), {
      systemInstruction: systemPrompt,
      temperature: 0.7,
    });
    iterator = iterable[Symbol.asyncIterator]();
    first = await iterator.next();
  } catch (err) {
    await refundQuota(user.id, quotaDay);
    if (err instanceof GeminiError) {
      return NextResponse.json(
        { error: err.message, retryable: err.retryable },
        { status: err.status === 429 ? 429 : 502 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "stream failed" },
      { status: 502 }
    );
  }

  const encoder = new TextEncoder();
  const userId = user.id;
  const rest: AsyncIterable<string> = {
    [Symbol.asyncIterator]: () => iterator,
  };

  // Plain-text chunked stream — each enqueue is a delta. Client just
  // concatenates TextDecoder output. The pump persists the assembled
  // assistant message on close, including the abort path so a user
  // walking away mid-stream still gets their partial reply saved.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let assembled = "";
      let closed = false;

      const persist = async () => {
        if (assembled.length === 0) return;
        const persistSupabase = await createServerSupabase();
        await persistSupabase
          .from("chat_messages")
          .insert({
            user_id: userId,
            role: "assistant",
            content: assembled,
          });
      };

      try {
        if (!first.done) {
          assembled += first.value;
          controller.enqueue(encoder.encode(first.value));
        }
        for await (const chunk of rest) {
          assembled += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "stream error";
        controller.enqueue(encoder.encode(`\n\n[stream error: ${msg}]`));
      } finally {
        try {
          await persist();
        } catch {
          // Surface only via logs — client already received the text.
        }
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
      // Lets the chat UI show "N left today" without another query.
      "X-Chat-Used": String(used),
      "X-Chat-Limit": String(CHAT_DAILY_LIMIT),
      "X-Chat-Resets-At": resetsAt,
    },
  });
}

export async function DELETE() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("chat_messages")
    .delete()
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
