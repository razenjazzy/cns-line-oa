import type { Express } from 'express';
import { verifyOdooUserByToken } from '../services/user-verification';
import { resolveBasicId, DEFAULT_CHANNEL_ID } from '../line/channels';
import { escapeHtml } from '../utils/html';
import { verifyLinkLimiter } from './middleware';

export const registerVerifyRoutes = (app: Express): void => {
    app.get('/verify/odoo', verifyLinkLimiter, async (req, res) => {
        const token = String(req.query.token || '');
        const result = await verifyOdooUserByToken(token);
        const title = result.ok ? 'Verification Completed' : 'Verification Failed';

        // Sends the user straight back into the LINE chat instead of leaving
        // them stranded in the browser. Prefers a deep link into this specific
        // OA's chat (needs LINE_CHANNEL_BASIC_ID / LINE_CHANNEL_<ID>_BASIC_ID
        // configured — the @xxx handle from LINE Official Account Manager);
        // falls back to the generic app-open scheme if that's not set, which is
        // still better than no link at all.
        const basicId = resolveBasicId(result.channelId || DEFAULT_CHANNEL_ID);
        const returnLink = basicId ? `https://line.me/R/ti/p/${encodeURIComponent(basicId)}` : 'line://';

        const html = `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:32px}main{max-width:640px;margin:0 auto;background:#fff;padding:24px;border-radius:12px;box-shadow:0 8px 24px rgba(2,6,23,.08)}h1{margin:0 0 12px;font-size:24px}p{line-height:1.6}a.btn{display:inline-block;margin-top:16px;padding:12px 24px;background:#0B6E6A;color:#fff;text-decoration:none;border-radius:8px;font-weight:600}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(result.message)}</p><a class="btn" href="${escapeHtml(returnLink)}">${result.ok ? 'Return to chat' : 'Open LINE'}</a></main>${result.ok ? `<script>setTimeout(function(){ window.location.href = ${JSON.stringify(returnLink)}; }, 1500);</script>` : ''}</body></html>`;
        res.status(result.ok ? 200 : 400).type('html').send(html);
    });
};
