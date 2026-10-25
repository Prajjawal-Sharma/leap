import { NextResponse, type NextRequest } from "next/server";

import { buildSystemPrompt } from "@/lib/ai/chat-context";
import {
  GeminiError,
  streamGemini,
  type GeminiContent,
} from "@/lib/ai/gemini-client";
import { budgetHistory } from "@/lib/chat/history";
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
// The first model chunk must arrive within this, or the call is aborted and
// refunded — comfortably inside maxDuration, which would otherwise kill the
// function with a 504 and no refund.
const FIRST_CHUNK_TIMEOUT_MS = 45_000;

// What the client sees when the call fails. Upstream and database messages
// carry quota names, project numbers, SQL detail and, with a malformed key,
// the key itself, so they go to the server log only.
const CHAT_UNAVAILABLE =
  "Chat is unavailable right now. Please try again in a moment.";
const CHAT_NO_REPLY = "No reply was generated. Please try again.";
const STREAM_INTERRUPTED = "\n\n[stream error: the reply was interrupted]";

type StoredMessage = {
  role: ChatRole;
  content: string;
};

const toGeminiContents = (
  history: StoredMessage[],
  next: string
): GeminiContent[] => {
  // History rows are user-writable, so they are budgeted before they reach
  // the paid key: empty rows dropped (Gemini 400s the whole request on an
  // empty `parts`), each row and the total capped (see budgetHistory). The
  // daily cap bounds the number of calls; this bounds what each one costs.
  const contents: GeminiContent[] = budgetHistory(history).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  contents.push({ role: "user", parts: [{ text: next }] });
  return contents;
};

// Gives back the slot consume_chat_quota took when the request fails before
// any model text was streamed, for reasons that are not the request's own
// fault. refund_chat_quota is executable by service_role only — if users
// could call it they could loop it and never hit the cap — hence the admin
// client — and it refunds at most 5 times per user per day. Best effort: a
// failed refund costs the user one message and is logged, never surfaced.
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

  // Postgres text cannot hold NUL; strip it so the insert below cannot fail
  // on it.
  const raw =
    typeof body.message === "string"
      ? body.message.replace(/\u0000/g, "").trim()
      : "";
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
  // parallel requests cannot both slip under the limit. The day is UTC and
  // is captured here for the refund. consume_chat_quota reads the DB clock,
  // so within clock skew of midnight the two can disagree; the refund then
  // misses and the user loses one slot. It can never over-refund the new day
  // by more than the one slot this request took, so spend stays bounded.
  const now = new Date();
  const quotaDay = utcDay(now);
  const resetsAt = nextUtcMidnight(now).toISOString();

  const { data: used, error: quotaErr } = await supabase.rpc(
    "consume_chat_quota",
    { p_limit: CHAT_DAILY_LIMIT }
  );

  if (quotaErr || typeof used !== "number") {
    console.error(
      `[api/chat] consume_chat_quota failed: ${quotaErr?.message ?? "non-numeric result"}`
    );
    return NextResponse.json({ error: CHAT_UNAVAILABLE }, { status: 500 });
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
    console.error(`[api/chat] history read failed: ${historyErr.message}`);
    await refundQuota(user.id, quotaDay);
    return NextResponse.json({ error: CHAT_UNAVAILABLE }, { status: 500 });
  }

  // Query was DESC for the limit; flip to chronological for the model.
  const history = ((historyRows ?? []) as StoredMessage[]).slice().reverse();

  const { error: insertUserErr } = await supabase
    .from("chat_messages")
    .insert({ user_id: user.id, role: "user", content: message });

  if (insertUserErr) {
    console.error(`[api/chat] user message insert failed: ${insertUserErr.message}`);
    await refundQuota(user.id, quotaDay);
    return NextResponse.json({ error: CHAT_UNAVAILABLE }, { status: 500 });
  }

  let systemPrompt: string;
  try {
    systemPrompt = await buildSystemPrompt(supabase, user.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "context build failed";
    console.error(`[api/chat] context build failed: ${msg}`);
    await refundQuota(user.id, quotaDay);
    return NextResponse.json({ error: CHAT_UNAVAILABLE }, { status: 500 });
  }

  // Pull the first chunk before committing to a 200. streamGemini throws on
  // a model error part, so a non-2xx or a thrown call surfaces here, before
  // any text exists. Only this one chunk is held; the rest is piped through
  // as it arrives. A failure after the first chunk is not refunded: tokens
  // were spent.
  //
  // Only retryable failures are refunded (5xx, 429, network, the first-chunk
  // timeout). A 4xx means the request itself was bad, and the request is
  // built from history the user can write to; refunding that would let a
  // user replay a failing request without ever using up the cap.
  const firstChunkDeadline = new AbortController();
  const deadlineTimer = setTimeout(
    () => firstChunkDeadline.abort(),
    FIRST_CHUNK_TIMEOUT_MS
  );
  let iterator: AsyncIterator<string>;
  let first: IteratorResult<string>;
  try {
    const iterable = await streamGemini(toGeminiContents(history, message), {
      systemInstruction: systemPrompt,
      temperature: 0.7,
      abortSignal: firstChunkDeadline.signal,
    });
    iterator = iterable[Symbol.asyncIterator]();
    first = await iterator.next();
  } catch (err) {
    const geminiErr = err instanceof GeminiError ? err : null;
    console.error(
      `[api/chat] model call failed before any text: status=${geminiErr?.status ?? "n/a"} retryable=${geminiErr?.retryable ?? "n/a"} ${geminiErr?.message ?? (err instanceof Error ? err.name : "unknown error")}`
    );
    if (geminiErr?.retryable) {
      await refundQuota(user.id, quotaDay);
    }
    return NextResponse.json(
      { error: CHAT_UNAVAILABLE, retryable: geminiErr?.retryable ?? true },
      { status: geminiErr?.status === 429 ? 429 : 502 }
    );
  } finally {
    clearTimeout(deadlineTimer);
  }

  // The model finished without a single character: a blocked prompt, a
  // safety stop, or an error Google reported inside a 200 stream. Answer
  // with an error rather than an empty 200 the client would render as a
  // reply that never arrives. Not refunded: the call may have been billed,
  // and a blocked prompt is reproducible by the user at will.
  if (first.done) {
    console.error("[api/chat] model returned no text");
    return NextResponse.json(
      { error: CHAT_NO_REPLY, retryable: true },
      { status: 502 }
    );
  }
  const firstText = first.value;

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
        assembled += firstText;
        controller.enqueue(encoder.encode(firstText));
        for await (const chunk of rest) {
          assembled += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "stream error";
        console.error(`[api/chat] model stream failed mid-reply: ${msg}`);
        controller.enqueue(encoder.encode(STREAM_INTERRUPTED));
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
