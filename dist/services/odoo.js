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
exports.seedOdooSampleSalesData = exports.getDailySalesSnapshot = exports.deleteServiceCatalogItem = exports.updateServiceCatalogItem = exports.createServiceCatalogItem = exports.getServiceByIdentifier = exports.listServiceCatalogItems = exports.deletePartnerFromLine = exports.updatePartnerFromLine = exports.createPartnerFromLine = exports.getPartnerById = exports.getPartnerByPhone = exports.createQuotationFromLine = exports.createInvoiceForSaleOrder = exports.removeSaleOrderLine = exports.updateSaleOrderLineQty = exports.findSaleOrderLineByProduct = exports.addSaleOrderLine = exports.cancelSaleOrder = exports.markSaleOrderSent = exports.confirmSaleOrder = exports.findPaymentTermByName = exports.getSaleOrdersForPartner = exports.getSaleOrderPdfLink = exports.getSaleOrderPortalLink = exports.getSaleOrderById = exports.findOrderByReference = exports.listProducts = exports.findProductByQuery = exports.verifyOdooAdminAccess = exports.pingOdoo = exports.isOdooConfigured = void 0;
const client_1 = require("./odoo/client");
__exportStar(require("./odoo/types"), exports);
const getConfig = client_1.getOdooConfig;
const num = (value) => {
    if (typeof value === 'number')
        return value;
    if (typeof value === 'string')
        return Number(value);
    return 0;
};
const str = (value) => {
    if (typeof value === 'string')
        return value;
    return '';
};
const parseProduct = (row) => ({
    id: num(row.id),
    name: str(row.name),
    list_price: num(row.list_price),
    qty_available: num(row.qty_available),
    default_code: str(row.default_code),
});
const parseOrder = (row) => {
    const partner = Array.isArray(row.partner_id) ? row.partner_id : undefined;
    const partnerTuple = partner && partner.length >= 2
        ? [num(partner[0]), str(partner[1])]
        : undefined;
    return {
        id: num(row.id),
        name: str(row.name),
        state: str(row.state),
        amount_total: num(row.amount_total),
        partner_id: partnerTuple,
        date_order: str(row.date_order),
        access_token: typeof row.access_token === 'string' ? row.access_token : undefined,
        invoice_status: typeof row.invoice_status === 'string' ? row.invoice_status : undefined,
        note: typeof row.note === 'string' && row.note ? row.note : undefined,
    };
};
const parseOrderLine = (row) => {
    const product = Array.isArray(row.product_id) ? row.product_id : undefined;
    return {
        productName: product && product.length >= 2 ? str(product[1]) : '',
        qty: num(row.product_uom_qty),
        priceUnit: num(row.price_unit),
        subtotal: num(row.price_subtotal),
    };
};
const parsePartner = (row) => ({
    id: num(row.id),
    name: str(row.name),
    phone: str(row.phone),
    email: str(row.email),
});
const parseService = (row) => ({
    id: num(row.id),
    name: str(row.name),
    default_code: str(row.default_code),
    list_price: num(row.list_price),
    qty_available: num(row.qty_available),
});
const normalizeLookupText = (value, maxLength = 80) => {
    // Strip control chars and cap size to avoid oversized Odoo query payloads.
    const sanitized = value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
    return sanitized.slice(0, maxLength);
};
const normalizeOrderReference = (value) => {
    const compact = normalizeLookupText(value, 40).toUpperCase();
    return compact.replace(/\s+/g, '');
};
const toOdooDateTime = (date) => {
    const pad = (value) => String(value).padStart(2, '0');
    const y = date.getUTCFullYear();
    const m = pad(date.getUTCMonth() + 1);
    const d = pad(date.getUTCDate());
    const hh = pad(date.getUTCHours());
    const mm = pad(date.getUTCMinutes());
    const ss = pad(date.getUTCSeconds());
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
};
var admin_1 = require("./odoo/admin");
Object.defineProperty(exports, "isOdooConfigured", { enumerable: true, get: function () { return admin_1.isOdooConfigured; } });
Object.defineProperty(exports, "pingOdoo", { enumerable: true, get: function () { return admin_1.pingOdoo; } });
Object.defineProperty(exports, "verifyOdooAdminAccess", { enumerable: true, get: function () { return admin_1.verifyOdooAdminAccess; } });
const findProductByQuery = async (query) => {
    const normalizedQuery = normalizeLookupText(query);
    if (!normalizedQuery)
        return null;
    const config = getConfig();
    if (!config)
        return null;
    const uid = await (0, client_1.loginRead)(config);
    if (!uid)
        return null;
    const rows = await (0, client_1.executeKwRead)(config, uid, 'product.product', 'search_read', [[['name', 'ilike', normalizedQuery]]], {
        fields: ['id', 'name', 'list_price', 'qty_available', 'default_code'],
        limit: 1,
    });
    if (!rows.length)
        return null;
    return parseProduct(rows[0]);
};
exports.findProductByQuery = findProductByQuery;
/**
 * Powers the guided-form product picker (select instead of type) — mirrors
 * listServiceCatalogItems's convention exactly, just without the
 * type='service' filter findProductByQuery also doesn't apply.
 */
