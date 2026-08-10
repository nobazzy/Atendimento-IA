const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { db } = require('../../database');
const { broadcastLog } = require('../../services/logs');
const { getActivePersonalityPrompt } = require('../../services/prompts');
const { getFormattedTrainingContext, getKnowledgeDocs } = require('../../services/training');
const { getAllContacts, getBlockedContacts, isContactBlocked, blockContact, unblockContact, saveContact, cleanUnsavedSyncedContacts, isManualOverrideActive, saveLidMapping, resolveContactDisplay } = require('../../services/contacts');
const { getProfileData, setProfileValue, getMemories, addMemory } = require('../../services/memories');
const { getAutomations } = require('../../services/automations');
const { getPromptTemplates } = require('../../services/templates');
const { getBusinessAnalytics } = require('../../services/analytics');
const { getLlmTelemetry, callAIProvider } = require('../llm');
const { addAuditLog } = require('../../services/audit');

let selfJids = new Set();
if (fs.existsSync(config.SELF_JIDS_PATH)) {
    try {
        const raw = fs.readFileSync(config.SELF_JIDS_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) parsed.forEach(j => selfJids.add(j));
    } catch (e) {}
}
if (config.MY_NUMBER) {
    const cleanMyNum = config.MY_NUMBER.replace(/\D/g, '');
    if (cleanMyNum) {
        selfJids.add(`${cleanMyNum}@c.us`);
        selfJids.add(`${cleanMyNum}@lid`);
        selfJids.add(cleanMyNum);
    }
}

function updateSelfInfo(clientObj) {
    try {
        if (clientObj && clientObj.info && clientObj.info.wid) {
            const widObj = clientObj.info.wid;
            if (widObj.user) {
                selfJids.add(`${widObj.user}@c.us`);
                selfJids.add(`${widObj.user}@lid`);
                selfJids.add(widObj.user);
            }
            if (widObj._serialized) selfJids.add(widObj._serialized);
        }
        if (config.MY_NUMBER) {
            const clean = config.MY_NUMBER.replace(/\D/g, '');
            if (clean) {
                selfJids.add(`${clean}@c.us`);
                selfJids.add(`${clean}@lid`);
                selfJids.add(clean);
            }
        }
        fs.writeFileSync(config.SELF_JIDS_PATH, JSON.stringify(Array.from(selfJids), null, 2), 'utf8');
    } catch (e) {}
}

const hasAuth = fs.existsSync(config.AUTH_DIR) && fs.readdirSync(config.AUTH_DIR).length > 0;

const client = new Client({
    authStrategy: new LocalAuth(),
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1044865073-alpha.html'
    },
    puppeteer: {
        headless: hasAuth,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
        ]
    }
});

let isReady = false;
let globalIsPaused = false;
const botSentMsgIds = new Set();
const botSentTexts = new Set();
let startupTimestamp = Date.now(); // Ignora mensagens antigas que chegam antes deste timestamp

// Timeout wrapper para qualquer operação Puppeteer
function withTimeout(promise, ms = 10000) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout ${ms}ms`)), ms))
    ]);
}

// ─── FILA SERIAL DE ENVIO (evita deadlock do Puppeteer com envios concorrentes) ───
const sendQueue = [];
let isSending = false;

async function processSendQueue() {
    if (isSending || sendQueue.length === 0) return;
    isSending = true;
    while (sendQueue.length > 0) {
        const { targetJid, content, resolve } = sendQueue.shift();
        let sent = null;
        try {
            console.log(`📤 [ENVIANDO] Destino: [${targetJid}]...`);
            sent = await withTimeout(client.sendMessage(targetJid, content), 15000);
            console.log(`✅ [ENTREGUE] Para [${targetJid}]`);
        } catch (sendErr) {
            console.warn(`⚠️ Envio para [${targetJid}] falhou (${sendErr.message}).`);
            // Fallback: Se @lid falhou, tentar @c.us mapeado
            if (targetJid.includes('@lid')) {
                const mapped = db.prepare("SELECT phone_jid, phone_number FROM lid_mappings WHERE lid = ?").get(targetJid);
                let fallbackJid = null;
                if (mapped && mapped.phone_jid && !mapped.phone_jid.startsWith('27')) {
                    fallbackJid = mapped.phone_jid;
                } else if (mapped && mapped.phone_number && !mapped.phone_number.startsWith('27')) {
                    fallbackJid = `${mapped.phone_number}@c.us`;
                }
                if (fallbackJid) {
                    try {
                        console.log(`📤 [FALLBACK] Destino: [${fallbackJid}]...`);
                        sent = await withTimeout(client.sendMessage(fallbackJid, content), 15000);
                        console.log(`✅ [ENTREGUE VIA FALLBACK] Para [${fallbackJid}]`);
                    } catch (fbErr) {
                        console.error(`⚠️ Fallback [${fallbackJid}] falhou:`, fbErr.message);
                    }
                }
            }
        }
        if (sent && sent.id && sent.id.id) {
            botSentMsgIds.add(sent.id.id);
            if (botSentMsgIds.size > 1000) {
                const first = botSentMsgIds.values().next().value;
                botSentMsgIds.delete(first);
            }
        }
        resolve(sent);
        // Aguardar 1s entre envios para não sobrecarregar o Puppeteer
        await new Promise(r => setTimeout(r, 1000));
    }
    isSending = false;
}

async function sendBotMessage(targetJid, content, originalMsg = null) {
    try {
        if (!content || !targetJid) return;
        const trimmed = content.trim();
        botSentTexts.add(trimmed);
        if (botSentTexts.size > 1000) {
            const first = botSentTexts.values().next().value;
            botSentTexts.delete(first);
        }
        return new Promise((resolve) => {
            sendQueue.push({ targetJid, content, resolve });
            processSendQueue();
        });
    } catch (e) {
        console.error(`⚠️ Erro ao enviar mensagem pelo bot para [${targetJid}]:`, e.message);
        broadcastLog('error', 'Envio de Mensagem Falhou', e.message, '🔴');
    }
}

function cleanNumber(jidStr) {
    if (!jidStr) return '';
    return jidStr.split('@')[0].replace(/\D/g, '');
}

function isHumanName(str) {
    if (!str || typeof str !== 'string') return false;
    str = str.trim();
    if (!str) return false;
    const cleanDigits = str.replace(/\D/g, '');
    if (cleanDigits.length >= 6) return false;
    if (/^[\d\s\+\-\@\._]+$/.test(str)) return false;
    return true;
}

function checkIsSelf(msg, clientObj = client, selfJidsSet = selfJids) {
    if (!msg) return false;

    const fromNum = msg.from ? msg.from.split('@')[0].replace(/\D/g, '') : '';
    const toNum = msg.to ? msg.to.split('@')[0].replace(/\D/g, '') : '';
    const remoteNum = (msg.id && msg.id.remote) ? msg.id.remote.split('@')[0].replace(/\D/g, '') : '';
    const myNum = config.MY_NUMBER ? config.MY_NUMBER.replace(/\D/g, '') : '';
    const widUser = (clientObj && clientObj.info && clientObj.info.wid && clientObj.info.wid.user) ? clientObj.info.wid.user : '';

    const isFromAlex = (myNum && fromNum === myNum) || (widUser && fromNum === widUser) || selfJidsSet.has(msg.from);
    const isToAlex = (myNum && toNum === myNum) || (widUser && toNum === widUser) || (myNum && remoteNum === myNum) || (widUser && remoteNum === widUser) || selfJidsSet.has(msg.to) || (msg.id && selfJidsSet.has(msg.id.remote));

    // Se a mensagem foi enviada por mim (msg.fromMe === true)
    if (msg.fromMe) {
        // É auto-mensagem (Chat 'Você') apenas se o destinatário/remote for o próprio Alex
        if (isToAlex || (toNum && myNum && toNum === myNum) || (toNum && widUser && toNum === widUser)) return true;
        return false;
    }

    // Se a mensagem foi recebida (!msg.fromMe), é self apenas se o remetente for o próprio Alex
    if (isFromAlex) return true;

    return false;
}

function getHelpMenuText() {
    return `⚡ *CENTRAL DE COMANDOS DA CLOUD (!nobazzy)*
