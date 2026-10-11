-- Avisos de ausencia o llegada tarde y registro de llegadas tarde. Son informativos: no cancelan
-- reservas, no generan cargos ni sanciones (regla de producto).
CREATE TABLE booking_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('absence', 'late')),
  note text CHECK (note IS NULL OR char_length(note) <= 200),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE attendance_records
  ADD COLUMN arrived_late boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT attendance_late_requires_presence CHECK (NOT arrived_late OR attended);
