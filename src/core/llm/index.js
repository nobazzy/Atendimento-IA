const axios = require('axios');
const config = require('../../config');
const { db } = require('../../database');
const { buildRagPromptContext } = require('../../services/rag');
const { getFormattedTrainingContext } = require('../../services/training');

const COST_PER_TOKEN_BRL = 0.0000045; 

let totalTokensToday = 0;
let totalCostTodayBrl = 0;
let errorsToday = 0;
let lastLatencyMs = 450;

function estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
}

function loadSystemConfigMap() {
    return db.prepare('SELECT key, value FROM system_config').all().reduce((acc, row) => {
        acc[row.key] = row.value;
        return acc;
    }, {});
}

function resolveDefaultModel(provider, dbConfig, modelOverride = null) {
    if (modelOverride) return modelOverride;
    if (dbConfig && dbConfig.active_model) return dbConfig.active_model;
    if (provider === 'openai') return config.OPENAI_MODEL;
    if (provider === 'gemini') return config.GEMINI_MODEL;
    if (provider === 'claude' || provider === 'anthropic') return config.ANTHROPIC_MODEL;
    if (provider === 'groq') return config.GROQ_MODEL;
    if (provider === 'deepseek') return config.DEEPSEEK_MODEL;
    if (provider === 'lmstudio') return config.LMSTUDIO_MODEL;
    if (provider === 'custom') return config.CUSTOM_MODEL;
    return config.OLLAMA_MODEL;
}

async function testPromptPlayground(userPrompt, testMessage, modelOverride, tempOverride, maxTokensOverride) {
    const startTime = Date.now();
    const temp = parseFloat(tempOverride) || 0.7;

    let enrichedSystemPrompt = userPrompt || '';
    try {
        const trainingCtx = getFormattedTrainingContext();
        const ragCtx = buildRagPromptContext(testMessage || '');
        if (trainingCtx) enrichedSystemPrompt += '\n' + trainingCtx;
        if (ragCtx) enrichedSystemPrompt += '\n' + ragCtx;
    } catch (e) {}

    const messages = [
        { role: 'system', content: enrichedSystemPrompt },
        { role: 'user', content: testMessage }
    ];

    try {
        const reply = await callAIProvider(messages, modelOverride, temp, maxTokensOverride);
        const latencyMs = Date.now() - startTime;
        const tokens = estimateTokens(enrichedSystemPrompt + testMessage + reply);
        const costBrl = (tokens * COST_PER_TOKEN_BRL).toFixed(4);

        return {
            success: true,
            reply,
            latencyMs,
            model: modelOverride || config.OPENAI_MODEL,
            tokens,
            costBrl: `R$ ${costBrl}`
        };
    } catch (e) {
        return {
            success: false,
            error: e.message,
            latencyMs: Date.now() - startTime
        };
    }
}

