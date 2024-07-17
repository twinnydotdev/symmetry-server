export const NORMALIZE_REGEX = /\s*\r?\n|\r/g;

export const apiProviders = {
  LiteLLM: "litellm",
  LlamaCpp: "llamacpp",
  Ollama: "ollama",
  OpenWebUI: "openwebui",
};

export const serverMessageKeys = {
  heartbeat: "heartbeat",
  inference: "inference",
  join: "join",
  joinAck: "joinAck",
  leave: "leave",
  providerDetails: "providerDetails",
  reportCompletion: "reportCompletion",
  requestProvider: "requestProvider",
  sessionValid: "sessionValid",
  verifySession: "verifySession",
} as const;
