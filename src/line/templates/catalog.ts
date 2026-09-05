import { messagingApi } from '@line/bot-sdk';
import { BRAND, createMessageActionButton, createTapRow, formatMoney, truncate, type ReportLanguage } from './shared';

/**
 * PRODUCT FIND <query> shown when the search matched more than one
 * product — previously the handler silently acted on whichever row Odoo
 * happened to return first with no indication others matched. Tapping a
 * row re-issues PRODUCT FIND with that exact name, which always resolves
 * to a single match.
 */
export const createProductPickerFlexMessage = (
  products: { name: string; price?: number }[],
  language: ReportLanguage,
): messagingApi.FlexMessage => ({
  type: 'flex',
  altText: language === 'en' ? `${products.length} products found` : `พบสินค้า ${products.length} รายการ`,
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
        { type: 'text', text: language === 'en' ? 'Multiple products matched' : 'พบสินค้าหลายรายการ', weight: 'bold', size: 'md', color: '#FFFFFF', wrap: true },
        { type: 'text', text: language === 'en' ? 'Tap the one you meant' : 'แตะเลือกสินค้าที่ต้องการ', size: 'xs', color: '#DDEBE9', margin: 'xs', wrap: true },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: products.map(product => createTapRow(
        product.price !== undefined ? `${product.name} — ${formatMoney(product.price, language)}` : product.name,
        `PRODUCT FIND ${product.name}`,
        BRAND.tealTint,
        BRAND.tealStrong,
      )),
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [createMessageActionButton(language === 'en' ? 'Home' : 'หน้าหลัก', 'NAV HOME', 'secondary', BRAND.goldTint)],
    },
  },
});

export const createProductCardFlexMessage = (productName: string, price: number, stock: number, language: ReportLanguage): messagingApi.FlexMessage => {
  return {
    type: 'flex',
    altText: truncate(language === 'en' ? `Product: ${productName}` : `สินค้า: ${productName}`, 390),
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
          { type: 'text', text: language === 'en' ? 'Product detail' : 'รายละเอียดสินค้า', color: '#FFFFFF', weight: 'bold', size: 'md', wrap: true },
          { type: 'text', text: language === 'en' ? 'Review and choose the next action' : 'ตรวจสอบข้อมูลแล้วเลือกขั้นตอนต่อไป', color: '#DDEBE9', size: 'xs', margin: 'xs', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: productName, weight: 'bold', size: 'xl', color: BRAND.ink, wrap: true },
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              {
                type: 'box',
                layout: 'vertical',
                flex: 1,
                backgroundColor: BRAND.tealTint,
                cornerRadius: BRAND.radius,
                paddingAll: 'sm',
                contents: [
                  { type: 'text', text: language === 'en' ? 'Price' : 'ราคา', size: 'xs', color: BRAND.inkSoft },
                  { type: 'text', text: formatMoney(price, language), size: 'sm', color: BRAND.tealStrong, weight: 'bold', wrap: true },
                ],
              },
              {
                type: 'box',
                layout: 'vertical',
                flex: 1,
                backgroundColor: BRAND.goldTint,
                cornerRadius: BRAND.radius,
                paddingAll: 'sm',
                contents: [
                  { type: 'text', text: language === 'en' ? 'Stock' : 'คงเหลือ', size: 'xs', color: BRAND.inkSoft },
                  { type: 'text', text: String(stock), size: 'sm', color: BRAND.ink, weight: 'bold', wrap: true },
                ],
              },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          createMessageActionButton(language === 'en' ? 'Create quote' : 'สร้างใบเสนอราคา', 'FORM QUOTE CREATE', 'primary', BRAND.teal),
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'xs',
            contents: [
              { ...createMessageActionButton(language === 'en' ? 'Search again' : 'ค้นหาอีกครั้ง', 'FORM PRODUCT FIND', 'secondary', BRAND.tealTint), flex: 1 },
              { ...createMessageActionButton(language === 'en' ? 'Home' : 'หน้าหลัก', 'NAV HOME', 'secondary', BRAND.goldTint), flex: 1 },
            ],
          },
        ],
      },
    },
  };
};

export const createOrderSummaryFlexMessage = (total: number, language: ReportLanguage): messagingApi.FlexMessage => {
  return {
    type: 'flex',
    altText: language === 'en' ? 'Order summary' : 'สรุปคำสั่งซื้อ',
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
          { type: 'text', text: language === 'en' ? 'Quotation created' : 'สร้างใบเสนอราคาแล้ว', weight: 'bold', size: 'md', color: '#FFFFFF', wrap: true },
          { type: 'text', text: language === 'en' ? 'Summary and next steps' : 'สรุปและขั้นตอนถัดไป', size: 'xs', color: '#DDEBE9', margin: 'xs', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: BRAND.tealTint,
            cornerRadius: BRAND.radius,
            paddingAll: 'md',
            contents: [
              { type: 'text', text: language === 'en' ? 'Total' : 'ยอดรวม', size: 'xs', color: BRAND.inkSoft },
              { type: 'text', text: formatMoney(total, language), size: 'xl', color: BRAND.tealStrong, weight: 'bold', wrap: true },
            ],
          },
          { type: 'text', text: language === 'en' ? 'Please follow your payment workflow.' : 'กรุณาชำระเงินตามขั้นตอนที่ร้านกำหนด', size: 'sm', wrap: true, color: BRAND.inkSoft },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          createMessageActionButton(language === 'en' ? 'Check order' : 'เช็คออเดอร์', 'FORM ORDER STATUS', 'primary', BRAND.teal),
          createMessageActionButton(language === 'en' ? 'Home' : 'หน้าหลัก', 'NAV HOME', 'secondary', BRAND.goldTint),
        ],
      },
    },
  };
};
