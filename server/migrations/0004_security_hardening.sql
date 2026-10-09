BEGIN;

-- Shared fixed-window rate limiting across API replicas. The key is a digest,
-- not a raw IP address or email address.
CREATE TABLE rate_limit_buckets (
  bucket_key char(64) PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count >= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rate_limit_buckets_updated_at_idx ON rate_limit_buckets(updated_at);

-- Self-service password recovery stores only token digests. Delivery is handled
-- by a configured provider; raw tokens must never be logged or persisted.
CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token_hash char(64) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  request_id varchar(128),
  CHECK (used_at IS NULL OR revoked_at IS NULL)
);
CREATE INDEX password_reset_tokens_expiry_idx ON password_reset_tokens(expires_at);
CREATE UNIQUE INDEX password_reset_tokens_one_open_per_user
  ON password_reset_tokens(user_id)
  WHERE used_at IS NULL AND revoked_at IS NULL;

COMMIT;
