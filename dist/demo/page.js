"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDemoPage = void 0;
// The demo control-panel page, split by domain (styles, markup, script) —
// same barrel-preserving pattern as src/services/firestore.ts,
// src/services/odoo.ts, src/index.ts, and src/line/templates.ts. Kept as a
// thin assembler at this original path so the one import site
// (src/http/demo-routes.ts) needs no change.
const styles_1 = require("./styles");
const markup_1 = require("./markup");
const script_1 = require("./script");
const buildDemoPage = () => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CNS Platform Control Panel</title>
  <style>
${styles_1.DEMO_PAGE_STYLES}
  </style>
</head>
<body>
${markup_1.DEMO_PAGE_MARKUP}
  <script>
${script_1.DEMO_PAGE_SCRIPT}
  </script>
</body>
</html>`;
exports.buildDemoPage = buildDemoPage;
