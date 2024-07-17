import fs from "fs";
import path from "path";
import sqlite3 from "sqlite3";

const db = new sqlite3.Database("sqlite.db");

function getAppliedMigrations(): Promise<number[]> {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT id FROM migrations ORDER BY id DESC",
      (err, rows: { id: number }[]) => {
        if (err) reject(err);
        else resolve(rows.map((row) => row.id));
      }
    );
  });
}

function runMigrationDown(id: number) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(__dirname, `./${id}.down.sql`);
    if (fs.existsSync(filePath)) {
      const sql = fs.readFileSync(filePath, "utf8");
      db.exec(sql, (err) => {
        if (err) reject(err);
        else {
          db.run("DELETE FROM migrations WHERE id = ?", [id], (err) => {
            if (err) reject(err);
            else resolve(true);
          });
        }
      });
    } else {
      console.warn(`Down migration file not found for ${id}`);
      resolve(true);
    }
  });
}

async function runDownMigrations() {
  try {
    const appliedMigrations = await getAppliedMigrations();

    for (const id of appliedMigrations) {
      await runMigrationDown(id);
      console.log(`Reverted migration: ${id}`);
    }

    console.log("All migrations have been reverted.");
  } catch (error) {
    console.error("Error reverting migrations:", error);
  } finally {
    db.close();
  }
}

runDownMigrations();
