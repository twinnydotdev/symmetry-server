import { BaseRepository } from "./base-repository";
import { database } from "./database";
import { IpMessageRow } from "./types";

export class MessageRepository extends BaseRepository {
  constructor() {
    super(database);
  }

  async incrementMessageCount(ipAddress: string): Promise<void> {
    const now = new Date().toISOString();
    await this.runQuery(
      `INSERT INTO ip_messages (ip_address, message_count, first_seen, last_seen)
       VALUES (?, 1, ?, ?)
       ON CONFLICT(ip_address) DO UPDATE SET
       message_count = message_count + 1,
       last_seen = ?`,
      [ipAddress, now, now, now]
    );
  }

  async getMessageCount(
    ipAddress: string,
    timeWindowMinutes: number
  ): Promise<IpMessageRow | undefined> {
    const timeWindowStart = new Date(
      Date.now() - timeWindowMinutes * 60 * 1000
    ).toISOString();

    return this.getQuery<IpMessageRow>(
      `SELECT * FROM ip_messages 
       WHERE ip_address = ? AND last_seen >= ?`,
      [ipAddress, timeWindowStart]
    );
  }
}
