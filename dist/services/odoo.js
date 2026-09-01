"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedOdooSampleSalesData = exports.getDailySalesSnapshot = exports.deleteServiceCatalogItem = exports.updateServiceCatalogItem = exports.createServiceCatalogItem = exports.getServiceByIdentifier = exports.listServiceCatalogItems = exports.deletePartnerFromLine = exports.updatePartnerFromLine = exports.createPartnerFromLine = exports.getPartnerByPhone = exports.createQuotationFromLine = exports.findOrderByReference = exports.findProductByQuery = exports.verifyOdooAdminAccess = exports.pingOdoo = exports.isOdooConfigured = void 0;
const ODOO_RPC_TIMEOUT_MS = Number(process.env.ODOO_RPC_TIMEOUT_MS || 7000);
const ODOO_READ_RETRY_ATTEMPTS = Number(process.env.ODOO_READ_RETRY_ATTEMPTS || 3);
const ODOO_READ_RETRY_BASE_DELAY_MS = Number(process.env.ODOO_READ_RETRY_BASE_DELAY_MS || 250);
const getConfig = () => {
    const url = process.env.ODOO_URL?.trim() || '';
    const db = process.env.ODOO_DB?.trim() || '';
    const username = process.env.ODOO_USERNAME?.trim() || '';
    const apiKey = process.env.ODOO_API_KEY?.trim() || '';
    if (!url || !db || !username || !apiKey)
        return null;
    return { url, db, username, apiKey };
};
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const isTransientOdooError = (error) => {
    const message = String(error || '');
    if (/timed out/i.test(message))
        return true;
    if (/fetch failed|network|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT/i.test(message))
        return true;
    const httpMatch = message.match(/Odoo HTTP\s+(\d{3})/i);
    if (!httpMatch)
        return false;
    const status = Number(httpMatch[1]);
    return status === 429 || status >= 500;
};
const withReadRetry = async (label, operation) => {
    const maxAttempts = Math.max(1, ODOO_READ_RETRY_ATTEMPTS);
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await operation();
        }
        catch (error) {
            lastError = error;
            const shouldRetry = attempt < maxAttempts && isTransientOdooError(error);
            if (!shouldRetry)
                break;
            const backoffMs = ODOO_READ_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
            console.warn(`Odoo read retry ${attempt}/${maxAttempts} for ${label} after error: ${String(error)}`);
            await delay(backoffMs);
        }
    }
    throw lastError;
};
const ODOO_WRITE_RETRY_ATTEMPTS = Number(process.env.ODOO_WRITE_RETRY_ATTEMPTS || 2);
/**
 * Only safe for idempotent mutations (write/unlink on a known id) — never
 * wrap `create` in this, since retrying a create after an ambiguous
 * (timeout-like) failure risks creating a duplicate record.
 */
