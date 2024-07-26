import path from "path";
import sqlite3 from "sqlite3";

const dbPath = path.join(__dirname, "../sqlite.db")

export const database = new sqlite3.Database(dbPath);
