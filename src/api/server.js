const express = require('express');
const path = require('path');
const config = require('../config');
const { db } = require('../database');
const { registerSseClient, getRecentLogs, broadcastLog } = require('../services/logs');
const { getAuditLogs, addAuditLog } = require('../services/audit');
const { getPromptVersions, createPromptVersion, restorePromptVersion, deletePromptVersion, getPersonalities, createPersonality, deletePersonality, setActivePersonality } = require('../services/prompts');
const { getFaqs, addFaq, updateFaq, deleteFaq, getTrainingRules, addTrainingRule, updateTrainingRule, deleteTrainingRule, getKnowledgeDocs, addKnowledgeDoc, deleteKnowledgeDoc } = require('../services/training');
const { getAllContacts, saveContact, deleteContact, blockContact, unblockContact, getBlockedContacts, toggleManualOverride, isManualOverrideActive, resolveContactDisplay } = require('../services/contacts');
const { getProfileData, setProfileValue, deleteProfileValue, getMemories, addMemory, updateMemory, deleteMemory } = require('../services/memories');
const { getAutomations, addAutomation, toggleAutomation, deleteAutomation } = require('../services/automations');
const { getPromptTemplates, applyPromptTemplate } = require('../services/templates');
const { completeOnboarding, getOnboardingStatus, getCompanies } = require('../services/companies');
const { getBusinessAnalytics } = require('../services/analytics');
const { backupDatabase, getBackupList } = require('../services/backups');
const { testPromptPlayground, getLlmTelemetry } = require('../core/llm');
const { getWhatsAppStatus, sendBotMessage, syncWhatsAppContacts, resolveSingleLid } = require('../core/whatsapp');
const { getSystemHealth } = require('../core/scheduler');

