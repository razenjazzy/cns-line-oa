import { messagingApi } from '@line/bot-sdk';
import type { OdooSaleOrder } from '../../services/odoo/types';
import { t, tFill, stateLabel, invoiceStatusLabel, type Lang } from '../../services/i18n';
import { bindPostbackData } from '../postback';
import { BRAND, createDatePickerButton, createMessageActionButton, createPrefillButton, createUriActionButton, formatMoney, truncate } from './shared';

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
  options: { role: 'admin' | 'customer'; salesTier?: 'salesperson' | 'sales_manager'; canManageLines?: boolean; portalLink?: string; pdfLink?: string },
  language: Lang
): messagingApi.FlexMessage => {
  const customerName = order.partner_id?.[1] || '-';
  const isCancelled = order.state === 'cancel';
  const currentIndex = isCancelled ? -1 : QUOTATION_STATE_SEQUENCE.indexOf(order.state as typeof QUOTATION_STATE_SEQUENCE[number]);

  const invoiceLabel = invoiceStatusLabel(order.invoice_status, language);
  const invoiceChip: messagingApi.FlexBox | null = invoiceLabel ? {
    type: 'box',
    layout: 'horizontal',
    backgroundColor: BRAND.paper,
    cornerRadius: BRAND.radius,
    paddingAll: 'sm',
    contents: [
      { type: 'text', text: t('invoiceField', language), size: 'xs', color: BRAND.inkSoft, flex: 2 },
      { type: 'text', text: invoiceLabel, size: 'sm', color: BRAND.tealStrong, align: 'end', flex: 3, wrap: true },
    ],
  } : null;
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

  const isDraft = order.state === 'draft';
  const isSent = order.state === 'sent';
  const isSale = order.state === 'sale';

  const pairButtons = (left: messagingApi.FlexButton, right: messagingApi.FlexButton): messagingApi.FlexBox => ({
    type: 'box',
    layout: 'horizontal',
    spacing: 'xs',
    contents: [
      { ...left, flex: 1 },
      { ...right, flex: 1 },
    ],
  });

  // Screenshot layout: Confirm|Send in the body; footer is exactly three
  // rows — View Quote|Download PDF, More, Home.
  const bodyActions: messagingApi.FlexComponent[] = [];
  if (options.role === 'admin') {
    if (!isCancelled && (isDraft || isSent)) {
      bodyActions.push(pairButtons(
        createMessageActionButton(t('confirm', language), `QUOTE CONFIRM ${order.id}`, 'primary', BRAND.teal),
        createMessageActionButton(t('sendNow', language), `QUOTE SEND ${order.id}`, 'secondary', BRAND.tealTint),
      ));
    }
    if (!isCancelled && isSale) {
      const canCreateInvoice = order.invoice_status === 'to invoice' || order.invoice_status === 'upselling';
      bodyActions.push(canCreateInvoice
        ? pairButtons(
            createMessageActionButton(t('createInvoice', language), `QUOTE INVOICE ${order.id}`, 'primary', BRAND.teal),
            createMessageActionButton(t('sendInvoice', language), `QUOTE INVOICE SEND ${order.id}`, 'secondary', BRAND.tealTint),
          )
        : createMessageActionButton(t('sendInvoice', language), `QUOTE INVOICE SEND ${order.id}`, 'secondary', BRAND.tealTint));
    }
  } else if (!isCancelled && isSent) {
    bodyActions.push(createMessageActionButton(t('approve', language), `QUOTE APPROVE ${order.id}`, 'primary', BRAND.teal));
  }

  const footerContents: messagingApi.FlexComponent[] = [];
  if (!isCancelled && (options.portalLink || options.pdfLink)) {
    const linkRow = [
      ...(options.portalLink ? [createUriActionButton(t('viewFullQuotation', language), options.portalLink, 'secondary', BRAND.goldTint)] : []),
      ...(options.pdfLink ? [createUriActionButton(t('downloadPdf', language), options.pdfLink, 'secondary', BRAND.goldTint)] : []),
    ];
    footerContents.push(linkRow.length === 1
      ? linkRow[0]
      : { type: 'box', layout: 'horizontal', spacing: 'xs', contents: linkRow.map(button => ({ ...button, flex: 1 })) });
  }
  if (options.role === 'admin') {
    footerContents.push(createMessageActionButton(t('moreActions', language), `QUOTE MORE ${order.id}`, 'secondary', BRAND.tealTint));
    footerContents.push(createMessageActionButton(t('home', language), 'NAV HOME', 'secondary', BRAND.goldTint));
  }

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
        paddingBottom: 'lg',
        contents: [
          statusRow,
          ...(invoiceChip ? [invoiceChip] : []),
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
              ...(order.amount_invoiced
                ? [{ type: 'text' as const, text: `${t('invoiceInvoiced', language)}: ${formatMoney(order.amount_invoiced, language)}`, size: 'xs' as const, color: BRAND.inkSoft, wrap: true }]
                : []),
            ],
          },
          ...bodyActions,
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: footerContents.length
          ? footerContents.slice(0, 3)
          : [{ type: 'text', text: ' ', size: 'xs', color: BRAND.surface }],
      },
    },
  };
};

