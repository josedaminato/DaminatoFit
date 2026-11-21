-- Phase 5: workout sessions, set logs, offline idempotency + RLS.

CREATE TABLE workout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  student_membership_id uuid NOT NULL REFERENCES memberships (id),
  routine_version_id uuid NOT NULL REFERENCES routine_versions (id),
  routine_version_day_id uuid NOT NULL REFERENCES routine_version_days (id),
  client_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  notes text NOT NULL DEFAULT '',
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_id)
);

-- At most one in-progress session per student membership.
CREATE UNIQUE INDEX workout_sessions_one_active_uq
  ON workout_sessions (student_membership_id)
  WHERE status = 'in_progress';

CREATE INDEX workout_sessions_student_started_idx
  ON workout_sessions (student_membership_id, started_at DESC);

CREATE INDEX workout_sessions_tenant_status_idx
  ON workout_sessions (tenant_id, status);

CREATE TABLE workout_set_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  session_id uuid NOT NULL REFERENCES workout_sessions (id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES exercises (id),
  routine_version_set_id uuid REFERENCES routine_version_sets (id),
  client_id uuid NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  prescribed_reps_min integer,
  prescribed_reps_max integer,
  prescribed_weight_kg numeric(6, 2),
  actual_reps integer CHECK (actual_reps IS NULL OR actual_reps >= 0),
  actual_weight_kg numeric(6, 2) CHECK (actual_weight_kg IS NULL OR actual_weight_kg >= 0),
  completed boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  logged_at timestamptz NOT NULL DEFAULT now(),
  client_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_id)
);

CREATE INDEX workout_set_logs_session_idx ON workout_set_logs (session_id, position);
CREATE INDEX workout_set_logs_exercise_idx ON workout_set_logs (exercise_id, logged_at DESC);

-- ---------------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON workout_sessions, workout_set_logs
  TO app_user, app_admin, app_worker;
GRANT SELECT ON workout_sessions, workout_set_logs TO app_backup;

ALTER TABLE workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE workout_set_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_set_logs FORCE ROW LEVEL SECURITY;

-- Students own their sessions; trainers (owners) can read tenant sessions.
CREATE POLICY workout_sessions_select ON workout_sessions
  FOR SELECT TO app_user, app_worker
  USING (
    tenant_id = app.current_tenant_id()
    AND (
      app.is_tenant_owner()
      OR student_membership_id = app.current_membership_id()
    )
  );

CREATE POLICY workout_sessions_student_insert ON workout_sessions
  FOR INSERT TO app_user
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    AND student_membership_id = app.current_membership_id()
    AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = student_membership_id
        AND m.role = 'student'
        AND m.status = 'active'
    )
  );

CREATE POLICY workout_sessions_student_update ON workout_sessions
  FOR UPDATE TO app_user
  USING (
    tenant_id = app.current_tenant_id()
    AND student_membership_id = app.current_membership_id()
  )
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    AND student_membership_id = app.current_membership_id()
  );

CREATE POLICY workout_sessions_admin_all ON workout_sessions
  FOR ALL TO app_admin USING (true) WITH CHECK (true);

CREATE POLICY workout_set_logs_select ON workout_set_logs
  FOR SELECT TO app_user, app_worker
  USING (
    EXISTS (
      SELECT 1 FROM workout_sessions s
      WHERE s.id = workout_set_logs.session_id
        AND s.tenant_id = app.current_tenant_id()
        AND (
          app.is_tenant_owner()
          OR s.student_membership_id = app.current_membership_id()
        )
    )
  );

CREATE POLICY workout_set_logs_student_insert ON workout_set_logs
  FOR INSERT TO app_user
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM workout_sessions s
      WHERE s.id = session_id
        AND s.tenant_id = app.current_tenant_id()
        AND s.student_membership_id = app.current_membership_id()
        AND s.status = 'in_progress'
    )
  );

CREATE POLICY workout_set_logs_student_update ON workout_set_logs
  FOR UPDATE TO app_user
  USING (
    tenant_id = app.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM workout_sessions s
      WHERE s.id = workout_set_logs.session_id
        AND s.student_membership_id = app.current_membership_id()
        AND s.status = 'in_progress'
    )
  )
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM workout_sessions s
      WHERE s.id = session_id
        AND s.student_membership_id = app.current_membership_id()
        AND s.status = 'in_progress'
    )
  );

