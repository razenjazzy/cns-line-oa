import crypto from 'crypto';

type SessionPayload = {
  iat: number;
  exp: number;
  nonce: string;
};

const toBase64Url = (value: string): string => Buffer.from(value, 'utf8').toString('base64url');
const fromBase64Url = (value: string): string => Buffer.from(value, 'base64url').toString('utf8');

const sign = (payloadB64: string, secret: string): string => {
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
};

const timingSafeEqual = (a: string, b: string): boolean => {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

export const parseCookieValue = (cookieHeader: string | undefined, key: string): string => {
  if (!cookieHeader) return '';
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (rawKey === key) {
      return rawValue.join('=').trim();
    }
  }
  return '';
};

export const createDemoSessionToken = (secret: string, ttlSeconds: number): string => {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    iat: now,
    exp: now + Math.max(60, ttlSeconds),
    nonce: crypto.randomBytes(8).toString('hex'),
  };

  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const signature = sign(payloadB64, secret);
  return `${payloadB64}.${signature}`;
};

export const verifyDemoSessionToken = (token: string, secret: string): { ok: boolean; reason?: string } => {
  if (!token) return { ok: false, reason: 'missing_token' };

  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) return { ok: false, reason: 'malformed_token' };

  const expectedSig = sign(payloadB64, secret);
  if (!timingSafeEqual(signature, expectedSig)) {
    return { ok: false, reason: 'invalid_signature' };
  }

  let payload: SessionPayload;
  try {
    payload = JSON.parse(fromBase64Url(payloadB64)) as SessionPayload;
  } catch {
    return { ok: false, reason: 'invalid_payload' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || now >= payload.exp) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true };
};

export const verifyDemoSessionTokenWithSecrets = (
  token: string,
  secrets: string[]
): { ok: boolean; matchedSecretIndex?: number; reason?: string } => {
  const normalized = secrets.map(s => s.trim()).filter(Boolean);
  if (!normalized.length) {
    return { ok: false, reason: 'missing_secret' };
  }

  let lastReason = 'invalid_signature';
  for (let i = 0; i < normalized.length; i += 1) {
    const result = verifyDemoSessionToken(token, normalized[i]);
    if (result.ok) {
      return { ok: true, matchedSecretIndex: i };
    }
    lastReason = result.reason || lastReason;
  }

  return { ok: false, reason: lastReason };
};

export const safeTokenMatch = (providedToken: string, expectedToken: string): boolean => {
  if (!providedToken || !expectedToken) return false;
  return timingSafeEqual(providedToken, expectedToken);
};
