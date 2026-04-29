import type {
  ConversationMessage,
  ExtensionSettings,
  ImportMode,
  ImportRequest,
  ParsedConversation
} from "../shared/types";

const SETTINGS_KEY = "settings";

let currentConversation: ParsedConversation | null = null;

const tokenInput = document.querySelector<HTMLInputElement>("#bridge-token");
const statusNode = document.querySelector<HTMLElement>("#status");
const messagesNode = document.querySelector<HTMLElement>("#messages");
const metaNode = document.querySelector<HTMLElement>("#conversation-meta");
const selectAllButton = document.querySelector<HTMLButtonElement>("#select-all");
const unselectAllButton = document.querySelector<HTMLButtonElement>("#unselect-all");
const importButton = document.querySelector<HTMLButtonElement>("#import-selected");
const importSeparateButton = document.querySelector<HTMLButtonElement>("#import-separate-note");
const importSegmentsButton = document.querySelector<HTMLButtonElement>("#import-segments");

function setStatus(text: string, isError = false): void {
  if (!statusNode) {
    return;
  }

  statusNode.textContent = text;
  statusNode.style.color = isError ? "#9f1239" : "#4a5968";
}

async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return {
    bridgeToken: stored[SETTINGS_KEY]?.bridgeToken ?? ""
  };
}

async function saveSettings(): Promise<void> {
  const settings: ExtensionSettings = {
    bridgeToken: tokenInput?.value.trim() ?? ""
  };

  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

function selectedMessageIds(messages: ConversationMessage[]): string[] {
  return messages.filter((message) => message.selected).map((message) => message.id);
}

function selectedSegmentStartIds(messages: ConversationMessage[]): string[] {
  return messages.filter((message) => message.selected && message.segmentStart).map((message) => message.id);
}

function ensureSegmentBoundaries(messages: ConversationMessage[]): void {
  const selected = messages.filter((message) => message.selected);
  const firstSelected = selected[0];

  messages.forEach((message) => {
    if (!message.selected) {
      message.segmentStart = false;
    }
  });

  if (!firstSelected) {
    return;
  }

  firstSelected.segmentStart = true;
}

function renderConversation(conversation: ParsedConversation): void {
  currentConversation = conversation;
  ensureSegmentBoundaries(conversation.messages);

  if (metaNode) {
    metaNode.textContent = `${conversation.title} · ${conversation.messages.length} messages`;
  }

  if (!messagesNode) {
    return;
  }

  messagesNode.innerHTML = "";

  conversation.messages.forEach((message) => {
    const card = document.createElement("article");
    card.className = "message-card";
    if (message.parseState === "unparsed") {
      card.classList.add("unparsed");
    }

    const header = document.createElement("div");
    header.className = "message-header";
    header.innerHTML = `<strong>${message.role}</strong><span>#${message.index + 1}</span>`;

    const controls = document.createElement("div");
    controls.className = "message-controls";

    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = message.selected;
    checkbox.addEventListener("change", () => {
      message.selected = checkbox.checked;
      if (!checkbox.checked) {
        message.segmentStart = false;
      }
      ensureSegmentBoundaries(conversation.messages);
      renderConversation(conversation);
    });

    const preview = document.createElement("p");
    preview.className = "message-preview";
    preview.textContent = message.contentText.slice(0, 400) || "[Empty message]";
    label.append(checkbox, preview);
    controls.append(label);

    if (message.selected) {
      const segmentToggle = document.createElement("label");
      segmentToggle.className = "segment-toggle";
      const segmentCheckbox = document.createElement("input");
      segmentCheckbox.type = "checkbox";
      segmentCheckbox.checked = message.segmentStart;
      segmentCheckbox.disabled = message.index === conversation.messages.find((item) => item.selected)?.index;
      segmentCheckbox.addEventListener("change", () => {
        message.segmentStart = segmentCheckbox.checked;
        ensureSegmentBoundaries(conversation.messages);
        renderConversation(conversation);
      });
      segmentToggle.append(segmentCheckbox, document.createTextNode(" Start a new note here"));
      controls.append(segmentToggle);
    }

    if (message.parseState === "unparsed") {
      const note = document.createElement("p");
      note.className = "message-note";
      note.textContent = "This block was not parsed into usable content and will stay unselected.";
      controls.append(note);
    }

    card.append(header, controls);
    messagesNode.append(card);
  });
}

async function parseActiveConversation(): Promise<void> {
  setStatus("Parsing current ChatGPT conversation...");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus("No active tab found.", true);
    return;
  }

  let response: { ok: boolean; error?: string; conversation?: ParsedConversation } | undefined;

  try {
    response = await chrome.tabs.sendMessage(tab.id, { type: "PARSE_CONVERSATION" });
  } catch {
    setStatus("Open a supported ChatGPT conversation before using this extension.", true);
    return;
  }

  if (!response?.ok) {
    setStatus(response?.error ?? "Failed to parse the current page.", true);
    return;
  }

  renderConversation(response.conversation as ParsedConversation);
  setStatus("Conversation parsed. Review and import selected messages.");
}

function updateSelection(selected: boolean): void {
  if (!currentConversation) {
    return;
  }

  currentConversation.messages.forEach((message) => {
    message.selected = selected && message.parseState !== "unparsed";
    message.segmentStart = false;
  });

  ensureSegmentBoundaries(currentConversation.messages);
  renderConversation(currentConversation);
}

async function importConversation(importMode: ImportMode): Promise<void> {
  if (!currentConversation) {
    setStatus("No parsed conversation is available.", true);
    return;
  }

  await saveSettings();

  const payload: ImportRequest = {
    conversation: currentConversation,
    selectedMessageIds: selectedMessageIds(currentConversation.messages),
    importMode,
    segmentStartMessageIds: selectedSegmentStartIds(currentConversation.messages)
  };

  if (payload.selectedMessageIds.length === 0) {
    setStatus("Select at least one message before importing.", true);
    return;
  }

  const importingStatus =
    importMode === "selected"
      ? "Sending selected messages to Obsidian..."
      : importMode === "separate_note"
        ? "Creating a separate Obsidian note..."
        : "Creating segmented Obsidian notes...";

  setStatus(importingStatus);
  const response = await chrome.runtime.sendMessage({
    type: "IMPORT_SELECTED_MESSAGES",
    payload
  });

  if (!response?.ok) {
    setStatus(response?.error ?? "Import failed.", true);
    return;
  }

  const paths = Array.isArray(response.filePaths)
    ? response.filePaths
    : response.filePath
      ? [response.filePath]
      : [];

  setStatus(`Imported successfully: ${paths.join(" | ")}`);
}

async function bootstrap(): Promise<void> {
  const settings = await getSettings();
  if (tokenInput) {
    tokenInput.value = settings.bridgeToken;
    tokenInput.addEventListener("change", () => {
      void saveSettings();
    });
  }

  selectAllButton?.addEventListener("click", () => updateSelection(true));
  unselectAllButton?.addEventListener("click", () => updateSelection(false));
  importButton?.addEventListener("click", () => {
    void importConversation("selected");
  });
  importSeparateButton?.addEventListener("click", () => {
    void importConversation("separate_note");
  });
  importSegmentsButton?.addEventListener("click", () => {
    void importConversation("segmented");
  });

  await parseActiveConversation();
}

void bootstrap().catch((error) => {
  setStatus(error instanceof Error ? error.message : "Popup initialization failed.", true);
});
