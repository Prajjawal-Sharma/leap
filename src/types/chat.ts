export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  created_at: string;
}

export const isChatRole = (v: unknown): v is ChatRole =>
  v === "user" || v === "assistant";
