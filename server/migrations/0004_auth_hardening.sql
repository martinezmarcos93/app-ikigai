BEGIN;

CREATE TABLE auth_rate_limit_buckets (
  bucket_key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  hits integer NOT NULL CHECK (hits >= 1),
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_rate_limit_buckets_expiry_idx ON auth_rate_limit_buckets(expires_at);

CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token_hash char(64) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  request_id text,
  CHECK (expires_at > created_at),
  CHECK (used_at IS NULL OR used_at >= created_at)
);
CREATE INDEX password_reset_tokens_user_active_idx
  ON password_reset_tokens(user_id, expires_at)
  WHERE used_at IS NULL;
CREATE INDEX password_reset_tokens_expiry_idx ON password_reset_tokens(expires_at);
CREATE UNIQUE INDEX password_reset_tokens_one_open_per_user
  ON password_reset_tokens(user_id) WHERE used_at IS NULL;

COMMIT;
