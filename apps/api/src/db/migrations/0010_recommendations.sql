-- Phase 8: trainer-managed recommendations. Not a provider directory.
-- Moderation functions run as the table owner but only after the API sets
-- app.user_id to an authenticated platform admin. app_user has no broad UPDATE
-- on moderation columns. The migrator superuser connection is not required.

CREATE TABLE recommendation_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9_]{2,40}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO recommendation_categories (slug, name, sort_order) VALUES
  ('apparel', 'Indumentaria deportiva', 10),
  ('equipment', 'Equipamiento deportivo', 20),
  ('meals', 'Viandas saludables', 30),
  ('nutrition', 'Nutrición', 40),
  ('kinesiology', 'Kinesiología', 50),
  ('physiotherapy', 'Fisioterapia', 60),
  ('recovery', 'Recuperación física', 70),
  ('gyms', 'Gimnasios y centros deportivos', 80),
  ('other_services', 'Otros servicios relacionados', 90),
  ('other', 'Otros', 100);

CREATE TABLE trainer_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  author_user_id uuid NOT NULL REFERENCES users (id),
  category_id uuid NOT NULL REFERENCES recommendation_categories (id),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '',
  image_media_id uuid REFERENCES media_assets (id),
  destination_kind text NOT NULL CHECK (destination_kind IN ('website', 'whatsapp', 'instagram', 'maps', 'other')),
  destination_url text NOT NULL CHECK (char_length(destination_url) BETWEEN 8 AND 500),
  action_label text,
  benefit_label text,
  benefit_description text,
  promo_code text,
  benefit_terms text,
  benefit_expires_on date,
  professional_license text,
  commercial_declared boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'hidden', 'archived')),
  sort_order integer NOT NULL DEFAULT 0,
  moderation_hidden_at timestamptz,
  moderation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trainer_recommendations_benefit_declared_chk CHECK (
    commercial_declared
    OR (
      benefit_label IS NULL
      AND benefit_description IS NULL
      AND promo_code IS NULL
      AND benefit_terms IS NULL
      AND benefit_expires_on IS NULL
    )
  )
);

CREATE INDEX trainer_recommendations_tenant_status_idx
  ON trainer_recommendations (tenant_id, status, sort_order);
CREATE INDEX trainer_recommendations_category_idx
  ON trainer_recommendations (category_id);

CREATE TABLE recommendation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid NOT NULL REFERENCES trainer_recommendations (id),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  reporter_user_id uuid NOT NULL REFERENCES users (id),
  reporter_membership_id uuid NOT NULL REFERENCES memberships (id),
  reason text NOT NULL CHECK (reason IN ('fraudulent', 'misleading', 'dangerous', 'inappropriate', 'suspicious_link')),
  details text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'hidden', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recommendation_id, reporter_membership_id)
);

CREATE INDEX recommendation_reports_status_idx
  ON recommendation_reports (status, created_at DESC);
