import { logger } from "./logger";
import { SessionRepository } from "./session-repository";
import crypto from "crypto";

interface Session {
  id: string;
  providerId: string;
  createdAt: Date;
  expiresAt: Date;
}

export class SessionManager {
  private sessionRepository: SessionRepository;
  private sessionDuration: number; // in milliseconds

  constructor(
    sessionRepository: SessionRepository,
    sessionDurationMinutes: number = 60
  ) {
    this.sessionRepository = sessionRepository;
    this.sessionDuration = sessionDurationMinutes * 60 * 1000;
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

    await this.sessionRepository.create(session);
    logger.info(`Session created: ${sessionId} for provider: ${providerId}`);
    return sessionId;
  }

  async verifySession(sessionId: string): Promise<string | null> {
    const session = await this.sessionRepository.get(sessionId);
    if (!session) {
      logger.warning(`Session not found: ${sessionId}`);
      return null;
    }

    if (new Date() > session.expiresAt) {
      logger.warning(`Session expired: ${sessionId}`);
      await this.sessionRepository.delete(sessionId);
      return null;
    }

    return session.providerId;
  }

  async extendSession(sessionId: string): Promise<boolean> {
    const session = await this.sessionRepository.get(sessionId);
    if (!session) {
      logger.warning(`Cannot extend non-existent session: ${sessionId}`);
      return false;
    }
    session.expiresAt = new Date(Date.now() + this.sessionDuration);
    await this.sessionRepository.update(session);
    logger.info(`Session extended: ${sessionId}`);
    return true;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const result = await this.sessionRepository.delete(sessionId);
    if (result) {
      logger.info(`Session deleted: ${sessionId}`);
    } else {
      logger.warning(`Failed to delete session: ${sessionId}`);
    }
    return result;
  }

  async cleanupExpiredSessions(): Promise<number> {
    const deletedCount = await this.sessionRepository.deleteExpired();
    logger.info(`Cleaned up ${deletedCount} expired sessions`);
    return deletedCount;
  }
}
