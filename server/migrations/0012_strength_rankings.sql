-- Strength rankings: immutable exercise catalog + historical records.
-- The ranking itself is derived from each member's best recorded weight.

CREATE TABLE strength_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL UNIQUE,
  unit text NOT NULL DEFAULT 'kg',
  display_order integer NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT strength_exercise_code_format CHECK (code ~ '^[A-Z0-9.() -]+$'),
  CONSTRAINT strength_exercise_unit_allowed CHECK (unit IN ('kg'))
);

CREATE TABLE strength_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES member_profiles(id) ON DELETE RESTRICT,
  exercise_id uuid NOT NULL REFERENCES strength_exercises(id) ON DELETE RESTRICT,
  weight_kg numeric(8,2) NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT strength_record_weight_positive CHECK (weight_kg > 0 AND weight_kg <= 2000),
  CONSTRAINT strength_record_notes_length CHECK (notes IS NULL OR char_length(notes) <= 500)
);

CREATE INDEX strength_records_ranking_idx
  ON strength_records (exercise_id, member_id, weight_kg DESC, recorded_at DESC);

CREATE INDEX strength_records_member_idx
  ON strength_records (member_id, exercise_id, recorded_at DESC);

INSERT INTO strength_exercises (code, name, display_order)
VALUES
  ('PP', 'Pecho plano', 1),
  ('P.45', 'Pecho 45°', 2),
  ('DM', 'Dominadas', 3),
  ('ST', 'Sentadillas', 4),
  ('PM', 'Peso muerto', 5),
  ('DESPE', 'Despegue', 6),
  ('PM (2)', 'Press militar', 7),
  ('HPT', 'Hip thrust', 8)
ON CONFLICT (code) DO NOTHING;

CREATE INDEX strength_records_latest_idx
  ON strength_records (exercise_id, recorded_at DESC);
