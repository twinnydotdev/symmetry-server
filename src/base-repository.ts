/* eslint-disable @typescript-eslint/no-explicit-any */
import { Database } from "sqlite3";
import { logger } from "./logger";

export abstract class BaseRepository {
  protected readonly db: Database;
  private readonly maxRetries = 5;
  private readonly baseDelay = 100;

  constructor(db: Database) {
    this.db = db;
  }

  protected async runQuery(sql: string, params: any[] = []): Promise<number> {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await new Promise((resolve, reject) => {
          this.db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this.changes);
          });
        });
      } catch (err: any) {
        if (err.code === "SQLITE_BUSY" && attempt < this.maxRetries - 1) {
          await new Promise((r) =>
            setTimeout(r, this.baseDelay * Math.pow(2, attempt))
          );
          continue;
        }
        logger.error(`Database error: ${err.message}`);
        throw err;
      }
    }
    throw new Error("Max retries exceeded");
  }

  protected async getQuery<T>(sql: string, params: any[] = []): Promise<T> {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await new Promise((resolve, reject) => {
          this.db.get(sql, params, (err, row: T) => {
            if (err) reject(err);
            else resolve(row);
          });
        });
      } catch (err: any) {
        if (err.code === "SQLITE_BUSY" && attempt < this.maxRetries - 1) {
          await new Promise((r) =>
            setTimeout(r, this.baseDelay * Math.pow(2, attempt))
          );
          continue;
        }
        logger.error(`Database error: ${err.message}`);
        throw err;
      }
    }
    throw new Error("Max retries exceeded");
  }

  protected async allQuery<T>(sql: string, params: any[] = []): Promise<T[]> {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await new Promise((resolve, reject) => {
          this.db.all(sql, params, (err, rows: T[]) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
      } catch (err: any) {
        if (err.code === "SQLITE_BUSY" && attempt < this.maxRetries - 1) {
          await new Promise((r) =>
            setTimeout(r, this.baseDelay * Math.pow(2, attempt))
          );
          continue;
        }
        logger.error(`Database error: ${err.message}`);
        throw err;
      }
    }
    throw new Error("Max retries exceeded");
  }
}
