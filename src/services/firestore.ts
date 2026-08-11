import { Firestore, FieldValue } from '@google-cloud/firestore';

let db: Firestore | null = null;

type CachedUserState = {
    language?: UserLanguage;
    role?: UserRole;
    odooPartnerId?: number;
    displayName?: string;
    phone?: string;
    escalatedToHuman?: boolean;
};

const userStateCache = new Map<string, CachedUserState>();

const logFirestoreError = (action: string, error: unknown) => {
    console.warn(`Firestore ${action} failed:`, error);
};

const withFirestoreRead = async <T>(action: string, fallback: T, operation: (database: Firestore) => Promise<T>): Promise<T> => {
    const database = getDb();
    if (!database) return fallback;

    try {
        return await operation(database);
    } catch (error) {
        logFirestoreError(action, error);
        return fallback;
    }
};

const withFirestoreWrite = async (action: string, operation: (database: Firestore) => Promise<void>): Promise<void> => {
    const database = getDb();
    if (!database) return;

    try {
        await operation(database);
    } catch (error) {
        logFirestoreError(action, error);
    }
};

const getDb = (): Firestore | null => {
  if (db) return db;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) return null;
  try {
    db = new Firestore({ projectId });
  } catch (error) {
    console.warn('Failed to initialize Firestore:', error);
  }
  return db;
};

const getCachedUserState = (userId: string): CachedUserState => userStateCache.get(userId) || {};

const mergeCachedUserState = (userId: string, patch: CachedUserState): CachedUserState => {
        const current = getCachedUserState(userId);
        const next = { ...current, ...patch };
        userStateCache.set(userId, next);
        return next;
};

export const saveReportLog = async (reportId: string, data: any) => {
    await withFirestoreWrite('saveReportLog', async (database) => {
        const docRef = database.collection('reports').doc(reportId);
        await docRef.set({
            ...data,
            createdAt: FieldValue.serverTimestamp(),
        });
    });
}

export const updateUserScore = async (userId: string, interactionType: string) => {
    await withFirestoreWrite('updateUserScore', async (database) => {
        const docRef = database.collection('users').doc(userId);
        const scoreIncrement = interactionType === 'product_inquiry' ? 5 : 1;

        await docRef.set({
            lastInteractionAt: FieldValue.serverTimestamp(),
            engagementScore: FieldValue.increment(scoreIncrement)
        }, { merge: true });
    });
};

export const getConversationHistory = async (userId: string): Promise<any[]> => {
    return withFirestoreRead('getConversationHistory', [], async (database) => {
        const snapshot = await database.collection('users').doc(userId).collection('messages')
            .orderBy('timestamp', 'asc')
            .limitToLast(10)
            .get();

        return snapshot.docs.map(doc => doc.data());
    });
};

export const saveConversationMessage = async (userId: string, role: 'user' | 'model', text: string) => {
    await withFirestoreWrite('saveConversationMessage', async (database) => {
        await database.collection('users').doc(userId).collection('messages').add({
            role,
            text,
            timestamp: FieldValue.serverTimestamp(),
        });
    });
};

export const getEscalationState = async (userId: string): Promise<boolean> => {
    return withFirestoreRead('getEscalationState', getCachedUserState(userId).escalatedToHuman || false, async (database) => {
        const doc = await database.collection('users').doc(userId).get();
        const escalatedToHuman = doc.data()?.escalatedToHuman || false;
        mergeCachedUserState(userId, { escalatedToHuman });
        return escalatedToHuman;
    });
};

export const setEscalationState = async (userId: string, escalated: boolean) => {
    mergeCachedUserState(userId, { escalatedToHuman: escalated });
    await withFirestoreWrite('setEscalationState', async (database) => {
        await database.collection('users').doc(userId).set({ escalatedToHuman: escalated }, { merge: true });
    });
};

export type UserLanguage = 'th' | 'en';
export type UserRole = 'admin' | 'user';

export type UserProfile = {
    language: UserLanguage;
    role: UserRole;
    odooPartnerId?: number;
    displayName?: string;
    phone?: string;
};

export const getUserLanguage = async (userId: string): Promise<UserLanguage> => {
    return withFirestoreRead('getUserLanguage', getCachedUserState(userId).language || 'en', async (database) => {
        const doc = await database.collection('users').doc(userId).get();
        const lang = doc.data()?.language;
        const language = lang === 'th' ? 'th' : 'en';
        mergeCachedUserState(userId, { language });
        return language;
    });
};

export const setUserLanguage = async (userId: string, language: UserLanguage) => {
    mergeCachedUserState(userId, { language });
    await withFirestoreWrite('setUserLanguage', async (database) => {
        await database.collection('users').doc(userId).set({ language }, { merge: true });
    });
};

export const getUserProfile = async (userId: string): Promise<UserProfile> => {
    const cached = getCachedUserState(userId);
    const fallbackProfile: UserProfile = {
        language: cached.language || 'en',
        role: cached.role || 'user',
        odooPartnerId: cached.odooPartnerId,
        displayName: cached.displayName,
        phone: cached.phone,
    };

    return withFirestoreRead('getUserProfile', fallbackProfile, async (database) => {
        const doc = await database.collection('users').doc(userId).get();
        const data = doc.data() || {};

        const profile: UserProfile = {
            language: data.language === 'th' ? 'th' : 'en',
            role: data.role === 'admin' ? 'admin' : 'user',
            odooPartnerId: typeof data.odooPartnerId === 'number' ? data.odooPartnerId : undefined,
            displayName: typeof data.displayName === 'string' ? data.displayName : undefined,
            phone: typeof data.phone === 'string' ? data.phone : undefined,
        };

        mergeCachedUserState(userId, profile);
        return profile;
    });
};

export const setUserRole = async (userId: string, role: UserRole) => {
    mergeCachedUserState(userId, { role });
    await withFirestoreWrite('setUserRole', async (database) => {
        await database.collection('users').doc(userId).set({ role }, { merge: true });
    });
};

export const setUserOdooPartner = async (userId: string, partnerId: number, displayName?: string, phone?: string) => {
    mergeCachedUserState(userId, {
        odooPartnerId: partnerId,
        ...(displayName ? { displayName } : {}),
        ...(phone ? { phone } : {}),
    });
    await withFirestoreWrite('setUserOdooPartner', async (database) => {
        await database.collection('users').doc(userId).set({
            odooPartnerId: partnerId,
            ...(displayName ? { displayName } : {}),
            ...(phone ? { phone } : {}),
        }, { merge: true });
    });
};
