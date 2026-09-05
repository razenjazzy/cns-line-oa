import { describe, expect, it } from 'vitest';
import { isGatedMutation } from '../src/line/handlers/action-otp';

describe('isGatedMutation', () => {
  it('gates the quote lifecycle mutations', () => {
    expect(isGatedMutation('QUOTE CREATE App Premium Plan,1,Somchai,0812345678')).toBe(true);
    expect(isGatedMutation('QUOTE ADD 5 App Premium Plan,1')).toBe(true);
    expect(isGatedMutation('QUOTE REMOVE 5 App Premium Plan')).toBe(true);
    expect(isGatedMutation('QUOTE CANCEL 5')).toBe(true);
    expect(isGatedMutation('QUOTE INVOICE 5')).toBe(true);
    expect(isGatedMutation('MESSAGE CUSTOMER 0812345678 Hello')).toBe(true);
  });

  it('gates USER and SERVICE CRUD, closing the security-scorecard gap', () => {
    expect(isGatedMutation('USER CREATE Somchai,0812345678')).toBe(true);
    expect(isGatedMutation('USER UPDATE 0812345678,,,')).toBe(true);
    expect(isGatedMutation('USER DELETE 0812345678')).toBe(true);
    expect(isGatedMutation('SERVICE CREATE Premium Support,SVC-PREMIUM,990')).toBe(true);
    expect(isGatedMutation('SERVICE UPDATE SVC-PREMIUM,,1290,SVC-PRO')).toBe(true);
    expect(isGatedMutation('SERVICE DELETE SVC-PRO')).toBe(true);
  });

  it('does not gate view-only commands', () => {
    expect(isGatedMutation('QUOTE STATUS 5')).toBe(false);
    expect(isGatedMutation('QUOTE LIST 0812345678')).toBe(false);
    expect(isGatedMutation('USER READ 0812345678')).toBe(false);
    expect(isGatedMutation('SERVICE READ SVC-PREMIUM')).toBe(false);
    expect(isGatedMutation('SERVICE LIST')).toBe(false);
  });

  it('does not gate ADMIN ENABLE/DISABLE — already behind the allowlist + Odoo admin-capability chain', () => {
    expect(isGatedMutation('ADMIN ENABLE')).toBe(false);
    expect(isGatedMutation('ADMIN DISABLE')).toBe(false);
  });

  it('is not fooled by a prefix appearing mid-string', () => {
    expect(isGatedMutation('NOT A QUOTE CREATE COMMAND')).toBe(false);
  });
});
