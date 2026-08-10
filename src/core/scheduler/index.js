const { db } = require('../../database');
const config = require('../../config');
const { broadcastLog } = require('../../services/logs');
const { sendBotMessage, getWhatsAppStatus } = require('../whatsapp');
const { getLlmTelemetry } = require('../llm');

function startScheduler() {
    console.log('[Scheduler] ⏰ Disparador de automações ativado!');

    setInterval(async () => {
        try {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
            const todayStr = now.toISOString().split('T')[0];

            const pending = db.prepare("SELECT * FROM automations WHERE active = 1 AND time = ? AND last_run != ?").all(timeStr, todayStr);
            for (const item of pending) {
                console.log(`[Scheduler] ⏰ Disparando automação ID ${item.id} para ${item.contact_jid}...`);
                const contact = db.prepare("SELECT name FROM contacts WHERE jid = ?").get(item.contact_jid);
                const contactName = contact ? contact.name : 'amigo(a)';

                let msgText = item.message_template.replace('{nome}', contactName);
                await sendBotMessage(item.contact_jid, msgText);

                db.prepare("UPDATE automations SET last_run = ? WHERE id = ?").run(todayStr, item.id);
                db.prepare("INSERT INTO chat_history (chat_id, sender, message, timestamp) VALUES (?, ?, ?, ?)").run(item.contact_jid, 'assistant', msgText, new Date().toISOString());

                broadcastLog('automation', 'Automação Disparada', `Enviada para ${contactName} (${item.contact_jid})`, '🟢');
            }
        } catch (e) {
            console.error('⚠️ Erro no Scheduler:', e.message);
        }
    }, 60000);
}

function getSystemHealth() {
    const waStatus = getWhatsAppStatus();
    const llmStatus = getLlmTelemetry();

    return {
        node: { name: 'Node.js', status: '🟢', details: `Processo Ativo (v${process.version})` },
        sqlite: { name: 'SQLite', status: '🟢', details: 'Modo WAL Ativo' },
        whatsapp: { name: 'WhatsApp', status: waStatus.connected ? '🟢' : '🔴', details: waStatus.connected ? 'Conectado' : 'Aguardando QR Code' },
        openai: { name: config.USE_OPENAI ? 'OpenAI' : 'Ollama', status: '🟢', details: `${llmStatus.provider} (${llmStatus.activeModel})` },
        backup: { name: 'Backup', status: '🟢', details: 'Automático Diário' },
        scheduler: { name: 'Scheduler', status: '🟢', details: 'Ativo (1 min)' },
        automations: { name: 'Automações', status: '🟢', details: 'Monitoramento Contínuo' }
    };
}

module.exports = {
    startScheduler,
    getSystemHealth
};
