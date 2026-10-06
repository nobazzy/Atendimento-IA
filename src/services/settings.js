const { db, sanitizeInput } = require('../database');
const { addAuditLog } = require('./audit');

// Cache em memória para debounce de mensagens de ausência por contato
// Guarda timestamp do último envio para não reenviar repetidamente (limite: 4 horas)
const absenceSentMap = new Map();
const ABSENCE_DEBOUNCE_MS = 4 * 60 * 60 * 1000; // 4 horas

function getAllSettings(companyId = 'default') {
    try {
        // 1. Dados da Empresa
        let company = db.prepare('SELECT id, name, segment, onboarded, created_at FROM companies WHERE id = ?').get(companyId);
        if (!company) {
            company = { id: 'default', name: 'Minha Empresa', segment: 'Tecnologia', onboarded: 1, created_at: new Date().toISOString() };
        }

        // 2. Chaves de Configuração do Sistema
        const rows = db.prepare("SELECT key, value FROM system_config WHERE company_id = ? OR company_id IS NULL OR company_id = ''").all(companyId);
        const configMap = {};
        rows.forEach(r => {
            configMap[r.key] = r.value;
        });

        // Converte dias em array de números: [1, 2, 3, 4, 5]
        const rawDays = configMap.business_days || '1,2,3,4,5';
        const parsedDays = rawDays.split(',').map(d => parseInt(d.trim(), 10)).filter(d => !isNaN(d));

        // Agente / Personalidade Ativa
        const activePersona = db.prepare('SELECT id, name, description, prompt FROM personalities WHERE active = 1').get();

        return {
            company: {
                id: company.id,
                name: company.name || 'Minha Empresa',
                segment: company.segment || 'Tecnologia'
            },
            businessHours: {
                enabled: configMap.business_hours_enabled === 'true',
                start: configMap.business_hours_start || '08:00',
                end: configMap.business_hours_end || '18:00',
                days: parsedDays,
                timezone: 'America/Sao_Paulo'
            },
            absence: {
                enabled: configMap.absence_enabled === 'true',
                message: configMap.absence_message || 'Olá! No momento estamos fora do nosso horário de atendimento. Responderemos assim que retornarmos!'
            },
            ai: {
                provider: configMap.active_provider || 'openai',
                model: configMap.active_model || 'gpt-4o-mini',
                temperature: parseFloat(configMap.temperature || '0.7'),
                history_limit: parseInt(configMap.history_limit || '10', 10),
                debounce_seconds: parseFloat(configMap.ai_debounce_seconds || '4.0'),
                personality: activePersona ? activePersona.id : (configMap.active_personality || 'cloud')
            }
        };
    } catch (e) {
        console.error('⚠️ Erro ao buscar configurações:', e.message);
        return null;
    }
}

function saveAllSettings(data, user = 'Admin', companyId = 'default') {
    try {
        const nowStr = new Date().toISOString();

        // 1. Atualizar Empresa
        if (data.company) {
            const cName = sanitizeInput(data.company.name) || 'Minha Empresa';
            const cSegment = sanitizeInput(data.company.segment) || 'Tecnologia';

            db.prepare(`
                INSERT INTO companies (id, name, segment, onboarded, created_at)
                VALUES (?, ?, ?, 1, ?)
                ON CONFLICT(id) DO UPDATE SET name = excluded.name, segment = excluded.segment
            `).run(companyId, cName, cSegment, nowStr);
        }

        // 2. Atualizar Chaves de Configuração
        const setCfg = db.prepare(`
            INSERT INTO system_config (key, value, company_id, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `);

        if (data.businessHours) {
            const enabledStr = data.businessHours.enabled ? 'true' : 'false';
            const startStr = sanitizeInput(data.businessHours.start) || '08:00';
            const endStr = sanitizeInput(data.businessHours.end) || '18:00';
            const daysStr = Array.isArray(data.businessHours.days)
                ? data.businessHours.days.join(',')
                : (sanitizeInput(data.businessHours.days) || '1,2,3,4,5');

            setCfg.run('business_hours_enabled', enabledStr, companyId, nowStr);
            setCfg.run('business_hours_start', startStr, companyId, nowStr);
            setCfg.run('business_hours_end', endStr, companyId, nowStr);
            setCfg.run('business_days', daysStr, companyId, nowStr);
        }

        if (data.absence) {
            if (data.absence.enabled !== undefined) {
                const absenceEnabledStr = data.absence.enabled ? 'true' : 'false';
                setCfg.run('absence_enabled', absenceEnabledStr, companyId, nowStr);
            }
            if (data.absence.message !== undefined) {
                const absenceMsg = sanitizeInput(data.absence.message) || 'Olá! No momento estamos fora do nosso horário de atendimento.';
                setCfg.run('absence_message', absenceMsg, companyId, nowStr);
            }
        }

        if (data.ai) {
            if (data.ai.provider) setCfg.run('active_provider', sanitizeInput(data.ai.provider), companyId, nowStr);
            if (data.ai.model) setCfg.run('active_model', sanitizeInput(data.ai.model), companyId, nowStr);
            if (data.ai.temperature !== undefined) setCfg.run('temperature', String(data.ai.temperature), companyId, nowStr);
            const histLimit = data.ai.history_limit !== undefined ? data.ai.history_limit : data.ai.historyLimit;
            if (histLimit !== undefined) setCfg.run('history_limit', String(histLimit), companyId, nowStr);
            if (data.ai.debounce_seconds !== undefined) {
                const debSec = parseFloat(data.ai.debounce_seconds);
                if (!isNaN(debSec) && debSec >= 1 && debSec <= 20) {
                    setCfg.run('ai_debounce_seconds', String(debSec), companyId, nowStr);
                }
            }
            if (data.ai.personality) {
                const pId = sanitizeInput(data.ai.personality);
                setCfg.run('active_personality', pId, companyId, nowStr);
                try {
                    const { setActivePersonality } = require('./prompts');
                    setActivePersonality(pId, user);
                } catch (e) {}
            }
        }

        addAuditLog(user, 'Atualizou Configurações Gerais', `Empresa: ${data.company?.name || 'N/A'}, Horário Comercial: ${data.businessHours?.start} - ${data.businessHours?.end}`, '🟢');

        return { success: true, settings: getAllSettings(companyId) };
    } catch (e) {
        console.error('⚠️ Erro ao salvar configurações:', e.message);
        return { success: false, error: e.message };
    }
}

