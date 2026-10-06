const { db, sanitizeInput } = require('../database');
const { addAuditLog } = require('./audit');

function getPromptTemplates() {
    try {
        const stmt = db.prepare('SELECT * FROM prompt_templates ORDER BY niche ASC');
        return stmt.all();
    } catch (e) {
        console.error('⚠️ Erro ao buscar prompt_templates:', e.message);
        return [];
    }
}

function applyPromptTemplate(templateId, user = 'Admin', companyId = 'default') {
    try {
        const target = db.prepare('SELECT * FROM prompt_templates WHERE id = ?').get(templateId);
        if (!target) return false;

        const timestamp = new Date().toISOString();

        // 1. Inserir/Atualizar na tabela personalities e definir como ativa
        db.prepare('UPDATE personalities SET active = 0').run();
        db.prepare(`
            INSERT INTO personalities (id, name, description, prompt, active, company_id, created_at)
            VALUES (?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
                name = excluded.name,
                description = excluded.description,
                prompt = excluded.prompt,
                active = 1
        `).run(target.id, target.title, target.description, target.prompt, companyId, timestamp);

        // 2. Inserir como nova versão do prompt
        const last = db.prepare("SELECT MAX(version) as max_v FROM prompt_versions WHERE company_id = ?").get(companyId);
        const nextVersion = (last && last.max_v ? last.max_v : 0) + 1;

        db.prepare("INSERT INTO prompt_versions (version, prompt, author, notes, company_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
            .run(nextVersion, target.prompt, user, `Aplicado do Marketplace: ${target.title}`, companyId, timestamp);

        addAuditLog(user, `Aplicou Template do Marketplace: ${target.title}`, `Agente ${target.title} ativado (v${nextVersion})`, '🟢');
        return true;
    } catch (e) {
        console.error('⚠️ Erro ao aplicar template:', e.message);
        return false;
    }
}

module.exports = {
    getPromptTemplates,
    applyPromptTemplate
};
