export const MAX_RANDOM_PEER_REQUEST_ATTEMPTS = 10

export const serverMessageKeys = {
  challenge: "challenge",
  conectionSize: "conectionSize",
  inference: "inference",
  join: "join",
  joinAck: "joinAck",
  leave: "leave",
  newConversation: "newConversation",
  providerDetails: "providerDetails",
  reportCompletion: "reportCompletion",
  requestProvider: "requestProvider",
  sessionValid: "sessionValid",
  verifySession: "verifySession",
} as const;