const listProducts = async (limit = 10) => {
    const config = getConfig();
    if (!config)
        return [];
    const uid = await (0, client_1.loginRead)(config);
    if (!uid)
        return [];
    const rows = await (0, client_1.executeKwRead)(config, uid, 'product.product', 'search_read', [[]], {
        fields: ['id', 'name', 'list_price', 'qty_available', 'default_code'],
        limit,
        order: 'write_date desc',
    });
    return rows.map(parseProduct);
};
exports.listProducts = listProducts;
const findOrderByReference = async (reference) => {
    const normalizedReference = normalizeOrderReference(reference);
    if (!normalizedReference)
        return null;
    const config = getConfig();
    if (!config)
        return null;
    const uid = await (0, client_1.loginRead)(config);
    if (!uid)
        return null;
    const rows = await (0, client_1.executeKwRead)(config, uid, 'sale.order', 'search_read', [[['name', '=', normalizedReference]]], {
        fields: ['id', 'name', 'state', 'amount_total', 'partner_id', 'access_token'],
        limit: 1,
    });
    if (!rows.length)
        return null;
    return parseOrder(rows[0]);
};
exports.findOrderByReference = findOrderByReference;
/**
 * Like findOrderByReference but by numeric id and with order lines attached
 * — used to (re)render the quotation journey card at any state. Two reads
 * (order + lines) since sale.order.line is a separate model; kept as two
 * plain search_reads rather than an Odoo-side read_group to stay consistent
 * with every other read in this file.
 */
const getSaleOrderById = async (orderId) => {
    const config = getConfig();
    if (!config)
        return null;
    const uid = await (0, client_1.loginRead)(config);
    if (!uid)
        return null;
    const rows = await (0, client_1.executeKwRead)(config, uid, 'sale.order', 'search_read', [[['id', '=', orderId]]], { fields: ['id', 'name', 'state', 'amount_total', 'partner_id', 'access_token', 'invoice_status', 'note'], limit: 1 });
    if (!rows.length)
        return null;
    const order = parseOrder(rows[0]);
    const lineRows = await (0, client_1.executeKwRead)(config, uid, 'sale.order.line', 'search_read', [[['order_id', '=', orderId], ['display_type', '=', false]]], { fields: ['product_id', 'product_uom_qty', 'price_unit', 'price_subtotal'] });
    order.lines = lineRows.map(parseOrderLine);
    return order;
};
exports.getSaleOrderById = getSaleOrderById;
/**
 * Odoo's own customer-portal share link (verified live: get_portal_url
 * lazily generates access_token if missing and returns the relative path).
 * This is a bare shareable token — anyone with the URL can view the order —
 * so it's offered only as a "view/print" convenience, never as the
 * approval mechanism (see QUOTE APPROVE in quotation.ts, which is gated
 * behind the requester's own verified identity instead).
 */
const getSaleOrderPortalLink = async (orderId) => {
    const config = getConfig();
    if (!config)
        return null;
    try {
        const uid = await (0, client_1.login)(config);
        if (!uid)
            return null;
        const relativePath = await (0, client_1.executeKw)(config, uid, 'sale.order', 'get_portal_url', [[orderId]]);
        if (!relativePath)
            return null;
        return `${config.url.replace(/\/$/, '')}${relativePath}`;
    }
    catch (error) {
        console.error('getSaleOrderPortalLink failed:', error);
        return null;
    }
};
exports.getSaleOrderPortalLink = getSaleOrderPortalLink;
/**
 * LINE's Messaging API has no file-message type a bot can push (verified —
 * only text/sticker/image/video/audio/location/imagemap/template/flex), so
 * this is offered as a link, not an attachment. Reuses the exact same
 * portal link/access_token as getSaleOrderPortalLink — Odoo's portal route
 * returns a real PDF directly when `report_type=pdf` is appended, no
 * separate report call or extra auth needed (confirmed live).
 */
