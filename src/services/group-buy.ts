import {
  attachGroupBuyOdooOrder,
  cancelGroupBuy,
  confirmGroupBuy,
  createGroupBuy,
  getGroupBuyById,
  getUserProfile,
  GroupBuyRecord,
  joinGroupBuy,
  listGroupBuysByCreator,
  recordAuditEvent,
  UserLanguage,
} from './firestore';
import { createQuotationFromLine } from './odoo/sales';
import { findProductByQuery } from './odoo/catalog';

const DEFAULT_GROUPBUY_HOURS = Number(process.env.GROUPBUY_DEFAULT_HOURS || 24);
const MAX_GROUPBUY_HOURS = 24 * 90;

type GroupBuyCommand =
  | { type: 'start'; productQuery: string; targetQty: number; hours: number }
  | { type: 'join'; groupBuyId: string; qty: number }
  | { type: 'status'; groupBuyId?: string }
  | { type: 'confirm'; groupBuyId: string }
  | { type: 'cancel'; groupBuyId: string };

export const parseGroupBuyCommand = (text: string): GroupBuyCommand | null => {
  const trimmed = text.trim();
  const upper = trimmed.toUpperCase();

  if (upper.startsWith('START GROUPBUY')) {
    const payload = trimmed.replace(/^START GROUPBUY\s*/i, '').trim();
    const parts = payload.split(',').map(p => p.trim());
    if (parts.length < 2) return null;

    // Format: <product>,<targetQty>[,<hours>] — hours defaults when omitted
    // so existing two-field usages keep working unchanged.
    const hasHours = parts.length >= 3;
    const targetQtyRaw = hasHours ? parts[parts.length - 2] : parts[parts.length - 1];
    const productQuery = (hasHours ? parts.slice(0, parts.length - 2) : parts.slice(0, parts.length - 1)).join(',').trim();
    const targetQty = Number(targetQtyRaw);
    if (!productQuery || !Number.isInteger(targetQty) || targetQty < 2 || targetQty > 10000) return null;

    const hours = hasHours ? Number(parts[parts.length - 1]) : DEFAULT_GROUPBUY_HOURS;
    if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_GROUPBUY_HOURS) return null;

    return { type: 'start', productQuery, targetQty, hours };
  }

  if (upper.startsWith('JOIN GROUPBUY')) {
    const payload = trimmed.replace(/^JOIN GROUPBUY\s*/i, '').trim();
    const [idRaw, qtyRaw] = payload.split(',').map(v => v.trim());
    const groupBuyId = idRaw || '';
    const qty = qtyRaw ? Number(qtyRaw) : 1;
    if (!groupBuyId || !Number.isInteger(qty) || qty < 1 || qty > 1000) return null;

    return { type: 'join', groupBuyId, qty };
  }

  if (upper.startsWith('STATUS GROUPBUY')) {
    const payload = trimmed.replace(/^STATUS GROUPBUY\s*/i, '').trim();
    return payload ? { type: 'status', groupBuyId: payload } : { type: 'status' };
  }

  if (upper.startsWith('CONFIRM GROUPBUY')) {
    const groupBuyId = trimmed.replace(/^CONFIRM GROUPBUY\s*/i, '').trim();
    if (!groupBuyId) return null;
    return { type: 'confirm', groupBuyId };
  }

  if (upper.startsWith('CANCEL GROUPBUY')) {
    const groupBuyId = trimmed.replace(/^CANCEL GROUPBUY\s*/i, '').trim();
    if (!groupBuyId) return null;
    return { type: 'cancel', groupBuyId };
  }

  return null;
};

type HandleGroupBuyInput = {
  text: string;
  userId: string;
  userLanguage: UserLanguage;
  isAdmin: boolean;
  agentName: string;
};

const tr = (language: UserLanguage, th: string, en: string): string => (language === 'en' ? en : th);

