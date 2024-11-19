import { Database } from "sqlite3";
import { database } from "./database";
import { IpMessageRow } from "./types";

export class MessageRepository {
  private db: Database;

  constructor() {
    this.db = database;
  }

  async incrementMessageCount(ipAddress: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      this.db.run(
        `INSERT INTO ip_messages (ip_address, message_count, first_seen, last_seen)
         VALUES (?, 1, ?, ?)
         ON CONFLICT(ip_address) DO UPDATE SET
         message_count = message_count + 1,
         last_seen = ?`,
        [ipAddress, now, now, now],
        (err) => {
          if (err) reject(err);
          resolve();
        }
      );
    });
  }

  async getMessageCount(
    ipAddress: string,
    timeWindowMinutes: number
  ): Promise<IpMessageRow | undefined> {
    return new Promise((resolve, reject) => {
      const timeWindowStart = new Date(
        Date.now() - timeWindowMinutes * 60 * 1000
      ).toISOString();

      this.db.get<IpMessageRow>(
        `SELECT * FROM ip_messages 
         WHERE ip_address = ? AND last_seen >= ?`,
        [ipAddress, timeWindowStart],
        (err, row) => {
          if (err) reject(err);
          resolve(row);
        }
      );
    });
  }
}
