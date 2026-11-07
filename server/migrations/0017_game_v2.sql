-- Aun suponiendo 315 toques perfectos con combo ×3 y peso pesado: score <= 47.250;
-- reps/perfect_reps <= 315. Los CHECK existentes (1.000 / 100.000) siguen alcanzando.
ALTER TABLE game_runs
  ADD COLUMN game_version smallint NOT NULL DEFAULT 1 CHECK (game_version IN (1, 2)),
  ADD COLUMN weight text CHECK (weight IS NULL OR weight IN ('light', 'medium', 'heavy')),
  ADD COLUMN detail jsonb;
