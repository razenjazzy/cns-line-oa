type UiLanguage = 'th' | 'en';

/**
 * Mirrors src/services/service-catalog.ts's ServiceKey where a command is
 * actually service-scoped, plus three general categories (basics/admin/
 * account) for commands that aren't. Kept as a separate union rather than
 * importing ServiceKey directly since 'basics'/'admin'/'account' aren't
 * real services — but the five that overlap use the exact same keys so
 * src/line/templates/guide.ts can reuse navigation.ts's SERVICE_ICON map
 * instead of maintaining a second icon table.
 */
export type CommandCategoryKey = 'basics' | 'commerce' | 'directory' | 'catalog' | 'reporting' | 'groupBuy' | 'admin' | 'account';

type CommandSpec = {
  key: string;
  examples: string[];
  aliases?: string[];
  category: CommandCategoryKey;
};

const COMMAND_SPECS: CommandSpec[] = [
  { key: 'OPTIONS', examples: ['OPTIONS'], aliases: ['MENU', 'HELP', 'START', 'เริ่มต้น'], category: 'basics' },
  { key: 'FEATURES', examples: ['FEATURES'], aliases: ['ฟีเจอร์'], category: 'basics' },
  { key: 'NAME', examples: ['NAME'], aliases: ['BOT NAME', 'WHAT IS YOUR NAME', 'ชื่ออะไร'], category: 'basics' },
  { key: 'VERIFY START', examples: ['VERIFY START 0812345678'], category: 'basics' },
  { key: 'NAV HOME', examples: ['NAV HOME'], aliases: ['NAV'], category: 'basics' },
  { key: 'BACK', examples: ['BACK'], category: 'basics' },
  { key: 'LANG EN', examples: ['LANG EN'], aliases: ['ENGLISH'], category: 'basics' },
  { key: 'LANG TH', examples: ['LANG TH'], aliases: ['THAI', 'ภาษาไทย'], category: 'basics' },

  { key: 'PRODUCT FIND', examples: ['PRODUCT FIND App'], category: 'commerce' },
  { key: 'QUOTE CREATE', examples: ['QUOTE CREATE App Premium Plan,1,Somchai,0812345678'], category: 'commerce' },
  { key: 'QUOTE STATUS', examples: ['QUOTE STATUS 5'], category: 'commerce' },
  { key: 'QUOTE LIST', examples: ['QUOTE LIST'], category: 'commerce' },
  { key: 'ORDER STATUS', examples: ['ORDER STATUS SO0001'], category: 'commerce' },
  { key: 'MESSAGE CUSTOMER', examples: ['MESSAGE CUSTOMER 0812345678 Hi! We have a new offer for you.'], category: 'commerce' },

  { key: 'USER CREATE', examples: ['USER CREATE Somchai,0812345678,somchai@example.com'], category: 'directory' },
  { key: 'USER READ', examples: ['USER READ 0812345678'], category: 'directory' },
  { key: 'USER UPDATE', examples: ['USER UPDATE 0812345678,Somchai CEO,0812345678,somchai.ceo@example.com'], category: 'directory' },
  { key: 'USER DELETE', examples: ['USER DELETE 0812345678'], category: 'directory' },

  { key: 'SERVICE LIST', examples: ['SERVICE LIST'], category: 'catalog' },
  { key: 'SERVICE CREATE', examples: ['SERVICE CREATE Premium Support,SVC-PREMIUM,990'], category: 'catalog' },
  { key: 'SERVICE READ', examples: ['SERVICE READ SVC-PREMIUM'], category: 'catalog' },
  { key: 'SERVICE UPDATE', examples: ['SERVICE UPDATE SVC-PREMIUM,Premium Support Pro,1290,SVC-PRO'], category: 'catalog' },
  { key: 'SERVICE DELETE', examples: ['SERVICE DELETE SVC-PRO'], category: 'catalog' },

  { key: 'SYSTEM STATUS', examples: ['SYSTEM STATUS'], category: 'reporting' },
  { key: 'DAILY REPORT', examples: ['DAILY REPORT'], category: 'reporting' },
  { key: 'SEGMENT CUSTOMERS', examples: ['SEGMENT CUSTOMERS'], category: 'reporting' },

  { key: 'START GROUPBUY', examples: ['START GROUPBUY App Premium Plan,10,20'], category: 'groupBuy' },
  { key: 'JOIN GROUPBUY', examples: ['JOIN GROUPBUY 1'], category: 'groupBuy' },
  { key: 'STATUS GROUPBUY', examples: ['STATUS GROUPBUY 1'], category: 'groupBuy' },
  { key: 'CONFIRM GROUPBUY', examples: ['CONFIRM GROUPBUY 1'], category: 'groupBuy' },
  { key: 'CANCEL GROUPBUY', examples: ['CANCEL GROUPBUY 1'], category: 'groupBuy' },

  { key: 'JOURNEY', examples: ['JOURNEY'], aliases: ['DEMO JOURNEY'], category: 'admin' },
  { key: 'RUN DEMO JOURNEY', examples: ['RUN DEMO JOURNEY'], category: 'admin' },
  { key: 'SEED SAMPLE DATA', examples: ['SEED SAMPLE DATA'], category: 'admin' },
  { key: 'ADMIN VERIFY', examples: ['ADMIN VERIFY'], category: 'admin' },
  { key: 'ADMIN ENABLE', examples: ['ADMIN ENABLE'], category: 'admin' },
  { key: 'ADMIN DISABLE', examples: ['ADMIN DISABLE'], aliases: ['ADMIN REVOKE'], category: 'admin' },
  { key: 'ADMIN CHANNEL', examples: ['ADMIN CHANNEL default STATUS', 'ADMIN CHANNEL default SERVICES commerce,catalog'], category: 'admin' },
  { key: 'ADMIN AUDIT ROTATE', examples: ['ADMIN AUDIT ROTATE'], category: 'admin' },

  { key: 'HUMAN', examples: ['HUMAN'], aliases: ['AGENT', 'ติดต่อแอดมิน', 'คุยกับแอดมิน'], category: 'account' },
  { key: 'MY DATA', examples: ['MY DATA'], aliases: ['ข้อมูลของฉัน'], category: 'account' },
  { key: 'DELETE MY DATA', examples: ['DELETE MY DATA'], category: 'account' },
  { key: 'PROMO ON', examples: ['PROMO ON'], aliases: ['รับโปรโมชัน'], category: 'account' },
  { key: 'PROMO OFF', examples: ['PROMO OFF'], aliases: ['ไม่รับโปรโมชัน'], category: 'account' },

  // GUIDE itself isn't listed as a category item — it's the meta-command
  // that got the user here in the first place.
  { key: 'GUIDE', examples: ['GUIDE'], aliases: ['STEP BY STEP', 'MENU GUIDE', 'คู่มือ'], category: 'basics' },
];