━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 *PERFIL DO ALEX (SQLITE)*
• \`!nobazzy perfil\` ➔ Ver dados cadastrados no perfil
• \`!nobazzy set <chave> <valor>\` ➔ Atualizar dado (ex: \`!nobazzy set cidade São Paulo\`)

🧠 *MEMÓRIAS & ANOTAÇÕES*
• \`!nobazzy memorias\` ➔ Listar fatos e memórias gravadas
• \`!nobazzy nota <texto>\` ➔ Gravar anotação rápida no SQLite

📇 *AGENDA DE CONTATOS*
• \`!nobazzy contatos\` ➔ Listar contatos cadastrados
• \`!nobazzy contato <num> <nome> <relação>\` ➔ Cadastrar contato

🚫 *BLACKLIST DE BLOQUEIO DE RESPOSTAS*
• \`!bloquear <número>\` ➔ Bloquear respostas automáticas para um celular
• \`!bloquear\` ➔ Digite no chat de qualquer pessoa para bloqueá-la em silêncio
• \`!desbloquear <número>\` ➔ Desbloquear pessoa
• \`!desbloquear\` ➔ Digite no chat de qualquer pessoa para desbloqueá-la em silêncio
• \`!bloqueados\` ➔ Listar contatos na Blacklist

⏰ *DISPARADOR DE AUTOMAÇÕES*
• \`!nobazzy automacoes\` ➔ Ver agendamentos e envios diários

🔴 *CONTROLE REMOTO DE ATENDIMENTO*
• \`!pausar\` ➔ Pausar respostas automáticas para terceiros (Modo Silencioso)
• \`!retomar\` ➔ Reativar atendimento automático para terceiros
• \`!desligar\` ➔ Encerrar o processo da IA no computador (Kill-Switch)

📊 *TELEMETRIA & LIMPEZA*
• \`!status\` ➔ Ver status da IA e estatísticas
• \`!limpar\` ➔ Apagar histórico desta conversa no SQLite
• \`!nobazzy rag\` ➔ Listar documentos RAG indexados
• \`!nobazzy templates\` ➔ Listar templates de prompts por nicho`;
}

function getProfileText() {
    const profile = getProfileData();
    let txt = `📋 *PERFIL DO ALEX (CADASTRO NO SQLITE)*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (profile.length === 0) {
        txt += `Nenhum dado cadastrado ainda. Use \`!nobazzy set <chave> <valor>\` para cadastrar.`;
    } else {
        profile.forEach(p => { txt += `• *${p.key}*: ${p.value}\n`; });
    }
    return txt;
}

function getMemoriesText() {
    const memories = getMemories();
    let txt = `🧠 *MEMÓRIAS & ANOTAÇÕES GRAVADAS*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (memories.length === 0) {
        txt += `Nenhuma memória gravada ainda. Use \`!nobazzy nota <texto>\` para anotações.`;
    } else {
        memories.slice(0, 15).forEach(m => { txt += `• [${m.category}] ${m.fact}\n`; });
    }
    return txt;
}

function getContactsText() {
    const contacts = getAllContacts();
    let txt = `📇 *AGENDA DE CONTATOS REGISTRADOS (${contacts.length})*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    contacts.slice(0, 15).forEach(c => {
        const isB = Number(c.auto_reply) === 0 || c.relationship === 'Bloqueado';
        txt += `• *${c.name}* (${c.jid.replace('@c.us','')}) - ${c.relationship} ${isB ? '🔴 [Bloqueado]' : '🟢 [Ativo]'}\n`;
    });
    return txt;
}

function getBlockedText() {
    const blocked = getBlockedContacts();
    let txt = `🚫 *CONTATOS NA BLACKLIST (${blocked.length})*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (blocked.length === 0) {
        txt += `Nenhum contato bloqueado no momento.`;
    } else {
        blocked.forEach(b => { txt += `• *${b.name}* (${b.jid})\n`; });
    }
    return txt;
}

