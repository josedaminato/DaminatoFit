-- Phase 1: identity, tenancy, roles and RLS (fail closed).
-- Applied by apps/api migrate runner as the migrator role (DB owner).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS app;

-- ---------------------------------------------------------------------------
-- Roles (local passwords are throwaway; production must rotate them)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_user_dev' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
    CREATE ROLE app_admin LOGIN PASSWORD 'app_admin_dev' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_worker') THEN
    CREATE ROLE app_worker LOGIN PASSWORD 'app_worker_dev' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_backup') THEN
    CREATE ROLE app_backup LOGIN PASSWORD 'app_backup_dev' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

ALTER ROLE app_user NOBYPASSRLS;
ALTER ROLE app_admin NOBYPASSRLS;
ALTER ROLE app_worker NOBYPASSRLS;
ALTER ROLE app_backup NOBYPASSRLS;

-- ---------------------------------------------------------------------------
-- Context helpers (NULL when unset → policies fail closed)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.current_realm() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.realm', true), '')
$$;

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.current_membership_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.membership_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.current_role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.role', true), '')
$$;

CREATE OR REPLACE FUNCTION app.is_authenticated() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.current_user_id() IS NOT NULL AND app.current_realm() IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION app.is_tenant_owner() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.current_role() = 'owner' AND app.current_tenant_id() IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION app.is_tenant_student() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.current_role() = 'student' AND app.current_membership_id() IS NOT NULL
$$;

REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO app_user, app_admin, app_worker, app_backup;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO app_user, app_admin, app_worker, app_backup;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  distribution text NOT NULL CHECK (distribution IN ('platform', 'standalone')),
  realm text NOT NULL,
  max_tenants integer CHECK (max_tenants IS NULL OR max_tenants > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  realm text NOT NULL,
  auth_user_id uuid NOT NULL,
  display_name text NOT NULL,
  avatar_media_id uuid,
  platform_role text NOT NULL DEFAULT 'user' CHECK (platform_role IN ('user', 'platform_admin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_realm_auth_user_id_uq UNIQUE (realm, auth_user_id)
);

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands (id),
  kind text NOT NULL DEFAULT 'trainer' CHECK (kind IN ('trainer', 'gym', 'provider')),
  name text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES users (id),
  branding jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_quota_bytes bigint,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  user_id uuid NOT NULL REFERENCES users (id),
  role text NOT NULL CHECK (role IN ('owner', 'student', 'trainer')),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'paused', 'archived')),
  activated_at timestamptz,
  deactivated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memberships_tenant_user_uq UNIQUE (tenant_id, user_id)
);

CREATE TABLE membership_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  membership_id uuid NOT NULL REFERENCES memberships (id),
  from_status text,
  to_status text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES users (id)
);

CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  email text NOT NULL,
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'trainer')),
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE trainer_profiles (
  tenant_id uuid PRIMARY KEY REFERENCES tenants (id),
  display_name text NOT NULL,
  bio text,
  whatsapp_e164 text,
  avatar_media_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  author_user_id uuid NOT NULL REFERENCES users (id),
  title text NOT NULL,
  body text NOT NULL,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE announcement_reads (
  announcement_id uuid NOT NULL REFERENCES announcements (id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES memberships (id),
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, membership_id)
);

CREATE TABLE direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  sender_user_id uuid NOT NULL REFERENCES users (id),
  recipient_membership_id uuid NOT NULL REFERENCES memberships (id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  archived_at timestamptz
);

CREATE TABLE muscle_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants (id),
  actor_user_id uuid REFERENCES users (id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX memberships_user_id_idx ON memberships (user_id);
CREATE INDEX memberships_tenant_status_idx ON memberships (tenant_id, status);
CREATE INDEX membership_events_membership_idx ON membership_events (membership_id, occurred_at);
CREATE INDEX announcements_tenant_published_idx ON announcements (tenant_id, published_at);
CREATE INDEX direct_messages_recipient_idx ON direct_messages (recipient_membership_id);
CREATE INDEX audit_logs_tenant_created_idx ON audit_logs (tenant_id, created_at);

-- ---------------------------------------------------------------------------
-- Integrity: realm alignment and brand max_tenants
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_membership_realm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  user_realm text;
  brand_realm text;
BEGIN
  SELECT u.realm INTO user_realm FROM users u WHERE u.id = NEW.user_id;
  SELECT b.realm INTO brand_realm
  FROM tenants t
  JOIN brands b ON b.id = t.brand_id
  WHERE t.id = NEW.tenant_id;

  IF user_realm IS DISTINCT FROM brand_realm THEN
    RAISE EXCEPTION 'membership realm mismatch: user=% brand=%', user_realm, brand_realm
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER memberships_realm_check
  BEFORE INSERT OR UPDATE OF tenant_id, user_id ON memberships
  FOR EACH ROW EXECUTE FUNCTION app.enforce_membership_realm();

CREATE OR REPLACE FUNCTION app.enforce_tenant_owner_realm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  owner_realm text;
  brand_realm text;
  tenant_count integer;
  max_allowed integer;
BEGIN
  SELECT u.realm INTO owner_realm FROM users u WHERE u.id = NEW.owner_user_id;
  SELECT b.realm, b.max_tenants INTO brand_realm, max_allowed
  FROM brands b WHERE b.id = NEW.brand_id;

  IF owner_realm IS DISTINCT FROM brand_realm THEN
    RAISE EXCEPTION 'tenant owner realm mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' AND max_allowed IS NOT NULL THEN
    SELECT count(*) INTO tenant_count FROM tenants WHERE brand_id = NEW.brand_id;
    IF tenant_count >= max_allowed THEN
      RAISE EXCEPTION 'brand max_tenants exceeded'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tenants_realm_and_cap_check
  BEFORE INSERT OR UPDATE OF brand_id, owner_user_id ON tenants
  FOR EACH ROW EXECUTE FUNCTION app.enforce_tenant_owner_realm();

CREATE OR REPLACE FUNCTION app.prevent_membership_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'membership_events are immutable'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER membership_events_immutable
  BEFORE UPDATE OR DELETE ON membership_events
  FOR EACH ROW EXECUTE FUNCTION app.prevent_membership_event_mutation();

CREATE OR REPLACE FUNCTION app.prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION app.prevent_audit_log_mutation();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_user, app_admin, app_worker, app_backup;
-- DDL stays with the migrator / owner only.
REVOKE CREATE ON SCHEMA public FROM app_user, app_admin, app_worker, app_backup;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  brands, users, tenants, memberships, membership_events, invitations,
  trainer_profiles, announcements, announcement_reads, direct_messages,
  muscle_groups, audit_logs
TO app_user, app_admin, app_worker;

GRANT SELECT ON
  brands, users, tenants, memberships, membership_events, invitations,
  trainer_profiles, announcements, announcement_reads, direct_messages,
  muscle_groups, audit_logs
TO app_backup;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands FORCE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE membership_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_events FORCE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE trainer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements FORCE ROW LEVEL SECURITY;
ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_reads FORCE ROW LEVEL SECURITY;
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE muscle_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE muscle_groups FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- brands: authenticated users read brands of their realm; writes reserved to app_admin role
CREATE POLICY brands_select_realm ON brands
  FOR SELECT TO app_user, app_worker
  USING (app.is_authenticated() AND realm = app.current_realm());

CREATE POLICY brands_admin_all ON brands
  FOR ALL TO app_admin
  USING (true)
  WITH CHECK (true);

-- users: self + limited peer visibility inside same active tenant
CREATE POLICY users_select_self_or_peer ON users
  FOR SELECT TO app_user, app_worker
  USING (
    app.is_authenticated()
    AND realm = app.current_realm()
    AND (
      id = app.current_user_id()
      OR EXISTS (
        SELECT 1
        FROM memberships me_self
        JOIN memberships me_peer ON me_peer.tenant_id = me_self.tenant_id
        WHERE me_self.user_id = app.current_user_id()
          AND me_self.status = 'active'
          AND me_peer.user_id = users.id
          AND me_peer.status = 'active'
          AND me_self.tenant_id = COALESCE(app.current_tenant_id(), me_self.tenant_id)
      )
    )
  );

CREATE POLICY users_update_self ON users
  FOR UPDATE TO app_user
  USING (id = app.current_user_id() AND realm = app.current_realm())
  WITH CHECK (id = app.current_user_id() AND realm = app.current_realm());

CREATE OR REPLACE FUNCTION app.prevent_platform_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.platform_role IS DISTINCT FROM OLD.platform_role AND current_user = 'app_user' THEN
    RAISE EXCEPTION 'platform_role cannot be changed by app_user'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_no_role_escalation
  BEFORE UPDATE OF platform_role ON users
  FOR EACH ROW EXECUTE FUNCTION app.prevent_platform_role_escalation();

CREATE POLICY users_admin_all ON users
  FOR ALL TO app_admin
  USING (true)
  WITH CHECK (true);

-- tenants
CREATE POLICY tenants_select_member ON tenants
  FOR SELECT TO app_user, app_worker
  USING (
    app.is_authenticated()
    AND id = app.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM brands b
      WHERE b.id = tenants.brand_id AND b.realm = app.current_realm()
    )
  );

CREATE POLICY tenants_owner_update ON tenants
  FOR UPDATE TO app_user
  USING (id = app.current_tenant_id() AND app.is_tenant_owner())
  WITH CHECK (id = app.current_tenant_id() AND app.is_tenant_owner());

CREATE POLICY tenants_insert_owner ON tenants
  FOR INSERT TO app_user
  WITH CHECK (
    app.is_authenticated()
    AND owner_user_id = app.current_user_id()
    AND EXISTS (
      SELECT 1 FROM brands b
      WHERE b.id = brand_id AND b.realm = app.current_realm()
    )
  );

CREATE POLICY tenants_admin_all ON tenants
  FOR ALL TO app_admin
  USING (true)
  WITH CHECK (true);

-- memberships
CREATE POLICY memberships_select ON memberships
  FOR SELECT TO app_user, app_worker
  USING (
    tenant_id = app.current_tenant_id()
    AND (
      app.is_tenant_owner()
      OR id = app.current_membership_id()
      OR user_id = app.current_user_id()
    )
  );

CREATE POLICY memberships_owner_write ON memberships
  FOR ALL TO app_user
  USING (tenant_id = app.current_tenant_id() AND app.is_tenant_owner())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.is_tenant_owner());

