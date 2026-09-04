import { describe, expect, it } from 'vitest';
import { evaluateCommandPolicy } from '../src/services/command-policy';
import { resolveCommandById } from '../src/ux/command-registry';

const command = (id: string) => resolveCommandById(id)!;

const verifiedLineUser = {
  isAdmin: false,
  odooVerified: true,
  hasFreshActionOtp: true,
  channel: 'line' as const,
};

describe('evaluateCommandPolicy', () => {
  it('allows a verified LINE user with a fresh OTP to create a quote', () => {
    expect(evaluateCommandPolicy(command('QUOTE_CREATE'), verifiedLineUser)).toEqual({
      allowed: true,
      reason: 'allowed',
    });
  });

  it('requires verification before accepting an OTP-gated command', () => {
    expect(evaluateCommandPolicy(command('QUOTE_CREATE'), {
      ...verifiedLineUser,
      odooVerified: false,
    })).toEqual({ allowed: false, reason: 'verification_required' });
  });

  it('requires a fresh OTP for a verified mutating command', () => {
    expect(evaluateCommandPolicy(command('QUOTE_CREATE'), {
      ...verifiedLineUser,
      hasFreshActionOtp: false,
    })).toEqual({ allowed: false, reason: 'otp_required' });
  });

  it('fails closed for admin commands outside the allowed channel', () => {
    expect(evaluateCommandPolicy(command('USER_CREATE'), {
      isAdmin: true,
      odooVerified: true,
      hasFreshActionOtp: true,
      channel: 'line',
    })).toEqual({ allowed: false, reason: 'channel_not_allowed' });
  });

  it('requires the admin role for operations commands', () => {
    expect(evaluateCommandPolicy(command('USER_CREATE'), {
      isAdmin: false,
      odooVerified: true,
      hasFreshActionOtp: true,
      channel: 'ops',
    })).toEqual({ allowed: false, reason: 'admin_required' });
  });
});