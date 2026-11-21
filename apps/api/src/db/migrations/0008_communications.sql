-- Phase 6: announcement limits, direct-message immutability, push devices,
-- notification preferences and an idempotent delivery queue.
-- Push copy below must stay identical to PUSH_COPY in packages/contracts.

ALTER TABLE announcements
  ADD CONSTRAINT announcements_title_len CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  ADD CONSTRAINT announcements_body_len CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000);

ALTER TABLE direct_messages
  ADD CONSTRAINT direct_messages_body_len CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000);

-- Students and trainers using app_user may only stamp read_at. Body stays immutable.
REVOKE UPDATE ON direct_messages FROM app_user;
GRANT UPDATE (read_at) ON direct_messages TO app_user;

CREATE INDEX IF NOT EXISTS announcements_tenant_created_idx
  ON announcements (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS announcements_active_idx
  ON announcements (tenant_id, published_at DESC)
  WHERE published_at IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS announcement_reads_membership_idx
  ON announcement_reads (membership_id);

CREATE INDEX IF NOT EXISTS direct_messages_tenant_created_idx
  ON direct_messages (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS direct_messages_unread_idx
  ON direct_messages (recipient_membership_id)
  WHERE read_at IS NULL;

CREATE OR REPLACE FUNCTION app.announcements_protect_published()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.published_at IS NOT NULL THEN
    IF NEW.title IS DISTINCT FROM OLD.title
       OR NEW.body IS DISTINCT FROM OLD.body
       OR NEW.author_user_id IS DISTINCT FROM OLD.author_user_id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.published_at IS DISTINCT FROM OLD.published_at
    THEN
      RAISE EXCEPTION 'published announcements are immutable'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF OLD.archived_at IS NOT NULL AND NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
    RAISE EXCEPTION 'archived announcements stay archived'
      USING ERRCODE = '55000';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER announcements_protect_published
  BEFORE UPDATE ON announcements
  FOR EACH ROW EXECUTE FUNCTION app.announcements_protect_published();

CREATE OR REPLACE FUNCTION app.direct_messages_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.sender_user_id IS DISTINCT FROM OLD.sender_user_id
     OR NEW.recipient_membership_id IS DISTINCT FROM OLD.recipient_membership_id
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
  THEN
    RAISE EXCEPTION 'direct messages cannot be edited'
      USING ERRCODE = '55000';
  END IF;

  -- Only the recipient student may stamp the first read. Later updates stay put.
  IF current_user = 'app_user' AND NOT app.is_tenant_student() THEN
    NEW.read_at := OLD.read_at;
  ELSIF OLD.read_at IS NOT NULL THEN
    NEW.read_at := OLD.read_at;
  ELSIF NEW.read_at IS NOT NULL THEN
    NEW.read_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER direct_messages_guard
  BEFORE UPDATE ON direct_messages
  FOR EACH ROW EXECUTE FUNCTION app.direct_messages_guard();

-- Tokens belong to the account and the device, never to a single tenant.
CREATE TABLE push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  realm text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  expo_push_token text NOT NULL,
  device_label text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'invalid')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_devices_token_uq UNIQUE (expo_push_token),
  CONSTRAINT push_devices_token_shape CHECK (
    expo_push_token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,180}\]$'
  ),
  CONSTRAINT push_devices_label_len CHECK (
    device_label IS NULL OR char_length(device_label) BETWEEN 1 AND 80
  )
);

CREATE INDEX push_devices_user_status_idx ON push_devices (user_id, status);

CREATE TABLE notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  push_announcements boolean NOT NULL DEFAULT true,
  push_direct_messages boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  device_id uuid REFERENCES push_devices (id) ON DELETE SET NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  membership_id uuid REFERENCES memberships (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('announcement', 'direct_message')),
  entity_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'sending', 'sent', 'failed', 'skipped', 'invalid_token')
  ),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= 10),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  provider_ticket text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT notification_deliveries_idem_uq UNIQUE (idempotency_key),
  CONSTRAINT notification_deliveries_payload_shape CHECK (
    payload - 'title' - 'body' - 'data' = '{}'::jsonb
    AND jsonb_typeof(payload -> 'data') = 'object'
    AND (payload -> 'data') - 'kind' - 'entityId' - 'tenantId' = '{}'::jsonb
    AND char_length(payload ->> 'title') BETWEEN 1 AND 80
    AND char_length(payload ->> 'body') BETWEEN 1 AND 180
    AND (payload -> 'data' ->> 'kind') IN ('announcement', 'direct_message')
  )
);