export const createQuotationMoreFlexMessage = (
  order: OdooSaleOrder,
  options: { salesTier?: 'salesperson' | 'sales_manager' },
  language: Lang,
): messagingApi.FlexMessage => {
  const canStillAct = order.state !== 'cancel' && order.state !== 'sale';
  const canInvoice = order.state === 'sale' && (order.invoice_status === 'to invoice' || order.invoice_status === 'upselling');
  const isRestrictedToSalesperson = options.salesTier === 'salesperson';
  const rows: messagingApi.FlexComponent[] = [];
  if (canStillAct) {
    rows.push(createMessageActionButton(t('editQuote', language), `QUOTE LINES ${order.id}`, 'primary', BRAND.teal));
    if (order.state === 'draft' || order.state === 'sent') {
      rows.push(createMessageActionButton(t('sendViaEmail', language), `QUOTE SEND OPTIONS ${order.id}`, 'secondary', BRAND.tealTint));
    }
    if (!isRestrictedToSalesperson) {
      rows.push(createMessageActionButton(t('cancelQuote', language), `QUOTE CANCEL ${order.id}`, 'secondary', BRAND.goldTint));
    }
  }
  if (order.state === 'sale') {
    if (canInvoice) {
      rows.push(createMessageActionButton(t('createInvoice', language), `QUOTE INVOICE ${order.id}`, 'primary', BRAND.teal));
    }
    rows.push(createMessageActionButton(t('sendInvoice', language), `QUOTE INVOICE SEND ${order.id}`, 'secondary', BRAND.tealTint));
    if (!isRestrictedToSalesperson && order.invoice_status !== 'invoiced') {
      rows.push(createMessageActionButton(t('cancelQuote', language), `QUOTE CANCEL ${order.id}`, 'secondary', BRAND.goldTint));
    }
  }
  rows.push(createPrefillButton(t('messageCustomer', language), `QUOTE MESSAGE ${order.id} `, 'secondary', BRAND.tealTint));
  rows.push(createMessageActionButton(t('createMore', language), `QUOTE CREATE MORE ${order.id}`, 'secondary', BRAND.tealTint));
  rows.push(createMessageActionButton(t('back', language), `QUOTE STATUS ${order.id}`, 'secondary', BRAND.goldTint));

  return {
    type: 'flex',
    altText: truncate(`${t('moreActions', language)} ${order.name}`, 390),
    contents: {
      type: 'bubble',
      styles: { header: { backgroundColor: BRAND.teal }, body: { backgroundColor: BRAND.surface }, footer: { backgroundColor: BRAND.surface } },
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'md',
        contents: [
          { type: 'text', text: t('moreActions', language), weight: 'bold', size: 'md', color: '#FFFFFF' },
          { type: 'text', text: order.name, size: 'xs', color: '#DDEBE9', margin: 'xs' },
        ],
      },
      body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingBottom: 'lg', contents: rows },
    },
  };
};

