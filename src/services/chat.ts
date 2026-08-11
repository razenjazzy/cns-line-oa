import { GoogleGenAI } from '@google/genai';
import { getConversationHistory, saveConversationMessage, setEscalationState } from './firestore';
import { createProductCardFlexMessage, createOrderSummaryFlexMessage } from '../line/templates';
import { messagingApi } from '@line/bot-sdk';
import { createQuotationFromLine, findProductByQuery } from './odoo';

const getAgentName = (): string => process.env.LINE_AGENT_NAME?.trim() || 'น้องโซระ';
type ChatLanguage = 'th' | 'en';
let chatModelUnavailable = false;
const isAiOff = (): boolean => /^(1|true|yes|on)$/i.test(process.env.AI_OFF || '');

const getLocationCandidates = (): string[] => {
    const primary = process.env.GOOGLE_CLOUD_LOCATION || 'asia-southeast1';
    return Array.from(new Set([primary, 'us-central1']));
};

const getModelCandidates = (): string[] => [
    'gemini-2.0-flash-001',
    'gemini-1.5-flash-002',
    'gemini-1.5-flash',
];

const getGenAIClients = (): GoogleGenAI[] => {
    const aiStudioKey = process.env.GOOGLE_AI_STUDIO_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim() || '';
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    const clients: GoogleGenAI[] = [];

    if (aiStudioKey) {
        clients.push(new GoogleGenAI({ apiKey: aiStudioKey }));
    }

    if (project) {
        clients.push(...getLocationCandidates().map(location => new GoogleGenAI({
            vertexai: true,
            project,
            location,
        })));
    }

    return clients;
};

const getErrorCode = (error: unknown): number | undefined => {
    if (typeof error !== 'object' || error === null) return undefined;
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number') return status;
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'number') return code;
    const text = String((error as { message?: unknown }).message || '');
    if (text.includes('NOT_FOUND') || text.includes('was not found')) return 404;
    return undefined;
};

