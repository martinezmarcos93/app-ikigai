-- Cuentas creadas por administracion: nombre de usuario ademas del correo y cambio obligatorio de la clave temporal.
-- `tour_completed_at`: cuando la persona termino (o salto) la guia de primer uso; se recuerda en el servidor, no en el navegador.
-- `username` es opcional (las cuentas anteriores entran con su correo) y unico sin distinguir mayusculas.
ALTER TABLE users
  ADD COLUMN username text,
  ADD COLUMN must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN tour_completed_at timestamptz,
  ADD CONSTRAINT users_username_format CHECK (username IS NULL OR username ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(username) BETWEEN 3 AND 64);
CREATE UNIQUE INDEX users_username_unique ON users (username) WHERE username IS NOT NULL;
