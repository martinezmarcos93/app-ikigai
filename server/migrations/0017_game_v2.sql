-- Techos por ejercicio: 120 + 42 + 107 + 46 = 315 reps; como máximo 242 perfectas.
-- El puntaje queda por debajo de 100.000 incluso con combo y peso máximos, así que los CHECK de 0012 alcanzan.
ALTER TABLE game_runs
  ADD COLUMN game_version smallint NOT NULL DEFAULT 1 CHECK (game_version IN (1, 2)),
  ADD COLUMN weight text CHECK (weight IS NULL OR weight IN ('light', 'medium', 'heavy')),
  ADD COLUMN detail jsonb;
