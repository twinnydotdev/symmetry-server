import chalk from "chalk";
import Corestore from "corestore";
import Hyperdrive from "hyperdrive";
import Hyperswarm from "hyperswarm";
import path from "path";

import { ClientMessage, Peer, PeerUpsert } from "./types";
import { ConfigManager, createConfigManager } from "./config-manager";
import { createMessage, safeParseJson } from "./utils";
import { logger } from "./logger";
import { PeerRepository } from "./peer-repository";
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
    console.log(`🔗 Initializing server using config file: ${configPath}`);
    this._config = createConfigManager(configPath, false);
    if (!this._config.isServerConfig()) {
      throw new Error("Invalid configuration for server");
    }
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
      const peerKey = peer.publicKey.toString("hex");
      console.log(
        chalk.green("🔗 New Connection:"),
        chalk.yellow(`Peer ${peerKey.slice(0, 6)}...${peerKey.slice(-6)}`)
      );
      store.replicate(peer);
      this.listeners(peer);
    });
    this._wsServer = new WsServer(
      this._config.get("webSocketPort"),
      this._peerRepository,
      swarm
    );
    const info =
      chalk.green("\u2713 Symmetry server started\n\n") +
      chalk.bold.white("Server key:\n") +
      chalk.white(`${core.discoveryKey?.toString("hex")}\n`) +
      chalk.bold.white("Drive key:\n") +
      chalk.white(`${core.key?.toString("hex")}`);
    logger.info(info);
  }

  listeners(peer: Peer) {
    peer.on("error", (err) => err);

    peer.on("close", () => {
      const peerKey = peer.publicKey.toString("hex");
      this._peerRepository.lastSeen(peerKey);
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
          case serverMessageKeys.requestProvider:
            this.handleProviderRequest(peer);
            break;
          case serverMessageKeys.verifySession:
            this.handleSessionVerification(
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

  async join(peer: Peer, message: PeerUpsert) {
    const peerKey = peer.publicKey.toString("hex");
    try {
      await this._peerRepository.upsert({
        ...message,
        key: peerKey,
      });
      logger.info(`Peer joined ${peerKey.slice(0, 6)}...${peerKey.slice(-6)}`);
      peer.write(
        createMessage(serverMessageKeys.joinAck, {
          status: "success",
          key: peerKey,
        })
      );
    } catch (error: unknown) {
      let errorMessage = "";
      if (error instanceof Error) errorMessage = error.message;
      logger.error(errorMessage);
    }
  }

  async handleProviderRequest(peer: Peer) {
    try {
      const provider = await this._peerRepository.getRandom();
      const sessionToken = await this._sessionManager.createSession(
        provider.discovery_key
      );
      peer.write(
        createMessage(serverMessageKeys.providerDetails, {
          providerId: provider.key,
          sessionToken,
        })
      );
    } catch (error: unknown) {
      let errorMessage = "";
      if (error instanceof Error) errorMessage = error.message;
      logger.error(errorMessage);
    }
  }

  async handleSessionVerification(
    peer: Peer,
    message: {
      sessionToken: string;
    }
  ) {
    if (!message.sessionToken) return;
    try {
      const providerId = await this._sessionManager.verifySession(
        message.sessionToken
      );
      if (providerId) {
        const provider = await this._peerRepository.getByDiscoveryKey(
          providerId
        );
        if (provider) {
          peer.write(
            createMessage(serverMessageKeys.sessionValid, {
              discoveryKey: provider.discovery_key,
            })
          );
          await this._sessionManager.extendSession(message.sessionToken);
        }
      }
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
