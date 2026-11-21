-- Phase 4: versioned routine plans, days, exercises, sets, assignments + RLS.

CREATE TABLE routine_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  kind text NOT NULL CHECK (kind IN ('template', 'assigned')),
  student_membership_id uuid REFERENCES memberships (id),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  current_version_id uuid,
  source_version_id uuid,
  created_by uuid REFERENCES users (id),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT routine_plans_assigned_student_chk CHECK (
    (kind = 'template' AND student_membership_id IS NULL)
    OR (kind = 'assigned' AND student_membership_id IS NOT NULL)
  )
);

CREATE TABLE routine_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  plan_id uuid NOT NULL REFERENCES routine_plans (id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'superseded')),
  change_note text NOT NULL DEFAULT '',
  published_at timestamptz,
  published_by uuid REFERENCES users (id),
  starts_on date,
  ends_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, version_number)
);

ALTER TABLE routine_plans
  ADD CONSTRAINT routine_plans_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES routine_versions (id);

ALTER TABLE routine_plans
  ADD CONSTRAINT routine_plans_source_version_fk
  FOREIGN KEY (source_version_id) REFERENCES routine_versions (id);

-- One draft per plan
CREATE UNIQUE INDEX routine_versions_one_draft_uq
  ON routine_versions (plan_id)
  WHERE status = 'draft';

CREATE TABLE routine_version_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  version_id uuid NOT NULL REFERENCES routine_versions (id) ON DELETE CASCADE,
  name text NOT NULL,
  week_index integer NOT NULL DEFAULT 1 CHECK (week_index >= 1),
  position integer NOT NULL CHECK (position >= 0),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, week_index, position)
);

CREATE TABLE routine_version_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  day_id uuid NOT NULL REFERENCES routine_version_days (id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES exercises (id),
  exercise_revision_id uuid NOT NULL REFERENCES exercise_revisions (id),
  position integer NOT NULL CHECK (position >= 0),
  notes text NOT NULL DEFAULT '',
  rest_seconds integer CHECK (rest_seconds IS NULL OR rest_seconds >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day_id, position)
);

CREATE TABLE routine_version_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  version_exercise_id uuid NOT NULL REFERENCES routine_version_exercises (id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 0),
  target_reps_min integer NOT NULL CHECK (target_reps_min >= 0),
  target_reps_max integer NOT NULL CHECK (target_reps_max >= target_reps_min),
  target_weight_kg numeric(6, 2) CHECK (target_weight_kg IS NULL OR target_weight_kg >= 0),
  rest_seconds integer CHECK (rest_seconds IS NULL OR rest_seconds >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_exercise_id, position)
);

CREATE INDEX routine_plans_tenant_kind_idx ON routine_plans (tenant_id, kind)
  WHERE status = 'active';
CREATE INDEX routine_plans_student_idx ON routine_plans (student_membership_id)
  WHERE student_membership_id IS NOT NULL;
CREATE INDEX routine_versions_plan_idx ON routine_versions (plan_id, status);
CREATE INDEX routine_version_days_version_idx ON routine_version_days (version_id);
CREATE INDEX routine_version_exercises_day_idx ON routine_version_exercises (day_id);

-- ---------------------------------------------------------------------------
-- Immutability: published/superseded versions cannot change structure
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.prevent_routine_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('published', 'superseded') THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'published routine versions are immutable'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.change_note IS DISTINCT FROM OLD.change_note
       OR NEW.starts_on IS DISTINCT FROM OLD.starts_on
       OR NEW.ends_on IS DISTINCT FROM OLD.ends_on
       OR NEW.published_at IS DISTINCT FROM OLD.published_at
       OR NEW.published_by IS DISTINCT FROM OLD.published_by
       OR NEW.version_number IS DISTINCT FROM OLD.version_number
       OR NEW.plan_id IS DISTINCT FROM OLD.plan_id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
      -- Allow only: draft→published, published→superseded, and ends_on on published (replace)
      IF OLD.status = 'draft' AND NEW.status = 'published' THEN
        RETURN NEW;
      END IF;
      IF OLD.status = 'published' AND NEW.status = 'superseded' THEN
        RETURN NEW;
      END IF;
      IF OLD.status = 'published'
         AND NEW.status = 'published'
         AND NEW.ends_on IS DISTINCT FROM OLD.ends_on
         AND NEW.change_note IS NOT DISTINCT FROM OLD.change_note
         AND NEW.starts_on IS NOT DISTINCT FROM OLD.starts_on
         AND NEW.published_at IS NOT DISTINCT FROM OLD.published_at
         AND NEW.published_by IS NOT DISTINCT FROM OLD.published_by
         AND NEW.version_number IS NOT DISTINCT FROM OLD.version_number
         AND NEW.plan_id IS NOT DISTINCT FROM OLD.plan_id
         AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'published routine versions are immutable'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER routine_versions_immutable
  BEFORE UPDATE OR DELETE ON routine_versions
  FOR EACH ROW EXECUTE FUNCTION app.prevent_routine_version_mutation();