export const createQuotationEditFlexMessage = (
  order: OdooSaleOrder,
  language: Lang,
): messagingApi.FlexMessage => {
  const lines = (order.lines || []).slice(0, 8);
  const lineRows: messagingApi.FlexComponent[] = lines.map(line => ({
        type: 'box' as const,
        layout: 'vertical' as const,
        spacing: 'xs' as const,
        backgroundColor: BRAND.paper,
        cornerRadius: BRAND.radius,
        paddingAll: 'sm' as const,
        contents: [
          {
            type: 'box' as const,
            layout: 'horizontal' as const,
            contents: [
              { type: 'text' as const, text: line.productName, size: 'sm' as const, color: BRAND.ink, wrap: true, flex: 3 },
              { type: 'text' as const, text: `× ${line.qty}`, size: 'sm' as const, color: BRAND.inkSoft, align: 'end' as const, flex: 1 },
            ],
          },
          {
            type: 'box' as const,
            layout: 'horizontal' as const,
            spacing: 'xs' as const,
            contents: [
              { ...createPrefillButton(t('editItem', language), `QUOTE EDIT ${order.id} ${line.productName},`, 'primary', BRAND.teal), flex: 1 },
              { ...createPrefillButton(t('removeItem', language), `QUOTE REMOVE ${order.id} ${line.productName}`, 'secondary', BRAND.goldTint), flex: 1 },
            ],
          },
        ],
      }));

  return {
    type: 'flex',
    altText: truncate(`${t('editQuote', language)} ${order.name}`, 390),
    contents: {
      type: 'bubble',
      styles: { header: { backgroundColor: BRAND.teal }, body: { backgroundColor: BRAND.surface }, footer: { backgroundColor: BRAND.surface } },
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'md',
        contents: [
          { type: 'text', text: t('editQuote', language), weight: 'bold', size: 'md', color: '#FFFFFF' },
          { type: 'text', text: order.name, size: 'xs', color: '#DDEBE9', margin: 'xs' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingBottom: 'lg',
        contents: [
          { type: 'text', text: t('editQuoteHint', language), size: 'xs', color: BRAND.inkSoft, wrap: true },
          ...lineRows,
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          createPrefillButton(t('addItem', language), `QUOTE ADD ${order.id} `, 'primary', BRAND.teal),
          createMessageActionButton(t('back', language), `QUOTE MORE ${order.id}`, 'secondary', BRAND.goldTint),
        ],
      },
    },
  };
};

export const createQuoteSendComposerFlexMessage = (
  order: OdooSaleOrder,
  email: string | undefined,
  language: Lang,
  kind: 'quotation' | 'invoice' = 'quotation',
  phone?: string,
): messagingApi.FlexMessage => {
  const customerName = order.partner_id?.[1] || '-';
  const isInvoice = kind === 'invoice';
  const confirmPrefix = isInvoice ? `QUOTE INVOICE SEND CONFIRM ${order.id}` : `QUOTE SEND CONFIRM ${order.id}`;
  const subject = isInvoice
    ? (language === 'en' ? `Invoice ${order.name}` : `ใบแจ้งหนี้ ${order.name}`)
    : (language === 'en' ? `Quotation ${order.name}` : `ใบเสนอราคา ${order.name}`);
  const body = isInvoice
    ? (language === 'en'
      ? `Please review invoice ${order.name} (${formatMoney(order.amount_total, language)}).`
      : `กรุณาตรวจสอบใบแจ้งหนี้ ${order.name} (${formatMoney(order.amount_total, language)})`)
    : (language === 'en'
      ? `Please review quotation ${order.name} (${formatMoney(order.amount_total, language)}). Confirm in LINE or Odoo to proceed.`
      : `กรุณาตรวจสอบใบเสนอราคา ${order.name} (${formatMoney(order.amount_total, language)}) ยืนยันใน LINE หรือ Odoo เพื่อดำเนินการต่อ`);
  const emailChips = email ? [email] : [];
  const title = isInvoice ? t('invoiceSendComposerTitle', language) : t('sendComposerTitle', language);
  const emailSuffix = email ? ` ${email}` : '';

  return {
    type: 'flex',
    altText: truncate(title, 390),
    quickReply: {
      items: [
        { type: 'action' as const, action: { type: 'message' as const, label: t('sendViaLine', language), text: `${confirmPrefix} LINE` } },
        { type: 'action' as const, action: { type: 'message' as const, label: t('sendViaEmail', language), text: `${confirmPrefix} EMAIL${emailSuffix}` } },
        { type: 'action' as const, action: { type: 'message' as const, label: t('sendViaBoth', language), text: `${confirmPrefix} BOTH${emailSuffix}` } },
        ...emailChips.map(value => ({
          type: 'action' as const,
          action: { type: 'message' as const, label: value, text: `${confirmPrefix} BOTH ${value}` },
        })),
      ],
    },
    contents: {
      type: 'bubble',
      styles: { header: { backgroundColor: BRAND.teal }, body: { backgroundColor: BRAND.surface }, footer: { backgroundColor: BRAND.surface } },
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'md',
        contents: [
          { type: 'text', text: title, weight: 'bold', size: 'md', color: '#FFFFFF' },
          { type: 'text', text: order.name, size: 'xs', color: '#DDEBE9', margin: 'xs' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingBottom: 'lg',
        contents: [
          { type: 'text', text: `${t('customer', language)}: ${customerName}`, size: 'sm', color: BRAND.ink, wrap: true },
          { type: 'text', text: `${t('phoneField', language)}: ${phone || '—'}`, size: 'sm', color: BRAND.ink, wrap: true },
          { type: 'text', text: `${t('emailTo', language)}: ${email || '—'}`, size: 'sm', color: BRAND.ink, wrap: true },
          { type: 'text', text: `${t('emailSubject', language)}: ${subject}`, size: 'sm', color: BRAND.ink, wrap: true },
          { type: 'text', text: body, size: 'xs', color: BRAND.inkSoft, wrap: true },
          ...(!phone ? [{ type: 'text' as const, text: t('quoteNotLinked', language), size: 'xs' as const, color: BRAND.gold, wrap: true }] : []),
          ...(!email ? [{ type: 'text' as const, text: t('noPartnerEmail', language), size: 'xs' as const, color: BRAND.gold, wrap: true }] : []),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'xs',
            contents: [
              { ...createMessageActionButton(t('sendViaLine', language), `${confirmPrefix} LINE`, 'secondary', BRAND.tealTint), flex: 1 },
              { ...createMessageActionButton(t('sendViaEmail', language), `${confirmPrefix} EMAIL${emailSuffix}`, 'secondary', BRAND.tealTint), flex: 1 },
            ],
          },
          createMessageActionButton(t('sendViaBoth', language), `${confirmPrefix} BOTH${emailSuffix}`, 'primary', BRAND.teal),
          createPrefillButton(t('typeEmail', language), `${confirmPrefix} BOTH `, 'secondary', BRAND.tealTint),
          createMessageActionButton(t('back', language), `QUOTE STATUS ${order.id}`, 'secondary', BRAND.goldTint),
        ],
      },
    },
  };
};

/**
 * "My quotations" — five rows, Next 5, optional date filter.
 */
export const createQuotationListFlexMessage = (
  orders: OdooSaleOrder[],
  hasMore: boolean,
  language: Lang,
  nextCursor?: string,
  dateFrom?: string,
  dateTo?: string,
  userId = '',
): messagingApi.FlexMessage => {
  const dateQuery = dateFrom && dateTo ? ` FROM ${dateFrom} TO ${dateTo}` : '';
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
          { type: 'text', text: orders.length
            ? tFill('listTapHint', language, { n: orders.length })
            : t('noQuotationsYet', language), size: 'xs', color: '#DDEBE9', margin: 'xs', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingBottom: 'lg',
        contents: orders.length
          ? orders.map(order => {
              const kind = order.state === 'sale' || order.state === 'done' ? t('orderKind', language) : t('quotation', language);
              const datePart = order.date_order ? order.date_order.split(' ')[0] : '';
              const customer = order.partner_id?.[1] || '-';
              return {
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
                      { type: 'text' as const, text: order.name, size: 'sm' as const, color: BRAND.ink, wrap: true },
                      {
                        type: 'text' as const,
                        text: `${kind}: ${datePart} | ${customer}`,
                        size: 'xs' as const, color: BRAND.inkSoft, wrap: true,
                      },
                    ],
                  },
                  {
                    type: 'text' as const,
                    text: formatMoney(order.amount_total, language),
                    size: 'sm' as const, color: BRAND.tealStrong, align: 'end' as const, flex: 2, gravity: 'center' as const,
                  },
                ],
              };
            })
          : [{ type: 'text', text: t('noQuotations', language), size: 'sm', color: BRAND.inkSoft, wrap: true }],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
            { ...createDatePickerButton(t('dateFrom', language), bindPostbackData('quote.list.from', userId)), flex: 1 },
            { ...createDatePickerButton(t('dateTo', language), bindPostbackData('quote.list.to', userId)), flex: 1 },
          ] },
          ...(hasMore && nextCursor ? [createMessageActionButton(t('nextPage', language), `QUOTE LIST CURSOR ${nextCursor}${dateQuery}`, 'secondary', BRAND.tealTint)] : []),
          createMessageActionButton(t('home', language), 'NAV HOME', 'secondary', BRAND.goldTint),
        ],
      },
    },
  };
};
