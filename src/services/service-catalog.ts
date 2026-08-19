import { ChannelContext } from '../line/channels';

export type ServiceKey = 'commerce' | 'directory' | 'catalog' | 'reporting' | 'groupBuy';

export type ServiceCommand = {
  text: string;
  labelTh: string;
  labelEn: string;
};

export type ServiceDefinition = {
  key: ServiceKey;
  labelTh: string;
  labelEn: string;
  commands: ServiceCommand[];
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
      { text: 'DEMO PRODUCT', labelTh: 'ค้นหาสินค้า', labelEn: 'Find a product' },
      { text: 'FORM DEMO QUOTE', labelTh: 'สร้างใบเสนอราคา', labelEn: 'Create a quote' },
      { text: 'DEMO ORDER', labelTh: 'เช็คสถานะออเดอร์', labelEn: 'Check an order' },
    ],
  },
  {
    key: 'directory',
    labelTh: 'จัดการผู้ใช้ (แอดมิน)',
    labelEn: 'User Directory (admin)',
    commands: [
      { text: 'FORM USER CREATE', labelTh: 'เพิ่มผู้ใช้', labelEn: 'Create user' },
      { text: 'USER READ', labelTh: 'ดูข้อมูลผู้ใช้', labelEn: 'Read user' },
    ],
  },
  {
    key: 'catalog',
    labelTh: 'จัดการบริการ (แอดมิน)',
    labelEn: 'Service Catalog (admin)',
    commands: [
      { text: 'SERVICE LIST', labelTh: 'รายการบริการ', labelEn: 'List services' },
      { text: 'FORM SERVICE CREATE', labelTh: 'เพิ่มบริการ', labelEn: 'Create service' },
    ],
  },
  {
    key: 'reporting',
    labelTh: 'รายงาน',
    labelEn: 'Reporting',
    commands: [
      { text: 'DEMO REPORT', labelTh: 'รายงานประจำวัน', labelEn: 'Daily report' },
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
  { prefix: 'DEMO PRODUCT', service: 'commerce' },
  { prefix: 'DEMO QUOTE', service: 'commerce' },
  { prefix: 'DEMO ORDER', service: 'commerce' },
  { prefix: 'FORM DEMO QUOTE', service: 'commerce' },
  { prefix: 'USER CREATE', service: 'directory' },
  { prefix: 'USER READ', service: 'directory' },
  { prefix: 'USER UPDATE', service: 'directory' },
  { prefix: 'USER DELETE', service: 'directory' },
  { prefix: 'FORM USER CREATE', service: 'directory' },
  { prefix: 'SERVICE LIST', service: 'catalog' },
  { prefix: 'SERVICE READ', service: 'catalog' },
  { prefix: 'SERVICE CREATE', service: 'catalog' },
  { prefix: 'SERVICE UPDATE', service: 'catalog' },
  { prefix: 'SERVICE DELETE', service: 'catalog' },
  { prefix: 'FORM SERVICE CREATE', service: 'catalog' },
  { prefix: 'DEMO REPORT', service: 'reporting' },
  { prefix: 'DEMO SEGMENT', service: 'reporting' },
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

export const getAvailableServices = (channel?: ChannelContext): ServiceDefinition[] => {
  return SERVICE_CATALOG.filter(svc => isServiceEnabledForChannel(svc.key, channel));
};
