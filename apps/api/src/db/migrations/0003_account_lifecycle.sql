-- Phase 2.1: account soft-delete helpers (identity vs membership vs tenant space).

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

  -- Archive this user's memberships (student unlink + trainer owner membership).
  UPDATE memberships
  SET status = 'archived',
      deactivated_at = COALESCE(deactivated_at, now()),
      updated_at = now()
  WHERE user_id = v_user_id
    AND status <> 'archived';

  -- Professional spaces owned by this user are archived (not hard-deleted).
  -- Historical rows belonging to other people are preserved.
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

  RETURN v_user_id;
END;
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
  JOIN users u ON u.id = m.user_id
  WHERE m.user_id = p_user_id
    AND m.status = 'active'
    AND t.status = 'active'
    AND u.deleted_at IS NULL
$$;

REVOKE ALL ON FUNCTION app.soft_delete_identity(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.soft_delete_identity(text, text) TO app_user, app_admin;
