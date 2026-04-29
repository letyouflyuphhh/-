import { createServer, Server } from "node:http";
import { Notice } from "obsidian";
import { handleRoute } from "./routes";
import type ChatGPTObsidianBridgePlugin from "../../main";

export class LocalBridgeServer {
  private server: Server | null = null;

  constructor(private readonly plugin: ChatGPTObsidianBridgePlugin) {}

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    this.server = createServer((request, response) => {
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

    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(28765, "127.0.0.1", () => resolve());
    }).catch((error) => {
      this.server = null;
      new Notice("ChatGPT Bridge could not start its local server.");
      throw error;
    });
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
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
}
