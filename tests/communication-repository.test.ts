import { describe, expect, it, vi } from 'vitest';
import { createCommunicationRepository } from '../src/services/firestore/communication';

describe('communication repository', () => {
  it('delegates writes with stable operation names', async () => {
    const write = vi.fn(async () => ({ ok: true }));
    const repository = createCommunicationRepository({ read: vi.fn(), write });

    await repository.updateUserScore('U-user', 'product_inquiry');
    await repository.saveConversationMessage('U-user', 'model', 'reply');
    await repository.recordChatFeedback({ userId: 'U-user', rating: 'good' });

    expect(write.mock.calls.map(call => call[0])).toEqual([
      'updateUserScore',
      'saveConversationMessage',
      'recordChatFeedback',
    ]);
  });
});