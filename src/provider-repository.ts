import { Database } from "sqlite3";
import chalk from "chalk";

import { database } from "./database";
import {
  DbPeer,
  PeerSessionRequest as ProviderSessionRequest,
  PeerUpsert,
} from "./types";
import { logger } from "./logger";
import { Peer } from "symmetry-core";

export class PeerRepository {
  db: Database;

  constructor() {
    this.db = database;
  }

  async setPeerOffline(peerKey: string) {
    try {
      this.db.run("UPDATE peers SET online = FALSE WHERE key = ?", [peerKey]);
      logger.info(`Updated status for peer ${peerKey}}`);
    } catch (error) {
      logger.error(`Failed to update status for peer ${peerKey}: ${error}`);
    }
  }

  upsert(message: PeerUpsert) {
    try {
      return new Promise((resolve, reject) => {
        this.db.run(
          `
          INSERT OR REPLACE INTO peers (
            key, discovery_key, data_collection_enabled, model_name, public,
            server_key, max_connections, name, website, provider, points,
            last_seen, online
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
            (SELECT points FROM peers WHERE key = ?), 
            CURRENT_TIMESTAMP, TRUE)
          `,
          [
            message.key,
            message.discoveryKey,
            message.dataCollectionEnabled,
            message.modelName,
            message.public,
            message.serverKey,
            message.maxConnections,
            message.name,
            message.website,
            message.apiProvider,
          ],
          function (err) {
            if (err) {
              reject(err);
            } else {
              resolve(this.lastID);
            }
          }
        );
      });
    } catch (e) {
      logger.error(`Error upserting peer ${message.key}: ${e}`);
    }
  }

  getByKey(key: string): Promise<DbPeer> {
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT * FROM peers WHERE key = ?",
        [key],
        (err, row: DbPeer) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  getByDiscoveryKey(discoveryKey: string): Promise<DbPeer> {
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT * FROM peers WHERE discovery_key = ?",
        [discoveryKey],
        (err, row: DbPeer) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  deletePeer(peerKey: string): Promise<number> {
    return new Promise((resolve, reject) => {
      this.db.run("DELETE FROM peers WHERE key = ?", [peerKey], function (err) {
        if (err) {
          console.error(
            chalk.red("❌ Error deleting peer from database:"),
            err
          );
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  getRandom(request: ProviderSessionRequest): Promise<DbPeer> {
    return new Promise((resolve, reject) => {
      const { modelName } = request;
      this.db.get(
        `SELECT * FROM peers WHERE model_name = ? AND online = TRUE ORDER BY RANDOM() LIMIT 1`,
        [modelName],
        (err, row: DbPeer) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  updateConnections(connections: number, peerKey: string) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "UPDATE peers SET connections = ? WHERE key = ?",
        [connections, peerKey],
        function (err) {
          if (err) {
            console.error(
              chalk.red("❌ Error updating peer last seen in database:"),
              err
            );
            reject(err);
          } else {
            resolve(this.changes);
          }
        }
      );
    });
  }

  updateLastSeen(peerKey: string) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "UPDATE peers SET last_seen = ?, online = FALSE WHERE key = ?",
        [new Date().toISOString(), peerKey],
        function (err) {
          if (err) {
            console.error(
              chalk.red("❌ Error updating peer last seen in database:"),
              err
            );
            reject(err);
          } else {
            if (this.changes > 0) {
              logger.info(chalk.yellow("🕒 Peer disconnected"));
            } else {
              logger.info(chalk.yellow("⚠️ Peer not found in database"));
            }
            resolve(this.changes);
          }
        }
      );
    });
  }

  async getActivePeerCount(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT COUNT(*) as count FROM peers WHERE online = TRUE",
        (err, row: { count: number }) => {
          if (err) {
            reject(err);
          } else {
            resolve(row.count);
          }
        }
      );
    });
  }

  async getActiveModelCount(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT COUNT(DISTINCT model_name) as count FROM peers WHERE online = TRUE",
        (err, row: { count: number }) => {
          if (err) {
            reject(err);
          } else {
            resolve(row.count);
          }
        }
      );
    });
  }

  getAllPeers(): Promise<Peer[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT id, last_seen, connected_since, points, data_collection_enabled, max_connections, connections, model_name, name, online, public, provider FROM peers WHERE online = TRUE",
        (err, rows: Peer[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  async updateConnectedSince(
    peerKey: string,
    timestamp: Date | null
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE peers SET connected_since = ? WHERE key = ?`;
      this.db.run(
        sql,
        [timestamp ? timestamp.toISOString() : null, peerKey],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  async addPoints(peerKey: string, points: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE peers SET points = COALESCE(points, 0) + ? WHERE key = ?`;
      this.db.run(sql, [points, peerKey], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}
