export type MessageRole = "user" | "assistant" | "system" | "unknown";
export type ImportMode = "selected" | "separate_note" | "segmented";
export type MessageParseState = "parsed" | "fallback" | "unparsed";

export interface CodeBlock {
  language: string;
  code: string;
}

export interface ConversationMessage {
  id: string;
  role: MessageRole;
  index: number;
  contentText: string;
  contentMarkdown: string;
  selected: boolean;
  codeBlocks: CodeBlock[];
  parseState: MessageParseState;
  segmentStart: boolean;
}

export interface ParsedConversation {
  conversationId: string;
  title: string;
  url: string;
  capturedAt: string;
  messages: ConversationMessage[];
}

export interface ImportRequest {
  conversation: ParsedConversation;
  selectedMessageIds: string[];
  importMode: ImportMode;
  segmentStartMessageIds?: string[];
}

export interface SearchDocument {
  documentId: string;
  conversationId: string;
  title: string;
  filePath: string;
  tags: string[];
  content: string;
}

export interface BridgePluginSettings {
  bridgeToken: string;
}

export interface PersistedPluginData {
  index: SearchDocument[];
}
