-- Phase 3: exercise library + media assets (S3), with RLS fail-closed.

CREATE TABLE IF NOT EXISTS equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants (id), -- NULL = global library
  kind text NOT NULL DEFAULT 'video' CHECK (kind IN ('video', 'image')),
  storage_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending_upload'
    CHECK (status IN ('pending_upload', 'validating', 'ready', 'rejected', 'orphaned', 'deleted')),
  declared_size_bytes bigint,
  size_bytes bigint,
  sha256 text,
  container text,
  video_codec text,
  width integer,
  height integer,
  duration_ms integer,
  poster_key text,
  rejection_reason text,
  uploaded_by uuid REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Dedup ready assets per scope (global or tenant).
CREATE UNIQUE INDEX media_assets_ready_sha_global_uq
  ON media_assets (sha256)
  WHERE status = 'ready' AND tenant_id IS NULL AND sha256 IS NOT NULL;

CREATE UNIQUE INDEX media_assets_ready_sha_tenant_uq
  ON media_assets (tenant_id, sha256)
  WHERE status = 'ready' AND tenant_id IS NOT NULL AND sha256 IS NOT NULL;

CREATE INDEX media_assets_tenant_status_idx ON media_assets (tenant_id, status);

CREATE TABLE exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants (id), -- NULL = global
  current_revision_id uuid,
  based_on_exercise_id uuid REFERENCES exercises (id),
  created_by uuid REFERENCES users (id),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE exercise_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id uuid NOT NULL REFERENCES exercises (id),
  tenant_id uuid REFERENCES tenants (id),
  revision_number integer NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  primary_muscle_group_id uuid REFERENCES muscle_groups (id),
  equipment_id uuid REFERENCES equipment (id),
  video_media_id uuid REFERENCES media_assets (id),
  created_by uuid REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exercise_id, revision_number)
);

ALTER TABLE exercises
  ADD CONSTRAINT exercises_current_revision_fk
  FOREIGN KEY (current_revision_id) REFERENCES exercise_revisions (id);

CREATE TABLE exercise_muscle_groups (
  exercise_revision_id uuid NOT NULL REFERENCES exercise_revisions (id) ON DELETE CASCADE,
  muscle_group_id uuid NOT NULL REFERENCES muscle_groups (id),
  role text NOT NULL DEFAULT 'secondary' CHECK (role IN ('primary', 'secondary')),
  PRIMARY KEY (exercise_revision_id, muscle_group_id)
);

CREATE TABLE tenant_usage (
  tenant_id uuid PRIMARY KEY REFERENCES tenants (id),
  storage_bytes bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX exercises_tenant_idx ON exercises (tenant_id) WHERE archived_at IS NULL;
CREATE INDEX exercise_revisions_exercise_idx ON exercise_revisions (exercise_id);

-- Seed catalogues (idempotent)
INSERT INTO muscle_groups (slug, name) VALUES
  ('chest', 'Pecho'),
  ('back', 'Espalda'),
  ('shoulders', 'Hombros'),
  ('quads', 'Cuádriceps'),
  ('hamstrings', 'Isquiotibiales'),
  ('glutes', 'Glúteos'),
  ('core', 'Core'),
  ('biceps', 'Bíceps'),
  ('triceps', 'Tríceps'),
  ('calves', 'Pantorrillas')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO equipment (slug, name) VALUES
  ('bodyweight', 'Peso corporal'),
  ('dumbbell', 'Mancuernas'),
  ('barbell', 'Barra'),
  ('cable', 'Polea'),
  ('machine', 'Máquina'),
  ('band', 'Banda elástica')
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  equipment, media_assets, exercises, exercise_revisions, exercise_muscle_groups, tenant_usage
TO app_user, app_admin, app_worker;

GRANT SELECT ON
  equipment, media_assets, exercises, exercise_revisions, exercise_muscle_groups, tenant_usage
TO app_backup;

ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment FORCE ROW LEVEL SECURITY;
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_assets FORCE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises FORCE ROW LEVEL SECURITY;
ALTER TABLE exercise_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE exercise_muscle_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_muscle_groups FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_usage FORCE ROW LEVEL SECURITY;

-- equipment + muscle_groups: authenticated read; admin write
CREATE POLICY equipment_select_auth ON equipment
  FOR SELECT TO app_user, app_worker, app_admin
  USING (app.is_authenticated() OR current_user = 'app_admin');

CREATE POLICY equipment_admin_write ON equipment
  FOR ALL TO app_admin
  USING (true) WITH CHECK (true);

-- media_assets
CREATE POLICY media_select ON media_assets
  FOR SELECT TO app_user, app_worker
  USING (
    app.is_authenticated()
    AND (
      tenant_id IS NULL
      OR tenant_id = app.current_tenant_id()
    )
  );

CREATE POLICY media_owner_insert ON media_assets
  FOR INSERT TO app_user
  WITH CHECK (
    app.is_tenant_owner()
    AND tenant_id = app.current_tenant_id()
    AND uploaded_by = app.current_user_id()
  );

CREATE POLICY media_owner_update ON media_assets
  FOR UPDATE TO app_user
  USING (tenant_id = app.current_tenant_id() AND app.is_tenant_owner())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.is_tenant_owner());

