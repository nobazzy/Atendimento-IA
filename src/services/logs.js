const { addAuditLog } = require('./audit');

const sseClients = new Set();
const recentLogs = [];

function broadcastLog(type, event, details, status = '🟢') {
    const time = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const logItem = { id: Date.now() + Math.random(), time, type, event, details, status };

    recentLogs.unshift(logItem);
    if (recentLogs.length > 100) recentLogs.pop();

    // Notificar clientes via Server-Sent Events (SSE)
    const payload = `data: ${JSON.stringify(logItem)}\n\n`;
    for (const clientResponse of sseClients) {
        try {
            clientResponse.write(payload);
        } catch (e) {
            sseClients.delete(clientResponse);
        }
    }

    // Registrar no audit log se for evento relevante
    if (status !== '🟢' || type === 'system' || type === 'security') {
        addAuditLog('Sistema', `${type.toUpperCase()}: ${event}`, details, status);
    }
}

function registerSseClient(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Enviar histórico inicial dos últimos logs
    res.write(`data: ${JSON.stringify({ type: 'history', logs: recentLogs.slice(0, 30) })}\n\n`);

    sseClients.add(res);

    req.on('close', () => {
        sseClients.delete(res);
    });
}

function getRecentLogs() {
    return recentLogs;
}

module.exports = {
    broadcastLog,
    registerSseClient,
    getRecentLogs
};
