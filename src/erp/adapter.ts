export type ErpProviderName = 'odoo' | 'sap' | 'quickbooks' | 'oracle';

export type ErpWriteAction =
  | 'customer.create'
  | 'customer.update'
  | 'quote.create'
  | 'quote.update'
  | 'quote.cancel'
  | 'order.confirm'
  | 'invoice.create'
  | 'service.create'
  | 'service.update';

export type ErpPermission = {
  role: 'admin' | 'staff' | 'customer';
  channel: 'line' | 'web' | 'ops' | 'admin';
  requiresOtp?: boolean;
};

export type ErpProduct = {
  id: number;
  name: string;
  sku?: string;
  price?: number;
  quantity?: number;
  currency?: string;
};

export type ErpService = {
  id: number;
  name: string;
  sku?: string;
  price: number;
  quantity?: number;
};

export type ErpServiceUpdate = {
  name?: string;
  price?: number;
  sku?: string;
};

export type ErpPartner = {
  id: number;
  name: string;
  phone?: string;
  email?: string;
};

export type ErpQuoteDraft = {
  id: number;
  name: string;
  total: number;
  currency: string;
};

export type ErpQuotationOptions = {
  partnerId?: number;
  customerRef?: string;
  discountPercent?: number;
  validityDate?: string;
  note?: string;
  paymentTermId?: number;
};

export type ErpCustomerUpdate = {
  name?: string;
  phone?: string;
  email?: string;
};

export type ErpOrderStatus = {
  id: number;
  name: string;
  state: string;
  amountTotal?: number;
};

export type ErpDailySnapshotRow = {
  product: string;
  stock: number;
  salesYesterday: number;
  revenueYesterday: number;
};

export type ErpAdapterCapabilities = {
  supportsProductSearch: boolean;
  supportsCustomerLookup: boolean;
  supportsQuoteCreation: boolean;
  supportsOrderConfirmation: boolean;
  supportsInvoiceCreation: boolean;
  supportsDailyReport: boolean;
};

export type ErpCommandContext = {
  userId: string;
  channelId?: string;
  channel?: 'line' | 'web' | 'ops' | 'admin';
  language: 'th' | 'en';
  isAdmin: boolean;
  provider: ErpProviderName;
};

export type ErpAdapter = {
  name: ErpProviderName;
  capabilities: ErpAdapterCapabilities;
  searchProducts: (query: string, limit?: number) => Promise<ErpProduct[]>;
  listServices: (limit?: number) => Promise<ErpService[]>;
  lookupService: (identifier: string) => Promise<ErpService | null>;
  createService: (name: string, sku: string, price: number) => Promise<ErpService | null>;
  updateService: (identifier: string, update: ErpServiceUpdate) => Promise<ErpService | null>;
  deleteService: (identifier: string) => Promise<boolean>;
  lookupCustomer: (query: string) => Promise<ErpPartner | null>;
  createCustomer: (name: string, phone: string, email?: string) => Promise<ErpPartner | null>;
  updateCustomer: (id: number, update: ErpCustomerUpdate) => Promise<ErpPartner | null>;
  deleteCustomer: (id: number) => Promise<boolean>;
  createQuotation: (partnerName: string, phone: string, productName: string, qty: number, options?: ErpQuotationOptions) => Promise<ErpQuoteDraft | null>;
  confirmOrder: (orderId: number) => Promise<boolean>;
  createInvoice: (orderId: number) => Promise<boolean>;
  addQuoteLine: (orderId: number, productId: number, qty: number) => Promise<boolean>;
  editQuoteLine: (orderId: number, productId: number, qty: number) => Promise<boolean>;
  cancelQuote: (orderId: number) => Promise<boolean>;
  getOrderStatus: (orderRef: string) => Promise<ErpOrderStatus | null>;
  getDailySnapshot: () => Promise<ErpDailySnapshotRow[]>;
  getDailySummary: () => Promise<string | null>;
  permissionFor: (action: ErpWriteAction) => ErpPermission;
};

export type CommandDefinition = {
  id: string;
  commandText: string;
  handlerName: string;
  labelTh: string;
  labelEn: string;
  category: 'commerce' | 'directory' | 'catalog' | 'reporting' | 'admin';
  serviceKey?: string;
  requiresAdmin?: boolean;
  approvalRequired?: boolean;
  requiresOtp?: boolean;
  enabled: boolean;
  action: ErpWriteAction | 'read' | 'menu';
  channels?: Array<'line' | 'web' | 'ops' | 'admin'>;
};

export type CommandRegistry = {
  commands: CommandDefinition[];
  getById: (id: string) => CommandDefinition | undefined;
  getVisible: (ctx: Pick<ErpCommandContext, 'isAdmin' | 'channel'>) => CommandDefinition[];
};
