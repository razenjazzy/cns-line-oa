import { describe, expect, it } from 'vitest';
import { BaseRepository } from '../src/infra/mongo/base-repository';

describe('Mongo BaseRepository without MONGODB_URI', () => {
  it('returns empty pages and skips writes', async () => {
    delete process.env.MONGODB_URI;
    const repo = new BaseRepository<{ kind: string; text: string; embedding: number[] }>('skill_embeddings');
    const inserted = await repo.insert({ kind: 'skill', text: 'hello', embedding: [0.1] });
    expect(inserted).toBeNull();
    const page = await repo.findPage({}, 1, 10);
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
    expect(await repo.vectorSearch([0.1], 3)).toEqual([]);
    expect(await repo.upsertByKey({ kind: 'skill' }, {
      kind: 'skill',
      text: 'hours',
      embedding: [0.1],
    })).toBeNull();
  });
});
