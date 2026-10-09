BEGIN;

CREATE TABLE user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token_hash char(64) NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (accepted_at IS NULL OR revoked_at IS NULL)
);
CREATE INDEX user_invitations_expiry_idx ON user_invitations(expires_at);
CREATE UNIQUE INDEX user_invitations_one_open_per_user
  ON user_invitations(user_id)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

COMMIT;
