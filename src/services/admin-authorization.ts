export type AdminAuthorizationResult = {
  ok: boolean;
  reason: 'not_verified' | 'allowlist_not_configured' | 'not_allowlisted' | 'authorized';
};

const parseAdminAllowList = (raw: string | undefined): Set<string> => {
  return new Set(
    (raw || '')
      .split(',')
      .map(v => v.trim())
      .filter(Boolean)
  );
};

/**
 * Authorizes a LINE user to receive the admin role. Chain enforced:
 * user profile -> required verification state (odooVerified) -> ADMIN_USER_ID allowlist.
 * Fails closed if ADMIN_USER_ID is missing or empty so admin role can never be
 * granted from an unconfigured allowlist.
 */
export const isAuthorizedForAdminRole = (
  userId: string,
  profile: { odooVerified: boolean }
): AdminAuthorizationResult => {
  if (!profile.odooVerified) {
    return { ok: false, reason: 'not_verified' };
  }

  const allowList = parseAdminAllowList(process.env.ADMIN_USER_ID);
  if (allowList.size === 0) {
    return { ok: false, reason: 'allowlist_not_configured' };
  }

  if (!allowList.has(userId.trim())) {
    return { ok: false, reason: 'not_allowlisted' };
  }

  return { ok: true, reason: 'authorized' };
};
