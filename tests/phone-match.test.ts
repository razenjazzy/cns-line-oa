import { describe, expect, it } from 'vitest';
import { phoneMatchVariants } from '../src/services/phone-match';

describe('phoneMatchVariants', () => {
  it('matches a local number with and without country code', () => {
    const fromLocal = phoneMatchVariants('0812345678');
    expect(fromLocal).toEqual(expect.arrayContaining(['0812345678', '+66812345678', '66812345678', '812345678']));
    const fromShort = phoneMatchVariants('812345678');
    expect(fromShort).toEqual(expect.arrayContaining(['0812345678', '+66812345678', '812345678']));
    const fromIntl = phoneMatchVariants('+66812345678');
    expect(fromIntl).toEqual(expect.arrayContaining(['0812345678', '+66812345678']));
  });

  it('stays within Firestore in-query limit', () => {
    expect(phoneMatchVariants('+66812345678').length).toBeLessThanOrEqual(10);
  });
});