CREATE OR REPLACE FUNCTION app.prevent_frozen_routine_children()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
  v_version_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'routine_version_days' THEN
    v_version_id := COALESCE(NEW.version_id, OLD.version_id);
  ELSIF TG_TABLE_NAME = 'routine_version_exercises' THEN
    SELECT d.version_id INTO v_version_id
    FROM routine_version_days d
    WHERE d.id = COALESCE(NEW.day_id, OLD.day_id);
  ELSE
    SELECT d.version_id INTO v_version_id
    FROM routine_version_exercises e
    JOIN routine_version_days d ON d.id = e.day_id
    WHERE e.id = COALESCE(NEW.version_exercise_id, OLD.version_exercise_id);
  END IF;

  SELECT status INTO v_status FROM routine_versions WHERE id = v_version_id;
  IF v_status IN ('published', 'superseded') THEN
    RAISE EXCEPTION 'cannot mutate frozen routine version children'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER routine_days_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON routine_version_days
  FOR EACH ROW EXECUTE FUNCTION app.prevent_frozen_routine_children();

CREATE TRIGGER routine_exercises_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON routine_version_exercises
  FOR EACH ROW EXECUTE FUNCTION app.prevent_frozen_routine_children();

CREATE TRIGGER routine_sets_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON routine_version_sets
  FOR EACH ROW EXECUTE FUNCTION app.prevent_frozen_routine_children();

-- ---------------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  routine_plans, routine_versions, routine_version_days,
  routine_version_exercises, routine_version_sets
TO app_user, app_admin, app_worker;

GRANT SELECT ON
  routine_plans, routine_versions, routine_version_days,
  routine_version_exercises, routine_version_sets
TO app_backup;

ALTER TABLE routine_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE routine_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE routine_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE routine_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE routine_version_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE routine_version_days FORCE ROW LEVEL SECURITY;
ALTER TABLE routine_version_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE routine_version_exercises FORCE ROW LEVEL SECURITY;
ALTER TABLE routine_version_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE routine_version_sets FORCE ROW LEVEL SECURITY;

-- Plans: owner sees all in tenant; student sees own assigned plans
CREATE POLICY routine_plans_select ON routine_plans
  FOR SELECT TO app_user, app_worker
  USING (
    tenant_id = app.current_tenant_id()
    AND (
      app.is_tenant_owner()
      OR (
        kind = 'assigned'
        AND student_membership_id = app.current_membership_id()
      )
    )
  );

CREATE POLICY routine_plans_owner_write ON routine_plans
  FOR ALL TO app_user
  USING (tenant_id = app.current_tenant_id() AND app.is_tenant_owner())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.is_tenant_owner());

CREATE POLICY routine_plans_admin_all ON routine_plans
  FOR ALL TO app_admin
  USING (true)
  WITH CHECK (true);

CREATE POLICY routine_versions_select ON routine_versions
  FOR SELECT TO app_user, app_worker
  USING (
    EXISTS (
      SELECT 1 FROM routine_plans p
      WHERE p.id = routine_versions.plan_id
        AND p.tenant_id = app.current_tenant_id()
        AND (
          app.is_tenant_owner()
          OR (
            p.kind = 'assigned'
            AND p.student_membership_id = app.current_membership_id()
            AND routine_versions.status IN ('published', 'superseded')
          )
        )
    )
  );

