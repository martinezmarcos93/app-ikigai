-- Novedades de cada versión: el portal muestra los globos una sola vez por persona (no por aparato).
-- Guarda la última versión de novedades que la persona cerró.
ALTER TABLE users
  ADD COLUMN release_notes_seen text CHECK (release_notes_seen IS NULL OR release_notes_seen ~ '^[0-9a-z.-]{1,40}$');
