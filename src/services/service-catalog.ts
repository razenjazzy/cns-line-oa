import { ChannelContext } from '../line/channels';

export type ServiceKey = 'commerce' | 'directory' | 'catalog' | 'reporting' | 'groupBuy';

export type ServiceCommand = {
  text: string;
  labelTh: string;
  labelEn: string;
  requiresAdmin?: boolean;
};

export type ServiceDefinition = {
  key: ServiceKey;
  labelTh: string;
  labelEn: string;
  commands: ServiceCommand[];
};

export const getConfiguredServiceKeys = (): ServiceKey[] | null => {
  const configured = process.env.ENABLED_SERVICES?.trim();
  if (!configured) return null;

  const validKeys = new Set<ServiceKey>(['commerce', 'directory', 'catalog', 'reporting', 'groupBuy']);
  return configured.split(',')
    .map(value => value.trim() as ServiceKey)
    .filter((value, index, values) => validKeys.has(value) && values.indexOf(value) === index);
};

export const isServiceConfigured = (service: ServiceKey): boolean => {
  const configured = getConfiguredServiceKeys();
  return configured === null || configured.includes(service);
};

/**
 * Single source of truth for which commands belong to which service.
 * Used both to render channel-aware navigation menus and to gate command
 * execution, so the two can never drift apart. Only command groups that
 * plausibly need per-channel enable/disable are mapped here; everything
 * else (identity/verification, admin, language, help) is unmapped and
 * always runs, preserving current behavior.
 */
export const SERVICE_CATALOG: ServiceDefinition[] = [
  {
    key: 'commerce',
    labelTh: 'สินค้าและใบเสนอราคา',
    labelEn: 'Products & Quotes',
    commands: [
      { text: 'FORM PRODUCT FIND', labelTh: 'ค้นหาสินค้า', labelEn: 'Find a product' },
      { text: 'FORM QUOTE CREATE', labelTh: 'สร้างใบเสนอราคา', labelEn: 'Create a quote' },
      { text: 'FORM ORDER STATUS', labelTh: 'เช็คสถานะออเดอร์', labelEn: 'Check an order' },
      { text: 'QUOTE LIST', labelTh: 'ใบเสนอราคาของฉัน', labelEn: 'My quotations' },
      { text: 'FORM MESSAGE CUSTOMER', labelTh: 'ส่งข้อความหาลูกค้า (แอดมิน)', labelEn: 'Message a customer (admin)', requiresAdmin: true },
    ],
  },
  {
    key: 'directory',
    labelTh: 'ผู้ใช้',
    labelEn: 'Customers',
    commands: [
      { text: 'FORM USER READ', labelTh: 'ดูข้อมูลผู้ใช้ (แอดมิน)', labelEn: 'Look up a customer (admin)', requiresAdmin: true },
      { text: 'FORM USER CREATE', labelTh: 'เพิ่มผู้ใช้ (แอดมิน)', labelEn: 'Add a customer (admin)', requiresAdmin: true },
      { text: 'FORM USER UPDATE', labelTh: 'แก้ไขผู้ใช้ (แอดมิน)', labelEn: 'Edit a customer (admin)', requiresAdmin: true },
      { text: 'FORM USER DELETE', labelTh: 'ลบผู้ใช้ (แอดมิน)', labelEn: 'Delete a customer (admin)', requiresAdmin: true },
    ],
  },
  {
    key: 'catalog',
    labelTh: 'บริการ',
    labelEn: 'Catalog',
    commands: [
      { text: 'SERVICE LIST', labelTh: 'รายการบริการ', labelEn: 'Browse catalog' },
      { text: 'FORM SERVICE READ', labelTh: 'ค้นหาบริการ', labelEn: 'Find a service' },
      { text: 'FORM SERVICE CREATE', labelTh: 'เพิ่มบริการ (แอดมิน)', labelEn: 'Add an item (admin)', requiresAdmin: true },
      { text: 'FORM SERVICE UPDATE', labelTh: 'แก้ไขบริการ (แอดมิน)', labelEn: 'Edit an item (admin)', requiresAdmin: true },
      { text: 'FORM SERVICE DELETE', labelTh: 'ลบบริการ (แอดมิน)', labelEn: 'Delete an item (admin)', requiresAdmin: true },
    ],
  },
  {
    key: 'reporting',
    labelTh: 'รายงาน (แอดมิน)',
    labelEn: 'Reporting (admin)',
    commands: [
      { text: 'DAILY REPORT', labelTh: 'รายงานประจำวัน', labelEn: 'Daily report', requiresAdmin: true },
    ],
  },
  {
    key: 'groupBuy',
    labelTh: 'Group-Buy',
    labelEn: 'Group-Buy',
    commands: [
      { text: 'STATUS GROUPBUY', labelTh: 'สถานะ Group-Buy', labelEn: 'Group-Buy status' },
    ],
  },
];

