type UiLanguage = 'th' | 'en';

type CommandSpec = {
  key: string;
  examples: string[];
  aliases?: string[];
};

const COMMAND_SPECS: CommandSpec[] = [
  { key: 'OPTIONS', examples: ['OPTIONS'] , aliases: ['MENU', 'HELP', 'START', 'เริ่มต้น'] },
  { key: 'FEATURES', examples: ['FEATURES'], aliases: ['ฟีเจอร์'] },
  { key: 'JOURNEY', examples: ['JOURNEY'], aliases: ['DEMO JOURNEY'] },
  { key: 'RUN DEMO JOURNEY', examples: ['RUN DEMO JOURNEY'] },
  { key: 'NAME', examples: ['NAME'], aliases: ['BOT NAME', 'WHAT IS YOUR NAME', 'ชื่ออะไร'] },
  { key: 'DEMO ODOO', examples: ['DEMO ODOO'] },
  { key: 'DEMO PRODUCT', examples: ['DEMO PRODUCT App'] },
  { key: 'DEMO QUOTE', examples: ['DEMO QUOTE App Premium Plan,1,Somchai,0812345678'] },
  { key: 'DEMO ORDER', examples: ['DEMO ORDER SO0001'] },
  { key: 'DEMO REPORT', examples: ['DEMO REPORT'] },
  { key: 'DEMO SEGMENT', examples: ['DEMO SEGMENT'] },
  { key: 'DEMO SEED ODOO', examples: ['DEMO SEED ODOO'] },
  { key: 'USER CREATE', examples: ['USER CREATE Somchai,0812345678,somchai@example.com'] },
  { key: 'USER READ', examples: ['USER READ 0812345678'] },
  { key: 'USER UPDATE', examples: ['USER UPDATE 0812345678,Somchai CEO,0812345678,somchai.ceo@example.com'] },
  { key: 'USER DELETE', examples: ['USER DELETE 0812345678'] },
  { key: 'SERVICE LIST', examples: ['SERVICE LIST'] },
  { key: 'SERVICE CREATE', examples: ['SERVICE CREATE Premium Support,SVC-PREMIUM,990'] },
  { key: 'SERVICE READ', examples: ['SERVICE READ SVC-PREMIUM'] },
  { key: 'SERVICE UPDATE', examples: ['SERVICE UPDATE SVC-PREMIUM,Premium Support Pro,1290,SVC-PRO'] },
  { key: 'SERVICE DELETE', examples: ['SERVICE DELETE SVC-PRO'] },
  { key: 'ADMIN VERIFY', examples: ['ADMIN VERIFY'] },
  { key: 'ADMIN ENABLE', examples: ['ADMIN ENABLE'] },
  { key: 'ADMIN DISABLE', examples: ['ADMIN DISABLE'], aliases: ['ADMIN REVOKE'] },
  { key: 'ADMIN CHANNEL', examples: ['ADMIN CHANNEL default STATUS', 'ADMIN CHANNEL default SERVICES commerce,catalog'] },
  { key: 'ADMIN AUDIT ROTATE', examples: ['ADMIN AUDIT ROTATE'] },
  { key: 'NAV HOME', examples: ['NAV HOME'], aliases: ['NAV'] },
  { key: 'BACK', examples: ['BACK'] },
  { key: 'LANG EN', examples: ['LANG EN'], aliases: ['ENGLISH'] },
  { key: 'LANG TH', examples: ['LANG TH'], aliases: ['THAI', 'ภาษาไทย'] },
  { key: 'GUIDE', examples: ['GUIDE'], aliases: ['STEP BY STEP', 'MENU GUIDE', 'คู่มือ'] },
  { key: 'HUMAN', examples: ['HUMAN'], aliases: ['AGENT', 'ติดต่อแอดมิน', 'คุยกับแอดมิน'] },
  { key: 'MY DATA', examples: ['MY DATA'], aliases: ['ข้อมูลของฉัน'] },
  { key: 'DELETE MY DATA', examples: ['DELETE MY DATA'] },
  { key: 'PROMO ON', examples: ['PROMO ON'], aliases: ['รับโปรโมชัน'] },
  { key: 'PROMO OFF', examples: ['PROMO OFF'], aliases: ['ไม่รับโปรโมชัน'] },
];

const normalize = (raw: string): string => raw.trim().toUpperCase().replace(/\s+/g, ' ');

