import chalk from "chalk";
import Hyperswarm from "hyperswarm";
import crypto from "hypercore-crypto";

import {
  ClientMessage,
  Peer,
  PeerSessionRequest,
  ConnectionSizeUpdate,
  PeerUpsert,
  ChallengeRequest,
} from "./types";
import { ConfigManager } from "./config-manager";
import { createMessage, safeParseJson } from "./utils";
import { logger } from "./logger";
import { PeerRepository } from "./provider-repository";
import { serverMessageKeys } from "./constants";
import { SessionManager } from "./session-manager";
import { SessionRepository } from "./session-repository";
import { WsServer } from "./websocket-server";

export class SymmetryServer {
  private _config: ConfigManager;
  private _peerRepository: PeerRepository;
  private _sessionRepository: SessionRepository;
  private _sessionManager: SessionManager;

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

  listeners(peer: Peer) {
    peer.on("error", (err) => err);

    peer.on("close", () => {
      const peerKey = peer.publicKey.toString("hex");
      this._peerRepository.updateLastSeen(peerKey);
      logger.info(
        `🔗 Connection Closed: Peer ${peerKey.slice(0, 6)}...${peerKey.slice(
          -6
        )}`
      );
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
            return this.handlePeerSession(
              peer,
              data.data as PeerSessionRequest
            );
          case serverMessageKeys.verifySession:
            return this.handleSessionValidation(
              peer,
              data.data as string
            );
        }
      }
    });
  }

  async handleProviderConnections(peer: Peer, update: ConnectionSizeUpdate) {
    const peerKey = peer.publicKey.toString("hex");
    this._peerRepository.updateConnections(update.connections, peerKey);
  }

  async handleJoin(peer: Peer, message: PeerUpsert) {
    const peerKey = peer.publicKey.toString("hex");
    try {
      await this._peerRepository.upsert({
        key: peerKey,
        discoveryKey: message.discoveryKey,
        gpuMemory: message.gpuMemory,
        modelName: message.modelName,
        public: message.public,
        serverKey: message.serverKey,
        maxConnections: message.maxConnections,
        name: message.name,
        website: message.website,
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

  async handlePeerSession(peer: Peer, randomPeerRequest: PeerSessionRequest) {
    const dbPeer = await this._peerRepository.getByKey(
      peer.publicKey.toString("hex")
    );

    if (!dbPeer) return;

    const currentConnections = dbPeer.connections || 0;
    const maxConnections = dbPeer.max_connections;

    if (currentConnections >= maxConnections) return;

    try {
      const providerPeer = await this._peerRepository.getRandom(
        randomPeerRequest
      );

      if (!providerPeer) {
        logger.warning(
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

  async handleSessionValidation(
    peer: Peer,
    sessionToken: string
  ) {
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

  async cleanupSessions() {
    await this._sessionManager.cleanupExpiredSessions();
  }
}

module.exports = {
  SymmetryServer,
};
