import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required. Set it in .env or Vercel/Neon integration.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const schema = readFileSync(join(__dirname, "../db/schema.sql"), "utf8");

  await pool.query(schema);
  await pool.end();

  console.log("Database schema applied successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
