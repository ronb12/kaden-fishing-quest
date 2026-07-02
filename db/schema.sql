-- Kaden VR Fishing Quest — Neon schema
-- Run via: npm run db:setup (requires DATABASE_URL)

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saves (
  player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}',
  fish_count INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 0,
  best_catch JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS saves_updated_at_idx ON saves(updated_at DESC);
CREATE INDEX IF NOT EXISTS saves_fish_count_idx ON saves(fish_count DESC);

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS players_updated_at ON players;
CREATE TRIGGER players_updated_at
  BEFORE UPDATE ON players
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS saves_updated_at ON saves;
CREATE TRIGGER saves_updated_at
  BEFORE UPDATE ON saves
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
