const MAX_TEXT_LEN = 120;
const MAX_CODE_LEN = 64;

const normalize = (value: string, maxLength = MAX_TEXT_LEN): string => {
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  return cleaned.slice(0, maxLength);
};

const parseCsv = (raw: string): string[] => raw.split(',').map(v => v.trim());

const isValidPhone = (phone: string): boolean => /^\+?[0-9][0-9\-\s]{7,19}$/.test(phone);
const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export type UserCreateInput = {
  name: string;
  phone: string;
  email?: string;
};

export const parseUserCreatePayload = (payload: string): UserCreateInput | null => {
  const [nameRaw, phoneRaw, emailRaw] = parseCsv(payload);
  const name = normalize(nameRaw || '');
  const phone = normalize(phoneRaw || '', 24);
  const email = normalize(emailRaw || '', 120);

  if (!name || !phone || !isValidPhone(phone)) return null;
  if (email && !isValidEmail(email)) return null;

  return {
    name,
    phone,
    ...(email ? { email: email.toLowerCase() } : {}),
  };
};

export type UserUpdateInput = {
  phone: string;
  name?: string;
  newPhone?: string;
  email?: string;
};

export const parseUserUpdatePayload = (payload: string): UserUpdateInput | null => {
  const [phoneRaw, nameRaw, newPhoneRaw, emailRaw] = parseCsv(payload);
  const phone = normalize(phoneRaw || '', 24);
  const name = normalize(nameRaw || '');
  const newPhone = normalize(newPhoneRaw || '', 24);
  const email = normalize(emailRaw || '', 120);

  if (!phone || !isValidPhone(phone)) return null;
  if (newPhone && !isValidPhone(newPhone)) return null;
  if (email && !isValidEmail(email)) return null;
  if (!name && !newPhone && !email) return null;

  return {
    phone,
    ...(name ? { name } : {}),
    ...(newPhone ? { newPhone } : {}),
    ...(email ? { email: email.toLowerCase() } : {}),
  };
};

export type ServiceCreateInput = {
  name: string;
  code: string;
  price: number;
};

export const parseServiceCreatePayload = (payload: string): ServiceCreateInput | null => {
  const [nameRaw, codeRaw, priceRaw] = parseCsv(payload);
  const name = normalize(nameRaw || '');
  const code = normalize(codeRaw || '', MAX_CODE_LEN).replace(/\s+/g, '-');
  const price = Number(priceRaw || '');

  if (!name || !code || Number.isNaN(price) || price <= 0) return null;

  return { name, code, price };
};

export type ServiceUpdateInput = {
  identifier: string;
  name?: string;
  price?: number;
  newCode?: string;
};

export const parseServiceUpdatePayload = (payload: string): ServiceUpdateInput | null => {
  const [identifierRaw, nameRaw, priceRaw, newCodeRaw] = parseCsv(payload);
  const identifier = normalize(identifierRaw || '', MAX_CODE_LEN);
  const name = normalize(nameRaw || '');
  const newCode = normalize(newCodeRaw || '', MAX_CODE_LEN).replace(/\s+/g, '-');
  const price = priceRaw ? Number(priceRaw) : undefined;

  if (!identifier) return null;
  if (priceRaw && (price === undefined || Number.isNaN(price) || price <= 0)) return null;
  if (!name && !newCode && price === undefined) return null;

  return {
    identifier,
    ...(name ? { name } : {}),
    ...(newCode ? { newCode } : {}),
    ...(price !== undefined ? { price } : {}),
  };
};

export type DemoQuoteInput = {
  productName: string;
  qty: number;
  customerName: string;
  phone: string;
};

export const parseDemoQuotePayload = (payload: string): DemoQuoteInput | null => {
  const [productNameRaw, qtyRaw, customerNameRaw, phoneRaw] = parseCsv(payload);
  const productName = normalize(productNameRaw || '');
  const customerName = normalize(customerNameRaw || '');
  const phone = normalize(phoneRaw || '', 24);
  const qty = Number(qtyRaw || '');

  if (!productName || !customerName || !phone || !isValidPhone(phone)) return null;
  if (Number.isNaN(qty) || qty <= 0 || qty > 10000) return null;

  return {
    productName,
    qty,
    customerName,
    phone,
  };
};
