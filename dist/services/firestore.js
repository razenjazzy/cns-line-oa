"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setUserOdooPartner = exports.setUserRole = exports.getUserProfile = exports.setUserLanguage = exports.getUserLanguage = exports.setEscalationState = exports.getEscalationState = exports.saveConversationMessage = exports.getConversationHistory = exports.updateUserScore = exports.saveReportLog = void 0;
const firestore_1 = require("@google-cloud/firestore");
let db = null;
const userStateCache = new Map();
const logFirestoreError = (action, error) => {
    console.warn(`Firestore ${action} failed:`, error);
};
const withFirestoreRead = async (action, fallback, operation) => {
    const database = getDb();
    if (!database)
        return fallback;
    try {
        return await operation(database);
    }
    catch (error) {
        logFirestoreError(action, error);
        return fallback;
    }
};
const withFirestoreWrite = async (action, operation) => {
    const database = getDb();
    if (!database)
        return;
    try {
        await operation(database);
    }
    catch (error) {
        logFirestoreError(action, error);
    }
};
const getDb = () => {
    if (db)
        return db;
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId)
        return null;
    try {
        db = new firestore_1.Firestore({ projectId });
    }
    catch (error) {
        console.warn('Failed to initialize Firestore:', error);
    }
    return db;
};
const getCachedUserState = (userId) => userStateCache.get(userId) || {};
const mergeCachedUserState = (userId, patch) => {
    const current = getCachedUserState(userId);
    const next = { ...current, ...patch };
    userStateCache.set(userId, next);
    return next;
};
const saveReportLog = async (reportId, data) => {
    await withFirestoreWrite('saveReportLog', async (database) => {
        const docRef = database.collection('reports').doc(reportId);
        await docRef.set({
            ...data,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
};
exports.saveReportLog = saveReportLog;
const updateUserScore = async (userId, interactionType) => {
    await withFirestoreWrite('updateUserScore', async (database) => {
        const docRef = database.collection('users').doc(userId);
        const scoreIncrement = interactionType === 'product_inquiry' ? 5 : 1;
        await docRef.set({
            lastInteractionAt: firestore_1.FieldValue.serverTimestamp(),
            engagementScore: firestore_1.FieldValue.increment(scoreIncrement)
        }, { merge: true });
    });
};
exports.updateUserScore = updateUserScore;
const getConversationHistory = async (userId) => {
    return withFirestoreRead('getConversationHistory', [], async (database) => {
        const snapshot = await database.collection('users').doc(userId).collection('messages')
            .orderBy('timestamp', 'asc')
            .limitToLast(10)
            .get();
        return snapshot.docs.map(doc => doc.data());
    });
};
exports.getConversationHistory = getConversationHistory;
const saveConversationMessage = async (userId, role, text) => {
    await withFirestoreWrite('saveConversationMessage', async (database) => {
        await database.collection('users').doc(userId).collection('messages').add({
            role,
            text,
            timestamp: firestore_1.FieldValue.serverTimestamp(),
        });
    });
};
exports.saveConversationMessage = saveConversationMessage;
const getEscalationState = async (userId) => {
    return withFirestoreRead('getEscalationState', getCachedUserState(userId).escalatedToHuman || false, async (database) => {
        const doc = await database.collection('users').doc(userId).get();
        const escalatedToHuman = doc.data()?.escalatedToHuman || false;
        mergeCachedUserState(userId, { escalatedToHuman });
        return escalatedToHuman;
    });
};
exports.getEscalationState = getEscalationState;
const setEscalationState = async (userId, escalated) => {
    mergeCachedUserState(userId, { escalatedToHuman: escalated });
    await withFirestoreWrite('setEscalationState', async (database) => {
        await database.collection('users').doc(userId).set({ escalatedToHuman: escalated }, { merge: true });
    });
};
exports.setEscalationState = setEscalationState;
const getUserLanguage = async (userId) => {
    return withFirestoreRead('getUserLanguage', getCachedUserState(userId).language || 'en', async (database) => {
        const doc = await database.collection('users').doc(userId).get();
        const lang = doc.data()?.language;
        const language = lang === 'th' ? 'th' : 'en';
        mergeCachedUserState(userId, { language });
        return language;
    });
};
exports.getUserLanguage = getUserLanguage;
const setUserLanguage = async (userId, language) => {
    mergeCachedUserState(userId, { language });
    await withFirestoreWrite('setUserLanguage', async (database) => {
        await database.collection('users').doc(userId).set({ language }, { merge: true });
    });
};
exports.setUserLanguage = setUserLanguage;
const getUserProfile = async (userId) => {
    const cached = getCachedUserState(userId);
    const fallbackProfile = {
        language: cached.language || 'en',
        role: cached.role || 'user',
        odooPartnerId: cached.odooPartnerId,
        displayName: cached.displayName,
        phone: cached.phone,
    };
    return withFirestoreRead('getUserProfile', fallbackProfile, async (database) => {
        const doc = await database.collection('users').doc(userId).get();
        const data = doc.data() || {};
        const profile = {
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
exports.getUserProfile = getUserProfile;
const setUserRole = async (userId, role) => {
    mergeCachedUserState(userId, { role });
    await withFirestoreWrite('setUserRole', async (database) => {
        await database.collection('users').doc(userId).set({ role }, { merge: true });
    });
};
exports.setUserRole = setUserRole;
const setUserOdooPartner = async (userId, partnerId, displayName, phone) => {
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
exports.setUserOdooPartner = setUserOdooPartner;
