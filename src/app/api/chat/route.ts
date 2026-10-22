import { NextResponse, type NextRequest } from "next/server";

import { buildSystemPrompt } from "@/lib/ai/chat-context";
import {
  GeminiError,
  streamGemini,
  type GeminiContent,
} from "@/lib/ai/gemini-client";
import { createServerSupabase } from "@/lib/supabase-server";
import type { ChatRole } from "@/types/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HISTORY_LIMIT = 30;
const MAX_MESSAGE_LEN = 4000;
// Per-user daily cap on user messages. 30 covers heavy legitimate use while
// bounding worst-case spend on the paid Tier-1 Gemini key; tune post-launch.
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

  // Daily cap — checked before the user row is inserted and before any
  // Gemini call, so a capped message is never persisted or billed. Only
  // role='user' rows count; assistant replies don't eat the quota. Day
  // boundary is UTC to compare directly against created_at (timestamptz).
  const dayStartUtc = new Date();
  dayStartUtc.setUTCHours(0, 0, 0, 0);

  const { count: sentToday, error: countErr } = await supabase
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("role", "user")
    .gte("created_at", dayStartUtc.toISOString());

  if (countErr) {
    return NextResponse.json({ error: countErr.message }, { status: 500 });
  }

  if ((sentToday ?? 0) >= CHAT_DAILY_LIMIT) {
    return NextResponse.json(
      { error: "daily_limit_reached", limit: CHAT_DAILY_LIMIT },
      { status: 429 }
    );
  }

  const { data: historyRows, error: historyErr } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  if (historyErr) {
    return NextResponse.json({ error: historyErr.message }, { status: 500 });
  }

  // Query was DESC for the limit; flip to chronological for the model.
  const history = ((historyRows ?? []) as StoredMessage[]).slice().reverse();

  const { error: insertUserErr } = await supabase
    .from("chat_messages")
    .insert({ user_id: user.id, role: "user", content: message });

  if (insertUserErr) {
    return NextResponse.json(
      { error: insertUserErr.message },
      { status: 500 }
    );
  }

  let systemPrompt: string;
  try {
    systemPrompt = await buildSystemPrompt(supabase, user.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "context build failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  let iterable: AsyncIterable<string>;
  try {
    iterable = await streamGemini(toGeminiContents(history, message), {
      systemInstruction: systemPrompt,
      temperature: 0.7,
    });
  } catch (err) {
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
        for await (const chunk of iterable) {
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