function getAutomationsText() {
    const autos = getAutomations();
    let txt = `⏰ *AGENDAMENTOS E AUTOMAÇÕES ATIVAS (${autos.length})*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (autos.length === 0) {
        txt += `Nenhuma automação cadastrada no momento.`;
    } else {
        autos.forEach(a => { txt += `• [${a.time}] ${a.contact_jid} - ${a.type} (${a.active ? '🟢 Ativa' : '🔴 Pausada'})\n`; });
    }
    return txt;
}

function getStatusText() {
    const analytics = getBusinessAnalytics();
    const llmStats = getLlmTelemetry();
    return `📊 *TELEMETRIA & METRICAS CLOUD AI*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🟢 *WhatsApp Status:* Conectado MD\n` +
        `🤖 *Provedor IA:* ${llmStats.provider} (${llmStats.activeModel})\n` +
        `⏱️ *Latência Média:* ${llmStats.lastLatencyMs} ms\n` +
        `📊 *Tokens Consumidos Hoje:* ${llmStats.totalTokensToday.toLocaleString()}\n` +
        `💰 *Custo IA Hoje:* R$ ${llmStats.totalCostTodayBrl}\n` +
        `💵 *Economia Estimada:* ${analytics.costSavedBrl}\n` +
        `🎯 *Leads Atendidos:* ${analytics.totalLeads}\n` +
        `🤖 *Autonomia da IA:* ${analytics.aiResolutionRate}\n` +
        `⏸️ *Status do Atendimento:* ${globalIsPaused ? '🔴 Pausado' : '🟢 Ativo'}`;
}

function getRagText() {
    const docs = getKnowledgeDocs();
    let txt = `📂 *BASE DE CONHECIMENTO RAG INDEXADA (${docs.length})*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (docs.length === 0) {
        txt += `Nenhum documento indexado no momento.`;
    } else {
        docs.forEach(d => { txt += `• [${d.type.toUpperCase()}] *${d.title}*\n`; });
    }
    return txt;
}

function getTemplatesText() {
    const tpls = getPromptTemplates();
    let txt = `📦 *MARKETPLACE DE TEMPLATES DE PROMPT*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    tpls.forEach(t => { txt += `${t.icon} *${t.title}* (${t.niche})\n  ID: \`${t.id}\`\n`; });
    return txt;
}

function buildSystemPrompt(isSelf, senderLabel, contactInfo = {}) {
    const now = new Date();
    const tzOption = { timeZone: 'America/Sao_Paulo' };
    const dataAtual = now.toLocaleDateString('pt-BR', tzOption);
    const horaAtual = now.toLocaleTimeString('pt-BR', { ...tzOption, hour: '2-digit', minute: '2-digit' });

    const activeObj = db.prepare('SELECT name, prompt FROM personalities WHERE active = 1').get();
    const personalityName = activeObj ? activeObj.name : 'Agente de IA';
    const personalityPrompt = getActivePersonalityPrompt();
    const trainingContext = getFormattedTrainingContext();
    const timeContext = `[CONTEXTO EM TEMPO REAL]\n- Data de Hoje: ${dataAtual}\n- Horário Atual: ${horaAtual}`;

    const mandatoryPersonaHeader = `[PERSONA E IDENTIDADE ATIVA DESSA IA - REGRA ABSOLUTA DO SISTEMA]
Sua única e exclusiva identidade neste atendimento é: ${personalityName}.
Siga rigorosamente as diretrizes, tom de voz, conhecimento técnico e regras de conduta especificadas abaixo:

${personalityPrompt}`;

    if (isSelf) {
        const userProfile = db.prepare('SELECT key, value FROM user_profile').all();
        let pContext = '\n[CONHECIMENTO DE PERFIL]\n';
        userProfile.forEach(p => { pContext += `- ${p.key}: ${p.value}\n`; });

        const memories = db.prepare('SELECT category, fact FROM memories ORDER BY id DESC LIMIT 20').all();
        if (memories.length > 0) {
            pContext += '\n[MEMÓRIAS IMPORTANTES]\n';
            memories.forEach(m => { pContext += `- [${m.category}]: ${m.fact}\n`; });
        }

        return `${mandatoryPersonaHeader}

[MODO DE TESTE / DIÁLOGO DIRETO]
- Você está conversando com o Alex no chat de testes/comunicação direta.
- Mantenha 100% a persona '${personalityName}' definida acima em todas as suas respostas.

${timeContext}
${pContext}
${trainingContext}`;
    } else {
        const contactJid = senderLabel.includes('@') ? senderLabel : `${senderLabel}@c.us`;
        const dbContact = db.prepare('SELECT * FROM contacts WHERE jid = ? OR phone_jid = ? OR lid_jid = ?').get(contactJid, contactJid, contactJid);

        let realName = '';
        let relationshipContext = '';
        if (dbContact && isHumanName(dbContact.name)) {
            realName = dbContact.name;
            relationshipContext = `\n[INFORMAÇÕES DESTE CONTATO / CLIENTE]\n- Nome do Cliente: ${dbContact.name}\n- Relação: ${dbContact.relationship}\n- Notas: ${dbContact.notes || 'Nenhuma'}`;
        }

        return `${mandatoryPersonaHeader}

[INSTRUÇÕES DE ATENDIMENTO A CLIENTE / TERCEIRO]
- Você está respondendo a uma mensagem enviada por um cliente ou terceiro no WhatsApp comercial.${relationshipContext}
- REGRA DE OURO: NUNCA chame o cliente de Alex.
- ${realName ? `Cumprimente o cliente pelo nome real ('${realName}').` : "Cumprimente o cliente educadamente."}
- Responda estritamente mantendo a persona '${personalityName}' e as diretrizes definidas no prompt principal da IA ativada acima.

${timeContext}
${trainingContext}`;
    }
}

client.on('qr', (qr) => {
    console.log(`\n📲 QR CODE GERADO! Escaneie no WhatsApp.`);
    qrcode.generate(qr, { small: true });
    broadcastLog('security', 'QR Code Gerado', 'Aguardando escaneamento pelo celular', '🔵');
});

