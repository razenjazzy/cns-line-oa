"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processChatMessage = void 0;
const genai_1 = require("@google/genai");
const firestore_1 = require("./firestore");
const templates_1 = require("../line/templates");
const odoo_1 = require("./odoo");
const getAgentName = () => process.env.LINE_AGENT_NAME?.trim() || 'น้องโซระ';
let chatModelUnavailable = false;
const isAiOff = () => /^(1|true|yes|on)$/i.test(process.env.AI_OFF || '');
const getLocationCandidates = () => {
    const primary = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1-a';
    return Array.from(new Set([primary, 'us-central1']));
};
const getModelCandidates = () => [
    'gemini-2.0-flash-001',
    'gemini-1.5-flash-002',
    'gemini-1.5-flash',
];
const getGenAIClients = () => {
    const aiStudioKey = process.env.GOOGLE_AI_STUDIO_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim() || '';
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    const clients = [];
    if (aiStudioKey) {
        clients.push(new genai_1.GoogleGenAI({ apiKey: aiStudioKey }));
    }
    if (project) {
        clients.push(...getLocationCandidates().map(location => new genai_1.GoogleGenAI({
            vertexai: true,
            project,
            location,
        })));
    }
    return clients;
};
const getErrorCode = (error) => {
    if (typeof error !== 'object' || error === null)
        return undefined;
    const status = error.status;
    if (typeof status === 'number')
        return status;
    const code = error.code;
    if (typeof code === 'number')
        return code;
    const text = String(error.message || '');
    if (text.includes('NOT_FOUND') || text.includes('was not found'))
        return 404;
    return undefined;
};
const processChatMessage = async (userId, userText, language = 'th') => {
    const agentName = getAgentName();
    const isThai = language === 'th';
    if (isAiOff()) {
        const heuristicProduct = await (0, odoo_1.findProductByQuery)(userText.trim());
        if (heuristicProduct) {
            return {
                handled: true,
                messages: [
                    { type: 'text', text: isThai ? `${agentName} พบสินค้าจาก Odoo แล้วค่ะ` : `${agentName} found this product in Odoo.` },
                    (0, templates_1.createProductCardFlexMessage)(heuristicProduct.name, heuristicProduct.list_price, heuristicProduct.qty_available),
                ],
            };
        }
        return {
            handled: false,
            messages: [{
                    type: 'text',
                    text: isThai
                        ? `${agentName} ไม่เข้าใจข้อความนี้ค่ะ ลองดูเมนูด้านล่างได้เลย`
                        : `${agentName} didn't understand that — here's the menu instead.`
                }],
        };
    }
    if (chatModelUnavailable) {
        const heuristicProduct = await (0, odoo_1.findProductByQuery)(userText.trim());
        if (heuristicProduct) {
            return {
                handled: true,
                messages: [
                    { type: 'text', text: isThai ? `${agentName} หาเจอจาก Odoo แล้วค่ะ` : `${agentName} found this in Odoo.` },
                    (0, templates_1.createProductCardFlexMessage)(heuristicProduct.name, heuristicProduct.list_price, heuristicProduct.qty_available),
                ],
            };
        }
        return {
            handled: false,
            messages: [{ type: 'text', text: isThai ? `${agentName} ไม่เข้าใจข้อความนี้ค่ะ ลองดูเมนูด้านล่างได้เลย` : `${agentName} didn't understand that — here's the menu instead.` }],
        };
    }
    const genAIClients = getGenAIClients();
    if (!genAIClients.length) {
        return {
            handled: false,
            messages: [{ type: 'text', text: isThai ? `${agentName} ไม่เข้าใจข้อความนี้ค่ะ ลองดูเมนูด้านล่างได้เลย` : `${agentName} didn't understand that — here's the menu instead.` }],
        };
    }
    // 1. Get history
    const history = await (0, firestore_1.getConversationHistory)(userId);
    const contents = history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
    }));
    contents.push({
        role: 'user',
        parts: [{ text: `System instruction: You are ${agentName}, a LINE commerce assistant for Odoo. Always answer in ${isThai ? 'Thai' : 'English'} language, concise and polite.` }]
    });
    contents.push({ role: 'user', parts: [{ text: userText }] });
    await (0, firestore_1.saveConversationMessage)(userId, 'user', userText);
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
        let response;
        let lastError;
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
                }
                catch (error) {
                    lastError = error;
                    if (getErrorCode(error) !== 404)
                        break;
                }
            }
            if (response)
                break;
        }
        if (!response) {
            throw lastError || new Error('No response from GenAI');
        }
        const parts = (response?.candidates?.[0]?.content?.parts || []);
        const messages = [];
        let aiTextResponse = '';
        for (const part of parts) {
            if (part.text) {
                aiTextResponse += part.text;
                messages.push({ type: 'text', text: part.text });
            }
            if (part.functionCall) {
                const call = part.functionCall;
                const args = call.args; // Bypass strict typing for args object
                if (call.name === 'lookupProduct') {
                    const query = args?.query;
                    const odooProduct = await (0, odoo_1.findProductByQuery)(query);
                    const product = odooProduct
                        ? { name: odooProduct.name, price: odooProduct.list_price, stock: odooProduct.qty_available }
                        : null;
                    if (product) {
                        aiTextResponse += `[Sent product card for ${product.name}]`;
                        messages.push((0, templates_1.createProductCardFlexMessage)(product.name, product.price, product.stock));
                    }
                    else {
                        const msg = isThai
                            ? `${agentName} ไม่พบสินค้า "${query}" ใน Odoo ค่ะ ลองพิมพ์ชื่อสินค้าใหม่ได้เลย`
                            : `${agentName} could not find "${query}" in Odoo. Please try another product name.`;
                        aiTextResponse += msg;
                        messages.push({ type: 'text', text: msg });
                    }
                }
                else if (call.name === 'createOrder') {
                    const odooProduct = await (0, odoo_1.findProductByQuery)(String(args?.productName || ''));
                    const product = odooProduct
                        ? { id: odooProduct.id, name: odooProduct.name, price: odooProduct.list_price, stock: odooProduct.qty_available }
                        : null;
                    const qty = args?.quantity || 1;
                    if (product && product.stock >= qty) {
                        const profile = await (0, firestore_1.getUserProfile)(userId);
                        const partnerName = profile.displayName || `LINE Customer ${userId.slice(-6)}`;
                        const quotation = await (0, odoo_1.createQuotationFromLine)(partnerName, profile.phone || '', product.name, qty, profile.odooPartnerId);
                        const total = quotation?.total ?? (product.price * qty);
                        aiTextResponse += quotation
                            ? `[Created Odoo quotation ${quotation.orderName} for ${qty}x ${product.name}]`
                            : `[Sent order summary for ${qty}x ${product.name}]`;
                        messages.push((0, templates_1.createOrderSummaryFlexMessage)(total));
                        if (quotation) {
                            messages.push({ type: 'text', text: isThai ? `${agentName} สร้างใบเสนอราคาใน Odoo แล้ว เลขที่ ${quotation.orderName}` : `${agentName} created an Odoo quotation: ${quotation.orderName}` });
                        }
                    }
                    else {
                        const msg = isThai
                            ? `${agentName} ไม่สามารถสร้างออเดอร์ได้ เพราะสินค้าไม่พอหรือไม่พบสินค้าใน Odoo ค่ะ`
                            : `${agentName} could not create the order because stock is insufficient or product was not found in Odoo.`;
                        aiTextResponse += msg;
                        messages.push({ type: 'text', text: msg });
                    }
                }
                else if (call.name === 'escalateToHuman') {
                    const escalationResult = await (0, firestore_1.setEscalationState)(userId, true);
                    if (!escalationResult.ok) {
                        const msg = isThai
                            ? `${agentName} ยังไม่สามารถโอนเคสให้แอดมินได้ในตอนนี้ กรุณาลองใหม่อีกครั้งค่ะ`
                            : `${agentName} could not escalate to a human agent right now. Please try again.`;
                        aiTextResponse += msg;
                        messages.push({ type: 'text', text: msg });
                        continue;
                    }
                    const msg = isThai
                        ? `${agentName} โอนเคสให้แอดมินแล้วนะคะ เดี๋ยวเจ้าหน้าที่จะดูแลต่อทันที`
                        : `${agentName} has escalated this chat to a human agent.`;
                    aiTextResponse += msg;
                    messages.push({ type: 'text', text: msg });
                }
            }
        }
        let handled = true;
        if (messages.length === 0) {
            messages.push({ type: 'text', text: isThai ? `${agentName} ไม่เข้าใจข้อความนี้ค่ะ ลองดูเมนูด้านล่างได้เลย` : `${agentName} didn't understand that — here's the menu instead.` });
            aiTextResponse = 'Fallback response triggered.';
            handled = false;
        }
        await (0, firestore_1.saveConversationMessage)(userId, 'model', aiTextResponse);
        return { messages, handled };
    }
    catch (error) {
        if (getErrorCode(error) === 404) {
            chatModelUnavailable = true;
            console.warn('Chat model unavailable for this project/region. Switching chat to Odoo fallback mode.');
            const heuristicProduct = await (0, odoo_1.findProductByQuery)(userText.trim());
            if (heuristicProduct) {
                return {
                    handled: true,
                    messages: [
                        { type: 'text', text: isThai ? `${agentName} หาเจอจาก Odoo แล้วค่ะ` : `${agentName} found this in Odoo.` },
                        (0, templates_1.createProductCardFlexMessage)(heuristicProduct.name, heuristicProduct.list_price, heuristicProduct.qty_available),
                    ],
                };
            }
            return {
                handled: false,
                messages: [{ type: 'text', text: isThai ? `${agentName} ไม่เข้าใจข้อความนี้ค่ะ ลองดูเมนูด้านล่างได้เลย` : `${agentName} didn't understand that — here's the menu instead.` }],
            };
        }
        console.error('Chat Engine Error:', error);
        return {
            handled: false,
            messages: [{ type: 'text', text: isThai ? `${agentName} ระบบขัดข้องชั่วคราว ลองดูเมนูด้านล่างได้เลย` : `${agentName} is having technical trouble — here's the menu instead.` }],
        };
    }
};
exports.processChatMessage = processChatMessage;