CREATE POLICY media_worker_all ON media_assets
  FOR ALL TO app_worker
  USING (true) WITH CHECK (true);

CREATE POLICY media_admin_all ON media_assets
  FOR ALL TO app_admin
  USING (true) WITH CHECK (true);

-- exercises
CREATE POLICY exercises_select ON exercises
  FOR SELECT TO app_user, app_worker
  USING (
    app.is_authenticated()
    AND (tenant_id IS NULL OR tenant_id = app.current_tenant_id())
  );

CREATE POLICY exercises_owner_insert ON exercises
  FOR INSERT TO app_user
  WITH CHECK (
    app.is_tenant_owner()
    AND tenant_id = app.current_tenant_id()
    AND created_by = app.current_user_id()
  );

CREATE POLICY exercises_owner_update ON exercises
  FOR UPDATE TO app_user
  USING (tenant_id = app.current_tenant_id() AND app.is_tenant_owner())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.is_tenant_owner());

CREATE POLICY exercises_admin_all ON exercises
  FOR ALL TO app_admin
  USING (true) WITH CHECK (true);

-- exercise_revisions
CREATE POLICY exercise_revisions_select ON exercise_revisions
  FOR SELECT TO app_user, app_worker
  USING (
    app.is_authenticated()
    AND (tenant_id IS NULL OR tenant_id = app.current_tenant_id())
  );

CREATE POLICY exercise_revisions_owner_insert ON exercise_revisions
  FOR INSERT TO app_user
  WITH CHECK (
    app.is_tenant_owner()
    AND tenant_id = app.current_tenant_id()
    AND created_by = app.current_user_id()
  );

-- Revisions are immutable: no update/delete for app_user
CREATE POLICY exercise_revisions_admin_all ON exercise_revisions
  FOR ALL TO app_admin
  USING (true) WITH CHECK (true);

-- exercise_muscle_groups via revision visibility
CREATE POLICY exercise_muscle_groups_select ON exercise_muscle_groups
  FOR SELECT TO app_user, app_worker
  USING (
    EXISTS (
      SELECT 1 FROM exercise_revisions r
      WHERE r.id = exercise_revision_id
        AND (r.tenant_id IS NULL OR r.tenant_id = app.current_tenant_id())
    )
  );

CREATE POLICY exercise_muscle_groups_owner_insert ON exercise_muscle_groups
  FOR INSERT TO app_user
  WITH CHECK (
    app.is_tenant_owner()
    AND EXISTS (
      SELECT 1 FROM exercise_revisions r
      WHERE r.id = exercise_revision_id
        AND r.tenant_id = app.current_tenant_id()
    )
  );

CREATE POLICY exercise_muscle_groups_admin_all ON exercise_muscle_groups
  FOR ALL TO app_admin
  USING (true) WITH CHECK (true);

