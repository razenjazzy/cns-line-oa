import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isAuthorizedForAdminRole } from '../src/services/admin-authorization';

describe('isAuthorizedForAdminRole', () => {
  const originalAdminUserId = process.env.ADMIN_USER_ID;

  beforeEach(() => {
    delete process.env.ADMIN_USER_ID;
  });

  afterEach(() => {
    if (originalAdminUserId === undefined) {
      delete process.env.ADMIN_USER_ID;
    } else {
      process.env.ADMIN_USER_ID = originalAdminUserId;
    }
  });

  it('fails closed when ADMIN_USER_ID is unset', () => {
    const result = isAuthorizedForAdminRole('U123', { odooVerified: true });
    expect(result).toEqual({ ok: false, reason: 'allowlist_not_configured' });
  });

  it('fails closed when ADMIN_USER_ID is empty', () => {
    process.env.ADMIN_USER_ID = '   ';
    const result = isAuthorizedForAdminRole('U123', { odooVerified: true });
    expect(result).toEqual({ ok: false, reason: 'allowlist_not_configured' });
  });

  it('denies an unverified user even if allowlisted', () => {
    process.env.ADMIN_USER_ID = 'U123';
    const result = isAuthorizedForAdminRole('U123', { odooVerified: false });
    expect(result).toEqual({ ok: false, reason: 'not_verified' });
  });

  it('denies a verified user not in the allowlist', () => {
    process.env.ADMIN_USER_ID = 'U999';
    const result = isAuthorizedForAdminRole('U123', { odooVerified: true });
    expect(result).toEqual({ ok: false, reason: 'not_allowlisted' });
  });

  it('authorizes a verified, allowlisted user', () => {
    process.env.ADMIN_USER_ID = 'U123';
    const result = isAuthorizedForAdminRole('U123', { odooVerified: true });
    expect(result).toEqual({ ok: true, reason: 'authorized' });
  });

  it('trims whitespace and ignores empty entries in the allowlist', () => {
    process.env.ADMIN_USER_ID = ' U111 , , U123 ,U222';
    const result = isAuthorizedForAdminRole('U123', { odooVerified: true });
    expect(result).toEqual({ ok: true, reason: 'authorized' });
  });

  it('trims whitespace on the provided userId', () => {
    process.env.ADMIN_USER_ID = 'U123';
    const result = isAuthorizedForAdminRole('  U123  ', { odooVerified: true });
    expect(result).toEqual({ ok: true, reason: 'authorized' });
  });
});