const getSaleOrderPdfLink = async (orderId) => {
    const portalLink = await (0, exports.getSaleOrderPortalLink)(orderId);
    if (!portalLink)
        return null;
    return `${portalLink}${portalLink.includes('?') ? '&' : '?'}report_type=pdf`;
};
exports.getSaleOrderPdfLink = getSaleOrderPdfLink;
/** Powers "my quotations" — most recent orders for a given customer, newest first. */
const getSaleOrdersForPartner = async (partnerId, limit = 8) => {
    const config = getConfig();
    if (!config)
        return [];
    const uid = await (0, client_1.loginRead)(config);
    if (!uid)
        return [];
    const rows = await (0, client_1.executeKwRead)(config, uid, 'sale.order', 'search_read', [[['partner_id', '=', partnerId]]], { fields: ['id', 'name', 'state', 'amount_total', 'partner_id', 'date_order'], order: 'date_order desc', limit });
    return rows.map(parseOrder);
};
exports.getSaleOrdersForPartner = getSaleOrdersForPartner;
/** Mirrors findProductByQuery's ilike-first-match convention, applied to account.payment.term. */
const findPaymentTermByName = async (query) => {
    const normalizedQuery = normalizeLookupText(query);
    if (!normalizedQuery)
        return null;
    const config = getConfig();
    if (!config)
        return null;
    const uid = await (0, client_1.loginRead)(config);
    if (!uid)
        return null;
    const rows = await (0, client_1.executeKwRead)(config, uid, 'account.payment.term', 'search_read', [[['name', 'ilike', normalizedQuery]]], { fields: ['id', 'name'], limit: 1 });
    if (!rows.length)
        return null;
    return { id: num(rows[0].id), name: str(rows[0].name) };
};
exports.findPaymentTermByName = findPaymentTermByName;
/** Quotation -> Sales Order. */
const confirmSaleOrder = async (orderId) => {
    const config = getConfig();
    if (!config)
        return false;
    try {
        const uid = await (0, client_1.login)(config);
        if (!uid)
            return false;
        await (0, client_1.executeKw)(config, uid, 'sale.order', 'action_confirm', [[orderId]]);
        return true;
    }
    catch (error) {
        console.error('confirmSaleOrder failed:', error);
        return false;
    }
};
exports.confirmSaleOrder = confirmSaleOrder;
/**
 * Marks the order as sent and drops a chatter note for auditability in
 * Odoo itself. The chatter note is best-effort — a failure there shouldn't
 * fail the whole "send to customer" action, since the LINE push is what
 * actually matters to the caller.
 */
const markSaleOrderSent = async (orderId) => {
    const config = getConfig();
    if (!config)
        return false;
    try {
        const uid = await (0, client_1.login)(config);
        if (!uid)
            return false;
        await (0, client_1.executeKw)(config, uid, 'sale.order', 'write', [[orderId], { state: 'sent' }]);
        try {
            await (0, client_1.executeKw)(config, uid, 'sale.order', 'message_post', [[orderId]], {
                body: 'Sent to customer via LINE OA.',
            });
        }
        catch (chatterError) {
            console.warn('markSaleOrderSent: message_post chatter note failed (non-fatal):', chatterError);
        }
        return true;
    }
    catch (error) {
        console.error('markSaleOrderSent failed:', error);
        return false;
    }
};
exports.markSaleOrderSent = markSaleOrderSent;
/** Cancels a quotation/order — reversible in Odoo itself (reset to draft), not exposed here since it's not part of the LINE journey. */
const cancelSaleOrder = async (orderId) => {
    const config = getConfig();
    if (!config)
        return false;
    try {
        const uid = await (0, client_1.login)(config);
        if (!uid)
            return false;
        await (0, client_1.executeKw)(config, uid, 'sale.order', 'action_cancel', [[orderId]]);
        return true;
    }
    catch (error) {
        console.error('cancelSaleOrder failed:', error);
        return false;
    }
};
exports.cancelSaleOrder = cancelSaleOrder;
/** Appends a new line to an existing (draft/sent) order — QUOTE ADD. */
const addSaleOrderLine = async (orderId, productId, qty) => {
    const config = getConfig();
    if (!config)
        return false;
    try {
        const uid = await (0, client_1.login)(config);
        if (!uid)
            return false;
        await (0, client_1.executeKw)(config, uid, 'sale.order.line', 'create', [{
                order_id: orderId,
                product_id: productId,
                product_uom_qty: qty,
            }]);
        return true;
    }
    catch (error) {
        console.error('addSaleOrderLine failed:', error);
        return false;
    }
};
exports.addSaleOrderLine = addSaleOrderLine;
/**
 * Updates the quantity of an *existing* line matching this order+product —
 * QUOTE EDIT is for changing a line already on the quote, not adding a new
 * one (that's QUOTE ADD). Returns false (not an error) if no matching line
 * is found, same "not found vs failed" distinction as the rest of this file.
 */
/**
 * Shared by updateSaleOrderLineQty (which line to edit) and QUOTE ADD's
 * duplicate-product check (whether to reject in favor of QUOTE EDIT).
 * Returns null on both "not found" and "not configured" — same
 * not-an-error convention as the rest of this file's finder functions.
 */
