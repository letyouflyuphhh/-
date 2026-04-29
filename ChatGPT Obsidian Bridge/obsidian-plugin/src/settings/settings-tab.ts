import { PluginSettingTab, Setting } from "obsidian";
import type ChatGPTObsidianBridgePlugin from "../../main";

export class ChatGPTBridgeSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: ChatGPTObsidianBridgePlugin) {
    super(plugin.app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Bridge token")
      .setDesc("The shared secret required by the Chrome extension to import into this vault.")
      .addText((text) =>
        text
          .setPlaceholder("Enter bridge token")
          .setValue(this.plugin.settings.bridgeToken)
          .onChange(async (value) => {
            this.plugin.settings.bridgeToken = value.trim();
            await this.plugin.saveSettings();
            await this.plugin.restartServer();
          })
      );
  }
}