client.on('authenticated', () => {
    console.log(`[Auth] ✅ Autenticação bem-sucedida!`);
    broadcastLog('security', 'Autenticação Concluída', 'Sessão do WhatsApp autenticada com sucesso', '🟢');
});

client.on('auth_failure', (msg) => {
    console.error('❌ [Auth Failure] Falha na autenticação do WhatsApp:', msg);
    isReady = false;
    broadcastLog('security', 'Falha de Autenticação', msg || 'Erro de credencial', '🔴');
});

client.on('disconnected', (reason) => {
    console.warn('⚠️ [WhatsApp Disconnected] Cliente WhatsApp desconectou:', reason);
    isReady = false;
    broadcastLog('system', 'WhatsApp Desconectado', `Motivo: ${reason}`, '🔴');
    setTimeout(() => {
        console.log('🔄 Tentando re-inicializar o cliente WhatsApp...');
        client.initialize().catch(e => console.error('Erro ao reconectar WhatsApp:', e.message));
    }, 5000);
});

client.on('ready', async () => {
    isReady = true;
    startupTimestamp = Date.now(); // Marca o momento exato que o WhatsApp ficou pronto
    updateSelfInfo(client);
    console.log(`\n🟢 WHATSAPP CONECTADO COM SUCESSO! (timestamp: ${startupTimestamp})`);
    broadcastLog('system', 'WhatsApp Conectado', `Cliente pronto no celular ${config.MY_NUMBER || ''}`, '🟢');
    
    setTimeout(() => {
        syncWhatsAppContacts();
    }, 5000);
});

