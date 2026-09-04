import { FieldValue, type Firestore } from '@google-cloud/firestore';

type CommunicationDependencies = {
    read: <T>(action: string, fallback: T, operation: (database: Firestore) => Promise<T>) => Promise<T>;
    write: (action: string, operation: (database: Firestore) => Promise<void>) => Promise<{ ok: boolean }>;
};

export const createCommunicationRepository = (dependencies: CommunicationDependencies) => ({
    updateUserScore: async (userId: string, interactionType: string) => dependencies.write('updateUserScore', async database => {
        const scoreIncrement = interactionType === 'product_inquiry' ? 5 : 1;
        await database.collection('users').doc(userId).set({
            lastInteractionAt: FieldValue.serverTimestamp(),
            engagementScore: FieldValue.increment(scoreIncrement),
        }, { merge: true });
    }),

    getConversationHistory: async (userId: string): Promise<any[]> => dependencies.read('getConversationHistory', [], async database => {
        const snapshot = await database.collection('users').doc(userId).collection('messages')
            .orderBy('timestamp', 'asc')
            .limitToLast(10)
            .get();
        return snapshot.docs.map(doc => doc.data());
    }),

    saveConversationMessage: async (userId: string, role: 'user' | 'model', text: string) => dependencies.write('saveConversationMessage', async database => {
        await database.collection('users').doc(userId).collection('messages').add({
            role,
            text,
            timestamp: FieldValue.serverTimestamp(),
        });
    }),

    recordChatFeedback: async (params: { userId: string; rating: 'good' | 'bad'; question?: string; answer?: string }) => dependencies.write('recordChatFeedback', async database => {
        await database.collection('chatFeedback').add({
            userId: params.userId,
            rating: params.rating,
            question: params.question || null,
            answer: params.answer || null,
            createdAt: new Date().toISOString(),
            createdAtServer: FieldValue.serverTimestamp(),
        });
    }),
});
