import type { CommandDefinition } from '../erp/adapter';

export type CommandPolicyContext = {
  isAdmin: boolean;
  odooVerified: boolean;
  hasFreshActionOtp: boolean;
  channel: 'line' | 'web' | 'ops' | 'admin';
};

export type CommandPolicyResult =
  | { allowed: true; reason: 'allowed' }
  | { allowed: false; reason: 'disabled' | 'admin_required' | 'channel_not_allowed' | 'verification_required' | 'otp_required' };

/**
 * Evaluates metadata only. The LINE handler registry remains responsible for
 * executing commands; this policy is the shared decision point for future
 * menus, APIs, and ERP adapters.
 */
export const evaluateCommandPolicy = (
  command: CommandDefinition,
  context: CommandPolicyContext
): CommandPolicyResult => {
  if (!command.enabled) return { allowed: false, reason: 'disabled' };
  if (command.channels && !command.channels.includes(context.channel)) {
    return { allowed: false, reason: 'channel_not_allowed' };
  }
  if (command.requiresAdmin && !context.isAdmin) {
    return { allowed: false, reason: 'admin_required' };
  }
  if (command.requiresOtp && !context.odooVerified) {
    return { allowed: false, reason: 'verification_required' };
  }
  if (command.requiresOtp && !context.hasFreshActionOtp) {
    return { allowed: false, reason: 'otp_required' };
  }
  return { allowed: true, reason: 'allowed' };
};