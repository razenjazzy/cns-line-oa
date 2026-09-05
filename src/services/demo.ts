import { getUserProfile, setUserLanguage, setUserOdooPartner } from './firestore';
import { getDefaultLanguage, type AppLanguage } from './app-config';
import { getAgentName } from '../line/channels';
import { pingMongo } from '../infra/mongo/base-repository';
import { getDemoDayScript, getServiceModules, type ServiceModule } from '../platform/service-modules';
import { appEnv, isDemoControlEnabled, isDeliveryProduction, isMongoVectorEnabled } from '../http/env';
import {
  createPartnerFromLine,
  createQuotationFromLine,
  findOrderByReference,
  findProductByQuery,
  getPartnerByPhone,
  pingOdoo,
  seedOdooSampleSalesData,
} from './odoo';

type UiLanguage = AppLanguage;

type DemoStepStatus = 'success' | 'warning' | 'error';

export type DemoStep = {
  key: string;
  status: DemoStepStatus;
  detail: string;
  data?: unknown;
};

export type DemoOverview = {
  generatedAt: string;
  app: {
    status: 'ready';
    environment: string;
    endpoints: {
      demoPage: string;
      connections: string;
      journey: string;
      pricingModel: string;
      pricingSimulation: string;
      workflowAudit: string;
      simulatedLineWebhook: string;
      lineWebhook: string;
      platform: string;
      graphql: string;
      apiDocs: string;
    };
  };
  connections: {
    lineOA: {
      configured: boolean;
      agentName: string;
      webhookReady: boolean;
    };
    odoo: {
      configured: boolean;
      status: string;
    };
    firestore: {
      configured: boolean;
      projectId: string | null;
    };
    mongo: {
      configured: boolean;
      vectorEnabled: boolean;
      status: string;
      note: string;
    };
  };
  platform: {
    modules: ServiceModule[];
    demoDayScript: string[];
  };
  demo: {
    accessControl: {
      enabled: boolean;
      productionProtected: boolean;
    };
    recommendedJourney: string[];
    sampleLinePayload: {
      userId: string;
      text: string;
    };
  };
};

export type DemoJourneyInput = {
  userId?: string;
  language?: UiLanguage;
  productQuery?: string;
  qty?: number;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  seedOdoo?: boolean;
};

const isLineConfigured = (): boolean => {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() || '';
  const secret = process.env.LINE_CHANNEL_SECRET?.trim() || '';
  return Boolean(accessToken && secret);
};

const isFirestoreConfigured = (): boolean => Boolean(process.env.GOOGLE_CLOUD_PROJECT?.trim());

const isOdooConfigured = (): boolean => {
  const url = process.env.ODOO_URL?.trim() || '';
  const db = process.env.ODOO_DB?.trim() || '';
  const username = process.env.ODOO_USERNAME?.trim() || '';
  const apiKey = process.env.ODOO_API_KEY?.trim() || '';
  return Boolean(url && db && username && apiKey);
};

const normalizeBaseUrl = (baseUrl?: string): string => {
  const fallbackPort = process.env.PORT || '8080';
  return (baseUrl || `http://localhost:${fallbackPort}`).replace(/\/$/, '');
};

const safePingOdoo = async (): Promise<string> => {
  try {
    return await pingOdoo();
  } catch (error) {
    return `Odoo connectivity check failed: ${String(error)}`;
  }
};

const safeSeedOdoo = async (): Promise<string> => {
  try {
    return await seedOdooSampleSalesData();
  } catch (error) {
    return `Odoo seed failed: ${String(error)}`;
  }
};

export const getDemoOverview = async (baseUrl?: string): Promise<DemoOverview> => {
  const resolvedBaseUrl = normalizeBaseUrl(baseUrl);
  const [odooStatus, mongoPing] = await Promise.all([safePingOdoo(), pingMongo()]);

  return {
    generatedAt: new Date().toISOString(),
    app: {
      status: 'ready',
      environment: appEnv,
      endpoints: {
        demoPage: `${resolvedBaseUrl}/demo`,
        connections: `${resolvedBaseUrl}/demo/connections`,
        journey: `${resolvedBaseUrl}/demo/journey`,
        pricingModel: `${resolvedBaseUrl}/demo/pricing-model`,
        pricingSimulation: `${resolvedBaseUrl}/demo/pricing-simulation`,
        workflowAudit: `${resolvedBaseUrl}/demo/workflow-audit`,
        simulatedLineWebhook: `${resolvedBaseUrl}/webhook-test`,
        lineWebhook: `${resolvedBaseUrl}/webhook`,
        platform: `${resolvedBaseUrl}/demo/platform`,
        graphql: `${resolvedBaseUrl}/graphql`,
        apiDocs: `${resolvedBaseUrl}/api-docs`,
      },
    },
    connections: {
      lineOA: {
        configured: isLineConfigured(),
        agentName: getAgentName(),
        webhookReady: isLineConfigured(),
      },
      odoo: {
        configured: isOdooConfigured(),
        status: odooStatus,
      },
      firestore: {
        configured: isFirestoreConfigured(),
        projectId: process.env.GOOGLE_CLOUD_PROJECT?.trim() || null,
      },
      mongo: {
        configured: Boolean(process.env.MONGODB_URI?.trim()),
        vectorEnabled: isMongoVectorEnabled,
        status: mongoPing.message,
        note: 'LINE FAQ/RAG only. Partners, quotes, and users stay in Firestore and Odoo.',
      },
    },
    platform: {
      modules: getServiceModules(),
      demoDayScript: getDemoDayScript(),
    },
    demo: {
      accessControl: {
        enabled: isDemoControlEnabled,
        productionProtected: isDeliveryProduction || Boolean((process.env.DEMO_CONTROL_TOKEN || process.env.OPS_API_TOKEN || '').trim()),
      },
      recommendedJourney: getDemoDayScript(),
      sampleLinePayload: {
        userId: 'demo_line_user',
        text: 'PRODUCT FIND App',
      },
    },
  };
};

