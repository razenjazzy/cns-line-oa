import type { UserProfile } from './firestore/types';
import { setSalesSessionExpiresAt, setUserOdooVerificationStatus } from './firestore';

export const startSalesSession = async (userId: string): Promise<void> => {
  await setSalesSessionExpiresAt(userId, salesSessionExpiresAtFromNow());
};

export const clearSalesLogin = async (userId: string): Promise<void> => {
  await setUserOdooVerificationStatus(userId, false);
  await setSalesSessionExpiresAt(userId, null);
};

export const salesSessionTtlHours = (env: NodeJS.ProcessEnv = process.env): number => {
  const parsed = Number(env.SALES_SESSION_TTL_HOURS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 24;
};

export const salesSessionExpiresAtFromNow = (now = Date.now(), env: NodeJS.ProcessEnv = process.env): string =>
  new Date(now + salesSessionTtlHours(env) * 60 * 60 * 1000).toISOString();

export const hasActiveSalesSession = (
  profile: Pick<UserProfile, 'odooVerified' | 'salesSessionExpiresAt' | 'salesTier'>,
  now = Date.now(),
): boolean => {
  if (!profile.odooVerified || !profile.salesSessionExpiresAt) return false;
  if (profile.salesTier !== 'salesperson' && profile.salesTier !== 'sales_manager') return false;
  return new Date(profile.salesSessionExpiresAt).getTime() > now;
};

export const salesSessionExpired = (
  profile: Pick<UserProfile, 'salesSessionExpiresAt' | 'salesTier' | 'odooVerified'>,
  now = Date.now(),
): boolean => {
  if (!profile.odooVerified || !profile.salesSessionExpiresAt) return false;
  if (profile.salesTier !== 'salesperson' && profile.salesTier !== 'sales_manager') return false;
  return new Date(profile.salesSessionExpiresAt).getTime() <= now;
};
