import chalk from "chalk";
import Hyperswarm from "hyperswarm";
import semver from "semver";
import crypto from "hypercore-crypto";
import cryptoLib from "node:crypto";
import { LRUCache } from "lru-cache";
import {
  InferenceRequest,
  Peer,
  safeParseJson,
  serverMessageKeys,
} from "symmetry-core";

import { ServerConfig as ServerConfig } from "./server-config";
import { createMessage } from "./utils";
import { logger } from "./logger";
import {
  MAX_RANDOM_PEER_REQUEST_ATTEMPTS,
  MIN_SUPPORTED_SYMMETRY_CORE_VERSION,
} from "./constants";
import { MessageRepository } from "./message-repository";
import { PeerRepository } from "./provider-repository";
import { ProviderSessionRepository } from "./provider-session-repository";
import { SessionRepository } from "./session-repository";

import {
  ChallengeRequest,
  ClientMessage,
  CompletionMetrics,
  ConnectionSizeUpdate,
  PeerSessionRequest,
  PeerUpsert,
} from "./types";
import { WebServer } from "./web-server";

export class SymmetryServer {
  private _config: ServerConfig;
  private _durationIntervals: Map<string, NodeJS.Timeout> = new Map();
  private _heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();
  // Map inference tokens to peer keys for cleanup
  private _inferenceTokens: Map<string, string> = new Map();
  private _messageRateLimitCache: LRUCache<string, number>;
  private _messageRepository: MessageRepository;
  private _missedPongs: Map<string, number> = new Map();
  private _peerRepository: PeerRepository;
  private _pointsIntervals: Map<string, NodeJS.Timeout> = new Map();
  private _pongTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private _providerSessionRepository: ProviderSessionRepository;
  private _sessionRepository: SessionRepository;
  private _swarm: Hyperswarm | null = null;
  private _webServer: WebServer;

  private readonly DURATION_UPDATE_INTERVAL = 300000;

  private readonly MAX_MESSAGES_PER_MINUTE = 500;
  private _healthCheckTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private readonly HEALTH_CHECK_TIMEOUT = 15000;
  private readonly HEALTH_CHECK_INTERVAL = 900000;

  constructor(configPath: string) {
    logger.info(`🔗 Initializing server using config file: ${configPath}`);
    this._config = new ServerConfig(configPath);

    this._messageRepository = new MessageRepository();
    this._peerRepository = new PeerRepository();
    this._sessionRepository = new SessionRepository();
    this._providerSessionRepository = new ProviderSessionRepository();

    this._webServer = new WebServer(
      this._config,
      this._peerRepository,
      this._providerSessionRepository,
      this._messageRepository
    );
    this._messageRateLimitCache = new LRUCache<string, number>({
      max: 1000,
      ttl: 60 * 1000,
    });

    process.on("uncaughtException", (err) => {
      if (err.message === "connection reset by peer") {
        logger.error(chalk.red(`🔌 Connection reset by peer`));
      } else {
        logger.error(chalk.red(`Uncaught exception: ${err.message}`));
      }
    });
  }

  async init() {
    const swarm = new Hyperswarm({
      keyPair: {
        publicKey: Buffer.from(this._config.get("publicKey"), "hex"),
        secretKey: Buffer.from(this._config.get("privateKey"), "hex"),
      },
    });
    this._swarm = swarm;
    await this.resetAllPeersOnStartup();
    const discoveryKey = crypto.discoveryKey(
      Buffer.from(this._config.get("publicKey"))
    );
    const discovery = swarm.join(discoveryKey, { server: true });
    await discovery.flushed();
    swarm.on("connection", (peer: Peer) => {
      logger.info(peer.rawStream.remoteHost);
      this.listeners(peer);
    });
    this._webServer.initialise();
    logger.info(
      chalk.green(`\u2713  Symmetry server started, waiting for connections...`)
    );
    logger.info(chalk.green(`🔑 Public key: ${this._config.get("publicKey")}`));
  }

  private async resetAllPeersOnStartup() {
    try {
      logger.info("Resetting all peer connections on startup...");
      await this._peerRepository.resetAllPeerConnections();
      await this._providerSessionRepository.endOrphanedSessions();
      this._webServer.connectedPeers.clear();
      this._heartbeatIntervals.clear();
      this._missedPongs.clear();
      this._pointsIntervals.clear();
      this._pongTimeouts.clear();
      logger.info("Successfully reset all peer connections");
    } catch (error) {
      logger.error("Failed to reset peer connections:", error);
    }
  }