function createServer() {
    const app = express();

    app.use(express.json());
    app.use(express.static(path.join(__dirname, '../../public')));

    // ─── ONBOARDING WIZARD ───
    app.get('/api/onboarding/status', (req, res) => {
        res.json({ success: true, onboarded: getOnboardingStatus() });
    });

    app.post('/api/onboarding/setup', (req, res) => {
        const result = completeOnboarding(req.body, 'Alex');
        res.json(result);
    });

    // ─── ANALYTICS DE NEGÓCIO & NOC MONITOR ───
    app.get('/api/analytics', (req, res) => {
        const analytics = getBusinessAnalytics();
        res.json({ success: true, analytics });
    });

    app.get('/api/noc/status', (req, res) => {
        const health = getSystemHealth();
        const llmStats = getLlmTelemetry();
        const waStatus = getWhatsAppStatus();

        res.json({
            success: true,
            noc: {
                health,
                llmStats,
                waStatus,
                serverTime: new Date().toLocaleTimeString('pt-BR')
            }
        });
    });

    // ─── MARKETPLACE DE PROMPTS ───
    app.get('/api/templates', (req, res) => {
        res.json({ success: true, templates: getPromptTemplates() });
    });

    app.post('/api/templates/apply', (req, res) => {
        const { templateId } = req.body;
        const ok = applyPromptTemplate(templateId, 'Alex');
        res.json({ success: ok });
    });

    // ─── RAG KNOWLEDGE BASE (DOCUMENTOS & URLS) ───
    app.get('/api/training/docs', (req, res) => {
        res.json({ success: true, docs: getKnowledgeDocs() });
    });

    app.post('/api/training/docs', (req, res) => {
        const { title, type, content, source } = req.body;
        const doc = addKnowledgeDoc(title, type, content, source, 'Alex');
        res.json({ success: Boolean(doc), doc });
    });

    app.delete('/api/training/docs/:id', (req, res) => {
        const ok = deleteKnowledgeDoc(req.params.id, 'Alex');
        res.json({ success: ok });
    });

    // ─── SSE LOGS STREAM ───
    app.get('/api/logs/stream', (req, res) => {
        registerSseClient(req, res);
    });

    app.get('/api/logs/recent', (req, res) => {
        res.json({ success: true, logs: getRecentLogs() });
    });

    // ─── DASHBOARD EXECUTIVO ───
    app.get('/api/dashboard', (req, res) => {
        try {
            const analytics = getBusinessAnalytics();
            const llmStats = getLlmTelemetry();
            const waStatus = getWhatsAppStatus();
            const health = getSystemHealth();

            res.json({
                success: true,
                metrics: {
                    totalChats: analytics.totalLeads,
                    messagesToday: analytics.messagesToday,
                    aiResponsesToday: analytics.aiResponsesToday,
                    humanHandled: analytics.humanHandled,
                    aiResolutionRate: analytics.aiResolutionRate,
                    hoursSaved: analytics.hoursSaved,
                    costSavedBrl: analytics.costSavedBrl,
                    conversionRate: analytics.conversionRate,
                    successRate: '98.5%',
                    tokensToday: llmStats.totalTokensToday,
                    costTodayBrl: `R$ ${llmStats.totalCostTodayBrl}`,
                    errorsToday: llmStats.errorsToday
                },
                waStatus,
                llmStats,
                health
            });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ─── BUSCA GLOBAL (CTRL + K) ───
    app.get('/api/search', (req, res) => {
        try {
            const q = (req.query.q || '').trim();
            if (!q) return res.json({ success: true, results: [] });

            const pattern = `%${q}%`;
            
            const contacts = db.prepare("SELECT jid, name, relationship, tags FROM contacts WHERE name LIKE ? OR jid LIKE ? OR notes LIKE ? LIMIT 5").all(pattern, pattern, pattern);
            const chatHistory = db.prepare("SELECT chat_id, message, timestamp FROM chat_history WHERE message LIKE ? ORDER BY id DESC LIMIT 5").all(pattern);
            const memories = db.prepare("SELECT id, category, fact FROM memories WHERE fact LIKE ? OR category LIKE ? LIMIT 5").all(pattern, pattern);
            const faqs = db.prepare("SELECT id, question, answer FROM faqs WHERE question LIKE ? OR answer LIKE ? LIMIT 5").all(pattern, pattern);
            const docs = db.prepare("SELECT id, title, type FROM knowledge_docs WHERE title LIKE ? OR content LIKE ? LIMIT 5").all(pattern, pattern);

            res.json({
                success: true,
                results: {
                    contacts,
                    chatHistory,
                    memories,
                    faqs,
                    docs
                }
            });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ─── CONVERSAS & ATENDIMENTO MANUAL ───
    app.get('/api/chats', (req, res) => {
        try {
            const rows = db.prepare(`
                SELECT h.chat_id, MAX(h.timestamp) as last_time,
                       (SELECT message FROM chat_history WHERE chat_id = h.chat_id ORDER BY id DESC LIMIT 1) as last_message
                FROM chat_history h
                GROUP BY h.chat_id
                ORDER BY last_time DESC
            `).all();

            const chats = rows.map(r => {
                const resolved = resolveContactDisplay(r.chat_id);
                return {
                    chat_id: r.chat_id,
                    name: resolved.name,
                    display_name: resolved.display,
                    phone_jid: resolved.phoneJid,
                    last_time: r.last_time,
                    last_message: r.last_message,
                    manual_override: isManualOverrideActive(r.chat_id)
                };
            });

            res.json({ success: true, chats });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.get('/api/chats/:chatId/messages', (req, res) => {
        try {
            const chatId = req.params.chatId;
            const messages = db.prepare("SELECT sender, message, timestamp FROM chat_history WHERE chat_id = ? ORDER BY id ASC LIMIT 100").all(chatId);
            const resolved = resolveContactDisplay(chatId);
            res.json({ 
                success: true, 
                messages, 
                chat_info: resolved,
                manual_override: isManualOverrideActive(chatId) 
            });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.delete('/api/chats/:chatId/history', (req, res) => {
        try {
            const chatId = req.params.chatId;
            db.prepare('DELETE FROM chat_history WHERE chat_id = ?').run(chatId);
            addAuditLog('Alex', 'Apagou Histórico da Conversa', `Chat: ${chatId}`, '🔴');
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/chats/:chatId/manual-override', (req, res) => {
        try {
            const chatId = req.params.chatId;
            const pause = Boolean(req.body.pause);
            toggleManualOverride(chatId, pause);
            res.json({ success: true, manual_override: pause });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/chats/:chatId/send', async (req, res) => {
        try {
            const chatId = req.params.chatId;
            const message = req.body.message;
            if (!message) return res.status(400).json({ success: false, error: 'Mensagem vazia' });

            await sendBotMessage(chatId, message);
            db.prepare('INSERT INTO chat_history (chat_id, sender, message, timestamp) VALUES (?, ?, ?, ?)').run(chatId, 'assistant', message, new Date().toISOString());
            broadcastLog('chat', 'Mensagem Manual Enviada pelo Painel', `Para: ${chatId}`, '🔵');

            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ─── PROMPTS, VERSIONAMENTO & PERSONALIDADES ───
    app.get('/api/prompts/versions', (req, res) => {
        res.json({ success: true, versions: getPromptVersions() });
    });

    app.post('/api/prompts/versions', (req, res) => {
        const { prompt, notes } = req.body;
        const created = createPromptVersion(prompt, 'Alex', notes);
        res.json({ success: Boolean(created), version: created });
    });

    app.post('/api/prompts/versions/restore', (req, res) => {
        const { versionId } = req.body;
        const restored = restorePromptVersion(versionId, 'Alex');
        res.json({ success: Boolean(restored), version: restored });
    });

    app.delete('/api/prompts/versions/:id', (req, res) => {
        const ok = deletePromptVersion(req.params.id, 'Alex');
        res.json({ success: ok });
    });

    app.get('/api/personalities', (req, res) => {
        res.json({ success: true, personalities: getPersonalities() });
    });

    app.post('/api/personalities', (req, res) => {
        const { name, description, prompt } = req.body;
        const created = createPersonality(name, description, prompt, 'Alex');
        res.json({ success: Boolean(created), personality: created });
    });

    app.delete('/api/personalities/:id', (req, res) => {
        const ok = deletePersonality(req.params.id, 'Alex');
        res.json({ success: ok });
    });

    app.post('/api/personalities/active', (req, res) => {
        const { id } = req.body;
        const ok = setActivePersonality(id, 'Alex');
        res.json({ success: ok });
    });

    // ─── TREINAMENTO (FAQS E REGRAS) ───
    app.get('/api/training/faqs', (req, res) => {
        res.json({ success: true, faqs: getFaqs() });
    });

    app.post('/api/training/faqs', (req, res) => {
        const { question, answer, category } = req.body;
        const faq = addFaq(question, answer, category, 'Alex');
        res.json({ success: Boolean(faq), faq });
    });

    app.put('/api/training/faqs/:id', (req, res) => {
        const { question, answer, category } = req.body;
        const ok = updateFaq(req.params.id, question, answer, category, 'Alex');
        res.json({ success: ok });
    });

    app.delete('/api/training/faqs/:id', (req, res) => {
        const ok = deleteFaq(req.params.id, 'Alex');
        res.json({ success: ok });
    });

    app.get('/api/training/rules', (req, res) => {
        res.json({ success: true, rules: getTrainingRules() });
    });

    app.post('/api/training/rules', (req, res) => {
        const { rule } = req.body;
        const newRule = addTrainingRule(rule, 'Alex');
        res.json({ success: Boolean(newRule), rule: newRule });
    });

    app.put('/api/training/rules/:id', (req, res) => {
        const { rule } = req.body;
        const ok = updateTrainingRule(req.params.id, rule, 'Alex');
        res.json({ success: ok });
    });

    app.delete('/api/training/rules/:id', (req, res) => {
        const ok = deleteTrainingRule(req.params.id, 'Alex');
        res.json({ success: ok });
    });

    // ─── PLAYGROUND DE TESTES ───
    app.post('/api/playground', async (req, res) => {
        const { userPrompt, testMessage, model, temperature } = req.body;
        const result = await testPromptPlayground(userPrompt, testMessage, model, temperature);
        res.json(result);
    });

    // ─── CONTATOS & BLACKLIST ───
    app.get('/api/contacts', (req, res) => {
        res.json({ success: true, contacts: getAllContacts(), blocked: getBlockedContacts() });
    });

    app.post('/api/contacts', (req, res) => {
        const { jid, name, relationship, notes, customPrompt, tags, favorite, lid_jid } = req.body;
        const contact = saveContact(jid, name, relationship, notes, customPrompt, tags, favorite, 'Alex', lid_jid || '');
        res.json({ success: Boolean(contact), contact });
    });

    app.delete('/api/contacts/:jid', (req, res) => {
        const ok = deleteContact(req.params.jid, 'Alex');
        res.json({ success: ok });
    });

    app.post('/api/contacts/block', (req, res) => {
        const { jidOrNumber, name } = req.body;
        const ok = blockContact(jidOrNumber, name, 'Alex');
        res.json({ success: ok });
    });

    app.post('/api/contacts/unblock', (req, res) => {
        const { jidOrNumber } = req.body;
        const ok = unblockContact(jidOrNumber, 'Alex');
        res.json({ success: ok });
    });

    app.post('/api/contacts/sync', async (req, res) => {
        const result = await syncWhatsAppContacts();
        res.json(result);
    });

    app.post('/api/contacts/resolve-lids', async (req, res) => {
        const { targetJid } = req.body;
        if (targetJid) {
            const resSingle = await resolveSingleLid(targetJid);
            res.json(resSingle);
        } else {
            const result = await syncWhatsAppContacts();
            res.json(result);
        }
    });

    // ─── MEMÓRIAS & PERFIL ───
    app.get('/api/memories', (req, res) => {
        res.json({ success: true, memories: getMemories(), profile: getProfileData() });
    });

    app.post('/api/memories', (req, res) => {
        const { category, fact } = req.body;
        const memory = addMemory(category, fact, 'Alex');
        res.json({ success: Boolean(memory), memory });
    });

    app.put('/api/memories/:id', (req, res) => {
        const { category, fact } = req.body;
        const ok = updateMemory(req.params.id, category, fact, 'Alex');
        res.json({ success: ok });
    });

    app.delete('/api/memories/:id', (req, res) => {
        const ok = deleteMemory(req.params.id, 'Alex');
        res.json({ success: ok });
    });

    app.post('/api/profile', (req, res) => {
        const { key, value } = req.body;
        const ok = setProfileValue(key, value, 'Alex');
        res.json({ success: ok });
    });

    app.delete('/api/profile/:key', (req, res) => {
        const ok = deleteProfileValue(req.params.key, 'Alex');
        res.json({ success: ok });
    });

    // ─── AUTOMAÇÕES ───
    app.get('/api/automations', (req, res) => {
        res.json({ success: true, automations: getAutomations() });
    });

    app.post('/api/automations', (req, res) => {
        const { contact_jid, type, time, message_template } = req.body;
        const auto = addAutomation(contact_jid, type, time, message_template, 'Alex');
        res.json({ success: Boolean(auto), automation: auto });
    });

    app.put('/api/automations/:id', (req, res) => {
        const { active } = req.body;
        const ok = toggleAutomation(req.params.id, Boolean(active), 'Alex');
        res.json({ success: ok });
    });

    app.delete('/api/automations/:id', (req, res) => {
        const ok = deleteAutomation(req.params.id, 'Alex');
        res.json({ success: ok });
    });

    // ─── AUDITORIA & BACKUPS ───
    app.get('/api/audit', (req, res) => {
        res.json({ success: true, logs: getAuditLogs() });
    });

    app.get('/api/backups', (req, res) => {
        res.json({ success: true, backups: getBackupList() });
    });

    app.post('/api/backups/create', (req, res) => {
        const backupName = backupDatabase('Alex');
        res.json({ success: Boolean(backupName), backupName });
    });

    // ─── AÇÕES DE SISTEMA ───
    app.post('/api/system/action', (req, res) => {
        const { action } = req.body;
        if (action === 'kill') {
            addAuditLog('Alex', 'Kill Switch Acionado pelo Painel Web', 'Servidor encerrado', '🔴');
            res.json({ success: true, message: 'Servidor sendo desligado...' });
            setTimeout(() => process.exit(0), 1000);
        } else {
            res.status(400).json({ success: false, error: 'Ação desconhecida' });
        }
    });

    return app;
}

function startServer() {
    const app = createServer();
    app.listen(config.PORT, () => {
        console.log(`\n🚀 PAINEL WEB COMERCIAL DISPONÍVEL EM: http://localhost:${config.PORT}`);
        broadcastLog('system', 'Servidor Web Ativo', `Painel acessível em http://localhost:${config.PORT}`, '🟢');
    });
}

module.exports = {
    createServer,
    startServer
};
