import { Modal, Notice, TFile } from "obsidian";
import type { SearchDocument } from "../shared/types";
import type ChatGPTObsidianBridgePlugin from "../../main";

export class SearchImportedConversationsModal extends Modal {
  constructor(
    private readonly plugin: ChatGPTObsidianBridgePlugin,
    private readonly documents: SearchDocument[]
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("chatgpt-bridge-search");

    const input = contentEl.createEl("input", {
      attr: {
        type: "search",
        placeholder: "Search imported conversations..."
      }
    });

    const results = contentEl.createDiv({ cls: "chatgpt-bridge-results" });

    const renderResults = (items: SearchDocument[]) => {
      results.empty();

      if (items.length === 0) {
        results.createEl("p", { text: "No imported conversations matched the query." });
        return;
      }

      items.forEach((document) => {
        const card = results.createDiv({ cls: "chatgpt-bridge-result" });
        card.createEl("strong", { text: document.title });
        card.createEl("p", { text: document.filePath });
        card.onclick = async () => {
          const file = this.app.vault.getAbstractFileByPath(document.filePath);
          if (!(file instanceof TFile)) {
            new Notice("The indexed note no longer exists.");
            return;
          }

          await this.app.workspace.getLeaf(true).openFile(file);
          this.close();
        };
      });
    };

    renderResults(this.documents);
    input.addEventListener("input", () => {
      renderResults(this.plugin.searchImportedConversations(input.value));
    });
    input.focus();
  }
}
