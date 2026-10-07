/**
 * Integração Oficial ProspectBR <-> Atendimento IA (WhatsApp)
 * Permite extrair prospects com seus números e disparar abordagens
 * personalizadas contendo o link do produto na Kiwify.
 */
const { db } = require('../database');
const { broadcastLog } = require('./logs');
const { addAuditLog } = require('./audit');

let cachedToken = null;
let tokenExpiresAt = 0;

const PROSPECTBR_BASE_URL = process.env.PROSPECTBR_URL || 'http://localhost:8000/api';
const PROSPECTBR_ADMIN_EMAIL = process.env.PROSPECTBR_EMAIL || 'admin@prospectbr.com.br';
const PROSPECTBR_ADMIN_PASS = process.env.PROSPECTBR_PASSWORD || 'admin123456';

async function getProspectBRToken() {
    if (cachedToken && Date.now() < tokenExpiresAt) {
        return cachedToken;
    }

    try {
        const res = await fetch(`${PROSPECTBR_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: PROSPECTBR_ADMIN_EMAIL,
                password: PROSPECTBR_ADMIN_PASS
            })
        });

        if (!res.ok) {
            throw new Error(`Falha no login do ProspectBR: HTTP ${res.status}`);
        }

        const data = await res.json();
        cachedToken = data.access_token;
        // Token expira em 1 hora; renova após 50 minutos
        tokenExpiresAt = Date.now() + (50 * 60 * 1000);
        return cachedToken;
    } catch (err) {
        console.error('❌ [PROSPECTBR AUTH] Erro ao autenticar:', err.message);
        throw err;
    }
}

async function getCampaigns() {
    const token = await getProspectBRToken();
    const res = await fetch(`${PROSPECTBR_BASE_URL}/campaigns`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`Erro ao listar campanhas: HTTP ${res.status}`);
    return await res.json();
}

async function getCampaignProspects(campaignId = 6) {
    const token = await getProspectBRToken();
    const res = await fetch(`${PROSPECTBR_BASE_URL}/prospects?campaign_id=${campaignId}&page_size=50`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`Erro ao listar prospects: HTTP ${res.status}`);
    const data = await res.json();

    const enriched = [];
    for (const p of data.items) {
        const dRes = await fetch(`${PROSPECTBR_BASE_URL}/prospects/${p.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (dRes.ok) {
            const detail = await dRes.json();
            const waContact = detail.company.contacts.find(c => c.type === 'WHATSAPP');
            enriched.push({
                id: detail.id,
                company_id: detail.company_id,
                razao_social: detail.company.razao_social,
                nome_fantasia: detail.company.nome_fantasia || detail.company.razao_social,
                municipio: detail.company.municipio,
                uf: detail.company.uf,
                whatsapp: waContact ? waContact.value : null,
                score: detail.score,
                score_label: detail.score_label,
                status: detail.status,
                messages: detail.messages,
                can_contact: detail.can_contact
            });
        }
    }
    return enriched;
}

function normalizeToWhatsAppJid(rawNumber) {
    if (!rawNumber) return null;
    let digits = rawNumber.replace(/\D/g, '');
    if (!digits) return null;
    // Se não tiver o DDI do Brasil (55), adiciona
    if (!digits.startsWith('55') && digits.length >= 10 && digits.length <= 11) {
        digits = '55' + digits;
    }
    return `${digits}@c.us`;
}

async function updateProspectStatusOnProspectBR(prospectId, status = 'CONTACTED') {
    try {
        const token = await getProspectBRToken();
        await fetch(`${PROSPECTBR_BASE_URL}/prospects/${prospectId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status })
        });
    } catch (err) {
        console.warn(`⚠️ Não foi possível sincronizar status do prospect ${prospectId} no CRM:`, err.message);
    }
}

/**
 * Dispara uma mensagem personalizada para um prospect e inicia a conversa
 */
async function sendProspectMessage(prospectId, variant = 'SHORT') {
    const { sendBotMessage, getWhatsAppStatus } = require('../core/whatsapp');

    const waStatus = getWhatsAppStatus();
    if (!waStatus || (!waStatus.connected && !waStatus.ready)) {
        throw new Error('WhatsApp não está conectado. Conecte sua sessão antes de disparar.');
    }

    const token = await getProspectBRToken();
    const res = await fetch(`${PROSPECTBR_BASE_URL}/prospects/${prospectId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`Prospect não encontrado no ProspectBR: HTTP ${res.status}`);
    const detail = await res.json();

    const waContact = detail.company.contacts.find(c => c.type === 'WHATSAPP');
    if (!waContact || !waContact.value) {
        throw new Error(`Empresa ${detail.company.nome_fantasia} não possui número de WhatsApp cadastrado.`);
    }

    const targetJid = normalizeToWhatsAppJid(waContact.value);
    if (!targetJid) {
        throw new Error(`Número de WhatsApp inválido: ${waContact.value}`);
    }

    // Selecionar mensagem da variante escolhida ou primeira disponível
    let chosenMsg = detail.messages.find(m => m.variant === variant);
    if (!chosenMsg && detail.messages.length > 0) {
        chosenMsg = detail.messages[0];
    }

    if (!chosenMsg || !chosenMsg.content) {
        throw new Error('Nenhuma mensagem gerada para este prospect.');
    }

    const content = chosenMsg.content;

    // 1. Grava no histórico de conversas do SQLite para a IA lembrar o que enviou
    try {
        db.prepare('INSERT INTO chat_history (chat_id, sender, message, timestamp) VALUES (?, ?, ?, ?)').run(
            targetJid,
            'assistant',
            content,
            new Date().toISOString()
        );
    } catch (e) {
        console.warn('Aviso ao registrar histórico local:', e.message);
    }

    // 2. Envia a mensagem pelo WhatsApp
    console.log(`🚀 [DISPARO PROSPECÇÃO] Enviando para ${detail.company.nome_fantasia} (${targetJid})...`);
    await sendBotMessage(targetJid, content);

    // 3. Atualiza o status no ProspectBR para CONTACTED
    await updateProspectStatusOnProspectBR(prospectId, 'CONTACTED');

    // 4. Grava logs no painel
    broadcastLog('chat', 'Prospecção Ativa Disparada', `Para: ${detail.company.nome_fantasia} (${waContact.value})`, '🚀');
    addAuditLog('Sistema', `Disparo Prospecção: ${detail.company.nome_fantasia}`, `Enviado para ${waContact.value} via WhatsApp`, '🟢');

    return {
        success: true,
        prospectId,
        company: detail.company.nome_fantasia,
        whatsapp: waContact.value,
        targetJid,
        content
    };
}

// Controle de fila de disparo automático em background
let batchStatus = {
    running: false,
    total: 0,
    sent: 0,
    errors: 0,
    currentCompany: null
};

async function startBatchProspecting(campaignId = 6, variant = 'SHORT', delaySeconds = 15) {
    if (batchStatus.running) {
        return { success: false, message: 'Já existe um lote de disparos em andamento.' };
    }

    const prospects = await getCampaignProspects(campaignId);
    const eligible = prospects.filter(p => p.whatsapp && p.status !== 'CONTACTED' && p.status !== 'DO_NOT_CONTACT');

    if (eligible.length === 0) {
        return { success: false, message: 'Nenhum prospect elegível com WhatsApp pendente de envio.' };
    }

    batchStatus = {
        running: true,
        total: eligible.length,
        sent: 0,
        errors: 0,
        currentCompany: null
    };

    // Executa em segundo plano com intervalo seguro anti-ban
    (async () => {
        console.log(`🎯 [LOTE PROSPECÇÃO INICIADO] ${eligible.length} empresas na fila...`);
        for (const p of eligible) {
            if (!batchStatus.running) {
                console.log('🛑 [LOTE PAUSADO OU CANCELADO PELO USUÁRIO]');
                break;
            }

            try {
                batchStatus.currentCompany = p.nome_fantasia;
                await sendProspectMessage(p.id, variant);
                batchStatus.sent++;
            } catch (err) {
                console.error(`❌ Falha no disparo para ${p.nome_fantasia}:`, err.message);
                batchStatus.errors++;
            }

            // Intervalo de segurança randômico (ex: delaySeconds +- 5s)
            const waitTime = Math.max(5, (delaySeconds + (Math.random() * 6 - 3))) * 1000;
            console.log(`⏳ Aguardando ${(waitTime / 1000).toFixed(1)}s antes do próximo envio...`);
            await new Promise(r => setTimeout(r, waitTime));
        }

        batchStatus.running = false;
        batchStatus.currentCompany = null;
        console.log(`🏁 [LOTE FINALIZADO] Enviados: ${batchStatus.sent}, Erros: ${batchStatus.errors}`);
    })();

    return {
        success: true,
        message: `Lote iniciado com ${eligible.length} prospects. Delay de segurança: ~${delaySeconds}s por envio.`,
        total: eligible.length
    };
}

function stopBatchProspecting() {
    batchStatus.running = false;
    return { success: true, message: 'Disparos em lote interrompidos.' };
}

function getBatchStatus() {
    return batchStatus;
}

module.exports = {
    getCampaigns,
    getCampaignProspects,
    sendProspectMessage,
    startBatchProspecting,
    stopBatchProspecting,
    getBatchStatus
};
