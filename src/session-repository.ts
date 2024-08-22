import { database } from "./database";
import { Database } from "sqlite3";
import { Session, PeerWithSession } from "./types";

export class SessionRepository {
  private db: Database;

  constructor() {
    this.db = database;
  }

  create = (session: Session): Promise<void> => {
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

  get = (id: string): Promise<Session | null> => {
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

  update = (session: Session): Promise<void> => {
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
