import { describe, expect, it } from 'vitest';
import { getPricingModel, runPricingSimulation, updatePricingModel } from '../src/services/pricing-control';

describe('pricing control', () => {
  it('loads model and clamps updates to safe ranges', async () => {
    const before = await getPricingModel();
    expect(before.targetGrossMarginPercent).toBeGreaterThan(0);

    const updated = await updatePricingModel({
      targetGrossMarginPercent: 500,
      monthlyBudgetCapUsd: -10,
    });

    expect(updated.targetGrossMarginPercent).toBe(99);
    expect(updated.monthlyBudgetCapUsd).toBe(0);
  });

  it('returns simulation output with pricing recommendation and budget status', async () => {
    await updatePricingModel({
      monthlyBudgetCapUsd: 100,
      baseMarkupPercent: 50,
      advancedMarkupPercent: 80,
      enterpriseMarkupPercent: 120,
    });

    const report = runPricingSimulation({
      monthlyActiveUsers: 10000,
      avgMessagesPerUserPerMonth: 40,
      avgInputTokensPerMessage: 380,
      avgOutputTokensPerMessage: 260,
      odooCallsPerMessage: 1,
      firestoreReadsPerMessage: 3,
      firestoreWritesPerMessage: 1,
      automationAdoptionRate: 0.3,
      expectedCustomers: 20,
    });

    expect(report.pricingRecommendationUsdPerCustomerMonthly.core).toBeGreaterThan(0);
    expect(['within_budget', 'over_budget']).toContain(report.businessHealth.budgetStatus);
    expect(Array.isArray(report.recommendations)).toBe(true);
  });
});