CREATE POLICY routine_versions_owner_write ON routine_versions
  FOR ALL TO app_user
  USING (tenant_id = app.current_tenant_id() AND app.is_tenant_owner())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.is_tenant_owner());

CREATE POLICY routine_versions_admin_all ON routine_versions
  FOR ALL TO app_admin
  USING (true)
  WITH CHECK (true);

CREATE POLICY routine_days_select ON routine_version_days
  FOR SELECT TO app_user, app_worker
  USING (
    EXISTS (
      SELECT 1 FROM routine_versions v
      JOIN routine_plans p ON p.id = v.plan_id
      WHERE v.id = routine_version_days.version_id
        AND p.tenant_id = app.current_tenant_id()
        AND (
          app.is_tenant_owner()
          OR (
            p.kind = 'assigned'
            AND p.student_membership_id = app.current_membership_id()
            AND v.status IN ('published', 'superseded')
          )
        )
    )
  );

CREATE POLICY routine_days_owner_write ON routine_version_days
  FOR ALL TO app_user
  USING (tenant_id = app.current_tenant_id() AND app.is_tenant_owner())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.is_tenant_owner());

CREATE POLICY routine_days_admin_all ON routine_version_days
  FOR ALL TO app_admin USING (true) WITH CHECK (true);

CREATE POLICY routine_exercises_select ON routine_version_exercises
  FOR SELECT TO app_user, app_worker
  USING (
    EXISTS (
      SELECT 1 FROM routine_version_days d
      JOIN routine_versions v ON v.id = d.version_id
      JOIN routine_plans p ON p.id = v.plan_id
      WHERE d.id = routine_version_exercises.day_id
        AND p.tenant_id = app.current_tenant_id()
        AND (
          app.is_tenant_owner()
          OR (
            p.kind = 'assigned'
            AND p.student_membership_id = app.current_membership_id()
            AND v.status IN ('published', 'superseded')
          )
        )
    )
  );

CREATE POLICY routine_exercises_owner_write ON routine_version_exercises
  FOR ALL TO app_user
  USING (tenant_id = app.current_tenant_id() AND app.is_tenant_owner())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.is_tenant_owner());

CREATE POLICY routine_exercises_admin_all ON routine_version_exercises
  FOR ALL TO app_admin USING (true) WITH CHECK (true);

CREATE POLICY routine_sets_select ON routine_version_sets
  FOR SELECT TO app_user, app_worker
  USING (
    EXISTS (
      SELECT 1 FROM routine_version_exercises e
      JOIN routine_version_days d ON d.id = e.day_id
      JOIN routine_versions v ON v.id = d.version_id
      JOIN routine_plans p ON p.id = v.plan_id
      WHERE e.id = routine_version_sets.version_exercise_id
        AND p.tenant_id = app.current_tenant_id()
        AND (
          app.is_tenant_owner()
          OR (
            p.kind = 'assigned'
            AND p.student_membership_id = app.current_membership_id()
            AND v.status IN ('published', 'superseded')
          )
        )
    )
  );

CREATE POLICY routine_sets_owner_write ON routine_version_sets
  FOR ALL TO app_user
  USING (tenant_id = app.current_tenant_id() AND app.is_tenant_owner())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.is_tenant_owner());

