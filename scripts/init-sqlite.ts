import "dotenv/config";
import { initSqliteSchema } from "../apps/api/src/services/sqliteSchema.js";

await initSqliteSchema();
console.log("SQLite schema initialized.");
