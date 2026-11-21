import type { Sql } from 'postgres';

export interface TenantContext {
  realm: string;
  userId: string;
  tenantId: string | null;
  membershipId: string | null;
  role: string | null;
}

/**
 * Runs work inside a transaction with local session variables for RLS.
 * Variables are transaction-scoped (`true` / IS_LOCAL), so they are safe with pooled connections.
 */
export async function withTenantContext<T>(
  sql: Sql,
  context: TenantContext,
  work: (tx: Sql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.realm', ${context.realm}, true)`;
    await tx`SELECT set_config('app.user_id', ${context.userId}, true)`;
    await tx`SELECT set_config('app.tenant_id', ${context.tenantId ?? ''}, true)`;
    await tx`SELECT set_config('app.membership_id', ${context.membershipId ?? ''}, true)`;
    await tx`SELECT set_config('app.role', ${context.role ?? ''}, true)`;
    return work(tx as unknown as Sql);
  }) as Promise<T>;
}
