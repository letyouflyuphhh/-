import { TFile, Vault } from "obsidian";
import type { SearchDocument } from "../shared/types";

export function findExistingDocumentFile(
  vault: Vault,
  documentId: string,
  indexedDocuments: SearchDocument[],
  expectedPath?: string
): TFile | null {
  const indexed = indexedDocuments.find((document) => document.documentId === documentId);
  if (indexed) {
    const file = vault.getAbstractFileByPath(indexed.filePath);
    if (file instanceof TFile) {
      return file;
    }
  }

  if (expectedPath) {
    const file = vault.getAbstractFileByPath(expectedPath);
    if (file instanceof TFile) {
      return file;
    }
  }

  return vault
    .getFiles()
    .filter((file) => file.path.startsWith("ChatGPT/Conversations/"))
    .find((file) => file.basename.includes(documentId)) ?? null;
}

export function ensureFolderChain(vault: Vault, path: string): Promise<void[]> {
  const segments = path.split("/").slice(0, -1);
  let current = "";
  const tasks: Promise<void>[] = [];

  segments.forEach((segment) => {
    current = current ? `${current}/${segment}` : segment;
    if (!vault.getAbstractFileByPath(current)) {
      tasks.push(vault.createFolder(current).catch(() => undefined));
    }
  });

  return Promise.all(tasks);
}