async function syncWhatsAppContacts() {
    try {
        if (!isReady || !client) return { success: false, synced: 0 };

        console.log('🔄 Sincronizando contatos salvos da agenda do celular...');
        cleanUnsavedSyncedContacts();

        // 1. Extração profunda dos 3 Stores da memória do WhatsApp Web no Puppeteer (Lid, Chat, Contact)
        try {
            if (client.pupPage) {
                const storeMappings = await client.pupPage.evaluate(() => {
                    const list = [];
                    try {
                        // A) Store.Lid
                        if (window.Store && window.Store.Lid) {
                            const lidModels = window.Store.Lid.models || window.Store.Lid._models || [];
                            for (const item of lidModels) {
                                const lidStr = item.id ? (item.id._serialized || item.id) : (item.lid || '');
                                const phoneStr = item.phoneNumber || item.user || item.pn || '';
                                const phoneJid = phoneStr ? `${phoneStr.replace(/\D/g, '')}@c.us` : '';
                                if (lidStr && phoneJid) {
                                    list.push({ lidJid: lidStr, phoneJid });
                                }
                            }
                        }

                        // B) Store.Chat
                        if (window.Store && window.Store.Chat) {
                            const chats = window.Store.Chat.models || window.Store.Chat._models || [];
                            for (const chat of chats) {
                                const cId = chat.id ? (chat.id._serialized || chat.id) : '';
                                const contact = chat.contact || {};
                                const cLid = contact.lid ? (contact.lid._serialized || contact.lid) : '';
                                const cPhone = contact.number || (contact.id && contact.id.user ? contact.id.user : '');
                                const name = contact.name || contact.pushname || chat.name || '';
                                const phoneJid = cPhone ? `${cPhone.replace(/\D/g, '')}@c.us` : (cId.includes('@c.us') ? cId : '');

                                if (cLid && phoneJid) {
                                    list.push({ lidJid: cLid, phoneJid, name });
                                }
                            }
                        }

                        // C) Store.Contact
                        if (window.Store && window.Store.Contact) {
                            const models = window.Store.Contact.models || window.Store.Contact._models || [];
                            for (const item of models) {
                                const idStr = item.id ? (item.id._serialized || item.id) : '';
                                const lidObj = item.lid || (item.id && item.id.lid ? item.id.lid : null);
                                const lidStr = lidObj ? (lidObj._serialized || lidObj) : (idStr.includes('@lid') ? idStr : '');
                                const numStr = item.number || (item.id && item.id.user && !idStr.includes('@lid') ? item.id.user : '');
                                const name = item.name || item.pushname || item.formattedName || '';
                                const phoneJid = numStr ? `${numStr.replace(/\D/g, '')}@c.us` : (idStr.includes('@c.us') ? idStr : '');

                                if (lidStr && phoneJid) {
                                    list.push({ lidJid: lidStr, phoneJid, name, number: numStr });
                                }
                            }
                        }
                    } catch (e) {}
                    return list;
                });

                if (Array.isArray(storeMappings) && storeMappings.length > 0) {
                    console.log(`🔍 [LID SYNC AUTOMÁTICO] Mapeados ${storeMappings.length} pares LID <-> Telefone da memória do WhatsApp.`);
                    for (const m of storeMappings) {
                        if (m.lidJid && (m.phoneJid || m.name)) {
                            saveLidMapping(m.lidJid, m.phoneJid, m.name || '');
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('⚠️ Não foi possível ler Stores via browser:', e.message);
        }

        const waContacts = await client.getContacts();
        let syncedCount = 0;

        for (const c of waContacts) {
            if (!c.id || !c.id._serialized || c.isGroup) continue;

            const jid = c.id._serialized;
            const humanName = c.name || c.pushname || c.shortName || '';

            // Extrair LID presente no objeto de contato se houver
            let foundLid = '';
            if (c.lid && (c.lid._serialized || typeof c.lid === 'string')) {
                foundLid = c.lid._serialized || c.lid;
            } else if (c.id && c.id.lid) {
                foundLid = c.id.lid._serialized || c.id.lid;
            }

            if (jid.includes('@lid')) {
                const phoneJid = c.number ? `${c.number}@c.us` : '';
                saveLidMapping(jid, phoneJid, humanName);
            } else if (foundLid) {
                saveLidMapping(foundLid, jid, humanName);
            }

            if (c.isMyContact && humanName && isHumanName(humanName)) {
                saveContact(
                    jid,
                    humanName,
                    'Contato Salvo',
                    'Mapeado da Agenda do Celular',
                    '',
                    'Agenda',
                    0,
                    'WhatsApp Sync'
                );
                syncedCount++;
            }
        }

        // NOTA: Fetch proativo de LIDs DESATIVADO para não sobrecarregar o Puppeteer.
        // LIDs são capturados automaticamente quando mensagens são recebidas.

        // Sincronizar contatos bloqueados nativos do WhatsApp celular
        try {
            const blockedContacts = await client.getBlockedContacts();
            for (const b of blockedContacts) {
                if (!b.id || !b.id._serialized) continue;
                const bJid = b.id._serialized;
                const bName = b.name || b.pushname || b.shortName || '';
                const bPhone = b.number ? `${b.number}@c.us` : '';

                if (bJid.includes('@lid')) {
                    saveLidMapping(bJid, bPhone, bName);
                } else if (bPhone) {
                    saveLidMapping(bJid, bPhone, bName);
                }
                blockContact(bJid, bName, 'WhatsApp Sync');
            }
        } catch (e) {}

        console.log(`✅ Sincronização concluída! ${syncedCount} contatos salvos da sua agenda mapeados.`);
        broadcastLog('system', 'Sincronização de Agenda Concluída', `${syncedCount} contatos salvos da sua agenda mapeados`, '🟢');
        return { success: true, synced: syncedCount };
    } catch (e) {
        console.error('⚠️ Erro ao sincronizar contatos do WhatsApp:', e.message);
        return { success: false, error: e.message };
    }
}

const processedMsgIds = new Set();

async function handleIncomingOrCreatedMessage(msg) {
    try {
        if (!msg || !msg.id) return;
        const msgIdStr = (msg.id && (msg.id._serialized || msg.id.id)) ? (msg.id._serialized || msg.id.id) : null;
        if (msgIdStr) {
            if (processedMsgIds.has(msgIdStr)) return;
            processedMsgIds.add(msgIdStr);
            if (processedMsgIds.size > 2000) {
                const first = processedMsgIds.values().next().value;
                processedMsgIds.delete(first);
            }
        }

        // GUARDA DE INICIALIZAÇÃO: Ignorar mensagens antigas que o WhatsApp re-entrega do cache ao reconectar
        const msgTimestamp = msg.timestamp ? (msg.timestamp * 1000) : 0;
        if (msgTimestamp > 0 && msgTimestamp < (startupTimestamp - 30000)) {
            // Mensagem anterior ao startup (com 30s de margem) - ignorar silenciosamente
            return;
        }

        // ──── CAPTURA DE LID (NÃO-BLOQUEANTE - Roda em segundo plano sem travar a resposta da IA) ────
        if (!msg.fromMe && msg.from) {
            const _fromJid = msg.from;
            const _rawData = msg._data || msg.rawData || {};
            setTimeout(async () => {
                try {
                    if (_fromJid.includes('@lid')) {
                        const contact = await withTimeout(client.getContactById(_fromJid), 5000).catch(() => null);
                        if (contact) {
                            const cName = contact.name || contact.pushname || contact.shortName || '';
                            const cPhone = contact.number ? `${contact.number}@c.us` : '';
                            if (cName !== '@nobazzy' && cPhone && !cPhone.includes('5511935855321')) {
                                saveLidMapping(_fromJid, cPhone, cName);
                                console.log(`🔗 [LID BG] ${_fromJid} → ${cPhone} (${cName})`);
                            }
                        }
                    } else if (_fromJid.includes('@c.us')) {
                        let foundLid = '';
                        if (_rawData.author && typeof _rawData.author === 'string' && _rawData.author.includes('@lid')) {
                            foundLid = _rawData.author;
                        }
                        if (!foundLid && _rawData.from && typeof _rawData.from === 'object' && _rawData.from._serialized && _rawData.from._serialized.includes('@lid')) {
                            foundLid = _rawData.from._serialized;
                        }
                        if (foundLid && foundLid.includes('@lid')) {
                            saveLidMapping(foundLid, _fromJid, '');
                            console.log(`🔗 [LID BG] ${foundLid} → ${_fromJid}`);
                        }
                    }
                } catch(e) {}
            }, 100);
        }

        let body = (msg.body || '').trim();
        if (!body && msg.hasMedia) {
            body = '[Mídia recebida do contato]';
        }
        if (!body) return;

        if (msg.from === 'status@broadcast' || msg.to === 'status@broadcast' || msg.isStatus) return;
        if ((msg.from && msg.from.includes('@g.us')) || (msg.to && msg.to.includes('@g.us'))) return;

        console.log(`📩 [MSG DETECTADA] fromMe=${msg.fromMe} | from=${msg.from} | to=${msg.to} | body="${body.substring(0, 35)}"`);

        const isSelf = checkIsSelf(msg, client, selfJids);
        if (isSelf && msg.fromMe && msg.from) {
            selfJids.add(msg.from);
        }
        const currentChatJid = (msg.id && msg.id.remote) ? msg.id.remote : (msg.fromMe ? msg.to : msg.from);

        // ─── 1. MENSAGENS ENVIADAS PELO PRÓPRIO ALEX (msg.fromMe === true) ───
        if (msg.fromMe) {
            if (botSentTexts.has(body)) return;
            if (msg.id && msg.id.id && botSentMsgIds.has(msg.id.id)) return;
            if (body.startsWith('🤖') || body.startsWith('☁️') || body.startsWith('⚡') || body.startsWith('🚫') || body.startsWith('✅') || body.startsWith('⚠️') || body.startsWith('📊') || body.startsWith('📋') || body.startsWith('🧠') || body.startsWith('📇') || body.startsWith('⏰') || body.startsWith('🔴') || body.startsWith('⏸️') || body.startsWith('▶️') || body.startsWith('👋') || body.startsWith('🧹')) return;

            const lower = body.toLowerCase();

            // A) SE FOI DIGITADO EM CHAT DE TERCEIRO (!isSelf):
            if (!isSelf) {
                if (lower.startsWith('!nobazzy bloquear') || lower.startsWith('!bloquear') || lower.startsWith('!block') || lower.startsWith('!nobazzy block')) {
                    let raw = '';
                    if (lower.startsWith('!nobazzy bloquear')) raw = body.slice(17).trim();
                    else if (lower.startsWith('!nobazzy block')) raw = body.slice(14).trim();
                    else if (lower.startsWith('!bloquear')) raw = body.slice(9).trim();
                    else if (lower.startsWith('!block')) raw = body.slice(6).trim();

                    if (!raw) raw = currentChatJid;
                    if (raw) {
                        try {
                            const c = await client.getContactById(raw.includes('@') ? raw : `${raw.replace(/\D/g, '')}@c.us`);
                            const cName = (c && (c.name || c.pushname || c.shortName)) ? (c.name || c.pushname || c.shortName) : '';
                            const cPhone = (c && c.number) ? `${c.number}@c.us` : '';
                            if (raw.includes('@lid') || (c && c.id && c.id._serialized && c.id._serialized.includes('@lid'))) {
                                saveLidMapping(raw.includes('@lid') ? raw : c.id._serialized, cPhone, cName);
                            }
                            blockContact(raw, cName, 'Alex');
                            if (c && c.block) await c.block().catch(() => {});
                        } catch(e) {
                            blockContact(raw, '', 'Alex');
                        }
                        broadcastLog('security', 'Contato Bloqueado pelo Comando Direct (Silencioso)', `JID: ${raw}`, '🔴');
                    }
                    return;
                }

                if (lower.startsWith('!nobazzy desbloquear') || lower.startsWith('!desbloquear') || lower.startsWith('!unblock') || lower.startsWith('!nobazzy unblock')) {
                    let raw = '';
                    if (lower.startsWith('!nobazzy desbloquear')) raw = body.slice(20).trim();
                    else if (lower.startsWith('!nobazzy unblock')) raw = body.slice(16).trim();
                    else if (lower.startsWith('!desbloquear')) raw = body.slice(12).trim();
                    else if (lower.startsWith('!unblock')) raw = body.slice(8).trim();

                    if (!raw) raw = currentChatJid;
                    if (raw) {
                        unblockContact(raw, 'Alex');
                        try {
                            client.getContactById(raw.includes('@') ? raw : `${raw.replace(/\D/g, '')}@c.us`)
                                  .then(async c => { if (c && c.unblock) await c.unblock().catch(() => {}); })
                                  .catch(() => {});
                        } catch(e) {}
                        broadcastLog('security', 'Contato Desbloqueado pelo Comando Direct (Silencioso)', `JID: ${raw}`, '🟢');
                    }
                    return;
                }

                if (lower === '!pausar' || lower === '!nobazzy pausar') {
                    globalIsPaused = true;
                    broadcastLog('system', 'IA Pausada (Silencioso)', 'Cloud entrou em Modo Silencioso', '🔴');
                    return;
                }

                if (lower === '!retomar' || lower === '!nobazzy retomar') {
                    globalIsPaused = false;
                    broadcastLog('system', 'IA Reativada (Silencioso)', 'Cloud voltou a atender', '🟢');
                    return;
                }

                // Se o Alex digitou qualquer outro comando ou mensagem comum em chat de cliente: SILÊNCIO ABSOLUTO!
                console.log(`ℹ️ [IGNORADO] Mensagem digitada pelo Alex manualmente no chat [${currentChatJid}].`);
                return;
            }

            // B) MENSAGENS OU COMANDOS DIGITADOS NO CHAT PRÓPRIO DO ALEX ("VOCÊ" / isSelf === true)
            if (body.startsWith('!') || body.toLowerCase().startsWith('!nobazzy')) {
                if (lower === '!nobazzy' || lower === '!ajuda' || lower === '!comandos' || lower === '!nobazzy ajuda' || lower === '!nobazzy comandos') {
                    await sendBotMessage(currentChatJid, getHelpMenuText());
                    return;
                }

                if (lower === '!nobazzy perfil' || lower === '!perfil') {
                    await sendBotMessage(currentChatJid, getProfileText());
                    return;
                }

                if (lower.startsWith('!nobazzy set ') || lower.startsWith('!set ')) {
                    const rawArgs = body.startsWith('!nobazzy set ') ? body.slice(13).trim() : body.slice(5).trim();
                    const spaceIdx = rawArgs.indexOf(' ');
                    if (spaceIdx > 0) {
                        const key = rawArgs.substring(0, spaceIdx).trim();
                        const val = rawArgs.substring(spaceIdx + 1).trim();
                        setProfileValue(key, val, 'Alex');
                        await sendBotMessage(currentChatJid, `✅ *DADO DO PERFIL SALVO NO SQLITE!*\n• *${key}*: ${val}`);
                    }
                    return;
                }

                if (lower === '!nobazzy memorias' || lower === '!memorias') {
                    await sendBotMessage(currentChatJid, getMemoriesText());
                    return;
                }

                if (lower.startsWith('!nobazzy nota ') || lower.startsWith('!nota ')) {
                    const noteText = body.startsWith('!nobazzy nota ') ? body.slice(14).trim() : body.slice(6).trim();
                    if (noteText) {
                        addMemory('Anotação Geral', noteText, 'Alex');
                        await sendBotMessage(currentChatJid, `📝 *ANOTAÇÃO GRAVADA NO SQLITE!*\n• ${noteText}`);
                    }
                    return;
                }

                if (lower === '!nobazzy contatos' || lower === '!contatos') {
                    await sendBotMessage(currentChatJid, getContactsText());
                    return;
                }

                if (lower.startsWith('!nobazzy contato ') || lower.startsWith('!contato ')) {
                    const rawArgs = body.startsWith('!nobazzy contato ') ? body.slice(17).trim() : body.slice(9).trim();
                    const parts = rawArgs.split(' ');
                    if (parts.length >= 2) {
                        const num = parts[0];
                        const name = parts[1];
                        const rel = parts.slice(2).join(' ') || 'Contato';
                        const jid = num.includes('@') ? num : `${num.replace(/\D/g, '')}@c.us`;
                        saveContact(jid, name, rel, '', '', 'Geral', 0, 'Alex');
                        await sendBotMessage(currentChatJid, `📇 *CONTATO CADASTRADO NO SQLITE!*\n• *Nome:* ${name}\n• *JID:* ${jid}`);
                    }
                    return;
                }

                if (lower.startsWith('!nobazzy bloquear') || lower.startsWith('!bloquear') || lower.startsWith('!block')) {
                    let raw = '';
                    if (lower.startsWith('!nobazzy bloquear')) raw = body.slice(17).trim();
                    else if (lower.startsWith('!bloquear')) raw = body.slice(9).trim();
                    else if (lower.startsWith('!block')) raw = body.slice(6).trim();

                    if (!raw) raw = currentChatJid;
                    if (raw) {
                        blockContact(raw, '', 'Alex');
                        try {
                            client.getContactById(raw.includes('@') ? raw : `${raw.replace(/\D/g, '')}@c.us`)
                                  .then(async c => { if (c && c.block) await c.block().catch(() => {}); })
                                  .catch(() => {});
                        } catch(e) {}
                        await sendBotMessage(currentChatJid, `🚫 *CONTATO BLOQUEADO SILENCIOSAMENTE!*\n• Contato: ${raw}`);
                    }
                    return;
                }

                if (lower.startsWith('!nobazzy desbloquear') || lower.startsWith('!desbloquear') || lower.startsWith('!unblock')) {
                    let raw = '';
                    if (lower.startsWith('!nobazzy desbloquear')) raw = body.slice(20).trim();
                    else if (lower.startsWith('!desbloquear')) raw = body.slice(12).trim();
                    else if (lower.startsWith('!unblock')) raw = body.slice(8).trim();

                    if (!raw) raw = currentChatJid;
                    if (raw) {
                        unblockContact(raw, 'Alex');
                        try {
                            client.getContactById(raw.includes('@') ? raw : `${raw.replace(/\D/g, '')}@c.us`)
                                  .then(async c => { if (c && c.unblock) await c.unblock().catch(() => {}); })
                                  .catch(() => {});
                        } catch(e) {}
                        await sendBotMessage(currentChatJid, `✅ *CONTATO DESBLOQUEADO SILENCIOSAMENTE!*\n• Contato: ${raw}`);
                    }
                    return;
                }

                if (lower === '!bloqueados' || lower === '!nobazzy bloqueados') {
                    await sendBotMessage(currentChatJid, getBlockedText());
                    return;
                }

                if (lower === '!nobazzy automacoes' || lower === '!automacoes') {
                    await sendBotMessage(currentChatJid, getAutomationsText());
                    return;
                }

                if (lower === '!pausar' || lower === '!nobazzy pausar') {
                    globalIsPaused = true;
                    await sendBotMessage(currentChatJid, '⏸️ *CLOUD PAUSADA (MODO SILENCIOSO)*');
                    return;
                }

                if (lower === '!retomar' || lower === '!nobazzy retomar') {
                    globalIsPaused = false;
                    await sendBotMessage(currentChatJid, '▶️ *CLOUD REATIVADA COM SUCESSO!*');
                    return;
                }

                if (lower === '!desligar' || lower === '!nobazzy desligar') {
                    await sendBotMessage(currentChatJid, '🔴 *ENCERRANDO PROCESSO CLOUD AI...*');
                    setTimeout(() => process.exit(0), 1000);
                    return;
                }

                if (lower === '!status' || lower === '!nobazzy status') {
                    await sendBotMessage(currentChatJid, getStatusText());
                    return;
                }

                if (lower === '!limpar' || lower === '!nobazzy limpar') {
                    db.prepare('DELETE FROM chat_history WHERE chat_id = ?').run(currentChatJid);
                    await sendBotMessage(currentChatJid, '🧹 *HISTÓRICO DESTA CONVERSA LIMPO NO SQLITE!*');
                    return;
                }

                if (lower === '!nobazzy rag' || lower === '!rag') {
                    await sendBotMessage(currentChatJid, getRagText());
                    return;
                }

                if (lower === '!nobazzy templates' || lower === '!templates') {
                    await sendBotMessage(currentChatJid, getTemplatesText());
                    return;
                }

                return;
            }

            // C) MENSAGENS NORMAIS ENVIADAS PELO ALEX PARA SI MESMO (CHAT "VOCÊ" / isSelf === true)
            // QUANDO O ALEX ENVIA MENSAGEM NO PRÓPRIO CHAT ("VOCÊ"), A IA RESPONDE AO ALEX!
            console.log(`💬 [MENSAGEM ALEX -> CHAT VOCÊ]: "${body}"`);
            broadcastLog('chat', 'Mensagem do Alex no Chat Você', `Para [Alex]: "${body.substring(0, 40)}..."`, '🟢');
            db.prepare('INSERT INTO chat_history (chat_id, sender, message, timestamp) VALUES (?, ?, ?, ?)').run(currentChatJid, 'user', body, new Date().toISOString());

            const historyRows = db.prepare('SELECT sender, message FROM chat_history WHERE chat_id = ? ORDER BY id DESC LIMIT 10').all(currentChatJid).reverse();

            let promptMessages = [
                { role: 'system', content: buildSystemPrompt(true, 'Alex') }
            ];

            historyRows.forEach(row => {
                promptMessages.push({
                    role: row.sender === 'user' ? 'user' : 'assistant',
                    content: row.message
                });
            });

            broadcastLog('ai', 'Enviando Prompt (Modo Criador/Alex) para a IA', `Provedor: ${config.ACTIVE_PROVIDER || 'OpenAI'}`, '🔵');

            const aiReply = await callAIProvider(promptMessages);

            if (aiReply) {
                let formattedReply = aiReply;
                if (!aiReply.startsWith('🤖') && !aiReply.startsWith('☁️')) {
                    formattedReply = `🤖 ${aiReply}`;
                }

                db.prepare('INSERT INTO chat_history (chat_id, sender, message, timestamp) VALUES (?, ?, ?, ?)').run(currentChatJid, 'assistant', formattedReply, new Date().toISOString());
                console.log(`🤖 [IA RESPONDEU ALEX NO CHAT VOCÊ]: "${formattedReply}"`);
                broadcastLog('ai', 'IA Respondeu ao Alex', `No Chat Você: "${formattedReply.substring(0, 40)}..."`, '🟢');

                await sendBotMessage(currentChatJid, formattedReply, msg);
            }
            return;
        }

        // ─── 2. MENSAGENS INCOMING RECEBIDAS DE TERCEIROS (!msg.fromMe) ───
        const customerJid = msg.from;

        // Se a mensagem incoming for do próprio Alex (segundo aparelho/sessão), NUNCA TRATAR COMO CLIENTE!
        const cleanCustomer = cleanNumber(customerJid);
        const cleanMyNumber = cleanNumber(config.MY_NUMBER);
        if (isSelf || selfJids.has(customerJid) || (cleanMyNumber && cleanCustomer === cleanMyNumber)) {
            console.log(`ℹ️ [IGNORADO] Mensagem recebida do próprio número do Alex [${customerJid}].`);
            return;
        }

        // GUARDA RIGOROSA E ABSOLUTA DE BLACKLIST (Checa apenas se o REMETENTE está na blacklist)
        if (isContactBlocked(customerJid) || (msg.id && msg.id.remote && isContactBlocked(msg.id.remote))) {
            console.log(`🚫 [BLACKLIST] Mensagem de [${customerJid}] bloqueada pela blacklist.`);
            broadcastLog('security', 'Blacklist Acionada', `Mensagem de [${customerJid}] bloqueada`, '🔴');
            return;
        }

        if (isManualOverrideActive(customerJid)) {
            console.log(`🔵 [MANUAL OVERRIDE] Atendimento manual ativo para [${customerJid}].`);
            broadcastLog('chat', 'Atendimento Manual Ativo', `Mensagem de ${customerJid} ignorada`, '🔵');
            return;
        }

        if (globalIsPaused) {
            console.log(`🔴 [PAUSED] IA Pausada, ignorando mensagem de [${customerJid}].`);
            broadcastLog('system', 'Mensagem Recebida (IA Pausada)', `De: ${customerJid}`, '🔵');
            return;
        }

        // PROCESSAMENTO DE RESPOSTA DA IA APENAS PARA MENSAGENS INCOMING DE CLIENTES NÃO BLOQUEADOS
        console.log(`📩 [MENSAGEM CLIENTE RECEBIDA] De [${customerJid}]: "${body}"`);
        broadcastLog('chat', 'Mensagem Recebida', `De [${customerJid}]: "${body.substring(0, 40)}..."`, '🟢');
        db.prepare('INSERT INTO chat_history (chat_id, sender, message, timestamp) VALUES (?, ?, ?, ?)').run(customerJid, 'user', body, new Date().toISOString());

        const historyRows = db.prepare('SELECT sender, message FROM chat_history WHERE chat_id = ? ORDER BY id DESC LIMIT 10').all(customerJid).reverse();

        let promptMessages = [
            { role: 'system', content: buildSystemPrompt(false, customerJid.replace('@c.us', '')) }
        ];

        historyRows.forEach(row => {
            promptMessages.push({
                role: row.sender === 'user' ? 'user' : 'assistant',
                content: row.message
            });
        });

        console.log(`🤖 [PROCESSANDO RESPOSTA IA PARA CLIENTE] De [${customerJid}]...`);
        broadcastLog('ai', 'Enviando Prompt para a IA', `Provedor: ${config.ACTIVE_PROVIDER || 'OpenAI'}`, '🔵');

        const aiReply = await callAIProvider(promptMessages);

        if (aiReply) {
            let formattedReply = aiReply;
            if (!aiReply.startsWith('🤖') && !aiReply.startsWith('☁️')) {
                formattedReply = `🤖 ${aiReply}`;
            }

            db.prepare('INSERT INTO chat_history (chat_id, sender, message, timestamp) VALUES (?, ?, ?, ?)').run(customerJid, 'assistant', formattedReply, new Date().toISOString());
            console.log(`✅ [IA RESPONDEU CLIENTE] Para [${customerJid}]: "${formattedReply}"`);
            broadcastLog('ai', 'IA Respondeu', `Para [${customerJid}]: "${formattedReply.substring(0, 40)}..."`, '🟢');

            await sendBotMessage(customerJid, formattedReply, msg);
        } else {
            console.error(`⚠️ [ERRO IA] Provedor de IA não retornou conteúdo para [${customerJid}].`);
        }

    } catch (e) {
        console.error('⚠️ Erro no processamento do WhatsApp:', e.message);
    }
}

client.on('message_create', handleIncomingOrCreatedMessage);

async function resolveSingleLid(targetJidOrNumber) {
    try {
        if (!isReady || !client) return { success: false, error: 'WhatsApp não conectado' };

        const cleanDigits = targetJidOrNumber.replace(/\D/g, '');
        const targetJid = targetJidOrNumber.includes('@') ? targetJidOrNumber : `${cleanDigits}@c.us`;

        console.log(`🔍 [RESOLVE SINGLE LID] Buscando LID JID para [${targetJid}]...`);
        const contactObj = await client.getContactById(targetJid);
        if (contactObj) {
            let fetchedLid = '';
            if (contactObj.lid && (contactObj.lid._serialized || typeof contactObj.lid === 'string')) {
                fetchedLid = contactObj.lid._serialized || contactObj.lid;
            } else if (contactObj.id && contactObj.id.lid) {
                fetchedLid = contactObj.id.lid._serialized || contactObj.id.lid;
            }

            if (fetchedLid && fetchedLid.includes('@lid')) {
                const name = contactObj.name || contactObj.pushname || contactObj.shortName || '';
                saveLidMapping(fetchedLid, targetJid, name);
                return { success: true, lidJid: fetchedLid, name };
            }
        }
        return { success: false, error: 'LID não retornado pelo WhatsApp' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

function getWhatsAppStatus() {
    return {
        connected: isReady,
        number: config.MY_NUMBER,
        paused: globalIsPaused
    };
}

module.exports = {
    client,
    sendBotMessage,
    getWhatsAppStatus,
    syncWhatsAppContacts,
    resolveSingleLid,
    buildSystemPrompt
};
