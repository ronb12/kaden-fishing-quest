import { neon } from "@neondatabase/serverless";

let sql;
function getSql() {
  if (!sql) {
    if (!process.env.DATABASE_URL) return null;
    sql = neon(process.env.DATABASE_URL);
  }
  return sql;
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function ensurePlayer(playerId, db) {
  await db`
    INSERT INTO players (id)
    VALUES (${playerId})
    ON CONFLICT (id) DO NOTHING
  `;
}

export default async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: "DATABASE_URL not configured" });
  }

  const db = getSql();
  if (!db) return res.status(503).json({ error: "DATABASE_URL not configured" });

  try {
    if (req.method === "GET") {
      const playerId = req.query.playerId;
      if (!playerId) return res.status(400).json({ error: "playerId required" });

      const rows = await db`
        SELECT state, fish_count, coins, best_catch, updated_at
        FROM saves WHERE player_id = ${playerId}
      `;
      if (!rows.length) return res.status(200).json({ found: false, playerId });
      return res.status(200).json({ found: true, playerId, save: rows[0] });
    }

    if (req.method === "POST") {
      const { playerId, state } = req.body || {};
      if (!playerId || !state) return res.status(400).json({ error: "playerId and state required" });

      await ensurePlayer(playerId, db);
      await db`
        INSERT INTO saves (player_id, state, fish_count, coins, best_catch)
        VALUES (
          ${playerId},
          ${state},
          ${state.fish || 0},
          ${state.coins || 0},
          ${state.bestCatch || null}
        )
        ON CONFLICT (player_id) DO UPDATE SET
          state = EXCLUDED.state,
          fish_count = EXCLUDED.fish_count,
          coins = EXCLUDED.coins,
          best_catch = EXCLUDED.best_catch,
          updated_at = NOW()
      `;
      return res.status(200).json({ ok: true, playerId });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("API error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
