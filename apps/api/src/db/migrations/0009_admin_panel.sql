-- Phase 7: platform admin panel foundations (DaminatoFit only).
-- Platform admins are users.platform_role = platform_admin in realm daminatofit.
-- Tenant pause/archive is the operational suspension for trainers (preserves history).
-- PupiApp metrics stay out of commercial DaminatoFit aggregates.

-- ---------------------------------------------------------------------------
-- Commercial rule versions (estimated pricing — not charged amounts)
-- ---------------------------------------------------------------------------
CREATE TABLE commercial_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE CHECK (version >= 1),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  price_cents_per_billable_student integer NOT NULL CHECK (price_cents_per_billable_student >= 0),
  monthly_cap_cents integer NOT NULL CHECK (monthly_cap_cents >= 0),
  billable_basis text NOT NULL DEFAULT 'active_student_memberships_simulation',
  note text NOT NULL DEFAULT '',
  created_by_user_id uuid REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  effective_from timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX commercial_rule_versions_effective_idx
  ON commercial_rule_versions (effective_from DESC);

INSERT INTO commercial_rule_versions (
  version, currency, price_cents_per_billable_student, monthly_cap_cents,
  billable_basis, note
) VALUES (
  1, 'USD', 200, 2000,
  'active_student_memberships_simulation',
  'Initial estimate rule: USD 2 per simulated billable student, capped at USD 20. Not charged.'
);

-- ---------------------------------------------------------------------------
-- Referral ledger (architecture only — no automatic discounts)
-- ---------------------------------------------------------------------------
CREATE TABLE referral_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_tenant_id uuid NOT NULL REFERENCES tenants (id),
  referred_tenant_id uuid NOT NULL REFERENCES tenants (id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'valid', 'rejected', 'expired')),
  attributed_month date NOT NULL,
  validated_at timestamptz,
  validation_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referred_tenant_id)
);

CREATE INDEX referral_attributions_referrer_month_idx
  ON referral_attributions (referrer_tenant_id, attributed_month);

COMMENT ON TABLE referral_attributions IS
  'Referral architecture stub. Automatic discounts stay disabled until validation rules exist.';

-- ---------------------------------------------------------------------------
-- Platform admin audit (immutable; not writable via app_user policies)
-- ---------------------------------------------------------------------------
CREATE TABLE platform_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users (id),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  result text NOT NULL CHECK (result IN ('success', 'denied', 'error')),
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_admin_audit_no_secrets CHECK (
    NOT (metadata ? 'password'
      OR metadata ? 'token'
      OR metadata ? 'cookie'
      OR metadata ? 'secret'
      OR metadata ? 'authorization')
  )
);

CREATE INDEX platform_admin_audit_created_idx
  ON platform_admin_audit (created_at DESC);
CREATE INDEX platform_admin_audit_actor_idx
  ON platform_admin_audit (actor_user_id, created_at DESC);
CREATE INDEX platform_admin_audit_action_idx
  ON platform_admin_audit (action, created_at DESC);

CREATE OR REPLACE FUNCTION app.prevent_platform_admin_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'platform_admin_audit is append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER platform_admin_audit_immutable
  BEFORE UPDATE OR DELETE ON platform_admin_audit
  FOR EACH ROW EXECUTE FUNCTION app.prevent_platform_admin_audit_mutation();

-- ---------------------------------------------------------------------------
-- Daily metric snapshots (forward-looking history; no fabricated past)
-- ---------------------------------------------------------------------------
CREATE TABLE platform_metric_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_slug text NOT NULL CHECK (brand_slug = 'daminatofit'),
  snapshot_date date NOT NULL,
  trainers_total integer NOT NULL DEFAULT 0,
  trainers_active integer NOT NULL DEFAULT 0,
  trainers_paused integer NOT NULL DEFAULT 0,
  trainers_archived integer NOT NULL DEFAULT 0,
  unique_students integer NOT NULL DEFAULT 0,
  memberships_active integer NOT NULL DEFAULT 0,
  memberships_inactive integer NOT NULL DEFAULT 0,
  routines_created integer NOT NULL DEFAULT 0,
  routines_assigned integer NOT NULL DEFAULT 0,
  sessions_completed integer NOT NULL DEFAULT 0,
  sessions_abandoned integer NOT NULL DEFAULT 0,
  storage_bytes bigint NOT NULL DEFAULT 0,
  video_count integer NOT NULL DEFAULT 0,
  logo_count integer NOT NULL DEFAULT 0,
  estimated_monthly_cents integer NOT NULL DEFAULT 0,
  commercial_rule_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_slug, snapshot_date)
);