CREATE INDEX notification_deliveries_due_idx
  ON notification_deliveries (next_attempt_at, created_at)
  WHERE status IN ('pending', 'failed', 'sending');

CREATE INDEX notification_deliveries_user_idx
  ON notification_deliveries (user_id, created_at DESC);

CREATE INDEX notification_deliveries_tenant_idx
  ON notification_deliveries (tenant_id, created_at DESC);

GRANT SELECT, UPDATE ON push_devices TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON push_devices TO app_admin, app_worker;
GRANT SELECT ON push_devices TO app_backup;

GRANT SELECT, INSERT, UPDATE ON notification_preferences TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_preferences TO app_admin, app_worker;
GRANT SELECT ON notification_preferences TO app_backup;

-- Clients cannot insert or update the queue. The SECURITY DEFINER functions do.
GRANT SELECT ON notification_deliveries TO app_user, app_backup;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_deliveries TO app_admin, app_worker;

ALTER TABLE push_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_devices FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries FORCE ROW LEVEL SECURITY;

CREATE POLICY push_devices_own ON push_devices
  FOR ALL TO app_user
  USING (user_id = app.current_user_id() AND realm = app.current_realm())
  WITH CHECK (user_id = app.current_user_id() AND realm = app.current_realm());

CREATE POLICY push_devices_admin_all ON push_devices
  FOR ALL TO app_admin
  USING (true)
  WITH CHECK (true);

CREATE POLICY notification_preferences_own ON notification_preferences
  FOR ALL TO app_user
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

CREATE POLICY notification_preferences_admin_all ON notification_preferences
  FOR ALL TO app_admin
  USING (true)
  WITH CHECK (true);