CREATE POLICY workout_set_logs_admin_all ON workout_set_logs
  FOR ALL TO app_admin USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Helpers: start session (idempotent), upsert set (LWW), finish
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.start_workout_session(
  p_tenant_id uuid,
  p_membership_id uuid,
  p_client_id uuid,
  p_routine_version_id uuid,
  p_routine_version_day_id uuid,
  p_started_at timestamptz DEFAULT now(),
  p_notes text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing uuid;
  v_session uuid;
  v_day_version uuid;
BEGIN
  -- Idempotent: same client_id returns existing
  SELECT id INTO v_existing
  FROM workout_sessions
  WHERE tenant_id = p_tenant_id AND client_id = p_client_id;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  -- Day must belong to the pinned version and be readable as assigned published/superseded
  SELECT d.version_id INTO v_day_version
  FROM routine_version_days d
  JOIN routine_versions v ON v.id = d.version_id
  JOIN routine_plans p ON p.id = v.plan_id
  WHERE d.id = p_routine_version_day_id
    AND d.version_id = p_routine_version_id
    AND p.tenant_id = p_tenant_id
    AND p.kind = 'assigned'
    AND p.student_membership_id = p_membership_id
    AND v.status IN ('published', 'superseded');

  IF v_day_version IS NULL THEN
    RAISE EXCEPTION 'invalid_routine_day';
  END IF;

  -- Resume existing in-progress for same day instead of creating another
  SELECT id INTO v_existing
  FROM workout_sessions
  WHERE student_membership_id = p_membership_id
    AND status = 'in_progress'
    AND routine_version_day_id = p_routine_version_day_id;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  IF EXISTS (
    SELECT 1 FROM workout_sessions
    WHERE student_membership_id = p_membership_id AND status = 'in_progress'
  ) THEN
    RAISE EXCEPTION 'active_session_exists';
  END IF;

  v_session := gen_random_uuid();
  INSERT INTO workout_sessions (
    id, tenant_id, student_membership_id, routine_version_id, routine_version_day_id,
    client_id, started_at, status, notes, synced_at
  ) VALUES (
    v_session, p_tenant_id, p_membership_id, p_routine_version_id, p_routine_version_day_id,
    p_client_id, COALESCE(p_started_at, now()), 'in_progress', COALESCE(p_notes, ''), now()
  );
  RETURN v_session;
END;
$$;

CREATE OR REPLACE FUNCTION app.upsert_workout_set_log(
  p_tenant_id uuid,
  p_membership_id uuid,
  p_session_id uuid,
  p_client_id uuid,
  p_exercise_id uuid,
  p_routine_version_set_id uuid,
  p_position integer,
  p_prescribed_reps_min integer,
  p_prescribed_reps_max integer,
  p_prescribed_weight_kg numeric,
  p_actual_reps integer,
  p_actual_weight_kg numeric,
  p_completed boolean,
  p_notes text,
  p_logged_at timestamptz,
  p_client_updated_at timestamptz
)
RETURNS TABLE (set_log_id uuid, applied boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session workout_sessions%ROWTYPE;
  v_existing workout_set_logs%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT * INTO v_session
  FROM workout_sessions
  WHERE id = p_session_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND OR v_session.student_membership_id <> p_membership_id THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;
  IF v_session.status <> 'in_progress' THEN
    RAISE EXCEPTION 'session_not_editable';
  END IF;

  SELECT * INTO v_existing
  FROM workout_set_logs
  WHERE tenant_id = p_tenant_id AND client_id = p_client_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.session_id <> p_session_id THEN
      RAISE EXCEPTION 'client_id_conflict';
    END IF;
    -- Stale write: keep server copy
    IF p_client_updated_at IS NOT NULL
       AND v_existing.client_updated_at IS NOT NULL
       AND p_client_updated_at < v_existing.client_updated_at THEN
      set_log_id := v_existing.id;
      applied := false;
      reason := 'stale';
      RETURN NEXT;
      RETURN;
    END IF;

    -- Audit previous values when overwriting completed data
    IF v_existing.completed OR v_existing.actual_reps IS NOT NULL THEN
      INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
      VALUES (
        p_tenant_id,
        NULL,
        'workout_set_overwrite',
        'workout_set_logs',
        v_existing.id,
        jsonb_build_object(
          'previous', jsonb_build_object(
            'actual_reps', v_existing.actual_reps,
            'actual_weight_kg', v_existing.actual_weight_kg,
            'completed', v_existing.completed,
            'client_updated_at', v_existing.client_updated_at
          ),
          'incoming_client_updated_at', p_client_updated_at
        )
      );
    END IF;

    UPDATE workout_set_logs SET
      exercise_id = p_exercise_id,
      routine_version_set_id = p_routine_version_set_id,
      position = p_position,
      prescribed_reps_min = p_prescribed_reps_min,
      prescribed_reps_max = p_prescribed_reps_max,
      prescribed_weight_kg = p_prescribed_weight_kg,
      actual_reps = p_actual_reps,
      actual_weight_kg = p_actual_weight_kg,
      completed = COALESCE(p_completed, false),
      notes = COALESCE(p_notes, ''),
      logged_at = COALESCE(p_logged_at, logged_at),
      client_updated_at = COALESCE(p_client_updated_at, now()),
      updated_at = now()
    WHERE id = v_existing.id;

    set_log_id := v_existing.id;
    applied := true;
    reason := 'updated';
    RETURN NEXT;
    RETURN;
  END IF;

  v_id := gen_random_uuid();
  INSERT INTO workout_set_logs (
    id, tenant_id, session_id, exercise_id, routine_version_set_id, client_id, position,
    prescribed_reps_min, prescribed_reps_max, prescribed_weight_kg,
    actual_reps, actual_weight_kg, completed, notes, logged_at, client_updated_at
  ) VALUES (
    v_id, p_tenant_id, p_session_id, p_exercise_id, p_routine_version_set_id, p_client_id, p_position,
    p_prescribed_reps_min, p_prescribed_reps_max, p_prescribed_weight_kg,
    p_actual_reps, p_actual_weight_kg, COALESCE(p_completed, false), COALESCE(p_notes, ''),
    COALESCE(p_logged_at, now()), COALESCE(p_client_updated_at, now())
  );

  set_log_id := v_id;
  applied := true;
  reason := 'inserted';
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION app.finish_workout_session(
  p_tenant_id uuid,
  p_membership_id uuid,
  p_session_id uuid,
  p_status text,
  p_finished_at timestamptz DEFAULT now(),
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session workout_sessions%ROWTYPE;
BEGIN
  IF p_status NOT IN ('completed', 'abandoned') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  SELECT * INTO v_session
  FROM workout_sessions
  WHERE id = p_session_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND OR v_session.student_membership_id <> p_membership_id THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;

  IF v_session.status <> 'in_progress' THEN
    -- Idempotent finish
    RETURN v_session.id;
  END IF;

  UPDATE workout_sessions SET
    status = p_status,
    finished_at = COALESCE(p_finished_at, now()),
    notes = COALESCE(p_notes, notes),
    synced_at = now(),
    updated_at = now()
  WHERE id = p_session_id;

  RETURN p_session_id;
END;
$$;

REVOKE ALL ON FUNCTION app.start_workout_session(uuid, uuid, uuid, uuid, uuid, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.upsert_workout_set_log(uuid, uuid, uuid, uuid, uuid, uuid, integer, integer, integer, numeric, integer, numeric, boolean, text, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.finish_workout_session(uuid, uuid, uuid, text, timestamptz, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.start_workout_session(uuid, uuid, uuid, uuid, uuid, timestamptz, text) TO app_user, app_admin;
GRANT EXECUTE ON FUNCTION app.upsert_workout_set_log(uuid, uuid, uuid, uuid, uuid, uuid, integer, integer, integer, numeric, integer, numeric, boolean, text, timestamptz, timestamptz) TO app_user, app_admin;
GRANT EXECUTE ON FUNCTION app.finish_workout_session(uuid, uuid, uuid, text, timestamptz, text) TO app_user, app_admin;
