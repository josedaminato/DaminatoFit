import { z } from 'zod';

/** Commercial estimate rules — never claimed as charged amounts. */
export const DEFAULT_COMMERCIAL_RULE = {
  version: 1,
  currency: 'USD',
  priceCentsPerBillableStudent: 200,
  monthlyCapCents: 2000,
  /**
   * Billable definition is still provisional.
   * Simulation uses active student memberships and must be labeled as such.
   */
  billableBasis: 'active_student_memberships_simulation' as const,
} as const;

export type CommercialRule = {
  version: number;
  currency: 'USD';
  priceCentsPerBillableStudent: number;
  monthlyCapCents: number;
  billableBasis: string;
};

/** Exact integer cents: min(n * price, cap). */
export function estimateMonthlyCents(
  billableStudentCount: number,
  rule: Pick<
    CommercialRule,
    'priceCentsPerBillableStudent' | 'monthlyCapCents'
  > = DEFAULT_COMMERCIAL_RULE,
): number {
  if (!Number.isInteger(billableStudentCount) || billableStudentCount < 0) {
    throw new Error('billableStudentCount must be a non-negative integer');
  }
  if (
    !Number.isInteger(rule.priceCentsPerBillableStudent) ||
    rule.priceCentsPerBillableStudent < 0
  ) {
    throw new Error('priceCentsPerBillableStudent must be a non-negative integer');
  }
  if (!Number.isInteger(rule.monthlyCapCents) || rule.monthlyCapCents < 0) {
    throw new Error('monthlyCapCents must be a non-negative integer');
  }
  return Math.min(billableStudentCount * rule.priceCentsPerBillableStudent, rule.monthlyCapCents);
}

export function formatUsdFromCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${sign}USD ${dollars}.${String(rem).padStart(2, '0')}`;
}

/**
 * Referral model (documented only — not applied as automatic discounts).
 * One valid referred trainer in the calendar month → 1/3 off that month's fee.
 * Three valid referrals → 100% off that month. Benefits do not carry over.
 */
export const REFERRAL_POLICY = {
  discountFractionPerValidReferral: 1 / 3,
  maxReferralsForFullMonthWaiver: 3,
  carriesOverMonths: false,
  publicCodesEnabled: false,
  automaticDiscountsEnabled: false,
} as const;

export const AdminPeriodSchema = z.enum(['7d', '30d', '90d', '12m']);
export type AdminPeriod = z.infer<typeof AdminPeriodSchema>;

export const AdminTrainerStatusFilterSchema = z.enum(['all', 'active', 'paused', 'archived']);

export const AdminTenantStatusSchema = z.enum(['active', 'paused', 'archived']);

export const AdminTrainerListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: AdminTrainerStatusFilterSchema.default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z
    .enum(['created_at_desc', 'created_at_asc', 'name_asc', 'students_desc', 'storage_desc'])
    .default('created_at_desc'),
});

export const AdminSetTenantStatusSchema = z.object({
  status: AdminTenantStatusSchema,
  reason: z.string().trim().min(3).max(500),
  confirm: z.literal(true),
});

export const AdminCommercialRuleWriteSchema = z.object({
  priceCentsPerBillableStudent: z.number().int().min(0).max(100_000),
  monthlyCapCents: z.number().int().min(0).max(1_000_000),
  note: z.string().trim().min(3).max(500),
  confirm: z.literal(true),
});

export const AdminAuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  action: z.string().trim().max(80).optional(),
});

export const AdminPeriodQuerySchema = z.object({
  period: AdminPeriodSchema.default('30d'),
});
