import { Request, Response, NextFunction } from 'express';
import { safeTokenMatch } from '../services/demo-session';

/**
 * Middleware to protect routes by requiring a valid admin token.
 * The token is expected in the 'Authorization' header as 'Bearer <token>'.
 *
 * @param {Request} req - The Express request object.
 * @param {Response} res - The Express response object.
 * @param {NextFunction} next - The next middleware function.
 */
export const adminOnly = (req: Request, res: Response, next: NextFunction) => {
  const adminToken = process.env.ADMIN_SECRET_TOKEN?.trim() || '';

  // It's critical that the secret token is configured on the server.
  if (!adminToken || adminToken.length < 16) {
    console.error('ADMIN_SECRET_TOKEN is not set or is too short in environment variables.');
    // Return a generic error to avoid leaking information about server configuration.
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const authHeader = req.headers.authorization;
  const providedToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';

  // Use a timing-safe comparison to prevent timing attacks.
  if (safeTokenMatch(providedToken, adminToken)) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
};