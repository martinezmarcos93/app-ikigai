-- Initial normalized schema for the single Ikigai Training gym.
-- Financial/audit records are append-only; corrections use compensating entries.
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text,
  auth_provider text NOT NULL DEFAULT 'local',
  provider_subject text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'pending')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_normalized CHECK (email = lower(trim(email))),
  CONSTRAINT users_auth_identity CHECK (
    (auth_provider = 'local' AND password_hash IS NOT NULL) OR
    (auth_provider <> 'local' AND provider_subject IS NOT NULL)
  )
);
CREATE UNIQUE INDEX users_email_unique ON users (email);
CREATE UNIQUE INDEX users_provider_subject_unique ON users (auth_provider, provider_subject)
  WHERE provider_subject IS NOT NULL;

CREATE TABLE user_roles (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('admin', 'coach', 'member')),
  granted_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);
CREATE UNIQUE INDEX user_roles_one_active_role
  ON user_roles(user_id, role) WHERE revoked_at IS NULL;

CREATE TABLE member_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  full_name text NOT NULL,
  email text,
  phone text,
  address text,
  dni text,
  emergency_contact_name text,
  emergency_contact_phone text,
  status text NOT NULL DEFAULT 'trial'
    CHECK (status IN ('trial', 'active', 'suspended', 'debtor', 'exited')),
  joined_on date,
  exited_on date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (exited_on IS NULL OR joined_on IS NULL OR exited_on >= joined_on)
);
CREATE INDEX member_profiles_status_idx ON member_profiles(status);
CREATE INDEX member_profiles_name_idx ON member_profiles(lower(full_name));

CREATE TABLE coach_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  full_name text NOT NULL,
  email text,
  phone text,
  discipline text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  current_price numeric(12,2) CHECK (current_price IS NULL OR current_price >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX services_active_name_unique ON services(lower(name)) WHERE active;

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES member_profiles(id) ON DELETE RESTRICT,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  starts_on date NOT NULL,
  ends_on date,
  billing_period text NOT NULL CHECK (billing_period IN ('weekly', 'monthly', 'quarterly', 'annual', 'custom')),
  agreed_price numeric(12,2) NOT NULL CHECK (agreed_price >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('scheduled', 'active', 'paused', 'ended')),
  created_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX memberships_member_dates_idx ON memberships(member_id, starts_on DESC);

CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES member_profiles(id) ON DELETE RESTRICT,
  entry_type text NOT NULL CHECK (entry_type IN ('charge', 'payment', 'adjustment', 'refund', 'reversal')),
  direction text NOT NULL CHECK (direction IN ('debit', 'credit')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  description text NOT NULL,
  occurred_on date NOT NULL,
  applied_period date,
  payment_method text,
  reference text,
  reverses_entry_id uuid REFERENCES ledger_entries(id) ON DELETE RESTRICT,
  idempotency_key text,
  request_hash char(64),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((entry_type = 'reversal' AND reverses_entry_id IS NOT NULL) OR
         (entry_type <> 'reversal' AND reverses_entry_id IS NULL)),
  CHECK (
    (entry_type = 'charge' AND direction = 'debit') OR
    (entry_type IN ('payment', 'refund') AND direction = 'credit') OR
    entry_type IN ('adjustment', 'reversal')
  ),
  CHECK ((idempotency_key IS NULL AND request_hash IS NULL) OR
         (idempotency_key IS NOT NULL AND request_hash IS NOT NULL))
);
CREATE INDEX ledger_member_date_idx ON ledger_entries(member_id, occurred_on DESC);
CREATE INDEX ledger_period_idx ON ledger_entries(applied_period);
CREATE UNIQUE INDEX ledger_idempotency_unique
  ON ledger_entries(created_by, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX ledger_one_reversal_per_entry
  ON ledger_entries(reverses_entry_id) WHERE reverses_entry_id IS NOT NULL;

CREATE TABLE class_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  coach_id uuid NOT NULL REFERENCES coach_profiles(id) ON DELETE RESTRICT,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  local_start_time time NOT NULL,
  duration_minutes smallint NOT NULL CHECK (duration_minutes BETWEEN 1 AND 480),
  capacity smallint NOT NULL CHECK (capacity BETWEEN 1 AND 30),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX class_templates_weekday_idx ON class_templates(weekday, local_start_time) WHERE active;

CREATE TABLE class_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES class_templates(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  capacity_snapshot smallint NOT NULL CHECK (capacity_snapshot BETWEEN 1 AND 30),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_id, starts_at),
  CHECK (ends_at > starts_at)
);
CREATE INDEX class_sessions_starts_at_idx ON class_sessions(starts_at);

CREATE TABLE recurring_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES member_profiles(id) ON DELETE RESTRICT,
  template_id uuid NOT NULL REFERENCES class_templates(id) ON DELETE RESTRICT,
  starts_on date NOT NULL,
  ends_on date,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX recurring_assignments_member_idx ON recurring_assignments(member_id, active);

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES class_sessions(id) ON DELETE RESTRICT,
  member_id uuid NOT NULL REFERENCES member_profiles(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('confirmed', 'waitlist', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  promoted_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  CHECK ((status = 'cancelled' AND cancelled_at IS NOT NULL) OR
         (status <> 'cancelled' AND cancelled_at IS NULL))
);
CREATE UNIQUE INDEX bookings_one_active_member_per_session
  ON bookings(session_id, member_id) WHERE status IN ('confirmed', 'waitlist');
CREATE INDEX bookings_session_status_created_idx
  ON bookings(session_id, status, created_at);

CREATE TABLE attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE RESTRICT,
  attended boolean NOT NULL,
  recorded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE coach_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES coach_profiles(id) ON DELETE RESTRICT,
  period date NOT NULL CHECK (extract(day FROM period) = 1),
  agreed_amount numeric(12,2) NOT NULL CHECK (agreed_amount >= 0),
  due_on date,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(coach_id, period)
);

CREATE TABLE coach_obligation_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id uuid NOT NULL REFERENCES coach_obligations(id) ON DELETE RESTRICT,
  amount_delta numeric(12,2) NOT NULL CHECK (amount_delta <> 0),
  reason text NOT NULL,
  idempotency_key text,
  request_hash char(64),
  recorded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((idempotency_key IS NULL AND request_hash IS NULL) OR
         (idempotency_key IS NOT NULL AND request_hash IS NOT NULL))
);
CREATE INDEX coach_obligation_adjustments_obligation_idx
  ON coach_obligation_adjustments(obligation_id, created_at);
