import type { Express } from 'express';
import { verifyOdooUserByToken } from '../services/user-verification';
import { completeActionOtpByLinkToken } from '../services/action-otp-complete';
import { oaChatDeepLink, DEFAULT_CHANNEL_ID } from '../line/channels';
import { escapeHtml } from '../utils/html';
import { verifyLinkLimiter } from './middleware';

const statusPage = (ok: boolean, message: string, channelId?: string, titles?: { ok: string; fail: string }, portalUrl?: string) => {
        const title = ok ? (titles?.ok || 'Verification Completed') : (titles?.fail || 'Verification Failed');
        const returnLink = oaChatDeepLink(channelId || DEFAULT_CHANNEL_ID);
        const cta = ok ? 'Return to chat' : 'Open LINE';
        const button = returnLink
          ? `<a class="btn" href="${escapeHtml(returnLink)}" target="_top" rel="noopener">${escapeHtml(cta)}</a>`
          : `<p>Close this page and return to the LINE chat.</p>`;
        const portal = portalUrl
          ? `<a class="btn" href="${escapeHtml(portalUrl)}" target="_top" rel="noopener">Open quotation</a>`
          : '';
        const redirectTarget = ok ? (portalUrl || returnLink) : '';
        const redirect = redirectTarget
          ? `<script>setTimeout(function(){ window.top.location.href = ${JSON.stringify(redirectTarget)}; }, 1500);</script>`
          : '';
        const close = returnLink
          ? `<a class="close" href="${escapeHtml(returnLink)}" target="_top" rel="noopener" aria-label="Close">×</a>`
          : '';
        return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:32px}main{position:relative;max-width:640px;margin:0 auto;background:#fff;padding:24px;border-radius:12px;box-shadow:0 8px 24px rgba(2,6,23,.08)}h1{margin:0 0 12px;font-size:24px}p{line-height:1.6}a.btn{display:inline-block;margin-top:16px;margin-right:8px;padding:12px 24px;background:#0B6E6A;color:#fff;text-decoration:none;border-radius:8px;font-weight:600}a.close{position:absolute;top:12px;right:16px;font-size:28px;line-height:1;color:#5B6C69;text-decoration:none}</style></head><body><main>${close}<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${portal}${button}</main>${redirect}</body></html>`;
};

export const registerVerifyRoutes = (app: Express): void => {
    app.get('/verify/odoo', verifyLinkLimiter, async (req, res) => {
        const token = String(req.query.token || '');
        const result = await verifyOdooUserByToken(token);
        res.status(result.ok ? 200 : 400).type('html').send(statusPage(result.ok, result.message, result.channelId));
    });

    app.get('/verify/action', verifyLinkLimiter, async (req, res) => {
        const token = String(req.query.token || '');
        const result = await completeActionOtpByLinkToken(token);
        res.status(result.ok ? 200 : 400).type('html').send(statusPage(
          result.ok,
          result.message,
          result.channelId,
          { ok: 'Done', fail: 'Action not verified' },
          result.redirectUrl,
        ));
    });
};
