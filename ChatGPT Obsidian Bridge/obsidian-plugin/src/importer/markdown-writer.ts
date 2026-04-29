import { TFile, Vault } from "obsidian";
import { findExistingDocumentFile, ensureFolderChain } from "./duplicate-checker";
import { buildConversationPath } from "./file-namer";
import type {
  ConversationMessage,
  ImportMode,
  ImportRequest,
  SearchDocument
} from "../shared/types";

export interface PreparedImportDocument {
  documentId: string;
  filePath: string;
  importMode: ImportMode;
  segmentId?: string;
  messageRange: string;
  messages: ConversationMessage[];
}

function yamlValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function compactRanges(messages: ConversationMessage[]): string {
  const indexes = messages.map((message) => message.index + 1).sort((left, right) => left - right);
  const ranges: string[] = [];
  let start = indexes[0];
  let end = indexes[0];

  for (let index = 1; index < indexes.length; index += 1) {
    const current = indexes[index];
    if (current === end + 1) {
      end = current;
      continue;
    }

    ranges.push(start === end ? `${start}` : `${start}-${end}`);
    start = current;
    end = current;
  }

  if (start !== undefined) {
    ranges.push(start === end ? `${start}` : `${start}-${end}`);
  }

  return ranges.join("_");
}

function formatImportedBody(body: string): string {
  let formatted = body.replace(/\r\n/g, "\n").trim();

  formatted = formatted
    .replace(/([^\n])(\n?---\n?)/g, "$1\n\n$2")
    .replace(/([^\n])(\n?#{1,6}\s)/g, "$1\n\n$2")
    .replace(/([^\n])(\n?\d+\.\s)/g, "$1\n$2")
    .replace(/([^\n])(\n?- )/g, "$1\n$2")
    .replace(/([^\n])(\n?`{3})/g, "$1\n\n$2")
    .replace(/(`{3}[^\n]*\n)([\s\S]*?)(\n`{3})/g, (_match, open, code, close) => {
      const normalizedCode = code
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trimEnd();

      return `${open}${normalizedCode}${close}`;
    });

  formatted = formatted
    .replace(/(标题：|URL：|JSON|TypeScript|Markdown|YAML)(?!\n)/g, "\n$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return formatted;
}

function selectedMessages(request: ImportRequest): ConversationMessage[] {
  return request.conversation.messages.filter((message) => request.selectedMessageIds.includes(message.id));
}

function buildSegmentedDocuments(request: ImportRequest, messages: ConversationMessage[]): PreparedImportDocument[] {
  const segmentStarts = new Set(
    (request.segmentStartMessageIds ?? []).filter((messageId) => request.selectedMessageIds.includes(messageId))
  );

  if (messages.length > 0) {
    segmentStarts.add(messages[0].id);
  }

  const segments: ConversationMessage[][] = [];
  let currentSegment: ConversationMessage[] = [];

  messages.forEach((message, index) => {
    if (index > 0 && segmentStarts.has(message.id) && currentSegment.length > 0) {
      segments.push(currentSegment);
      currentSegment = [];
    }

    currentSegment.push(message);
  });

  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  return segments.map((segment) => {
    const messageRange = compactRanges(segment);
    const segmentId = `segment-${messageRange}`;
    return {
      documentId: `${request.conversation.conversationId}--${segmentId}`,
      filePath: buildConversationPath(request.conversation, segmentId),
      importMode: "segmented",
      segmentId,
      messageRange,
      messages: segment
    };
  });
}

export function prepareImportDocuments(request: ImportRequest): PreparedImportDocument[] {
  const messages = selectedMessages(request);
  if (messages.length === 0) {
    return [];
  }

  if (request.importMode === "selected") {
    return [
      {
        documentId: request.conversation.conversationId,
        filePath: buildConversationPath(request.conversation),
        importMode: "selected",
        messageRange: compactRanges(messages),
        messages
      }
    ];
  }

  if (request.importMode === "separate_note") {
    const messageRange = compactRanges(messages);
    const segmentId = `part-${messageRange}`;
    return [
      {
        documentId: `${request.conversation.conversationId}--${segmentId}`,
        filePath: buildConversationPath(request.conversation, segmentId),
        importMode: "separate_note",
        segmentId,
        messageRange,
        messages
      }
    ];
  }

  return buildSegmentedDocuments(request, messages);
}

function renderFrontmatter(request: ImportRequest, document: PreparedImportDocument): string {
  const lines = [
    "---",
    `document_id: ${yamlValue(document.documentId)}`,
    "source: chatgpt-web",
    `conversation_id: ${yamlValue(request.conversation.conversationId)}`,
    `title: ${yamlValue(request.conversation.title)}`,
    `url: ${yamlValue(request.conversation.url)}`,
    `captured_at: ${yamlValue(request.conversation.capturedAt)}`,
    `import_mode: ${document.importMode}`,
    "tags: []",
    "summary_status: pending",
    "index_status: indexed",
    `message_range: ${yamlValue(document.messageRange)}`
  ];

  if (document.segmentId) {
    lines.push(`segment_id: ${yamlValue(document.segmentId)}`);
  }

  lines.push("---");
  return lines.join("\n");
}

function renderConversationBody(request: ImportRequest, document: PreparedImportDocument): string {
  const sections = document.messages.map((message) => {
    const heading = message.role === "assistant" ? "Assistant" : message.role === "user" ? "User" : "Message";
    const body = formatImportedBody(message.contentMarkdown || message.contentText || "[Empty message]");
    return [`## ${heading} ${message.index + 1}`, "", body.trim(), "", "---"].join("\n");
  });

  return [
    `# ${request.conversation.title}`,
    "",
    "## Basic Information",
    "",
    `- Conversation ID: \`${request.conversation.conversationId}\``,
    `- Document ID: \`${document.documentId}\``,
    `- Import Mode: ${document.importMode}`,
    `- Message Range: ${document.messageRange}`,
    `- Captured At: ${request.conversation.capturedAt}`,
    `- Source URL: ${request.conversation.url}`,
    "",
    "## Original Conversation",
    "",
    ...sections
  ].join("\n");
}

export async function writeImportedDocuments(
  vault: Vault,
  request: ImportRequest,
  indexedDocuments: SearchDocument[]
): Promise<Array<{ file: TFile; document: PreparedImportDocument }>> {
  const documents = prepareImportDocuments(request);
  const written: Array<{ file: TFile; document: PreparedImportDocument }> = [];

  for (const document of documents) {
    const existingFile = findExistingDocumentFile(vault, document.documentId, indexedDocuments, document.filePath);
    const content = `${renderFrontmatter(request, document)}\n\n${renderConversationBody(request, document)}\n`;

    if (existingFile) {
      await vault.modify(existingFile, content);
      written.push({ file: existingFile, document });
      continue;
    }

    await ensureFolderChain(vault, document.filePath);
    const file = await vault.create(document.filePath, content);
    written.push({ file, document });
  }

  return written;
}