CREATE POLICY memberships_admin_all ON memberships
  FOR ALL TO app_admin
  USING (true)
  WITH CHECK (true);

-- membership_events
CREATE POLICY membership_events_select ON membership_events
  FOR SELECT TO app_user, app_worker
  USING (
    tenant_id = app.current_tenant_id()
    AND (
      app.is_tenant_owner()
      OR membership_id = app.current_membership_id()
    )
  );

CREATE POLICY membership_events_owner_insert ON membership_events
  FOR INSERT TO app_user
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.is_tenant_owner());

CREATE POLICY membership_events_admin_select ON membership_events
  FOR SELECT TO app_admin
  USING (true);

CREATE POLICY membership_events_admin_insert ON membership_events
  FOR INSERT TO app_admin
  WITH CHECK (true);

-- invitations (owner only within tenant)
CREATE POLICY invitations_owner_all ON invitations
  FOR ALL TO app_user
  USING (tenant_id = app.current_tenant_id() AND app.is_tenant_owner())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.is_tenant_owner());

CREATE POLICY invitations_admin_all ON invitations
  FOR ALL TO app_admin
  USING (true)
  WITH CHECK (true);

-- trainer_profiles: owner writes; active members of the tenant can read
CREATE POLICY trainer_profiles_select ON trainer_profiles
  FOR SELECT TO app_user, app_worker
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY trainer_profiles_owner_write ON trainer_profiles
  FOR ALL TO app_user
  USING (tenant_id = app.current_tenant_id() AND app.is_tenant_owner())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.is_tenant_owner());

