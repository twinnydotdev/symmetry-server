import chalk from "chalk";
import Hyperswarm from "hyperswarm";
import crypto from "hypercore-crypto";
import { Peer, safeParseJson, serverMessageKeys } from "symmetry-core";

import {
  PeerSessionRequest,
  ConnectionSizeUpdate,
  PeerUpsert,
  ChallengeRequest,
  ClientMessage,
} from "./types";
import { ConfigManager } from "./config-manager";
import { createMessage } from "./utils";
import { logger } from "./logger";
import { PeerRepository } from "./provider-repository";
import { MAX_RANDOM_PEER_REQUEST_ATTEMPTS } from "./constants";
import { SessionManager } from "./session-manager";
import { SessionRepository } from "./session-repository";
import { WsServer } from "./websocket-server";

export class SymmetryServer {
  private _config: ConfigManager;
  private _peerRepository: PeerRepository;
  private _sessionRepository: SessionRepository;
  private _sessionManager: SessionManager;
  private _pongTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private _missedPongs: Map<string, number> = new Map();
  private _heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(configPath: string) {
    logger.info(`🔗 Initializing server using config file: ${configPath}`);
    this._config = new ConfigManager(configPath);
    this._peerRepository = new PeerRepository();
    this._sessionRepository = new SessionRepository();
    this._sessionManager = new SessionManager(this._sessionRepository, 5);
  }

  async init() {
    const swarm = new Hyperswarm();
    const discoveryKey = crypto.discoveryKey(
      Buffer.from(this._config.get("publicKey"))
    );
    const discovery = swarm.join(discoveryKey, { server: true });
    await discovery.flushed();
    swarm.on("connection", (peer: Peer) => {
      logger.info(`🔗 New Connection: ${peer.rawStream.remoteHost}`);
      this.listeners(peer);
      this.startHeartbeat(peer);
    });
    new WsServer(this._config.get("wsPort"), this._peerRepository, swarm);
    logger.info(
      chalk.green(
        `\u2713  Websocket server started: ws://localhost:${this._config.get(
          "wsPort"
        )}`
      )
    );
    logger.info(
      chalk.green(`\u2713  Symmetry server started, waiting for connections...`)
    );
    logger.info(chalk.green(`🔑 Public key: ${this._config.get("publicKey")}`));
  }

  stopHeartbeat(peerKey: string) {
    const heartbeatInterval = this._heartbeatIntervals.get(peerKey);
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      this._heartbeatIntervals.delete(peerKey);
    }
    this.clearPongTimeout(peerKey);
    this._missedPongs.delete(peerKey);
  }

  startHeartbeat(peer: Peer) {
    const peerKey = peer.remotePublicKey.toString("hex");
    const pingInterval = 10000;
    const pongTimeout = 20000;
    const maxMissedPongs = 5;

    const heartbeatInterval = setInterval(() => {
      peer.write(createMessage(serverMessageKeys.ping));
      const timeout = setTimeout(() => {
        this.handleMissingPong(peerKey, maxMissedPongs);
      }, pongTimeout);

      this._pongTimeouts.set(peerKey, timeout);
    }, pingInterval);

    this._heartbeatIntervals.set(peerKey, heartbeatInterval);
  }

  private handlePongReceived(peerKey: string) {
    this.clearPongTimeout(peerKey);
  }

  private async handleMissingPong(peerKey: string, maxMissedPongs: number) {
    const missedPongs = (this._missedPongs.get(peerKey) || 0) + 1;
    this._missedPongs.set(peerKey, missedPongs);

    if (missedPongs >= maxMissedPongs) {
      await this._peerRepository.setPeerOffline(peerKey);
      this.stopHeartbeat(peerKey);
    }
  }

  private clearPongTimeout(peerKey: string) {
    const timeout = this._pongTimeouts.get(peerKey);
    if (timeout) {
      clearTimeout(timeout);
      this._pongTimeouts.delete(peerKey);
    }
  }

  listeners(peer: Peer) {
    peer.on("error", (err) => err);

    peer.on("close", () => {
      logger.info(`🔗 Connection closed: ${peer.rawStream.remoteHost}`);
    });

    peer.on("data", (message) => {
      const data = safeParseJson<ClientMessage>(message.toString());
      if (data && data.key) {
        switch (data?.key) {
          case serverMessageKeys.join:
            return this.handleJoin(peer, data.data as PeerUpsert);
          case serverMessageKeys.challenge:
            return this.handleChallenge(peer, data.data as ChallengeRequest);
          case serverMessageKeys.conectionSize:
            return this.handleProviderConnections(
              peer,
              data.data as ConnectionSizeUpdate
            );
          case serverMessageKeys.requestProvider:
            return this.handleRequestProvider(
              peer,
              data.data as PeerSessionRequest
            );
          case serverMessageKeys.verifySession:
            return this.handleSessionValidation(peer, data.data as string);
          case serverMessageKeys.pong:
            this.handlePongReceived(peer.remotePublicKey.toString("hex"));
            break;
        }
      }
    });

    process.on("uncaughtException", (err) => {
      if (err.message === "connection reset by peer") {
        console.log(chalk.red(`🔌 Connection reset by peer`));
      }
    });
  }

  async handleProviderConnections(peer: Peer, update: ConnectionSizeUpdate) {
    const peerKey = peer.remotePublicKey.toString("hex");
    this._peerRepository.updateConnections(update.connections, peerKey);
  }

  async handleJoin(peer: Peer, message: PeerUpsert) {
    const peerKey = peer.remotePublicKey.toString("hex");
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
      logger.info(`👋 Peer provider joined ${peer.rawStream.remoteHost}`);
      peer.write(
        createMessage(serverMessageKeys.joinAck, {
          status: "success",
          key: peerKey,
        })
      );
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

        this.stopHeartbeat(peerKey);
        this._pongTimeouts.delete(peerKey);
        this._missedPongs.delete(peerKey);

        await this._sessionManager.deleteSession(peerKey);

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
          `🚨 No providers found for ${peer.publicKey.toString("hex")}`
        );
        return;
      }

      const sessionToken = await this._sessionManager.createSession(
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
      const providerDiscoveryKey = await this._sessionManager.verifySession(
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

      await this._sessionManager.extendSession(sessionToken);
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
}

module.exports = {
  SymmetryServer,
};
