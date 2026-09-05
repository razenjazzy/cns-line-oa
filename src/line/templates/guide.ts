import { messagingApi } from '@line/bot-sdk';
import { BRAND, buttonLabel, createMessageActionButton, createPrefillButton, truncate, type ReportLanguage } from './shared';
import { SERVICE_ICON } from './navigation';
import {
  GUIDE_CATEGORY_LABELS,
  GUIDE_CATEGORY_NOTES,
  GUIDE_CATEGORY_ORDER,
  getCommandsForCategory,
  type CommandCategoryKey,
} from '../command-guide';

const CATEGORY_ICON: Record<CommandCategoryKey, string> = {
  basics: '🏠',
  admin: '⚙️',
  account: '🙋',
  commerce: SERVICE_ICON.commerce,
  directory: SERVICE_ICON.directory,
  catalog: SERVICE_ICON.catalog,
  reporting: SERVICE_ICON.reporting,
  groupBuy: SERVICE_ICON.groupBuy,
};

/**
 * Top-level GUIDE menu — replaces the old single plain-text wall (11
 * numbered sections crammed into one bubble) with a tappable category
 * list, "smart IVR"-style. Each button sends `GUIDE <category>`, which
 * createGuideCategoryFlexMessage below renders as a drill-down card.
 */
export const createGuideCategoriesFlexMessage = (language: ReportLanguage, agentName: string): messagingApi.FlexMessage => ({
  type: 'flex',
  altText: language === 'en' ? `${agentName} guide` : `คู่มือ ${agentName}`,
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
        { type: 'text', text: language === 'en' ? `${agentName} guide` : `คู่มือ ${agentName}`, weight: 'bold', size: 'md', color: '#FFFFFF', wrap: true },
        { type: 'text', text: language === 'en' ? 'Tap a topic to see its commands' : 'แตะหัวข้อเพื่อดูคำสั่ง', size: 'xs', color: '#DDEBE9', margin: 'xs', wrap: true },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: GUIDE_CATEGORY_ORDER.map(category => ({
        type: 'button',
        style: 'primary',
        height: 'md',
        color: BRAND.teal,
        action: {
          type: 'message',
          label: buttonLabel(`${CATEGORY_ICON[category]} ${GUIDE_CATEGORY_LABELS[category][language]}`),
          text: `GUIDE ${category}`,
        },
      })),
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [createMessageActionButton(language === 'en' ? 'Home' : 'หน้าหลัก', 'NAV HOME', 'secondary', BRAND.goldTint)],
    },
  },
});

/**
 * One guide category's commands as prefill buttons — tapping opens the
 * keyboard with the real example pre-filled (editable before sending),
 * rather than either a fixed message action (wrong for commands that need
 * real values) or plain unstructured text.
 */
export const createGuideCategoryFlexMessage = (category: CommandCategoryKey, language: ReportLanguage, agentName: string): messagingApi.FlexMessage => {
  const label = GUIDE_CATEGORY_LABELS[category][language];
  const commands = getCommandsForCategory(category);
  const note = GUIDE_CATEGORY_NOTES[category]?.[language];

  return {
    type: 'flex',
    altText: truncate(`${agentName} guide — ${label}`, 390),
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
          { type: 'text', text: `${CATEGORY_ICON[category]} ${label}`, weight: 'bold', size: 'md', color: '#FFFFFF', wrap: true },
          { type: 'text', text: language === 'en' ? 'Tap to fill in, edit, then send' : 'แตะเพื่อกรอก แก้ไข แล้วส่งได้เลย', size: 'xs', color: '#DDEBE9', margin: 'xs', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          ...(note ? [{ type: 'text' as const, text: note, size: 'xs' as const, color: BRAND.inkSoft, wrap: true, margin: 'md' as const }] : []),
          ...commands.map(cmd => createPrefillButton(cmd.key, cmd.example, 'secondary', BRAND.tealTint)),
        ],
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          { ...createMessageActionButton(language === 'en' ? 'Back' : 'ย้อนกลับ', 'GUIDE', 'secondary', BRAND.goldTint), flex: 1 },
          { ...createMessageActionButton(language === 'en' ? 'Home' : 'หน้าหลัก', 'NAV HOME', 'secondary', BRAND.goldTint), flex: 1 },
        ],
      },
    },
  };
};
