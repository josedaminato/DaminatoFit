-- Phase 5.1: typed appearance helpers + logo FK for tenant branding JSON.

-- Optional FK column mirroring branding.logoMediaId for referential cleanup.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS logo_media_id uuid REFERENCES media_assets (id);

CREATE INDEX IF NOT EXISTS tenants_logo_media_idx ON tenants (logo_media_id)
  WHERE logo_media_id IS NOT NULL;

-- Ensure branding JSON always has a known shape for new tenants (existing rows untouched).
-- Defaults applied by the API when reading via parseTenantAppearance.
