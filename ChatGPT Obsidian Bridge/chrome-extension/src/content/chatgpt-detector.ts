import { parseConversation } from "./conversation-parser";
import type { ParsedConversation } from "../shared/types";

function isSupportedPage(): boolean {
  const href = window.location.href;
  return (
    href.startsWith("https://chatgpt.com/") ||
    href.startsWith("https://chat.openai.com/")
  );
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "PARSE_CONVERSATION") {
    return undefined;
  }

  if (!isSupportedPage()) {
    sendResponse({ ok: false, error: "This page is not supported." });
    return undefined;
  }

  try {
    const conversation: ParsedConversation = parseConversation();

    if (conversation.messages.length === 0) {
      sendResponse({
        ok: false,
        error: "No conversation messages were detected on this page."
      });
      return undefined;
    }

    sendResponse({ ok: true, conversation });
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to parse conversation."
    });
  }

  return undefined;
});