const COMMAND_PREFIX_SERVICE_MAP: { prefix: string; service: ServiceKey }[] = [
  { prefix: 'PRODUCT FIND', service: 'commerce' },
  { prefix: 'QUOTE CREATE', service: 'commerce' },
  { prefix: 'ORDER STATUS', service: 'commerce' },
  { prefix: 'FORM PRODUCT FIND', service: 'commerce' },
  { prefix: 'FORM QUOTE CREATE', service: 'commerce' },
  { prefix: 'FORM ORDER STATUS', service: 'commerce' },
  { prefix: 'QUOTE STATUS', service: 'commerce' },
  { prefix: 'QUOTE CONFIRM', service: 'commerce' },
  { prefix: 'QUOTE SEND', service: 'commerce' },
  { prefix: 'QUOTE APPROVE', service: 'commerce' },
  { prefix: 'QUOTE ADD', service: 'commerce' },
  { prefix: 'QUOTE EDIT', service: 'commerce' },
  { prefix: 'QUOTE REMOVE', service: 'commerce' },
  { prefix: 'QUOTE CANCEL', service: 'commerce' },
  { prefix: 'QUOTE INVOICE', service: 'commerce' },
  { prefix: 'QUOTE LIST', service: 'commerce' },
  { prefix: 'QUOTE MESSAGE', service: 'commerce' },
  { prefix: 'MESSAGE CUSTOMER', service: 'commerce' },
  { prefix: 'FORM MESSAGE CUSTOMER', service: 'commerce' },
  { prefix: 'USER CREATE', service: 'directory' },
  { prefix: 'USER READ', service: 'directory' },
  { prefix: 'USER UPDATE', service: 'directory' },
  { prefix: 'USER DELETE', service: 'directory' },
  { prefix: 'FORM USER CREATE', service: 'directory' },
  { prefix: 'FORM USER READ', service: 'directory' },
  { prefix: 'FORM USER UPDATE', service: 'directory' },
  { prefix: 'FORM USER DELETE', service: 'directory' },
  { prefix: 'SERVICE LIST', service: 'catalog' },
  { prefix: 'SERVICE READ', service: 'catalog' },
  { prefix: 'SERVICE CREATE', service: 'catalog' },
  { prefix: 'SERVICE UPDATE', service: 'catalog' },
  { prefix: 'SERVICE DELETE', service: 'catalog' },
  { prefix: 'FORM SERVICE CREATE', service: 'catalog' },
  { prefix: 'FORM SERVICE READ', service: 'catalog' },
  { prefix: 'FORM SERVICE UPDATE', service: 'catalog' },
  { prefix: 'FORM SERVICE DELETE', service: 'catalog' },
  { prefix: 'DAILY REPORT', service: 'reporting' },
  { prefix: 'SEGMENT CUSTOMERS', service: 'reporting' },
  { prefix: 'START GROUPBUY', service: 'groupBuy' },
  { prefix: 'JOIN GROUPBUY', service: 'groupBuy' },
  { prefix: 'STATUS GROUPBUY', service: 'groupBuy' },
  { prefix: 'CONFIRM GROUPBUY', service: 'groupBuy' },
  { prefix: 'CANCEL GROUPBUY', service: 'groupBuy' },
];

export const resolveServiceForCommand = (upperText: string): ServiceKey | null => {
  const match = COMMAND_PREFIX_SERVICE_MAP.find(m => upperText.startsWith(m.prefix));
  return match ? match.service : null;
};

export const getServiceDefinition = (key: string): ServiceDefinition | null => {
  return SERVICE_CATALOG.find(svc => svc.key === key) || null;
};

/**
 * No channel context (e.g. /webhook-test callers that don't pass one) or an
 * unrestricted channel (enabledServices: null) both mean "unrestricted",
 * matching current ungated behavior.
 */
export const isServiceEnabledForChannel = (service: ServiceKey, channel?: ChannelContext): boolean => {
  if (!channel) return true;
  if (channel.enabledServices === null) return true;
  return channel.enabledServices.includes(service);
};

export const getVisibleCommands = (service: ServiceDefinition, isAdmin: boolean): ServiceCommand[] => {
  return service.commands.filter(c => !c.requiresAdmin || isAdmin);
};

/**
 * Channel-enabled AND has at least one command this role can actually use —
 * a service that's entirely admin-gated (e.g. reporting) simply doesn't
 * appear for a non-admin, rather than showing an empty action menu.
 */
export const getAvailableServices = (channel: ChannelContext | undefined, isAdmin: boolean): ServiceDefinition[] => {
  return SERVICE_CATALOG.filter(svc =>
    isServiceConfigured(svc.key) && isServiceEnabledForChannel(svc.key, channel) && getVisibleCommands(svc, isAdmin).length > 0
  );
};
