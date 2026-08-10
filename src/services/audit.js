const { db, sanitizeInput } = require('../database');

function addAuditLog(user, action, details, status = '🟢') {
    try {
        const sUser = sanitizeInput(user) || 'Sistema';
        const sAction = sanitizeInput(action);
        const sDetails = sanitizeInput(details);
        const sStatus = sanitizeInput(status) || '🟢';
        const timestamp = new Date().toISOString();

        const stmt = db.prepare('INSERT INTO audit_logs (user, action, details, status, timestamp) VALUES (?, ?, ?, ?, ?)');
        stmt.run(sUser, sAction, sDetails, sStatus, timestamp);
    } catch (e) {
        console.error('⚠️ Erro ao salvar audit_log:', e.message);
    }
}

function getAuditLogs(limit = 50) {
    try {
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
        const stmt = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?');
        return stmt.all(limitNum);
    } catch (e) {
        console.error('⚠️ Erro ao buscar audit_logs:', e.message);
        return [];
    }
}

module.exports = {
    addAuditLog,
    getAuditLogs
};
