"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { dailyLimitMessage } from "@/lib/chat/quota";
import type { ChatMessage } from "@/types/chat";

type Props = {
  initialMessages: ChatMessage[];
};

// Display-only message representation. Server-persisted messages carry an
// id; in-flight messages get a synthetic local id so React can key them.
type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
};

const SUGGESTIONS: ReadonlyArray<{ label: string; prompt: string }> = [
  {
    label: "Resume gap analysis",
    prompt:
      "Look at my resume and target roles. What's the biggest gap I should close in the next 30 days?",
  },
  {
    label: "Top match strategy",
    prompt:
      "Based on my applications so far, which kind of role should I focus more energy on, and which to drop?",
  },
  {
    label: "Interview prep",
    prompt:
      "I have an upcoming interview. What system-design topics should I revise given my experience?",
  },
  {
    label: "Salary expectation check",
    prompt:
      "Is my expected salary range realistic for the roles I'm targeting? What should I anchor to?",
  },
];

const toDisplay = (m: ChatMessage): DisplayMessage => ({
  id: m.id,
  role: m.role,
  content: m.content,
});

export default function Chat({ initialMessages }: Props) {
  const [messages, setMessages] = useState<DisplayMessage[]>(() =>
    initialMessages.map(toDisplay)
  );
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitNotice, setLimitNotice] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const hasHistory = messages.length > 0;
  const canSend = useMemo(
    () => input.trim().length > 0 && !sending,
    [input, sending]
  );

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Auto-grow textarea up to a sensible cap. Reset to single-line height
  // first so shrinking back down after a delete works.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [input]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || sending) return;

      setError(null);
      setLimitNotice(null);
      setSending(true);

      const userId = `local-user-${Date.now()}`;
      const assistantId = `local-assistant-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: userId, role: "user", content: trimmed },
        { id: assistantId, role: "assistant", content: "", pending: true },
      ]);
      setInput("");

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const payload = await res.json().catch(() => ({}));
          if (res.status === 429 && payload?.error === "daily_limit_reached") {
            // The server never persisted this message — drop the optimistic
            // bubbles so the view matches stored history, and give the user
            // their text back. No retry: the limit can't clear today.
            const limit =
              typeof payload?.limit === "number" ? payload.limit : 30;
            setMessages((prev) =>
              prev.filter((m) => m.id !== userId && m.id !== assistantId)
            );
            setInput(trimmed);
            setLimitNotice(dailyLimitMessage(limit, payload?.resets_at));
            return;
          }
          const msg =
            typeof payload?.error === "string"
              ? payload.error
              : `Request failed (${res.status})`;
          throw new Error(msg);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: acc, pending: true }
                : m
            )
          );
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: acc, pending: false } : m
          )
        );
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.name === "AbortError"
              ? "Stopped"
              : err.message
            : "Something went wrong";
        setError(msg);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content || `[${msg}]`, pending: false }
              : m
          )
        );
      } finally {
        setSending(false);
        abortRef.current = null;
      }
    },
    [sending]
  );

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      void sendMessage(input);
    },
    [input, sendMessage]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void sendMessage(input);
      }
    },
    [input, sendMessage]
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleClear = useCallback(async () => {
    if (clearing) return;
    const ok = window.confirm(
      "Clear the entire chat history? This cannot be undone."
    );
    if (!ok) return;
    setClearing(true);
    setError(null);
    setLimitNotice(null);
    try {
      const res = await fetch("/api/chat", { method: "DELETE" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error ?? `Clear failed (${res.status})`);
      }
      setMessages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clear failed");
    } finally {
      setClearing(false);
    }
  }, [clearing]);

  return (
    <div className="flex flex-1 flex-col min-h-0 mt-4">
      <div className="flex items-center justify-between pb-3">
        <p className="text-[11px] text-neutral-500">
          {hasHistory
            ? `${messages.length} message${messages.length === 1 ? "" : "s"}`
            : "Start a new conversation"}
        </p>
        {hasHistory && (
          <button
            type="button"
            onClick={handleClear}
            disabled={clearing || sending}
            className="text-[12px] text-neutral-400 hover:text-white disabled:opacity-50 px-2 py-1 rounded-md hover:bg-white/5 transition-colors"
          >
            {clearing ? "Clearing…" : "Clear chat"}
          </button>
        )}
      </div>

      <div
        ref={scrollerRef}
        className="flex-1 min-h-0 overflow-y-auto rounded-xl bg-neutral-900/30 ring-1 ring-white/10 px-3 py-4 md:px-5 md:py-5"
      >
        {!hasHistory ? (
          <EmptyState onPick={(p) => void sendMessage(p)} />
        ) : (
          <ul className="flex flex-col gap-4">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
          </ul>
        )}
      </div>

      {limitNotice && (
        <div className="mt-3 rounded-md bg-amber-500/10 ring-1 ring-amber-500/30 px-3 py-2 text-xs text-amber-200">
          {limitNotice}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md bg-red-500/10 ring-1 ring-red-500/30 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-3 rounded-xl bg-neutral-900/60 ring-1 ring-white/10 focus-within:ring-[#6366f1]/50 px-3 py-2 flex items-end gap-2"
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your job search, resume, applications…"
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-white placeholder:text-neutral-500 focus:outline-none px-1 py-2 leading-snug max-h-[200px]"
          disabled={sending}
        />
        {sending ? (
          <button
            type="button"
            onClick={handleStop}
            className="shrink-0 inline-flex items-center justify-center h-11 min-w-[44px] px-3 rounded-md bg-white/5 ring-1 ring-white/10 text-sm text-neutral-200 hover:bg-white/10"
            aria-label="Stop generation"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            className="shrink-0 inline-flex items-center justify-center h-11 min-w-[44px] px-3 rounded-md bg-[#6366f1] hover:bg-[#4f52d5] disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors"
            aria-label="Send message"
          >
            Send
          </button>
        )}
      </form>
      <p className="mt-2 text-[10px] text-neutral-600 text-center">
        Enter to send · Shift+Enter for newline · AI can make mistakes — double-check responses
      </p>
    </div>
  );
}

function MessageBubble({ message }: { message: DisplayMessage }) {
  const isUser = message.role === "user";
  return (
    <li className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={
          isUser
            ? "max-w-[85%] md:max-w-[75%] rounded-2xl rounded-br-md bg-[#6366f1]/90 text-white px-4 py-2.5 text-sm whitespace-pre-wrap break-words shadow-sm"
            : "max-w-[85%] md:max-w-[75%] rounded-2xl rounded-bl-md bg-neutral-800/60 ring-1 ring-white/10 text-neutral-100 px-4 py-2.5 text-sm whitespace-pre-wrap break-words"
        }
      >
        {message.content || (
          <span className="inline-flex items-center gap-1.5 text-neutral-400">
            <Dot />
            <Dot delay="150ms" />
            <Dot delay="300ms" />
          </span>
        )}
        {message.pending && message.content && (
          <span className="ml-1 inline-block h-3 w-1 align-middle bg-white/60 animate-pulse" />
        )}
      </div>
    </li>
  );
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse"
      style={{ animationDelay: delay }}
    />
  );
}

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center gap-5">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#6366f1]/15 ring-1 ring-[#6366f1]/30 text-[#a5a8f5]">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 11.5a8.5 8.5 0 1 1-3-6.5" />
          <path d="M21 3v6h-6" />
          <path d="M8 12h.01M12 12h.01M16 12h.01" />
        </svg>
      </div>
      <div>
        <h2 className="text-base font-semibold text-white">
          Your career coach is ready
        </h2>
        <p className="mt-1 text-sm text-neutral-400 max-w-md">
          Start with a question, or try one of these to see how it grounds
          answers in your actual context.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onPick(s.prompt)}
            className="text-left rounded-lg bg-neutral-900/60 ring-1 ring-white/10 hover:ring-[#6366f1]/40 hover:bg-neutral-900 px-3 py-3 transition-colors"
          >
            <p className="text-sm font-medium text-white">{s.label}</p>
            <p className="mt-0.5 text-[11px] text-neutral-400 line-clamp-2">
              {s.prompt}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
