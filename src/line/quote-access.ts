import type { UserProfile } from '../services/firestore/types';

type QuoteActor = Pick<UserProfile, 'role' | 'salesTier'>;

/** Odoo Sales: User or Administrator, or LINE ADMIN ENABLE. Not a portal customer. */
export const isQuoteStaff = (profile: QuoteActor): boolean =>
  profile.role === 'admin'
  || profile.salesTier === 'salesperson'
  || profile.salesTier === 'sales_manager';

/** Edit/cancel quote lines — LINE admin or Odoo Sales Administrator. */
export const canManageQuoteLines = (profile: QuoteActor): boolean =>
  profile.role === 'admin' || profile.salesTier === 'sales_manager';

/** Flex journey-card viewer: staff (Confirm/Send) vs the customer (Approve). */
export const quoteJourneyRole = (profile: QuoteActor): 'admin' | 'customer' =>
  isQuoteStaff(profile) ? 'admin' : 'customer';
