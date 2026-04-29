import { App, TFile } from "obsidian";
import type {
  ConversationMessage,
  ImportRequest,
  PersistedPluginData,
  SearchDocument
} from "../shared/types";
import type { PreparedImportDocument } from "../importer/markdown-writer";

function normalize(text: string): string {
  return text.toLowerCase();
}

export class FullTextIndex {
  private documents = new Map<string, SearchDocument>();

  constructor(private readonly app: App) {}

  hydrate(data: PersistedPluginData | null | undefined): void {
    this.documents.clear();
    data?.index?.forEach((document) => {
      const documentId = (document as SearchDocument & { documentId?: string }).documentId ?? document.conversationId;
      this.documents.set(documentId, {
        ...document,
        documentId
      });
    });
  }

  serialize(): PersistedPluginData {
    return {
      index: Array.from(this.documents.values())
    };
  }

  listDocuments(): SearchDocument[] {
    return Array.from(this.documents.values());
  }

  async rebuildFromVault(): Promise<void> {
    this.documents.clear();

    const files = this.app.vault
      .getFiles()
      .filter((file) => file.path.startsWith("ChatGPT/Conversations/") && file.extension === "md");

    for (const file of files) {
      const content = await this.app.vault.cachedRead(file);
      const conversationId = content.match(/conversation_id:\s*"([^"]+)"/)?.[1];
      const documentId =
        content.match(/document_id:\s*"([^"]+)"/)?.[1] ??
        conversationId ??
        file.basename;
      const title = content.match(/title:\s*"([^"]+)"/)?.[1] ?? file.basename;
      const tagsMatch = content.match(/tags:\s*\[(.*)\]/)?.[1] ?? "";
      const tags = tagsMatch
        .split(",")
        .map((item) => item.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);

      if (!conversationId) {
        continue;
      }

      this.documents.set(documentId, {
        documentId,
        conversationId,
        title,
        filePath: file.path,
        tags,
        content: normalize(`${title}\n${tags.join(" ")}\n${content}\n${file.path}`)
      });
    }
  }

  indexDocument(
    request: ImportRequest,
    document: PreparedImportDocument,
    file: TFile
  ): void {
    const messages = document.messages.length > 0
      ? document.messages
      : request.conversation.messages.filter((message) =>
          request.selectedMessageIds.includes(message.id)
        );

    this.documents.set(document.documentId, {
      documentId: document.documentId,
      conversationId: request.conversation.conversationId,
      title: request.conversation.title,
      filePath: file.path,
      tags: [],
      content: normalize(
        [
          request.conversation.title,
          file.path,
          document.messageRange,
          ...messages.map((message: ConversationMessage) => message.contentText)
        ].join("\n")
      )
    });
  }

  search(query: string): SearchDocument[] {
    const normalized = normalize(query.trim());
    if (!normalized) {
      return this.listDocuments();
    }

    return this.listDocuments()
      .filter((document) => document.content.includes(normalized))
      .sort((left, right) => left.title.localeCompare(right.title));
  }
}
