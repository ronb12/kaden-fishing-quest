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

  const sort = req.query.sort || "fish";

  try {
    let rows;
    if (sort === "coins") {
      rows = await sql`
        SELECT s.player_id, s.fish_count, s.coins, s.best_catch, s.updated_at, p.display_name
        FROM saves s LEFT JOIN players p ON p.id = s.player_id
        ORDER BY s.coins DESC, s.fish_count DESC LIMIT 20
      `;
    } else if (sort === "weight") {
      rows = await sql`
        SELECT s.player_id, s.fish_count, s.coins, s.best_catch, s.updated_at, p.display_name
        FROM saves s LEFT JOIN players p ON p.id = s.player_id
        ORDER BY (s.best_catch->>'weight')::float DESC NULLS LAST, s.fish_count DESC LIMIT 20
      `;
    } else if (sort === "codex") {
      rows = await sql`
        SELECT s.player_id, s.fish_count, s.coins, s.best_catch, s.updated_at, p.display_name,
          jsonb_object_length(COALESCE(s.state->'codex', '{}'::jsonb)) AS codex_count
        FROM saves s LEFT JOIN players p ON p.id = s.player_id
        ORDER BY codex_count DESC, s.fish_count DESC LIMIT 20
      `;
    } else if (sort === "weekly") {
      rows = await sql`
        SELECT s.player_id, s.fish_count, s.coins, s.best_catch, s.updated_at, p.display_name
        FROM saves s LEFT JOIN players p ON p.id = s.player_id
        WHERE s.updated_at >= NOW() - INTERVAL '7 days'
        ORDER BY s.fish_count DESC, s.coins DESC LIMIT 20
      `;
    } else {
      rows = await sql`
        SELECT s.player_id, s.fish_count, s.coins, s.best_catch, s.updated_at, p.display_name
        FROM saves s LEFT JOIN players p ON p.id = s.player_id
        ORDER BY s.fish_count DESC, s.coins DESC LIMIT 20
      `;
    }
    return res.status(200).json({ leaderboard: rows, sort });
  } catch (err) {
    console.error("Leaderboard error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