async function callAIProvider(messages, modelOverride = null, tempOverride = null, maxTokensOverride = null) {
    const startTime = Date.now();
    const dbConfig = loadSystemConfigMap();

    const provider = (dbConfig.active_provider || config.ACTIVE_PROVIDER).toLowerCase();
    const temperature = tempOverride !== null ? tempOverride : (parseFloat(dbConfig.temperature) || 0.7);
    const maxTokens = maxTokensOverride !== null ? maxTokensOverride : (parseInt(dbConfig.max_tokens, 10) || 2048);
    let replyText = '';

    try {
        if (provider === 'openai') {
            const model = modelOverride || dbConfig.active_model || config.OPENAI_MODEL;
            const apiKey = [REDACTED];
            if (!apiKey || apiKey === 'sua_chave_openai_aqui') throw new Error('OPENAI_API_KEY não configurada no .env');

            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                { model, messages, temperature, max_tokens: maxTokens },
                { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 60000 }
            );
            if (response.data && response.data.choices && response.data.choices[0]) {
                replyText = response.data.choices[0].message.content.trim();
                const tokensUsed = response.data.usage ? response.data.usage.total_tokens : estimateTokens(JSON.stringify(messages) + replyText);
                totalTokensToday += tokensUsed;
                totalCostTodayBrl += tokensUsed * COST_PER_TOKEN_BRL;
            }

        } else if (provider === 'gemini') {
            const model = modelOverride || dbConfig.active_model || config.GEMINI_MODEL;
            const apiKey = [REDACTED] || config.OPENAI_API_KEY;
            if (!apiKey) throw new Error('GEMINI_API_KEY não configurada no .env');

            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                {
                    contents: [{ parts: [{ text: JSON.stringify(messages) }] }],
                    generationConfig: { maxOutputTokens: maxTokens, temperature }
                },
                { timeout: 60000 }
            );
            if (response.data && response.data.candidates && response.data.candidates[0]) {
                replyText = response.data.candidates[0].content.parts[0].text.trim();
                totalTokensToday += estimateTokens(replyText);
            }

        } else if (provider === 'claude' || provider === 'anthropic') {
            const model = modelOverride || dbConfig.active_model || config.ANTHROPIC_MODEL;
            const apiKey = [REDACTED];
            if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurada no .env');

            const systemMsg = messages.find(m => m.role === 'system') ? messages.find(m => m.role === 'system').content : '';
            const userMsgs = messages.filter(m => m.role !== 'system');

            const response = await axios.post(
                'https://api.anthropic.com/v1/messages',
                { model, system: systemMsg, messages: userMsgs, max_tokens: maxTokens, temperature },
                { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 60000 }
            );
            if (response.data && response.data.content && response.data.content[0]) {
                replyText = response.data.content[0].text.trim();
                totalTokensToday += estimateTokens(replyText);
            }

        } else if (provider === 'groq') {
            const model = modelOverride || dbConfig.active_model || config.GROQ_MODEL;
            const apiKey = [REDACTED];
            if (!apiKey) throw new Error('GROQ_API_KEY não configurada no .env');

            const response = await axios.post(
                'https://api.groq.com/openai/v1/chat/completions',
                { model, messages, temperature, max_tokens: maxTokens },
                { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 45000 }
            );
            if (response.data && response.data.choices && response.data.choices[0]) {
                replyText = response.data.choices[0].message.content.trim();
                totalTokensToday += estimateTokens(replyText);
            }

        } else if (provider === 'deepseek') {
            const model = modelOverride || dbConfig.active_model || config.DEEPSEEK_MODEL;
            const apiKey = [REDACTED];
            if (!apiKey) throw new Error('DEEPSEEK_API_KEY não configurada no .env');

            const response = await axios.post(
                'https://api.deepseek.com/v1/chat/completions',
                { model, messages, temperature, max_tokens: maxTokens },
                { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 35000 }
            );
            if (response.data && response.data.choices && response.data.choices[0]) {
                replyText = response.data.choices[0].message.content.trim();
                totalTokensToday += estimateTokens(replyText);
            }

        } else if (provider === 'lmstudio') {
            const model = modelOverride || dbConfig.active_model || config.LMSTUDIO_MODEL;
            const response = await axios.post(
                config.LMSTUDIO_URL,
                { model, messages, temperature, max_tokens: maxTokens },
                { timeout: 45000 }
            );
            if (response.data && response.data.choices && response.data.choices[0]) {
                replyText = response.data.choices[0].message.content.trim();
                totalTokensToday += estimateTokens(replyText);
            }

        } else if (provider === 'custom') {
            const model = modelOverride || dbConfig.active_model || config.CUSTOM_MODEL;
            const response = await axios.post(
                config.CUSTOM_API_URL,
                { model, messages, temperature, max_tokens: maxTokens },
                { headers: config.CUSTOM_API_KEY ? { 'Authorization': `Bearer ${config.CUSTOM_API_KEY}` } : {}, timeout: 45000 }
            );
            if (response.data && response.data.choices && response.data.choices[0]) {
                replyText = response.data.choices[0].message.content.trim();
                totalTokensToday += estimateTokens(replyText);
            }

        } else {
            // Ollama Local Default Fallback
            const model = modelOverride || dbConfig.active_model || config.OLLAMA_MODEL;
            const response = await axios.post(
                config.OLLAMA_URL,
                { model, messages, stream: false, options: { temperature, num_predict: maxTokens } },
                { timeout: 90000 }
            );
            if (response.data && response.data.message) {
                replyText = response.data.message.content.trim();
                totalTokensToday += estimateTokens(replyText);
            }
        }

        lastLatencyMs = Date.now() - startTime;
        return replyText;

    } catch (e) {
        errorsToday++;
        lastLatencyMs = Date.now() - startTime;
        throw new Error(e.response ? JSON.stringify(e.response.data) : e.message);
    }
}

function getLlmTelemetry() {
    const dbConfig = loadSystemConfigMap();
    const provider = (dbConfig.active_provider || config.ACTIVE_PROVIDER).toLowerCase();

    return {
        totalTokensToday,
        totalCostTodayBrl: totalCostTodayBrl.toFixed(2),
        errorsToday,
        lastLatencyMs,
        activeModel: resolveDefaultModel(provider, dbConfig),
        provider: provider.toUpperCase()
    };
}

module.exports = {
    callAIProvider,
    testPromptPlayground,
    getLlmTelemetry
};
