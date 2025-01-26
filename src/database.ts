import path from "path";
import sqlite3 from "sqlite3";

const dbPath = path.join(__dirname, "../sqlite.db");

export const database = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    database.run('PRAGMA journal_mode = WAL;');
    database.run('PRAGMA synchronous = NORMAL;');
    database.run('PRAGMA cache_size = -16000;'); // 16MB cache
    database.run('PRAGMA temp_store = MEMORY;');
    database.run('PRAGMA mmap_size = 268435456;'); // 256MB mmap
    database.run('PRAGMA page_size = 4096;');
  }
});
