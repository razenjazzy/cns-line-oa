import { getPlatformConfig, setPlatformConfig } from './firestore';

export type PricingModel = {
  aiInputCostPer1MUsd: number;
  aiOutputCostPer1MUsd: number;
  lineMessageCostUsd: number;
  odooRpcCostUsd: number;
  firestoreReadCostUsd: number;
  firestoreWriteCostUsd: number;
  infraFixedMonthlyUsd: number;
  supportPerCustomerMonthlyUsd: number;
  baseMarkupPercent: number;
  advancedMarkupPercent: number;
  enterpriseMarkupPercent: number;
  riskBufferPercent: number;
  targetGrossMarginPercent: number;
  monthlyBudgetCapUsd: number;
};

export type PricingSimulationInput = {
  monthlyActiveUsers: number;
  avgMessagesPerUserPerMonth: number;
  avgInputTokensPerMessage: number;
  avgOutputTokensPerMessage: number;
  odooCallsPerMessage: number;
  firestoreReadsPerMessage: number;
  firestoreWritesPerMessage: number;
  automationAdoptionRate: number;
  expectedCustomers: number;
};

const toNumber = (value: unknown, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const roundMoney = (value: number): number => Number(value.toFixed(4));

let model: PricingModel = {
  aiInputCostPer1MUsd: toNumber(process.env.AI_INPUT_COST_PER_1M_USD, 0.35),
  aiOutputCostPer1MUsd: toNumber(process.env.AI_OUTPUT_COST_PER_1M_USD, 1.25),
  lineMessageCostUsd: toNumber(process.env.LINE_MESSAGE_COST_USD, 0.0012),
  odooRpcCostUsd: toNumber(process.env.ODOO_RPC_COST_USD, 0.0008),
  firestoreReadCostUsd: toNumber(process.env.FIRESTORE_READ_COST_USD, 0.000002),
  firestoreWriteCostUsd: toNumber(process.env.FIRESTORE_WRITE_COST_USD, 0.00001),
  infraFixedMonthlyUsd: toNumber(process.env.INFRA_FIXED_MONTHLY_USD, 120),
  supportPerCustomerMonthlyUsd: toNumber(process.env.SUPPORT_PER_CUSTOMER_MONTHLY_USD, 18),
  baseMarkupPercent: toNumber(process.env.PRICING_BASE_MARKUP_PERCENT, 40),
  advancedMarkupPercent: toNumber(process.env.PRICING_ADVANCED_MARKUP_PERCENT, 70),
  enterpriseMarkupPercent: toNumber(process.env.PRICING_ENTERPRISE_MARKUP_PERCENT, 120),
  riskBufferPercent: toNumber(process.env.PRICING_RISK_BUFFER_PERCENT, 12),
  targetGrossMarginPercent: toNumber(process.env.PRICING_TARGET_MARGIN_PERCENT, 65),
  monthlyBudgetCapUsd: toNumber(process.env.PRICING_MONTHLY_BUDGET_CAP_USD, 2500),
};

const PRICING_CONFIG_KEY = 'pricingModelV1';
let pricingModelLoaded = false;

const sanitizeModel = (candidate: PricingModel): PricingModel => ({
  aiInputCostPer1MUsd: clamp(candidate.aiInputCostPer1MUsd, 0, 100),
  aiOutputCostPer1MUsd: clamp(candidate.aiOutputCostPer1MUsd, 0, 100),
  lineMessageCostUsd: clamp(candidate.lineMessageCostUsd, 0, 10),
  odooRpcCostUsd: clamp(candidate.odooRpcCostUsd, 0, 10),
  firestoreReadCostUsd: clamp(candidate.firestoreReadCostUsd, 0, 1),
  firestoreWriteCostUsd: clamp(candidate.firestoreWriteCostUsd, 0, 1),
  infraFixedMonthlyUsd: clamp(candidate.infraFixedMonthlyUsd, 0, 1_000_000),
  supportPerCustomerMonthlyUsd: clamp(candidate.supportPerCustomerMonthlyUsd, 0, 50_000),
  baseMarkupPercent: clamp(candidate.baseMarkupPercent, 0, 1000),
  advancedMarkupPercent: clamp(candidate.advancedMarkupPercent, 0, 1000),
  enterpriseMarkupPercent: clamp(candidate.enterpriseMarkupPercent, 0, 1000),
  riskBufferPercent: clamp(candidate.riskBufferPercent, 0, 1000),
  targetGrossMarginPercent: clamp(candidate.targetGrossMarginPercent, 1, 99),
  monthlyBudgetCapUsd: clamp(candidate.monthlyBudgetCapUsd, 0, 50_000_000),
});

const toModelPatch = (raw: Record<string, unknown>): Partial<PricingModel> => {
  return {
    aiInputCostPer1MUsd: toNumber(raw.aiInputCostPer1MUsd, model.aiInputCostPer1MUsd),
    aiOutputCostPer1MUsd: toNumber(raw.aiOutputCostPer1MUsd, model.aiOutputCostPer1MUsd),
    lineMessageCostUsd: toNumber(raw.lineMessageCostUsd, model.lineMessageCostUsd),
    odooRpcCostUsd: toNumber(raw.odooRpcCostUsd, model.odooRpcCostUsd),
    firestoreReadCostUsd: toNumber(raw.firestoreReadCostUsd, model.firestoreReadCostUsd),
    firestoreWriteCostUsd: toNumber(raw.firestoreWriteCostUsd, model.firestoreWriteCostUsd),
    infraFixedMonthlyUsd: toNumber(raw.infraFixedMonthlyUsd, model.infraFixedMonthlyUsd),
    supportPerCustomerMonthlyUsd: toNumber(raw.supportPerCustomerMonthlyUsd, model.supportPerCustomerMonthlyUsd),
    baseMarkupPercent: toNumber(raw.baseMarkupPercent, model.baseMarkupPercent),
    advancedMarkupPercent: toNumber(raw.advancedMarkupPercent, model.advancedMarkupPercent),
    enterpriseMarkupPercent: toNumber(raw.enterpriseMarkupPercent, model.enterpriseMarkupPercent),
    riskBufferPercent: toNumber(raw.riskBufferPercent, model.riskBufferPercent),
    targetGrossMarginPercent: toNumber(raw.targetGrossMarginPercent, model.targetGrossMarginPercent),
    monthlyBudgetCapUsd: toNumber(raw.monthlyBudgetCapUsd, model.monthlyBudgetCapUsd),
  };
};

const ensurePricingModelLoaded = async (): Promise<void> => {
  if (pricingModelLoaded) return;

  const stored = await getPlatformConfig<Record<string, unknown>>(PRICING_CONFIG_KEY);
  if (stored) {
    model = sanitizeModel({
      ...model,
      ...toModelPatch(stored),
    });
  }

  pricingModelLoaded = true;
};

export const getPricingModel = async (): Promise<PricingModel> => {
  await ensurePricingModelLoaded();
  return { ...model };
};

export const updatePricingModel = async (patch: Partial<PricingModel>): Promise<PricingModel> => {
  await ensurePricingModelLoaded();
  model = sanitizeModel({
    ...model,
    ...patch,
  });

  await setPlatformConfig(PRICING_CONFIG_KEY, model as unknown as Record<string, unknown>);
  return { ...model };
};

export const runPricingSimulation = (input: PricingSimulationInput) => {
  const monthlyActiveUsers = clamp(Math.trunc(toNumber(input.monthlyActiveUsers, 1000)), 1, 10_000_000);
  const avgMessagesPerUserPerMonth = clamp(toNumber(input.avgMessagesPerUserPerMonth, 25), 1, 10_000);
  const avgInputTokensPerMessage = clamp(toNumber(input.avgInputTokensPerMessage, 320), 1, 100_000);
  const avgOutputTokensPerMessage = clamp(toNumber(input.avgOutputTokensPerMessage, 220), 1, 100_000);
  const odooCallsPerMessage = clamp(toNumber(input.odooCallsPerMessage, 0.8), 0, 100);
  const firestoreReadsPerMessage = clamp(toNumber(input.firestoreReadsPerMessage, 2.5), 0, 100);
  const firestoreWritesPerMessage = clamp(toNumber(input.firestoreWritesPerMessage, 1.1), 0, 100);
  const automationAdoptionRate = clamp(toNumber(input.automationAdoptionRate, 0.45), 0, 1);
  const expectedCustomers = clamp(Math.trunc(toNumber(input.expectedCustomers, 35)), 1, 100_000);

  const monthlyMessages = monthlyActiveUsers * avgMessagesPerUserPerMonth;
  const monthlyInputTokens = monthlyMessages * avgInputTokensPerMessage;
  const monthlyOutputTokens = monthlyMessages * avgOutputTokensPerMessage;

  const aiInputCost = (monthlyInputTokens / 1_000_000) * model.aiInputCostPer1MUsd;
  const aiOutputCost = (monthlyOutputTokens / 1_000_000) * model.aiOutputCostPer1MUsd;
  const lineCost = monthlyMessages * model.lineMessageCostUsd;
  const odooCost = monthlyMessages * odooCallsPerMessage * model.odooRpcCostUsd;
  const firestoreCost = (monthlyMessages * firestoreReadsPerMessage * model.firestoreReadCostUsd)
    + (monthlyMessages * firestoreWritesPerMessage * model.firestoreWriteCostUsd);

  const supportCost = expectedCustomers * model.supportPerCustomerMonthlyUsd;
  const variableCost = aiInputCost + aiOutputCost + lineCost + odooCost + firestoreCost;
  const automationSavings = variableCost * automationAdoptionRate * 0.18;
  const netVariableCost = Math.max(0, variableCost - automationSavings);
  const totalCost = netVariableCost + model.infraFixedMonthlyUsd + supportCost;

  const costPerCustomer = totalCost / expectedCustomers;
  const bufferedCostPerCustomer = costPerCustomer * (1 + model.riskBufferPercent / 100);

  const corePrice = bufferedCostPerCustomer * (1 + model.baseMarkupPercent / 100);
  const advancedPrice = bufferedCostPerCustomer * (1 + model.advancedMarkupPercent / 100);
  const enterprisePrice = bufferedCostPerCustomer * (1 + model.enterpriseMarkupPercent / 100);

  const requiredPriceForTargetMargin = bufferedCostPerCustomer / (1 - model.targetGrossMarginPercent / 100);

  const estimatedRevenue = (corePrice * 0.55 + advancedPrice * 0.3 + enterprisePrice * 0.15) * expectedCustomers;
  const grossMarginPercent = estimatedRevenue > 0
    ? ((estimatedRevenue - totalCost) / estimatedRevenue) * 100
    : 0;

  const budgetStatus = totalCost <= model.monthlyBudgetCapUsd ? 'within_budget' : 'over_budget';

  const topDrivers = [
    { key: 'lineMessaging', usd: lineCost },
    { key: 'aiOutput', usd: aiOutputCost },
    { key: 'support', usd: supportCost },
    { key: 'aiInput', usd: aiInputCost },
    { key: 'odooRpc', usd: odooCost },
    { key: 'firestore', usd: firestoreCost },
  ].sort((a, b) => b.usd - a.usd);

  const recommendations: string[] = [];
  if (lineCost > totalCost * 0.35) {
    recommendations.push('Reduce outbound message volume with intent-based suppression and summary batching.');
  }
  if (aiOutputCost > aiInputCost * 1.8) {
    recommendations.push('Tighten response length controls and use structured templates to reduce output token burn.');
  }
  if (grossMarginPercent < model.targetGrossMarginPercent) {
    recommendations.push('Raise package pricing or reduce support burden with automated self-service workflows.');
  }
  if (budgetStatus === 'over_budget') {
    recommendations.push('Enforce monthly circuit breakers and downgrade non-critical workloads near budget cap.');
  }

  return {
    generatedAt: new Date().toISOString(),
    assumptions: {
      monthlyActiveUsers,
      avgMessagesPerUserPerMonth,
      avgInputTokensPerMessage,
      avgOutputTokensPerMessage,
      odooCallsPerMessage,
      firestoreReadsPerMessage,
      firestoreWritesPerMessage,
      automationAdoptionRate,
      expectedCustomers,
    },
    costBreakdownUsd: {
      aiInput: roundMoney(aiInputCost),
      aiOutput: roundMoney(aiOutputCost),
      lineMessaging: roundMoney(lineCost),
      odooRpc: roundMoney(odooCost),
      firestore: roundMoney(firestoreCost),
      infraFixed: roundMoney(model.infraFixedMonthlyUsd),
      support: roundMoney(supportCost),
      automationSavings: roundMoney(automationSavings),
      totalMonthly: roundMoney(totalCost),
    },
    pricingRecommendationUsdPerCustomerMonthly: {
      core: roundMoney(corePrice),
      advanced: roundMoney(advancedPrice),
      enterprise: roundMoney(enterprisePrice),
      requiredForTargetMargin: roundMoney(requiredPriceForTargetMargin),
    },
    businessHealth: {
      estimatedRevenueMonthly: roundMoney(estimatedRevenue),
      estimatedGrossMarginPercent: roundMoney(grossMarginPercent),
      targetGrossMarginPercent: model.targetGrossMarginPercent,
      budgetCapUsd: roundMoney(model.monthlyBudgetCapUsd),
      budgetStatus,
    },
    topCostDrivers: topDrivers.map(driver => ({ key: driver.key, usd: roundMoney(driver.usd) })),
    recommendations,
  };
};
