/**
 * HTML security utilities.
 *
 * Provides a minimal escapeHtml() function to neutralise XSS payloads
 * before embedding untrusted strings (e.g. Odoo error messages) into
 * server-rendered HTML responses, and a buildCspHeader() helper that
 * returns a conservative Content-Security-Policy value for HTML pages
 * that only need inline styles and no external resources.
 */

/**
 * Escapes the five characters that are meaningful in HTML contexts so
 * that untrusted input cannot break out of text nodes or attributes.
 */
export const escapeHtml = (raw: string): string =>
  raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

/**
 * Returns a strict CSP header value suitable for simple server-rendered
 * pages that use only inline styles (no scripts, no external resources).
 *
 * Adjust the directives here if any page ever needs to load external
 * fonts or images — do NOT weaken this globally.
 */
export const buildCspHeader = (): string =>
  [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    "frame-ancestors 'none'",
  ].join('; ');

/** Swagger UI needs inline scripts/styles and data: images. Applied only on /api-docs. */
export const buildSwaggerCspHeader = (): string =>
  [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'unsafe-eval'",
    "style-src 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
