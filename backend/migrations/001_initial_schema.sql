BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE app_role AS ENUM ('admin', 'coach', 'member');
CREATE TYPE member_status AS ENUM ('trial', 'active', 'suspended', 'debtor', 'exited');
CREATE TYPE ledger_entry_type AS ENUM ('charge', 'payment', 'adjustment', 'refund');
CREATE TYPE booking_status AS ENUM ('confirmed', 'waitlist', 'cancelled');
CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'late', 'excused');

CREATE TABLE members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL CHECK (length(trim(first_name)) BETWEEN 1 AND 100),
  last_name text NOT NULL CHECK (length(trim(last_name)) BETWEEN 1 AND 100),
  email text,
  phone text,
  address text,
  dni text,
  status member_status NOT NULL DEFAULT 'trial',
  joined_at date NOT NULL DEFAULT CURRENT_DATE,
  left_at date,
  emergency_contact_name text,
  emergency_contact_phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (left_at IS NULL OR left_at >= joined_at)
);

CREATE TABLE coaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL CHECK (length(trim(first_name)) BETWEEN 1 AND 100),
  last_name text NOT NULL CHECK (length(trim(last_name)) BETWEEN 1 AND 100),
  email text,
  phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  email_normalized text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role app_role NOT NULL,
  member_id uuid UNIQUE REFERENCES members(id) ON DELETE RESTRICT,
  coach_id uuid UNIQUE REFERENCES coaches(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((role <> 'member') OR member_id IS NOT NULL),
  CHECK ((role <> 'coach') OR coach_id IS NOT NULL),
  CHECK ((role <> 'admin') OR (member_id IS NULL AND coach_id IS NULL))
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY CHECK (length(token_hash) = 64),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry_idx ON sessions (expires_at);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE coach_member_assignments (
  coach_id uuid NOT NULL REFERENCES coaches(id) ON DELETE RESTRICT,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  PRIMARY KEY (coach_id, member_id),
  CHECK (ended_at IS NULL OR ended_at >= assigned_at)
);

CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  description text,
  active boolean NOT NULL DEFAULT true,
  current_price numeric(12,2) CHECK (current_price IS NULL OR current_price >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  starts_on date NOT NULL,
  ends_on date,
  billing_period text NOT NULL CHECK (billing_period IN ('weekly', 'monthly', 'quarterly', 'annual', 'one_off')),
  agreed_price numeric(12,2) NOT NULL CHECK (agreed_price >= 0),
  status text NOT NULL CHECK (status IN ('trial', 'active', 'suspended', 'ended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX memberships_member_dates_idx ON memberships (member_id, starts_on, ends_on);

CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  entry_type ledger_entry_type NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  period_start date,
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 300),
  payment_method text,
  reference text,
  reverses_entry_id uuid REFERENCES ledger_entries(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_member_date_idx ON ledger_entries (member_id, occurred_at DESC);
CREATE INDEX ledger_period_idx ON ledger_entries (period_start);

CREATE TABLE class_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  coach_id uuid NOT NULL REFERENCES coaches(id) ON DELETE RESTRICT,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  starts_at time NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 360),
  capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 200),
  timezone text NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE class_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES class_templates(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  UNIQUE (template_id, starts_at)
);
CREATE INDEX class_sessions_starts_idx ON class_sessions (starts_at);

CREATE TABLE recurring_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  template_id uuid NOT NULL REFERENCES class_templates(id) ON DELETE RESTRICT,
  starts_on date NOT NULL,
  ends_on date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES class_sessions(id) ON DELETE RESTRICT,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  status booking_status NOT NULL DEFAULT 'confirmed',
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  promoted_at timestamptz,
  UNIQUE (session_id, member_id)
);
CREATE INDEX bookings_session_status_idx ON bookings (session_id, status, created_at);
CREATE INDEX bookings_member_idx ON bookings (member_id, created_at DESC);

CREATE TABLE attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE RESTRICT,
  status attendance_status NOT NULL,
  recorded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  correction_reason text
);

CREATE TABLE coach_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES coaches(id) ON DELETE RESTRICT,
  period_start date NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  due_on date,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coach_id, period_start),
  CHECK (EXTRACT(DAY FROM period_start) = 1)
);

CREATE TABLE coach_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id uuid NOT NULL REFERENCES coach_obligations(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  paid_at timestamptz NOT NULL DEFAULT now(),
  payment_method text,
  reference text,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coach_payments_obligation_idx ON coach_payments (obligation_id, paid_at);

CREATE TABLE exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  description text,
  equipment text,
  precautions text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE routines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  service_id uuid REFERENCES services(id) ON DELETE RESTRICT,
  level text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (title, version)
);

CREATE TABLE routine_exercises (
  routine_id uuid NOT NULL REFERENCES routines(id) ON DELETE RESTRICT,
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  position integer NOT NULL CHECK (position >= 0),
  sets integer CHECK (sets IS NULL OR sets > 0),
  reps text,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  rest_seconds integer CHECK (rest_seconds IS NULL OR rest_seconds >= 0),
  notes text,
  PRIMARY KEY (routine_id, position)
);

CREATE TABLE routine_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  routine_id uuid NOT NULL REFERENCES routines(id) ON DELETE RESTRICT,
  assigned_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  starts_on date NOT NULL DEFAULT CURRENT_DATE,
  ends_on date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX routine_assignments_member_idx ON routine_assignments (member_id, starts_on DESC);

CREATE TABLE announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 5000),
  audience text NOT NULL DEFAULT 'all',
  published_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (length(trim(action)) BETWEEN 1 AND 100),
  entity_type text NOT NULL CHECK (length(trim(entity_type)) BETWEEN 1 AND 100),
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  reason text,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_created_idx ON audit_events (created_at DESC);
CREATE INDEX audit_events_actor_idx ON audit_events (actor_user_id, created_at DESC);

COMMIT;