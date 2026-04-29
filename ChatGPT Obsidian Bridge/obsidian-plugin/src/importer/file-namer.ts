import type { ParsedConversation } from "../shared/types";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function cleanTitle(title: string): string {
  const cleaned = title
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();

  return cleaned || "untitled-conversation";
}

export function cleanSuffix(value: string): string {
  return value
    .replace(/[^\w-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export function buildConversationPath(conversation: ParsedConversation, documentKey?: string): string {
  const capturedAt = new Date(conversation.capturedAt);
  const year = capturedAt.getUTCFullYear();
  const month = pad(capturedAt.getUTCMonth() + 1);
  const slug = cleanTitle(conversation.title);
  const suffix = documentKey ? `-${cleanSuffix(documentKey)}` : "";
  return `ChatGPT/Conversations/${year}/${month}/${slug}-${conversation.conversationId}${suffix}.md`;
}
