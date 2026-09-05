"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
// Compatibility barrel — the actual Flex builders live under
// src/line/templates/*, split by domain (shared button/brand helpers, bot
// text, catalog, navigation, guided-form prompts, quotation). Kept as a
// thin re-export at this original path so none of the ~30 import sites
// across handlers/tests need to change (same barrel-preserving pattern as
// src/services/firestore.ts and src/services/odoo.ts).
__exportStar(require("./templates/index"), exports);
