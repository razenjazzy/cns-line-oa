export type FlowKey =
  | 'USER_CREATE'
  | 'USER_READ'
  | 'SERVICE_CREATE'
  | 'SERVICE_READ'
  | 'DEMO_PRODUCT'
  | 'DEMO_ORDER'
  | 'DEMO_QUOTE'
  | 'VERIFY';

export type FlowFieldSpec = {
  key: string;
  promptTh: string;
  promptEn: string;
  optional?: boolean;
  validate: (value: string) => boolean;
};

export type FlowSpec = {
  key: FlowKey;
  startCommand: string;
  requiresAdmin: boolean;
  labelTh: string;
  labelEn: string;
  fields: FlowFieldSpec[];
  buildFinalCommand: (collected: Record<string, string>) => string;
};

const isNonEmpty = (value: string): boolean => value.trim().length > 0;
const isPhoneLike = (value: string): boolean => /^[0-9+\-\s]{6,20}$/.test(value.trim());
const isPositiveNumber = (value: string): boolean => Number.isFinite(Number(value)) && Number(value) > 0;
const isEmailLike = (value: string): boolean => value.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/**
 * Each flow's buildFinalCommand reconstructs the exact single-line command
 * string that command-router.ts already knows how to execute, so a completed
 * guided form re-enters the normal command path instead of duplicating any
 * Odoo/Firestore logic.
 */
export const FLOW_SPECS: Record<FlowKey, FlowSpec> = {
  VERIFY: {
    key: 'VERIFY',
    startCommand: 'FORM VERIFY',
    requiresAdmin: false,
    labelTh: 'ยืนยันตัวตน',
    labelEn: 'Verify your account',
    fields: [
      { key: 'phone', promptTh: 'เบอร์โทรที่ผูกกับ Odoo?', promptEn: 'Phone number on file in Odoo?', validate: isPhoneLike },
    ],
    buildFinalCommand: (c) => `VERIFY START ${c.phone}`,
  },
  USER_CREATE: {
    key: 'USER_CREATE',
    startCommand: 'FORM USER CREATE',
    requiresAdmin: true,
    labelTh: 'เพิ่มผู้ใช้',
    labelEn: 'Create user',
    fields: [
      { key: 'name', promptTh: 'ชื่อลูกค้า?', promptEn: "Customer's name?", validate: isNonEmpty },
      { key: 'phone', promptTh: 'เบอร์โทร?', promptEn: 'Phone number?', validate: isPhoneLike },
      { key: 'email', promptTh: 'อีเมล (พิมพ์ SKIP เพื่อข้าม)', promptEn: 'Email (type SKIP to skip)', optional: true, validate: isEmailLike },
    ],
    buildFinalCommand: (c) => `USER CREATE ${c.name},${c.phone}${c.email ? ',' + c.email : ''}`,
  },
  USER_READ: {
    key: 'USER_READ',
    startCommand: 'FORM USER READ',
    requiresAdmin: true,
    labelTh: 'ค้นหาผู้ใช้',
    labelEn: 'Find a customer',
    fields: [
      { key: 'phone', promptTh: 'เบอร์โทรลูกค้า?', promptEn: "Customer's phone number?", validate: isPhoneLike },
    ],
    buildFinalCommand: (c) => `USER READ ${c.phone}`,
  },
  SERVICE_CREATE: {
    key: 'SERVICE_CREATE',
    startCommand: 'FORM SERVICE CREATE',
    requiresAdmin: true,
    labelTh: 'เพิ่มบริการ',
    labelEn: 'Create service',
    fields: [
      { key: 'name', promptTh: 'ชื่อบริการ?', promptEn: 'Service name?', validate: isNonEmpty },
      { key: 'code', promptTh: 'รหัสบริการ?', promptEn: 'Service code?', validate: isNonEmpty },
      { key: 'price', promptTh: 'ราคา?', promptEn: 'Price?', validate: isPositiveNumber },
    ],
    buildFinalCommand: (c) => `SERVICE CREATE ${c.name},${c.code},${c.price}`,
  },
  SERVICE_READ: {
    key: 'SERVICE_READ',
    startCommand: 'FORM SERVICE READ',
    requiresAdmin: false,
    labelTh: 'ค้นหาบริการ',
    labelEn: 'Find a service',
    fields: [
      { key: 'identifier', promptTh: 'รหัสหรือชื่อบริการ?', promptEn: 'Service code or name?', validate: isNonEmpty },
    ],
    buildFinalCommand: (c) => `SERVICE READ ${c.identifier}`,
  },
  DEMO_PRODUCT: {
    key: 'DEMO_PRODUCT',
    startCommand: 'FORM DEMO PRODUCT',
    requiresAdmin: false,
    labelTh: 'ค้นหาสินค้า',
    labelEn: 'Find a product',
    fields: [
      { key: 'productName', promptTh: 'ชื่อสินค้าที่ต้องการค้นหา?', promptEn: 'Product name to search for?', validate: isNonEmpty },
    ],
    buildFinalCommand: (c) => `DEMO PRODUCT ${c.productName}`,
  },
  DEMO_ORDER: {
    key: 'DEMO_ORDER',
    startCommand: 'FORM DEMO ORDER',
    requiresAdmin: false,
    labelTh: 'เช็คสถานะออเดอร์',
    labelEn: 'Check an order',
    fields: [
      { key: 'reference', promptTh: 'เลขอ้างอิงออเดอร์?', promptEn: 'Order reference?', validate: isNonEmpty },
    ],
    buildFinalCommand: (c) => `DEMO ORDER ${c.reference}`,
  },
  DEMO_QUOTE: {
    key: 'DEMO_QUOTE',
    startCommand: 'FORM DEMO QUOTE',
    requiresAdmin: false,
    labelTh: 'สร้างใบเสนอราคา',
    labelEn: 'Create a quote',
    fields: [
      { key: 'productName', promptTh: 'ชื่อสินค้า?', promptEn: 'Product name?', validate: isNonEmpty },
      { key: 'qty', promptTh: 'จำนวน?', promptEn: 'Quantity?', validate: isPositiveNumber },
      { key: 'customerName', promptTh: 'ชื่อลูกค้า?', promptEn: "Customer's name?", validate: isNonEmpty },
      { key: 'phone', promptTh: 'เบอร์โทรลูกค้า?', promptEn: "Customer's phone?", validate: isPhoneLike },
    ],
    buildFinalCommand: (c) => `DEMO QUOTE ${c.productName},${c.qty},${c.customerName},${c.phone}`,
  },
};

export const getFlowByStartCommand = (upperText: string): FlowSpec | null => {
  return Object.values(FLOW_SPECS).find(f => f.startCommand === upperText) || null;
};
