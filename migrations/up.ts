import fs from "fs/promises";
import path from "path";
import sqlite3 from "sqlite3";

const db = new sqlite3.Database("sqlite.db");

async function runMigrations() {
  try {
    const seedSql = await fs.readFile(path.join(__dirname, "seed.sql"), "utf8");
    await new Promise((resolve, reject) => {
      db.exec(seedSql, (err) => {
        if (err) reject(err);
        else resolve(true);
      });
    });

    const files = await fs.readdir(__dirname);
    const migrations = files
      .filter((file) => file.endsWith(".sql") && file !== "seed.sql")
      .sort((a, b) => {
        const numA = parseInt(a.split(".")[0], 10);
        const numB = parseInt(b.split(".")[0], 10);
        return numA - numB;
      });

    for (const file of migrations) {
      const id = file.replace(".sql", "");

      const row = await new Promise((resolve, reject) => {
        db.get("SELECT * FROM migrations WHERE id = ?", [id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!row) {
        const sql = await fs.readFile(path.join(__dirname, file), "utf8");
        await new Promise((resolve, reject) => {
          db.exec(sql, (err) => {
            if (err) reject(err);
            else resolve(true);
          });
        });

        await new Promise((resolve, reject) => {
          db.run(
            "INSERT INTO migrations (id, timestamp) VALUES (?, CURRENT_TIMESTAMP)",
            [id],
            (err) => {
              if (err) reject(err);
              else resolve(true);
            }
          );
        });

        console.log(`Migration ${id} applied successfully.`);
      } else {
        console.log(`Migration ${id} already applied, skipping.`);
      }
    }

    console.log("All migrations completed successfully.");
  } catch (error) {
    console.error("Error during migration:", error);
  } finally {
    db.close();
  }
}

runMigrations();
