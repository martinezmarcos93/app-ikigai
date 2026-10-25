-- Juego Iron Pixel, puntos canjeables y premio semanal (pedido del gimnasio, 22/10/2026).
-- Juegan administración, profesores y miembros; solo los miembros suman puntos canjeables y entran al ranking.
-- El puntaje lo calcula el servidor a partir de repeticiones validadas, nunca lo manda el navegador.

-- Configuración única del programa de premios (la edita administración).
CREATE TABLE reward_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  reward_name text NOT NULL DEFAULT 'Barra de cereal' CHECK (length(btrim(reward_name)) BETWEEN 1 AND 80),
  points_per_reward integer NOT NULL DEFAULT 5000 CHECK (points_per_reward BETWEEN 100 AND 1000000),
  daily_points_cap integer NOT NULL DEFAULT 1000 CHECK (daily_points_cap BETWEEN 0 AND 100000),
  weekly_prize_enabled boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO reward_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

-- Cada partida. member_id solo se completa cuando quien juega compite (miembro sin rol de staff).
CREATE TABLE game_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  member_id uuid REFERENCES member_profiles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'finished', 'abandoned', 'rejected')),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz,
  reps smallint CHECK (reps BETWEEN 0 AND 1000),
  perfect_reps smallint CHECK (perfect_reps BETWEEN 0 AND 1000),
  score integer CHECK (score BETWEEN 0 AND 100000),
  points_awarded integer NOT NULL DEFAULT 0 CHECK (points_awarded >= 0),
  reject_reason text CHECK (reject_reason IS NULL OR length(reject_reason) <= 120),
  CHECK ((status = 'finished') = (score IS NOT NULL)),
  CHECK (perfect_reps IS NULL OR reps IS NULL OR perfect_reps <= reps)
);
CREATE INDEX game_runs_user_started_idx ON game_runs (user_id, started_at DESC);
CREATE INDEX game_runs_member_finished_idx ON game_runs (member_id, finished_at DESC) WHERE status = 'finished' AND member_id IS NOT NULL;

-- Libro de puntos: solo se agrega (como la cuenta corriente). Saldo = suma de delta.
CREATE TABLE reward_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES member_profiles(id) ON DELETE RESTRICT,
  delta integer NOT NULL CHECK (delta <> 0 AND delta BETWEEN -1000000 AND 1000000),
  kind text NOT NULL CHECK (kind IN ('game', 'redemption', 'adjustment')),
  game_run_id uuid UNIQUE REFERENCES game_runs(id) ON DELETE RESTRICT,
  note text CHECK (note IS NULL OR length(note) <= 200),
  created_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((kind = 'game') = (game_run_id IS NOT NULL)),
  CHECK (kind <> 'redemption' OR delta < 0)
);
CREATE INDEX reward_points_member_idx ON reward_points (member_id, created_at DESC);
CREATE TRIGGER reward_points_append_only
  BEFORE UPDATE OR DELETE ON reward_points
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_record_mutation();

-- Premio semanal entregado: la semana va de lunes a domingo, hora de Buenos Aires. El ganador lo calcula el servidor.
CREATE TABLE weekly_prizes (
  week_start date PRIMARY KEY CHECK (extract(isodow FROM week_start) = 1),
  member_id uuid NOT NULL REFERENCES member_profiles(id) ON DELETE RESTRICT,
  game_run_id uuid NOT NULL REFERENCES game_runs(id) ON DELETE RESTRICT,
  score integer NOT NULL CHECK (score >= 0),
  delivered_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  delivered_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
