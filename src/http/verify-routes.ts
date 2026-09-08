import type { Express } from 'express';
import { verifyOdooUserByToken } from '../services/user-verification';
import { completeActionOtpByLinkToken } from '../services/action-otp-complete';
import { oaChatDeepLink, DEFAULT_CHANNEL_ID } from '../line/channels';
import { escapeHtml } from '../utils/html';
import { verifyLinkLimiter } from './middleware';

const verificationPage = (ok: boolean, message: string, channelId?: string) => {
        const title = ok ? 'Verification Completed' : 'Verification Failed';
        const returnLink = oaChatDeepLink(channelId || DEFAULT_CHANNEL_ID);
        const cta = ok ? 'Return to chat' : 'Open LINE';
        const button = returnLink
          ? `<a class="btn" href="${escapeHtml(returnLink)}" target="_top" rel="noopener">${escapeHtml(cta)}</a>`
          : `<p>Close this page and return to the LINE chat.</p>`;
        const redirect = ok && returnLink
          ? `<script>setTimeout(function(){ window.top.location.href = ${JSON.stringify(returnLink)}; }, 1500);</script>`
          : '';
        return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:32px}main{max-width:640px;margin:0 auto;background:#fff;padding:24px;border-radius:12px;box-shadow:0 8px 24px rgba(2,6,23,.08)}h1{margin:0 0 12px;font-size:24px}p{line-height:1.6}a.btn{display:inline-block;margin-top:16px;padding:12px 24px;background:#0B6E6A;color:#fff;text-decoration:none;border-radius:8px;font-weight:600}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${button}</main>${redirect}</body></html>`;
};

export const registerVerifyRoutes = (app: Express): void => {
    app.get('/verify/odoo', verifyLinkLimiter, async (req, res) => {
        const token = String(req.query.token || '');
        const result = await verifyOdooUserByToken(token);
        res.status(result.ok ? 200 : 400).type('html').send(verificationPage(result.ok, result.message, result.channelId));
    });

    app.get('/verify/action', verifyLinkLimiter, async (req, res) => {
        const token = String(req.query.token || '');
        const result = await completeActionOtpByLinkToken(token);
        res.status(result.ok ? 200 : 400).type('html').send(verificationPage(result.ok, result.message, result.channelId));
    });
};