-- tenant_usage
CREATE POLICY tenant_usage_owner_select ON tenant_usage
  FOR SELECT TO app_user
  USING (tenant_id = app.current_tenant_id() AND app.is_tenant_owner());

CREATE POLICY tenant_usage_owner_upsert ON tenant_usage
  FOR ALL TO app_user
  USING (tenant_id = app.current_tenant_id() AND app.is_tenant_owner())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.is_tenant_owner());

CREATE POLICY tenant_usage_admin_all ON tenant_usage
  FOR ALL TO app_admin
  USING (true) WITH CHECK (true);

CREATE POLICY tenant_usage_worker_all ON tenant_usage
  FOR ALL TO app_worker
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Privileged helpers for creating revisions atomically
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.create_exercise_with_revision(
  p_tenant_id uuid,
  p_user_id uuid,
  p_based_on uuid,
  p_name text,
  p_description text,
  p_instructions text,
  p_primary_muscle uuid,
  p_equipment_id uuid,
  p_video_media_id uuid,
  p_secondary_muscles uuid[]
) RETURNS TABLE (exercise_id uuid, revision_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ex uuid := gen_random_uuid();
  v_rev uuid := gen_random_uuid();
  v_mg uuid;
BEGIN
  IF p_based_on IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM exercises e WHERE e.id = p_based_on AND e.tenant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'based_on_must_be_global' USING ERRCODE = '22000';
  END IF;

  IF p_video_media_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM media_assets m
    WHERE m.id = p_video_media_id
      AND m.status = 'ready'
      AND (m.tenant_id IS NULL OR m.tenant_id = p_tenant_id)
  ) THEN
    RAISE EXCEPTION 'invalid_video_media' USING ERRCODE = '22000';
  END IF;

  INSERT INTO exercises (id, tenant_id, based_on_exercise_id, created_by)
  VALUES (v_ex, p_tenant_id, p_based_on, p_user_id);

  INSERT INTO exercise_revisions (
    id, exercise_id, tenant_id, revision_number, name, description, instructions,
    primary_muscle_group_id, equipment_id, video_media_id, created_by
  ) VALUES (
    v_rev, v_ex, p_tenant_id, 1, p_name, p_description, p_instructions,
    p_primary_muscle, p_equipment_id, p_video_media_id, p_user_id
  );

  UPDATE exercises SET current_revision_id = v_rev, updated_at = now() WHERE id = v_ex;

  IF p_primary_muscle IS NOT NULL THEN
    INSERT INTO exercise_muscle_groups (exercise_revision_id, muscle_group_id, role)
    VALUES (v_rev, p_primary_muscle, 'primary')
    ON CONFLICT DO NOTHING;
  END IF;

  IF p_secondary_muscles IS NOT NULL THEN
    FOREACH v_mg IN ARRAY p_secondary_muscles LOOP
      IF v_mg IS DISTINCT FROM p_primary_muscle THEN
        INSERT INTO exercise_muscle_groups (exercise_revision_id, muscle_group_id, role)
        VALUES (v_rev, v_mg, 'secondary')
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  exercise_id := v_ex;
  revision_id := v_rev;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION app.append_exercise_revision(
  p_exercise_id uuid,
  p_tenant_id uuid,
  p_user_id uuid,
  p_name text,
  p_description text,
  p_instructions text,
  p_primary_muscle uuid,
  p_equipment_id uuid,
  p_video_media_id uuid,
  p_secondary_muscles uuid[]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rev uuid := gen_random_uuid();
  v_num integer;
  v_mg uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM exercises e
    WHERE e.id = p_exercise_id AND e.tenant_id = p_tenant_id AND e.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'exercise_not_editable' USING ERRCODE = '22000';
  END IF;

  IF p_video_media_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM media_assets m
    WHERE m.id = p_video_media_id
      AND m.status = 'ready'
      AND (m.tenant_id IS NULL OR m.tenant_id = p_tenant_id)
  ) THEN
    RAISE EXCEPTION 'invalid_video_media' USING ERRCODE = '22000';
  END IF;

  SELECT COALESCE(MAX(revision_number), 0) + 1 INTO v_num
  FROM exercise_revisions WHERE exercise_id = p_exercise_id;

  INSERT INTO exercise_revisions (
    id, exercise_id, tenant_id, revision_number, name, description, instructions,
    primary_muscle_group_id, equipment_id, video_media_id, created_by
  ) VALUES (
    v_rev, p_exercise_id, p_tenant_id, v_num, p_name, p_description, p_instructions,
    p_primary_muscle, p_equipment_id, p_video_media_id, p_user_id
  );

  UPDATE exercises SET current_revision_id = v_rev, updated_at = now()
  WHERE id = p_exercise_id;

  IF p_primary_muscle IS NOT NULL THEN
    INSERT INTO exercise_muscle_groups (exercise_revision_id, muscle_group_id, role)
    VALUES (v_rev, p_primary_muscle, 'primary')
    ON CONFLICT DO NOTHING;
  END IF;

  IF p_secondary_muscles IS NOT NULL THEN
    FOREACH v_mg IN ARRAY p_secondary_muscles LOOP
      IF v_mg IS DISTINCT FROM p_primary_muscle THEN
        INSERT INTO exercise_muscle_groups (exercise_revision_id, muscle_group_id, role)
        VALUES (v_rev, v_mg, 'secondary')
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN v_rev;
END;
$$;

