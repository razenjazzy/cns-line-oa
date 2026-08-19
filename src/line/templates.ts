import { messagingApi } from '@line/bot-sdk';

type ReportLanguage = 'th' | 'en';

export const createDailyReportFlexMessage = (reportData: any, insights: string, language: ReportLanguage = 'th'): messagingApi.FlexMessage => {
  const agentName = process.env.LINE_AGENT_NAME?.trim() || 'น้องโซระ';
  const rows = (() => {
    try {
      const parsed = JSON.parse(String(reportData)) as Array<{ product?: string; salesYesterday?: number; revenueYesterday?: number; stock?: number }>;
      return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
    } catch {
      return [];
    }
  })();

  return {
    type: 'flex',
    altText: language === 'en' ? 'Daily sales and inventory report' : 'สรุปรายงานยอดขายและสต็อกประจำวัน',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: language === 'en' ? `Daily report by ${agentName}` : `รายงานประจำวันโดย ${agentName}`, weight: 'bold', size: 'md', color: '#1DB446', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: insights, wrap: true, size: 'sm' },
          ...(rows.length ? [{ type: 'separator', margin: 'md' } as const] : []),
          ...rows.flatMap(row => ([
            { type: 'text', text: row.product || '-', weight: 'bold', size: 'sm', margin: 'md', wrap: true } as const,
            { type: 'text', text: language === 'en'
              ? `Sales ${Number(row.salesYesterday || 0).toFixed(0)} | Revenue ${Number(row.revenueYesterday || 0).toFixed(2)} THB | Stock ${Number(row.stock || 0).toFixed(0)}`
              : `ขาย ${Number(row.salesYesterday || 0).toFixed(0)} | รายได้ ${Number(row.revenueYesterday || 0).toFixed(2)} บาท | คงเหลือ ${Number(row.stock || 0).toFixed(0)}`,
              size: 'xs', color: '#666666', wrap: true } as const,
          ])),
        ],
      },
    },
  };
};

export const createProductCardFlexMessage = (productName: string, price: number, stock: number): messagingApi.FlexMessage => {
  const language = (process.env.DEFAULT_UI_LANGUAGE || 'th').toLowerCase() === 'en' ? 'en' : 'th';
    return {
        type: 'flex',
  altText: language === 'en' ? `Product: ${productName}` : `สินค้า: ${productName}`,
        contents: {
            type: 'bubble',
      styles: {
        header: { backgroundColor: '#0F766E' },
        body: { backgroundColor: '#F8FAFC' },
        footer: { backgroundColor: '#F8FAFC' }
      },
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: language === 'en' ? 'Product Detail' : 'รายละเอียดสินค้า', color: '#FFFFFF', weight: 'bold', size: 'sm' }
        ]
      },
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    { type: 'text', text: productName, weight: 'bold', size: 'xl' },
      { type: 'text', text: language === 'en' ? `Price: ${price} THB` : `ราคา: ${price} บาท`, size: 'md', margin: 'md' },
      { type: 'text', text: language === 'en' ? `Stock: ${stock}` : `คงเหลือ: ${stock}`, size: 'sm', color: '#334155', margin: 'sm' },
                ],
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'button',
                        style: 'primary',
            color: '#0F766E',
      action: { type: 'message', label: language === 'en' ? 'Create Quote' : 'สร้างใบเสนอราคา', text: `DEMO QUOTE ${productName},1,LINE Customer,0900000000` }
                    }
                ]
            }
        }
    };
};

export const createServiceHomeFlexMessage = (
  services: { key: string; label: string }[],
  language: ReportLanguage,
  agentName: string
): messagingApi.FlexMessage => {
  return {
    type: 'flex',
    altText: language === 'en' ? `${agentName} services menu` : `เมนูบริการของ ${agentName}`,
    contents: {
      type: 'carousel',
      contents: services.slice(0, 10).map(service => ({
        type: 'bubble',
        size: 'micro',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: service.label, weight: 'bold', size: 'md', wrap: true },
          ],
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              style: 'primary',
              color: '#0F766E',
              action: { type: 'message', label: language === 'en' ? 'Open' : 'เปิด', text: `NAV ${service.key}` },
            },
          ],
        },
      })),
    },
  };
};

export const createServiceActionFlexMessage = (
  serviceLabel: string,
  actions: { text: string; label: string }[],
  language: ReportLanguage
): messagingApi.FlexMessage => {
  return {
    type: 'flex',
    altText: serviceLabel,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: serviceLabel, weight: 'bold', size: 'md', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: actions.slice(0, 10).map(action => ({
          type: 'button',
          style: 'secondary',
          action: { type: 'message', label: action.label, text: action.text },
        })),
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            style: 'link',
            action: { type: 'message', label: language === 'en' ? 'Home' : 'หน้าหลัก', text: 'NAV HOME' },
          },
        ],
      },
    },
  };
};

export const createOrderSummaryFlexMessage = (total: number): messagingApi.FlexMessage => {
  const language = (process.env.DEFAULT_UI_LANGUAGE || 'th').toLowerCase() === 'en' ? 'en' : 'th';
    return {
        type: 'flex',
  altText: language === 'en' ? 'Order summary' : 'สรุปคำสั่งซื้อ',
        contents: {
            type: 'bubble',
      styles: {
        body: { backgroundColor: '#F0FDF4' }
      },
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
      { type: 'text', text: language === 'en' ? 'Quotation Created' : 'สร้างคำสั่งซื้อแล้ว', weight: 'bold', size: 'lg', color: '#15803D' },
      { type: 'text', text: language === 'en' ? `Total: ${total} THB` : `ยอดรวม: ${total} บาท`, size: 'md', margin: 'md' },
      { type: 'text', text: language === 'en' ? 'Please follow your payment workflow.' : 'กรุณาชำระเงินตามขั้นตอนที่ร้านกำหนด', size: 'sm', wrap: true, margin: 'sm' },
                ]
            }
        }
    }
}
