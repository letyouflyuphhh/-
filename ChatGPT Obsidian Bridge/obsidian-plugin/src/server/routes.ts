import { IncomingMessage, ServerResponse } from "node:http";
import { isAuthorized } from "./auth";
import type ChatGPTObsidianBridgePlugin from "../../main";
import type { ImportRequest } from "../shared/types";

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function send(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

export async function handleRoute(
  plugin: ChatGPTObsidianBridgePlugin,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
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
    const body = (await readJsonBody(request)) as ImportRequest;
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