CREATE INDEX platform_metric_snapshots_date_idx
  ON platform_metric_snapshots (snapshot_date DESC);

-- ---------------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------------
GRANT SELECT ON commercial_rule_versions, referral_attributions,
  platform_admin_audit, platform_metric_snapshots
  TO app_user, app_backup;
GRANT SELECT, INSERT, UPDATE, DELETE ON commercial_rule_versions, referral_attributions,
  platform_admin_audit, platform_metric_snapshots
  TO app_admin, app_worker;

-- app_user may SELECT commercial rules (public estimate parameters) via policy.
-- Admin audit and snapshots: no app_user policies → invisible under FORCE RLS.
-- referral_attributions: no app_user policy → invisible.

ALTER TABLE commercial_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_rule_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE referral_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_attributions FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_admin_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admin_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_metric_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_metric_snapshots FORCE ROW LEVEL SECURITY;

CREATE POLICY commercial_rule_versions_authenticated_select ON commercial_rule_versions
  FOR SELECT TO app_user
  USING (app.is_authenticated());

CREATE POLICY commercial_rule_versions_admin_all ON commercial_rule_versions
  FOR ALL TO app_admin
  USING (true) WITH CHECK (true);

CREATE POLICY referral_attributions_admin_all ON referral_attributions
  FOR ALL TO app_admin
  USING (true) WITH CHECK (true);

CREATE POLICY platform_admin_audit_admin_select ON platform_admin_audit
  FOR SELECT TO app_admin
  USING (true);

CREATE POLICY platform_admin_audit_admin_insert ON platform_admin_audit
  FOR INSERT TO app_admin
  WITH CHECK (true);