CREATE POLICY trainer_profiles_admin_all ON trainer_profiles
  FOR ALL TO app_admin
  USING (true)
  WITH CHECK (true);

-- announcements
CREATE POLICY announcements_select ON announcements
  FOR SELECT TO app_user, app_worker
  USING (
    tenant_id = app.current_tenant_id()
    AND (
      app.is_tenant_owner()
      OR (app.is_tenant_student() AND published_at IS NOT NULL AND archived_at IS NULL)
    )
  );

CREATE POLICY announcements_owner_write ON announcements
  FOR ALL TO app_user
  USING (tenant_id = app.current_tenant_id() AND app.is_tenant_owner())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.is_tenant_owner());

CREATE POLICY announcements_admin_all ON announcements
  FOR ALL TO app_admin
  USING (true)
  WITH CHECK (true);

-- announcement_reads
CREATE POLICY announcement_reads_select ON announcement_reads
  FOR SELECT TO app_user
  USING (
    EXISTS (
      SELECT 1 FROM announcements a
      WHERE a.id = announcement_id AND a.tenant_id = app.current_tenant_id()
    )
    AND (
      app.is_tenant_owner()
      OR membership_id = app.current_membership_id()
    )
  );

CREATE POLICY announcement_reads_student_insert ON announcement_reads
  FOR INSERT TO app_user
  WITH CHECK (
    membership_id = app.current_membership_id()
    AND EXISTS (
      SELECT 1 FROM announcements a
      WHERE a.id = announcement_id AND a.tenant_id = app.current_tenant_id()
    )
  );

CREATE POLICY announcement_reads_admin_all ON announcement_reads
  FOR ALL TO app_admin
  USING (true)
  WITH CHECK (true);

-- direct_messages: private to recipient student; owner of tenant can manage
CREATE POLICY direct_messages_select ON direct_messages
  FOR SELECT TO app_user, app_worker
  USING (
    tenant_id = app.current_tenant_id()
    AND (
      app.is_tenant_owner()
      OR recipient_membership_id = app.current_membership_id()
    )
  );

CREATE POLICY direct_messages_owner_insert ON direct_messages
  FOR INSERT TO app_user
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    AND app.is_tenant_owner()
    AND sender_user_id = app.current_user_id()
  );

CREATE POLICY direct_messages_owner_update ON direct_messages
  FOR UPDATE TO app_user
  USING (tenant_id = app.current_tenant_id() AND app.is_tenant_owner())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.is_tenant_owner());

CREATE POLICY direct_messages_student_update_read ON direct_messages
  FOR UPDATE TO app_user
  USING (
    tenant_id = app.current_tenant_id()
    AND recipient_membership_id = app.current_membership_id()
  )
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    AND recipient_membership_id = app.current_membership_id()
  );

CREATE POLICY direct_messages_admin_all ON direct_messages
  FOR ALL TO app_admin
  USING (true)
  WITH CHECK (true);

-- muscle_groups: global catalogue
CREATE POLICY muscle_groups_select_auth ON muscle_groups
  FOR SELECT TO app_user, app_worker, app_admin
  USING (app.is_authenticated() OR current_user = 'app_admin');

CREATE POLICY muscle_groups_admin_write ON muscle_groups
  FOR ALL TO app_admin
  USING (true)
  WITH CHECK (true);

-- audit_logs: insert by actors; select owner of tenant or admin
CREATE POLICY audit_logs_owner_select ON audit_logs
  FOR SELECT TO app_user
  USING (tenant_id = app.current_tenant_id() AND app.is_tenant_owner());

CREATE POLICY audit_logs_insert ON audit_logs
  FOR INSERT TO app_user, app_worker, app_admin
  WITH CHECK (
    actor_user_id = app.current_user_id()
    OR current_user IN ('app_admin', 'app_worker')
  );

CREATE POLICY audit_logs_admin_select ON audit_logs
  FOR SELECT TO app_admin
  USING (true);
