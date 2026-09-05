import { describe, expect, it } from 'vitest';
import {
  GUIDE_CATEGORY_ORDER,
  buildCommandKeywordGuidance,
  getCommandsForCategory,
  isGuideCommand,
  parseGuideCategoryKey,
} from '../src/line/command-guide';

describe('isGuideCommand', () => {
  it('recognizes GUIDE and its aliases, English and Thai', () => {
    expect(isGuideCommand('GUIDE')).toBe(true);
    expect(isGuideCommand('guide')).toBe(true);
    expect(isGuideCommand('STEP BY STEP')).toBe(true);
    expect(isGuideCommand('MENU GUIDE')).toBe(true);
    expect(isGuideCommand('คู่มือ')).toBe(true);
  });

  it('also recognizes GUIDE <category> as a guide-family command', () => {
    expect(isGuideCommand('GUIDE commerce')).toBe(true);
    expect(isGuideCommand('GUIDE admin')).toBe(true);
  });

  it('rejects unrelated commands', () => {
    expect(isGuideCommand('QUOTE CREATE')).toBe(false);
    expect(isGuideCommand('NAV HOME')).toBe(false);
    expect(isGuideCommand('')).toBe(false);
  });
});

describe('parseGuideCategoryKey', () => {
  it('parses every real category key, case-insensitively', () => {
    for (const category of GUIDE_CATEGORY_ORDER) {
      expect(parseGuideCategoryKey(`GUIDE ${category}`)).toBe(category);
      expect(parseGuideCategoryKey(`guide ${category.toUpperCase()}`)).toBe(category);
    }
  });

  it('returns null for bare GUIDE (no category)', () => {
    expect(parseGuideCategoryKey('GUIDE')).toBeNull();
  });

  it('returns null for an unrecognized category token', () => {
    expect(parseGuideCategoryKey('GUIDE nonsense')).toBeNull();
  });

  it('returns null for non-GUIDE text entirely', () => {
    expect(parseGuideCategoryKey('QUOTE CREATE')).toBeNull();
  });
});

describe('getCommandsForCategory', () => {
  it('returns real commands for every category, and never includes the meta GUIDE entry', () => {
    for (const category of GUIDE_CATEGORY_ORDER) {
      const commands = getCommandsForCategory(category);
      expect(commands.length).toBeGreaterThan(0);
      expect(commands.every(c => c.key !== 'GUIDE')).toBe(true);
      // Every command needs a real, directly-usable example for its prefill button.
      expect(commands.every(c => c.example.length > 0)).toBe(true);
    }
  });

  it('scopes commerce to entry-point commands, not the full quote-lifecycle action set', () => {
    const commerce = getCommandsForCategory('commerce').map(c => c.key);
    expect(commerce).toContain('QUOTE CREATE');
    expect(commerce).toContain('PRODUCT FIND');
    // Lifecycle actions are reached from the quotation journey card itself,
    // not listed as separate guide buttons (see GUIDE_CATEGORY_NOTES).
    expect(commerce).not.toContain('QUOTE CANCEL');
    expect(commerce).not.toContain('QUOTE CONFIRM');
  });

  it('includes the HUMAN OFF de-escalation command in account', () => {
    expect(getCommandsForCategory('account').map(c => c.key)).toContain('HUMAN OFF');
  });
});

describe('buildCommandKeywordGuidance', () => {
  it('returns null for an exact, recognized command', () => {
    expect(buildCommandKeywordGuidance('QUOTE CREATE', 'en', 'Sora')).toBeNull();
  });

  it('returns null when nothing is a close enough fuzzy match', () => {
    expect(buildCommandKeywordGuidance('XZQWKVPLBH', 'en', 'Sora')).toBeNull();
  });

  it('suggests a close match for a near-miss single-word command', () => {
    const guidance = buildCommandKeywordGuidance('GUID', 'en', 'Sora');
    expect(guidance).toContain('GUIDE');
  });
});
