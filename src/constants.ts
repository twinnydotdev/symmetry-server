export const serverMessageTypes = {
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
