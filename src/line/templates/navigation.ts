import { messagingApi } from '@line/bot-sdk';
import { t } from '../../services/i18n';
import { BRAND, buttonLabel, createMessageActionButton, createTapRow, truncate, type ReportLanguage } from './shared';
import { getBrandTitle } from '../channels';

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
  agentName: string,
  highlightVerify = false,
): messagingApi.FlexMessage => {
  return {
    type: 'flex',
    altText: language === 'en' ? `${getBrandTitle('en')} menu` : `เมนู ${getBrandTitle('th')}`,
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
        { type: 'text', text: language === 'en' ? getBrandTitle('en') : getBrandTitle('th'), weight: 'bold', size: 'md', color: '#FFFFFF', wrap: true },
          { type: 'text', text: t('tapService', language), size: 'xs', color: '#DDEBE9', margin: 'xs', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingBottom: 'lg',
        contents: services.slice(0, 10).map(service => {
          const active = highlightVerify && service.key === 'VERIFY';
          return createTapRow(
            `${SERVICE_ICON[service.key] || ''} ${service.label}`.trim(),
            `NAV ${service.key}`,
            active ? BRAND.gold : !highlightVerify ? BRAND.teal : BRAND.tealTint,
            active || !highlightVerify ? '#FFFFFF' : BRAND.tealStrong,
            'lg',
          );
        }),
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'md',
        contents: [
          { ...createTapRow(`🌐 ${t('languageToggle', language)}`, language === 'en' ? 'LANG TH' : 'LANG EN', BRAND.tealTint, BRAND.tealStrong, 'lg'), flex: 1 },
          { ...createTapRow(`📖 ${t('guide', language)}`, 'GUIDE', BRAND.tealTint, BRAND.tealStrong, 'lg'), flex: 1 },
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
          { type: 'text', text: t('chooseAction', language), size: 'xs', color: '#DDEBE9', margin: 'xs', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingBottom: 'lg',
        contents: actions.slice(0, 10).map(action => createTapRow(action.label, action.text, BRAND.teal, '#FFFFFF', 'lg')),
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          createTapRow(`🏠 ${t('home', language)}`, 'NAV HOME', BRAND.goldTint, BRAND.tealStrong, 'lg'),
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
      type: 'box', layout: 'vertical', contents: [createMessageActionButton(t('back', language), 'NAV HOME', 'secondary', BRAND.goldTint)],
    },
  },
});
