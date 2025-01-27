/* eslint-disable @typescript-eslint/no-explicit-any */
import { Database } from "sqlite3";
import { logger } from "./logger";

export abstract class BaseRepository {
  protected readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  protected async runQuery(sql: string, params: any[] = []): Promise<number> {
    return await new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) {
          logger.error(`Database error: ${err.message}`);
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  protected async getQuery<T>(sql: string, params: any[] = []): Promise<T> {
    return await new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row: T) => {
        if (err) {
          logger.error(`Database error: ${err.message}`);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  protected async allQuery<T>(sql: string, params: any[] = []): Promise<T[]> {
    return await new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows: T[]) => {
        if (err) {
          logger.error(`Database error: ${err.message}`);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }
}
