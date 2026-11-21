-- Phase 2: Better Auth schemas per realm + invitation revocation.
-- Better Auth user ids are opaque text strings, not UUIDs.

ALTER TABLE users
  ALTER COLUMN auth_user_id TYPE text USING auth_user_id::text;

INSERT INTO brands (slug, name, distribution, realm, max_tenants, status)
VALUES
  ('daminatofit', 'DaminatoFit', 'platform', 'daminatofit', NULL, 'active'),
  ('pupiapp', 'PupiApp', 'standalone', 'pupiapp', 1, 'active')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS invitations_active_email_tenant_uq
  ON invitations (tenant_id, lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- Better Auth: auth_daminatofit
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth_daminatofit;

CREATE TABLE auth_daminatofit."user" (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_daminatofit.session (
  id text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  user_id text NOT NULL REFERENCES auth_daminatofit."user" (id) ON DELETE CASCADE
);

CREATE TABLE auth_daminatofit.account (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id text NOT NULL REFERENCES auth_daminatofit."user" (id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_daminatofit.verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_daminatofit_session_user_id_idx ON auth_daminatofit.session (user_id);
CREATE INDEX auth_daminatofit_account_user_id_idx ON auth_daminatofit.account (user_id);

-- ---------------------------------------------------------------------------
-- Better Auth: auth_pupiapp
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth_pupiapp;

CREATE TABLE auth_pupiapp."user" (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_pupiapp.session (
  id text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  user_id text NOT NULL REFERENCES auth_pupiapp."user" (id) ON DELETE CASCADE
);

CREATE TABLE auth_pupiapp.account (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id text NOT NULL REFERENCES auth_pupiapp."user" (id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_pupiapp.verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_pupiapp_session_user_id_idx ON auth_pupiapp.session (user_id);
CREATE INDEX auth_pupiapp_account_user_id_idx ON auth_pupiapp.account (user_id);

-- Migrator owns auth schemas; API role can read/write auth tables for Better Auth runtime.
GRANT USAGE ON SCHEMA auth_daminatofit, auth_pupiapp TO app_user, app_admin, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth_daminatofit TO app_user, app_admin, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth_pupiapp TO app_user, app_admin, app_worker;

-- Better Auth connections use the migrator URL locally; keep grants for future app-role usage.
ALTER DEFAULT PRIVILEGES IN SCHEMA auth_daminatofit
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user, app_admin, app_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth_pupiapp
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user, app_admin, app_worker;

-- ---------------------------------------------------------------------------
-- Privileged onboarding helpers (API connects as app_user; these are audited)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.provision_trainer(
  p_realm text,
  p_auth_user_id text,
  p_display_name text,
  p_brand_slug text,
  p_business_name text
) RETURNS TABLE (user_id uuid, tenant_id uuid, membership_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_tenant_id uuid;
  v_membership_id uuid;
  v_brand_id uuid;
BEGIN
  SELECT b.id INTO v_brand_id
  FROM brands b
  WHERE b.slug = p_brand_slug AND b.realm = p_realm AND b.status = 'active';
  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'brand_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT u.id INTO v_user_id
  FROM users u
  WHERE u.realm = p_realm AND u.auth_user_id = p_auth_user_id;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO users (id, realm, auth_user_id, display_name, platform_role, status)
    VALUES (v_user_id, p_realm, p_auth_user_id, p_display_name, 'user', 'active');
  END IF;

  IF EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.user_id = v_user_id AND m.role = 'owner' AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'trainer_already_provisioned' USING ERRCODE = '23505';
  END IF;

  v_tenant_id := gen_random_uuid();
  v_membership_id := gen_random_uuid();

  INSERT INTO tenants (id, brand_id, kind, name, owner_user_id, status)
  VALUES (v_tenant_id, v_brand_id, 'trainer', p_business_name, v_user_id, 'active');

  INSERT INTO memberships (id, tenant_id, user_id, role, status, activated_at)
  VALUES (v_membership_id, v_tenant_id, v_user_id, 'owner', 'active', now());

  INSERT INTO membership_events (tenant_id, membership_id, from_status, to_status, actor_user_id)
  VALUES (v_tenant_id, v_membership_id, NULL, 'active', v_user_id);

  INSERT INTO trainer_profiles (tenant_id, display_name)
  VALUES (v_tenant_id, p_display_name);

  user_id := v_user_id;
  tenant_id := v_tenant_id;
  membership_id := v_membership_id;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION app.ensure_domain_user(
  p_realm text,
  p_auth_user_id text,
  p_display_name text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT u.id INTO v_user_id
  FROM users u
  WHERE u.realm = p_realm AND u.auth_user_id = p_auth_user_id;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO users (id, realm, auth_user_id, display_name, platform_role, status)
    VALUES (v_user_id, p_realm, p_auth_user_id, p_display_name, 'user', 'active');
  END IF;

  RETURN v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.accept_invitation(
  p_token_hash text,
  p_realm text,
  p_auth_user_id text,
  p_display_name text,
  p_email text
) RETURNS TABLE (user_id uuid, tenant_id uuid, membership_id uuid, invitation_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inv invitations%ROWTYPE;
  v_user_id uuid;
  v_membership_id uuid;
  v_brand_realm text;
BEGIN
  SELECT * INTO v_inv
  FROM invitations i
  WHERE i.token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_inv.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'invitation_revoked' USING ERRCODE = '22000';
  END IF;
  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'invitation_already_used' USING ERRCODE = '22000';
  END IF;
  IF v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'invitation_expired' USING ERRCODE = '22000';
  END IF;
  IF lower(v_inv.email) <> lower(p_email) THEN
    RAISE EXCEPTION 'invitation_email_mismatch' USING ERRCODE = '22000';
  END IF;

  SELECT b.realm INTO v_brand_realm
  FROM tenants t
  JOIN brands b ON b.id = t.brand_id
  WHERE t.id = v_inv.tenant_id;

  IF v_brand_realm IS DISTINCT FROM p_realm THEN
    RAISE EXCEPTION 'invitation_realm_mismatch' USING ERRCODE = '22000';
  END IF;

  v_user_id := app.ensure_domain_user(p_realm, p_auth_user_id, p_display_name);

  IF EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.tenant_id = v_inv.tenant_id AND m.user_id = v_user_id
  ) THEN
    SELECT m.id INTO v_membership_id
    FROM memberships m
    WHERE m.tenant_id = v_inv.tenant_id AND m.user_id = v_user_id;
    UPDATE memberships
    SET status = 'active', activated_at = COALESCE(activated_at, now()), updated_at = now()
    WHERE id = v_membership_id;
  ELSE
    v_membership_id := gen_random_uuid();
    INSERT INTO memberships (id, tenant_id, user_id, role, status, activated_at)
    VALUES (v_membership_id, v_inv.tenant_id, v_user_id, v_inv.role, 'active', now());
  END IF;

  INSERT INTO membership_events (tenant_id, membership_id, from_status, to_status, actor_user_id)
  VALUES (v_inv.tenant_id, v_membership_id, 'invited', 'active', v_user_id);

  UPDATE invitations
  SET accepted_at = now(), updated_at = now()
  WHERE id = v_inv.id;

  user_id := v_user_id;
  tenant_id := v_inv.tenant_id;
  membership_id := v_membership_id;
  invitation_id := v_inv.id;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION app.resolve_domain_user(
  p_realm text,
  p_auth_user_id text
) RETURNS TABLE (
  id uuid,
  realm text,
  auth_user_id text,
  display_name text,
  platform_role text,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.id, u.realm, u.auth_user_id, u.display_name, u.platform_role, u.status
  FROM users u
  WHERE u.realm = p_realm
    AND u.auth_user_id = p_auth_user_id
    AND u.deleted_at IS NULL
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.list_memberships_for_user(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  role text,
  status text,
  tenant_name text,
  brand_slug text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.id, m.tenant_id, m.role, m.status, t.name, b.slug
  FROM memberships m
  JOIN tenants t ON t.id = m.tenant_id
  JOIN brands b ON b.id = t.brand_id
  WHERE m.user_id = p_user_id AND m.status = 'active'
$$;

REVOKE ALL ON FUNCTION app.provision_trainer(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.ensure_domain_user(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.accept_invitation(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_domain_user(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.list_memberships_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.provision_trainer(text, text, text, text, text) TO app_user, app_admin;
GRANT EXECUTE ON FUNCTION app.ensure_domain_user(text, text, text) TO app_user, app_admin;
GRANT EXECUTE ON FUNCTION app.accept_invitation(text, text, text, text, text) TO app_user, app_admin;
GRANT EXECUTE ON FUNCTION app.resolve_domain_user(text, text) TO app_user, app_admin;
GRANT EXECUTE ON FUNCTION app.list_memberships_for_user(uuid) TO app_user, app_admin;
