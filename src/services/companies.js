const { db, sanitizeInput } = require('../database');
const { addAuditLog } = require('./audit');

function getCompanies() {
    try {
        const stmt = db.prepare('SELECT * FROM companies ORDER BY name ASC');
        return stmt.all();
    } catch (e) {
        console.error('⚠️ Erro ao buscar empresas:', e.message);
        return [];
    }
}

function completeOnboarding(data, user = 'Admin') {
    try {
        const companyName = sanitizeInput(data.companyName) || 'Minha Empresa';
        const segment = sanitizeInput(data.segment) || 'Geral';
        const provider = sanitizeInput(data.provider) || 'openai';
        const model = sanitizeInput(data.model) || 'gpt-4o-mini';
        const startTime = sanitizeInput(data.businessHoursStart) || '08:00';
        const endTime = sanitizeInput(data.businessHoursEnd) || '18:00';
        const absenceMsg = sanitizeInput(data.absenceMessage) || 'Olá! Estamos indisponíveis no momento.';

        const nowStr = new Date().toISOString();
        const companyId = companyName.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'default';

        // 1. Salvar ou atualizar empresa
        db.prepare(`
            INSERT INTO companies (id, name, segment, onboarded, created_at) VALUES (?, ?, ?, 1, ?)
            ON CONFLICT(id) DO UPDATE SET name = excluded.name, segment = excluded.segment, onboarded = 1
        `).run(companyId, companyName, segment, nowStr);

        // 2. Salvar configurações do onboarding
        const setCfg = db.prepare("INSERT OR REPLACE INTO system_config (key, value, company_id, updated_at) VALUES (?, ?, ?, ?)");
        setCfg.run("active_provider", provider, companyId, nowStr);
        setCfg.run("active_model", model, companyId, nowStr);
        setCfg.run("business_hours_start", startTime, companyId, nowStr);
        setCfg.run("business_hours_end", endTime, companyId, nowStr);
        setCfg.run("absence_message", absenceMsg, companyId, nowStr);

        addAuditLog(user, 'Concluiu Onboarding de Primeiro Acesso', `Empresa: ${companyName} (${segment})`, '🟢');
        return { success: true, companyId };
    } catch (e) {
        console.error('⚠️ Erro ao concluir onboarding:', e.message);
        return { success: false, error: e.message };
    }
}

function getOnboardingStatus(companyId = 'default') {
    try {
        const row = db.prepare('SELECT onboarded FROM companies WHERE id = ?').get(companyId);
        return Boolean(row && row.onboarded === 1);
    } catch (e) {
        return false;
    }
}

module.exports = {
    getCompanies,
    completeOnboarding,
    getOnboardingStatus
};
