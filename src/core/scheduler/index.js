const { db } = require('../../database');
const config = require('../../config');
const { broadcastLog } = require('../../services/logs');
const { sendBotMessage, getWhatsAppStatus } = require('../whatsapp');
const { getLlmTelemetry } = require('../llm');

function getSaoPauloDateTime(date = new Date()) {
    // Formatar tanto a hora quanto a data no fuso de São Paulo de forma 100% consistente
    const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

    const parts = formatter.formatToParts(date);
    const getPart = (type) => (parts.find(p => p.type === type) || {}).value || '';
    const day = getPart('day');
    const month = getPart('month');
    const year = getPart('year');
    const hour = getPart('hour');
    const minute = getPart('minute');

    return {
        timeStr: `${hour}:${minute}`,
        todayStr: `${year}-${month}-${day}`
    };
}

function startScheduler() {
    console.log('[Scheduler] ⏰ Disparador de automações ativado (Fuso: America/Sao_Paulo)!');

    setInterval(async () => {
        try {
            const { timeStr, todayStr } = getSaoPauloDateTime();

            // Buscar automações agendadas para o minuto atual e que ainda não rodaram hoje
            const pending = db.prepare("SELECT * FROM automations WHERE active = 1 AND time = ? AND last_run != ?").all(timeStr, todayStr);
            for (const item of pending) {
                // Idempotência preventiva: marca a execução imediatamente para evitar disparos concorrentes ou em loop
                const updateRes = db.prepare("UPDATE automations SET last_run = ? WHERE id = ? AND last_run != ?").run(todayStr, item.id, todayStr);
                if (updateRes.changes === 0) {
                    // Já processado por outra execução/thread
                    continue;
                }

                console.log(`[Scheduler] ⏰ Disparando automação ID ${item.id} para ${item.contact_jid}...`);
                const contact = db.prepare("SELECT name FROM contacts WHERE jid = ?").get(item.contact_jid);
                const contactName = contact ? contact.name : 'amigo(a)';

                const msgText = item.message_template.replace('{nome}', contactName);

                try {
                    await sendBotMessage(item.contact_jid, msgText);
                    db.prepare("INSERT INTO chat_history (chat_id, sender, message, timestamp) VALUES (?, ?, ?, ?)").run(item.contact_jid, 'assistant', msgText, new Date().toISOString());
                    broadcastLog('automation', 'Automação Disparada', `Enviada para ${contactName} (${item.contact_jid})`, '🟢');
                } catch (sendErr) {
                    console.error(`⚠️ Falha ao enviar automação #${item.id}:`, sendErr.message);
                    broadcastLog('automation', 'Falha no Envio da Automação', `Erro para ${item.contact_jid}: ${sendErr.message}`, '🔴');
                }
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
