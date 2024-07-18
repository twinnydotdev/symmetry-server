import { PassThrough, Readable } from "node:stream";
import { pipeline } from "stream/promises";
import b4a from "b4a";
import chalk from "chalk";
import Corestore from "corestore";
import Hyperdrive from "hyperdrive";
import Hyperswarm from "hyperswarm";
import Localdrive from "localdrive";
import path from "path";

import { ConfigManager, createConfigManagerClient } from "./config-manager";
import { createMessage, safeParseJson } from "./utils";
import { logger } from "./logger";
import { Peer, ClientMessage } from "./types";
import { serverMessageKeys } from "./constants";

export class SymmetryClient {
  _completion = "";
  _config: ConfigManager;
  _discoveryKey = "";
  _isPublic = false;
  _messageIndex = 0;
  _providers = new Map();

  constructor(configPath: string) {
    logger.info(`🔗 Initializing client using config file: ${configPath}`);
    this._config = createConfigManagerClient(configPath);
    this._providers = new Map();
    this._messageIndex = 0;
    this._completion = "";
    this._isPublic = this._config.get("public");
    this._discoveryKey = "";
  }

  async init(name: string) {
    if (this._providers.has(name)) return;

    const localPath = path.join(this._config.get("path"), `${name}-local`);
    const corePath = path.join(this._config.get("path"), `${name}-core`);

    const store = new Corestore(corePath);
    const local = new Localdrive(localPath);
    const core = new Hyperdrive(store);
    const swarm = new Hyperswarm();

    const provider = { store, local, swarm, core };

    await provider.core.ready();
    const discovery = provider.swarm.join(provider.core.discoveryKey);
    await discovery.flushed();

    provider.swarm.on("error", (err: Error) => {
      logger.error(chalk.red("🚨 Swarm Error:"), err);
    });

    provider.swarm.on("connection", (peer: Peer) => {
      logger.info(`⚡️ New connection from peer: ${peer.rawStream.remoteHost}`);
      provider.store.replicate(peer);
      this.providerListeners(peer);
    });

    this._providers.set(name, {
      ...provider,
      discoveryKey: provider.core.discoveryKey.toString("hex"),
      key: provider.core.key?.toString("hex"),
    });

    logger.info(`📁 Provider: '${name}' initialized!`)
    logger.info(`🔑 Discovery key: ${provider.core.discoveryKey.toString("hex")}`)
    logger.info(`🔑 Drive key: ${provider.core.key?.toString("hex")}`)

    if (this._isPublic) {
      this._discoveryKey = provider.core.discoveryKey.toString("hex");
      logger.info(chalk.white(`🔑 Server key: ${this._config.get("serverKey")}`));
      logger.info(chalk.green("🔗 Joining server, please wait."));
      await this.joinServer();
    }
  }

  joinServer = async () => {
    const swarm = new Hyperswarm();
    swarm.join(b4a.from(this._config.get("serverKey"), "hex"), {
      client: true,
      server: false,
    });
    swarm.flush();
    swarm.on("connection", (peer: Peer) => {
      logger.info(chalk.green("\u2713 Connected to server"));
      peer.write(
        createMessage(serverMessageKeys.join, {
          ...this._config,
          discoveryKey: this._discoveryKey,
        })
      );
    });
  };

  heartbeat = (peer: Peer) => {
    peer.write(
      createMessage(serverMessageKeys.heartbeat, {
        discoverkey: this._discoveryKey,
      })
    );
  };

  providerListeners(peer: Peer) {
    peer.on("data", async (buffer: Buffer) => {
      if (!buffer) return;
      const data = safeParseJson<ClientMessage<{ role: string; content: string }[]>>(buffer.toString());
      if (data) {
        if (data.key) {
          const key = data.key;
          switch (key) {
            case serverMessageKeys.inference:
              logger.info(`📦 Inference message received from ${peer.rawStream.remoteHost}`);
              await this.inference(data, peer);
              break;
          }
        }
      }
    });
  }

  async inference(data: ClientMessage<{ role: string; content: string }[]>, peer: Peer) {
    const messages = data?.data;
    if (!messages || !messages.length) return;

    const req = this.buildStreamRequest(messages);
    if (!req) return;

    const { requestOptions, requestBody } = req;

    const { protocol, hostname, port, path, method, headers } = requestOptions;

    const url = `${protocol}://${hostname}:${port}${path}`;

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(
          `Server responded with status code: ${response.status}`
        );
      }

      if (!response.body) {
        throw new Error("Failed to get a ReadableStream from the response");
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const responseStream = Readable.fromWeb(response.body as any);
      const peerStream = new PassThrough();
      const saveStream = new PassThrough();
      responseStream.pipe(peerStream);
      responseStream.pipe(saveStream);

      const peerPipeline = pipeline(peerStream, async function (source) {
        for await (const chunk of source) {
          if (peer.writable) {
            if (!peer.write(chunk)) {
              await new Promise((resolve) => peer.once("drain", resolve));
            }
          } else {
            break;
          }
        }
      });

      const savePipeline = this.saveStream(peer.key, saveStream);
      await Promise.all([peerPipeline, savePipeline]);
    } catch (error) {
      let errorMessage = "";
      if (error instanceof Error) errorMessage = error.message;
      logger.error(`🚨 ${errorMessage}`);
    }
  }

  saveStream = async (providerName: string, stream: PassThrough) => {
    // TODO: save stream to disk
    return {
      providerName,
      stream,
    };
  };

  buildStreamRequest(messages: { role: string; content: string }[]) {
    const requestOptions = {
      hostname: this._config.get("apiHostname"),
      port: Number(this._config.get("apiPort")),
      path: this._config.get("apiPath"),
      protocol: this._config.get("apiProtocol"),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this._config.get("apiKey")}`,
      },
    };

    const requestBody = {
      model: this._config.get("modelName"),
      messages: messages || undefined,
      temperature: 1, // TODO
      stream: true,
    };

    return { requestOptions, requestBody };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async mirror(drive: any) {
    await drive.local.mirror(drive.core).done();
  }
}

module.exports = {
  SymmetryClient,
};
