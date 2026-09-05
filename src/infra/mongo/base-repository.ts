import { MongoClient, type Collection, type Db, type Document, type Filter, type OptionalUnlessRequiredId } from 'mongodb';
import { mongoDbName, mongoUri } from '../../http/env';
import { appLogger } from '../../services/logger';

let client: MongoClient | null = null;
let db: Db | null = null;
let connecting: Promise<Db | null> | null = null;

export const isMongoConfigured = (): boolean => Boolean(mongoUri);

export const getMongoDb = async (): Promise<Db | null> => {
  if (!mongoUri) return null;
  if (db) return db;
  if (connecting) return connecting;

  connecting = (async () => {
    try {
      client = new MongoClient(mongoUri);
      await client.connect();
      db = client.db(mongoDbName);
      appLogger.info('mongo_connected', { db: mongoDbName });
      return db;
    } catch (error) {
      appLogger.warn('mongo_connect_failed', { error: String(error) });
      client = null;
      db = null;
      return null;
    } finally {
      connecting = null;
    }
  })();

  return connecting;
};

export const pingMongo = async (): Promise<{ ok: boolean; message: string }> => {
  if (!mongoUri) return { ok: true, message: 'MongoDB not configured (optional)' };
  const database = await getMongoDb();
  if (!database) return { ok: false, message: 'MongoDB configured but unreachable' };
  await database.command({ ping: 1 });
  return { ok: true, message: 'MongoDB connected' };
};

export const closeMongo = async (): Promise<void> => {
  await client?.close();
  client = null;
  db = null;
};

export const getCollection = async <T extends Document>(name: string): Promise<Collection<T> | null> => {
  const database = await getMongoDb();
  if (!database) return null;
  return database.collection<T>(name);
};

export type PageResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export class BaseRepository<T extends Document> {
  constructor(private readonly collectionName: string) {}

  async insert(doc: OptionalUnlessRequiredId<T>): Promise<T | null> {
    const collection = await getCollection<T>(this.collectionName);
    if (!collection) return null;
    const result = await collection.insertOne(doc);
    return { ...doc, _id: result.insertedId } as T;
  }

  async upsertByKey(filter: Filter<T>, doc: Partial<T>): Promise<T | null> {
    const collection = await getCollection<T>(this.collectionName);
    if (!collection) return null;
    const result = await collection.findOneAndUpdate(
      filter,
      { $set: doc },
      { upsert: true, returnDocument: 'after' },
    );
    return (result as T | null) ?? ({ ...doc } as T);
  }

  async findPage(filter: Filter<T>, page = 1, pageSize = 20): Promise<PageResult<T>> {
    const collection = await getCollection<T>(this.collectionName);
    if (!collection) return { items: [], total: 0, page, pageSize };
    const skip = Math.max(0, (page - 1) * pageSize);
    const [items, total] = await Promise.all([
      collection.find(filter).skip(skip).limit(pageSize).toArray() as Promise<T[]>,
      collection.countDocuments(filter),
    ]);
    return { items, total, page, pageSize };
  }

  async vectorSearch(embedding: number[], limit = 5, indexName = 'vector_index'): Promise<T[]> {
    const collection = await getCollection<T>(this.collectionName);
    if (!collection || !embedding.length) return [];
    try {
      const cursor = collection.aggregate<T>([
        {
          $vectorSearch: {
            index: indexName,
            path: 'embedding',
            queryVector: embedding,
            numCandidates: Math.max(limit * 10, 20),
            limit,
          },
        },
      ]);
      return cursor.toArray();
    } catch (error) {
      appLogger.warn('mongo_vector_search_failed', { collection: this.collectionName, error: String(error) });
      return [];
    }
  }
}
