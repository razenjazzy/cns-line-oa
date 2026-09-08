/**
 * Phone matching for VERIFY and LINE delivery. Odoo and Firestore store
 * numbers as 08…, 66…, or +66…; callers often omit the country code.
 * Firestore `in` queries allow at most 10 values.
 */
export const phoneMatchVariants = (phone: string): string[] => {
  const cleaned = phone.replace(/[^0-9+]/g, '').trim();
  if (!cleaned) return [];

  const variants = new Set<string>([cleaned]);
  const digits = cleaned.replace(/\D/g, '');

  const addThai = (nationalWithoutZero: string) => {
    if (!nationalWithoutZero) return;
    variants.add(`0${nationalWithoutZero}`);
    variants.add(`+66${nationalWithoutZero}`);
    variants.add(`66${nationalWithoutZero}`);
    variants.add(nationalWithoutZero);
  };

  if (cleaned.startsWith('0') && cleaned.length >= 9) {
    addThai(cleaned.slice(1));
  } else if (cleaned.startsWith('+66')) {
    addThai(cleaned.slice(3));
  } else if (cleaned.startsWith('66') && digits.length >= 10) {
    addThai(digits.slice(2));
  } else if (/^[1-9]\d{7,9}$/.test(digits) && !digits.startsWith('66')) {
    addThai(digits);
  }

  if (digits.length >= 9) {
    addThai(digits.slice(-9));
  }

  return Array.from(variants).slice(0, 10);
};