  listeners(peer: Peer) {
    const peerKey = peer.remotePublicKey.toString("hex");

    this._providerSessionRepository.startSession(peerKey);

    const intervalId = setInterval(async () => {
      await this._providerSessionRepository.updateSessionDuration(peerKey);
    }, this.DURATION_UPDATE_INTERVAL);

    this._durationIntervals.set(peerKey, intervalId);

    peer.on("close", async () => {
      this.handlePeerDisconnect(peer, peerKey);
    });

    peer.on("error", async (err) => {
      logger.error(`Peer error for ${peerKey}: ${err.message}`);
      await this.handlePeerError(peer, peerKey, err);
    });

    peer.on("data", (message) => {
      const currentCount = this._messageRateLimitCache.get(peerKey) || 0;

      if (currentCount >= this.MAX_MESSAGES_PER_MINUTE) {
        logger.warn(`Rate limit exceeded for messages from peer: ${peerKey}`);
        logger.info(message);
        return;
      }

      this._messageRateLimitCache.set(peerKey, currentCount + 1);

      const data = safeParseJson<ClientMessage>(message.toString());

      const httpReply = this._webServer.httpPeerReplies.get(peerKey);

      if (httpReply && !httpReply.raw.closed && !data?.key)
        return httpReply.raw.write(message);

      if (data?.key === serverMessageKeys.inferenceEnded) {
        if (httpReply) {
          httpReply.raw.end();
        }
      }

      if (data && data.key) {
        switch (data?.key) {
          case serverMessageKeys.join:
            return this.handleJoin(peer, data.data as PeerUpsert);
          case serverMessageKeys.inference:
            return this.handleInferenceRequest(
              peer,
              data.data as InferenceRequest
            );
          case serverMessageKeys.challenge:
            return this.handleChallenge(peer, data.data as ChallengeRequest);
          case serverMessageKeys.conectionSize:
            return this.handleProviderConnections(
              peer,
              data.data as ConnectionSizeUpdate
            );
          case serverMessageKeys.sendMetrics:
            return this.handleMetrics(peer, data.data as CompletionMetrics);
          case serverMessageKeys.requestProvider:
            return this.handleRequestProvider(
              peer,
              data.data as PeerSessionRequest
            );
          case serverMessageKeys.healthCheck:
            return this.handleHealthCheck(peer);
          case serverMessageKeys.verifySession:
            return this.handleSessionValidation(peer, data.data as string);
        }
      }
    });
  }

  private async handleHealthCheck(peer: Peer) {
    const peerKey = peer.remotePublicKey.toString("hex");

    const timeout = this._healthCheckTimeouts.get(peerKey);

    if (timeout) {
      clearTimeout(timeout);
      this._healthCheckTimeouts.delete(peerKey);
      this._peerRepository.updatePeerHealthStatus(peerKey, true);
      peer.write(createMessage(serverMessageKeys.healthCheckAck));
    }
  }

  private async handlePeerError(peer: Peer, peerKey: string, error: Error) {
    logger.error(`Peer ${peerKey} error: ${error.message}`);

    const reply = this._webServer.httpPeerReplies.get(peerKey);
    if (reply && !reply.raw.closed) {
      reply.raw.end(`data: {"error":"Peer error: ${error.message}"}\n\n`);
    }

    if (this.isFatalError(error)) {
      await this.handlePeerDisconnect(peer, peerKey);
    }
  }

