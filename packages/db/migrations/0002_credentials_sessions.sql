CREATE TABLE credentials (
  id text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES users(id),
  storage text NOT NULL CHECK (storage IN ('session','persistent')),
  mask text NOT NULL,
  instance_id text,
  encrypted jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_used_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  UNIQUE(owner_id,id),
  CHECK ((storage='session' AND encrypted IS NULL AND instance_id IS NOT NULL)
    OR (storage='persistent' AND instance_id IS NULL AND (encrypted IS NOT NULL OR revoked_at IS NOT NULL)))
);
CREATE INDEX credentials_owner ON credentials(owner_id) WHERE revoked_at IS NULL;
ALTER TABLE jobs ADD COLUMN credential_id text;
ALTER TABLE jobs ADD CONSTRAINT jobs_credential_owner FOREIGN KEY(owner_id,credential_id) REFERENCES credentials(owner_id,id);
CREATE INDEX jobs_credential ON jobs(credential_id,status);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES users(id),
  csrf_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX sessions_owner ON sessions(owner_id);
CREATE TABLE deployment_owner (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  owner_id text NOT NULL REFERENCES users(id)
);
CREATE TABLE oidc_identities (
  issuer text NOT NULL,
  subject text NOT NULL,
  owner_id text NOT NULL REFERENCES users(id),
  PRIMARY KEY(issuer,subject)
);