export const GUIDE_CATEGORY_ORDER: CommandCategoryKey[] = ['basics', 'commerce', 'directory', 'catalog', 'reporting', 'groupBuy', 'admin', 'account'];

export const GUIDE_CATEGORY_LABELS: Record<CommandCategoryKey, { th: string; en: string }> = {
  basics: { th: 'เริ่มต้นใช้งาน', en: 'Getting started' },
  commerce: { th: 'สินค้า/ใบเสนอราคา', en: 'Products & quotes' },
  directory: { th: 'จัดการลูกค้า', en: 'Customers' },
  catalog: { th: 'จัดการบริการ', en: 'Catalog & services' },
  reporting: { th: 'รายงาน', en: 'Reports' },
  groupBuy: { th: 'Group-Buy', en: 'Group-Buy' },
  admin: { th: 'ตั้งค่าแอดมิน', en: 'Admin setup' },
  account: { th: 'บัญชีของฉัน', en: 'Account & data' },
};

/** Shown as a body note above a category's command buttons — only where it adds real information beyond the button list itself. */
export const GUIDE_CATEGORY_NOTES: Partial<Record<CommandCategoryKey, { th: string; en: string }>> = {
  basics: {
    en: 'After VERIFY START, reply with VERIFY OTP <code> from the message you receive. Most commands below also have a guided, step-by-step version — type FORM <command>, e.g. FORM PRODUCT FIND.',
    th: 'หลังจาก VERIFY START ให้พิมพ์ VERIFY OTP <รหัส> ตามที่ได้รับ คำสั่งด้านล่างส่วนใหญ่มีแบบฟอร์มทีละขั้นด้วย ลองพิมพ์ FORM <คำสั่ง> เช่น FORM PRODUCT FIND',
  },
  commerce: {
    en: 'Once a quote exists, manage it from its own card\'s buttons, or type QUOTE ADD/EDIT/REMOVE/CANCEL/CONFIRM/SEND/INVOICE/APPROVE <id> ... directly.',
    th: 'เมื่อมีใบเสนอราคาแล้ว จัดการต่อได้จากปุ่มบนการ์ดนั้น หรือพิมพ์ QUOTE ADD/EDIT/REMOVE/CANCEL/CONFIRM/SEND/INVOICE/APPROVE <id> ... ได้โดยตรง',
  },
  directory: {
    en: 'Each of these has a guided version too — try FORM USER CREATE.',
    th: 'แต่ละคำสั่งมีแบบฟอร์มทีละขั้นด้วย ลองพิมพ์ FORM USER CREATE',
  },
  catalog: {
    en: 'Each of these has a guided version too — try FORM SERVICE CREATE.',
    th: 'แต่ละคำสั่งมีแบบฟอร์มทีละขั้นด้วย ลองพิมพ์ FORM SERVICE CREATE',
  },
};

