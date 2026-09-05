// Compatibility barrel — the actual Flex builders live under
// src/line/templates/*, split by domain (shared button/brand helpers, bot
// text, catalog, navigation, guided-form prompts, quotation). Kept as a
// thin re-export at this original path so none of the ~30 import sites
// across handlers/tests need to change (same barrel-preserving pattern as
// src/services/firestore.ts and src/services/odoo.ts).
export * from './templates/index';
