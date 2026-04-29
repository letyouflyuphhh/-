"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ChatGPTObsidianBridgePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian5 = require("obsidian");

// src/importer/duplicate-checker.ts
var import_obsidian = require("obsidian");
function findExistingDocumentFile(vault, documentId, indexedDocuments, expectedPath) {
  const indexed = indexedDocuments.find((document) => document.documentId === documentId);
  if (indexed) {
    const file = vault.getAbstractFileByPath(indexed.filePath);
    if (file instanceof import_obsidian.TFile) {
      return file;
    }
  }
  if (expectedPath) {
    const file = vault.getAbstractFileByPath(expectedPath);
    if (file instanceof import_obsidian.TFile) {
      return file;
    }
  }
  return vault.getFiles().filter((file) => file.path.startsWith("ChatGPT/Conversations/")).find((file) => file.basename.includes(documentId)) ?? null;
}
function ensureFolderChain(vault, path) {
  const segments = path.split("/").slice(0, -1);
  let current = "";
  const tasks = [];
  segments.forEach((segment) => {
    current = current ? `${current}/${segment}` : segment;
    if (!vault.getAbstractFileByPath(current)) {
      tasks.push(vault.createFolder(current).catch(() => void 0));
    }
  });
  return Promise.all(tasks);
}

