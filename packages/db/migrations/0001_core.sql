CREATE TABLE users (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE scenario_versions (
  digest text PRIMARY KEY CHECK (digest ~ '^[a-f0-9]{64}$'),
  manifest jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE source_records (
  scenario_digest text NOT NULL REFERENCES scenario_versions(digest),
  id text NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY (scenario_digest,id)
);
CREATE TABLE campaigns (
  id text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES users(id),
  scenario_digest text NOT NULL REFERENCES scenario_versions(digest),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0 AND revision <= 9007199254740991),
  sse_sequence bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,id)
);
CREATE INDEX campaigns_owner ON campaigns(owner_id,created_at,id);
CREATE TABLE commands (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  campaign_id text NOT NULL,
  idempotency_key text NOT NULL,
  input_hash text NOT NULL,
  envelope jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(owner_id,campaign_id) REFERENCES campaigns(owner_id,id),
  UNIQUE(owner_id,idempotency_key)
);
CREATE TABLE jobs (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  campaign_id text NOT NULL,
  command_id text NOT NULL UNIQUE REFERENCES commands(id),
  status text NOT NULL CHECK (status IN ('pending','running','committed','cancelled','failed')),
  fence bigint NOT NULL DEFAULT 0 CHECK (fence >= 0),
  lease_expires_at timestamptz,
  expected_revision bigint NOT NULL,
  input_hash text,
  committed_revision bigint,
  checkpoint jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(owner_id,campaign_id) REFERENCES campaigns(owner_id,id)
);
CREATE INDEX jobs_claim ON jobs(status,lease_expires_at,created_at);
CREATE TABLE world_snapshots (
  campaign_id text NOT NULL REFERENCES campaigns(id),
  revision bigint NOT NULL,
  schema_version integer NOT NULL,
  snapshot_version integer NOT NULL,
  state jsonb NOT NULL,
  state_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(campaign_id,revision)
);
CREATE TABLE world_events (
  event_id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES campaigns(id),
  revision bigint NOT NULL,
  event_index integer NOT NULL CHECK (event_index >= 0),
  job_id text NOT NULL REFERENCES jobs(id),
  schema_version integer NOT NULL,
  data jsonb NOT NULL,
  occurs_on date NOT NULL,
  visibility jsonb NOT NULL,
  UNIQUE(campaign_id,revision,event_index)
);
CREATE INDEX events_campaign_date ON world_events(campaign_id,occurs_on,revision,event_index);
CREATE TABLE territory_control (
  campaign_id text NOT NULL REFERENCES campaigns(id),
  territory_id text NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY(campaign_id,territory_id)
);
CREATE TABLE facts (
  campaign_id text NOT NULL REFERENCES campaigns(id),
  fact_id text NOT NULL,
  subject_id text NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY(campaign_id,fact_id)
);
CREATE INDEX facts_subject ON facts(campaign_id,subject_id);
CREATE TABLE relations (
  campaign_id text NOT NULL REFERENCES campaigns(id),
  from_actor_id text NOT NULL,
  to_actor_id text NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY(campaign_id,from_actor_id,to_actor_id)
);
CREATE TABLE outbox (
  id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES campaigns(id),
  sequence bigint NOT NULL,
  revision bigint NOT NULL,
  type text NOT NULL,
  data jsonb NOT NULL,
  delivery_token text,
  lease_expires_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id,sequence)
);
CREATE INDEX outbox_pending ON outbox(created_at) WHERE published_at IS NULL;
