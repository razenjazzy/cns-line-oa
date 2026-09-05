export type ServiceModuleStore = 'firestore' | 'odoo' | 'mongo' | 'line' | 'none';

export type ServiceModule = {
  id: string;
  name: string;
  audience: 'line' | 'ops' | 'both';
  store: ServiceModuleStore;
  status: 'live' | 'optional';
  entry: string;
  commands: string[];
  demoTalkTrack: string;
};

/**
 * Canonical inventory of LINE OA application modules.
 * ERP data stays in Odoo; Mongo is LINE FAQ/RAG only.
 */
export const SERVICE_MODULES: ServiceModule[] = [
  {
    id: 'identity',
    name: 'Identity and verification',
    audience: 'line',
    store: 'firestore',
    status: 'live',
    entry: 'src/line/handlers/verification.ts',
    commands: ['VERIFY START', 'VERIFY OTP', 'VERIFY STATUS', 'ADMIN ENABLE', 'MY DATA', 'DELETE MY DATA'],
    demoTalkTrack: 'First message shows PDPA + home. VERIFY START by phone binds LINE to an Odoo partner; ADMIN ENABLE still requires the allowlist.',
  },
  {
    id: 'commerce',
    name: 'Products and quotations',
    audience: 'line',
    store: 'odoo',
    status: 'live',
    entry: 'src/line/handlers/quotation.ts',
    commands: ['FORM PRODUCT FIND', 'FORM QUOTE CREATE', 'QUOTE LIST', 'QUOTE STATUS', 'QUOTE CONFIRM', 'SYSTEM STATUS'],
    demoTalkTrack: 'Guided FORM QUOTE CREATE writes a real sale.order. Step-up OTP gates mutations for already-verified users.',
  },
  {
    id: 'directory',
    name: 'Customer directory',
    audience: 'line',
    store: 'odoo',
    status: 'live',
    entry: 'src/line/handlers/user-directory.ts',
    commands: ['FORM USER CREATE', 'FORM USER READ', 'FORM USER UPDATE', 'FORM USER DELETE'],
    demoTalkTrack: 'Admin-only partner CRUD through getErpAdapter(), not Mongo.',
  },
  {
    id: 'catalog',
    name: 'Service catalog',
    audience: 'line',
    store: 'odoo',
    status: 'live',
    entry: 'src/line/handlers/service-catalog-handler.ts',
    commands: ['SERVICE LIST', 'FORM SERVICE READ', 'FORM SERVICE CREATE', 'FORM SERVICE UPDATE', 'FORM SERVICE DELETE'],
    demoTalkTrack: 'Odoo product/service records; LINE Flex lists them for tap-to-command.',
  },
  {
    id: 'groupBuy',
    name: 'Group-buy',
    audience: 'line',
    store: 'firestore',
    status: 'live',
    entry: 'src/line/handlers/group-buy.ts',
    commands: ['START GROUPBUY', 'JOIN GROUPBUY', 'STATUS GROUPBUY', 'CONFIRM GROUPBUY', 'CANCEL GROUPBUY'],
    demoTalkTrack: 'Session state in Firestore; confirm creates an Odoo quotation. Gated by GROUPBUY_ENABLED.',
  },
  {
    id: 'reporting',
    name: 'Reporting',
    audience: 'both',
    store: 'odoo',
    status: 'live',
    entry: 'src/jobs/daily-report.ts',
    commands: ['DAILY REPORT', 'SEGMENT CUSTOMERS'],
    demoTalkTrack: 'Odoo snapshot plus Gemini summary pushed to ADMIN_USER_ID. HTTP /jobs/daily-report is the ops trigger.',
  },
  {
    id: 'aiFallback',
    name: 'Conversational fallback',
    audience: 'line',
    store: 'mongo',
    status: 'optional',
    entry: 'src/line/handlers/chat-fallback.ts',
    commands: ['(unmatched text)', 'FEEDBACK GOOD', 'FEEDBACK BAD'],
    demoTalkTrack: 'After handlers miss: Gemini, then optional Mongo FAQ. Mongo never stores quotes or partners.',
  },
  {
    id: 'platform',
    name: 'Navigation, skills, i18n',
    audience: 'line',
    store: 'none',
    status: 'live',
    entry: 'src/services/service-catalog.ts',
    commands: ['NAV HOME', 'LANG TH', 'LANG EN', 'SKILLS', 'HOURS', 'GUIDE'],
    demoTalkTrack: 'service-catalog.ts gates menus and execution. Markdown skills cannot shadow TypeScript commands.',
  },
  {
    id: 'erp',
    name: 'ERP adapter (Odoo)',
    audience: 'ops',
    store: 'odoo',
    status: 'live',
    entry: 'src/erp/registry.ts',
    commands: ['getErpAdapter()'],
    demoTalkTrack: 'Single adapter. ERP_PROVIDER other than odoo fails closed. No second ERP in Mongo.',
  },
  {
    id: 'ops',
    name: 'Ops API, GraphQL, Swagger, jobs',
    audience: 'ops',
    store: 'none',
    status: 'optional',
    entry: 'src/http/ops-routes.ts',
    commands: ['GET /ops/kpi', 'POST /graphql', 'GET /api-docs', 'POST /jobs/daily-report'],
    demoTalkTrack: 'Same tokens as REST. GraphQL is not a LINE webhook. BullMQ stays off unless Redis + worker are running.',
  },
  {
    id: 'admin',
    name: 'Admin and channel config',
    audience: 'line',
    store: 'firestore',
    status: 'live',
    entry: 'src/line/handlers/admin.ts',
    commands: ['ADMIN VERIFY', 'ADMIN ENABLE', 'ADMIN CONFIG', 'ADMIN CHANNEL', 'ADMIN ACCESS', 'ADMIN AUDIT ROTATE'],
    demoTalkTrack: 'Allowlist plus Odoo admin capability. ADMIN CONFIG edits channel services through the existing CHANNEL SERVICES command.',
  },
  {
    id: 'sales',
    name: 'Sales messaging',
    audience: 'line',
    store: 'odoo',
    status: 'live',
    entry: 'src/line/handlers/sales-message.ts',
    commands: ['MESSAGE CUSTOMER', 'QUOTE MESSAGE', 'QUOTE SEND'],
    demoTalkTrack: 'Customer-facing quote send uses verified phone + Odoo portal/PDF links, not Mongo.',
  },
  {
    id: 'approvals',
    name: 'Step-up OTP and quote approval',
    audience: 'line',
    store: 'firestore',
    status: 'live',
    entry: 'src/line/handlers/action-otp.ts',
    commands: ['ACTION VERIFY', 'QUOTE APPROVE'],
    demoTalkTrack: 'Mutations require a fresh action OTP. QUOTE APPROVE uses the approval store, not a second router.',
  },
];

