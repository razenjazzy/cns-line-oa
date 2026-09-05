// The demo control-panel page, split by domain (styles, markup, script) —
// same barrel-preserving pattern as src/services/firestore.ts,
// src/services/odoo.ts, src/index.ts, and src/line/templates.ts. Kept as a
// thin assembler at this original path so the one import site
// (src/http/demo-routes.ts) needs no change.
import { DEMO_PAGE_STYLES } from './styles';
import { DEMO_PAGE_MARKUP } from './markup';
import { DEMO_PAGE_SCRIPT } from './script';

export const buildDemoPage = (): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CNS Platform Control Panel</title>
  <style>
${DEMO_PAGE_STYLES}
  </style>
</head>
<body>
${DEMO_PAGE_MARKUP}
  <script>
${DEMO_PAGE_SCRIPT}
  </script>
</body>
</html>`;
