import { domToMarkdown } from "./dom-to-markdown";
import type {
  CodeBlock,
  ConversationMessage,
  MessageParseState,
  MessageRole,
  ParsedConversation
} from "../shared/types";

const CONTENT_SELECTORS = [
  "[data-message-content]",
  ".markdown",
  "[class*='markdown']",
  ".prose",
  "article",
  "[dir='auto']"
];

function readConversationId(url: URL): string {
  const match = url.pathname.match(/\/c\/([^/?#]+)/);
  if (match) {
    return match[1];
  }

  return url.searchParams.get("conversationId") ?? `web-${Date.now()}`;
}

function normalizeRole(raw: string | null | undefined): MessageRole {
  if (raw === "user" || raw === "assistant" || raw === "system") {
    return raw;
  }

  return "unknown";
}

function extractCodeBlocks(root: HTMLElement): CodeBlock[] {
  return Array.from(root.querySelectorAll("pre")).map((pre) => {
    const code = pre.querySelector("code");
    const language =
      code?.className.match(/language-([a-z0-9_-]+)/i)?.[1] ??
      pre.getAttribute("data-language") ??
      "";

    return {
      language,
      code: (code?.textContent ?? pre.textContent ?? "").trimEnd()
    };
  });
}

function messageRootCandidates(): HTMLElement[] {
  const roleNodes = Array.from(
    document.querySelectorAll<HTMLElement>("main [data-message-author-role]")
  ).filter((node) => node.closest("[data-message-author-role]") === node);

  if (roleNodes.length > 0) {
    return roleNodes;
  }

  const articleNodes = Array.from(document.querySelectorAll<HTMLElement>("main article"));
  if (articleNodes.length > 0) {
    return articleNodes;
  }

  return [];
}

function sanitizeContentRoot(root: HTMLElement): HTMLElement {
  const clone = root.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      "button, nav, svg, img, form, textarea, input, select, audio, video, canvas, [aria-hidden='true']"
    )
    .forEach((element) => element.remove());

  return clone;
}

function candidateScore(node: HTMLElement): number {
  const textScore = node.innerText.trim().length;
  const codeScore = node.querySelectorAll("pre, code").length * 50;
  const blockScore = node.querySelectorAll("p, li, blockquote, table").length * 10;
  return textScore + codeScore + blockScore;
}

function findContentRoot(node: HTMLElement): { root: HTMLElement; parseState: MessageParseState } {
  const candidates = CONTENT_SELECTORS.flatMap((selector) =>
    Array.from(node.querySelectorAll<HTMLElement>(selector))
  ).filter((candidate) => candidate !== node);

  const bestCandidate = candidates
    .map((candidate) => sanitizeContentRoot(candidate))
    .sort((left, right) => candidateScore(right) - candidateScore(left))[0];

  if (bestCandidate && candidateScore(bestCandidate) > 0) {
    return { root: bestCandidate, parseState: "parsed" };
  }

  const structuralFallback = Array.from(node.querySelectorAll<HTMLElement>("pre, p, li, blockquote, table"))
    .map((candidate) => sanitizeContentRoot(candidate))
    .sort((left, right) => candidateScore(right) - candidateScore(left))[0];

  if (structuralFallback && candidateScore(structuralFallback) > 0) {
    return { root: structuralFallback, parseState: "fallback" };
  }

  return { root: sanitizeContentRoot(node), parseState: "fallback" };
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildMarkdown(root: HTMLElement, codeBlocks: CodeBlock[]): string {
  const markdown = domToMarkdown(root).trim();
  if (markdown) {
    return markdown;
  }

  if (codeBlocks.length > 0) {
    return codeBlocks
      .map((block) => `\`\`\`${block.language}\n${block.code}\n\`\`\``.trim())
      .join("\n\n");
  }

  return "";
}

function isValidMessage(message: ConversationMessage): boolean {
  return Boolean(message.contentText || message.contentMarkdown || message.codeBlocks.length > 0);
}

function extractMessage(node: HTMLElement, index: number, conversationId: string): ConversationMessage {
  const { root, parseState } = findContentRoot(node);
  const codeBlocks = extractCodeBlocks(root);
  const contentText = normalizeText(root.innerText);
  const contentMarkdown = buildMarkdown(root, codeBlocks);
  const rawRole =
    node.dataset.messageAuthorRole ??
    node.getAttribute("data-message-author-role") ??
    node.closest<HTMLElement>("[data-message-author-role]")?.dataset.messageAuthorRole;
  const role = normalizeRole(rawRole);
  const finalParseState: MessageParseState =
    contentText || contentMarkdown || codeBlocks.length > 0 ? parseState : "unparsed";

  return {
    id:
      node.dataset.messageId ??
      node.getAttribute("data-testid") ??
      `${conversationId}-message-${index}`,
    role,
    index,
    contentText,
    contentMarkdown,
    selected: role !== "system" && finalParseState !== "unparsed",
    codeBlocks,
    parseState: finalParseState,
    segmentStart: index === 0
  };
}

export function parseConversation(): ParsedConversation {
  const url = new URL(window.location.href);
  const conversationId = readConversationId(url);
  const title = document.title.replace(/\s*[-|]\s*ChatGPT\s*$/i, "").trim() || "Untitled ChatGPT Conversation";
  const messages = messageRootCandidates()
    .map((node, index) => extractMessage(node, index, conversationId))
    .filter((message) => isValidMessage(message));

  if (messages.length > 0) {
    messages[0].segmentStart = true;
  }

  return {
    conversationId,
    title,
    url: url.toString(),
    capturedAt: new Date().toISOString(),
    messages
  };
}
