import path from "path";
import sqlite3 from "sqlite3";

export const database = new sqlite3.Database(
  path.join(__dirname, "../sqlite.db")
);