CREATE UNIQUE INDEX coach_adjustment_idempotency_unique
  ON coach_obligation_adjustments(recorded_by, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE coach_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id uuid NOT NULL REFERENCES coach_obligations(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  paid_on date NOT NULL,
  payment_method text,
  reference text,
  idempotency_key text,
  request_hash char(64),
  recorded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((idempotency_key IS NULL AND request_hash IS NULL) OR
         (idempotency_key IS NOT NULL AND request_hash IS NOT NULL))
);
CREATE INDEX coach_payments_obligation_idx ON coach_payments(obligation_id, paid_on);
CREATE UNIQUE INDEX coach_payment_idempotency_unique
  ON coach_payments(recorded_by, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  equipment text,
  precautions text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE routines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  discipline text NOT NULL,
  level text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE routine_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id uuid NOT NULL REFERENCES routines(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number > 0),
  notes text,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(routine_id, version_number)
);

CREATE TABLE routine_exercises (
  routine_version_id uuid NOT NULL REFERENCES routine_versions(id) ON DELETE RESTRICT,
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  position integer NOT NULL CHECK (position > 0),
  sets text,
  reps text,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  rest_seconds integer CHECK (rest_seconds IS NULL OR rest_seconds >= 0),
  notes text,
  PRIMARY KEY(routine_version_id, position)
);

CREATE TABLE routine_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES member_profiles(id) ON DELETE RESTRICT,
  routine_version_id uuid NOT NULL REFERENCES routine_versions(id) ON DELETE RESTRICT,
  assigned_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  starts_on date NOT NULL,
  ends_on date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT routine_assignment_unique UNIQUE (member_id, routine_version_id, starts_on)
);
CREATE INDEX routine_assignments_member_dates_idx ON routine_assignments(member_id, starts_on DESC);

CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  request_id text,
  reason text,
  before_data jsonb,
  after_data jsonb
);
CREATE INDEX audit_events_entity_idx ON audit_events(entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_events_actor_idx ON audit_events(actor_user_id, occurred_at DESC);

-- Append-only records: financial history and audit evidence must be corrected by new entries.
CREATE FUNCTION reject_immutable_record_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% records are append-only; add a compensating record instead', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_record_mutation();

CREATE TRIGGER coach_obligations_append_only
  BEFORE UPDATE OR DELETE ON coach_obligations
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_record_mutation();

CREATE TRIGGER coach_obligation_adjustments_append_only
  BEFORE UPDATE OR DELETE ON coach_obligation_adjustments
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_record_mutation();

CREATE TRIGGER coach_payments_append_only
  BEFORE UPDATE OR DELETE ON coach_payments
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_record_mutation();

CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_record_mutation();
