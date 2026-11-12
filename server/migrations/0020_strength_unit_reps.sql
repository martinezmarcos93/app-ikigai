-- Dominadas se miden en repeticiones, no en kilos.
-- La columna strength_records.weight_kg guarda la marca en la unidad del ejercicio (kg o reps);
-- se conserva el nombre para no romper la API ni el historial de auditoría.

ALTER TABLE strength_exercises DROP CONSTRAINT strength_exercise_unit_allowed;
ALTER TABLE strength_exercises
  ADD CONSTRAINT strength_exercise_unit_allowed CHECK (unit IN ('kg', 'reps'));

UPDATE strength_exercises SET unit = 'reps' WHERE code = 'DM';
