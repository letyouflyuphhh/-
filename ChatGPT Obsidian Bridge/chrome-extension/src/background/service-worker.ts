import { importConversation } from "./obsidian-client";
import type { ExtensionSettings, ImportRequest } from "../shared/types";

const SETTINGS_KEY = "settings";

async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return {
    bridgeToken: stored[SETTINGS_KEY]?.bridgeToken ?? ""
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "IMPORT_SELECTED_MESSAGES") {
    return undefined;
  }

  void (async () => {
    try {
      const settings = await getSettings();
      if (!settings.bridgeToken) {
        throw new Error("Bridge token is required before importing.");
      }

      const payload = message.payload as ImportRequest;
      const result = await importConversation(payload, settings.bridgeToken);
      sendResponse({ ok: true, filePaths: result.filePaths });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Import failed."
      });
    }
  })();

  return true;
});
