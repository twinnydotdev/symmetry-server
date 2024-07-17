import { createServer } from "http";
import Hyperswarm from "hyperswarm";
import { WebSocket, WebSocketServer } from "ws";
import { PeerRepository } from "./peer-repository";
import { logger } from "./logger";
import chalk from "chalk";

export class WsServer {
  private _wss: WebSocketServer | undefined;
  private _peerRepository: PeerRepository;
  private _swarm: Hyperswarm;

  constructor(port = 4002, peerRepository: PeerRepository, swarm: Hyperswarm) {
    this._peerRepository = peerRepository;
    this._swarm = swarm;
    this.start(port);
  }

  start(port: number) {
    const server = createServer();
    this._wss = new WebSocketServer({ server });
    server.listen(port);
    logger.info(chalk.green(`\u2713 WebSocket started ws://localhost:${port}`));
    this.wssListeners();
  }

  wssListeners = () => {
    this._wss?.on("connection", (ws: WebSocket) => {
      this.sendStats(ws);
      const interval = setInterval(() => this.sendStats(ws), 5000);
      ws.on("close", () => {
        clearInterval(interval);
      });
    });
  };

  private async sendStats(ws: WebSocket) {
    const stats = await this.getStats(this._swarm);
    ws.send(JSON.stringify(stats));
  }

  async broadcastStats() {
    const stats = await this.getStats(this._swarm);
    this._wss?.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(stats));
      }
    });
  }

  private async getStats(swarm: Hyperswarm) {
    const activePeers = await this._peerRepository.getActiveCount();
    const activeModels = await this._peerRepository.getActiveModelCount();
    const swarmConnections = swarm.connections.size;

    return {
      activePeers,
      activeModels,
      swarmConnections,
    };
  }
}
