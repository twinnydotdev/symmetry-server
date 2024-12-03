// provider-session-repository.ts
import { Database } from "sqlite3";
import { SessionStats } from "./types";

export class ProviderSessionRepository {
  private db: Database;

  constructor() {
    this.db = new Database("sqlite.db");
  }

  async startSession(peerKey: string): Promise<number> {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO provider_sessions (peer_key) VALUES (?)",
        [peerKey],
        function (err) {
          if (err) reject(err);
          resolve(this.lastID);
        }
      );
    });
  }

  async updateSessionDuration(peerKey: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE provider_sessions 
         SET duration_minutes = ROUND((JULIANDAY(CURRENT_TIMESTAMP) - JULIANDAY(start_time)) * 1440)
         WHERE peer_key = ? AND end_time IS NULL`,
        [peerKey],
        (err) => {
          if (err) reject(err);
          resolve();
        }
      );
    });
  }

  async endSession(peerKey: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE provider_sessions 
         SET end_time = CURRENT_TIMESTAMP
         WHERE peer_key = ? AND end_time IS NULL`,
        [peerKey],
        (err) => {
          if (err) reject(err);
          resolve();
        }
      );
    });
  }

  async endOrphanedSessions(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE provider_sessions 
         SET end_time = CURRENT_TIMESTAMP 
         WHERE end_time IS NULL`,
        (err) => {
          if (err) reject(err);
          resolve();
        }
      );
    });
  }

  async getActiveSessionId(peerKey: string): Promise<number | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT id FROM provider_sessions WHERE peer_key = ? AND end_time IS NULL ORDER BY id DESC LIMIT 1",
        [peerKey],
        (err, row: { id: number } | undefined) => {
          if (err) reject(err);
          resolve(row ? row.id : null);
        }
      );
    });
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
    return new Promise((resolve, reject) => {
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

      this.db.run(query, params, (err) => {
        if (err) {
          console.error("Error adding metrics to database:", err);
          reject(err);
        }
      });
    });
  }

  async logRequest(sessionId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        "UPDATE provider_sessions SET total_requests = total_requests + 1 WHERE id = ?",
        [sessionId],
        (err) => {
          if (err) reject(err);
          resolve();
        }
      );
    });
  }

  async getStats(): Promise<SessionStats> {
    return new Promise((resolve, reject) => {
      this.db.get<SessionStats>(
        `SELECT 
          COUNT(*) as totalSessions,
          SUM(CASE WHEN date(start_time) = date('now') THEN total_requests ELSE 0 END) as totalRequestsToday,
          SUM(total_requests) as totalRequests,
          ROUND(AVG(CASE WHEN duration_minutes IS NOT 0 THEN duration_minutes ELSE NULL END), 2) as averageSessionMinutes,
          SUM(duration_minutes) as totalProviderTime
        FROM provider_sessions`,
        (err, row) => {
          if (err) reject(err);
          resolve({
            totalSessions: row.totalSessions || 0,
            activeSessions: row.activeSessions || 0,
            totalRequests: row.totalRequests || 0,
            totalRequestsToday: row.totalRequestsToday || 0,
            averageSessionMinutes: row.averageSessionMinutes || 0,
            totalProviderTime: row.totalProviderTime || 0,
          });
        }
      );
    });
  }
}
