import { setUserSalesTier } from '../services/firestore';
import type { UserProfile } from '../services/firestore/types';
import { findOdooSalesTierByPartnerId } from '../services/odoo/admin';

type QuoteActor = Pick<UserProfile, 'role' | 'salesTier'>;

/** Odoo Sales User or Sales Administrator. LINE `role=admin` is extra, not required. */
export const isQuoteStaff = (profile: QuoteActor): boolean =>
  profile.salesTier === 'salesperson'
  || profile.salesTier === 'sales_manager'
  || profile.role === 'admin';

/** Edit/cancel quote lines — Odoo Sales Administrator (or LINE admin). Sales User cannot cancel. */
export const canManageQuoteLines = (profile: QuoteActor): boolean =>
  profile.salesTier === 'sales_manager' || profile.role === 'admin';

/** Flex journey-card viewer: staff (Confirm/Send) vs the customer (Approve). */
export const quoteJourneyRole = (profile: QuoteActor): 'admin' | 'customer' =>
  isQuoteStaff(profile) ? 'admin' : 'customer';

/**
 * Refresh Odoo Sales group onto the Firestore profile. Without this, a
 * verified salesperson who never ran ADMIN ENABLE is treated as a customer
 * and the draft card hides Confirm|Send.
 */
export const syncStaffProfile = async (userId: string, profile: UserProfile): Promise<UserProfile> => {
  if (!profile.odooPartnerId) return profile;
  const salesTier = await findOdooSalesTierByPartnerId(profile.odooPartnerId);
  if (salesTier !== profile.salesTier) await setUserSalesTier(userId, salesTier);
  return { ...profile, salesTier };
};
