import { App, Notice, Plugin, PluginManifest, TFile } from "obsidian";
import { writeImportedDocuments } from "./src/importer/markdown-writer";
import { FullTextIndex } from "./src/indexer/fulltext-index";
import { SearchImportedConversationsModal } from "./src/indexer/search-view";
import { ChatGPTBridgeSettingTab } from "./src/settings/settings-tab";
import { LocalBridgeServer } from "./src/server/local-server";
import type { BridgePluginSettings, ImportRequest, PersistedPluginData, SearchDocument } from "./src/shared/types";

const DEFAULT_SETTINGS: BridgePluginSettings = {
  bridgeToken: ""
};

export default class ChatGPTObsidianBridgePlugin extends Plugin {
  settings: BridgePluginSettings = DEFAULT_SETTINGS;
  private persisted: PersistedPluginData = { index: [] };
  private readonly index: FullTextIndex;
  private readonly server: LocalBridgeServer;

  constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);
    this.index = new FullTextIndex(app);
    this.server = new LocalBridgeServer(this);
  }

  async onload(): Promise<void> {
    await this.loadSettings();
    this.index.hydrate(this.persisted);

    this.addSettingTab(new ChatGPTBridgeSettingTab(this));

    this.addCommand({
      id: "search-imported-conversations",
      name: "Search Imported Conversations",
      callback: () => {
        new SearchImportedConversationsModal(this, this.index.listDocuments()).open();
      }
    });

    this.addCommand({
      id: "rebuild-search-index",
      name: "Rebuild Search Index",
      callback: () => {
        void this.rebuildIndex().then(() => {
          new Notice("ChatGPT Bridge search index rebuilt.");
        });
      }
    });

    await this.server.start();
    await this.rebuildIndex();
  }

  async onunload(): Promise<void> {
    await this.server.stop();
  }

  async loadSettings(): Promise<void> {
    const data = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...(data?.settings ?? {}) };
    this.persisted = data?.persisted ?? { index: [] };
  }

  async saveSettings(): Promise<void> {
    await this.saveData({
      settings: this.settings,
      persisted: this.index.serialize()
    });
  }

  async restartServer(): Promise<void> {
    await this.server.stop();
    await this.server.start();
  }

  async handleImport(request: ImportRequest): Promise<TFile[]> {
    if (!request?.conversation?.conversationId) {
      throw new Error("Invalid import payload.");
    }

    const written = await writeImportedDocuments(this.app.vault, request, this.index.listDocuments());
    written.forEach(({ file, document }) => {
      this.index.indexDocument(request, document, file);
    });
    await this.saveSettings();
    new Notice(`Imported ChatGPT conversation: ${request.conversation.title}`);
    return written.map(({ file }) => file);
  }

  async rebuildIndex(): Promise<void> {
    await this.index.rebuildFromVault();
    await this.saveSettings();
  }

  searchImportedConversations(query: string): SearchDocument[] {
    return this.index.search(query);
  }
}
