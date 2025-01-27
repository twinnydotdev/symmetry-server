import { BaseRepository } from "./base-repository";
import { database } from "./database";
import { SessionStats } from "./types";

interface SessionStatsRow {
  total_sessions: number;
  total_requests_today: number;
  total_requests: number;
  average_session_minutes: number;
  total_provider_time: number;
}

export class ProviderSessionRepository extends BaseRepository {
  constructor() {
    super(database);
  }

  async startSession(peerKey: string): Promise<number> {
    const result = await this.runQuery(
      "INSERT INTO provider_sessions (peer_key) VALUES (?)",
      [peerKey]
    );
    return result;
  }

  async updateSessionDuration(peerKey: string): Promise<void> {
    await this.runQuery(
      `UPDATE provider_sessions 
       SET duration_minutes = ROUND((JULIANDAY(CURRENT_TIMESTAMP) - JULIANDAY(start_time)) * 1440)
       WHERE peer_key = ? AND end_time IS NULL`,
      [peerKey]
    );
  }

  async endSession(peerKey: string): Promise<void> {
    await this.runQuery(
      `UPDATE provider_sessions 
       SET end_time = CURRENT_TIMESTAMP
       WHERE peer_key = ? AND end_time IS NULL`,
      [peerKey]
    );
  }

  async endOrphanedSessions(): Promise<void> {
    await this.runQuery(
      `UPDATE provider_sessions 
       SET end_time = CURRENT_TIMESTAMP 
       WHERE end_time IS NULL`
    );
  }

  async getActiveSessionId(peerKey: string): Promise<number | null> {
    const row = await this.getQuery<{ id: number }>(
      "SELECT id FROM provider_sessions WHERE peer_key = ? AND end_time IS NULL ORDER BY id DESC LIMIT 1",
      [peerKey]
    );
    return row ? row.id : null;
  }

  async addMetrics(metrics: {
    providerSessionId: number | null;
    averageTokensPerSecond: number;
    totalBytes: number;
    totalProcessTime: number;
    averageTokenLength: number;
    startTime: number;
    totalTokens: number;
  }): Promise<void> {
    const query = `
      INSERT INTO metrics (
          provider_session_id,
          average_tokens_per_second,
          total_bytes,
          total_process_time,
          average_token_length,
          start_time,
          total_tokens
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      metrics.providerSessionId,
      metrics.averageTokensPerSecond,
      metrics.totalBytes,
      metrics.totalProcessTime,
      metrics.averageTokenLength,
      metrics.startTime,
      metrics.totalTokens,
    ];

    await this.runQuery(query, params);
  }

  async logRequest(sessionId: number): Promise<void> {
    console.log("Logging request for session:", sessionId);
    await this.runQuery(
      "UPDATE provider_sessions SET total_requests = total_requests + 1 WHERE id = ?",
      [sessionId]
    );
  }

  async getStats(): Promise<SessionStats> {
    // Use the materialized view for better performance
    const row = await this.getQuery<SessionStatsRow>(
      `SELECT * FROM provider_session_stats`
    );

    const activeSessions = await this.getQuery<{count: number}>(
      `SELECT COUNT(*) as count FROM provider_sessions WHERE end_time IS NULL`
    );

    return {
      totalSessions: row?.total_sessions || 0,
      activeSessions: activeSessions?.count || 0,
      totalRequests: row?.total_requests || 0,
      totalRequestsToday: row?.total_requests_today || 0,
      averageSessionMinutes: row?.average_session_minutes || 0,
      totalProviderTime: row?.total_provider_time || 0,
    };
  }
}