-- No app_user policy: the queue is invisible to clients (fail closed).
CREATE POLICY notification_deliveries_admin_all ON notification_deliveries
  FOR ALL TO app_admin
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION app.register_push_device(
  p_platform text,
  p_token text,
  p_label text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid;
  v_realm text;
  v_id uuid;
BEGIN
  v_user := app.current_user_id();
  v_realm := app.current_realm();
  IF v_user IS NULL OR v_realm IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_platform NOT IN ('ios', 'android')
     OR p_token IS NULL
     OR p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,180}\]$'
  THEN
    RAISE EXCEPTION 'invalid_push_token' USING ERRCODE = '22023';
  END IF;
  IF p_label IS NOT NULL AND char_length(p_label) > 80 THEN
    RAISE EXCEPTION 'invalid_device_label' USING ERRCODE = '22023';
  END IF;

  INSERT INTO push_devices (
    user_id, realm, platform, expo_push_token, device_label, status, last_seen_at
  ) VALUES (
    v_user, v_realm, p_platform, p_token, NULLIF(p_label, ''), 'active', now()
  )
  ON CONFLICT (expo_push_token) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      realm = EXCLUDED.realm,
      platform = EXCLUDED.platform,
      device_label = EXCLUDED.device_label,
      status = 'active',
      revoked_at = NULL,
      last_seen_at = now(),
      updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.revoke_push_device(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid;
  v_device uuid;
BEGIN
  v_user := app.current_user_id();
  IF v_user IS NULL OR app.current_realm() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  UPDATE push_devices
  SET status = 'revoked',
      revoked_at = COALESCE(revoked_at, now()),
      updated_at = now()
  WHERE user_id = v_user
    AND realm = app.current_realm()
    AND expo_push_token = p_token
    AND status = 'active'
  RETURNING id INTO v_device;

  IF v_device IS NULL THEN
    RETURN false;
  END IF;

  UPDATE notification_deliveries
  SET status = 'skipped',
      last_error = 'token_revoked',
      updated_at = now()
  WHERE device_id = v_device
    AND status IN ('pending', 'failed');

  RETURN true;
END;
$$;

-- Generic payload only. Never copy announcement or message text into the queue.
CREATE OR REPLACE FUNCTION app.enqueue_communication_notifications(
  p_kind text,
  p_entity_id uuid,
  p_membership_id uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid;
  v_title text;
  v_body text;
  v_inserted integer;
BEGIN
  IF app.current_role() IS DISTINCT FROM 'owner' OR app.current_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('announcement', 'direct_message') THEN
    RAISE EXCEPTION 'invalid_kind' USING ERRCODE = '22023';
  END IF;

  v_tenant := app.current_tenant_id();

  IF p_kind = 'announcement' THEN
    IF NOT EXISTS (
      SELECT 1 FROM announcements a
      WHERE a.id = p_entity_id
        AND a.tenant_id = v_tenant
        AND a.published_at IS NOT NULL
        AND a.archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'announcement_not_publishable' USING ERRCODE = 'P0002';
    END IF;
    v_title := 'Nuevo aviso';
    v_body := 'Tenés un aviso nuevo de tu entrenador.';
  ELSE
    IF p_membership_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM direct_messages m
      WHERE m.id = p_entity_id
        AND m.tenant_id = v_tenant
        AND m.recipient_membership_id = p_membership_id
    ) THEN
      RAISE EXCEPTION 'message_not_found' USING ERRCODE = 'P0002';
    END IF;
    v_title := 'Nuevo mensaje';
    v_body := 'Tenés un nuevo mensaje de tu entrenador.';
  END IF;

  INSERT INTO notification_deliveries (
    user_id, device_id, tenant_id, membership_id, kind, entity_id,
    idempotency_key, status, payload
  )
  SELECT
    m.user_id,
    d.id,
    v_tenant,
    m.id,
    p_kind,
    p_entity_id,
    p_kind || ':' || p_entity_id::text || ':' || m.user_id::text || ':' || d.id::text,
    'pending',
    jsonb_build_object(
      'title', v_title,
      'body', v_body,
      'data', jsonb_build_object(
        'kind', p_kind,
        'entityId', p_entity_id::text,
        'tenantId', v_tenant::text
      )
    )
  FROM memberships m
  JOIN users u ON u.id = m.user_id
  JOIN push_devices d
    ON d.user_id = m.user_id
   AND d.realm = app.current_realm()
   AND d.status = 'active'
  LEFT JOIN notification_preferences pref ON pref.user_id = m.user_id
  WHERE m.tenant_id = v_tenant
    AND m.role = 'student'
    AND m.status = 'active'
    AND u.deleted_at IS NULL
    AND u.status = 'active'
    AND u.realm = app.current_realm()
    AND (p_membership_id IS NULL OR m.id = p_membership_id)
    AND (
      pref.user_id IS NULL
      OR (p_kind = 'announcement' AND pref.push_announcements)
      OR (p_kind = 'direct_message' AND pref.push_direct_messages)
    )
  ON CONFLICT (idempotency_key) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION app.claim_notification_deliveries(p_limit integer)
RETURNS TABLE (
  id uuid,
  expo_push_token text,
  payload jsonb,
  attempt_count integer,
  membership_status text,
  device_status text,
  push_allowed boolean,
  user_deleted boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer;
BEGIN
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 1), 1), 50);
  RETURN QUERY
  WITH marked AS (
    UPDATE notification_deliveries n
    SET status = 'sending',
        attempt_count = n.attempt_count + 1,
        updated_at = now()
    WHERE n.id IN (
      SELECT d.id
      FROM notification_deliveries d
      WHERE (
          d.status IN ('pending', 'failed')
          OR (d.status = 'sending' AND d.updated_at < now() - interval '2 minutes')
        )
        AND d.next_attempt_at <= now()
        AND d.attempt_count < 5
      ORDER BY d.next_attempt_at, d.created_at
      FOR UPDATE SKIP LOCKED
      LIMIT v_limit
    )
    RETURNING n.id, n.device_id, n.payload, n.attempt_count, n.membership_id, n.user_id, n.kind
  )
  SELECT
    marked.id,
    pd.expo_push_token,
    marked.payload,
    marked.attempt_count,
    m.status,
    COALESCE(pd.status, 'missing'),
    CASE
      WHEN marked.kind = 'announcement' THEN COALESCE(pref.push_announcements, true)
      ELSE COALESCE(pref.push_direct_messages, true)
    END,
    (usr.deleted_at IS NOT NULL OR usr.status IS DISTINCT FROM 'active')
  FROM marked
  LEFT JOIN push_devices pd ON pd.id = marked.device_id
  LEFT JOIN memberships m ON m.id = marked.membership_id
  LEFT JOIN notification_preferences pref ON pref.user_id = marked.user_id
  LEFT JOIN users usr ON usr.id = marked.user_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.complete_notification_delivery(
  p_id uuid,
  p_status text,
  p_error text,
  p_ticket text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_device uuid;
  v_attempts integer;
BEGIN
  IF p_status NOT IN ('sent', 'failed', 'skipped', 'invalid_token') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  SELECT device_id, attempt_count INTO v_device, v_attempts
  FROM notification_deliveries
  WHERE id = p_id AND status = 'sending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p_status = 'invalid_token' AND v_device IS NOT NULL THEN
    UPDATE push_devices
    SET status = 'invalid', updated_at = now()
    WHERE id = v_device AND status = 'active';
  END IF;

  UPDATE notification_deliveries
  SET status = p_status,
      last_error = left(p_error, 300),
      provider_ticket = left(p_ticket, 200),
      sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END,
      next_attempt_at = CASE
        WHEN p_status = 'failed' THEN now() + (LEAST(v_attempts, 6) * interval '30 seconds')
        ELSE next_attempt_at
      END,
      updated_at = now()
  WHERE id = p_id AND status = 'sending';
END;
$$;

REVOKE ALL ON FUNCTION app.register_push_device(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.revoke_push_device(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.enqueue_communication_notifications(text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.claim_notification_deliveries(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.complete_notification_delivery(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.announcements_protect_published() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.direct_messages_guard() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.register_push_device(text, text, text) TO app_user, app_admin;
GRANT EXECUTE ON FUNCTION app.revoke_push_device(text) TO app_user, app_admin;
GRANT EXECUTE ON FUNCTION app.enqueue_communication_notifications(text, uuid, uuid) TO app_user, app_admin;
GRANT EXECUTE ON FUNCTION app.claim_notification_deliveries(integer) TO app_user, app_admin, app_worker;
GRANT EXECUTE ON FUNCTION app.complete_notification_delivery(uuid, text, text, text) TO app_user, app_admin, app_worker;
GRANT EXECUTE ON FUNCTION app.announcements_protect_published() TO app_user, app_admin, app_worker;
GRANT EXECUTE ON FUNCTION app.direct_messages_guard() TO app_user, app_admin, app_worker;

-- Account deletion also revokes device tokens and drops pending pushes.
CREATE OR REPLACE FUNCTION app.soft_delete_identity(
  p_realm text,
  p_auth_user_id text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_tenant_id uuid;
BEGIN
  SELECT u.id INTO v_user_id
  FROM users u
  WHERE u.realm = p_realm
    AND u.auth_user_id = p_auth_user_id
    AND u.deleted_at IS NULL
  FOR UPDATE;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE users
  SET deleted_at = now(),
      status = 'disabled',
      updated_at = now(),
      display_name = 'Cuenta eliminada'
  WHERE id = v_user_id;

  UPDATE memberships
  SET status = 'archived',
      deactivated_at = COALESCE(deactivated_at, now()),
      updated_at = now()
  WHERE user_id = v_user_id
    AND status <> 'archived';

  FOR v_tenant_id IN
    SELECT t.id FROM tenants t
    WHERE t.owner_user_id = v_user_id AND t.status <> 'archived'
  LOOP
    UPDATE tenants
    SET status = 'archived', updated_at = now()
    WHERE id = v_tenant_id;

    UPDATE memberships
    SET status = 'archived',
        deactivated_at = COALESCE(deactivated_at, now()),
        updated_at = now()
    WHERE tenant_id = v_tenant_id
      AND status <> 'archived';

    UPDATE invitations
    SET revoked_at = COALESCE(revoked_at, now()), updated_at = now()
    WHERE tenant_id = v_tenant_id
      AND accepted_at IS NULL
      AND revoked_at IS NULL;
  END LOOP;

  UPDATE invitations
  SET revoked_at = COALESCE(revoked_at, now()), updated_at = now()
  WHERE created_by = v_user_id
    AND accepted_at IS NULL
    AND revoked_at IS NULL;

  UPDATE push_devices
  SET status = 'revoked',
      revoked_at = COALESCE(revoked_at, now()),
      updated_at = now()
  WHERE user_id = v_user_id
    AND status = 'active';

  UPDATE notification_deliveries
  SET status = 'skipped',
      last_error = 'account_deleted',
      updated_at = now()
  WHERE user_id = v_user_id
    AND status IN ('pending', 'failed', 'sending');

  RETURN v_user_id;
END;
$$;