const findSaleOrderLineByProduct = async (orderId, productId) => {
    const config = getConfig();
    if (!config)
        return null;
    const uid = await (0, client_1.loginRead)(config);
    if (!uid)
        return null;
    const lines = await (0, client_1.executeKwRead)(config, uid, 'sale.order.line', 'search_read', [
        [['order_id', '=', orderId], ['product_id', '=', productId]],
    ], { fields: ['id', 'product_uom_qty'], limit: 1 });
    return lines.length ? { id: lines[0].id, qty: lines[0].product_uom_qty } : null;
};
exports.findSaleOrderLineByProduct = findSaleOrderLineByProduct;
const updateSaleOrderLineQty = async (orderId, productId, qty) => {
    const config = getConfig();
    if (!config)
        return false;
    try {
        const uid = await (0, client_1.login)(config);
        if (!uid)
            return false;
        const existing = await (0, exports.findSaleOrderLineByProduct)(orderId, productId);
        if (!existing)
            return false;
        await (0, client_1.executeKw)(config, uid, 'sale.order.line', 'write', [[existing.id], { product_uom_qty: qty }]);
        return true;
    }
    catch (error) {
        console.error('updateSaleOrderLineQty failed:', error);
        return false;
    }
};
exports.updateSaleOrderLineQty = updateSaleOrderLineQty;
/**
 * Deletes an existing line entirely (mirrors Odoo web's own line-delete
 * button, as opposed to updateSaleOrderLineQty which only changes a
 * quantity). Returns false, not an error, if the product isn't on this
 * quote — same "not found vs failed" convention as the rest of this file.
 * Odoo itself enforces whether the order's current state allows deleting a
 * line (e.g. a locked/invoiced order rejects it); that surfaces here as a
 * caught error, same as any other write failure.
 */
const removeSaleOrderLine = async (orderId, productId) => {
    const config = getConfig();
    if (!config)
        return false;
    try {
        const uid = await (0, client_1.login)(config);
        if (!uid)
            return false;
        const existing = await (0, exports.findSaleOrderLineByProduct)(orderId, productId);
        if (!existing)
            return false;
        await (0, client_1.executeKw)(config, uid, 'sale.order.line', 'unlink', [[existing.id]]);
        return true;
    }
    catch (error) {
        console.error('removeSaleOrderLine failed:', error);
        return false;
    }
};
exports.removeSaleOrderLine = removeSaleOrderLine;
/**
 * Mirrors Odoo web's "Create Invoice" button, which is a window action
 * opening the sale.advance.payment.inv wizard (confirmed live on this
 * instance: sale.order.form's create_invoice button has type="action",
 * name="438" — an ir.actions.act_window, not a direct sale.order method).
 * Reproduced over RPC the same way Odoo's own client does it: create the
 * wizard record with the sale order in its active_id/active_ids context,
 * then call its create_invoices() method with that same context. Defaults
 * to a regular invoice (not the percentage/down-payment variant, which is
 * a separate button in the UI).
 */
const createInvoiceForSaleOrder = async (orderId) => {
    const config = getConfig();
    if (!config)
        return false;
    try {
        const uid = await (0, client_1.login)(config);
        if (!uid)
            return false;
        const wizardContext = { active_model: 'sale.order', active_ids: [orderId], active_id: orderId };
        const wizardId = await (0, client_1.executeKw)(config, uid, 'sale.advance.payment.inv', 'create', [{}], { context: wizardContext });
        await (0, client_1.executeKw)(config, uid, 'sale.advance.payment.inv', 'create_invoices', [[wizardId]], { context: wizardContext });
        return true;
    }
    catch (error) {
        console.error('createInvoiceForSaleOrder failed:', error);
        return false;
    }
};
exports.createInvoiceForSaleOrder = createInvoiceForSaleOrder;
const findOrCreatePartner = async (config, uid, name, phone) => {
    const normalizedPhone = phone.trim();
    // Only search by phone when we actually have one — matching on an empty
    // string can return an unrelated partner that also has no phone on file.
    if (normalizedPhone) {
        const found = await (0, client_1.executeKwRead)(config, uid, 'res.partner', 'search_read', [[['phone', '=', normalizedPhone]]], { fields: ['id'], limit: 1 });
        if (found.length > 0) {
            return num(found[0].id);
        }
    }
    return (0, client_1.executeKw)(config, uid, 'res.partner', 'create', [{ name, ...(normalizedPhone ? { phone: normalizedPhone } : {}) }]);
};
const createQuotationFromLine = async (customerName, customerPhone, productQuery, qty, explicitPartnerId, 
/**
 * Optional Odoo fields that are blank/defaulted in Odoo web unless a user
 * fills them in — same behavior here. Any key left undefined is omitted
 * from the create payload entirely, so a caller that provides none of
 * these gets byte-for-byte today's behavior.
 */
extra) => {
    const config = getConfig();
    if (!config)
        return null;
    try {
        const uid = await (0, client_1.login)(config);
        if (!uid)
            return null;
        const product = await (0, exports.findProductByQuery)(productQuery);
        if (!product)
            return null;
        const partnerId = explicitPartnerId || await findOrCreatePartner(config, uid, customerName, customerPhone);
        const orderLine = { product_id: product.id, product_uom_qty: qty };
        if (extra?.discountPercent !== undefined)
            orderLine.discount = extra.discountPercent;
        const orderFields = {
            partner_id: partnerId,
            order_line: [[0, 0, orderLine]],
        };
        if (extra?.customerRef)
            orderFields.client_order_ref = extra.customerRef;
        if (extra?.validityDate)
            orderFields.validity_date = extra.validityDate;
        if (extra?.note)
            orderFields.note = extra.note;
        if (extra?.paymentTermId !== undefined)
            orderFields.payment_term_id = extra.paymentTermId;
        // No reliable natural key to reconcile a sale order against before it
        // exists, so unlike partner/service creates this is not retried or
        // reconciled — a failed attempt should be safely re-runnable by the user.
        const orderId = await (0, client_1.executeKw)(config, uid, 'sale.order', 'create', [orderFields]);
        const rows = await (0, client_1.executeKw)(config, uid, 'sale.order', 'read', [[orderId]], { fields: ['name', 'amount_total'] });
        if (!rows.length)
            return null;
        return {
            orderName: str(rows[0].name),
            total: num(rows[0].amount_total),
            orderId,
        };
    }
    catch (error) {
        console.error('createQuotationFromLine failed:', error);
        return null;
    }
};
exports.createQuotationFromLine = createQuotationFromLine;
const normalizePhoneDigits = (value) => value.replace(/[^0-9+]/g, '').trim();
/**
 * Odoo contacts are entered with inconsistent formatting (local 0-prefix vs
 * +66/66 international) and the number often lives in `mobile` rather than
 * `phone`. An exact single-field match against exactly what the customer
 * typed was silently failing for legitimate accounts, so verification never
 * completed. Expand to every plausible formatting variant instead.
 */
