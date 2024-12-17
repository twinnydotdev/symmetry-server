import Fastify, { FastifyReply } from "fastify";
import fastifyWebsocket, { WebSocket } from "@fastify/websocket";
import fastifyCors from "@fastify/cors";
import { InferenceRequest, Peer, serverMessageKeys } from "symmetry-core";

import { createMessage } from "./utils";
import { logger } from "./logger";
import { PeerRepository } from "./provider-repository";
import { ProviderSessionRepository } from "./provider-session-repository";
import { MessageRepository } from "./message-repository";
import { ServerConfig } from "./server-config";

export class WebServer {
  private _config: ServerConfig;
  private _messageRepository: MessageRepository;
  private _peerRepository: PeerRepository;
  private _providerSessionRepository: ProviderSessionRepository;
  private _server = Fastify();
  private readonly MAX_HTTP_REQUESTS = 100;
  private readonly TIME_WINDOW = 60;
  public connectedPeers: Map<string, Peer> = new Map();
  public httpPeerReplies: Map<string, FastifyReply> = new Map();

  constructor(
    config: ServerConfig,
    peerRepository: PeerRepository,
    providerSessionRepository: ProviderSessionRepository,
    messageRepository: MessageRepository
  ) {
    this._config = config;
    this._peerRepository = peerRepository;
    this._providerSessionRepository = providerSessionRepository;
    this._messageRepository = messageRepository;
  }

  public async initialise() {
    await this._server.register(fastifyWebsocket);
    await this._server.register(fastifyCors, {
      origin: this._config.get("allowedOrigins"),
      methods: ["GET", "POST"],
      credentials: true,
    });

    this._server.post("/v1/chat/completions", async (request, reply) => {
      const clientIp =
        request.headers["x-forwarded-for"]?.toString() || request.ip;
      const messageCount = await this._messageRepository.getMessageCount(
        clientIp,
        this.TIME_WINDOW
      );

      if (
        messageCount &&
        messageCount.message_count >= this.MAX_HTTP_REQUESTS
      ) {
        reply.code(429).send({
          error: `Rate limit exceeded, max ${this.MAX_HTTP_REQUESTS} requests per ${this.TIME_WINDOW} minutes`,
        });
        return;
      }

      await this._messageRepository.incrementMessageCount(clientIp);

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const message = request.body as any;
      const dbPeer = await this._peerRepository.getRandom(
        message.sessionRequest
      );

      if (!dbPeer) {
        reply.raw.end('data: {"error":"No peers available"}\n\n');
        return;
      }

      const peer = this.connectedPeers.get(dbPeer.key);

      if (!peer) return;

      const peerKey = dbPeer.key;
      this.httpPeerReplies.set(peerKey, reply);

      const inferenceRequest: InferenceRequest = {
        messages: message.data.messages,
        key: peer.remotePublicKey.toString("hex"),
      };

      const data = createMessage(serverMessageKeys.inference, inferenceRequest);

      peer.write(data);

      request.raw.on("close", () => {
        this.httpPeerReplies.delete(peerKey);
      });
    });

    const WEBSOCKET_INTERVAL = 5000;

    this._server.get("/ws", { websocket: true }, (ws) => {
      this.sendStats(ws);
      setInterval(() => this.sendStats(ws), WEBSOCKET_INTERVAL);
    });

    try {
      await this._server.listen({ port: this._config.get("apiPort") });
      logger.info(`Server listening on port ${this._config.get("apiPort")}`);
    } catch (err) {
      console.error("Error starting server:", err);
      process.exit(1);
    }
  }

  private async sendStats(ws: WebSocket) {
    const stats = await this.getStats();
    ws.send(JSON.stringify(stats));
  }

  private async getStats() {
    const activeModels = await this._peerRepository.getActiveModelCount();
    const activePeers = await this._peerRepository.getActivePeerCount();
    const allPeers = await this._peerRepository.getAllPeers();
    const stats = await this._providerSessionRepository.getStats();
    const uniquePeerCount = await this._peerRepository.getUniquePeerCount();

    return {
      uniquePeerCount,
      activePeers,
      activeModels,
      allPeers,
      stats,
    };
  }
}
