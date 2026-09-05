import { messagingApi } from '@line/bot-sdk';
import type { OdooSaleOrder } from '../../services/odoo/types';
import { t, stateLabel, type Lang } from '../../services/i18n';
import { BRAND, createMessageActionButton, createPrefillButton, createUriActionButton, formatMoney, truncate } from './shared';

const QUOTATION_STATE_SEQUENCE = ['draft', 'sent', 'sale'] as const;

/**
 * Mirrors the real Odoo Sales record's status bar (Quotation -> Quotation
 * Sent -> Sales Order) plus the actions relevant to who's looking at it.
 * `role` controls the action set — an admin can drive the order forward
 * (Confirm/Send); a customer can only Approve their own order or view it.
 * See quotation.ts for the authorization check that keeps that split real
 * (a customer's Approve tap is rejected server-side if the order isn't
 * theirs, regardless of what buttons this card happens to render).
 */
export const createQuotationJourneyFlexMessage = (
  order: OdooSaleOrder,
  options: { role: 'admin' | 'customer'; salesTier?: 'salesperson' | 'sales_manager'; portalLink?: string; pdfLink?: string },
  language: Lang
): messagingApi.FlexMessage => {
  const customerName = order.partner_id?.[1] || '-';
  const isCancelled = order.state === 'cancel';
  const currentIndex = isCancelled ? -1 : QUOTATION_STATE_SEQUENCE.indexOf(order.state as typeof QUOTATION_STATE_SEQUENCE[number]);

  const lines = order.lines || [];
  const visibleLines = lines.slice(0, 4);
  const extraCount = lines.length - visibleLines.length;

  const statusRow: messagingApi.FlexBox = isCancelled
    ? {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#F8D7DA',
        cornerRadius: BRAND.radius,
        paddingAll: 'sm',
        contents: [
          { type: 'text', text: stateLabel('cancel', language), align: 'center', weight: 'bold', size: 'sm', color: '#7A271A' },
        ],
      }
    : {
        type: 'box',
        layout: 'horizontal',
        spacing: 'xs',
        contents: QUOTATION_STATE_SEQUENCE.map((state, index) => ({
          type: 'box',
          layout: 'vertical',
          flex: 1,
          cornerRadius: BRAND.radius,
          paddingAll: 'xs',
          backgroundColor: index === currentIndex ? BRAND.teal : BRAND.tealTint,
          contents: [
            {
              type: 'text',
              text: stateLabel(state, language),
              size: 'xxs',
              align: 'center',
              wrap: true,
              color: index === currentIndex ? '#FFFFFF' : BRAND.tealStrong,
              weight: index === currentIndex ? 'bold' : 'regular',
            },
          ],
        })),
      };

  // Organized as rows (rather than one flat button list) so each row stays
  // simple regardless of how many actions the admin has available for this
  // state — mirrors Odoo web's own button visibility per state.
  const footerRows: messagingApi.FlexButton[][] = [];
  const canStillAct = !isCancelled && order.state !== 'sale';
  // Matches Odoo web's own Create Invoice button condition exactly
  // (sale.order.form: invisible="invoice_status != 'to invoice'").
  const canInvoice = !isCancelled && order.state === 'sale' && order.invoice_status === 'to invoice';
  // Odoo's own convention: cancellation and invoicing are manager-level
  // actions. Only an explicitly-resolved 'salesperson' tier loses them —
  // undefined (no linked Odoo user, today's default) and 'sales_manager'
  // both keep today's full admin action set. See findOdooSalesTierByPartnerId.
  const isRestrictedToSalesperson = options.salesTier === 'salesperson';

  if (options.role === 'admin') {
    if (canStillAct) {
      footerRows.push([
        createMessageActionButton(t('confirm', language), `QUOTE CONFIRM ${order.id}`, 'primary', BRAND.teal),
        createMessageActionButton(t('sendToCustomer', language), `QUOTE SEND ${order.id}`, 'secondary', BRAND.tealTint),
      ]);
      const lineActionButtons = [
        createPrefillButton(t('addItem', language), `QUOTE ADD ${order.id} `, 'secondary', BRAND.tealTint),
        createPrefillButton(t('editItem', language), `QUOTE EDIT ${order.id} `, 'secondary', BRAND.tealTint),
        ...(isRestrictedToSalesperson ? [] : [createMessageActionButton(t('cancelQuote', language), `QUOTE CANCEL ${order.id}`, 'secondary', BRAND.goldTint)]),
      ];
      footerRows.push(lineActionButtons);
    }
    if (canInvoice && !isRestrictedToSalesperson) {
      footerRows.push([createMessageActionButton(t('createInvoice', language), `QUOTE INVOICE ${order.id}`, 'primary', BRAND.teal)]);
    }
    footerRows.push([createPrefillButton(t('messageCustomer', language), `QUOTE MESSAGE ${order.id} `, 'secondary', BRAND.tealTint)]);
    if (options.portalLink || options.pdfLink) {
      footerRows.push([
        ...(options.portalLink ? [createUriActionButton(t('preview', language), options.portalLink, 'secondary', BRAND.goldTint)] : []),
        ...(options.pdfLink ? [createUriActionButton(t('downloadPdf', language), options.pdfLink, 'secondary', BRAND.goldTint)] : []),
      ]);
    }
  } else {
    if (canStillAct) {
      footerRows.push([createMessageActionButton(t('approve', language), `QUOTE APPROVE ${order.id}`, 'primary', BRAND.teal)]);
    }
    if (options.portalLink || options.pdfLink) {
      footerRows.push([
        ...(options.portalLink ? [createUriActionButton(t('viewFullQuotation', language), options.portalLink, 'secondary', BRAND.tealTint)] : []),
        ...(options.pdfLink ? [createUriActionButton(t('downloadPdf', language), options.pdfLink, 'secondary', BRAND.tealTint)] : []),
      ]);
    }
  }
  footerRows.push([createMessageActionButton(language === 'en' ? 'Home' : 'หน้าหลัก', 'NAV HOME', 'secondary', BRAND.goldTint)]);

  const footerContents: messagingApi.FlexComponent[] = footerRows.map(row =>
    row.length === 1
      ? row[0]
      : { type: 'box', layout: 'horizontal', spacing: 'xs', contents: row.map(button => ({ ...button, flex: 1 })) }
  );

  return {
    type: 'flex',
    altText: truncate(`${t('quotation', language)} ${order.name} — ${customerName} — ${formatMoney(order.amount_total, language)}`, 390),
    contents: {
      type: 'bubble',
      styles: {
        header: { backgroundColor: BRAND.teal },
        body: { backgroundColor: BRAND.surface },
        footer: { backgroundColor: BRAND.surface },
      },
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'md',
        contents: [
          { type: 'text', text: order.name, weight: 'bold', size: 'lg', color: '#FFFFFF', wrap: true },
          { type: 'text', text: `${t('customer', language)}: ${customerName}`, size: 'xs', color: '#DDEBE9', margin: 'xs', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          statusRow,
          ...(visibleLines.length ? [{
            type: 'box' as const,
            layout: 'vertical' as const,
            spacing: 'xs' as const,
            contents: [
              { type: 'text' as const, text: t('items', language), size: 'xs' as const, color: BRAND.inkSoft },
              ...visibleLines.map(line => ({
                type: 'box' as const,
                layout: 'horizontal' as const,
                backgroundColor: BRAND.paper,
                cornerRadius: BRAND.radius,
                paddingAll: 'sm' as const,
                contents: [
                  { type: 'text' as const, text: line.productName, size: 'sm' as const, weight: 'bold' as const, color: BRAND.ink, wrap: true, flex: 3 },
                  { type: 'text' as const, text: `× ${line.qty}`, size: 'sm' as const, color: BRAND.inkSoft, align: 'end' as const, flex: 1 },
                ],
              })),
              ...(extraCount > 0 ? [{ type: 'text' as const, text: `+${extraCount} ${t('moreItems', language)}`, size: 'xs' as const, color: BRAND.inkSoft }] : []),
            ],
          }] : []),
          ...(order.note ? [{
            type: 'box' as const,
            layout: 'vertical' as const,
            backgroundColor: BRAND.paper,
            cornerRadius: BRAND.radius,
            paddingAll: 'sm' as const,
            contents: [
              { type: 'text' as const, text: truncate(order.note, 200), size: 'xs' as const, color: BRAND.inkSoft, wrap: true },
            ],
          }] : []),
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: BRAND.tealTint,
            cornerRadius: BRAND.radius,
            paddingAll: 'md',
            contents: [
              { type: 'text', text: t('total', language), size: 'xs', color: BRAND.inkSoft },
              { type: 'text', text: formatMoney(order.amount_total, language), size: 'xl', color: BRAND.tealStrong, weight: 'bold', wrap: true },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: footerContents,
      },
    },
  };
};

/**
 * "My quotations" — one tappable row per order (QUOTE STATUS <id>), capped
 * at however many the caller passed in (getSaleOrdersForPartner already
 * caps the query itself). No pagination in this pass — matches the rest of
 * this feature's "simple UX" scope; a caller with more than that many
 * orders is told to ask an admin to narrow the search instead.
 */
export const createQuotationListFlexMessage = (
  orders: OdooSaleOrder[],
  hasMore: boolean,
  language: Lang
): messagingApi.FlexMessage => {
  return {
    type: 'flex',
    altText: truncate(t('myQuotations', language), 390),
    contents: {
      type: 'bubble',
      styles: {
        header: { backgroundColor: BRAND.teal },
        body: { backgroundColor: BRAND.surface },
        footer: { backgroundColor: BRAND.surface },
      },
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'md',
        contents: [
          { type: 'text', text: t('myQuotations', language), weight: 'bold', size: 'md', color: '#FFFFFF', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: orders.length
          ? [
              // A tappable box (not a button — LINE buttons cap labels at
              // 20 chars, which forced "S00023 · 1,851 THB" with no status
              // or date, unreadable for a sales user). A box's own action
              // makes the whole row tappable with no label-length limit at
              // all, so status + date + total can all be shown plainly.
              ...orders.map(order => ({
                type: 'box' as const,
                layout: 'horizontal' as const,
                backgroundColor: BRAND.paper,
                cornerRadius: BRAND.radius,
                paddingAll: 'sm' as const,
                action: { type: 'message' as const, text: `QUOTE STATUS ${order.id}` },
                contents: [
                  {
                    type: 'box' as const,
                    layout: 'vertical' as const,
                    flex: 3,
                    contents: [
                      { type: 'text' as const, text: order.name, size: 'sm' as const, weight: 'bold' as const, color: BRAND.ink, wrap: true },
                      {
                        type: 'text' as const,
                        text: `${stateLabel(order.state, language)}${order.date_order ? ` · ${order.date_order.split(' ')[0]}` : ''}`,
                        size: 'xs' as const, color: BRAND.inkSoft, wrap: true,
                      },
                    ],
                  },
                  {
                    type: 'text' as const,
                    text: formatMoney(order.amount_total, language),
                    size: 'sm' as const, weight: 'bold' as const, color: BRAND.tealStrong, align: 'end' as const, flex: 2, gravity: 'center' as const,
                  },
                ],
              })),
              ...(hasMore ? [{ type: 'text' as const, text: t('moreQuotations', language), size: 'xs' as const, color: BRAND.inkSoft, wrap: true }] : []),
            ]
          : [{ type: 'text', text: t('noQuotations', language), size: 'sm', color: BRAND.inkSoft, wrap: true }],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [createMessageActionButton(language === 'en' ? 'Home' : 'หน้าหลัก', 'NAV HOME', 'secondary', BRAND.goldTint)],
      },
    },
  };
};
