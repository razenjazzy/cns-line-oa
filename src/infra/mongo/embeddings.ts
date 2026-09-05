import { isMongoVectorEnabled } from '../../http/env';
import { loadSkills } from '../../services/skill-loader';
import { embedText } from '../../services/vertexai';
import { appLogger } from '../../services/logger';
import { BaseRepository } from './base-repository';

export type EmbeddingDocument = {
  _id?: unknown;
  kind: 'skill' | 'chat';
  key: string;
  text: string;
  language?: string;
  embedding: number[];
  updatedAt: string;
};

const skillRepo = new BaseRepository<EmbeddingDocument>('skill_embeddings');
const chatRepo = new BaseRepository<EmbeddingDocument>('chat_embeddings');

let skillsIndexed = false;

export const indexSkillEmbeddings = async (): Promise<void> => {
  if (!isMongoVectorEnabled || skillsIndexed) return;
  const skills = loadSkills();
  for (const skill of skills) {
    const body = `${skill.command}\n${skill.th}\n${skill.en}`;
    const embedding = await embedText(body);
    if (!embedding) continue;
    await skillRepo.upsertByKey(
      { kind: 'skill', key: skill.command },
      {
        kind: 'skill',
        key: skill.command,
        text: skill.en || skill.th,
        embedding,
        updatedAt: new Date().toISOString(),
      },
    );
  }
  skillsIndexed = true;
  appLogger.info('mongo_skill_embeddings_indexed', { count: skills.length });
};

export const indexChatEmbedding = async (question: string, answer: string): Promise<void> => {
  if (!isMongoVectorEnabled) return;
  const text = `${question.trim()}\n${answer.trim()}`.trim();
  if (!text) return;
  const embedding = await embedText(text);
  if (!embedding) return;
  const key = question.trim().slice(0, 180).toLowerCase();
  await chatRepo.upsertByKey(
    { kind: 'chat', key },
    {
      kind: 'chat',
      key,
      text: answer.trim() || text,
      embedding,
      updatedAt: new Date().toISOString(),
    },
  );
};

export const searchSimilarFaqs = async (query: string): Promise<string[]> => {
  if (!isMongoVectorEnabled) return [];
  const embedding = await embedText(query);
  if (!embedding) return [];
  await indexSkillEmbeddings().catch((error) => {
    appLogger.warn('mongo_skill_index_failed', { error: String(error) });
  });
  const [skills, chats] = await Promise.all([
    skillRepo.vectorSearch(embedding, 3),
    chatRepo.vectorSearch(embedding, 2),
  ]);
  return [...skills, ...chats].map(doc => doc.text).filter(Boolean);
};
