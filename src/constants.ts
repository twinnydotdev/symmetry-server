export const MAX_RANDOM_PEER_REQUEST_ATTEMPTS = 5

export const serverMessageKeys = {
  challenge: "challenge",
  conectionSize: "conectionSize",
  heartbeat: "heartbeat",
  inference: "inference",
  inferenceEnded: "inferenceEnded",
  join: "join",
  joinAck: "joinAck",
  leave: "leave",
  newConversation: "newConversation",
  ping: "ping",
  pong: "pong",
  providerDetails: "providerDetails",
  reportCompletion: "reportCompletion",
  requestProvider: "requestProvider",
  completionSuccess: "completionSuccess",
  sessionValid: "sessionValid",
  verifySession: "verifySession",
} as const;
