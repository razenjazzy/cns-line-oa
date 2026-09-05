import { messagingApi } from '@line/bot-sdk';
import { BRAND, buttonLabel, createMessageActionButton, truncate, type ReportLanguage } from './shared';

export const SERVICE_ICON: Record<string, string> = {
  VERIFY: '🔐',
  commerce: '🛍️',
  directory: '👥',
  catalog: '📦',
  reporting: '📊',
  groupBuy: '🤝',
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
          { type: 'text', text: language === 'en' ? `${agentName} menu` : `เมนู ${agentName}`, weight: 'bold', size: 'md', color: '#FFFFFF', wrap: true },
          { type: 'text', text: language === 'en' ? 'Tap a service to continue' : 'เลือกบริการเพื่อเริ่มใช้งาน', size: 'xs', color: '#DDEBE9', margin: 'xs', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: services.slice(0, 10).map(service => ({
          type: 'button',
          style: 'primary',
          height: 'md',
          color: BRAND.teal,
          action: {
            type: 'message',
            label: buttonLabel(`${SERVICE_ICON[service.key] || ''} ${service.label}`.trim()),
            text: `NAV ${service.key}`,
          },
        })),
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'secondary',
            height: 'md',
            flex: 1,
            color: BRAND.tealTint,
            action: { type: 'message', label: language === 'en' ? 'Language' : 'ภาษา', text: language === 'en' ? 'LANG TH' : 'LANG EN' },
          },
          {
            type: 'button',
            style: 'secondary',
            height: 'md',
            flex: 1,
            color: BRAND.tealTint,
            action: { type: 'message', label: language === 'en' ? 'Guide' : 'คู่มือ', text: 'GUIDE' },
          },
        ],
      },
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
    altText: truncate(serviceLabel, 390),
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
          { type: 'text', text: serviceLabel, weight: 'bold', size: 'md', wrap: true, color: '#FFFFFF' },
          { type: 'text', text: language === 'en' ? 'Choose one action' : 'เลือกสิ่งที่ต้องการทำ', size: 'xs', color: '#DDEBE9', margin: 'xs', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: actions.slice(0, 10).map(action => ({
          ...createMessageActionButton(action.label, action.text, 'primary', BRAND.teal),
        })),
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            ...createMessageActionButton(language === 'en' ? 'Home' : 'หน้าหลัก', 'NAV HOME', 'primary', BRAND.gold),
          },
        ],
      },
    },
  };
};

export const createAdminConfigFlexMessage = (
  channelId: string,
  services: { key: string; label: string; enabled: boolean; nextCommand: string }[],
  language: ReportLanguage,
): messagingApi.FlexMessage => ({
  type: 'flex',
  altText: language === 'en' ? `Service configuration: ${channelId}` : `ตั้งค่าบริการ: ${channelId}`,
  contents: {
    type: 'bubble',
    styles: { header: { backgroundColor: BRAND.teal }, body: { backgroundColor: BRAND.surface }, footer: { backgroundColor: BRAND.surface } },
    header: {
      type: 'box', layout: 'vertical', paddingAll: 'md',
      contents: [
        { type: 'text', text: language === 'en' ? 'Service configuration' : 'ตั้งค่าบริการ', color: '#FFFFFF', weight: 'bold', size: 'md' },
        { type: 'text', text: channelId, color: '#DDEBE9', size: 'xs', margin: 'xs' },
      ],
    },
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm',
      contents: services.map(service => ({
        type: 'button', style: service.enabled ? 'primary' : 'secondary', height: 'md', color: service.enabled ? BRAND.teal : BRAND.goldTint,
        action: { type: 'message', label: buttonLabel(`${service.enabled ? 'ON' : 'OFF'} ${service.label}`), text: service.nextCommand },
      })),
    },
    footer: {
      type: 'box', layout: 'vertical', contents: [createMessageActionButton(language === 'en' ? 'Back' : 'ย้อนกลับ', 'NAV HOME', 'secondary', BRAND.gold)],
    },
  },
});
