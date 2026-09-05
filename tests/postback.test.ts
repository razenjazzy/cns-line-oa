import { describe, expect, it, vi } from 'vitest';
import { bindPostbackData, resolvePostbackToText } from '../src/line/postback';

const userId = 'Uabc';

describe('resolvePostbackToText', () => {
  it('maps allowlisted date pickers to ISO dates or list commands', () => {
    expect(resolvePostbackToText(bindPostbackData('form.date.validityDate', userId), '2026-09-05', userId)).toBe('2026-09-05');
    expect(resolvePostbackToText(bindPostbackData('quote.list.from', userId), '2026-01-01', userId)).toBe('QUOTE LIST FROM 2026-01-01');
    expect(resolvePostbackToText(bindPostbackData('quote.list.to', userId), '2026-12-31', userId)).toBe('QUOTE LIST TO 2026-12-31');
  });

  it('ignores mutation commands, unbound data, and other users', () => {
    expect(resolvePostbackToText('QUOTE CONFIRM 17', '2026-09-05', userId)).toBeNull();
    expect(resolvePostbackToText('form.date.validityDate', '2026-09-05', userId)).toBeNull();
    expect(resolvePostbackToText(bindPostbackData('form.date.validityDate', userId), 'not-a-date', userId)).toBeNull();
    expect(resolvePostbackToText(bindPostbackData('form.date.validityDate', 'Uother'), '2026-09-05', userId)).toBeNull();
    expect(resolvePostbackToText(bindPostbackData('action=prefill&text=QUOTE%20ADD', userId), '2026-09-05', userId)).toBeNull();
  });

  it('rejects expired postbacks', () => {
    const data = bindPostbackData('form.date.validityDate', userId);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 16 * 60 * 1000);
    expect(resolvePostbackToText(data, '2026-09-05', userId)).toBeNull();
    vi.useRealTimers();
  });
});
