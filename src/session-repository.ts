import { BaseRepository } from "./base-repository";
import { database } from "./database";
import { Session, PeerWithSession } from "./types";
import { Logger } from "./logger";
import crypto from "node:crypto";

const logger = Logger.getInstance();

export class SessionRepository extends BaseRepository {
  private sessionDuration: number;

  constructor() {
    super(database);
    this.sessionDuration = 10 * 60 * 1000;
  }

  async createSession(providerId: string): Promise<string> {
    const sessionId = crypto.randomUUID();
    const now = new Date();
    const session: Session = {
      id: sessionId,
      providerId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.sessionDuration),
    };

    await this.runQuery(
      `INSERT INTO sessions (id, provider_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
      [
        session.id,
        session.providerId,
        session.createdAt.toISOString(),
        session.expiresAt.toISOString(),
      ]
    );

    logger.info(`🖇️ Session created for provider: ${providerId}`);
    return sessionId;
  }

  async verifySession(sessionId: string): Promise<string | null> {
    const session = await this.getQuery<Session>(
      `SELECT id, provider_id as providerId, created_at as createdAt, expires_at as expiresAt
       FROM sessions WHERE id = ?`,
      [sessionId]
    );

    if (!session) {
      logger.warn(`❌ Session not found: ${sessionId}`);
      return null;
    }

    if (new Date() > new Date(session.expiresAt)) {
      logger.warn(`🕛 Session expired: ${sessionId}`);
      await this.deleteSession(sessionId);
      return null;
    }

    return session.providerId;
  }

  async extendSession(sessionId: string): Promise<boolean> {
    const session = await this.getQuery<Session>(
      `SELECT id, provider_id as providerId, created_at as createdAt, expires_at as expiresAt
       FROM sessions WHERE id = ?`,
      [sessionId]
    );

    if (!session) {
      logger.warn(`🚨 Cannot extend non-existent session: ${sessionId}`);
      return false;
    }

    const newExpiresAt = new Date(Date.now() + this.sessionDuration);

    await this.runQuery(
      `UPDATE sessions SET provider_id = ?, created_at = ?, expires_at = ? WHERE id = ?`,
      [
        session.providerId,
        session.createdAt,
        newExpiresAt.toISOString(),
        sessionId,
      ]
    );

    logger.info(`🎟️ Session extended: ${sessionId}`);
    return true;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const result = await this.runQuery(`DELETE FROM sessions WHERE id = ?`, [
      sessionId,
    ]);

    if (result > 0) {
      logger.info(`🗑 Session deleted: ${sessionId}`);
      return true;
    }

    logger.warn(`🚨 Failed to delete session: ${sessionId}`);
    return false;
  }

  async getAllActiveSessions(): Promise<PeerWithSession[]> {
    const rows = await this.allQuery<PeerWithSession>(
      `SELECT s.id, s.provider_id as providerId, s.created_at as createdAt, s.expires_at as expiresAt,
              p.key as peer_key, p.discovery_key, p.model_name
       FROM sessions s
       LEFT JOIN peers p ON s.provider_id = p.id
       WHERE s.expires_at > datetime('now')`
    );

    return rows.map((row) => ({
      id: row.id,
      providerId: row.providerId,
      createdAt: new Date(row.createdAt),
      expiresAt: new Date(row.expiresAt),
      peer_key: row.peer_key,
      discovery_key: row.discovery_key,
      model_name: row.model_name,
    }));
  }
}