  private async handlePeerDisconnect(peer: Peer, peerKey: string) {
    // Clear all intervals and timeouts
    const heartbeat = this._heartbeatIntervals.get(peerKey);
    const pongTimeout = this._pongTimeouts.get(peerKey);
    const durationInterval = this._durationIntervals.get(peerKey);
    const healthCheckTimeout = this._healthCheckTimeouts.get(peerKey);

    if (heartbeat) clearInterval(heartbeat);
    if (pongTimeout) clearTimeout(pongTimeout);
    if (durationInterval) clearInterval(durationInterval);
    if (healthCheckTimeout) clearTimeout(healthCheckTimeout);

    this._heartbeatIntervals.delete(peerKey);
    this._pongTimeouts.delete(peerKey);
    this._durationIntervals.delete(peerKey);
    this._missedPongs.delete(peerKey);
    this._healthCheckTimeouts.delete(peerKey);
    this._webServer.connectedPeers.delete(peerKey);

    for (const [token, tokenPeerKey] of this._inferenceTokens.entries()) {
      if (tokenPeerKey === peerKey) {
        this._inferenceTokens.delete(token);
      }
    }

    await this._peerRepository.setPeerOffline(peerKey);
    await this._providerSessionRepository.endSession(peerKey);

    logger.info(
      `🔌 Peer disconnected: ${peer.rawStream.remoteHost} / ${peerKey}`
    );
  }

  private isFatalError(error: Error): boolean {
    const fatalErrors = [
      "connection reset by peer",
      "network timeout",
      "socket hang up",
    ];
    return fatalErrors.some((msg) => error.message.includes(msg));
  }

  handleMetrics = async (peer: Peer, data: CompletionMetrics) => {
    const peerKey = peer.remotePublicKey.toString("hex");
    const sessionId = await this._providerSessionRepository.getActiveSessionId(
      peerKey
    );

    if (!sessionId) return;

    await this._providerSessionRepository.addMetrics({
      providerSessionId: sessionId,
      averageTokensPerSecond: data.state.averageTokensPerSecond,
      totalBytes: data.state.totalBytes,
      totalProcessTime: data.state.totalProcessTime,
      averageTokenLength: data.state.averageTokenLength,
      startTime: data.state.startTime,
      totalTokens: data.state.totalTokens,
    });
  };

  async handleProviderConnections(peer: Peer, update: ConnectionSizeUpdate) {
    const peerKey = peer.remotePublicKey.toString("hex");
    this._peerRepository.updateConnections(update.connections, peerKey);
  }

  async handleInferenceRequest(peer: Peer, data: InferenceRequest) {
    const peerKey = peer.remotePublicKey.toString("hex");

    if (data?.key) {
      this._inferenceTokens.set(data.key, peerKey);
    }

    const sessionId = await this._providerSessionRepository.getActiveSessionId(
      peerKey
    );

    if (!sessionId) return;

    await this._providerSessionRepository.logRequest(sessionId);
  }

  async handleJoin(peer: Peer, message: PeerUpsert) {
    const peerKey = peer.remotePublicKey.toString("hex");

    const { symmetryCoreVersion } = message;

    if (
      !symmetryCoreVersion ||
      semver.lt(symmetryCoreVersion, MIN_SUPPORTED_SYMMETRY_CORE_VERSION)
    ) {
      peer.write(
        createMessage(serverMessageKeys.versionMismatch, {
          minVersion: MIN_SUPPORTED_SYMMETRY_CORE_VERSION,
        })
      );
      return;
    }

    try {
      await this._peerRepository.upsert({
        key: peerKey,
        discoveryKey: message.discoveryKey,
        dataCollectionEnabled: message.dataCollectionEnabled,
        modelName: message.modelName,
        public: message.public,
        serverKey: message.serverKey,
        maxConnections: message.maxConnections,
        name: message.name,
        website: message.website,
        apiProvider: message.apiProvider,
      });
      logger.info(
        `👋 Peer provider joined ${peer.rawStream.remoteHost} / ${peerKey}`
      );
      peer.write(
        createMessage(serverMessageKeys.joinAck, {
          status: "success",
          key: peerKey,
        })
      );
      this._webServer.connectedPeers.set(peerKey, peer);

      this.startHealthCheck(peer);
    } catch (error: unknown) {
      let errorMessage = "";
      if (error instanceof Error) errorMessage = error.message;
      logger.error(`🚨 ${errorMessage}`);
    }
  }

  getKeys(privateKeyHex: string) {
    const fullKey = Buffer.from(privateKeyHex, "hex");
    if (fullKey.length !== 64) {
      throw new Error("Expected a 64-byte private key");
    }
    const secretKey = fullKey;
    const publicKey = fullKey.subarray(32);
    return { secretKey, publicKey };
  }