const describeGroupBuy = (language: UserLanguage, record: GroupBuyRecord): string => {
  const title = tr(language, 'สถานะ Group-Buy', 'Group-Buy status');
  const targetReached = record.joinedQty >= record.targetQty;
  const progress = `${record.joinedQty}/${record.targetQty}`;
  const product = record.productName || record.productQuery;
  const expiryLine = record.expiresAt
    ? tr(language, `\n- หมดเวลา: ${record.expiresAt}`, `\n- Expires: ${record.expiresAt}`)
    : '';
  const odooLine = record.odooOrderRef
    ? tr(language, `\n- ใบสั่งซื้อ Odoo: ${record.odooOrderRef}`, `\n- Odoo order: ${record.odooOrderRef}`)
    : '';

  if (language === 'en') {
    return `${title}\n- ID: ${record.id}\n- Product: ${product}\n- Status: ${record.status}\n- Progress: ${progress}\n- Participants: ${record.participantCount}${targetReached ? '\n- Target reached: yes' : ''}${expiryLine}${odooLine}`;
  }

  return `${title}\n- ID: ${record.id}\n- สินค้า: ${product}\n- สถานะ: ${record.status}\n- ความคืบหน้า: ${progress}\n- จำนวนผู้ร่วม: ${record.participantCount}${targetReached ? '\n- ถึงเป้าหมายแล้ว: ใช่' : ''}${expiryLine}${odooLine}`;
};

