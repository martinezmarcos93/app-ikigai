-- ADR-003: vencimientos, tolerancia, recargos (aprobados por administracion) y recordatorios de cuota.

-- Reglas generales del gimnasio (una sola fila). El vencimiento por persona va en cada membresia.
CREATE TABLE billing_rules (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  default_due_day smallint NOT NULL DEFAULT 10 CHECK (default_due_day BETWEEN 1 AND 28),
  grace_days smallint NOT NULL DEFAULT 2 CHECK (grace_days BETWEEN 0 AND 15),
  -- NULL = no se proponen recargos. Desde late_fees_since se evalua la mora (no se proponen recargos de meses viejos).
  late_fee_percent numeric(5,2) CHECK (late_fee_percent IS NULL OR (late_fee_percent > 0 AND late_fee_percent <= 100)),
  late_fees_since date,
  due_reminders_enabled boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((late_fee_percent IS NULL) = (late_fees_since IS NULL))
);
INSERT INTO billing_rules (id) VALUES (1);

-- Dia de vencimiento propio (p. ej. quien empezo a mitad de mes paga el 20). NULL = el general del gimnasio.
ALTER TABLE memberships ADD COLUMN due_day smallint CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 28);

-- Propuesta de recargo por mora: la crea la tarea diaria; solo administracion la aprueba (crea el cargo) o la descarta.
CREATE TABLE late_fee_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES member_profiles(id) ON DELETE RESTRICT,
  period date NOT NULL CHECK (extract(day FROM period) = 1),
  due_on date NOT NULL,
  cutoff_on date NOT NULL CHECK (cutoff_on >= due_on),
  debt_amount numeric(12,2) NOT NULL CHECK (debt_amount > 0),
  percent numeric(5,2) NOT NULL CHECK (percent > 0 AND percent <= 100),
  fee_amount numeric(12,2) NOT NULL CHECK (fee_amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'dismissed')),
  ledger_entry_id uuid REFERENCES ledger_entries(id) ON DELETE RESTRICT,
  decided_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, period),
  CHECK ((status = 'pending') = (decided_at IS NULL)),
  CHECK ((status = 'approved') = (ledger_entry_id IS NOT NULL))
);
CREATE INDEX late_fee_proposals_pending_idx ON late_fee_proposals (created_at) WHERE status = 'pending';

-- Registro de recordatorios enviados: uno por miembro, periodo y tipo, aunque la tarea corra varias veces.
CREATE TABLE due_reminders_sent (
  member_id uuid NOT NULL REFERENCES member_profiles(id) ON DELETE CASCADE,
  period date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('day_before', 'due_day')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, period, kind)
);