  handleChallenge(
    peer: Peer,
    challengeRequest: { challenge: Buffer | string }
  ) {
    try {
      const privateKeyHex = this._config.get("privateKey");
      const { secretKey } = this.getKeys(privateKeyHex);
      const signature = crypto.sign(
        Buffer.from(challengeRequest.challenge),
        secretKey
      );
      peer.write(createMessage("challenge", { signature }));
    } catch (error) {
      console.error("Error in handleChallenge:", error);
    }
  }

  async deletePeer(peerKey: string): Promise<boolean> {
    logger.info(`Attempting to delete peer: ${peerKey}`);
    try {
      const changes = await this._peerRepository.deletePeer(peerKey);

      if (changes) {
        logger.info(chalk.green(`✔ Peer ${peerKey} deleted successfully`));

        this._pongTimeouts.delete(peerKey);
        this._missedPongs.delete(peerKey);

        await this._sessionRepository.deleteSession(peerKey);

        return true;
      } else {
        logger.warn(chalk.yellow(`⚠ No peer found with key ${peerKey}`));
        return false;
      }
    } catch (error) {
      logger.error(chalk.red(`❌ Error deleting peer ${peerKey}:`), error);

      return false;
    }
  }

  async getRandomPeer(randomPeerRequest: PeerSessionRequest) {
    const providerPeer = await this._peerRepository.getRandom(
      randomPeerRequest
    );
    return providerPeer;
  }

  async handleRequestProvider(
    peer: Peer,
    randomPeerRequest: PeerSessionRequest,
    attempts = 0
  ) {
    try {
      if (attempts > MAX_RANDOM_PEER_REQUEST_ATTEMPTS) return;

      const providerPeer = await this.getRandomPeer(randomPeerRequest);

      if (!providerPeer) {
        this.handleRequestProvider(peer, randomPeerRequest, attempts + 1);
        return;
      }

      const currentConnections = providerPeer.connections || 0;
      const maxConnections = providerPeer.max_connections;

      if (currentConnections >= maxConnections) return;

      if (!providerPeer) {
        logger.warn(
          `🚨 No providers found for ${peer.remotePublicKey.toString("hex")}`
        );
        return;
      }

      const sessionToken = await this._sessionRepository.createSession(
        providerPeer.discovery_key
      );
      peer.write(
        createMessage(serverMessageKeys.providerDetails, {
          providerId: providerPeer.key,
          sessionToken,
        })
      );
    } catch (error: unknown) {
      let errorMessage = "";
      if (error instanceof Error) errorMessage = error.message;
      logger.error(`🚨 ${errorMessage}`);
    }
  }

  async handleSessionValidation(peer: Peer, sessionToken: string) {
    if (!sessionToken) return;
    try {
      const providerDiscoveryKey = await this._sessionRepository.verifySession(
        sessionToken
      );

      if (!providerDiscoveryKey) return;

      const providerPeer = await this._peerRepository.getByDiscoveryKey(
        providerDiscoveryKey
      );

      if (!providerPeer) return;

      peer.write(
        createMessage(serverMessageKeys.sessionValid, {
          discoveryKey: providerPeer.discovery_key,
          modelName: providerPeer.model_name,
          name: providerPeer.name,
          provider: providerPeer.provider,
        })
      );

      await this._sessionRepository.extendSession(sessionToken);
    } catch (error) {
      logger.error(
        `Session verification error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      peer.write(
        createMessage(serverMessageKeys.sessionValid, {
          valid: false,
          error: "Error verifying session",
        })
      );
    }
  }

  private startHealthCheck = (peer: Peer) => {
    const peerKey = peer.remotePublicKey.toString("hex");

    const sendHealthCheck = () => {
      peer.write(
        createMessage(serverMessageKeys.healthCheck, {
          timestamp: Date.now(),
          requestId: cryptoLib.randomBytes(16).toString("hex"),
        })
      );

      const timeout = setTimeout(() => {
        logger.warn(`Health check timeout for peer: ${peerKey}`);
        this._peerRepository.updatePeerHealthStatus(peerKey, false);
        peer.write(createMessage("healthCheckFailed"));
      }, this.HEALTH_CHECK_TIMEOUT);

      this._healthCheckTimeouts.set(peerKey, timeout);
    };

    sendHealthCheck();

    const intervalId = setInterval(sendHealthCheck, this.HEALTH_CHECK_INTERVAL);
    this._heartbeatIntervals.set(peerKey, intervalId);
  };
}
