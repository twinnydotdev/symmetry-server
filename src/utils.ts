import { ClientMessage, ServerMessageKey } from "./types";

export function safeParseJson<T>(data: string): T | undefined {
  try {
    return JSON.parse(data) as T;
  } catch (e) {
    return undefined;
  }
}

export function createMessage<T>(key: ServerMessageKey, data: T): string {
  return JSON.stringify({ key, data });
}

export function parseMessage<T = unknown>(
  message: string
): ClientMessage<T> | null {
  const parsed = safeParseJson<ClientMessage<T>>(message);
  return parsed &&
    typeof parsed === "object" &&
    "key" in parsed &&
    "data" in parsed
    ? parsed
    : null;
}