export const handleGroupBuyCommand = async (input: HandleGroupBuyInput): Promise<string> => {
  const parsed = parseGroupBuyCommand(input.text);
  if (!parsed) {
    return tr(
      input.userLanguage,
      `${input.agentName} วิธีใช้ Group-Buy\n- START GROUPBUY <สินค้า>,<เป้าหมายจำนวนรวม>,<ชั่วโมง?>\n- JOIN GROUPBUY <groupbuy_id>,<จำนวน?>\n- STATUS GROUPBUY <groupbuy_id?>\n- CONFIRM GROUPBUY <groupbuy_id>\n- CANCEL GROUPBUY <groupbuy_id>`,
      `${input.agentName} Group-Buy usage\n- START GROUPBUY <product>,<target_total_qty>,<hours?>\n- JOIN GROUPBUY <groupbuy_id>,<qty?>\n- STATUS GROUPBUY <groupbuy_id?>\n- CONFIRM GROUPBUY <groupbuy_id>\n- CANCEL GROUPBUY <groupbuy_id>`
    );
  }

  if (parsed.type === 'start') {
    const product = await findProductByQuery(parsed.productQuery);
    const created = await createGroupBuy({
      creatorUserId: input.userId,
      productQuery: parsed.productQuery,
      targetQty: parsed.targetQty,
      productName: product?.name,
      productId: product?.id,
      expiresInHours: parsed.hours,
    });

    if (!created.ok || !created.data) {
      return tr(
        input.userLanguage,
        `${input.agentName} สร้าง Group-Buy ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง`,
        `${input.agentName} failed to create Group-Buy. Please try again.`
      );
    }

    const expiryNote = created.data.expiresAt
      ? tr(input.userLanguage, `\n- หมดเวลา: ${created.data.expiresAt}`, `\n- Expires: ${created.data.expiresAt}`)
      : '';

    return tr(
      input.userLanguage,
      `${input.agentName} สร้าง Group-Buy แล้ว\n- ID: ${created.data.id}\n- สินค้า: ${created.data.productName || created.data.productQuery}\n- เป้าหมาย: ${created.data.targetQty}${expiryNote}\n- เข้าร่วมด้วย: JOIN GROUPBUY ${created.data.id},1`,
      `${input.agentName} created Group-Buy\n- ID: ${created.data.id}\n- Product: ${created.data.productName || created.data.productQuery}\n- Target: ${created.data.targetQty}${expiryNote}\n- Join with: JOIN GROUPBUY ${created.data.id},1`
    );
  }

  if (parsed.type === 'join') {
    const current = await getGroupBuyById(parsed.groupBuyId);
    if (!current) {
      return tr(input.userLanguage, `${input.agentName} ไม่พบ Group-Buy ID ${parsed.groupBuyId}`, `${input.agentName} cannot find Group-Buy ID ${parsed.groupBuyId}`);
    }

    if (current.status !== 'open') {
      return tr(
        input.userLanguage,
        `${input.agentName} Group-Buy นี้ปิดแล้ว (สถานะ: ${current.status})`,
        `${input.agentName} this Group-Buy is closed (status: ${current.status}).`
      );
    }

    const joined = await joinGroupBuy({ groupBuyId: parsed.groupBuyId, userId: input.userId, qty: parsed.qty });
    if (!joined.ok || !joined.data) {
      return tr(input.userLanguage, `${input.agentName} เข้าร่วม Group-Buy ไม่สำเร็จ กรุณาลองใหม่`, `${input.agentName} failed to join Group-Buy. Please try again.`);
    }

    const reached = joined.data.joinedQty >= joined.data.targetQty;
    return tr(
      input.userLanguage,
      `${input.agentName} เข้าร่วม Group-Buy สำเร็จ\n- ID: ${joined.data.id}\n- จำนวนที่คุณร่วม: ${joined.joinedQtyByUser || parsed.qty}\n- ความคืบหน้า: ${joined.data.joinedQty}/${joined.data.targetQty}${reached ? '\n- ถึงเป้าหมายแล้ว: ใช่ (รอ CONFIRM GROUPBUY)' : ''}`,
      `${input.agentName} joined Group-Buy successfully\n- ID: ${joined.data.id}\n- Your total qty: ${joined.joinedQtyByUser || parsed.qty}\n- Progress: ${joined.data.joinedQty}/${joined.data.targetQty}${reached ? '\n- Target reached: yes (awaiting CONFIRM GROUPBUY)' : ''}`
    );
  }

  if (parsed.type === 'status') {
    if (parsed.groupBuyId) {
      const record = await getGroupBuyById(parsed.groupBuyId);
      if (!record) {
        return tr(input.userLanguage, `${input.agentName} ไม่พบ Group-Buy ID ${parsed.groupBuyId}`, `${input.agentName} cannot find Group-Buy ID ${parsed.groupBuyId}`);
      }
      return describeGroupBuy(input.userLanguage, record);
    }

    const recent = await listGroupBuysByCreator(input.userId, 5);
    if (!recent.length) {
      return tr(
        input.userLanguage,
        `${input.agentName} ยังไม่พบ Group-Buy ที่คุณสร้าง\nเริ่มด้วย: START GROUPBUY <สินค้า>,<เป้าหมาย>`,
        `${input.agentName} no Group-Buy found for your account yet\nStart with: START GROUPBUY <product>,<target>`
      );
    }

    return tr(
      input.userLanguage,
      `${input.agentName} Group-Buy ล่าสุด\n${recent.map(r => `- ${r.id} | ${r.productName || r.productQuery} | ${r.joinedQty}/${r.targetQty} | ${r.status}`).join('\n')}`,
      `${input.agentName} latest Group-Buy records\n${recent.map(r => `- ${r.id} | ${r.productName || r.productQuery} | ${r.joinedQty}/${r.targetQty} | ${r.status}`).join('\n')}`
    );
  }

  if (parsed.type === 'confirm') {
    const confirmed = await confirmGroupBuy(parsed.groupBuyId, input.userId, input.isAdmin);
    if (!confirmed.ok || !confirmed.data) {
      if ((confirmed.error || '').includes('groupbuy_forbidden')) {
        return tr(input.userLanguage, `${input.agentName} เฉพาะผู้สร้างหรือแอดมินเท่านั้นที่ยืนยัน Group-Buy ได้`, `${input.agentName} only the creator or admin can confirm this Group-Buy.`);
      }
      return tr(input.userLanguage, `${input.agentName} ยืนยัน Group-Buy ไม่สำเร็จ`, `${input.agentName} failed to confirm Group-Buy.`);
    }

    let record = confirmed.data;
    let odooNote = '';

    if (!record.odooOrderRef) {
      // Realize the confirmed session as a real Odoo quotation, billed to the
      // organizer's verified partner when known — never to a fabricated
      // phone number built from their LINE id.
      const organizerProfile = await getUserProfile(record.creatorUserId);
      const partnerName = organizerProfile.displayName || `Group-Buy Organizer ${record.id.slice(-6)}`;
      const productRef = record.productName || record.productQuery;

      try {
        const quotation = await createQuotationFromLine(
          partnerName,
          organizerProfile.phone || '',
          productRef,
          record.joinedQty,
          organizerProfile.odooPartnerId
        );

        if (quotation) {
          await attachGroupBuyOdooOrder(record.id, { odooOrderRef: quotation.orderName, odooOrderTotal: quotation.total });
          record = { ...record, odooOrderRef: quotation.orderName, odooOrderTotal: quotation.total };
          recordAuditEvent({ action: 'group_buy_odoo_order_create', outcome: 'success', actorUserId: input.userId, targetId: record.id, detail: quotation.orderName });
        } else {
          recordAuditEvent({ action: 'group_buy_odoo_order_create', outcome: 'failure', actorUserId: input.userId, targetId: record.id, detail: 'product_not_found' });
          odooNote = tr(
            input.userLanguage,
            '\n- คำเตือน: สร้างใบสั่งซื้อ Odoo อัตโนมัติไม่สำเร็จ (ไม่พบสินค้าใน Odoo) กรุณาสร้างด้วยตนเอง',
            '\n- Warning: automatic Odoo order creation failed (product not found in Odoo). Please create it manually.'
          );
        }
      } catch (error) {
        console.warn('Group-Buy Odoo order creation failed:', error);
        recordAuditEvent({ action: 'group_buy_odoo_order_create', outcome: 'failure', actorUserId: input.userId, targetId: record.id, detail: 'exception' });
        odooNote = tr(
          input.userLanguage,
          '\n- คำเตือน: สร้างใบสั่งซื้อ Odoo อัตโนมัติไม่สำเร็จ กรุณาสร้างด้วยตนเอง',
          '\n- Warning: automatic Odoo order creation failed. Please create it manually.'
        );
      }
    }

    return tr(
      input.userLanguage,
      `${input.agentName} ยืนยัน Group-Buy สำเร็จ\n${describeGroupBuy(input.userLanguage, record)}${odooNote}`,
      `${input.agentName} confirmed Group-Buy\n${describeGroupBuy(input.userLanguage, record)}${odooNote}`
    );
  }

  const cancelled = await cancelGroupBuy(parsed.groupBuyId, input.userId, input.isAdmin);
  if (!cancelled.ok || !cancelled.data) {
    if ((cancelled.error || '').includes('groupbuy_forbidden')) {
      return tr(input.userLanguage, `${input.agentName} เฉพาะผู้สร้างหรือแอดมินเท่านั้นที่ยกเลิก Group-Buy ได้`, `${input.agentName} only the creator or admin can cancel this Group-Buy.`);
    }
    return tr(input.userLanguage, `${input.agentName} ยกเลิก Group-Buy ไม่สำเร็จ`, `${input.agentName} failed to cancel Group-Buy.`);
  }

  return tr(
    input.userLanguage,
    `${input.agentName} ยกเลิก Group-Buy แล้ว\n${describeGroupBuy(input.userLanguage, cancelled.data)}`,
    `${input.agentName} cancelled Group-Buy\n${describeGroupBuy(input.userLanguage, cancelled.data)}`
  );
};