const isLikelyCommand = (input: string): boolean => {
  const value = normalize(input);
  if (!value) return false;
  if (/[,<>]/.test(value)) return true;
  const tokens = value.split(' ');
  if (tokens.length >= 2) return true;
  return /^[A-Z\u0E00-\u0E7F]+$/.test(value);
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

  if ((tokens[0] === 'USER' || tokens[0] === 'SERVICE' || tokens[0] === 'ADMIN' || tokens[0] === 'LANG') && tokens.length >= 2) {
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

export const buildStepByStepGuide = (language: UiLanguage, agentName: string): string => {
  if (language === 'en') {
    return `${agentName} step-by-step command guide\n\n1) Start and menu\n- OPTIONS\n- FEATURES\n\n2) Environment and journey\n- ADMIN VERIFY\n- ADMIN ENABLE\n- ADMIN DISABLE\n- RUN DEMO JOURNEY\n\n3) Odoo demo flow\n- DEMO ODOO\n- DEMO PRODUCT App\n- DEMO QUOTE App Premium Plan,1,Somchai,0812345678\n- DEMO ORDER SO0001\n- DEMO REPORT\n\n4) User CRUD (type FORM USER CREATE etc. for a guided step-by-step version)\n- USER CREATE <name>,<phone>,<email?>\n- USER READ <phone>\n- USER UPDATE <phone>,<name?>,<newPhone?>,<email?>\n- USER DELETE <phone>\n\n5) Service CRUD (type FORM SERVICE CREATE etc. for a guided step-by-step version)\n- SERVICE LIST\n- SERVICE CREATE <name>,<code>,<price>\n- SERVICE READ <code_or_name>\n- SERVICE UPDATE <code_or_name>,<name?>,<price?>,<newCode?>\n- SERVICE DELETE <code_or_name>\n\n6) Language\n- LANG EN\n- LANG TH\n\n7) Navigation menu\n- NAV HOME (browse services available on this channel)\n- BACK (return to the home menu)\n\n8) Multi-channel module config (admin)\n- ADMIN CHANNEL <channelId> STATUS\n- ADMIN CHANNEL <channelId> SERVICES <svc1,svc2,...|ALL>\n\n9) Audit trail (admin)\n- ADMIN AUDIT ROTATE (archive events older than the retention window to BigQuery, then delete them from Firestore)\n\n10) Talk to a person\n- HUMAN (always connects you to a human agent, no waiting on the AI to decide)\n\n11) Your data and preferences\n- MY DATA (see what's stored about you)\n- DELETE MY DATA (request full erasure)\n- PROMO ON / PROMO OFF (subscribe or unsubscribe from marketing messages)\n\nTip: If a command fails, send GUIDE and copy a command exactly.`;
  }

  return `${agentName} คู่มือคำสั่งทีละขั้น\n\n1) เริ่มต้นและดูเมนู\n- OPTIONS\n- FEATURES\n\n2) เตรียมสภาพแวดล้อม\n- ADMIN VERIFY\n- ADMIN ENABLE\n- ADMIN DISABLE\n- RUN DEMO JOURNEY\n\n3) เดโม Odoo ครบวงจร\n- DEMO ODOO\n- DEMO PRODUCT App\n- DEMO QUOTE App Premium Plan,1,สมชาย,0812345678\n- DEMO ORDER SO0001\n- DEMO REPORT\n\n4) จัดการผู้ใช้ (พิมพ์ FORM USER CREATE เป็นต้น เพื่อใช้แบบฟอร์มทีละขั้น)\n- USER CREATE <ชื่อ>,<เบอร์>,<อีเมล?>\n- USER READ <เบอร์>\n- USER UPDATE <เบอร์>,<ชื่อใหม่?>,<เบอร์ใหม่?>,<อีเมล?>\n- USER DELETE <เบอร์>\n\n5) จัดการบริการ (พิมพ์ FORM SERVICE CREATE เป็นต้น เพื่อใช้แบบฟอร์มทีละขั้น)\n- SERVICE LIST\n- SERVICE CREATE <ชื่อ>,<รหัส>,<ราคา>\n- SERVICE READ <รหัสหรือชื่อ>\n- SERVICE UPDATE <รหัสหรือชื่อ>,<ชื่อใหม่?>,<ราคาใหม่?>,<รหัสใหม่?>\n- SERVICE DELETE <รหัสหรือชื่อ>\n\n6) เปลี่ยนภาษา\n- LANG EN\n- LANG TH\n\n7) เมนูนำทาง\n- NAV HOME (ดูบริการที่เปิดใช้งานบนช่องทางนี้)\n- BACK (กลับไปหน้าเมนูหลัก)\n\n8) ตั้งค่าโมดูลต่อช่องทาง (แอดมิน)\n- ADMIN CHANNEL <channelId> STATUS\n- ADMIN CHANNEL <channelId> SERVICES <svc1,svc2,...|ALL>\n\n9) บันทึกการตรวจสอบ (แอดมิน)\n- ADMIN AUDIT ROTATE (เก็บถาวรรายการที่เกินระยะเวลาที่กำหนดไปยัง BigQuery แล้วลบออกจาก Firestore)\n\n10) คุยกับเจ้าหน้าที่\n- HUMAN (โอนสายหาเจ้าหน้าที่ทันที ไม่ต้องรอ AI ตัดสินใจ)\n\n11) ข้อมูลและการตั้งค่าของคุณ\n- MY DATA (ดูข้อมูลที่เราเก็บไว้)\n- DELETE MY DATA (ขอลบข้อมูลทั้งหมด)\n- PROMO ON / PROMO OFF (เปิด/ปิดรับข่าวสารและโปรโมชัน)\n\nเคล็ดลับ: ถ้าคำสั่งผิด ให้พิมพ์ GUIDE แล้วคัดลอกคำสั่งตามตัวอย่างได้เลย`;
};

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