export const DEMO_DAY_SCRIPT: string[] = [
  'Open /demo — first LINE-equivalent chat message shows home menu.',
  'Refresh connections: LINE, Firestore, Odoo. Mongo is optional and unused for ERP.',
  'Run Full Simulation Flow: pricing + Odoo journey (partner, product, quotation readback).',
  'Web chat: FORM QUOTE CREATE or PRODUCT FIND — same resolveCommandReply as LINE.',
  'Send PRODUCT FIND via /webhook-test (read-only in production).',
  'Show QUOTE LIST / journey card actions if Odoo has the draft.',
  'Ops: /healthz, /readyz, GET /ops/platform. Optional /api-docs and GraphQL — not LINE.',
  'Close: identity chain LINE → odooVerified → ADMIN_USER_ID → Odoo admin capability.',
];

export const getServiceModules = (): ServiceModule[] => SERVICE_MODULES;

export const getDemoDayScript = (): string[] => [...DEMO_DAY_SCRIPT];

export const getDemoPlatformPayload = () => ({
  generatedAt: new Date().toISOString(),
  modules: getServiceModules(),
  demoDayScript: getDemoDayScript(),
  stores: {
    firestore: 'LINE identity, PDPA, pendingFlow, group-buy sessions, audit, chat history',
    odoo: 'Partners, products, quotations — via getErpAdapter() only',
    mongo: 'Optional skill_embeddings and chat_embeddings. Never users, OTP, or ERP records',
  },
});