/**
 * Avalia se o momento atual (Horário de Brasília) está fora do expediente comercial configurado.
 * Retorna true se ESTIVER FORA do horário (e o controle estiver ativado).
 * Retorna false se o controle estiver desligado OU se estiver dentro do expediente.
 */
function isOutsideBusinessHours(customDate = null) {
    try {
        const settings = getAllSettings();
        if (!settings || !settings.businessHours || !settings.businessHours.enabled) {
            return false; // Controle desligado: sempre atende
        }

        const now = customDate || new Date();
        
        // Obter dia da semana e horário no fuso de São Paulo
        const spDateStr = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
        const spDate = new Date(spDateStr);

        const currentDay = spDate.getDay(); // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
        const currentHours = spDate.getHours();
        const currentMinutes = spDate.getMinutes();
        const currentTimeMinutes = currentHours * 60 + currentMinutes;

        // 1. Checar dia da semana
        const rawDays = settings.businessHours.days;
        const activeDays = Array.isArray(rawDays)
            ? rawDays
            : (rawDays || '1,2,3,4,5').toString().split(',').map(d => parseInt(d.trim(), 10)).filter(d => !isNaN(d));

        if (!activeDays.includes(currentDay)) {
            return true; // Hoje não é dia útil configurado (ex.: Domingo)
        }

        // 2. Checar intervalo de horário
        const [startH, startM] = (settings.businessHours.start || '08:00').split(':').map(Number);
        const [endH, endM] = (settings.businessHours.end || '18:00').split(':').map(Number);

        const startMinutes = (startH * 60) + (startM || 0);
        const endMinutes = (endH * 60) + (endM || 0);

        if (currentTimeMinutes < startMinutes || currentTimeMinutes >= endMinutes) {
            return true; // Fora da janela de horas
        }

        return false; // Dentro do horário de expediente
    } catch (e) {
        console.error('⚠️ Erro ao checar horário comercial:', e.message);
        return false; // Em caso de falha, não bloqueia o atendimento
    }
}

/**
 * Checa se a mensagem de ausência pode ser enviada para este contato (evita flood)
 */
function canSendAbsenceMessage(chatJid) {
    if (!chatJid) return false;
    const settings = getAllSettings();
    if (!settings || !settings.absence || !settings.absence.enabled) {
        return false; // Mensagem de ausência desativada
    }
    const lastSent = absenceSentMap.get(chatJid);
    if (!lastSent) return true;
    return (Date.now() - lastSent) > ABSENCE_DEBOUNCE_MS;
}

/**
 * Registra envio da mensagem de ausência para controle de debounce
 */
function recordAbsenceMessageSent(chatJid) {
    if (chatJid) {
        absenceSentMap.set(chatJid, Date.now());
        // Limpar mapa se passar de 1000 contatos
        if (absenceSentMap.size > 1000) {
            const first = absenceSentMap.keys().next().value;
            absenceSentMap.delete(first);
        }
    }
}

module.exports = {
    getAllSettings,
    saveAllSettings,
    isOutsideBusinessHours,
    canSendAbsenceMessage,
    recordAbsenceMessageSent
};
