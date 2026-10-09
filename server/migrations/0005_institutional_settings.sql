BEGIN;

-- One singleton row keeps institution-wide configuration explicit and server-backed.
-- Null values mean "not configured"; no demo contact details are seeded.
CREATE TABLE institutional_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  institution_name text,
  contact_email text,
  contact_phone text,
  address text,
  opening_hours text,
  updated_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (institution_name IS NULL OR char_length(institution_name) <= 120),
  CHECK (contact_email IS NULL OR char_length(contact_email) <= 254),
  CHECK (contact_phone IS NULL OR char_length(contact_phone) <= 40),
  CHECK (address IS NULL OR char_length(address) <= 300),
  CHECK (opening_hours IS NULL OR char_length(opening_hours) <= 1000)
);

INSERT INTO institutional_settings (id) VALUES (1);

COMMIT;
