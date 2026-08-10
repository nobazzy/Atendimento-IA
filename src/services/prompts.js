const { db, sanitizeInput } = require('../database');
const { addAuditLog } = require('./audit');

function getPromptVersions() {
    try {
        const stmt = db.prepare('SELECT * FROM prompt_versions ORDER BY id DESC');
        return stmt.all();
    } catch (e) {
        console.error('⚠️ Erro ao buscar prompt_versions:', e.message);
        return [];
    }
}

function createPromptVersion(promptText, author = 'Alex', notes = 'Atualização de Prompt') {
    try {
        const sPrompt = sanitizeInput(promptText);
        const sAuthor = sanitizeInput(author) || 'Alex';
        const sNotes = sanitizeInput(notes) || 'Atualização manual de prompt';
        if (!sPrompt) return null;

        const last = db.prepare('SELECT MAX(version) as max_v FROM prompt_versions').get();
        const nextVersion = (last && last.max_v ? last.max_v : 0) + 1;

        const timestamp = new Date().toISOString();
        const stmt = db.prepare('INSERT INTO prompt_versions (version, prompt, author, notes, created_at) VALUES (?, ?, ?, ?, ?)');
        const res = stmt.run(nextVersion, sPrompt, sAuthor, sNotes, timestamp);

        addAuditLog(sAuthor, `Criou Prompt v${nextVersion}`, sNotes, '🔵');
        return { version: nextVersion, prompt: sPrompt, author: sAuthor, notes: sNotes, created_at: timestamp };
    } catch (e) {
        console.error('⚠️ Erro ao criar prompt_version:', e.message);
        return null;
    }
}

function restorePromptVersion(versionId, user = 'Alex') {
    try {
        const target = db.prepare('SELECT * FROM prompt_versions WHERE id = ? OR version = ?').get(versionId, versionId);
        if (!target) return null;

        const restored = createPromptVersion(target.prompt, user, `Restaurado da v${target.version}`);
        addAuditLog(user, `Restaurou Prompt v${target.version}`, `Prompt revertido com sucesso`, '🟢');
        return restored;
    } catch (e) {
        console.error('⚠️ Erro ao restaurar prompt_version:', e.message);
        return null;
    }
}

function deletePromptVersion(id, user = 'Alex') {
    try {
        db.prepare('DELETE FROM prompt_versions WHERE id = ? OR version = ?').run(id, id);
        addAuditLog(user, 'Excluiu Versão de Prompt', `ID/Versão: ${id}`, '🔴');
        return true;
    } catch (e) {
        console.error('⚠️ Erro ao excluir prompt_version:', e.message);
        return false;
    }
}

function getPersonalities() {
    try {
        const stmt = db.prepare('SELECT * FROM personalities ORDER BY created_at ASC');
        return stmt.all();
    } catch (e) {
        console.error('⚠️ Erro ao buscar personalities:', e.message);
        return [];
    }
}

function createPersonality(name, description, prompt, user = 'Alex') {
    try {
        const sName = sanitizeInput(name);
        const sDesc = sanitizeInput(description);
        const sPrompt = sanitizeInput(prompt);
        if (!sName || !sPrompt) return null;

        const id = sName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const timestamp = new Date().toISOString();

        const stmt = db.prepare('INSERT INTO personalities (id, name, description, prompt, active, created_at) VALUES (?, ?, ?, ?, 0, ?)');
        stmt.run(id, sName, sDesc, sPrompt, timestamp);

        addAuditLog(user, 'Criou Nova Personalidade/Agente', `Nome: ${sName}`, '🟢');
        return { id, name: sName, description: sDesc, prompt: sPrompt, active: 0, created_at: timestamp };
    } catch (e) {
        console.error('⚠️ Erro ao criar personality:', e.message);
        return null;
    }
}

function deletePersonality(id, user = 'Alex') {
    try {
        if (id === 'cloud') return false;
        db.prepare('DELETE FROM personalities WHERE id = ?').run(id);
        addAuditLog(user, 'Excluiu Personalidade/Agente', `ID: ${id}`, '🔴');
        return true;
    } catch (e) {
        return false;
    }
}

function setActivePersonality(id, user = 'Alex') {
    try {
        const target = db.prepare('SELECT * FROM personalities WHERE id = ?').get(id);
        if (!target) return false;

        db.prepare('UPDATE personalities SET active = 0').run();
        db.prepare('UPDATE personalities SET active = 1 WHERE id = ?').run(id);

        // Limpar histórico de respostas do assistente antigo para evitar inércia de personas passadas
        try { db.prepare("DELETE FROM chat_history WHERE sender = 'assistant'").run(); } catch(e) {}

        createPromptVersion(target.prompt, user, `Ativado Agente: ${target.name}`);
        addAuditLog(user, `Ativou Agente ${target.name}`, `Persona ${target.name} ativada com sucesso`, '🟢');
        return true;
    } catch (e) {
        console.error('⚠️ Erro ao ativar personality:', e.message);
        return false;
    }
}

function getActivePersonalityPrompt() {
    try {
        const active = db.prepare('SELECT prompt FROM personalities WHERE active = 1').get();
        if (active && active.prompt) return active.prompt;

        const latestVersion = db.prepare('SELECT prompt FROM prompt_versions ORDER BY id DESC LIMIT 1').get();
        if (latestVersion && latestVersion.prompt) return latestVersion.prompt;

        return 'Você é a CLOUD, IA assistente pessoal do Alex.';
    } catch (e) {
        return 'Você é a CLOUD, IA assistente pessoal do Alex.';
    }
}

module.exports = {
    getPromptVersions,
    createPromptVersion,
    restorePromptVersion,
    deletePromptVersion,
    getPersonalities,
    createPersonality,
    deletePersonality,
    setActivePersonality,
    getActivePersonalityPrompt
};