const normalize = (raw: string): string => raw.trim().toUpperCase().replace(/\s+/g, ' ');

const isLikelyCommand = (input: string): boolean => {
  const value = normalize(input);
  if (!value) return false;
  if (/[,<>]/.test(value)) return true;
  const tokens = value.split(' ');
  if (tokens.length >= 2) return true;
  return /^[A-Z฀-๿]+$/.test(value);
};

const extractIntentKey = (input: string): string => {
  const normalized = normalize(input);
  const tokens = normalized.split(' ').filter(Boolean);
  if (!tokens.length) return '';

  if (tokens[0] === 'RUN' && tokens.length >= 3) {
    return tokens.slice(0, 3).join(' ');
  }

  if (tokens[0] === 'DEMO' && tokens.length >= 2) {
    if (tokens[1] === 'SEED' && tokens.length >= 3) return tokens.slice(0, 3).join(' ');
    return tokens.slice(0, 2).join(' ');
  }

  if ((tokens[0] === 'USER' || tokens[0] === 'SERVICE' || tokens[0] === 'ADMIN' || tokens[0] === 'LANG' || tokens[0] === 'VERIFY') && tokens.length >= 2) {
    return tokens.slice(0, 2).join(' ');
  }

  if (tokens[0] === 'WHAT' && tokens.length >= 4) return 'WHAT IS YOUR NAME';
  if (tokens[0] === 'BOT' && tokens.length >= 2) return 'BOT NAME';

  return tokens[0];
};

const levenshtein = (a: string, b: string): number => {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
};

const scoreSimilarity = (input: string, candidate: string): number => {
  const maxLen = Math.max(input.length, candidate.length) || 1;
  const distance = levenshtein(input, candidate);
  return 1 - distance / maxLen;
};

const allCommandKeys = (): string[] => COMMAND_SPECS.flatMap(spec => [spec.key, ...(spec.aliases || [])]).map(normalize);

const topMatches = (intent: string): string[] => {
  const keys = allCommandKeys();
  const ranked = keys
    .map(key => ({ key, score: scoreSimilarity(intent, key) }))
    .filter(item => item.score >= 0.45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(item => item.key);

  return Array.from(new Set(ranked));
};

const toCanonicalExample = (match: string): string | null => {
  const normalizedMatch = normalize(match);
  for (const spec of COMMAND_SPECS) {
    const keys = [spec.key, ...(spec.aliases || [])].map(normalize);
    if (keys.includes(normalizedMatch)) return spec.examples[0];
  }
  return null;
};

export const isGuideCommand = (input: string): boolean => {
  const intent = extractIntentKey(input);
  const guideKeys = ['GUIDE', 'STEP BY STEP', 'MENU GUIDE', 'คู่มือ'].map(normalize);
  return guideKeys.includes(intent);
};

/** Parses a category token off `GUIDE <TOKEN>` — only literal category keys are recognized (case-insensitive), since that's exactly what the category buttons this module renders send. */
export const parseGuideCategoryKey = (input: string): CommandCategoryKey | null => {
  const upper = input.trim().toUpperCase();
  if (!upper.startsWith('GUIDE ')) return null;
  const token = upper.slice('GUIDE '.length).trim();
  const match = GUIDE_CATEGORY_ORDER.find(key => key.toUpperCase() === token);
  return match || null;
};

export const getCommandsForCategory = (category: CommandCategoryKey): { key: string; example: string }[] =>
  COMMAND_SPECS.filter(spec => spec.category === category && spec.key !== 'GUIDE').map(spec => ({ key: spec.key, example: spec.examples[0] }));

export const buildCommandKeywordGuidance = (input: string, language: UiLanguage, agentName: string): string | null => {
  if (!isLikelyCommand(input)) return null;

  const intent = extractIntentKey(input);
  if (!intent) return null;

  const exact = allCommandKeys();
  if (exact.includes(intent)) return null;

  const matches = topMatches(intent)
    .map(toCanonicalExample)
    .filter((value): value is string => Boolean(value));

  const unique = Array.from(new Set(matches)).slice(0, 3);
  if (!unique.length) return null;

  if (language === 'en') {
    return `${agentName} could not find this command: "${input.trim()}"\n\nTry one of these close matches:\n${unique.map(example => `- ${example}`).join('\n')}\n\nYou can also type GUIDE for the full command walkthrough.`;
  }

  return `${agentName} ไม่พบคำสั่ง: "${input.trim()}"\n\nคำสั่งที่ใกล้เคียง:\n${unique.map(example => `- ${example}`).join('\n')}\n\nพิมพ์ GUIDE เพื่อดูคู่มือคำสั่งแบบทีละขั้นได้ค่ะ`;
};
