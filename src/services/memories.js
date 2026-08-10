const { db, sanitizeInput } = require('../database');
const { addAuditLog } = require('./audit');

function getProfileData() {
    try {
        const stmt = db.prepare('SELECT key, value, updated_at FROM user_profile ORDER BY key ASC');
        const rows = stmt.all();
        return rows;
    } catch (e) {
        console.error('⚠️ Erro ao ler user_profile:', e.message);
        return [];
    }
}

function setProfileValue(key, value, user = 'Alex') {
    try {
        const sKey = sanitizeInput(key).toLowerCase();
        const sVal = sanitizeInput(value);
        if (!sKey) return false;

        const stmt = db.prepare(`
            INSERT INTO user_profile (key, value, updated_at) 
            VALUES (?, ?, ?) 
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `);
        stmt.run(sKey, sVal, new Date().toISOString());
        addAuditLog(user, 'Atualizou Perfil', `${sKey}: ${sVal}`, '🟢');
        return true;
    } catch (e) {
        console.error('⚠️ Erro ao salvar user_profile:', e.message);
        return false;
    }
}

function deleteProfileValue(key, user = 'Alex') {
    try {
        const sKey = sanitizeInput(key).toLowerCase();
        db.prepare('DELETE FROM user_profile WHERE key = ?').run(sKey);
        addAuditLog(user, 'Apagou Campo do Perfil', `Campo: ${sKey}`, '🔴');
        return true;
    } catch (e) {
        return false;
    }
}

function getMemories() {
    try {
        const stmt = db.prepare('SELECT id, category, fact, created_at FROM memories ORDER BY id DESC');
        return stmt.all();
    } catch (e) {
        console.error('⚠️ Erro ao ler memories:', e.message);
        return [];
    }
}

function addMemory(category, fact, user = 'Alex') {
    try {
        const sCat = sanitizeInput(category).toLowerCase() || 'geral';
        const sFact = sanitizeInput(fact);
        if (!sFact) return null;

        const timestamp = new Date().toISOString();
        const stmt = db.prepare('INSERT INTO memories (category, fact, created_at) VALUES (?, ?, ?)');
        const res = stmt.run(sCat, sFact, timestamp);
        addAuditLog(user, 'Criou Memória', `[${sCat}]: ${sFact}`, '🟢');
        return { id: res.lastInsertRowid, category: sCat, fact: sFact, created_at: timestamp };
    } catch (e) {
        console.error('⚠️ Erro ao salvar memory:', e.message);
        return null;
    }
}

function updateMemory(id, category, fact, user = 'Alex') {
    try {
        const sCat = sanitizeInput(category).toLowerCase() || 'geral';
        const sFact = sanitizeInput(fact);
        if (!sFact) return false;

        db.prepare('UPDATE memories SET category = ?, fact = ? WHERE id = ?').run(sCat, sFact, id);
        addAuditLog(user, 'Atualizou Memória', `ID ${id} -> [${sCat}]: ${sFact}`, '🟢');
        return true;
    } catch (e) {
        return false;
    }
}

function deleteMemory(id, user = 'Alex') {
    try {
        db.prepare('DELETE FROM memories WHERE id = ?').run(id);
        addAuditLog(user, 'Apagou Memória', `ID: ${id}`, '🔴');
        return true;
    } catch (e) {
        return false;
    }
}

module.exports = {
    getProfileData,
    setProfileValue,
    deleteProfileValue,
    getMemories,
    addMemory,
    updateMemory,
    deleteMemory
};