CREATE INDEX recommendation_reports_tenant_idx
  ON recommendation_reports (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION app.recommendations_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND current_user = 'app_user' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.author_user_id IS DISTINCT FROM OLD.author_user_id
       OR NEW.moderation_hidden_at IS DISTINCT FROM OLD.moderation_hidden_at
       OR NEW.moderation_reason IS DISTINCT FROM OLD.moderation_reason THEN
      RAISE EXCEPTION 'recommendation protected fields'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trainer_recommendations_guard
  BEFORE UPDATE ON trainer_recommendations
  FOR EACH ROW EXECUTE FUNCTION app.recommendations_guard();

CREATE OR REPLACE FUNCTION app.recommendation_reports_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user = 'app_user' THEN
    RAISE EXCEPTION 'recommendation reports are not editable by app_user'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER recommendation_reports_no_app_user_mutation
  BEFORE UPDATE OR DELETE ON recommendation_reports
  FOR EACH ROW EXECUTE FUNCTION app.recommendation_reports_immutable();

-- ---------------------------------------------------------------------------
-- Narrow moderation helpers. Caller must set app.user_id in the same transaction.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.assert_platform_admin_actor(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('app.user_id', true) IS DISTINCT FROM p_actor::text THEN
    RAISE EXCEPTION 'actor mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = p_actor
      AND u.realm = 'daminatofit'
      AND u.platform_role = 'platform_admin'
      AND u.status = 'active'
      AND u.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'platform admin required' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.add_recommendation_category(
  p_actor uuid,
  p_slug text,
  p_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM app.assert_platform_admin_actor(p_actor);
  INSERT INTO recommendation_categories (slug, name, sort_order)
  VALUES (p_slug, p_name, 1000)
  RETURNING id INTO v_id;
  PERFORM app.write_platform_admin_audit(
    p_actor, 'recommendation_category.create', 'recommendation_category', v_id, 'success', p_name,
    jsonb_build_object('slug', p_slug)
  );
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.list_recommendation_reports(p_actor uuid, p_brand text)
RETURNS TABLE (
  report_id uuid,
  recommendation_id uuid,
  brand_slug text,
  tenant_id uuid,
  trainer_name text,
  recommendation_name text,
  destination_url text,
  reason text,
  details text,
  report_status text,
  created_at timestamptz,
  moderation_hidden_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM app.assert_platform_admin_actor(p_actor);
  IF p_brand IS NOT NULL AND p_brand NOT IN ('daminatofit', 'pupiapp') THEN
    RAISE EXCEPTION 'invalid brand' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT
    rr.id,
    r.id,
    b.slug,
    t.id,
    COALESCE(tp.display_name, t.name),
    r.name,
    r.destination_url,
    rr.reason,
    rr.details,
    rr.status,
    rr.created_at,
    r.moderation_hidden_at
  FROM recommendation_reports rr
  JOIN trainer_recommendations r ON r.id = rr.recommendation_id
  JOIN tenants t ON t.id = r.tenant_id
  JOIN brands b ON b.id = t.brand_id
  LEFT JOIN trainer_profiles tp ON tp.tenant_id = t.id
  WHERE p_brand IS NULL OR b.slug = p_brand
  ORDER BY rr.created_at DESC
  LIMIT 200;
END;
$$;

CREATE OR REPLACE FUNCTION app.recommendation_counts_by_brand(p_actor uuid)
RETURNS TABLE (
  brand_slug text,
  published_count integer,
  hidden_by_trainer integer,
  hidden_by_moderation integer,
  open_reports integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM app.assert_platform_admin_actor(p_actor);
  RETURN QUERY
  SELECT
    b.slug,
    count(r.id) FILTER (WHERE r.status = 'published' AND r.moderation_hidden_at IS NULL)::int,
    count(r.id) FILTER (WHERE r.status = 'hidden')::int,
    count(r.id) FILTER (WHERE r.moderation_hidden_at IS NOT NULL)::int,
    (
      SELECT count(*)::int
      FROM recommendation_reports rr
      JOIN trainer_recommendations r2 ON r2.id = rr.recommendation_id
      JOIN tenants t2 ON t2.id = r2.tenant_id
      WHERE t2.brand_id = b.id AND rr.status = 'open'
    )
  FROM brands b
  LEFT JOIN tenants t ON t.brand_id = b.id
  LEFT JOIN trainer_recommendations r ON r.tenant_id = t.id
  WHERE b.slug IN ('daminatofit', 'pupiapp')
  GROUP BY b.id, b.slug
  ORDER BY b.slug;
END;
$$;

CREATE OR REPLACE FUNCTION app.moderate_recommendation(
  p_actor uuid,
  p_report_id uuid,
  p_action text,
  p_reason text
)
RETURNS TABLE (recommendation_id uuid, report_status text, moderation_hidden boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recommendation uuid;
  v_hidden boolean;
BEGIN
  PERFORM app.assert_platform_admin_actor(p_actor);
  IF p_action NOT IN ('hide', 'dismiss') THEN
    RAISE EXCEPTION 'invalid action' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
  END IF;

  SELECT rr.recommendation_id INTO v_recommendation
  FROM recommendation_reports rr
  WHERE rr.id = p_report_id
  FOR UPDATE;

  IF v_recommendation IS NULL THEN
    RAISE EXCEPTION 'report not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_action = 'hide' THEN
    UPDATE trainer_recommendations
    SET moderation_hidden_at = COALESCE(moderation_hidden_at, now()),
        moderation_reason = trim(p_reason),
        updated_at = now()
    WHERE id = v_recommendation;
    UPDATE recommendation_reports
    SET status = 'hidden'
    WHERE id = p_report_id;
    v_hidden := true;
  ELSE
    UPDATE recommendation_reports
    SET status = 'dismissed'
    WHERE id = p_report_id;
    v_hidden := EXISTS (
      SELECT 1 FROM trainer_recommendations WHERE id = v_recommendation AND moderation_hidden_at IS NOT NULL
    );
  END IF;

  PERFORM app.write_platform_admin_audit(
    p_actor,
    CASE WHEN p_action = 'hide' THEN 'recommendation.hide' ELSE 'recommendation.report_dismiss' END,
    'trainer_recommendation',
    v_recommendation,
    'success',
    trim(p_reason),
    jsonb_build_object('reportId', p_report_id, 'action', p_action)
  );

  recommendation_id := v_recommendation;
  report_status := CASE WHEN p_action = 'hide' THEN 'hidden' ELSE 'dismissed' END;
  moderation_hidden := v_hidden;
  RETURN NEXT;
END;
$$;

GRANT SELECT ON recommendation_categories TO app_user, app_backup;
GRANT SELECT, INSERT, UPDATE ON trainer_recommendations TO app_user;
GRANT SELECT ON trainer_recommendations TO app_backup;
GRANT SELECT, INSERT ON recommendation_reports TO app_user;
GRANT SELECT ON recommendation_reports TO app_backup;

ALTER TABLE recommendation_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE trainer_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_recommendations FORCE ROW LEVEL SECURITY;
ALTER TABLE recommendation_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_reports FORCE ROW LEVEL SECURITY;

CREATE POLICY recommendation_categories_read ON recommendation_categories
  FOR SELECT TO app_user
  USING (active AND app.is_authenticated());

CREATE POLICY trainer_recommendations_owner ON trainer_recommendations
  FOR ALL TO app_user
  USING (tenant_id = app.current_tenant_id() AND app.is_tenant_owner())
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    AND app.is_tenant_owner()
    AND author_user_id = app.current_user_id()
  );

CREATE POLICY trainer_recommendations_student_select ON trainer_recommendations
  FOR SELECT TO app_user
  USING (
    tenant_id = app.current_tenant_id()
    AND app.is_tenant_student()
    AND status = 'published'
    AND moderation_hidden_at IS NULL
  );

CREATE POLICY recommendation_reports_reporter_select ON recommendation_reports
  FOR SELECT TO app_user
  USING (
    tenant_id = app.current_tenant_id()
    AND reporter_user_id = app.current_user_id()
  );

CREATE POLICY recommendation_reports_student_insert ON recommendation_reports
  FOR INSERT TO app_user
  WITH CHECK (
    app.is_tenant_student()
    AND tenant_id = app.current_tenant_id()
    AND reporter_user_id = app.current_user_id()
    AND reporter_membership_id = app.current_membership_id()
    AND EXISTS (
      SELECT 1 FROM trainer_recommendations r
      WHERE r.id = recommendation_id
        AND r.tenant_id = app.current_tenant_id()
        AND r.status = 'published'
        AND r.moderation_hidden_at IS NULL
    )
  );

REVOKE ALL ON FUNCTION app.recommendations_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.recommendation_reports_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.assert_platform_admin_actor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.add_recommendation_category(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.list_recommendation_reports(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.recommendation_counts_by_brand(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.moderate_recommendation(uuid, uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.recommendations_guard() TO app_user;
GRANT EXECUTE ON FUNCTION app.recommendation_reports_immutable() TO app_user;
GRANT EXECUTE ON FUNCTION app.add_recommendation_category(uuid, text, text) TO app_user;
GRANT EXECUTE ON FUNCTION app.list_recommendation_reports(uuid, text) TO app_user;
GRANT EXECUTE ON FUNCTION app.recommendation_counts_by_brand(uuid) TO app_user;
GRANT EXECUTE ON FUNCTION app.moderate_recommendation(uuid, uuid, text, text) TO app_user;