// src/importer/file-namer.ts
function pad(value) {
  return String(value).padStart(2, "0");
}
function cleanTitle(title) {
  const cleaned = title.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").toLowerCase();
  return cleaned || "untitled-conversation";
}
function cleanSuffix(value) {
  return value.replace(/[^\w-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}
function buildConversationPath(conversation, documentKey) {
  const capturedAt = new Date(conversation.capturedAt);
  const year = capturedAt.getUTCFullYear();
  const month = pad(capturedAt.getUTCMonth() + 1);
  const slug = cleanTitle(conversation.title);
  const suffix = documentKey ? `-${cleanSuffix(documentKey)}` : "";
  return `ChatGPT/Conversations/${year}/${month}/${slug}-${conversation.conversationId}${suffix}.md`;
}

// src/importer/markdown-writer.ts
function yamlValue(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function compactRanges(messages) {
  const indexes = messages.map((message) => message.index + 1).sort((left, right) => left - right);
  const ranges = [];
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
  if (start !== void 0) {
    ranges.push(start === end ? `${start}` : `${start}-${end}`);
  }
  return ranges.join("_");
}
function formatImportedBody(body) {
  let formatted = body.replace(/\r\n/g, "\n").trim();
  formatted = formatted.replace(/([^\n])(\n?---\n?)/g, "$1\n\n$2").replace(/([^\n])(\n?#{1,6}\s)/g, "$1\n\n$2").replace(/([^\n])(\n?\d+\.\s)/g, "$1\n$2").replace(/([^\n])(\n?- )/g, "$1\n$2").replace(/([^\n])(\n?`{3})/g, "$1\n\n$2").replace(/(`{3}[^\n]*\n)([\s\S]*?)(\n`{3})/g, (_match, open, code, close) => {
    const normalizedCode = code.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trimEnd();
    return `${open}${normalizedCode}${close}`;
  });
  formatted = formatted.replace(/(标题：|URL：|JSON|TypeScript|Markdown|YAML)(?!\n)/g, "\n$1").replace(/\n{3,}/g, "\n\n").trim();
  return formatted;
}
function selectedMessages(request) {
  return request.conversation.messages.filter((message) => request.selectedMessageIds.includes(message.id));
}
function buildSegmentedDocuments(request, messages) {
  const segmentStarts = new Set(
    (request.segmentStartMessageIds ?? []).filter((messageId) => request.selectedMessageIds.includes(messageId))
  );
  if (messages.length > 0) {
    segmentStarts.add(messages[0].id);
  }
  const segments = [];
  let currentSegment = [];
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
function prepareImportDocuments(request) {
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
function renderFrontmatter(request, document) {
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
function renderConversationBody(request, document) {
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
async function writeImportedDocuments(vault, request, indexedDocuments) {
  const documents = prepareImportDocuments(request);
  const written = [];
  for (const document of documents) {
    const existingFile = findExistingDocumentFile(vault, document.documentId, indexedDocuments, document.filePath);
    const content = `${renderFrontmatter(request, document)}

${renderConversationBody(request, document)}
`;
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

// src/indexer/fulltext-index.ts
function normalize(text) {
  return text.toLowerCase();
}
var FullTextIndex = class {
  constructor(app) {
    this.app = app;
    this.documents = /* @__PURE__ */ new Map();
  }
  hydrate(data) {
    this.documents.clear();
    data?.index?.forEach((document) => {
      const documentId = document.documentId ?? document.conversationId;
      this.documents.set(documentId, {
        ...document,
        documentId
      });
    });
  }
  serialize() {
    return {
      index: Array.from(this.documents.values())
    };
  }
  listDocuments() {
    return Array.from(this.documents.values());
  }
  async rebuildFromVault() {
    this.documents.clear();
    const files = this.app.vault.getFiles().filter((file) => file.path.startsWith("ChatGPT/Conversations/") && file.extension === "md");
    for (const file of files) {
      const content = await this.app.vault.cachedRead(file);
      const conversationId = content.match(/conversation_id:\s*"([^"]+)"/)?.[1];
      const documentId = content.match(/document_id:\s*"([^"]+)"/)?.[1] ?? conversationId ?? file.basename;
      const title = content.match(/title:\s*"([^"]+)"/)?.[1] ?? file.basename;
      const tagsMatch = content.match(/tags:\s*\[(.*)\]/)?.[1] ?? "";
      const tags = tagsMatch.split(",").map((item) => item.trim().replace(/^"|"$/g, "")).filter(Boolean);
      if (!conversationId) {
        continue;
      }
      this.documents.set(documentId, {
        documentId,
        conversationId,
        title,
        filePath: file.path,
        tags,
        content: normalize(`${title}
${tags.join(" ")}
${content}
${file.path}`)
      });
    }
  }
  indexDocument(request, document, file) {
    const messages = document.messages.length > 0 ? document.messages : request.conversation.messages.filter(
      (message) => request.selectedMessageIds.includes(message.id)
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
          ...messages.map((message) => message.contentText)
        ].join("\n")
      )
    });
  }
  search(query) {
    const normalized = normalize(query.trim());
    if (!normalized) {
      return this.listDocuments();
    }
    return this.listDocuments().filter((document) => document.content.includes(normalized)).sort((left, right) => left.title.localeCompare(right.title));
  }
};

// src/indexer/search-view.ts
var import_obsidian2 = require("obsidian");
var SearchImportedConversationsModal = class extends import_obsidian2.Modal {
  constructor(plugin, documents) {
    super(plugin.app);
    this.plugin = plugin;
    this.documents = documents;
  }
  onOpen() {
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
    const renderResults = (items) => {
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
          if (!(file instanceof import_obsidian2.TFile)) {
            new import_obsidian2.Notice("The indexed note no longer exists.");
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
};

// src/settings/settings-tab.ts
var import_obsidian3 = require("obsidian");
var ChatGPTBridgeSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(plugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian3.Setting(containerEl).setName("Bridge token").setDesc("The shared secret required by the Chrome extension to import into this vault.").addText(
      (text) => text.setPlaceholder("Enter bridge token").setValue(this.plugin.settings.bridgeToken).onChange(async (value) => {
        this.plugin.settings.bridgeToken = value.trim();
        await this.plugin.saveSettings();
        await this.plugin.restartServer();
      })
    );
  }
};

// src/server/local-server.ts
var import_node_http = require("node:http");
var import_obsidian4 = require("obsidian");

// src/server/auth.ts
function isAuthorized(expectedToken, providedToken) {
  if (!expectedToken) {
    return false;
  }
  if (Array.isArray(providedToken)) {
    return providedToken.includes(expectedToken);
  }
  return providedToken === expectedToken;
}

// src/server/routes.ts
async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}
function send(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}
async function handleRoute(plugin, request, response) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:28765");
  if (request.method === "GET" && url.pathname === "/health") {
    send(response, 200, { ok: true, status: "healthy" });
    return;
  }
  if (request.method === "POST" && (url.pathname === "/import" || url.pathname === "/reindex")) {
    const token = request.headers["x-bridge-token"];
    if (!isAuthorized(plugin.settings.bridgeToken, token)) {
      send(response, 401, { ok: false, error: "Unauthorized." });
      return;
    }
  }
  if (request.method === "POST" && url.pathname === "/import") {
    const body = await readJsonBody(request);
    const result = await plugin.handleImport(body);
    send(response, 200, { ok: true, filePaths: result.map((file) => file.path) });
    return;
  }
  if (request.method === "POST" && url.pathname === "/reindex") {
    await plugin.rebuildIndex();
    send(response, 200, { ok: true });
    return;
  }
  send(response, 404, { ok: false, error: "Not found." });
}

// src/server/local-server.ts
var LocalBridgeServer = class {
  constructor(plugin) {
    this.plugin = plugin;
    this.server = null;
  }
  async start() {
    if (this.server) {
      return;
    }
    this.server = (0, import_node_http.createServer)((request, response) => {
      void handleRoute(this.plugin, request, response).catch((error) => {
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(
          JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : "Unexpected server error."
          })
        );
      });
    });
    await new Promise((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(28765, "127.0.0.1", () => resolve());
    }).catch((error) => {
      this.server = null;
      new import_obsidian4.Notice("ChatGPT Bridge could not start its local server.");
      throw error;
    });
  }
  async stop() {
    if (!this.server) {
      return;
    }
    await new Promise((resolve, reject) => {
      this.server?.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    this.server = null;
  }
};

// main.ts
var DEFAULT_SETTINGS = {
  bridgeToken: ""
};
var ChatGPTObsidianBridgePlugin = class extends import_obsidian5.Plugin {
  constructor(app, manifest) {
    super(app, manifest);
    this.settings = DEFAULT_SETTINGS;
    this.persisted = { index: [] };
    this.index = new FullTextIndex(app);
    this.server = new LocalBridgeServer(this);
  }
  async onload() {
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
          new import_obsidian5.Notice("ChatGPT Bridge search index rebuilt.");
        });
      }
    });
    await this.server.start();
    await this.rebuildIndex();
  }
  async onunload() {
    await this.server.stop();
  }
  async loadSettings() {
    const data = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...data?.settings ?? {} };
    this.persisted = data?.persisted ?? { index: [] };
  }
  async saveSettings() {
    await this.saveData({
      settings: this.settings,
      persisted: this.index.serialize()
    });
  }
  async restartServer() {
    await this.server.stop();
    await this.server.start();
  }
  async handleImport(request) {
    if (!request?.conversation?.conversationId) {
      throw new Error("Invalid import payload.");
    }
    const written = await writeImportedDocuments(this.app.vault, request, this.index.listDocuments());
    written.forEach(({ file, document }) => {
      this.index.indexDocument(request, document, file);
    });
    await this.saveSettings();
    new import_obsidian5.Notice(`Imported ChatGPT conversation: ${request.conversation.title}`);
    return written.map(({ file }) => file);
  }
  async rebuildIndex() {
    await this.index.rebuildFromVault();
    await this.saveSettings();
  }
  searchImportedConversations(query) {
    return this.index.search(query);
  }
};
