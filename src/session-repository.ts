import { Database } from "sqlite3";
import crypto from "node:crypto";

import { database } from "./database";
import { Session, PeerWithSession } from "./types";
import { Logger } from "./logger";

const logger = Logger.getInstance();

export class SessionRepository {
  private db: Database;
  private sessionDuration: number;

  constructor() {
    this.db = database;
    this.sessionDuration = 10 * 60 * 1000; // 10 minutes in milliseconds
  }

  public async createSession(providerId: string): Promise<string> {
    const sessionId = crypto.randomUUID();
    const now = new Date();
    const session: Session = {
      id: sessionId,
      providerId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.sessionDuration),
    };

    await this.create(session);
    logger.info(`🖇️ Session created for provider: ${providerId}`);
    return sessionId;
  }

  public async verifySession(sessionId: string): Promise<string | null> {
    const session = await this.get(sessionId);
    if (!session) {
      logger.warn(`❌ Session not found: ${sessionId}`);
      return null;
    }

    if (new Date() > session.expiresAt) {
      logger.warn(`🕛 Session expired: ${sessionId}`);
      await this.delete(sessionId);
      return null;
    }

    return session.providerId;
  }

  public async extendSession(sessionId: string): Promise<boolean> {
    const session = await this.get(sessionId);
    if (!session) {
      logger.warn(`🚨 Cannot extend non-existent session: ${sessionId}`);
      return false;
    }
    session.expiresAt = new Date(Date.now() + this.sessionDuration);
    await this.update(session);
    logger.info(`🎟️ Session extended: ${sessionId}`);
    return true;
  }

  public async deleteSession(sessionId: string): Promise<boolean> {
    const result = await this.delete(sessionId);
    if (result) {
      logger.info(`🗑 Session deleted: ${sessionId}`);
    } else {
      logger.warn(`🚨 Failed to delete session: ${sessionId}`);
    }
    return result;
  }

  private create = (session: Session): Promise<void> => {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO sessions (id, provider_id, created_at, expires_at) VALUES (?, ?, ?, ?)`;
      this.db.run(
        sql,
        [
          session.id,
          session.providerId,
          session.createdAt.toISOString(),
          session.expiresAt.toISOString(),
        ],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  };

  private get = (id: string): Promise<Session | null> => {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT s.id, s.provider_id as providerId, s.created_at as createdAt, s.expires_at as expiresAt
        FROM sessions s
        WHERE s.id = ?
      `;
      this.db.get(sql, [id], (err, row: PeerWithSession) => {
        if (err) {
          reject(err);
        } else if (row) {
          resolve({
            id: row.id,
            providerId: row.providerId,
            createdAt: new Date(row.createdAt),
            expiresAt: new Date(row.expiresAt),
          });
        } else {
          resolve(null);
        }
      });
    });
  };

  private update = (session: Session): Promise<void> => {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE sessions SET provider_id = ?, created_at = ?, expires_at = ? WHERE id = ?`;
      this.db.run(
        sql,
        [
          session.providerId,
          session.createdAt.toISOString(),
          session.expiresAt.toISOString(),
          session.id,
        ],
        function (err) {
          if (err) {
            reject(err);
          } else if (this.changes === 0) {
            reject(new Error("No session found with the provided id"));
          } else {
            resolve();
          }
        }
      );
    });
  };

  delete = (id: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM sessions WHERE id = ?`;
      this.db.run(sql, [id], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      });
    });
  };

  getAllActiveSessions = (): Promise<PeerWithSession[]> => {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT s.id, s.provider_id as providerId, s.created_at as createdAt, s.expires_at as expiresAt,
               p.key as peer_key, p.discovery_key, p.model_name
        FROM sessions s
        LEFT JOIN peers p ON s.provider_id = p.id
        WHERE s.expires_at > datetime('now')
      `;
      this.db.all(sql, [], (err, rows: PeerWithSession[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(
            rows.map((row) => ({
              id: row.id,
              providerId: row.providerId,
              createdAt: new Date(row.createdAt),
              expiresAt: new Date(row.expiresAt),
              peer_key: row.peer_key,
              discovery_key: row.discovery_key,
              model_name: row.model_name,
            }))
          );
        }
      });
    });
  };
}