export const processChatMessage = async (userId: string, userText: string, language: ChatLanguage = 'th'): Promise<messagingApi.Message[]> => {
    const agentName = getAgentName();
    const isThai = language === 'th';

    if (isAiOff()) {
        const heuristicProduct = await findProductByQuery(userText.trim());
        if (heuristicProduct) {
            return [
                { type: 'text', text: isThai ? `${agentName} พบสินค้าจาก Odoo แล้วค่ะ` : `${agentName} found this product in Odoo.` },
                createProductCardFlexMessage(heuristicProduct.name, heuristicProduct.list_price, heuristicProduct.qty_available),
            ];
        }
        return [{
            type: 'text',
            text: isThai
                ? `${agentName} ตอนนี้เปิดโหมดประหยัดค่าใช้จ่าย AI อยู่ค่ะ ใช้คำสั่ง Odoo ได้ทันที เช่น DEMO PRODUCT, DEMO QUOTE, DEMO ORDER, DEMO REPORT`
                : `${agentName} is running in AI cost-control mode. Please use Odoo commands like DEMO PRODUCT, DEMO QUOTE, DEMO ORDER, and DEMO REPORT.`
        }];
    }

    if (chatModelUnavailable) {
        const heuristicProduct = await findProductByQuery(userText.trim());
        if (heuristicProduct) {
            return [
                { type: 'text', text: isThai ? `${agentName} หาเจอจาก Odoo แล้วค่ะ` : `${agentName} found this in Odoo.` },
                createProductCardFlexMessage(heuristicProduct.name, heuristicProduct.list_price, heuristicProduct.qty_available),
            ];
        }
        return [{ type: 'text', text: isThai ? `${agentName} ตอนนี้โหมด AI ไม่พร้อมใช้งาน แต่ยังช่วยค้นหาสินค้าและทำรายการ Odoo ได้ค่ะ` : `${agentName} AI mode is temporarily unavailable, but Odoo product and order features are still available.` }];
    }

    const genAIClients = getGenAIClients();
    if (!genAIClients.length) {
        return [{ type: 'text', text: isThai ? `${agentName} ยังไม่พร้อมใช้งาน AI ชั่วคราว กรุณาตั้งค่า GOOGLE_AI_STUDIO_API_KEY หรือ Vertex ก่อนใช้งาน` : `${agentName} AI is temporarily unavailable. Please configure GOOGLE_AI_STUDIO_API_KEY or Vertex first.` }];
    }

    // 1. Get history
    const history = await getConversationHistory(userId);
    const contents: any[] = history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
    }));
    contents.push({
        role: 'user',
        parts: [{ text: `System instruction: You are ${agentName}, a LINE commerce assistant for Odoo. Always answer in ${isThai ? 'Thai' : 'English'} language, concise and polite.` }]
    });
    contents.push({ role: 'user', parts: [{ text: userText }] });

    await saveConversationMessage(userId, 'user', userText);

    const functionDeclarations = [
        {
            name: 'lookupProduct',
            description: 'Search for a product by name to check price and availability.',
            parametersJsonSchema: {
                type: 'object',
                properties: { query: { type: 'string', description: 'Product name' } },
                required: ['query'],
            }
        },
        {
            name: 'createOrder',
            description: 'Create an order for the user.',
            parametersJsonSchema: {
                type: 'object',
                properties: {
                    productName: { type: 'string' },
                    quantity: { type: 'integer' }
                },
                required: ['productName', 'quantity'],
            }
        },
        {
            name: 'escalateToHuman',
            description: 'Escalate the chat to a human agent if the user is angry or asking complex questions.',
            parametersJsonSchema: {
                type: 'object',
                properties: { reason: { type: 'string' } },
                required: ['reason']
            }
        }
    ];

    try {
        let response: unknown;
        let lastError: unknown;
        for (const client of genAIClients) {
            for (const model of getModelCandidates()) {
                try {
                    response = await client.models.generateContent({
                        model,
                        contents,
                        config: {
                            temperature: 0.2,
                            tools: [{ functionDeclarations }],
                        },
                    });
                    break;
                } catch (error) {
                    lastError = error;
                    if (getErrorCode(error) !== 404) break;
                }
            }
            if (response) break;
        }

        if (!response) {
            throw lastError || new Error('No response from GenAI');
        }

        const parts = ((response as any)?.candidates?.[0]?.content?.parts || []) as any[];
        
        let messages: messagingApi.Message[] = [];
        let aiTextResponse = '';

        for (const part of parts) {
            if (part.text) {
                aiTextResponse += part.text;
                messages.push({ type: 'text', text: part.text });
            }
            if (part.functionCall) {
                const call = part.functionCall;
                const args = call.args as any; // Bypass strict typing for args object
                
                if (call.name === 'lookupProduct') {
                    const query = args?.query as string;
                    const odooProduct = await findProductByQuery(query);
                    const product = odooProduct
                        ? { name: odooProduct.name, price: odooProduct.list_price, stock: odooProduct.qty_available }
                        : null;
                    if (product) {
                        aiTextResponse += `[Sent product card for ${product.name}]`;
                        messages.push(createProductCardFlexMessage(product.name, product.price, product.stock));
                    } else {
                        const msg = isThai
                            ? `${agentName} ไม่พบสินค้า "${query}" ใน Odoo ค่ะ ลองพิมพ์ชื่อสินค้าใหม่ได้เลย`
                            : `${agentName} could not find "${query}" in Odoo. Please try another product name.`;
                        aiTextResponse += msg;
                        messages.push({ type: 'text', text: msg });
                    }
                } else if (call.name === 'createOrder') {
                    const odooProduct = await findProductByQuery(String(args?.productName || ''));
                    const product = odooProduct
                        ? { id: odooProduct.id, name: odooProduct.name, price: odooProduct.list_price, stock: odooProduct.qty_available }
                        : null;
                    const qty = (args?.quantity as number) || 1;
                    if (product && product.stock >= qty) {
                        const quotation = await createQuotationFromLine(
                            `LINE-${userId}`,
                            userId,
                            product.name,
                            qty
                        );
                        const total = quotation?.total ?? (product.price * qty);
                        aiTextResponse += quotation
                            ? `[Created Odoo quotation ${quotation.orderName} for ${qty}x ${product.name}]`
                            : `[Sent order summary for ${qty}x ${product.name}]`;
                        messages.push(createOrderSummaryFlexMessage(total));
                        if (quotation) {
                            messages.push({ type: 'text', text: isThai ? `${agentName} สร้างใบเสนอราคาใน Odoo แล้ว เลขที่ ${quotation.orderName}` : `${agentName} created an Odoo quotation: ${quotation.orderName}` });
                        }
                    } else {
                        const msg = isThai
                            ? `${agentName} ไม่สามารถสร้างออเดอร์ได้ เพราะสินค้าไม่พอหรือไม่พบสินค้าใน Odoo ค่ะ`
                            : `${agentName} could not create the order because stock is insufficient or product was not found in Odoo.`;
                        aiTextResponse += msg;
                        messages.push({ type: 'text', text: msg });
                    }
                } else if (call.name === 'escalateToHuman') {
                    await setEscalationState(userId, true);
                    const msg = isThai
                        ? `${agentName} โอนเคสให้แอดมินแล้วนะคะ เดี๋ยวเจ้าหน้าที่จะดูแลต่อทันที`
                        : `${agentName} has escalated this chat to a human agent.`;
                    aiTextResponse += msg;
                    messages.push({ type: 'text', text: msg });
                }
            }
        }

        if (messages.length === 0) {
            messages.push({ type: 'text', text: isThai ? `${agentName} ขออภัยค่ะ ยังไม่เข้าใจข้อความนี้ ลองพิมพ์ชื่อสินค้า หรือพิมพ์ "เริ่มต้น" ได้เลย` : `${agentName} did not understand that. Try a product name or type "START".` });
            aiTextResponse = 'Fallback response triggered.';
        }

        await saveConversationMessage(userId, 'model', aiTextResponse);
        return messages;

    } catch (error) {
        if (getErrorCode(error) === 404) {
            chatModelUnavailable = true;
            console.warn('Chat model unavailable for this project/region. Switching chat to Odoo fallback mode.');
            const heuristicProduct = await findProductByQuery(userText.trim());
            if (heuristicProduct) {
                return [
                    { type: 'text', text: isThai ? `${agentName} หาเจอจาก Odoo แล้วค่ะ` : `${agentName} found this in Odoo.` },
                    createProductCardFlexMessage(heuristicProduct.name, heuristicProduct.list_price, heuristicProduct.qty_available),
                ];
            }
            return [{ type: 'text', text: isThai ? `${agentName} ตอนนี้โหมด AI ไม่พร้อมใช้งาน แต่ยังช่วยค้นหาสินค้าและทำรายการ Odoo ได้ค่ะ` : `${agentName} AI mode is temporarily unavailable, but Odoo product and order features are still available.` }];
        }
        console.error('Chat Engine Error:', error);
        return [{ type: 'text', text: isThai ? `${agentName} ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งค่ะ` : `${agentName} is experiencing technical issues. Please try again.` }];
    }
};
