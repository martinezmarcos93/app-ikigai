-- Avisos del gimnasio: administracion publica un mensaje para todos, para los miembros o para los profesores.
-- No son mensajes privados ni llevan datos personales: la guia es no escribir nombres, deudas ni datos de salud.
CREATE TABLE announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  audience text NOT NULL CHECK (audience IN ('all', 'members', 'coaches')),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX announcements_active_idx ON announcements (created_at DESC) WHERE archived_at IS NULL;

CREATE TABLE announcement_reads (
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);
