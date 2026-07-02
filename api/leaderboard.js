import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: "DATABASE_URL not configured" });
  }

  try {
    const rows = await sql`
      SELECT
        s.player_id,
        s.fish_count,
        s.coins,
        s.best_catch,
        s.updated_at,
        p.display_name
      FROM saves s
      LEFT JOIN players p ON p.id = s.player_id
      ORDER BY s.fish_count DESC, s.coins DESC
      LIMIT 20
    `;
    return res.status(200).json({ leaderboard: rows });
  } catch (err) {
    console.error("Leaderboard error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
