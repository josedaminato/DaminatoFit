import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { BrandId, RealmId } from '@daminatofit/brand';
import type { Sql } from 'postgres';
import type { AuthInstance } from '../auth/realms';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function ensureDomainUser(
  sql: Sql,
  input: { realm: RealmId; authUserId: string; displayName: string },
): Promise<{ id: string }> {
  const existing = await sql<{ id: string }[]>`
    SELECT id FROM users
    WHERE realm = ${input.realm} AND auth_user_id = ${input.authUserId}
    LIMIT 1
  `;
  if (existing[0]) return existing[0];

  const id = randomUUID();
  await sql`
    INSERT INTO users (id, realm, auth_user_id, display_name, platform_role, status)
    VALUES (${id}, ${input.realm}, ${input.authUserId}, ${input.displayName}, 'user', 'active')
  `;
  return { id };
}

export async function createTrainerSpace(
  sql: Sql,
  input: {
    brandId: BrandId;
    realm: RealmId;
    ownerUserId: string;
    businessName: string;
    displayName: string;
  },
): Promise<{ tenantId: string; membershipId: string }> {
  const brand = await sql<{ id: string; max_tenants: number | null }[]>`
    SELECT id, max_tenants FROM brands WHERE slug = ${input.brandId} AND realm = ${input.realm}
    LIMIT 1
  `;
  if (!brand[0]) {
    throw new Error('brand_not_found');
  }

  const tenantId = randomUUID();
  const membershipId = randomUUID();

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO tenants (id, brand_id, kind, name, owner_user_id, status)
      VALUES (${tenantId}, ${brand[0]!.id}, 'trainer', ${input.businessName}, ${input.ownerUserId}, 'active')
    `;
    await tx`
      INSERT INTO memberships (id, tenant_id, user_id, role, status, activated_at)
      VALUES (${membershipId}, ${tenantId}, ${input.ownerUserId}, 'owner', 'active', now())
    `;
    await tx`
      INSERT INTO membership_events (tenant_id, membership_id, from_status, to_status, actor_user_id)
      VALUES (${tenantId}, ${membershipId}, NULL, 'active', ${input.ownerUserId})
    `;
    await tx`
      INSERT INTO trainer_profiles (tenant_id, display_name)
      VALUES (${tenantId}, ${input.displayName})
    `;
  });

  return { tenantId, membershipId };
}

export async function signUpAuthUser(
  auth: AuthInstance,
  input: { email: string; password: string; name: string },
): Promise<{ userId: string; headers: Headers }> {
  const result = await auth.api.signUpEmail({
    body: {
      email: input.email,
      password: input.password,
      name: input.name,
    },
    returnHeaders: true,
  });

  if (!result || !('user' in result)) {
    throw new Error('signup_failed');
  }

  // better-auth return shape varies; normalize.
  const payload = result as unknown as {
    user?: { id: string };
    headers?: Headers;
  };

  // When returnHeaders is true, API may return { headers, response }
  const withHeaders = result as unknown as {
    headers?: Headers;
    response?: { user: { id: string } };
    user?: { id: string };
  };

  const userId = withHeaders.response?.user?.id ?? withHeaders.user?.id ?? payload.user?.id;
  if (!userId) {
    throw new Error('signup_failed');
  }

  return {
    userId,
    headers: withHeaders.headers ?? new Headers(),
  };
}

export async function deleteAuthUser(sql: Sql, realm: RealmId, authUserId: string): Promise<void> {
  const schema = realm === 'daminatofit' ? 'auth_daminatofit' : 'auth_pupiapp';
  await sql.unsafe(`DELETE FROM ${schema}."user" WHERE id = $1`, [authUserId]);
}