CREATE POLICY routine_sets_admin_all ON routine_version_sets
  FOR ALL TO app_admin USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Helpers: copy version tree, publish, assign
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.copy_routine_version(
  p_source_version_id uuid,
  p_target_plan_id uuid,
  p_tenant_id uuid,
  p_version_number integer,
  p_status text,
  p_published_by uuid DEFAULT NULL,
  p_starts_on date DEFAULT NULL,
  p_ends_on date DEFAULT NULL,
  p_change_note text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_version uuid := gen_random_uuid();
  r_day record;
  r_ex record;
  r_set record;
  v_new_day uuid;
  v_new_ex uuid;
BEGIN
  IF p_status NOT IN ('draft', 'published') THEN
    RAISE EXCEPTION 'invalid_target_status';
  END IF;

  -- Always insert as draft first so child rows can be written, then publish if needed.
  INSERT INTO routine_versions (
    id, tenant_id, plan_id, version_number, status, change_note, starts_on, ends_on
  ) VALUES (
    v_new_version, p_tenant_id, p_target_plan_id, p_version_number, 'draft', p_change_note,
    p_starts_on, p_ends_on
  );

  FOR r_day IN
    SELECT * FROM routine_version_days WHERE version_id = p_source_version_id ORDER BY week_index, position
  LOOP
    v_new_day := gen_random_uuid();
    INSERT INTO routine_version_days (
      id, tenant_id, version_id, name, week_index, position, notes
    ) VALUES (
      v_new_day, p_tenant_id, v_new_version, r_day.name, r_day.week_index, r_day.position, r_day.notes
    );

    FOR r_ex IN
      SELECT * FROM routine_version_exercises WHERE day_id = r_day.id ORDER BY position
    LOOP
      v_new_ex := gen_random_uuid();
      INSERT INTO routine_version_exercises (
        id, tenant_id, day_id, exercise_id, exercise_revision_id, position, notes, rest_seconds
      ) VALUES (
        v_new_ex, p_tenant_id, v_new_day, r_ex.exercise_id, r_ex.exercise_revision_id,
        r_ex.position, r_ex.notes, r_ex.rest_seconds
      );

      FOR r_set IN
        SELECT * FROM routine_version_sets WHERE version_exercise_id = r_ex.id ORDER BY position
      LOOP
        INSERT INTO routine_version_sets (
          tenant_id, version_exercise_id, position,
          target_reps_min, target_reps_max, target_weight_kg, rest_seconds
        ) VALUES (
          p_tenant_id, v_new_ex, r_set.position,
          r_set.target_reps_min, r_set.target_reps_max, r_set.target_weight_kg, r_set.rest_seconds
        );
      END LOOP;
    END LOOP;
  END LOOP;

  IF p_status = 'published' THEN
    UPDATE routine_versions SET
      status = 'published',
      published_at = now(),
      published_by = p_published_by,
      updated_at = now()
    WHERE id = v_new_version;
  END IF;

  RETURN v_new_version;
END;
$$;

CREATE OR REPLACE FUNCTION app.publish_routine_version(
  p_tenant_id uuid,
  p_user_id uuid,
  p_plan_id uuid,
  p_change_note text DEFAULT NULL,
  p_starts_on date DEFAULT NULL,
  p_ends_on date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_draft routine_versions%ROWTYPE;
  v_prev uuid;
  v_day_count int;
BEGIN
  SELECT * INTO v_draft
  FROM routine_versions
  WHERE plan_id = p_plan_id AND tenant_id = p_tenant_id AND status = 'draft'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_draft';
  END IF;

  SELECT count(*) INTO v_day_count FROM routine_version_days WHERE version_id = v_draft.id;
  IF v_day_count < 1 THEN
    RAISE EXCEPTION 'empty_draft';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM routine_version_exercises e
    JOIN routine_version_days d ON d.id = e.day_id
    WHERE d.version_id = v_draft.id
  ) THEN
    RAISE EXCEPTION 'empty_draft';
  END IF;

  SELECT current_version_id INTO v_prev FROM routine_plans WHERE id = p_plan_id FOR UPDATE;
  IF v_prev IS NOT NULL THEN
    UPDATE routine_versions SET status = 'superseded', updated_at = now()
    WHERE id = v_prev AND status = 'published';
  END IF;

  UPDATE routine_versions SET
    status = 'published',
    change_note = COALESCE(p_change_note, change_note),
    published_at = now(),
    published_by = p_user_id,
    starts_on = COALESCE(p_starts_on, starts_on),
    ends_on = COALESCE(p_ends_on, ends_on),
    updated_at = now()
  WHERE id = v_draft.id;

  UPDATE routine_plans SET
    current_version_id = v_draft.id,
    updated_at = now()
  WHERE id = p_plan_id;

  RETURN v_draft.id;
END;
$$;

CREATE OR REPLACE FUNCTION app.assign_routine_to_student(
  p_tenant_id uuid,
  p_user_id uuid,
  p_template_plan_id uuid,
  p_student_membership_id uuid,
  p_starts_on date DEFAULT CURRENT_DATE,
  p_ends_on date DEFAULT NULL,
  p_replace_active boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_template routine_plans%ROWTYPE;
  v_source_version uuid;
  v_new_plan uuid := gen_random_uuid();
  v_new_version uuid;
  r_old record;
BEGIN
  SELECT * INTO v_template
  FROM routine_plans
  WHERE id = p_template_plan_id AND tenant_id = p_tenant_id AND kind = 'template';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'template_not_found';
  END IF;

  IF v_template.current_version_id IS NULL THEN
    RAISE EXCEPTION 'template_not_published';
  END IF;
  v_source_version := v_template.current_version_id;

  IF NOT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.id = p_student_membership_id
      AND m.tenant_id = p_tenant_id
      AND m.role = 'student'
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'invalid_student';
  END IF;

  IF p_replace_active THEN
    FOR r_old IN
      SELECT id, current_version_id FROM routine_plans
      WHERE tenant_id = p_tenant_id
        AND kind = 'assigned'
        AND student_membership_id = p_student_membership_id
        AND status = 'active'
    LOOP
      IF r_old.current_version_id IS NOT NULL THEN
        UPDATE routine_versions
        SET ends_on = COALESCE(ends_on, CURRENT_DATE), updated_at = now()
        WHERE id = r_old.current_version_id AND status = 'published';
      END IF;
      UPDATE routine_plans
      SET status = 'archived', archived_at = now(), updated_at = now()
      WHERE id = r_old.id;
    END LOOP;
  END IF;

  INSERT INTO routine_plans (
    id, tenant_id, kind, student_membership_id, name, description,
    status, source_version_id, created_by
  ) VALUES (
    v_new_plan, p_tenant_id, 'assigned', p_student_membership_id,
    v_template.name, v_template.description, 'active', v_source_version, p_user_id
  );

  v_new_version := app.copy_routine_version(
    v_source_version, v_new_plan, p_tenant_id, 1, 'published',
    p_user_id, COALESCE(p_starts_on, CURRENT_DATE), p_ends_on, 'Asignación inicial'
  );

  UPDATE routine_plans SET current_version_id = v_new_version, updated_at = now()
  WHERE id = v_new_plan;

  RETURN v_new_plan;
END;
$$;

CREATE OR REPLACE FUNCTION app.ensure_routine_draft(
  p_tenant_id uuid,
  p_user_id uuid,
  p_plan_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan routine_plans%ROWTYPE;
  v_draft uuid;
  v_next int;
BEGIN
  SELECT * INTO v_plan FROM routine_plans
  WHERE id = p_plan_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan_not_found';
  END IF;

  SELECT id INTO v_draft FROM routine_versions
  WHERE plan_id = p_plan_id AND status = 'draft';
  IF FOUND THEN
    RETURN v_draft;
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next
  FROM routine_versions WHERE plan_id = p_plan_id;

  IF v_plan.current_version_id IS NOT NULL THEN
    RETURN app.copy_routine_version(
      v_plan.current_version_id, p_plan_id, p_tenant_id, v_next, 'draft',
      NULL, NULL, NULL, ''
    );
  END IF;

  v_draft := gen_random_uuid();
  INSERT INTO routine_versions (id, tenant_id, plan_id, version_number, status)
  VALUES (v_draft, p_tenant_id, p_plan_id, v_next, 'draft');
  RETURN v_draft;
END;
$$;

REVOKE ALL ON FUNCTION app.copy_routine_version(uuid, uuid, uuid, integer, text, uuid, date, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.publish_routine_version(uuid, uuid, uuid, text, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.assign_routine_to_student(uuid, uuid, uuid, uuid, date, date, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.ensure_routine_draft(uuid, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.copy_routine_version(uuid, uuid, uuid, integer, text, uuid, date, date, text) TO app_user, app_admin;
GRANT EXECUTE ON FUNCTION app.publish_routine_version(uuid, uuid, uuid, text, date, date) TO app_user, app_admin;
GRANT EXECUTE ON FUNCTION app.assign_routine_to_student(uuid, uuid, uuid, uuid, date, date, boolean) TO app_user, app_admin;
GRANT EXECUTE ON FUNCTION app.ensure_routine_draft(uuid, uuid, uuid) TO app_user, app_admin;
