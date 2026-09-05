import { Request, Response, NextFunction } from 'express';
import { safeTokenMatch } from '../services/demo-session';

const getBearerToken = (authHeader: string | undefined): string => {
  if (!authHeader?.startsWith('Bearer ')) return '';
  return authHeader.substring(7);
};

/**
 * Middleware to protect operational routes.
 * It requires a valid token from either the 'x-ops-token' header
 * or an 'Authorization: Bearer <token>' header.
 *
 * @param {Request} req - The Express request object.
 * @param {Response} res - The Express response object.
 * @param {NextFunction} next - The next middleware function.
 */
export const getOpsBearerOrHeaderToken = (req: Request): string => {
  const headerToken = req.get('x-ops-token') || '';
  const bearerToken = getBearerToken(req.get('authorization'));
  return bearerToken || headerToken;
};

export const isValidOpsToken = (token: string): boolean => {
  const opsApiToken = process.env.OPS_API_TOKEN?.trim() || '';
  if (!opsApiToken || opsApiToken.length < 16) return false;
  return safeTokenMatch(token, opsApiToken);
};

export const isOpsTokenConfigured = (): boolean => {
  const opsApiToken = process.env.OPS_API_TOKEN?.trim() || '';
  return Boolean(opsApiToken && opsApiToken.length >= 16);
};

export const requireOpsToken = (req: Request, res: Response, next: NextFunction) => {
  if (!isOpsTokenConfigured()) {
    console.warn('OPS_API_TOKEN is not configured or is too short; denying access to protected route.');
    return res.status(503).json({ error: 'Service is unavailable.' });
  }

  if (isValidOpsToken(getOpsBearerOrHeaderToken(req))) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
};