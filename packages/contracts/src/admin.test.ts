import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMMERCIAL_RULE,
  REFERRAL_POLICY,
  estimateMonthlyCents,
  formatUsdFromCents,
} from './admin';

describe('commercial estimates', () => {
  it('caps monthly estimates at USD 20 using exact cents', () => {
    expect(estimateMonthlyCents(0)).toBe(0);
    expect(estimateMonthlyCents(3)).toBe(600);
    expect(estimateMonthlyCents(7)).toBe(1400);
    expect(estimateMonthlyCents(10)).toBe(2000);
    expect(estimateMonthlyCents(25)).toBe(2000);
    expect(formatUsdFromCents(estimateMonthlyCents(7))).toBe('USD 14.00');
    expect(DEFAULT_COMMERCIAL_RULE.billableBasis).toContain('simulation');
  });

  it('keeps referral discounts inactive until validation rules exist', () => {
    expect(REFERRAL_POLICY.automaticDiscountsEnabled).toBe(false);
    expect(REFERRAL_POLICY.publicCodesEnabled).toBe(false);
    expect(REFERRAL_POLICY.carriesOverMonths).toBe(false);
    expect(REFERRAL_POLICY.maxReferralsForFullMonthWaiver).toBe(3);
  });
});
