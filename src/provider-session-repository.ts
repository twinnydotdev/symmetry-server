import { BaseRepository } from "./base-repository";
import { database } from "./database";
import { SessionStats } from "./types";

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
    await this.runQuery(
      "UPDATE provider_sessions SET total_requests = total_requests + 1 WHERE id = ?",
      [sessionId]
    );
  }

  async getStats(): Promise<SessionStats> {
    const row = await this.getQuery<SessionStats>(
      `SELECT 
        COUNT(*) as totalSessions,
        SUM(CASE WHEN date(start_time) = date('now') THEN total_requests ELSE 0 END) as totalRequestsToday,
        SUM(total_requests) as totalRequests,
        ROUND(AVG(CASE WHEN duration_minutes IS NOT 0 THEN duration_minutes ELSE NULL END), 2) as averageSessionMinutes,
        SUM(duration_minutes) as totalProviderTime
      FROM provider_sessions`
    );

    return {
      totalSessions: row.totalSessions || 0,
      activeSessions: row.activeSessions || 0,
      totalRequests: row.totalRequests || 0,
      totalRequestsToday: row.totalRequestsToday || 0,
      averageSessionMinutes: row.averageSessionMinutes || 0,
      totalProviderTime: row.totalProviderTime || 0,
    };
  }
}