CREATE POLICY platform_metric_snapshots_admin_all ON platform_metric_snapshots
  FOR ALL TO app_admin
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM users u
    WHERE u.id = NULLIF(current_setting('app.user_id', true), '')::uuid
      AND u.realm = 'daminatofit'
      AND u.platform_role = 'platform_admin'
      AND u.status = 'active'
      AND u.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION app.write_platform_admin_audit(
  p_actor_user_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id uuid,
  p_result text,
  p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_action IS NULL OR length(trim(p_action)) = 0 THEN
    RAISE EXCEPTION 'action required' USING ERRCODE = '22023';
  END IF;
  IF p_result NOT IN ('success', 'denied', 'error') THEN
    RAISE EXCEPTION 'invalid result' USING ERRCODE = '22023';
  END IF;
  IF p_metadata ? 'password' OR p_metadata ? 'token' OR p_metadata ? 'cookie'
     OR p_metadata ? 'secret' OR p_metadata ? 'authorization' THEN
    RAISE EXCEPTION 'metadata must not contain secrets' USING ERRCODE = '22023';
  END IF;

  INSERT INTO platform_admin_audit (
    actor_user_id, action, resource_type, resource_id, result, reason, metadata
  ) VALUES (
    p_actor_user_id, trim(p_action), trim(p_resource_type), p_resource_id,
    p_result, NULLIF(trim(COALESCE(p_reason, '')), ''), COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.grant_platform_admin(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_realm text;
  v_status text;
  v_deleted timestamptz;
BEGIN
  -- Only table owner / migrator should execute this (REVOKE from app_user).
  SELECT realm, status, deleted_at INTO v_realm, v_status, v_deleted
  FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_realm IS DISTINCT FROM 'daminatofit' THEN
    RAISE EXCEPTION 'platform admins must belong to daminatofit realm'
      USING ERRCODE = '23514';
  END IF;
  IF v_deleted IS NOT NULL OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'user must be active' USING ERRCODE = '23514';
  END IF;
  UPDATE users SET platform_role = 'platform_admin', updated_at = now() WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.admin_set_tenant_status(
  p_actor_user_id uuid,
  p_tenant_id uuid,
  p_status text,
  p_reason text
)
RETURNS TABLE (tenant_id uuid, previous_status text, new_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_role text;
  v_actor_status text;
  v_actor_deleted timestamptz;
  v_brand text;
  v_prev text;
  v_owner uuid;
BEGIN
  IF p_status NOT IN ('active', 'paused', 'archived') THEN
    RAISE EXCEPTION 'invalid tenant status' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
  END IF;

  SELECT platform_role, status, deleted_at
  INTO v_actor_role, v_actor_status, v_actor_deleted
  FROM users WHERE id = p_actor_user_id;

  IF v_actor_role IS DISTINCT FROM 'platform_admin'
     OR v_actor_status IS DISTINCT FROM 'active'
     OR v_actor_deleted IS NOT NULL THEN
    PERFORM app.write_platform_admin_audit(
      p_actor_user_id, 'tenant.status_change', 'tenant', p_tenant_id, 'denied', p_reason,
      jsonb_build_object('attemptedStatus', p_status)
    );
    RAISE EXCEPTION 'platform admin required' USING ERRCODE = '42501';
  END IF;

  SELECT t.status, t.owner_user_id, b.slug
  INTO v_prev, v_owner, v_brand
  FROM tenants t
  JOIN brands b ON b.id = t.brand_id
  WHERE t.id = p_tenant_id
  FOR UPDATE OF t;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_brand IS DISTINCT FROM 'daminatofit' THEN
    PERFORM app.write_platform_admin_audit(
      p_actor_user_id, 'tenant.status_change', 'tenant', p_tenant_id, 'denied', p_reason,
      jsonb_build_object('brand', v_brand)
    );
    RAISE EXCEPTION 'admin panel manages daminatofit tenants only'
      USING ERRCODE = '23514';
  END IF;

  IF v_owner = p_actor_user_id THEN
    PERFORM app.write_platform_admin_audit(
      p_actor_user_id, 'tenant.status_change', 'tenant', p_tenant_id, 'denied', p_reason,
      jsonb_build_object('reasonCode', 'cannot_modify_own_trainer_tenant')
    );
    RAISE EXCEPTION 'cannot change status of own trainer tenant'
      USING ERRCODE = '23514';
  END IF;

  IF v_prev = p_status THEN
    tenant_id := p_tenant_id;
    previous_status := v_prev;
    new_status := v_prev;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE tenants SET status = p_status, updated_at = now() WHERE id = p_tenant_id;

  PERFORM app.write_platform_admin_audit(
    p_actor_user_id, 'tenant.status_change', 'tenant', p_tenant_id, 'success', p_reason,
    jsonb_build_object('from', v_prev, 'to', p_status)
  );

  tenant_id := p_tenant_id;
  previous_status := v_prev;
  new_status := p_status;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION app.capture_daminatofit_metric_snapshot(p_day date DEFAULT (timezone('utc', now()))::date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_brand uuid;
  v_rule_version integer;
  v_price integer;
  v_cap integer;
  v_id uuid;
  v_sim_students integer;
BEGIN
  SELECT id INTO v_brand FROM brands WHERE slug = 'daminatofit';
  IF v_brand IS NULL THEN
    RAISE EXCEPTION 'daminatofit brand missing' USING ERRCODE = 'P0002';
  END IF;

  SELECT version, price_cents_per_billable_student, monthly_cap_cents
  INTO v_rule_version, v_price, v_cap
  FROM commercial_rule_versions
  ORDER BY version DESC
  LIMIT 1;

  SELECT COALESCE(SUM(active_students), 0)::int INTO v_sim_students
  FROM (
    SELECT t.id, COUNT(m.id) FILTER (WHERE m.role = 'student' AND m.status = 'active')::int AS active_students
    FROM tenants t
    LEFT JOIN memberships m ON m.tenant_id = t.id
    WHERE t.brand_id = v_brand AND t.status = 'active'
    GROUP BY t.id
  ) per_tenant;

  INSERT INTO platform_metric_snapshots AS s (
    brand_slug, snapshot_date,
    trainers_total, trainers_active, trainers_paused, trainers_archived,
    unique_students, memberships_active, memberships_inactive,
    routines_created, routines_assigned,
    sessions_completed, sessions_abandoned,
    storage_bytes, video_count, logo_count,
    estimated_monthly_cents, commercial_rule_version
  )
  SELECT
    'daminatofit',
    p_day,
    (SELECT count(*)::int FROM tenants WHERE brand_id = v_brand),
    (SELECT count(*)::int FROM tenants WHERE brand_id = v_brand AND status = 'active'),
    (SELECT count(*)::int FROM tenants WHERE brand_id = v_brand AND status = 'paused'),
    (SELECT count(*)::int FROM tenants WHERE brand_id = v_brand AND status = 'archived'),
    (
      SELECT count(DISTINCT m.user_id)::int
      FROM memberships m
      JOIN tenants t ON t.id = m.tenant_id
      WHERE t.brand_id = v_brand AND m.role = 'student'
    ),
    (
      SELECT count(*)::int
      FROM memberships m
      JOIN tenants t ON t.id = m.tenant_id
      WHERE t.brand_id = v_brand AND m.role = 'student' AND m.status = 'active'
    ),
    (
      SELECT count(*)::int
      FROM memberships m
      JOIN tenants t ON t.id = m.tenant_id
      WHERE t.brand_id = v_brand AND m.role = 'student' AND m.status <> 'active'
    ),
    (
      SELECT count(*)::int
      FROM routine_plans rp
      JOIN tenants t ON t.id = rp.tenant_id
      WHERE t.brand_id = v_brand
    ),
    (
      SELECT count(*)::int
      FROM routine_plans rp2
      JOIN tenants t ON t.id = rp2.tenant_id
      WHERE t.brand_id = v_brand AND rp2.kind = 'assigned'
    ),
    (
      SELECT count(*)::int
      FROM workout_sessions ws
      JOIN tenants t ON t.id = ws.tenant_id
      WHERE t.brand_id = v_brand AND ws.status = 'completed'
    ),
    (
      SELECT count(*)::int
      FROM workout_sessions ws
      JOIN tenants t ON t.id = ws.tenant_id
      WHERE t.brand_id = v_brand AND ws.status = 'abandoned'
    ),
    (
      SELECT COALESCE(SUM(u.storage_bytes), 0)
      FROM tenant_usage u
      JOIN tenants t ON t.id = u.tenant_id
      WHERE t.brand_id = v_brand
    ),
    (
      SELECT count(*)::int
      FROM media_assets ma
      JOIN tenants t ON t.id = ma.tenant_id
      WHERE t.brand_id = v_brand AND ma.kind = 'video' AND ma.status = 'ready'
    ),
    (
      SELECT count(*)::int
      FROM tenants t
      WHERE t.brand_id = v_brand AND t.logo_media_id IS NOT NULL
    ),
    LEAST(v_sim_students * v_price, v_cap),
    v_rule_version
  ON CONFLICT (brand_slug, snapshot_date) DO UPDATE SET
    trainers_total = EXCLUDED.trainers_total,
    trainers_active = EXCLUDED.trainers_active,
    trainers_paused = EXCLUDED.trainers_paused,
    trainers_archived = EXCLUDED.trainers_archived,
    unique_students = EXCLUDED.unique_students,
    memberships_active = EXCLUDED.memberships_active,
    memberships_inactive = EXCLUDED.memberships_inactive,
    routines_created = EXCLUDED.routines_created,
    routines_assigned = EXCLUDED.routines_assigned,
    sessions_completed = EXCLUDED.sessions_completed,
    sessions_abandoned = EXCLUDED.sessions_abandoned,
    storage_bytes = EXCLUDED.storage_bytes,
    video_count = EXCLUDED.video_count,
    logo_count = EXCLUDED.logo_count,
    estimated_monthly_cents = EXCLUDED.estimated_monthly_cents,
    commercial_rule_version = EXCLUDED.commercial_rule_version,
    created_at = now()
  RETURNING s.id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION app.is_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.write_platform_admin_audit(uuid, text, text, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.grant_platform_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.admin_set_tenant_status(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.capture_daminatofit_metric_snapshot(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.prevent_platform_admin_audit_mutation() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.is_platform_admin() TO app_user, app_admin;
GRANT EXECUTE ON FUNCTION app.write_platform_admin_audit(uuid, text, text, uuid, text, text, jsonb)
  TO app_admin;
GRANT EXECUTE ON FUNCTION app.admin_set_tenant_status(uuid, uuid, text, text) TO app_admin;
GRANT EXECUTE ON FUNCTION app.capture_daminatofit_metric_snapshot(date) TO app_admin;
-- grant_platform_admin: migrator/owner only (no grant to app_user/app_admin)