const buildPhoneMatchVariants = (phone) => {
    const cleaned = normalizePhoneDigits(phone);
    if (!cleaned)
        return [];
    const variants = new Set([cleaned]);
    if (cleaned.startsWith('0') && cleaned.length >= 9) {
        variants.add(`+66${cleaned.slice(1)}`);
        variants.add(`66${cleaned.slice(1)}`);
    }
    else if (cleaned.startsWith('+66')) {
        variants.add(`0${cleaned.slice(3)}`);
        variants.add(cleaned.slice(1));
    }
    else if (cleaned.startsWith('66') && cleaned.length >= 10) {
        variants.add(`0${cleaned.slice(2)}`);
        variants.add(`+${cleaned}`);
    }
    return Array.from(variants);
};
// `mobile` is a standard res.partner field on stock Odoo, but not every
// instance has it (a stripped-down SaaS trial database can be missing it
// entirely, which turns a domain that references it into a hard RPC error —
// "Invalid field res.partner.mobile" — instead of just finding no match).
// Discover which of the two fields actually exist once per process and only
// query those, so verification degrades to phone-only matching instead of
// breaking outright on instances without `mobile`.
let cachedPartnerPhoneFields = null;
const getPartnerPhoneFields = async (config, uid) => {
    if (cachedPartnerPhoneFields)
        return cachedPartnerPhoneFields;
    let fields = ['phone'];
    try {
        const fieldsInfo = await (0, client_1.executeKwRead)(config, uid, 'res.partner', 'fields_get', [['phone', 'mobile']], { attributes: [] });
        const available = Object.keys(fieldsInfo || {});
        const discovered = ['phone', 'mobile'].filter(f => available.includes(f));
        if (discovered.length)
            fields = discovered;
    }
    catch (error) {
        console.warn('Odoo fields_get for res.partner phone fields failed, defaulting to phone only:', error);
    }
    cachedPartnerPhoneFields = fields;
    return fields;
};
const getPartnerByPhone = async (phone) => {
    const config = getConfig();
    if (!config)
        return null;
    const uid = await (0, client_1.loginRead)(config);
    if (!uid)
        return null;
    const variants = buildPhoneMatchVariants(phone);
    if (!variants.length)
        return null;
    const phoneFields = await getPartnerPhoneFields(config, uid);
    const fieldMatches = variants.flatMap(v => phoneFields.map(f => [f, '=', v]));
    const domain = [...Array(fieldMatches.length - 1).fill('|'), ...fieldMatches];
    const rows = await (0, client_1.executeKwRead)(config, uid, 'res.partner', 'search_read', [domain], { fields: ['id', 'name', 'phone', 'email'], limit: 1 });
    if (!rows.length)
        return null;
    return parsePartner(rows[0]);
};
exports.getPartnerByPhone = getPartnerByPhone;
/** By id rather than phone — used by QUOTE SEND to find the phone to look up against findVerifiedUserIdByPhone, since sale.order's partner_id only carries [id, displayName]. */
const getPartnerById = async (partnerId) => {
    const config = getConfig();
    if (!config)
        return null;
    const uid = await (0, client_1.loginRead)(config);
    if (!uid)
        return null;
    const rows = await (0, client_1.executeKwRead)(config, uid, 'res.partner', 'search_read', [[['id', '=', partnerId]]], { fields: ['id', 'name', 'phone', 'email'], limit: 1 });
    if (!rows.length)
        return null;
    return parsePartner(rows[0]);
};
exports.getPartnerById = getPartnerById;
const createPartnerFromLine = async (name, phone, email) => {
    const config = getConfig();
    if (!config)
        return null;
    try {
        const uid = await (0, client_1.login)(config);
        if (!uid)
            return null;
        const partnerId = await (0, client_1.executeKw)(config, uid, 'res.partner', 'create', [{ name, phone, ...(email ? { email } : {}) }]);
        const rows = await (0, client_1.executeKw)(config, uid, 'res.partner', 'read', [[partnerId]], { fields: ['id', 'name', 'phone', 'email'] });
        if (!rows.length)
            return null;
        return parsePartner(rows[0]);
    }
    catch (error) {
        console.error('createPartnerFromLine failed:', error);
        // Never blindly retry a create (risks a duplicate partner). Instead,
        // reconcile: check whether it actually landed despite the client-side
        // error before reporting failure.
        if ((0, client_1.isTransientOdooError)(error)) {
            try {
                const reconciled = await (0, exports.getPartnerByPhone)(phone);
                if (reconciled)
                    return reconciled;
            }
            catch (reconcileError) {
                console.error('createPartnerFromLine reconciliation check failed:', reconcileError);
            }
        }
        return null;
    }
};
exports.createPartnerFromLine = createPartnerFromLine;
const updatePartnerFromLine = async (partnerId, name, phone, email) => {
    const config = getConfig();
    if (!config)
        return null;
    const values = {};
    if (name)
        values.name = name;
    if (phone)
        values.phone = phone;
    if (email)
        values.email = email;
    if (!Object.keys(values).length)
        return null;
    try {
        const uid = await (0, client_1.login)(config);
        if (!uid)
            return null;
        // write/read on a known id is idempotent, safe to retry on transient errors.
        await (0, client_1.withIdempotentWriteRetry)('updatePartner', () => (0, client_1.executeKw)(config, uid, 'res.partner', 'write', [[partnerId], values]));
        const rows = await (0, client_1.executeKw)(config, uid, 'res.partner', 'read', [[partnerId]], { fields: ['id', 'name', 'phone', 'email'] });
        if (!rows.length)
            return null;
        return parsePartner(rows[0]);
    }
    catch (error) {
        console.error('updatePartnerFromLine failed:', error);
        return null;
    }
};
exports.updatePartnerFromLine = updatePartnerFromLine;
const deletePartnerFromLine = async (partnerId) => {
    const config = getConfig();
    if (!config)
        return false;
    try {
        const uid = await (0, client_1.login)(config);
        if (!uid)
            return false;
        return await (0, client_1.withIdempotentWriteRetry)('deletePartner', () => (0, client_1.executeKw)(config, uid, 'res.partner', 'unlink', [[partnerId]]));
    }
    catch (error) {
        console.error('deletePartnerFromLine failed:', error);
        return false;
    }
};
exports.deletePartnerFromLine = deletePartnerFromLine;
const findServiceByIdentifierInternal = async (config, uid, identifier) => {
    const byCode = await (0, client_1.executeKwRead)(config, uid, 'product.product', 'search_read', [[['default_code', '=', identifier.toUpperCase()]]], {
        fields: ['id', 'name', 'default_code', 'list_price', 'qty_available'],
        limit: 1,
    });
    if (byCode.length)
        return parseService(byCode[0]);
    const byName = await (0, client_1.executeKwRead)(config, uid, 'product.product', 'search_read', [[['name', 'ilike', identifier]]], {
        fields: ['id', 'name', 'default_code', 'list_price', 'qty_available'],
        limit: 1,
    });
    if (byName.length)
        return parseService(byName[0]);
    return null;
};
const listServiceCatalogItems = async (limit = 10) => {
    const config = getConfig();
    if (!config)
        return [];
    const uid = await (0, client_1.loginRead)(config);
    if (!uid)
        return [];
    const rows = await (0, client_1.executeKwRead)(config, uid, 'product.product', 'search_read', [[['type', '=', 'service']]], {
        fields: ['id', 'name', 'default_code', 'list_price', 'qty_available'],
        limit,
        order: 'write_date desc',
    });
    return rows.map(parseService);
};
exports.listServiceCatalogItems = listServiceCatalogItems;
const getServiceByIdentifier = async (identifier) => {
    const config = getConfig();
    if (!config)
        return null;
    const uid = await (0, client_1.loginRead)(config);
    if (!uid)
        return null;
    return findServiceByIdentifierInternal(config, uid, identifier);
};
exports.getServiceByIdentifier = getServiceByIdentifier;
const createServiceCatalogItem = async (name, code, price) => {
    const config = getConfig();
    if (!config)
        return null;
    try {
        const uid = await (0, client_1.login)(config);
        if (!uid)
            return null;
        const exists = await findServiceByIdentifierInternal(config, uid, code);
        if (exists)
            return exists;
        const productId = await (0, client_1.executeKw)(config, uid, 'product.product', 'create', [{
                name,
                default_code: code.toUpperCase(),
                list_price: price,
                type: 'service',
                detailed_type: 'service',
                sale_ok: true,
                purchase_ok: false,
            }]);
        const rows = await (0, client_1.executeKw)(config, uid, 'product.product', 'read', [[productId]], { fields: ['id', 'name', 'default_code', 'list_price', 'qty_available'] });
        if (!rows.length)
            return null;
        return parseService(rows[0]);
    }
    catch (error) {
        console.error('createServiceCatalogItem failed:', error);
        // Never blindly retry a create; reconcile by code before reporting failure.
        if ((0, client_1.isTransientOdooError)(error)) {
            try {
                const uid = await (0, client_1.login)(config);
                if (uid) {
                    const reconciled = await findServiceByIdentifierInternal(config, uid, code);
                    if (reconciled)
                        return reconciled;
                }
            }
            catch (reconcileError) {
                console.error('createServiceCatalogItem reconciliation check failed:', reconcileError);
            }
        }
        return null;
    }
};
exports.createServiceCatalogItem = createServiceCatalogItem;
const updateServiceCatalogItem = async (identifier, fields) => {
    const config = getConfig();
    if (!config)
        return null;
    try {
        const uid = await (0, client_1.login)(config);
        if (!uid)
            return null;
        const existing = await findServiceByIdentifierInternal(config, uid, identifier);
        if (!existing)
            return null;
        const values = {};
        if (typeof fields.price === 'number' && !Number.isNaN(fields.price))
            values.list_price = fields.price;
        if (fields.code)
            values.default_code = fields.code.toUpperCase();
        if (!Object.keys(values).length)
            return existing;
        await (0, client_1.withIdempotentWriteRetry)('updateService', () => (0, client_1.executeKw)(config, uid, 'product.product', 'write', [[existing.id], values]));
        const rows = await (0, client_1.executeKw)(config, uid, 'product.product', 'read', [[existing.id]], { fields: ['id', 'name', 'default_code', 'list_price', 'qty_available'] });
        if (!rows.length)
            return null;
        return parseService(rows[0]);
    }
    catch (error) {
        console.error('updateServiceCatalogItem failed:', error);
        return null;
    }
};
exports.updateServiceCatalogItem = updateServiceCatalogItem;
const deleteServiceCatalogItem = async (identifier) => {
    const config = getConfig();
    if (!config)
        return false;
    try {
        const uid = await (0, client_1.login)(config);
        if (!uid)
            return false;
        const existing = await findServiceByIdentifierInternal(config, uid, identifier);
        if (!existing)
            return false;
        return await (0, client_1.withIdempotentWriteRetry)('deleteService', () => (0, client_1.executeKw)(config, uid, 'product.product', 'unlink', [[existing.id]]));
    }
    catch (error) {
        console.error('deleteServiceCatalogItem failed:', error);
        return false;
    }
};
exports.deleteServiceCatalogItem = deleteServiceCatalogItem;
const fetchSalesSnapshotByWindow = async (config, uid, start, end) => {
    const startStr = toOdooDateTime(start);
    const endStr = toOdooDateTime(end);
    const orders = await (0, client_1.executeKwRead)(config, uid, 'sale.order', 'search_read', [[
            ['state', 'in', ['draft', 'sent', 'sale', 'done']],
            ['date_order', '>=', startStr],
            ['date_order', '<', endStr],
        ]], {
        fields: ['id'],
        limit: 1000,
        order: 'date_order desc',
    });
    const orderIds = orders.map(row => num(row.id)).filter(Boolean);
    if (!orderIds.length)
        return [];
    const lines = await (0, client_1.executeKwRead)(config, uid, 'sale.order.line', 'search_read', [[['order_id', 'in', orderIds]]], {
        fields: ['product_id', 'product_uom_qty', 'price_total'],
        limit: 5000,
    });
    const aggregate = new Map();
    for (const line of lines) {
        const tuple = Array.isArray(line.product_id) ? line.product_id : [];
        const productId = num(tuple[0]);
        const productName = str(tuple[1]) || `Product ${productId}`;
        if (!productId)
            continue;
        const current = aggregate.get(productId) || {
            productId,
            productName,
            salesYesterday: 0,
            revenueYesterday: 0,
        };
        current.salesYesterday += num(line.product_uom_qty);
        current.revenueYesterday += num(line.price_total);
        aggregate.set(productId, current);
    }
    const productIds = Array.from(aggregate.keys());
    const products = productIds.length
        ? await (0, client_1.executeKwRead)(config, uid, 'product.product', 'search_read', [[['id', 'in', productIds]]], { fields: ['id', 'qty_available'], limit: productIds.length })
        : [];
    const stockByProductId = new Map();
    for (const product of products) {
        stockByProductId.set(num(product.id), num(product.qty_available));
    }
    return Array.from(aggregate.values())
        .map(item => ({
        product: item.productName,
        stock: stockByProductId.get(item.productId) || 0,
        salesYesterday: Number(item.salesYesterday.toFixed(2)),
        revenueYesterday: Number(item.revenueYesterday.toFixed(2)),
    }))
        .sort((a, b) => b.revenueYesterday - a.revenueYesterday)
        .slice(0, 20);
};
const getDailySalesSnapshot = async () => {
    const config = getConfig();
    if (!config)
        return [];
    const uid = await (0, client_1.loginRead)(config);
    if (!uid)
        return [];
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 0, 0, 0));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const yesterdaySnapshot = await fetchSalesSnapshotByWindow(config, uid, start, end);
    if (yesterdaySnapshot.length)
        return yesterdaySnapshot;
    // If there is no activity yesterday, pull recent activity so reports remain real and useful.
    const rollingStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 30, 0, 0, 0));
    const rollingEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
    const rollingSnapshot = await fetchSalesSnapshotByWindow(config, uid, rollingStart, rollingEnd);
    if (rollingSnapshot.length)
        return rollingSnapshot;
    // Final fallback: real Odoo product inventory snapshot (no mock data).
    const products = await (0, client_1.executeKwRead)(config, uid, 'product.product', 'search_read', [[]], {
        fields: ['name', 'qty_available', 'list_price'],
        limit: 20,
        order: 'write_date desc',
    });
    return products.map(product => ({
        product: str(product.name),
        stock: num(product.qty_available),
        salesYesterday: 0,
        revenueYesterday: 0,
    }));
};
exports.getDailySalesSnapshot = getDailySalesSnapshot;
const findOrCreateProduct = async (config, uid, name, defaultCode, listPrice) => {
    const found = await (0, client_1.executeKwRead)(config, uid, 'product.product', 'search_read', [[['default_code', '=', defaultCode]]], { fields: ['id'], limit: 1 });
    if (found.length > 0)
        return num(found[0].id);
    return (0, client_1.executeKw)(config, uid, 'product.product', 'create', [{
            name,
            default_code: defaultCode,
            list_price: listPrice,
            type: 'consu',
            sale_ok: true,
            purchase_ok: false,
        }]);
};
const seedOdooSampleSalesData = async () => {
    const config = getConfig();
    if (!config) {
        return 'Odoo is not configured. Please set ODOO_URL/ODOO_DB/ODOO_USERNAME/ODOO_API_KEY.';
    }
    const uid = await (0, client_1.login)(config);
    if (!uid) {
        return 'Odoo login failed. Check ODOO_USERNAME and ODOO_API_KEY.';
    }
    const customerId = await findOrCreatePartner(config, uid, 'LINE Demo Customer', '0990000000');
    const productAId = await findOrCreateProduct(config, uid, 'App Premium Plan', 'APP-PREMIUM', 990);
    const productBId = await findOrCreateProduct(config, uid, 'App Support Package', 'APP-SUPPORT', 490);
    const orderValues = [
        {
            partner_id: customerId,
            client_order_ref: 'LINE-DEMO-ORDER-01',
            origin: 'LINE OA Demo',
            note: 'Seeded by LINE OA integration script',
            order_line: [[0, 0, { product_id: productAId, product_uom_qty: 1, price_unit: 990 }]],
        },
        {
            partner_id: customerId,
            client_order_ref: 'LINE-DEMO-ORDER-02',
            origin: 'LINE OA Demo',
            note: 'Seeded by LINE OA integration script',
            order_line: [[0, 0, { product_id: productBId, product_uom_qty: 2, price_unit: 490 }]],
        },
    ];
    let createdCount = 0;
    for (const values of orderValues) {
        const existing = await (0, client_1.executeKwRead)(config, uid, 'sale.order', 'search_read', [[['client_order_ref', '=', String(values.client_order_ref)]]], { fields: ['id'], limit: 1 });
        if (existing.length > 0)
            continue;
        await (0, client_1.executeKw)(config, uid, 'sale.order', 'create', [values]);
        createdCount += 1;
    }
    return `Odoo sample data ready. Created ${createdCount} new demo quotation(s).`;
};
exports.seedOdooSampleSalesData = seedOdooSampleSalesData;