REVOKE ALL ON FUNCTION app.create_exercise_with_revision(uuid, uuid, uuid, text, text, text, uuid, uuid, uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.append_exercise_revision(uuid, uuid, uuid, text, text, text, uuid, uuid, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.create_exercise_with_revision(uuid, uuid, uuid, text, text, text, uuid, uuid, uuid, uuid[]) TO app_user, app_admin;
GRANT EXECUTE ON FUNCTION app.append_exercise_revision(uuid, uuid, uuid, text, text, text, uuid, uuid, uuid, uuid[]) TO app_user, app_admin;

-- Small representative global library (no videos — trainers attach their own when customizing).
DO $$
DECLARE
  mg_chest uuid; mg_back uuid; mg_quads uuid; mg_glutes uuid; mg_core uuid; mg_shoulders uuid;
  eq_bw uuid; eq_db uuid; eq_bb uuid;
  ex uuid; rev uuid;
BEGIN
  SELECT id INTO mg_chest FROM muscle_groups WHERE slug = 'chest';
  SELECT id INTO mg_back FROM muscle_groups WHERE slug = 'back';
  SELECT id INTO mg_quads FROM muscle_groups WHERE slug = 'quads';
  SELECT id INTO mg_glutes FROM muscle_groups WHERE slug = 'glutes';
  SELECT id INTO mg_core FROM muscle_groups WHERE slug = 'core';
  SELECT id INTO mg_shoulders FROM muscle_groups WHERE slug = 'shoulders';
  SELECT id INTO eq_bw FROM equipment WHERE slug = 'bodyweight';
  SELECT id INTO eq_db FROM equipment WHERE slug = 'dumbbell';
  SELECT id INTO eq_bb FROM equipment WHERE slug = 'barbell';

  IF NOT EXISTS (SELECT 1 FROM exercises WHERE tenant_id IS NULL) THEN
    -- Push-up
    ex := gen_random_uuid(); rev := gen_random_uuid();
    INSERT INTO exercises (id, tenant_id, created_by) VALUES (ex, NULL, NULL);
    INSERT INTO exercise_revisions (id, exercise_id, tenant_id, revision_number, name, description, instructions, primary_muscle_group_id, equipment_id)
    VALUES (rev, ex, NULL, 1, 'Flexiones', 'Empuje de peso corporal para pecho y tríceps.',
            'Manos al ancho de hombros. Bajá el pecho hacia el piso y empujá hasta extender los brazos.',
            mg_chest, eq_bw);
    UPDATE exercises SET current_revision_id = rev WHERE id = ex;
    INSERT INTO exercise_muscle_groups VALUES (rev, mg_chest, 'primary');

    -- Squat
    ex := gen_random_uuid(); rev := gen_random_uuid();
    INSERT INTO exercises (id, tenant_id, created_by) VALUES (ex, NULL, NULL);
    INSERT INTO exercise_revisions (id, exercise_id, tenant_id, revision_number, name, description, instructions, primary_muscle_group_id, equipment_id)
    VALUES (rev, ex, NULL, 1, 'Sentadilla', 'Sentadilla de peso corporal o con carga.',
            'Pies al ancho de hombros. Bajá empujando cadera atrás, rodillas alineadas con los pies.',
            mg_quads, eq_bw);
    UPDATE exercises SET current_revision_id = rev WHERE id = ex;
    INSERT INTO exercise_muscle_groups VALUES (rev, mg_quads, 'primary'), (rev, mg_glutes, 'secondary');

    -- Hip hinge / RDL pattern
    ex := gen_random_uuid(); rev := gen_random_uuid();
    INSERT INTO exercises (id, tenant_id, created_by) VALUES (ex, NULL, NULL);
    INSERT INTO exercise_revisions (id, exercise_id, tenant_id, revision_number, name, description, instructions, primary_muscle_group_id, equipment_id)
    VALUES (rev, ex, NULL, 1, 'Peso muerto rumano', 'Bisagra de cadera con barra o mancuernas.',
            'Cadera atrás, espalda neutra, bajá la carga hasta sentir el estiramiento en isquios y glúteos.',
            mg_glutes, eq_bb);
    UPDATE exercises SET current_revision_id = rev WHERE id = ex;
    INSERT INTO exercise_muscle_groups VALUES (rev, mg_glutes, 'primary');

    -- Row
    ex := gen_random_uuid(); rev := gen_random_uuid();
    INSERT INTO exercises (id, tenant_id, created_by) VALUES (ex, NULL, NULL);
    INSERT INTO exercise_revisions (id, exercise_id, tenant_id, revision_number, name, description, instructions, primary_muscle_group_id, equipment_id)
    VALUES (rev, ex, NULL, 1, 'Remo con mancuerna', 'Tirón unilateral para espalda.',
            'Apoyá una rodilla en el banco. Tirás la mancuerna hacia la cadera manteniendo el torso estable.',
            mg_back, eq_db);
    UPDATE exercises SET current_revision_id = rev WHERE id = ex;
    INSERT INTO exercise_muscle_groups VALUES (rev, mg_back, 'primary');

    -- Overhead press
    ex := gen_random_uuid(); rev := gen_random_uuid();
    INSERT INTO exercises (id, tenant_id, created_by) VALUES (ex, NULL, NULL);
    INSERT INTO exercise_revisions (id, exercise_id, tenant_id, revision_number, name, description, instructions, primary_muscle_group_id, equipment_id)
    VALUES (rev, ex, NULL, 1, 'Press militar', 'Empuje vertical de hombros.',
            'Empujá la barra o mancuernas por encima de la cabeza sin arquear la lumbar en exceso.',
            mg_shoulders, eq_db);
    UPDATE exercises SET current_revision_id = rev WHERE id = ex;
    INSERT INTO exercise_muscle_groups VALUES (rev, mg_shoulders, 'primary');

    -- Plank
    ex := gen_random_uuid(); rev := gen_random_uuid();
    INSERT INTO exercises (id, tenant_id, created_by) VALUES (ex, NULL, NULL);
    INSERT INTO exercise_revisions (id, exercise_id, tenant_id, revision_number, name, description, instructions, primary_muscle_group_id, equipment_id)
    VALUES (rev, ex, NULL, 1, 'Plancha', 'Isométrico de core.',
            'Apoyá antebrazos y puntas de pies. Mantené el cuerpo en línea sin hundir la cadera.',
            mg_core, eq_bw);
    UPDATE exercises SET current_revision_id = rev WHERE id = ex;
    INSERT INTO exercise_muscle_groups VALUES (rev, mg_core, 'primary');
  END IF;
END $$;
