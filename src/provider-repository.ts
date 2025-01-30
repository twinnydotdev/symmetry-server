import { BaseRepository } from "./base-repository";
import { database } from "./database";
import { DbPeer, PeerUpsert, PeerSessionRequest } from "./types";
import { logger } from "./logger";
import { Peer } from "symmetry-core";

const PREPARED_STATEMENTS = {
  UPDATE_PEER_STATUS: "UPDATE peers SET online = ? WHERE key = ?",
  GET_PEER_BY_KEY: "SELECT * FROM peers WHERE key = ?",
  GET_PEER_BY_DISCOVERY: "SELECT * FROM peers WHERE discovery_key = ?",
  DELETE_PEER: "DELETE FROM peers WHERE key = ?",
  UPDATE_CONNECTIONS: "UPDATE peers SET connections = ? WHERE key = ?",
  GET_ACTIVE_PEER_COUNT:
    "SELECT COUNT(*) as count FROM peers WHERE online = TRUE",
  GET_ACTIVE_MODEL_COUNT:
    "SELECT COUNT(DISTINCT model_name) as count FROM peers WHERE online = TRUE",
  GET_UNIQUE_PROVIDER_COUNT: "SELECT COUNT(DISTINCT key) as count FROM peers",
  UPDATE_POINTS:
    "UPDATE peers SET points = COALESCE(points, 0) + ? WHERE key = ?",
  UPDATE_PEER_HEALTH_STATUS: "UPDATE peers SET healthy = ? WHERE key = ?", // New statement
} as const;

export class PeerRepository extends BaseRepository {
  constructor() {
    super(database);
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
    ];

    const sql = `
      INSERT OR REPLACE INTO peers (
        key, discovery_key, data_collection_enabled, model_name, public,
        server_key, max_connections, name, website, provider,
        online
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
    `;

    try {
      return this.runQuery(sql, params);
    } catch (e) {
      logger.error(`Failed to upsert peer ${message.key}: ${e}`);
      throw e;
    }
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
      logger.error(`Error deleting peer from database: ${error}`);
      throw error;
    }
  }

  async getRandom(request: PeerSessionRequest): Promise<DbPeer> {
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

  async getUniquePeerCount(): Promise<number> {
    const result = await this.getQuery<{ count: number }>(
      PREPARED_STATEMENTS.GET_UNIQUE_PROVIDER_COUNT
    );
    return result.count;
  }

  async getAllPeers(): Promise<Peer[]> {
    const sql = `
      SELECT 
        p.id,
        p.data_collection_enabled,
        p.max_connections,
        p.connections,
        p.model_name,
        p.name,
        p.online,
        p.public,
        p.provider,
        COALESCE(ps.total_duration_minutes, 0) as duration_minutes,
        COALESCE(ps.total_sessions, 0) as total_sessions,
        COALESCE((SELECT COUNT(*) FROM metrics m2 
                  JOIN provider_sessions ps2 ON ps2.id = m2.provider_session_id 
                  WHERE ps2.peer_key = p.key), 0) as total_requests,
        COALESCE(ps.active_sessions, 0) as active_sessions,
        COALESCE(m.avg_tokens_per_second, 0) as avg_tokens_per_second,
        COALESCE(m.avg_token_length, 0) as avg_token_length,
        COALESCE(m.total_tokens, 0) as total_tokens,
        COALESCE(m.total_bytes, 0) as total_bytes,
        COALESCE(m.total_process_time, 0) as total_process_time
      FROM peers p
      LEFT JOIN (
        SELECT 
          peer_key,
          COUNT(*) as total_sessions,
          SUM(duration_minutes) as total_duration_minutes,
          SUM(CASE WHEN end_time IS NULL THEN 1 ELSE 0 END) as active_sessions
        FROM provider_sessions
        GROUP BY peer_key
      ) ps ON ps.peer_key = p.key
      LEFT JOIN (
        SELECT 
          ps.peer_key,
          AVG(m.average_tokens_per_second) as avg_tokens_per_second,
          AVG(m.average_token_length) as avg_token_length,
          SUM(m.total_tokens) as total_tokens,
          SUM(m.total_bytes) as total_bytes,
          SUM(m.total_process_time) as total_process_time
        FROM metrics m
        JOIN provider_sessions ps ON ps.id = m.provider_session_id
        GROUP BY ps.peer_key
      ) m ON m.peer_key = p.key
      ORDER BY p.online DESC, ps.total_duration_minutes DESC
    `;
    return this.allQuery<Peer>(sql);
  }

  async getAllPeersOnline(): Promise<Peer[]> {
    const sql = `
      SELECT 
        p.id,
        p.data_collection_enabled,
        p.max_connections,
        p.connections,
        p.model_name,
        p.name,
        p.online,
        p.public,
        p.provider,
        p.healthy,
        COALESCE(ps.total_duration_minutes, 0) as duration_minutes,
        COALESCE(ps.total_sessions, 0) as total_sessions,
        COALESCE((SELECT COUNT(*) FROM metrics m2 
                  JOIN provider_sessions ps2 ON ps2.id = m2.provider_session_id 
                  WHERE ps2.peer_key = p.key), 0) as total_requests,
        COALESCE(ps.active_sessions, 0) as active_sessions,
        COALESCE(m.avg_tokens_per_second, 0) as avg_tokens_per_second,
        COALESCE(m.avg_token_length, 0) as avg_token_length,
        COALESCE(m.total_tokens, 0) as total_tokens,
        COALESCE(m.total_bytes, 0) as total_bytes,
        COALESCE(m.total_process_time, 0) as total_process_time
      FROM peers p
      LEFT JOIN (
        SELECT 
          peer_key,
          COUNT(*) as total_sessions,
          SUM(duration_minutes) as total_duration_minutes,
          SUM(CASE WHEN end_time IS NULL THEN 1 ELSE 0 END) as active_sessions
        FROM provider_sessions
        GROUP BY peer_key
      ) ps ON ps.peer_key = p.key
      LEFT JOIN (
        SELECT 
          ps.peer_key,
          AVG(m.average_tokens_per_second) as avg_tokens_per_second,
          AVG(m.average_token_length) as avg_token_length,
          SUM(m.total_tokens) as total_tokens,
          SUM(m.total_bytes) as total_bytes,
          SUM(m.total_process_time) as total_process_time
        FROM metrics m
        JOIN provider_sessions ps ON ps.id = m.provider_session_id
        GROUP BY ps.peer_key
      ) m ON m.peer_key = p.key
      WHERE p.online IS TRUE
      ORDER BY p.online DESC, ps.total_duration_minutes DESC
    `;
    return this.allQuery<Peer>(sql);
  }

  async resetAllPeerConnections(): Promise<void> {
    await this.runQuery(`
      UPDATE peers 
      SET online = FALSE,
          connections = 0
    `);
  }

  async addPoints(peerKey: string, points: number): Promise<void> {
    await this.runQuery(PREPARED_STATEMENTS.UPDATE_POINTS, [points, peerKey]);
  }

  async updatePeerHealthStatus(
    peerKey: string,
    isHealthy: boolean
  ): Promise<void> {
    try {
      await this.runQuery(PREPARED_STATEMENTS.UPDATE_PEER_HEALTH_STATUS, [
        isHealthy,
        peerKey,
      ]);
      logger.info(`Updated health status for peer ${peerKey} to ${isHealthy}`);
    } catch (error) {
      logger.error(
        `Failed to update health status for peer ${peerKey}: ${error}`
      );
      throw error;
    }
  }
}
