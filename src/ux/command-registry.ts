import type { CommandDefinition, CommandRegistry } from '../erp/adapter';

export const COMMAND_REGISTRY_DATA: CommandDefinition[] = [
  {
    id: 'PRODUCT_FIND',
    commandText: 'PRODUCT FIND',
    handlerName: 'commerce-product-find',
    labelTh: 'ค้นหาสินค้า',
    labelEn: 'Find product',
    category: 'commerce',
    serviceKey: 'commerce',
    enabled: true,
    action: 'read',
    channels: ['line', 'web'],
  },
  {
    id: 'QUOTE_CREATE',
    commandText: 'QUOTE CREATE',
    handlerName: 'commerce-quote-create',
    labelTh: 'สร้างใบเสนอราคา',
    labelEn: 'Create quote',
    category: 'commerce',
    serviceKey: 'commerce',
    requiresOtp: true,
    approvalRequired: true,
    enabled: true,
    action: 'quote.create',
    channels: ['line', 'web'],
  },
  {
    id: 'QUOTE_CANCEL',
    commandText: 'QUOTE CANCEL',
    handlerName: 'quote-cancel',
    labelTh: 'ยกเลิกใบเสนอราคา',
    labelEn: 'Cancel quote',
    category: 'commerce',
    serviceKey: 'commerce',
    requiresAdmin: false,
    requiresOtp: true,
    approvalRequired: true,
    enabled: true,
    action: 'quote.cancel',
    channels: ['line', 'web'],
  },
  {
    id: 'ORDER_CONFIRM',
    commandText: 'QUOTE CONFIRM',
    handlerName: 'quote-confirm',
    labelTh: 'ยืนยันออเดอร์',
    labelEn: 'Confirm order',
    category: 'commerce',
    serviceKey: 'commerce',
    requiresOtp: true,
    approvalRequired: true,
    enabled: true,
    action: 'order.confirm',
    channels: ['line', 'web'],
  },
  {
    id: 'USER_CREATE',
    commandText: 'USER CREATE',
    handlerName: 'user-create',
    labelTh: 'เพิ่มผู้ใช้',
    labelEn: 'Add customer',
    category: 'directory',
    serviceKey: 'directory',
    requiresAdmin: true,
    enabled: true,
    action: 'customer.create',
    channels: ['ops', 'admin'],
  },
  {
    id: 'SERVICE_CREATE',
    commandText: 'SERVICE CREATE',
    handlerName: 'catalog-create',
    labelTh: 'เพิ่มบริการ',
    labelEn: 'Add service',
    category: 'catalog',
    serviceKey: 'catalog',
    requiresAdmin: true,
    enabled: true,
    action: 'service.create',
    channels: ['admin', 'ops'],
  },
  {
    id: 'DAILY_REPORT',
    commandText: 'DAILY REPORT',
    handlerName: 'commerce-daily-report',
    labelTh: 'รายงานประจำวัน',
    labelEn: 'Daily report',
    category: 'reporting',
    serviceKey: 'reporting',
    requiresAdmin: true,
    approvalRequired: true,
    enabled: true,
    action: 'read',
    channels: ['admin'],
  },
];

export const commandRegistry: CommandRegistry = {
  commands: COMMAND_REGISTRY_DATA,
  getById: (id: string) => COMMAND_REGISTRY_DATA.find(command => command.id === id),
  getVisible: ({ isAdmin, channel = 'line' }) => COMMAND_REGISTRY_DATA.filter(command => {
    if (!command.enabled) return false;
    if (command.requiresAdmin && !isAdmin) return false;
    if (command.channels && !command.channels.includes(channel)) {
      return false;
    }
    return true;
  }),
};

export const resolveCommandById = (id: string) => commandRegistry.getById(id);
