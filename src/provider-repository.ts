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

const PREPARED_STATEMENTS = {
  UPDATE_PEER_STATUS: "UPDATE peers SET online = ? WHERE key = ?",
  GET_PEER_BY_KEY: "SELECT * FROM peers WHERE key = ?",
  GET_PEER_BY_DISCOVERY: "SELECT * FROM peers WHERE discovery_key = ?",
  DELETE_PEER: "DELETE FROM peers WHERE key = ?",
  UPDATE_CONNECTIONS: "UPDATE peers SET connections = ? WHERE key = ?",
  UPDATE_LAST_SEEN: "UPDATE peers SET last_seen = ?, online = ? WHERE key = ?",
  GET_ACTIVE_PEER_COUNT:
    "SELECT COUNT(*) as count FROM peers WHERE online = TRUE",
  GET_ACTIVE_MODEL_COUNT:
    "SELECT COUNT(DISTINCT model_name) as count FROM peers WHERE online = TRUE",
  UPDATE_CONNECTED_SINCE: "UPDATE peers SET connected_since = ? WHERE key = ?",
  UPDATE_POINTS:
    "UPDATE peers SET points = COALESCE(points, 0) + ? WHERE key = ?",
} as const;

export class PeerRepository {
  private readonly db: Database;

  constructor() {
    this.db = database;
  }

  async setPeerOffline(peerKey: string): Promise<void> {
    try {
      await this.runQuery(PREPARED_STATEMENTS.UPDATE_PEER_STATUS, [
        false,
        peerKey,
      ]);
      logger.info(`Updated status offline for peer ${peerKey}`);
    } catch (error) {
      logger.error(`Failed to update status for peer ${peerKey}: ${error}`);
      throw error;
    }
  }

  async upsert(message: PeerUpsert): Promise<number> {
    const params = [
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
      message.key,
    ];

    const sql = `
      INSERT OR REPLACE INTO peers (
        key, discovery_key, data_collection_enabled, model_name, public,
        server_key, max_connections, name, website, provider,
        last_seen, online, points
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, TRUE,
        (SELECT points FROM peers WHERE key = ?))
    `;

    return this.runQuery(sql, params);
  }

  async getByKey(key: string): Promise<DbPeer> {
    return this.getQuery<DbPeer>(PREPARED_STATEMENTS.GET_PEER_BY_KEY, [key]);
  }

  async getByDiscoveryKey(discoveryKey: string): Promise<DbPeer> {
    return this.getQuery<DbPeer>(PREPARED_STATEMENTS.GET_PEER_BY_DISCOVERY, [
      discoveryKey,
    ]);
  }

  async deletePeer(peerKey: string): Promise<number> {
    try {
      return await this.runQuery(PREPARED_STATEMENTS.DELETE_PEER, [peerKey]);
    } catch (error) {
      logger.error(chalk.red("❌ Error deleting peer from database:"), error);
      throw error;
    }
  }

  async getRandom(request: ProviderSessionRequest): Promise<DbPeer> {
    const sql = `
      SELECT * FROM peers 
      WHERE model_name = ? AND online = TRUE 
      ORDER BY RANDOM() 
      LIMIT 1
    `;
    return this.getQuery<DbPeer>(sql, [request.modelName]);
  }

  async updateConnections(
    connections: number,
    peerKey: string
  ): Promise<number> {
    return this.runQuery(PREPARED_STATEMENTS.UPDATE_CONNECTIONS, [
      connections,
      peerKey,
    ]);
  }

  async updateLastSeen(peerKey: string): Promise<number> {
    try {
      const changes = await this.runQuery(
        PREPARED_STATEMENTS.UPDATE_LAST_SEEN,
        [new Date().toISOString(), false, peerKey]
      );

      if (changes > 0) {
        logger.info(chalk.yellow("🕒 Peer disconnected"));
      } else {
        logger.info(chalk.yellow("⚠️ Peer not found in database"));
      }

      return changes;
    } catch (error) {
      logger.error(
        chalk.red("❌ Error updating peer last seen in database:"),
        error
      );
      throw error;
    }
  }

  async getActivePeerCount(): Promise<number> {
    const result = await this.getQuery<{ count: number }>(
      PREPARED_STATEMENTS.GET_ACTIVE_PEER_COUNT
    );
    return result.count;
  }

  async getActiveModelCount(): Promise<number> {
    const result = await this.getQuery<{ count: number }>(
      PREPARED_STATEMENTS.GET_ACTIVE_MODEL_COUNT
    );
    return result.count;
  }

  async getAllPeersOnline(): Promise<Peer[]> {
    const sql = `
      SELECT id, last_seen, connected_since, points, 
             data_collection_enabled, max_connections, 
             connections, model_name, name, online, 
             public, provider 
      FROM peers 
      WHERE online = TRUE
    `;
    return this.allQuery<Peer>(sql);
  }

  async getAllPeers(): Promise<Peer[]> {
    const sql = `
      SELECT id, last_seen, connected_since, points, 
             data_collection_enabled, max_connections, 
             connections, model_name, name, online, 
             public, provider 
      FROM peers 
    `;
    return this.allQuery<Peer>(sql);
  }

  async updateConnectedSince(
    peerKey: string,
    timestamp: Date | null
  ): Promise<void> {
    await this.runQuery(PREPARED_STATEMENTS.UPDATE_CONNECTED_SINCE, [
      timestamp?.toISOString() ?? null,
      peerKey,
    ]);
  }

  async resetAllPeerConnections(): Promise<void> {
    await this.runQuery(`
      UPDATE peers 
      SET online = FALSE,
          connections = 0,
          connected_since = NULL,
          last_seen = CURRENT_TIMESTAMP
    `);
  }

  async addPoints(peerKey: string, points: number): Promise<void> {
    await this.runQuery(PREPARED_STATEMENTS.UPDATE_POINTS, [points, peerKey]);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private runQuery(sql: string, params: any[] = []): Promise<number> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getQuery<T>(sql: string, params: any[] = []): Promise<T> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row: T) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private allQuery<T>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows: T[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }
}
