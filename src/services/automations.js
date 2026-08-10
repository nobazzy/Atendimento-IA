const { db, sanitizeInput } = require('../database');
const { addAuditLog } = require('./audit');

function getAutomations() {
    try {
        const stmt = db.prepare('SELECT * FROM automations ORDER BY id DESC');
        return stmt.all();
    } catch (e) {
        console.error('⚠️ Erro ao buscar automações:', e.message);
        return [];
    }
}

function addAutomation(contactJid, type, time, messageTemplate, user = 'Alex') {
    try {
        const sJid = sanitizeInput(contactJid);
        const sType = sanitizeInput(type) || 'Lembrete';
        const sTime = sanitizeInput(time);
        const sTpl = sanitizeInput(messageTemplate);
        if (!sJid || !sTime || !sTpl) return null;

        const timestamp = new Date().toISOString();
        const stmt = db.prepare('INSERT INTO automations (contact_jid, type, time, message_template, active, created_at) VALUES (?, ?, ?, ?, 1, ?)');
        const res = stmt.run(sJid, sType, sTime, sTpl, timestamp);

        addAuditLog(user, 'Criou Agendamento/Automação', `Para: ${sJid} às ${sTime}`, '🟢');
        return { id: res.lastInsertRowid, contact_jid: sJid, type: sType, time: sTime, message_template: sTpl, active: 1, created_at: timestamp };
    } catch (e) {
        console.error('⚠️ Erro ao criar automação:', e.message);
        return null;
    }
}

function toggleAutomation(id, active, user = 'Alex') {
    try {
        const val = active ? 1 : 0;
        db.prepare('UPDATE automations SET active = ? WHERE id = ?').run(val, id);
        addAuditLog(user, active ? 'Ativou Automação' : 'Pausou Automação', `ID: ${id}`, active ? '🟢' : '🔵');
        return true;
    } catch (e) {
        return false;
    }
}

function deleteAutomation(id, user = 'Alex') {
    try {
        db.prepare('DELETE FROM automations WHERE id = ?').run(id);
        addAuditLog(user, 'Apagou Automação', `ID: ${id}`, '🔴');
        return true;
    } catch (e) {
        return false;
    }
}

module.exports = {
    getAutomations,
    addAutomation,
    toggleAutomation,
    deleteAutomation
};
