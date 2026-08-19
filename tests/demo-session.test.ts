import { describe, expect, it } from 'vitest';
import { createDemoSessionToken, parseCookieValue, safeTokenMatch, verifyDemoSessionToken, verifyDemoSessionTokenWithSecrets } from '../src/services/demo-session';

describe('demo session token helpers', () => {
  it('creates and verifies a valid token', () => {
    const token = createDemoSessionToken('secret-1', 300);
    const verify = verifyDemoSessionToken(token, 'secret-1');
    expect(verify.ok).toBe(true);
  });

  it('rejects token with wrong secret', () => {
    const token = createDemoSessionToken('secret-1', 300);
    const verify = verifyDemoSessionToken(token, 'secret-2');
    expect(verify.ok).toBe(false);
  });

  it('parses cookie values by key', () => {
    const value = parseCookieValue('a=1; demo_control_session=abc.def; c=3', 'demo_control_session');
    expect(value).toBe('abc.def');
  });

  it('does timing-safe token match', () => {
    expect(safeTokenMatch('x-token', 'x-token')).toBe(true);
    expect(safeTokenMatch('x-token', 'y-token')).toBe(false);
  });

  it('rejects malformed token', () => {
    const verify = verifyDemoSessionToken('not-a-valid-token', 'secret-1');
    expect(verify.ok).toBe(false);
  });

  it('verifies token against multi-secret list for rotation grace', () => {
    const token = createDemoSessionToken('old-secret', 300);
    const verify = verifyDemoSessionTokenWithSecrets(token, ['new-secret', 'old-secret']);
    expect(verify.ok).toBe(true);
    expect(verify.matchedSecretIndex).toBe(1);
  });
});
