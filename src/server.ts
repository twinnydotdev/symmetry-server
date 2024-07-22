import chalk from "chalk";
import Corestore from "corestore";
import Hyperdrive from "hyperdrive";
import Hyperswarm from "hyperswarm";
import path from "path";

import {
  ClientMessage,
  Peer,
  PeerSessionRequest,
  ConnectionSizeUpdate,
  PeerUpsert,
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
  private _wsServer: WsServer | undefined;

  constructor(configPath: string) {
    logger.info(`🔗 Initializing server using config file: ${configPath}`);
    this._config = new ConfigManager(configPath);
    this._peerRepository = new PeerRepository();
    this._sessionRepository = new SessionRepository();
    this._sessionManager = new SessionManager(this._sessionRepository, 5);
  }

  async init() {
    const corePath = path.join(this._config.get("path"), "symmetry-core");
    const store = new Corestore(corePath);
    const core = new Hyperdrive(store);
    const swarm = new Hyperswarm();
    await core.ready();
    const discovery = swarm.join(core.discoveryKey, { server: true });
    await discovery.flushed();

    swarm.on("connection", (peer: Peer) => {
      logger.info(`🔗 New Connection: ${peer.rawStream.remoteHost}`);
      store.replicate(peer);
      this.listeners(peer);
    });
    this._wsServer = new WsServer(
      this._config.get("webSocketPort"),
      this._peerRepository,
      swarm
    );
    logger.info(`🔑 Discovery key: ${core.discoveryKey?.toString("hex")}`);
    logger.info(`🔑 Drive key: ${core.key?.toString("hex")}`);
    logger.info(
      chalk.green(
        `\u2713 Websocket server started: ws://localhost:${this._config.get(
          "webSocketPort"
        )}`
      )
    );
    logger.info(
      chalk.green(`\u2713 Symmetry server started, waiting for connections...`)
    );
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
      if (!data) return;
      if (data.key) {
        switch (data?.key) {
          case serverMessageKeys.join:
            this.join(peer, data.data as PeerUpsert);
            break;
          case serverMessageKeys.conectionSize:
            this.updateProviderConnections(
              peer,
              data.data as ConnectionSizeUpdate
            );
            break;
          case serverMessageKeys.requestProvider:
            this.handlePeerSession(peer, data.data as PeerSessionRequest);
            break;
          case serverMessageKeys.verifySession:
            this.handlePeerSessionValidation(
              peer,
              data.data as {
                sessionToken: string;
              }
            );
            break;
        }
      }
    });
  }

  async updateProviderConnections(peer: Peer, update: ConnectionSizeUpdate) {
    const peerKey = peer.publicKey.toString("hex");
    this._peerRepository.updateConnections(update.connections, peerKey);
  }

  async join(peer: Peer, message: PeerUpsert) {
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

  async handlePeerSessionValidation(
    peer: Peer,
    message: {
      sessionToken: string;
    }
  ) {
    if (!message.sessionToken) return;
    try {
      const providerDiscoveryKey = await this._sessionManager.verifySession(
        message.sessionToken
      );

      if (!providerDiscoveryKey) return;

      const providerPeer = await this._peerRepository.getByDiscoveryKey(
        providerDiscoveryKey
      );

      if (!providerPeer) return;

      peer.write(
        createMessage(serverMessageKeys.sessionValid, {
          discoveryKey: providerPeer.discovery_key,
        })
      );

      await this._sessionManager.extendSession(message.sessionToken);
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
