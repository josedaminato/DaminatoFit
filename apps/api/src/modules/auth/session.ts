import { getBrand, realmForBrand, type BrandId, type RealmId } from '@daminatofit/brand';
import { APP_BRAND_HEADER, TENANT_ID_HEADER } from '@daminatofit/contracts';
import type { FastifyRequest } from 'fastify';
import type { Sql } from 'postgres';
import type { AuthInstance } from './realms';

export interface DomainUser {
  id: string;
  realm: RealmId;
  authUserId: string;
  displayName: string;
  platformRole: string;
  status: string;
}

export interface ActiveMembership {
  id: string;
  tenantId: string;
  role: string;
  status: string;
}

export interface AuthContext {
  brandId: BrandId;
  realm: RealmId;
  authUserId: string;
  email: string;
  domainUser: DomainUser;
  membership: ActiveMembership | null;
}

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const raw = request.headers[name];
  return typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : undefined;
}

export function fromFastifyHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

export async function resolveAuthContext(
  request: FastifyRequest,
  auths: Record<RealmId, AuthInstance>,
  appSql: Sql,
): Promise<AuthContext | null> {
  const brandHeader = headerValue(request, APP_BRAND_HEADER);
  if (!brandHeader) return null;

  let brandId: BrandId;
  try {
    brandId = getBrand(brandHeader).id;
  } catch {
    return null;
  }

  const realm = realmForBrand(brandId);
  const auth = auths[realm];

  const session = await auth.api.getSession({
    headers: fromFastifyHeaders(request),
  });
  if (!session) return null;

  const rows = await appSql<
    {
      id: string;
      realm: RealmId;
      auth_user_id: string;
      display_name: string;
      platform_role: string;
      status: string;
    }[]
  >`SELECT * FROM app.resolve_domain_user(${realm}, ${session.user.id})`;

  const row = rows[0];
  if (!row) return null;

  const domainUser: DomainUser = {
    id: row.id,
    realm: row.realm,
    authUserId: row.auth_user_id,
    displayName: row.display_name,
    platformRole: row.platform_role,
    status: row.status,
  };

  const tenantHeader = headerValue(request, TENANT_ID_HEADER);
  let membership: ActiveMembership | null = null;

  if (tenantHeader) {
    const memberships = await appSql<
      {
        id: string;
        tenant_id: string;
        role: string;
        status: string;
        brand_slug: string;
      }[]
    >`
      SELECT id, tenant_id, role, status, brand_slug
      FROM app.list_memberships_for_user(${domainUser.id})
      WHERE tenant_id = ${tenantHeader} AND brand_slug = ${brandId}
      LIMIT 1
    `;
    const m = memberships[0];
    if (!m) return null;
    membership = {
      id: m.id,
      tenantId: m.tenant_id,
      role: m.role,
      status: m.status,
    };
  }

  return {
    brandId,
    realm,
    authUserId: session.user.id,
    email: session.user.email,
    domainUser,
    membership,
  };
}

export function toTenantContext(auth: AuthContext) {
  return {
    realm: auth.realm,
    userId: auth.domainUser.id,
    tenantId: auth.membership?.tenantId ?? null,
    membershipId: auth.membership?.id ?? null,
    role: auth.membership?.role ?? null,
  };
}
