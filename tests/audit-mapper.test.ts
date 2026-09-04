import { describe, expect, it } from 'vitest';
import { parseAuditLogEntry } from '../src/services/firestore/audit';

const normalize = (value: unknown): string | undefined => typeof value === 'string' ? value.trim() || undefined : undefined;

describe('audit log mapper', () => {
  it('normalizes persisted audit fields including request correlation', () => {
    expect(parseAuditLogEntry({
      id: 'event-1',
      data: () => ({
        action: ' quote_cancel ',
        outcome: 'success',
        actorUserId: ' U-admin ',
        channelId: ' sales ',
        requestId: ' req-1 ',
        targetId: '42',
        detail: 'command=QUOTE_CANCEL',
        createdAt: '2026-09-04T00:00:00.000Z',
      }),
    }, normalize)).toEqual({
      id: 'event-1',
      action: 'quote_cancel',
      outcome: 'success',
      actorUserId: 'U-admin',
      channelId: 'sales',
      requestId: 'req-1',
      targetId: '42',
      detail: 'command=QUOTE_CANCEL',
      createdAt: '2026-09-04T00:00:00.000Z',
    });
  });

  it('uses safe defaults for missing fields', () => {
    expect(parseAuditLogEntry({ id: 'event-2', data: () => ({}) }, normalize)).toEqual({
      id: 'event-2',
      action: 'unknown',
      outcome: 'unknown',
      actorUserId: '',
      channelId: null,
      requestId: null,
      targetId: null,
      detail: null,
      createdAt: '1970-01-01T00:00:00.000Z',
    });
  });
});