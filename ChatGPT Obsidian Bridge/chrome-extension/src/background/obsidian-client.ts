import type { ImportRequest } from "../shared/types";

const BASE_URL = "http://127.0.0.1:28765";

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, init);
}

export async function healthCheck(): Promise<boolean> {
  const response = await request("/health");
  return response.ok;
}

export async function importConversation(
  requestBody: ImportRequest,
  bridgeToken: string
): Promise<{ filePaths: string[] }> {
  const response = await request("/import", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Bridge-Token": bridgeToken
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<{ filePaths: string[] }>;
}
