import type {
  OdooDailySalesItem,
  OdooPartner,
  OdooProduct,
  OdooSaleOrder,
  OdooSaleOrderLine,
  OdooServiceItem,
} from './odoo/types';
import {
  executeKw,
  executeKwRead,
  getOdooConfig,
  isTransientOdooError,
  login,
  loginRead,
  withIdempotentWriteRetry,
  type OdooConfig,
} from './odoo/client';
export * from './odoo/types';

const getConfig = getOdooConfig;

const num = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
};

const str = (value: unknown): string => {
  if (typeof value === 'string') return value;
  return '';
};

const parseProduct = (row: Record<string, unknown>): OdooProduct => ({
  id: num(row.id),
  name: str(row.name),
  list_price: num(row.list_price),
  qty_available: num(row.qty_available),
  default_code: str(row.default_code),
});

const parseOrder = (row: Record<string, unknown>): OdooSaleOrder => {
  const partner = Array.isArray(row.partner_id) ? row.partner_id : undefined;
  const partnerTuple = partner && partner.length >= 2
    ? [num(partner[0]), str(partner[1])] as [number, string]
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

const parseOrderLine = (row: Record<string, unknown>): OdooSaleOrderLine => {
  const product = Array.isArray(row.product_id) ? row.product_id : undefined;
  return {
    productName: product && product.length >= 2 ? str(product[1]) : '',
    qty: num(row.product_uom_qty),
    priceUnit: num(row.price_unit),
    subtotal: num(row.price_subtotal),
  };
};

const parsePartner = (row: Record<string, unknown>): OdooPartner => ({
  id: num(row.id),
  name: str(row.name),
  phone: str(row.phone),
  email: str(row.email),
});

const parseService = (row: Record<string, unknown>): OdooServiceItem => ({
  id: num(row.id),
  name: str(row.name),
  default_code: str(row.default_code),
  list_price: num(row.list_price),
  qty_available: num(row.qty_available),
});

const normalizeLookupText = (value: string, maxLength = 80): string => {
  // Strip control chars and cap size to avoid oversized Odoo query payloads.
  const sanitized = value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  return sanitized.slice(0, maxLength);
};

const normalizeOrderReference = (value: string): string => {
  const compact = normalizeLookupText(value, 40).toUpperCase();
  return compact.replace(/\s+/g, '');
};

const toOdooDateTime = (date: Date): string => {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const y = date.getUTCFullYear();
  const m = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const hh = pad(date.getUTCHours());
  const mm = pad(date.getUTCMinutes());
  const ss = pad(date.getUTCSeconds());
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
};

export { isOdooConfigured, pingOdoo, verifyOdooAdminAccess } from './odoo/admin';

export const findProductByQuery = async (query: string): Promise<OdooProduct | null> => {
  const normalizedQuery = normalizeLookupText(query);
  if (!normalizedQuery) return null;

  const config = getConfig();
  if (!config) return null;

  const uid = await loginRead(config);
  if (!uid) return null;

  const rows = await executeKwRead<Record<string, unknown>[]>(
    config,
    uid,
    'product.product',
    'search_read',
    [[['name', 'ilike', normalizedQuery]]],
    {
      fields: ['id', 'name', 'list_price', 'qty_available', 'default_code'],
      limit: 1,
    }
  );

  if (!rows.length) return null;
  return parseProduct(rows[0]);
};

/**
 * Same ilike search as findProductByQuery, but returns every match up to
 * `limit` instead of only the first row — lets a caller show a picker when
 * a search term is genuinely ambiguous ("App" matching several plans)
 * instead of silently acting on whichever row Odoo happened to return
 * first. findProductByQuery itself is left untouched since callers that
 * need exactly one product (e.g. quote-line creation) still want that
 * single-result contract.
 */
export const findProductsByQuery = async (query: string, limit = 5): Promise<OdooProduct[]> => {
  const normalizedQuery = normalizeLookupText(query);
  if (!normalizedQuery) return [];

  const config = getConfig();
  if (!config) return [];

  const uid = await loginRead(config);
  if (!uid) return [];

  const rows = await executeKwRead<Record<string, unknown>[]>(
    config,
    uid,
    'product.product',
    'search_read',
    [[['name', 'ilike', normalizedQuery]]],
    {
      fields: ['id', 'name', 'list_price', 'qty_available', 'default_code'],
      limit,
    }
  );

  return rows.map(parseProduct);
};

/**
 * Powers the guided-form product picker (select instead of type) — mirrors
 * listServiceCatalogItems's convention exactly, just without the
 * type='service' filter findProductByQuery also doesn't apply.
 */
export const listProducts = async (limit = 10): Promise<OdooProduct[]> => {
  const config = getConfig();
  if (!config) return [];

  const uid = await loginRead(config);
  if (!uid) return [];

  const rows = await executeKwRead<Record<string, unknown>[]>(
    config,
    uid,
    'product.product',
    'search_read',
    [[]],
    {
      fields: ['id', 'name', 'list_price', 'qty_available', 'default_code'],
      limit,
      order: 'write_date desc',
    }
  );

  return rows.map(parseProduct);
};

export const findOrderByReference = async (reference: string): Promise<OdooSaleOrder | null> => {
  const normalizedReference = normalizeOrderReference(reference);
  if (!normalizedReference) return null;

  const config = getConfig();
  if (!config) return null;

  const uid = await loginRead(config);
  if (!uid) return null;

  const rows = await executeKwRead<Record<string, unknown>[]>(
    config,
    uid,
    'sale.order',
    'search_read',
    [[['name', '=', normalizedReference]]],
    {
      fields: ['id', 'name', 'state', 'amount_total', 'partner_id', 'access_token'],
      limit: 1,
    }
  );

  if (!rows.length) return null;
  return parseOrder(rows[0]);
};

/**
 * Like findOrderByReference but by numeric id and with order lines attached
 * — used to (re)render the quotation journey card at any state. Two reads
 * (order + lines) since sale.order.line is a separate model; kept as two
 * plain search_reads rather than an Odoo-side read_group to stay consistent
 * with every other read in this file.
 */
export const getSaleOrderById = async (orderId: number): Promise<OdooSaleOrder | null> => {
  const config = getConfig();
  if (!config) return null;

  const uid = await loginRead(config);
  if (!uid) return null;

  const rows = await executeKwRead<Record<string, unknown>[]>(
    config,
    uid,
    'sale.order',
    'search_read',
    [[['id', '=', orderId]]],
    { fields: ['id', 'name', 'state', 'amount_total', 'partner_id', 'access_token', 'invoice_status', 'note'], limit: 1 }
  );
  if (!rows.length) return null;
  const order = parseOrder(rows[0]);

  const lineRows = await executeKwRead<Record<string, unknown>[]>(
    config,
    uid,
    'sale.order.line',
    'search_read',
    [[['order_id', '=', orderId], ['display_type', '=', false]]],
    { fields: ['product_id', 'product_uom_qty', 'price_unit', 'price_subtotal'] }
  );
  order.lines = lineRows.map(parseOrderLine);

  return order;
};

/**
 * Odoo's own customer-portal share link (verified live: get_portal_url
 * lazily generates access_token if missing and returns the relative path).
 * This is a bare shareable token — anyone with the URL can view the order —
 * so it's offered only as a "view/print" convenience, never as the
 * approval mechanism (see QUOTE APPROVE in quotation.ts, which is gated
 * behind the requester's own verified identity instead).
 */
export const getSaleOrderPortalLink = async (orderId: number): Promise<string | null> => {
  const config = getConfig();
  if (!config) return null;

  try {
    const uid = await login(config);
    if (!uid) return null;

    const relativePath = await executeKw<string>(config, uid, 'sale.order', 'get_portal_url', [[orderId]]);
    if (!relativePath) return null;
    return `${config.url.replace(/\/$/, '')}${relativePath}`;
  } catch (error) {
    console.error('getSaleOrderPortalLink failed:', error);
    return null;
  }
};

/**
 * LINE's Messaging API has no file-message type a bot can push (verified —
 * only text/sticker/image/video/audio/location/imagemap/template/flex), so
 * this is offered as a link, not an attachment. Reuses the exact same
 * portal link/access_token as getSaleOrderPortalLink — Odoo's portal route
 * returns a real PDF directly when `report_type=pdf` is appended, no
 * separate report call or extra auth needed (confirmed live).
 */
export const getSaleOrderPdfLink = async (orderId: number): Promise<string | null> => {
  const portalLink = await getSaleOrderPortalLink(orderId);
  if (!portalLink) return null;
  return `${portalLink}${portalLink.includes('?') ? '&' : '?'}report_type=pdf`;
};

/** Powers "my quotations" — most recent orders for a given customer, newest first. */
export const getSaleOrdersForPartner = async (partnerId: number, limit = 8): Promise<OdooSaleOrder[]> => {
  const config = getConfig();
  if (!config) return [];

  const uid = await loginRead(config);
  if (!uid) return [];

  const rows = await executeKwRead<Record<string, unknown>[]>(
    config,
    uid,
    'sale.order',
    'search_read',
    [[['partner_id', '=', partnerId]]],
    { fields: ['id', 'name', 'state', 'amount_total', 'partner_id', 'date_order'], order: 'date_order desc', limit }
  );
  return rows.map(parseOrder);
};

/** Mirrors findProductByQuery's ilike-first-match convention, applied to account.payment.term. */
export const findPaymentTermByName = async (query: string): Promise<{ id: number; name: string } | null> => {
  const normalizedQuery = normalizeLookupText(query);
  if (!normalizedQuery) return null;

  const config = getConfig();
  if (!config) return null;

  const uid = await loginRead(config);
  if (!uid) return null;

  const rows = await executeKwRead<Record<string, unknown>[]>(
    config,
    uid,
    'account.payment.term',
    'search_read',
    [[['name', 'ilike', normalizedQuery]]],
    { fields: ['id', 'name'], limit: 1 }
  );
  if (!rows.length) return null;
  return { id: num(rows[0].id), name: str(rows[0].name) };
};

/** Quotation -> Sales Order. */
export const confirmSaleOrder = async (orderId: number): Promise<boolean> => {
  const config = getConfig();
  if (!config) return false;

  try {
    const uid = await login(config);
    if (!uid) return false;
    await executeKw<boolean>(config, uid, 'sale.order', 'action_confirm', [[orderId]]);
    return true;
  } catch (error) {
    console.error('confirmSaleOrder failed:', error);
    return false;
  }
};

/**
 * Marks the order as sent and drops a chatter note for auditability in
 * Odoo itself. The chatter note is best-effort — a failure there shouldn't
 * fail the whole "send to customer" action, since the LINE push is what
 * actually matters to the caller.
 */
export const markSaleOrderSent = async (orderId: number): Promise<boolean> => {
  const config = getConfig();
  if (!config) return false;

  try {
    const uid = await login(config);
    if (!uid) return false;
    await executeKw<boolean>(config, uid, 'sale.order', 'write', [[orderId], { state: 'sent' }]);

    try {
      await executeKw<number>(config, uid, 'sale.order', 'message_post', [[orderId]], {
        body: 'Sent to customer via LINE OA.',
      });
    } catch (chatterError) {
      console.warn('markSaleOrderSent: message_post chatter note failed (non-fatal):', chatterError);
    }

    return true;
  } catch (error) {
    console.error('markSaleOrderSent failed:', error);
    return false;
  }
};

/** Cancels a quotation/order — reversible in Odoo itself (reset to draft), not exposed here since it's not part of the LINE journey. */
export const cancelSaleOrder = async (orderId: number): Promise<boolean> => {
  const config = getConfig();
  if (!config) return false;

  try {
    const uid = await login(config);
    if (!uid) return false;
    await executeKw<boolean>(config, uid, 'sale.order', 'action_cancel', [[orderId]]);
    return true;
  } catch (error) {
    console.error('cancelSaleOrder failed:', error);
    return false;
  }
};

/** Appends a new line to an existing (draft/sent) order — QUOTE ADD. */
export const addSaleOrderLine = async (orderId: number, productId: number, qty: number): Promise<boolean> => {
  const config = getConfig();
  if (!config) return false;

  try {
    const uid = await login(config);
    if (!uid) return false;
    await executeKw<number>(config, uid, 'sale.order.line', 'create', [{
      order_id: orderId,
      product_id: productId,
      product_uom_qty: qty,
    }]);
    return true;
  } catch (error) {
    console.error('addSaleOrderLine failed:', error);
    return false;
  }
};

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
export const findSaleOrderLineByProduct = async (orderId: number, productId: number): Promise<{ id: number; qty: number } | null> => {
  const config = getConfig();
  if (!config) return null;

  const uid = await loginRead(config);
  if (!uid) return null;

  const lines = await executeKwRead<{ id: number; product_uom_qty: number }[]>(config, uid, 'sale.order.line', 'search_read', [
    [['order_id', '=', orderId], ['product_id', '=', productId]],
  ], { fields: ['id', 'product_uom_qty'], limit: 1 });

  return lines.length ? { id: lines[0].id, qty: lines[0].product_uom_qty } : null;
};

export const updateSaleOrderLineQty = async (orderId: number, productId: number, qty: number): Promise<boolean> => {
  const config = getConfig();
  if (!config) return false;

  try {
    const uid = await login(config);
    if (!uid) return false;

    const existing = await findSaleOrderLineByProduct(orderId, productId);
    if (!existing) return false;

    await executeKw<boolean>(config, uid, 'sale.order.line', 'write', [[existing.id], { product_uom_qty: qty }]);
    return true;
  } catch (error) {
    console.error('updateSaleOrderLineQty failed:', error);
    return false;
  }
};

/**
 * Deletes an existing line entirely (mirrors Odoo web's own line-delete
 * button, as opposed to updateSaleOrderLineQty which only changes a
 * quantity). Returns false, not an error, if the product isn't on this
 * quote — same "not found vs failed" convention as the rest of this file.
 * Odoo itself enforces whether the order's current state allows deleting a
 * line (e.g. a locked/invoiced order rejects it); that surfaces here as a
 * caught error, same as any other write failure.
 */
export const removeSaleOrderLine = async (orderId: number, productId: number): Promise<boolean> => {
  const config = getConfig();
  if (!config) return false;

  try {
    const uid = await login(config);
    if (!uid) return false;

    const existing = await findSaleOrderLineByProduct(orderId, productId);
    if (!existing) return false;

    await executeKw<boolean>(config, uid, 'sale.order.line', 'unlink', [[existing.id]]);
    return true;
  } catch (error) {
    console.error('removeSaleOrderLine failed:', error);
    return false;
  }
};

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
export const createInvoiceForSaleOrder = async (orderId: number): Promise<boolean> => {
  const config = getConfig();
  if (!config) return false;

  try {
    const uid = await login(config);
    if (!uid) return false;

    const wizardContext = { active_model: 'sale.order', active_ids: [orderId], active_id: orderId };
    const wizardId = await executeKw<number>(
      config, uid, 'sale.advance.payment.inv', 'create', [{}], { context: wizardContext }
    );
    await executeKw<unknown>(
      config, uid, 'sale.advance.payment.inv', 'create_invoices', [[wizardId]], { context: wizardContext }
    );
    return true;
  } catch (error) {
    console.error('createInvoiceForSaleOrder failed:', error);
    return false;
  }
};

const findOrCreatePartner = async (config: OdooConfig, uid: number, name: string, phone: string): Promise<number> => {
  const normalizedPhone = phone.trim();

  // Only search by phone when we actually have one — matching on an empty
  // string can return an unrelated partner that also has no phone on file.
  if (normalizedPhone) {
    const found = await executeKwRead<Record<string, unknown>[]>(
      config,
      uid,
      'res.partner',
      'search_read',
      [[['phone', '=', normalizedPhone]]],
      { fields: ['id'], limit: 1 }
    );

    if (found.length > 0) {
      return num(found[0].id);
    }
  }

  return executeKw<number>(
    config,
    uid,
    'res.partner',
    'create',
    [{ name, ...(normalizedPhone ? { phone: normalizedPhone } : {}) }]
  );
};

export const createQuotationFromLine = async (
  customerName: string,
  customerPhone: string,
  productQuery: string,
  qty: number,
  explicitPartnerId?: number,
  /**
   * Optional Odoo fields that are blank/defaulted in Odoo web unless a user
   * fills them in — same behavior here. Any key left undefined is omitted
   * from the create payload entirely, so a caller that provides none of
   * these gets byte-for-byte today's behavior.
   */
  extra?: { customerRef?: string; discountPercent?: number; validityDate?: string; note?: string; paymentTermId?: number }
): Promise<{ orderName: string; total: number; orderId: number } | null> => {
  const config = getConfig();
  if (!config) return null;

  try {
    const uid = await login(config);
    if (!uid) return null;

    const product = await findProductByQuery(productQuery);
    if (!product) return null;

    const partnerId = explicitPartnerId || await findOrCreatePartner(config, uid, customerName, customerPhone);

    const orderLine: Record<string, unknown> = { product_id: product.id, product_uom_qty: qty };
    if (extra?.discountPercent !== undefined) orderLine.discount = extra.discountPercent;

    const orderFields: Record<string, unknown> = {
      partner_id: partnerId,
      order_line: [[0, 0, orderLine]],
    };
    if (extra?.customerRef) orderFields.client_order_ref = extra.customerRef;
    if (extra?.validityDate) orderFields.validity_date = extra.validityDate;
    if (extra?.note) orderFields.note = extra.note;
    if (extra?.paymentTermId !== undefined) orderFields.payment_term_id = extra.paymentTermId;

    // No reliable natural key to reconcile a sale order against before it
    // exists, so unlike partner/service creates this is not retried or
    // reconciled — a failed attempt should be safely re-runnable by the user.
    const orderId = await executeKw<number>(
      config,
      uid,
      'sale.order',
      'create',
      [orderFields]
    );

    const rows = await executeKw<Record<string, unknown>[]>(
      config,
      uid,
      'sale.order',
      'read',
      [[orderId]],
      { fields: ['name', 'amount_total'] }
    );

    if (!rows.length) return null;
    return {
      orderName: str(rows[0].name),
      total: num(rows[0].amount_total),
      orderId,
    };
  } catch (error) {
    console.error('createQuotationFromLine failed:', error);
    return null;
  }
};

const normalizePhoneDigits = (value: string): string => value.replace(/[^0-9+]/g, '').trim();

/**
 * Odoo contacts are entered with inconsistent formatting (local 0-prefix vs
 * +66/66 international) and the number often lives in `mobile` rather than
 * `phone`. An exact single-field match against exactly what the customer
 * typed was silently failing for legitimate accounts, so verification never
 * completed. Expand to every plausible formatting variant instead.
 */
const buildPhoneMatchVariants = (phone: string): string[] => {
  const cleaned = normalizePhoneDigits(phone);
  if (!cleaned) return [];

  const variants = new Set<string>([cleaned]);

  if (cleaned.startsWith('0') && cleaned.length >= 9) {
    variants.add(`+66${cleaned.slice(1)}`);
    variants.add(`66${cleaned.slice(1)}`);
  } else if (cleaned.startsWith('+66')) {
    variants.add(`0${cleaned.slice(3)}`);
    variants.add(cleaned.slice(1));
  } else if (cleaned.startsWith('66') && cleaned.length >= 10) {
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
let cachedPartnerPhoneFields: string[] | null = null;

const getPartnerPhoneFields = async (config: OdooConfig, uid: number): Promise<string[]> => {
  if (cachedPartnerPhoneFields) return cachedPartnerPhoneFields;

  let fields = ['phone'];
  try {
    const fieldsInfo = await executeKwRead<Record<string, unknown>>(
      config, uid, 'res.partner', 'fields_get', [['phone', 'mobile']], { attributes: [] }
    );
    const available = Object.keys(fieldsInfo || {});
    const discovered = ['phone', 'mobile'].filter(f => available.includes(f));
    if (discovered.length) fields = discovered;
  } catch (error) {
    console.warn('Odoo fields_get for res.partner phone fields failed, defaulting to phone only:', error);
  }

  cachedPartnerPhoneFields = fields;
  return fields;
};

export const getPartnerByPhone = async (phone: string): Promise<OdooPartner | null> => {
  const config = getConfig();
  if (!config) return null;

  const uid = await loginRead(config);
  if (!uid) return null;

  const variants = buildPhoneMatchVariants(phone);
  if (!variants.length) return null;

  const phoneFields = await getPartnerPhoneFields(config, uid);
  const fieldMatches = variants.flatMap(v => phoneFields.map(f => [f, '=', v]));
  const domain = [...Array(fieldMatches.length - 1).fill('|'), ...fieldMatches];

  const rows = await executeKwRead<Record<string, unknown>[]>(
    config,
    uid,
    'res.partner',
    'search_read',
    [domain],
    { fields: ['id', 'name', 'phone', 'email'], limit: 1 }
  );

  if (!rows.length) return null;
  return parsePartner(rows[0]);
};

/** By id rather than phone — used by QUOTE SEND to find the phone to look up against findVerifiedUserIdByPhone, since sale.order's partner_id only carries [id, displayName]. */
export const getPartnerById = async (partnerId: number): Promise<OdooPartner | null> => {
  const config = getConfig();
  if (!config) return null;

  const uid = await loginRead(config);
  if (!uid) return null;

  const rows = await executeKwRead<Record<string, unknown>[]>(
    config,
    uid,
    'res.partner',
    'search_read',
    [[['id', '=', partnerId]]],
    { fields: ['id', 'name', 'phone', 'email'], limit: 1 }
  );

  if (!rows.length) return null;
  return parsePartner(rows[0]);
};

export const createPartnerFromLine = async (name: string, phone: string, email?: string): Promise<OdooPartner | null> => {
  const config = getConfig();
  if (!config) return null;

  try {
    const uid = await login(config);
    if (!uid) return null;

    const partnerId = await executeKw<number>(
      config,
      uid,
      'res.partner',
      'create',
      [{ name, phone, ...(email ? { email } : {}) }]
    );

    const rows = await executeKw<Record<string, unknown>[]>(
      config,
      uid,
      'res.partner',
      'read',
      [[partnerId]],
      { fields: ['id', 'name', 'phone', 'email'] }
    );

    if (!rows.length) return null;
    return parsePartner(rows[0]);
  } catch (error) {
    console.error('createPartnerFromLine failed:', error);
    // Never blindly retry a create (risks a duplicate partner). Instead,
    // reconcile: check whether it actually landed despite the client-side
    // error before reporting failure.
    if (isTransientOdooError(error)) {
      try {
        const reconciled = await getPartnerByPhone(phone);
        if (reconciled) return reconciled;
      } catch (reconcileError) {
        console.error('createPartnerFromLine reconciliation check failed:', reconcileError);
      }
    }
    return null;
  }
};

export const updatePartnerFromLine = async (partnerId: number, name?: string, phone?: string, email?: string): Promise<OdooPartner | null> => {
  const config = getConfig();
  if (!config) return null;

  const values: Record<string, unknown> = {};
  if (name) values.name = name;
  if (phone) values.phone = phone;
  if (email) values.email = email;
  if (!Object.keys(values).length) return null;

  try {
    const uid = await login(config);
    if (!uid) return null;

    // write/read on a known id is idempotent, safe to retry on transient errors.
    await withIdempotentWriteRetry('updatePartner', () => executeKw<boolean>(
      config,
      uid,
      'res.partner',
      'write',
      [[partnerId], values]
    ));

    const rows = await executeKw<Record<string, unknown>[]>(
      config,
      uid,
      'res.partner',
      'read',
      [[partnerId]],
      { fields: ['id', 'name', 'phone', 'email'] }
    );

    if (!rows.length) return null;
    return parsePartner(rows[0]);
  } catch (error) {
    console.error('updatePartnerFromLine failed:', error);
    return null;
  }
};

export const deletePartnerFromLine = async (partnerId: number): Promise<boolean> => {
  const config = getConfig();
  if (!config) return false;

  try {
    const uid = await login(config);
    if (!uid) return false;

    return await withIdempotentWriteRetry('deletePartner', () => executeKw<boolean>(
      config,
      uid,
      'res.partner',
      'unlink',
      [[partnerId]]
    ));
  } catch (error) {
    console.error('deletePartnerFromLine failed:', error);
    return false;
  }
};

const findServiceByIdentifierInternal = async (config: OdooConfig, uid: number, identifier: string): Promise<OdooServiceItem | null> => {
  const byCode = await executeKwRead<Record<string, unknown>[]>(
    config,
    uid,
    'product.product',
    'search_read',
    [[['default_code', '=', identifier.toUpperCase()]]],
    {
      fields: ['id', 'name', 'default_code', 'list_price', 'qty_available'],
      limit: 1,
    }
  );

  if (byCode.length) return parseService(byCode[0]);

  const byName = await executeKwRead<Record<string, unknown>[]>(
    config,
    uid,
    'product.product',
    'search_read',
    [[['name', 'ilike', identifier]]],
    {
      fields: ['id', 'name', 'default_code', 'list_price', 'qty_available'],
      limit: 1,
    }
  );

  if (byName.length) return parseService(byName[0]);
  return null;
};

export const listServiceCatalogItems = async (limit = 10): Promise<OdooServiceItem[]> => {
  const config = getConfig();
  if (!config) return [];

  const uid = await loginRead(config);
  if (!uid) return [];

  const rows = await executeKwRead<Record<string, unknown>[]>(
    config,
    uid,
    'product.product',
    'search_read',
    [[['type', '=', 'service']]],
    {
      fields: ['id', 'name', 'default_code', 'list_price', 'qty_available'],
      limit,
      order: 'write_date desc',
    }
  );

  return rows.map(parseService);
};

export const getServiceByIdentifier = async (identifier: string): Promise<OdooServiceItem | null> => {
  const config = getConfig();
  if (!config) return null;

  const uid = await loginRead(config);
  if (!uid) return null;

  return findServiceByIdentifierInternal(config, uid, identifier);
};

export const createServiceCatalogItem = async (name: string, code: string, price: number): Promise<OdooServiceItem | null> => {
  const config = getConfig();
  if (!config) return null;

  try {
    const uid = await login(config);
    if (!uid) return null;

    const exists = await findServiceByIdentifierInternal(config, uid, code);
    if (exists) return exists;

    const productId = await executeKw<number>(
      config,
      uid,
      'product.product',
      'create',
      [{
        name,
        default_code: code.toUpperCase(),
        list_price: price,
        type: 'service',
        detailed_type: 'service',
        sale_ok: true,
        purchase_ok: false,
      }]
    );

    const rows = await executeKw<Record<string, unknown>[]>(
      config,
      uid,
      'product.product',
      'read',
      [[productId]],
      { fields: ['id', 'name', 'default_code', 'list_price', 'qty_available'] }
    );

    if (!rows.length) return null;
    return parseService(rows[0]);
  } catch (error) {
    console.error('createServiceCatalogItem failed:', error);
    // Never blindly retry a create; reconcile by code before reporting failure.
    if (isTransientOdooError(error)) {
      try {
        const uid = await login(config);
        if (uid) {
          const reconciled = await findServiceByIdentifierInternal(config, uid, code);
          if (reconciled) return reconciled;
        }
      } catch (reconcileError) {
        console.error('createServiceCatalogItem reconciliation check failed:', reconcileError);
      }
    }
    return null;
  }
};

export const updateServiceCatalogItem = async (
  identifier: string,
  fields: { name?: string; price?: number; code?: string }
): Promise<OdooServiceItem | null> => {
  const config = getConfig();
  if (!config) return null;

  try {
    const uid = await login(config);
    if (!uid) return null;

    const existing = await findServiceByIdentifierInternal(config, uid, identifier);
    if (!existing) return null;

    const values: Record<string, unknown> = {};
    if (typeof fields.price === 'number' && !Number.isNaN(fields.price)) values.list_price = fields.price;
    if (fields.code) values.default_code = fields.code.toUpperCase();
    if (!Object.keys(values).length) return existing;

    await withIdempotentWriteRetry('updateService', () => executeKw<boolean>(
      config,
      uid,
      'product.product',
      'write',
      [[existing.id], values]
    ));
    const rows = await executeKw<Record<string, unknown>[]>(
      config,
      uid,
      'product.product',
      'read',
      [[existing.id]],
      { fields: ['id', 'name', 'default_code', 'list_price', 'qty_available'] }
    );

    if (!rows.length) return null;
    return parseService(rows[0]);
  } catch (error) {
    console.error('updateServiceCatalogItem failed:', error);
    return null;
  }
};

export const deleteServiceCatalogItem = async (identifier: string): Promise<boolean> => {
  const config = getConfig();
  if (!config) return false;

  try {
    const uid = await login(config);
    if (!uid) return false;

    const existing = await findServiceByIdentifierInternal(config, uid, identifier);
    if (!existing) return false;

    return await withIdempotentWriteRetry('deleteService', () => executeKw<boolean>(
      config,
      uid,
      'product.product',
      'unlink',
      [[existing.id]]
    ));
  } catch (error) {
    console.error('deleteServiceCatalogItem failed:', error);
    return false;
  }
};

const fetchSalesSnapshotByWindow = async (
  config: OdooConfig,
  uid: number,
  start: Date,
  end: Date
): Promise<OdooDailySalesItem[]> => {
  const startStr = toOdooDateTime(start);
  const endStr = toOdooDateTime(end);

  const orders = await executeKwRead<Record<string, unknown>[]>(
    config,
    uid,
    'sale.order',
    'search_read',
    [[
      ['state', 'in', ['draft', 'sent', 'sale', 'done']],
      ['date_order', '>=', startStr],
      ['date_order', '<', endStr],
    ]],
    {
      fields: ['id'],
      limit: 1000,
      order: 'date_order desc',
    }
  );

  const orderIds = orders.map(row => num(row.id)).filter(Boolean);
  if (!orderIds.length) return [];

  const lines = await executeKwRead<Record<string, unknown>[]>(
    config,
    uid,
    'sale.order.line',
    'search_read',
    [[['order_id', 'in', orderIds]]],
    {
      fields: ['product_id', 'product_uom_qty', 'price_total'],
      limit: 5000,
    }
  );

  type Agg = { productId: number; productName: string; salesYesterday: number; revenueYesterday: number };
  const aggregate = new Map<number, Agg>();

  for (const line of lines) {
    const tuple = Array.isArray(line.product_id) ? line.product_id : [];
    const productId = num(tuple[0]);
    const productName = str(tuple[1]) || `Product ${productId}`;
    if (!productId) continue;

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
    ? await executeKwRead<Record<string, unknown>[]>(
      config,
      uid,
      'product.product',
      'search_read',
      [[['id', 'in', productIds]]],
      { fields: ['id', 'qty_available'], limit: productIds.length }
    )
    : [];

  const stockByProductId = new Map<number, number>();
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

export const getDailySalesSnapshot = async (): Promise<OdooDailySalesItem[]> => {
  const config = getConfig();
  if (!config) return [];

  const uid = await loginRead(config);
  if (!uid) return [];

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));

  const yesterdaySnapshot = await fetchSalesSnapshotByWindow(config, uid, start, end);
  if (yesterdaySnapshot.length) return yesterdaySnapshot;

  // If there is no activity yesterday, pull recent activity so reports remain real and useful.
  const rollingStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 30, 0, 0, 0));
  const rollingEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  const rollingSnapshot = await fetchSalesSnapshotByWindow(config, uid, rollingStart, rollingEnd);
  if (rollingSnapshot.length) return rollingSnapshot;

  // Final fallback: real Odoo product inventory snapshot (no mock data).
  const products = await executeKwRead<Record<string, unknown>[]>(
    config,
    uid,
    'product.product',
    'search_read',
    [[]],
    {
      fields: ['name', 'qty_available', 'list_price'],
      limit: 20,
      order: 'write_date desc',
    }
  );

  return products.map(product => ({
    product: str(product.name),
    stock: num(product.qty_available),
    salesYesterday: 0,
    revenueYesterday: 0,
  }));
};

const findOrCreateProduct = async (
  config: OdooConfig,
  uid: number,
  name: string,
  defaultCode: string,
  listPrice: number
): Promise<number> => {
  const found = await executeKwRead<Record<string, unknown>[]>(
    config,
    uid,
    'product.product',
    'search_read',
    [[['default_code', '=', defaultCode]]],
    { fields: ['id'], limit: 1 }
  );

  if (found.length > 0) return num(found[0].id);

  return executeKw<number>(
    config,
    uid,
    'product.product',
    'create',
    [{
      name,
      default_code: defaultCode,
      list_price: listPrice,
      type: 'consu',
      sale_ok: true,
      purchase_ok: false,
    }]
  );
};

export const seedOdooSampleSalesData = async (): Promise<string> => {
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
    const existing = await executeKwRead<Record<string, unknown>[]>(
      config,
      uid,
      'sale.order',
      'search_read',
      [[['client_order_ref', '=', String(values.client_order_ref)]]],
      { fields: ['id'], limit: 1 }
    );

    if (existing.length > 0) continue;
    await executeKw<number>(config, uid, 'sale.order', 'create', [values]);
    createdCount += 1;
  }

  return `Odoo sample data ready. Created ${createdCount} new demo quotation(s).`;
};