const withIdempotentWriteRetry = async (label, operation) => {
    const maxAttempts = Math.max(1, ODOO_WRITE_RETRY_ATTEMPTS);
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await operation();
        }
        catch (error) {
            lastError = error;
            const shouldRetry = attempt < maxAttempts && isTransientOdooError(error);
            if (!shouldRetry)
                break;
            const backoffMs = ODOO_READ_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
            console.warn(`Odoo write retry ${attempt}/${maxAttempts} for ${label} after error: ${String(error)}`);
            await delay(backoffMs);
        }
    }
    throw lastError;
};
const jsonRpc = async (config, service, method, args) => {
    const endpoint = `${config.url.replace(/\/$/, '')}/jsonrpc`;
    const body = {
        jsonrpc: '2.0',
        method: 'call',
        params: {
            service,
            method,
            args,
        },
        id: Date.now(),
    };
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), ODOO_RPC_TIMEOUT_MS);
    let response;
    try {
        response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
    }
    catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`Odoo RPC timed out after ${ODOO_RPC_TIMEOUT_MS}ms`);
        }
        throw error;
    }
    finally {
        clearTimeout(timeoutHandle);
    }
    if (!response.ok) {
        throw new Error(`Odoo HTTP ${response.status}`);
    }
    const data = (await response.json());
    if (data.error) {
        throw new Error(`Odoo RPC error: ${data.error.message}`);
    }
    if (data.result === undefined) {
        throw new Error('Odoo RPC returned no result');
    }
    return data.result;
};
const login = async (config) => {
    return jsonRpc(config, 'common', 'login', [
        config.db,
        config.username,
        config.apiKey,
    ]);
};
const executeKw = async (config, uid, model, method, positionalArgs, keywordArgs = {}) => {
    return jsonRpc(config, 'object', 'execute_kw', [
        config.db,
        uid,
        config.apiKey,
        model,
        method,
        positionalArgs,
        keywordArgs,
    ]);
};
const loginRead = async (config) => {
    return withReadRetry('login', async () => login(config));
};
const executeKwRead = async (config, uid, model, method, positionalArgs, keywordArgs = {}) => {
    return withReadRetry(`${model}.${method}`, async () => executeKw(config, uid, model, method, positionalArgs, keywordArgs));
};
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
const isOdooConfigured = () => getConfig() !== null;
exports.isOdooConfigured = isOdooConfigured;
const pingOdoo = async () => {
    const config = getConfig();
    if (!config)
        return 'Odoo is not configured (missing ODOO_URL/ODOO_DB/ODOO_USERNAME/ODOO_API_KEY).';
    const uid = await loginRead(config);
    if (!uid)
        return 'Odoo login failed. Check ODOO_USERNAME and ODOO_API_KEY.';
    return `Odoo connected successfully (uid=${uid}).`;
};
exports.pingOdoo = pingOdoo;
const verifyOdooAdminAccess = async () => {
    const config = getConfig();
    if (!config) {
        return { ok: false, message: 'Odoo is not configured.' };
    }
    const uid = await loginRead(config);
    if (!uid) {
        return { ok: false, message: 'Odoo login failed.' };
    }
    const canWritePartners = await executeKwRead(config, uid, 'res.partner', 'check_access_rights', ['write'], { raise_exception: false });
    if (!canWritePartners) {
        return { ok: false, message: 'Odoo user lacks admin-level write rights on res.partner.' };
    }
    return { ok: true, message: `Odoo admin verified (uid=${uid}).` };
};
exports.verifyOdooAdminAccess = verifyOdooAdminAccess;
const findProductByQuery = async (query) => {
    const normalizedQuery = normalizeLookupText(query);
    if (!normalizedQuery)
        return null;
    const config = getConfig();
    if (!config)
        return null;
    const uid = await loginRead(config);
    if (!uid)
        return null;
    const rows = await executeKwRead(config, uid, 'product.product', 'search_read', [[['name', 'ilike', normalizedQuery]]], {
        fields: ['id', 'name', 'list_price', 'qty_available', 'default_code'],
        limit: 1,
    });
    if (!rows.length)
        return null;
    return parseProduct(rows[0]);
};
exports.findProductByQuery = findProductByQuery;
const findOrderByReference = async (reference) => {
    const normalizedReference = normalizeOrderReference(reference);
    if (!normalizedReference)
        return null;
    const config = getConfig();
    if (!config)
        return null;
    const uid = await loginRead(config);
    if (!uid)
        return null;
    const rows = await executeKwRead(config, uid, 'sale.order', 'search_read', [[['name', '=', normalizedReference]]], {
        fields: ['id', 'name', 'state', 'amount_total', 'partner_id'],
        limit: 1,
    });
    if (!rows.length)
        return null;
    return parseOrder(rows[0]);
};
exports.findOrderByReference = findOrderByReference;
const findOrCreatePartner = async (config, uid, name, phone) => {
    const normalizedPhone = phone.trim();
    // Only search by phone when we actually have one — matching on an empty
    // string can return an unrelated partner that also has no phone on file.
    if (normalizedPhone) {
        const found = await executeKwRead(config, uid, 'res.partner', 'search_read', [[['phone', '=', normalizedPhone]]], { fields: ['id'], limit: 1 });
        if (found.length > 0) {
            return num(found[0].id);
        }
    }
    return executeKw(config, uid, 'res.partner', 'create', [{ name, ...(normalizedPhone ? { phone: normalizedPhone } : {}) }]);
};
const createQuotationFromLine = async (customerName, customerPhone, productQuery, qty, explicitPartnerId) => {
    const config = getConfig();
    if (!config)
        return null;
    try {
        const uid = await login(config);
        if (!uid)
            return null;
        const product = await (0, exports.findProductByQuery)(productQuery);
        if (!product)
            return null;
        const partnerId = explicitPartnerId || await findOrCreatePartner(config, uid, customerName, customerPhone);
        // No reliable natural key to reconcile a sale order against before it
        // exists, so unlike partner/service creates this is not retried or
        // reconciled — a failed attempt should be safely re-runnable by the user.
        const orderId = await executeKw(config, uid, 'sale.order', 'create', [{
                partner_id: partnerId,
                order_line: [[0, 0, { product_id: product.id, product_uom_qty: qty }]],
            }]);
        const rows = await executeKw(config, uid, 'sale.order', 'read', [[orderId]], { fields: ['name', 'amount_total'] });
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
const getPartnerByPhone = async (phone) => {
    const config = getConfig();
    if (!config)
        return null;
    const uid = await loginRead(config);
    if (!uid)
        return null;
    const variants = buildPhoneMatchVariants(phone);
    if (!variants.length)
        return null;
    const fieldMatches = variants.flatMap(v => [['phone', '=', v], ['mobile', '=', v]]);
    const domain = [...Array(fieldMatches.length - 1).fill('|'), ...fieldMatches];
    const rows = await executeKwRead(config, uid, 'res.partner', 'search_read', [domain], { fields: ['id', 'name', 'phone', 'email'], limit: 1 });
    if (!rows.length)
        return null;
    return parsePartner(rows[0]);
};
exports.getPartnerByPhone = getPartnerByPhone;
const createPartnerFromLine = async (name, phone, email) => {
    const config = getConfig();
    if (!config)
        return null;
    try {
        const uid = await login(config);
        if (!uid)
            return null;
        const partnerId = await executeKw(config, uid, 'res.partner', 'create', [{ name, phone, ...(email ? { email } : {}) }]);
        const rows = await executeKw(config, uid, 'res.partner', 'read', [[partnerId]], { fields: ['id', 'name', 'phone', 'email'] });
        if (!rows.length)
            return null;
        return parsePartner(rows[0]);
    }
    catch (error) {
        console.error('createPartnerFromLine failed:', error);
        // Never blindly retry a create (risks a duplicate partner). Instead,
        // reconcile: check whether it actually landed despite the client-side
        // error before reporting failure.
        if (isTransientOdooError(error)) {
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
        const uid = await login(config);
        if (!uid)
            return null;
        // write/read on a known id is idempotent, safe to retry on transient errors.
        await withIdempotentWriteRetry('updatePartner', () => executeKw(config, uid, 'res.partner', 'write', [[partnerId], values]));
        const rows = await executeKw(config, uid, 'res.partner', 'read', [[partnerId]], { fields: ['id', 'name', 'phone', 'email'] });
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
        const uid = await login(config);
        if (!uid)
            return false;
        return await withIdempotentWriteRetry('deletePartner', () => executeKw(config, uid, 'res.partner', 'unlink', [[partnerId]]));
    }
    catch (error) {
        console.error('deletePartnerFromLine failed:', error);
        return false;
    }
};
exports.deletePartnerFromLine = deletePartnerFromLine;
const findServiceByIdentifierInternal = async (config, uid, identifier) => {
    const byCode = await executeKwRead(config, uid, 'product.product', 'search_read', [[['default_code', '=', identifier.toUpperCase()]]], {
        fields: ['id', 'name', 'default_code', 'list_price', 'qty_available'],
        limit: 1,
    });
    if (byCode.length)
        return parseService(byCode[0]);
    const byName = await executeKwRead(config, uid, 'product.product', 'search_read', [[['name', 'ilike', identifier]]], {
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
    const uid = await loginRead(config);
    if (!uid)
        return [];
    const rows = await executeKwRead(config, uid, 'product.product', 'search_read', [[['type', '=', 'service']]], {
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
    const uid = await loginRead(config);
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
        const uid = await login(config);
        if (!uid)
            return null;
        const exists = await findServiceByIdentifierInternal(config, uid, code);
        if (exists)
            return exists;
        const productId = await executeKw(config, uid, 'product.product', 'create', [{
                name,
                default_code: code.toUpperCase(),
                list_price: price,
                type: 'service',
                detailed_type: 'service',
                sale_ok: true,
                purchase_ok: false,
            }]);
        const rows = await executeKw(config, uid, 'product.product', 'read', [[productId]], { fields: ['id', 'name', 'default_code', 'list_price', 'qty_available'] });
        if (!rows.length)
            return null;
        return parseService(rows[0]);
    }
    catch (error) {
        console.error('createServiceCatalogItem failed:', error);
        // Never blindly retry a create; reconcile by code before reporting failure.
        if (isTransientOdooError(error)) {
            try {
                const uid = await login(config);
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
        const uid = await login(config);
        if (!uid)
            return null;
        const existing = await findServiceByIdentifierInternal(config, uid, identifier);
        if (!existing)
            return null;
        const values = {};
        if (fields.name)
            values.name = fields.name;
        if (typeof fields.price === 'number' && !Number.isNaN(fields.price))
            values.list_price = fields.price;
        if (fields.code)
            values.default_code = fields.code.toUpperCase();
        if (!Object.keys(values).length)
            return existing;
        await withIdempotentWriteRetry('updateService', () => executeKw(config, uid, 'product.product', 'write', [[existing.id], values]));
        const rows = await executeKw(config, uid, 'product.product', 'read', [[existing.id]], { fields: ['id', 'name', 'default_code', 'list_price', 'qty_available'] });
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
        const uid = await login(config);
        if (!uid)
            return false;
        const existing = await findServiceByIdentifierInternal(config, uid, identifier);
        if (!existing)
            return false;
        return await withIdempotentWriteRetry('deleteService', () => executeKw(config, uid, 'product.product', 'unlink', [[existing.id]]));
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
    const orders = await executeKwRead(config, uid, 'sale.order', 'search_read', [[
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
    const lines = await executeKwRead(config, uid, 'sale.order.line', 'search_read', [[['order_id', 'in', orderIds]]], {
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
        ? await executeKwRead(config, uid, 'product.product', 'search_read', [[['id', 'in', productIds]]], { fields: ['id', 'qty_available'], limit: productIds.length })
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
    const uid = await loginRead(config);
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
    const products = await executeKwRead(config, uid, 'product.product', 'search_read', [[]], {
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
    const found = await executeKwRead(config, uid, 'product.product', 'search_read', [[['default_code', '=', defaultCode]]], { fields: ['id'], limit: 1 });
    if (found.length > 0)
        return num(found[0].id);
    return executeKw(config, uid, 'product.product', 'create', [{
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
    const uid = await login(config);
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
        const existing = await executeKwRead(config, uid, 'sale.order', 'search_read', [[['client_order_ref', '=', String(values.client_order_ref)]]], { fields: ['id'], limit: 1 });
        if (existing.length > 0)
            continue;
        await executeKw(config, uid, 'sale.order', 'create', [values]);
        createdCount += 1;
    }
    return `Odoo sample data ready. Created ${createdCount} new demo quotation(s).`;
};
exports.seedOdooSampleSalesData = seedOdooSampleSalesData;