export const runDemoJourney = async (input: DemoJourneyInput) => {
  const userId = input.userId?.trim() || 'demo_line_user';
  const language: UiLanguage = input.language ? (input.language === 'en' ? 'en' : 'th') : getDefaultLanguage();
  const productQuery = input.productQuery?.trim() || 'App Premium Plan';
  const qty = typeof input.qty === 'number' && input.qty > 0 ? input.qty : 1;
  const customerName = input.customerName?.trim() || 'LINE Demo Customer';
  const customerPhone = input.customerPhone?.trim() || '0990000000';
  const customerEmail = input.customerEmail?.trim() || 'line.demo@example.com';
  const steps: DemoStep[] = [];

  await setUserLanguage(userId, language);
  steps.push({
    key: 'app-user-context',
    status: 'success',
    detail: `Application user context prepared for ${userId} (${language}).`,
    data: { userId, language },
  });

  const odooStatus = await safePingOdoo();
  const odooOk = /connected successfully/i.test(odooStatus);
  steps.push({
    key: 'odoo-connection',
    status: odooOk ? 'success' : 'error',
    detail: odooStatus,
  });

  if (!odooOk) {
    return {
      ok: false,
      steps,
      sampleLineCommands: [
        'SYSTEM STATUS',
        `PRODUCT FIND ${productQuery}`,
      ],
    };
  }

  if (input.seedOdoo !== false) {
    const seedStatus = await safeSeedOdoo();
    steps.push({
      key: 'odoo-seed',
      status: /sample data ready/i.test(seedStatus) ? 'success' : 'warning',
      detail: seedStatus,
    });
  }

  let partner = await getPartnerByPhone(customerPhone);
  if (!partner) {
    partner = await createPartnerFromLine(customerName, customerPhone, customerEmail);
    if (!partner) {
      steps.push({
        key: 'odoo-partner',
        status: 'error',
        detail: 'Failed to create or locate the Odoo partner for the demo customer.',
      });
      return {
        ok: false,
        steps,
        sampleLineCommands: [
          `USER CREATE ${customerName},${customerPhone},${customerEmail}`,
        ],
      };
    }
  }

  await setUserOdooPartner(userId, partner.id, partner.name, partner.phone);
  steps.push({
    key: 'odoo-partner',
    status: 'success',
    detail: `Application user ${userId} is mapped to Odoo partner ${partner.name}.`,
    data: partner,
  });

  const product = await findProductByQuery(productQuery);
  if (!product) {
    steps.push({
      key: 'odoo-product',
      status: 'error',
      detail: `No Odoo product found for query "${productQuery}".`,
    });
    return {
      ok: false,
      steps,
      sampleLineCommands: [
        `PRODUCT FIND ${productQuery}`,
        'SEED SAMPLE DATA',
      ],
    };
  }

  steps.push({
    key: 'odoo-product',
    status: 'success',
    detail: `Resolved Odoo product ${product.name}.`,
    data: product,
  });

  const quotation = await createQuotationFromLine(customerName, customerPhone, product.name, qty);
  if (!quotation) {
    steps.push({
      key: 'odoo-quotation',
      status: 'error',
      detail: 'Failed to create the Odoo quotation from the simulated LINE request.',
    });
    return {
      ok: false,
      steps,
      sampleLineCommands: [
        `QUOTE CREATE ${product.name},${qty},${customerName},${customerPhone}`,
      ],
    };
  }

  steps.push({
    key: 'odoo-quotation',
    status: 'success',
    detail: `Created Odoo quotation ${quotation.orderName}.`,
    data: quotation,
  });

  const order = await findOrderByReference(quotation.orderName);
  steps.push({
    key: 'odoo-order-readback',
    status: order ? 'success' : 'warning',
    detail: order
      ? `Read back quotation ${order.name} from Odoo with state ${order.state}.`
      : `Quotation ${quotation.orderName} was created but could not be read back immediately.`,
    data: order || undefined,
  });

  const profile = await getUserProfile(userId);

  return {
    ok: true,
    summary: {
      userId,
      language,
      product: product.name,
      quotationReference: quotation.orderName,
    },
    steps,
    applicationUser: profile,
    sampleLineCommands: [
      `USER READ ${customerPhone}`,
      `PRODUCT FIND ${product.name}`,
      `QUOTE CREATE ${product.name},${qty},${customerName},${customerPhone}`,
      `ORDER STATUS ${quotation.orderName}`,
    ],
  };
};