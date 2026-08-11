"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyIntent = exports.generateInsights = void 0;
const genai_1 = require("@google/genai");
const isAiOff = () => /^(1|true|yes|on)$/i.test(process.env.AI_OFF || '');
const getProject = () => {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    return project || null;
};
const getLocationCandidates = () => {
    const primary = process.env.GOOGLE_CLOUD_LOCATION || 'asia-southeast1';
    const candidates = [primary, 'us-central1'];
    return Array.from(new Set(candidates));
};
let cachedProject = null;
let cachedLocations = '';
let cachedAiStudioKey = '';
let cachedClients = [];
const getGenAIClients = () => {
    const project = getProject();
    const aiStudioKey = process.env.GOOGLE_AI_STUDIO_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim() || '';
    const hasVertex = Boolean(project);
    const hasAiStudio = Boolean(aiStudioKey);
    if (!hasVertex && !hasAiStudio)
        return [];
    const locations = getLocationCandidates();
    const locationsKey = locations.join(',');
    if (cachedProject === project
        && cachedLocations === locationsKey
        && cachedAiStudioKey === aiStudioKey
        && cachedClients.length) {
        return cachedClients;
    }
    cachedProject = project;
    cachedLocations = locationsKey;
    cachedAiStudioKey = aiStudioKey;
    const clients = [];
    if (hasAiStudio) {
        clients.push({
            provider: 'ai-studio',
            location: 'global',
            client: new genai_1.GoogleGenAI({ apiKey: aiStudioKey }),
        });
    }
    if (hasVertex) {
        clients.push(...locations.map(location => ({
            provider: 'vertex',
            location,
            client: new genai_1.GoogleGenAI({
                vertexai: true,
                project: project,
                location,
            }),
        })));
    }
    cachedClients = clients;
    return cachedClients;
};
const getModelCandidates = () => [
    'gemini-2.0-flash-001',
    'gemini-1.5-flash-002',
    'gemini-1.5-pro-002',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
];
let vertexUnavailable = false;
const buildRuleBasedInsights = (salesData, language = 'th') => {
    try {
        const rows = JSON.parse(salesData);
        if (!Array.isArray(rows) || rows.length === 0) {
            return language === 'en'
                ? 'No Odoo sales data was found for the selected time window.'
                : 'ยังไม่พบข้อมูลยอดขายจาก Odoo ในช่วงเวลาที่เลือก';
        }
        const totalRevenue = rows.reduce((sum, row) => sum + Number(row.revenueYesterday || 0), 0);
        const totalUnits = rows.reduce((sum, row) => sum + Number(row.salesYesterday || 0), 0);
        const top = [...rows].sort((a, b) => Number(b.revenueYesterday || 0) - Number(a.revenueYesterday || 0))[0];
        const lowStock = rows.filter(row => Number(row.stock || 0) > 0 && Number(row.stock || 0) <= 3).length;
        if (language === 'en') {
            return `Odoo summary: total sales ${totalUnits.toFixed(0)} units, total revenue ${totalRevenue.toFixed(2)} THB, top revenue product ${top?.product || '-'}, and ${lowStock} low-stock item(s).`;
        }
        return `สรุปจากข้อมูล Odoo: ยอดขายรวม ${totalUnits.toFixed(0)} ชิ้น, รายได้รวม ${totalRevenue.toFixed(2)} บาท, สินค้าทำรายได้สูงสุดคือ ${top?.product || '-'} และมีสินค้าใกล้หมดสต็อก ${lowStock} รายการ`;
    }
    catch {
        return language === 'en'
            ? 'A data-driven summary is temporarily unavailable, but Odoo connectivity is still working.'
            : 'สรุปเชิงข้อมูลไม่พร้อมใช้งานชั่วคราว แต่ระบบยังเชื่อมต่อ Odoo ได้ตามปกติ';
    }
};
const extractText = (response) => {
    if (typeof response !== 'object' || response === null)
        return '';
    const topText = response.text;
    if (typeof topText === 'string' && topText.trim())
        return topText;
    const candidates = response.candidates;
    if (!Array.isArray(candidates) || !candidates.length)
        return '';
    const first = candidates[0];
    const content = first?.content;
    if (typeof content !== 'object' || content === null)
        return '';
    const parts = content.parts;
    if (!Array.isArray(parts))
        return '';
    const texts = parts
        .map(part => {
        if (typeof part !== 'object' || part === null)
            return '';
        const partText = part.text;
        return typeof partText === 'string' ? partText : '';
    })
        .filter(Boolean);
    return texts.join('\n').trim();
};
const getErrorCode = (error) => {
    if (typeof error !== 'object' || error === null)
        return undefined;
    const maybeCode = error.code;
    if (typeof maybeCode === 'number')
        return maybeCode;
    const maybeStatus = error.status;
    if (maybeStatus === 'NOT_FOUND')
        return 404;
    const cause = error.cause;
    if (typeof cause === 'object' && cause !== null) {
        const causeCode = cause.code;
        if (typeof causeCode === 'number')
            return causeCode;
        const causeStatus = cause.status;
        if (causeStatus === 'NOT_FOUND')
            return 404;
    }
    const text = String(error.message || '');
    if (text.includes('NOT_FOUND') || text.includes('was not found'))
        return 404;
    return undefined;
};
const generateTextWithFallback = async (clients, prompt, temperature) => {
    let lastError;
    for (const { client } of clients) {
        for (const model of getModelCandidates()) {
            try {
                const response = await client.models.generateContent({
                    model,
                    contents: prompt,
                    config: { temperature },
                });
                const text = extractText(response);
                if (text)
                    return text;
            }
            catch (error) {
                lastError = error;
                const code = getErrorCode(error);
                if (code !== 404)
                    break;
            }
        }
    }
    throw lastError;
};
const generateInsights = async (salesData, language = 'th') => {
    if (isAiOff()) {
        return buildRuleBasedInsights(salesData, language);
    }
    if (vertexUnavailable) {
        return buildRuleBasedInsights(salesData, language);
    }
    const clients = getGenAIClients();
    if (!clients.length) {
        console.warn('GenAI is not configured (set GOOGLE_AI_STUDIO_API_KEY or GOOGLE_CLOUD_PROJECT). Using rule-based insights from Odoo data.');
        return buildRuleBasedInsights(salesData, language);
    }
    const prompt = language === 'en'
        ? `Analyze the following sales and inventory data and provide a brief narrative summary in English, explaining what happened, why, and recommended actions:\n\n${salesData}`
        : `Analyze the following sales and inventory data and provide a brief narrative summary in Thai, explaining what happened, why, and recommended actions:\n\n${salesData}`;
    try {
        return await generateTextWithFallback(clients, prompt, 0.2);
    }
    catch (error) {
        if (getErrorCode(error) === 404) {
            vertexUnavailable = true;
            console.warn('Vertex model unavailable for this project/region. Falling back to rule-based insights.');
        }
        else {
            console.error('Error generating insights with Vertex AI:', error);
        }
        return buildRuleBasedInsights(salesData, language);
    }
};
exports.generateInsights = generateInsights;
const classifyIntent = async (text) => {
    if (isAiOff()) {
        return { intent: 'unknown', confidence: 0.1 };
    }
    if (vertexUnavailable) {
        return { intent: 'unknown', confidence: 0.3 };
    }
    const clients = getGenAIClients();
    if (!clients.length) {
        return { intent: 'unknown', confidence: 0.5 };
    }
    const prompt = `Classify the user intent from this text: "${text}". 
  Return JSON with "intent" (one of: product_inquiry, order_status, complaint, general_chat) and "confidence" (0.0 to 1.0).`;
    try {
        let lastError;
        for (const { client } of clients) {
            for (const model of getModelCandidates()) {
                try {
                    const response = await client.models.generateContent({
                        model,
                        contents: prompt,
                        config: {
                            temperature: 0.1,
                            responseMimeType: 'application/json',
                        },
                    });
                    const jsonStr = extractText(response) || '{}';
                    return JSON.parse(jsonStr);
                }
                catch (error) {
                    lastError = error;
                    const code = getErrorCode(error);
                    if (code !== 404)
                        break;
                }
            }
        }
        throw lastError;
    }
    catch (error) {
        if (getErrorCode(error) === 404) {
            vertexUnavailable = true;
            console.warn('Vertex model unavailable for this project/region. Falling back to heuristic intent.');
        }
        else {
            console.error('Error classifying intent:', error);
        }
        return { intent: 'unknown', confidence: 0.3 };
    }
};
exports.classifyIntent = classifyIntent;
