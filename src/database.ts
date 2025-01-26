import path from "path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const dbPath = path.join(__dirname, "../sqlite.db");

const config = {
  filename: dbPath,
  driver: sqlite3.Database,
  mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE | sqlite3.OPEN_FULLMUTEX,
};

export const initDatabase = async () => {
  try {
    const db = await open(config);

    await db.run("PRAGMA journal_mode=WAL;");
    await db.run("PRAGMA synchronous=NORMAL;");
    await db.run("PRAGMA busy_timeout=5000;");
    await db.run("PRAGMA cache_size=-10000;");
    await db.run("PRAGMA temp_store=MEMORY;");

    return db;
  } catch (err) {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  }
};

export const database = initDatabase();
