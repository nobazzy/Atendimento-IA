const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { db, isMessageProcessed, markMessageProcessed, cleanupOldProcessedMessages } = require('../../database');
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
const { isOutsideBusinessHours, canSendAbsenceMessage, recordAbsenceMessageSent, getAllSettings } = require('../../services/settings');
const { buildRagPromptContext, getKnowledgeDocs: getRagDocs } = require('../../services/rag');

let selfJids = new Set();
if (fs.existsSync(config.SELF_JIDS_PATH)) {
    try {
        const raw = fs.readFileSync(config.SELF_JIDS_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            parsed.forEach(jid => selfJids.add(jid));
        }
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

async function updateSelfInfo(clientObj) {
    try {
        if (clientObj && clientObj.info && clientObj.info.wid) {
            const widObj = clientObj.info.wid;
            if (widObj.user) {
                selfJids.add(`${widObj.user}@c.us`);
                selfJids.add(widObj.user);
            }
            if (widObj._serialized) selfJids.add(widObj._serialized);

            // Buscar nosso próprio LID usando o getContactById oficial
            try {
                const meContact = await clientObj.getContactById(widObj._serialized);
                if (meContact) {
                    let myLid = '';
                    if (meContact.lid && (meContact.lid._serialized || typeof meContact.lid === 'string')) {
                        myLid = meContact.lid._serialized || meContact.lid;
                    } else if (meContact.id && meContact.id.lid) {
                        myLid = meContact.id.lid._serialized || meContact.id.lid;
                    }
                    if (myLid && myLid.includes('@lid')) {
                        selfJids.add(myLid);
                        console.log(`🔑 [SELF LID RESOLVED FROM CONTACT] ${myLid}`);
                    }
                }
            } catch (errMe) {
                console.warn('⚠️ Erro ao obter próprio LID via getContactById:', errMe.message);
            }
        }
        if (config.MY_NUMBER) {
            const clean = config.MY_NUMBER.replace(/\D/g, '');
            if (clean) {
                selfJids.add(`${clean}@c.us`);
                selfJids.add(clean);
            }
        }

        // Tentar também obter o LID via Puppeteer como fallback
        if (clientObj && clientObj.pupPage) {
            try {
                const myLid = await clientObj.pupPage.evaluate(() => {
                    try {
                        if (window.Store && window.Store.User && window.Store.User.getMeUser) {
                            const me = window.Store.User.getMeUser();
                            if (me && me.id && me.id._serialized) return me.id._serialized;
                        }
                        if (window.Store && window.Store.Conn && window.Store.Conn.wid) {
                            const conn = window.Store.Conn;
                            if (conn.wid && conn.wid._serialized && conn.wid._serialized.includes('@lid')) {
                                return conn.wid._serialized;
                            }
                        }
                    } catch(e) {}
                    return null;
                });
                if (myLid && myLid.includes('@lid')) {
                    selfJids.add(myLid);
                    console.log(`🔑 [SELF LID RESOLVED FROM PUPPETEER FALLBACK] ${myLid}`);
                }
            } catch (eEval) {}
        }

        fs.writeFileSync(config.SELF_JIDS_PATH, JSON.stringify(Array.from(selfJids), null, 2), 'utf8');
        console.log(`📋 [SELF JIDS ATUALIZADOS] ${JSON.stringify(Array.from(selfJids))}`);
    } catch (e) {}
}

// ─── GERENCIADOR E LIMPADOR INTELIGENTE DE CACHE (Evita travamentos e mantém a sessão ativa) ───
function cleanAuthSession() {
    const authDir = config.AUTH_DIR;
    const cacheDir = path.join(path.dirname(authDir), '.wwebjs_cache');
    
    // Se a variável FRESH_SESSION for 'true', faz limpeza total. Caso contrário, faz limpeza inteligente mantendo o login.
    const forceFreshStart = process.env.FRESH_SESSION === 'true';

    if (forceFreshStart) {
        console.log('🧹 [FRESH START] Forçando limpeza TOTAL da sessão. QR Code será exigido.');
        try {
            if (fs.existsSync(authDir)) {
                fs.rmSync(authDir, { recursive: true, force: true });
                console.log('🧹 [FRESH START] Pasta .wwebjs_auth removida com sucesso.');
            }
        } catch (e) {
            console.warn('⚠️ Não foi possível remover .wwebjs_auth:', e.message);
        }
    } else {
        console.log('🧹 [SMART CACHE] Preservando arquivos de login. Limpando lixo e travas para evitar corrupção...');
        // Mantém a pasta "session/Default" (com as credenciais), mas limpa tudo o que acumula lixo ou trava o Chrome
        try {
            if (fs.existsSync(authDir)) {
                const defaultDir = path.join(authDir, 'session', 'Default');
                if (fs.existsSync(defaultDir)) {
                    const pathsToClean = [
                        path.join(defaultDir, 'Cache'),
                        path.join(defaultDir, 'Code Cache'),
                        path.join(defaultDir, 'Service Worker'),
                        path.join(defaultDir, 'Storage'),
                        path.join(defaultDir, 'SingletonLock')
                    ];
                    for (const p of pathsToClean) {
                        if (fs.existsSync(p)) {
                            fs.rmSync(p, { recursive: true, force: true });
                            console.log(`🧹 [SMART CACHE] Pasta limpa: ${path.basename(p)}`);
                        }
                    }
                }
                
                // Remover travas residuais do Chrome/Puppeteer no Windows (evita erro "The browser is already running")
                const sessionDir = path.join(authDir, 'session');
                const lockFiles = [
                    path.join(sessionDir, 'lockfile'),
                    path.join(sessionDir, 'DevToolsActivePort'),
                    path.join(sessionDir, 'SingletonLock'),
                    path.join(sessionDir, 'SingletonCookie'),
                    path.join(sessionDir, 'SingletonSocket'),
                    path.join(defaultDir, 'lockfile'),
                    path.join(defaultDir, 'DevToolsActivePort'),
                    path.join(defaultDir, 'SingletonLock'),
                    path.join(defaultDir, 'SingletonCookie'),
                    path.join(defaultDir, 'SingletonSocket')
                ];
                for (const lf of lockFiles) {
                    try {
                        if (fs.existsSync(lf)) {
                            fs.unlinkSync(lf);
                            console.log(`🧹 [PUPPETEER] Trava residual removida: ${path.basename(lf)}`);
                        }
                    } catch (eL) {}
                }
            }
        } catch (e) {
            console.warn('⚠️ Erro na limpeza inteligente do Puppeteer:', e.message);
        }
    }

    // Limpar .wwebjs_cache que vive acumulando e quebrando o WhatsApp Web
    try {
        if (fs.existsSync(cacheDir)) {
            fs.rmSync(cacheDir, { recursive: true, force: true });
            console.log('🧹 [SMART CACHE] Cache temporário (.wwebjs_cache) removido com sucesso.');
        }
    } catch (e) {
        console.warn('⚠️ Não foi possível limpar .wwebjs_cache:', e.message);
    }
}

// Executar limpeza inteligente antes de inicializar o client
cleanAuthSession();

// Determinar se já possui sessão salva
const hasSessionSaved = fs.existsSync(config.AUTH_DIR) && fs.existsSync(path.join(config.AUTH_DIR, 'session', 'Default'));
if (hasSessionSaved && process.env.FRESH_SESSION !== 'true') {
    console.log('📲 [WHATSAPP] Carregando sessão existente de forma segura (limpeza inteligente aplicada)...\n');
} else {
    console.log('📲 [WHATSAPP] Nova sessão limpa! Aguardando geração de QR Code...\n');
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: config.HEADLESS !== false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-ipc-flooding-protection',
            '--disable-features=CalculateNativeWinOcclusion,IsolateOrigins,site-per-process',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
        ]
    }
});

function getPersistedGlobalPaused() {
    try {
        const row = db.prepare("SELECT value FROM system_config WHERE key = 'global_paused'").get();
        return row ? row.value === 'true' : false;
    } catch (e) {
        return false;
    }
}

function setPersistedGlobalPaused(val) {
    try {
        const nowStr = new Date().toISOString();
        db.prepare(`
            INSERT INTO system_config (key, value, company_id, updated_at) 
            VALUES ('global_paused', ?, 'default', ?) 
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `).run(val ? 'true' : 'false', nowStr);
    } catch (e) {}
}

let isReady = false;
let globalIsPaused = getPersistedGlobalPaused();

function setGlobalPaused(paused) {
    globalIsPaused = Boolean(paused);
    setPersistedGlobalPaused(globalIsPaused);
    return globalIsPaused;
}
let isDisconnecting = false;
let currentQrRaw = null;
let currentQrDataUrl = null;
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

        // Pré-resolução de JID: se for @lid, resolver para número de telefone real @c.us ANTES de enviar
        let destinationJid = targetJid;
        if (targetJid.includes('@lid')) {
            const mapped = db.prepare("SELECT phone_jid, phone_number FROM lid_mappings WHERE lid = ?").get(targetJid);
            if (mapped && mapped.phone_jid && mapped.phone_jid !== '@c.us') {
                destinationJid = mapped.phone_jid;
            } else if (mapped && mapped.phone_number && mapped.phone_number.length >= 10 && mapped.phone_number.length <= 13) {
                destinationJid = `${mapped.phone_number}@c.us`;
            } else {
                // LID sem mapeamento no banco - tentar resolver rapidamente via API
                try {
                    const c = await withTimeout(client.getContactById(targetJid), 2000).catch(() => null);
                    if (c && c.number) {
                        const cleanN = c.number.replace(/\D/g, '');
                        if (cleanN.length >= 10 && cleanN.length <= 13) {
                            destinationJid = `${cleanN}@c.us`;
                            saveLidMapping(targetJid, destinationJid, c.name || c.pushname || '');
                        }
                    }
                } catch (eC) {}

                if (destinationJid.includes('@lid')) {
                    console.log(`ℹ️ [LID DIRECT] Não foi possível mapear o LID [${targetJid}] para telefone. Enviando resposta diretamente para o LID.`);
                }
            }
        }

        try {
            console.log(`📤 [ENVIANDO RESPOSTA DA IA] Destino: [${destinationJid}]...`);
            sent = await withTimeout(client.sendMessage(destinationJid, content), 8000);
            console.log(`✅ [MENSAGEM ENTREGUE COM SUCESSO] Para [${destinationJid}]`);
        } catch (sendErr) {
            console.warn(`⚠️ Envio para [${destinationJid}] falhou (${sendErr.message}).`);
        }

        if (sent && sent.id && sent.id.id) {
            botSentMsgIds.add(sent.id.id);
            if (botSentMsgIds.size > 1000) {
                const first = botSentMsgIds.values().next().value;
                botSentMsgIds.delete(first);
            }
        }
        resolve(sent);
        await new Promise(r => setTimeout(r, 500));
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

async function isLidMe(lid) {
    if (!lid || !lid.includes('@lid')) return false;
    if (selfJids.has(lid)) return true;

    // Verificar no arquivo self_jids.json local
    if (fs.existsSync(config.SELF_JIDS_PATH)) {
        try {
            const raw = fs.readFileSync(config.SELF_JIDS_PATH, 'utf8');
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.includes(lid)) {
                selfJids.add(lid);
                return true;
            }
        } catch(e) {}
    }

    // Verificar mapeamento existente na base SQLite
    try {
        const mapped = db.prepare("SELECT phone_jid, phone_number FROM lid_mappings WHERE lid = ?").get(lid);
        const myNum = config.MY_NUMBER ? config.MY_NUMBER.replace(/\D/g, '') : '';
        if (mapped) {
            const phone = (mapped.phone_jid || mapped.phone_number || '').replace(/\D/g, '');
            if (phone && phone === myNum) {
                selfJids.add(lid);
                fs.writeFileSync(config.SELF_JIDS_PATH, JSON.stringify(Array.from(selfJids), null, 2), 'utf8');
                console.log(`🔑 [isLidMe] LID [${lid}] mapeado no SQLite como nosso próprio número.`);
                return true;
            }
        }
    } catch(e) {}

    // Resolver remotamente via API getContactById
    try {
        const contact = await client.getContactById(lid).catch(() => null);
        if (contact && contact.number) {
            const cleanNum = contact.number.replace(/\D/g, '');
            const myNum = config.MY_NUMBER ? config.MY_NUMBER.replace(/\D/g, '') : '';
            if (cleanNum && cleanNum === myNum) {
                selfJids.add(lid);
                fs.writeFileSync(config.SELF_JIDS_PATH, JSON.stringify(Array.from(selfJids), null, 2), 'utf8');
                console.log(`🔑 [isLidMe] LID [${lid}] resolvido e confirmado como nosso próprio número via WhatsApp API.`);
                return true;
            }
        }
    } catch(e) {}

    return false;
}

function checkIsSelf(msg, clientObj = client, selfJidsSet = selfJids) {
    if (!msg) return false;

    const fromNum = msg.from ? msg.from.split('@')[0].replace(/\D/g, '') : '';
    const toNum = msg.to ? msg.to.split('@')[0].replace(/\D/g, '') : '';
    const remoteNum = (msg.id && msg.id.remote) ? msg.id.remote.split('@')[0].replace(/\D/g, '') : '';
    const myNum = config.MY_NUMBER ? config.MY_NUMBER.replace(/\D/g, '') : '';
    const widUser = (clientObj && clientObj.info && clientObj.info.wid && clientObj.info.wid.user) ? clientObj.info.wid.user : '';

    const isFromAdmin = (myNum && fromNum === myNum) || (widUser && fromNum === widUser) || selfJidsSet.has(msg.from);
    const isToAdmin = (myNum && toNum === myNum) || (widUser && toNum === widUser) || (myNum && remoteNum === myNum) || (widUser && remoteNum === widUser) || selfJidsSet.has(msg.to) || (msg.id && selfJidsSet.has(msg.id.remote));

    // Se a mensagem foi enviada por mim (msg.fromMe === true)
    if (msg.fromMe) {
        // É auto-mensagem (Chat 'Você') apenas se o destinatário/remote for o próprio Administrador
        if (isToAdmin || (toNum && myNum && toNum === myNum) || (toNum && widUser && toNum === widUser)) return true;
        return false;
    }

    // Se a mensagem foi recebida (!msg.fromMe), é self apenas se o remetente for o próprio Administrador
    if (isFromAdmin) return true;

    return false;
}

function getHelpMenuText() {
    return `⚡ *CENTRAL DE COMANDOS DA IA (!admin ou !ia)*
━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 *PERFIL DO USUÁRIO / EMPRESA*
• \`!admin perfil\` ➔ Ver dados cadastrados no perfil
• \`!admin set <chave> <valor>\` ➔ Atualizar dado (ex: \`!admin set cidade São Paulo\`)

🧠 *MEMÓRIAS & ANOTAÇÕES*
• \`!admin memorias\` ➔ Listar fatos e memórias gravadas
• \`!admin nota <texto>\` ➔ Gravar anotação rápida no SQLite

📇 *AGENDA DE CONTATOS*
• \`!admin contatos\` ➔ Listar contatos cadastrados
• \`!admin contato <num> <nome> <relação>\` ➔ Cadastrar contato

🚫 *BLACKLIST DE BLOQUEIO DE RESPOSTAS*
• \`!bloquear <número>\` ➔ Bloquear respostas automáticas para um celular
• \`!bloquear\` ➔ Digite no chat de qualquer pessoa para bloqueá-la em silêncio
• \`!desbloquear <número>\` ➔ Desbloquear pessoa
• \`!desbloquear\` ➔ Digite no chat de qualquer pessoa para desbloqueá-la em silêncio
• \`!bloqueados\` ➔ Listar contatos na Blacklist

⏰ *DISPARADOR DE AUTOMAÇÕES*
• \`!admin automacoes\` ➔ Ver agendamentos e envios diários

🔴 *CONTROLE REMOTO DE ATENDIMENTO*
• \`!pausar\` ➔ Pausar respostas automáticas para terceiros (Modo Silencioso)
• \`!retomar\` ➔ Reativar atendimento automático para terceiros
• \`!desligar\` ➔ Encerrar o processo da IA no computador (Kill-Switch)

📊 *TELEMETRIA & LIMPEZA*
• \`!status\` ➔ Ver status da IA e estatísticas
• \`!limpar\` ➔ Apagar histórico desta conversa no SQLite
• \`!admin rag\` ➔ Listar documentos RAG indexados
• \`!admin templates\` ➔ Listar templates de prompts por nicho`;
}

function getProfileText() {
    const profile = getProfileData();
    let txt = `📋 *PERFIL DO ADMINISTRADOR (CADASTRO NO SQLITE)*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (profile.length === 0) {
        txt += `Nenhum dado cadastrado ainda. Use \`!admin set <chave> <valor>\` para cadastrar.`;
    } else {
        profile.forEach(p => { txt += `• *${p.key}*: ${p.value}\n`; });
    }
    return txt;
}

function getMemoriesText() {
    const memories = getMemories();
    let txt = `🧠 *MEMÓRIAS & ANOTAÇÕES GRAVADAS*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (memories.length === 0) {
        txt += `Nenhuma memória gravada ainda. Use \`!admin nota <texto>\` para anotações.`;
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
    const docs = getRagDocs();
    let txt = `📂 *BASE DE CONHECIMENTO RAG INDEXADA (${docs.length})*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (docs.length === 0) {
        txt += `Nenhum documento indexado no momento.`;
    } else {
        docs.forEach(d => { 
            const chunks = d.chunk_count ? ` (${d.chunk_count} blocos)` : '';
            txt += `• [${(d.type || 'DOC').toUpperCase()}] *${d.title}*${chunks}\n`; 
        });
    }
    return txt;
}

function getTemplatesText() {
    const tpls = getPromptTemplates();
    let txt = `📦 *MARKETPLACE DE TEMPLATES DE PROMPT*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    tpls.forEach(t => { txt += `${t.icon} *${t.title}* (${t.niche})\n  ID: \`${t.id}\`\n`; });
    return txt;
}

function buildSystemPrompt(isSelf, senderLabel, contactInfo = {}, queryText = '') {
    const now = new Date();
    const tzOption = { timeZone: 'America/Sao_Paulo' };
    const dataAtual = now.toLocaleDateString('pt-BR', tzOption);
    const horaAtual = now.toLocaleTimeString('pt-BR', { ...tzOption, hour: '2-digit', minute: '2-digit' });

    const activeObj = db.prepare('SELECT name, prompt FROM personalities WHERE active = 1').get();
    const personalityName = activeObj ? activeObj.name : 'Agente de IA';
    const personalityPrompt = getActivePersonalityPrompt();
    const trainingContext = getFormattedTrainingContext();
    const ragContext = queryText ? buildRagPromptContext(queryText) : '';
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
- Você está conversando com o Administrador no chat de testes/comunicação direta.
- Mantenha 100% a persona '${personalityName}' definida acima em todas as suas respostas.

${timeContext}
${pContext}
${trainingContext}
${ragContext}`;
    } else {
        const contactJid = senderLabel.includes('@') ? senderLabel : `${senderLabel}@c.us`;
        const dbContact = db.prepare('SELECT * FROM contacts WHERE jid = ? OR phone_jid = ? OR lid_jid = ?').get(contactJid, contactJid, contactJid);

        let realName = '';
        let relationshipContext = '';
        if (dbContact) {
            if (isHumanName(dbContact.name)) {
                realName = dbContact.name;
            }
            relationshipContext = `\n[INFORMAÇÕES DESTE CONTATO / CLIENTE NO SISTEMA]\n`;
            if (dbContact.name) relationshipContext += `- Nome Cadastrado: ${dbContact.name}\n`;
            if (dbContact.relationship) relationshipContext += `- Grau de Relacionamento: ${dbContact.relationship}\n`;
            if (dbContact.tags) relationshipContext += `- Tags / Segmento: ${dbContact.tags}\n`;
            if (dbContact.notes) relationshipContext += `- Histórico / Observações: ${dbContact.notes}\n`;
        }

        return `${mandatoryPersonaHeader}

[INSTRUÇÕES DE ATENDIMENTO A CLIENTE / TERCEIRO]
- Você está respondendo a uma mensagem enviada por um cliente ou terceiro no WhatsApp comercial.${relationshipContext}
- REGRA DE OURO: NUNCA trate o cliente como se fosse o Administrador.
- ${realName ? `Cumprimente o cliente pelo nome real ('${realName}') de forma empática e personalizada.` : "Cumprimente o cliente educadamente de forma profissional."}
- Responda estritamente mantendo a persona '${personalityName}' e as diretrizes definidas no prompt principal da IA ativada acima.
- Se houver tags ou notas cadastradas sobre o cliente, adapte a conversa às necessidades e histórico dele.
- Quando houver dados oficiais da Base de Conhecimento RAG abaixo, use-os como fonte primária de verdade para esclarecer dúvidas com exatidão.

${timeContext}
${trainingContext}
${ragContext}`;
    }
}

client.on('qr', async (qr) => {
    currentQrRaw = qr;
    try {
        currentQrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
    } catch (e) {
        currentQrDataUrl = null;
    }
    console.log(`\n📲 QR CODE GERADO! Escaneie no WhatsApp.`);
    qrcodeTerminal.generate(qr, { small: true });
    broadcastLog('security', 'QR Code Gerado', 'Aguardando escaneamento pelo celular ou painel web', '🔵');
});

client.on('authenticated', () => {
    currentQrRaw = null;
    currentQrDataUrl = null;
    console.log(`[Auth] ✅ Autenticação bem-sucedida!`);
    broadcastLog('security', 'Autenticação Concluída', 'Sessão do WhatsApp autenticada com sucesso', '🟢');
});

client.on('loading_screen', (percent, message) => {
    console.log(`⏳ [CARREGANDO WHATSAPP] ${percent}% - ${message}`);
});

client.on('change_state', (state) => {
    console.log(`📶 [ESTADO WHATSAPP] ${state}`);
});

client.on('auth_failure', (msg) => {
    console.error('❌ [Auth Failure] Falha na autenticação do WhatsApp:', msg);
    isReady = false;
    currentQrRaw = null;
    currentQrDataUrl = null;
    broadcastLog('security', 'Falha de Autenticação', msg || 'Erro de credencial', '🔴');
});

client.on('disconnected', (reason) => {
    console.warn('⚠️ [WhatsApp Disconnected] Cliente WhatsApp desconectou:', reason);
    isReady = false;
    currentQrRaw = null;
    currentQrDataUrl = null;
    broadcastLog('system', 'WhatsApp Desconectado', `Motivo: ${reason}`, '🔴');
    if (!isDisconnecting) {
        setTimeout(() => {
            console.log('🔄 Tentando re-inicializar o cliente WhatsApp...');
            cleanAuthSession();
            client.initialize().catch(e => console.error('Erro ao reconectar WhatsApp:', e.message));
        }, 4000);
    }
});

client.on('ready', async () => {
    isReady = true;
    currentQrRaw = null;
    currentQrDataUrl = null;
    startupTimestamp = Date.now(); // Marca o momento exato que o WhatsApp ficou pronto
    await updateSelfInfo(client);
    console.log(`\n🟢 WHATSAPP CONECTADO E PRONTO PARA ATENDIMENTO! (timestamp: ${startupTimestamp})`);
    broadcastLog('system', 'WhatsApp Conectado', `Cliente pronto no celular ${config.MY_NUMBER || ''}`, '🟢');
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

async function handleIncomingOrCreatedMessage(msg, eventType = 'message') {
    try {
        if (!msg || !msg.id) {
            return;
        }

        // ─── FILTRO DE MENSAGENS ANTIGAS (ignora histórico carregado na sincronização) ───
        const msgTimestamp = msg.timestamp ? msg.timestamp * 1000 : 0;
        if (msgTimestamp > 0 && msgTimestamp < startupTimestamp) {
            return; // Mensagem anterior ao boot - ignorar silenciosamente
        }

        // Logar apenas mensagens novas e válidas recebidas pós-boot
        console.log(`📥 [EVENT: ${eventType}] de=${msg.from} | fromMe=${msg.fromMe} | body="${(msg.body || '').substring(0, 40)}"`);

        let body = (msg.body || '').trim();
        if (!body && msg.hasMedia) {
            body = '[Mídia recebida do contato]';
        }
        if (!body) {
            console.log(`ℹ️ [DEBUG] Mensagem vazia/descriptografando (body vazio). Ignorando deduplicação temporariamente para reprocessar depois.`);
            return;
        }

        const msgIdStr = (msg.id && (msg.id._serialized || msg.id.id)) ? (msg.id._serialized || msg.id.id) : null;
        if (msgIdStr) {
            if (processedMsgIds.has(msgIdStr) || isMessageProcessed(msgIdStr)) return;
            processedMsgIds.add(msgIdStr);
            markMessageProcessed(msgIdStr);
            if (processedMsgIds.size > 2000) {
                const first = processedMsgIds.values().next().value;
                processedMsgIds.delete(first);
            }
        }

        // ──── CAPTURA AUTOMÁTICA DE LID BIDIRECIONAL (NÃO-BLOQUEANTE) ────
        if (!msg.fromMe && msg.from) {
            const _fromJid = msg.from;
            setTimeout(async () => {
                try {
                    if (_fromJid.includes('@lid')) {
                        let resolvedPhone = '';
                        let resolvedName = '';

                        // 1. Resolver telefone do LID via WWebJS / Puppeteer
                        if (client.pupPage) {
                            try {
                                const pair = await client.pupPage.evaluate(async (lid) => {
                                    try {
                                        if (window.WWebJS && typeof window.WWebJS.enforceLidAndPnRetrieval === 'function') {
                                            const res = await window.WWebJS.enforceLidAndPnRetrieval(lid);
                                            const pnStr = res && res.phone ? (res.phone._serialized || res.phone) : '';
                                            return { phone: pnStr };
                                        }
                                        if (window.require) {
                                            const wid = window.require('WAWebWidFactory').createWid(lid);
                                            const pn = window.require('WAWebApiContact').getPhoneNumber(wid);
                                            return { phone: pn ? (pn._serialized || pn) : '' };
                                        }
                                    } catch(e) {}
                                    return null;
                                }, _fromJid);

                                if (pair && pair.phone) {
                                    resolvedPhone = pair.phone;
                                }
                            } catch(e) {}
                        }

                        // 2. Se falhar, tentar método getContactLidAndPhone
                        if (!resolvedPhone && typeof client.getContactLidAndPhone === 'function') {
                            try {
                                const res = await client.getContactLidAndPhone([_fromJid]);
                                if (res && res[0] && res[0].pn) {
                                    resolvedPhone = res[0].pn;
                                }
                            } catch(e) {}
                        }

                        // 3. Buscar nome do contato
                        const contact = await withTimeout(client.getContactById(_fromJid), 4000).catch(() => null);
                        if (contact) {
                            resolvedName = contact.name || contact.pushname || contact.shortName || '';
                        }

                        // 4. Salvar mapeamento
                        if (resolvedPhone) {
                            saveLidMapping(_fromJid, resolvedPhone, resolvedName);
                            console.log(`🔗 [LID AUTO-CAPTURA] ${_fromJid} ➔ ${resolvedPhone} (${resolvedName})`);
                        } else if (resolvedName) {
                            saveLidMapping(_fromJid, '', resolvedName);
                        }
                    } else if (_fromJid.includes('@c.us')) {
                        let resolvedLid = '';
                        if (client.pupPage) {
                            try {
                                const pair = await client.pupPage.evaluate(async (phoneJid) => {
                                    try {
                                        if (window.WWebJS && typeof window.WWebJS.enforceLidAndPnRetrieval === 'function') {
                                            const res = await window.WWebJS.enforceLidAndPnRetrieval(phoneJid);
                                            return res && res.lid ? (res.lid._serialized || res.lid) : null;
                                        }
                                        if (window.require) {
                                            const wid = window.require('WAWebWidFactory').createWid(phoneJid);
                                            const lid = window.require('WAWebApiContact').getCurrentLid(wid);
                                            return lid ? (lid._serialized || lid) : null;
                                        }
                                    } catch(e) {}
                                    return null;
                                }, _fromJid);
                                if (pair && String(pair).includes('@lid')) resolvedLid = String(pair);
                            } catch(e) {}
                        }
                        if (resolvedLid) {
                            saveLidMapping(resolvedLid, _fromJid, '');
                            console.log(`🔗 [LID AUTO-CAPTURA] ${resolvedLid} ➔ ${_fromJid}`);
                        }
                    }
                } catch(e) {}
            }, 100);
        }

        // ─── AUTO-DETECÇÃO DO LID PRÓPRIO (ANTES do checkIsSelf) ───
        if (msg.from && msg.from.includes('@lid') && !selfJids.has(msg.from)) {
            await isLidMe(msg.from);
        }
        if (msg.to && msg.to.includes('@lid') && !selfJids.has(msg.to)) {
            await isLidMe(msg.to);
        }

        const isSelf = checkIsSelf(msg, client, selfJids);
        const currentChatJid = (msg.id && msg.id.remote) ? msg.id.remote : (msg.fromMe ? msg.to : msg.from);

        console.log(`━━━━ FLUXO ━━━━ fromMe=${msg.fromMe} | isSelf=${isSelf} | chatJid=${currentChatJid}`);

        if (msg.from === 'status@broadcast' || msg.to === 'status@broadcast' || msg.isStatus) return;
        if ((msg.from && msg.from.includes('@g.us')) || (msg.to && msg.to.includes('@g.us'))) return;

        console.log(`📩 [MSG DETECTADA] fromMe=${msg.fromMe} | from=${msg.from} | to=${msg.to} | body="${body.substring(0, 35)}"`);

        // ─── 1. MENSAGENS ENVIADAS PELO PRÓPRIO ADMINISTRADOR (msg.fromMe === true) ───
        if (msg.fromMe) {
            if (botSentTexts.has(body)) return;
            if (msg.id && msg.id.id && botSentMsgIds.has(msg.id.id)) return;
            if (body.startsWith('🤖') || body.startsWith('☁️') || body.startsWith('⚡') || body.startsWith('🚫') || body.startsWith('✅') || body.startsWith('⚠️') || body.startsWith('📊') || body.startsWith('📋') || body.startsWith('🧠') || body.startsWith('📇') || body.startsWith('⏰') || body.startsWith('🔴') || body.startsWith('⏸️') || body.startsWith('▶️') || body.startsWith('👋') || body.startsWith('🧹')) return;

            const lower = body.toLowerCase();

            // A) SE FOI DIGITADO EM CHAT DE TERCEIRO (!isSelf):
            if (!isSelf) {
                if (lower.startsWith('!admin bloquear') || lower.startsWith('!ia bloquear') || lower.startsWith('!admin bloquear') || lower.startsWith('!bloquear') || lower.startsWith('!block') || lower.startsWith('!admin block') || lower.startsWith('!ia block') || lower.startsWith('!admin block')) {
                    let raw = '';
                    if (lower.startsWith('!admin bloquear') || lower.startsWith('!ia bloquear') || lower.startsWith('!admin bloquear')) raw = body.slice(17).trim();
                    else if (lower.startsWith('!admin block') || lower.startsWith('!ia block') || lower.startsWith('!admin block')) raw = body.slice(14).trim();
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
                            blockContact(raw, cName, 'Admin');
                            if (c && c.block) await c.block().catch(() => {});
                        } catch(e) {
                            blockContact(raw, '', 'Admin');
                        }
                        broadcastLog('security', 'Contato Bloqueado pelo Comando Direct (Silencioso)', `JID: ${raw}`, '🔴');
                    }
                    return;
                }

                if (lower.startsWith('!admin desbloquear') || lower.startsWith('!ia desbloquear') || lower.startsWith('!admin desbloquear') || lower.startsWith('!desbloquear') || lower.startsWith('!unblock') || lower.startsWith('!admin unblock') || lower.startsWith('!ia unblock') || lower.startsWith('!admin unblock')) {
                    let raw = '';
                    if (lower.startsWith('!admin desbloquear') || lower.startsWith('!ia desbloquear') || lower.startsWith('!admin desbloquear')) raw = body.slice(20).trim();
                    else if (lower.startsWith('!admin unblock') || lower.startsWith('!ia unblock') || lower.startsWith('!admin unblock')) raw = body.slice(16).trim();
                    else if (lower.startsWith('!desbloquear')) raw = body.slice(12).trim();
                    else if (lower.startsWith('!unblock')) raw = body.slice(8).trim();

                    if (!raw) raw = currentChatJid;
                    if (raw) {
                        unblockContact(raw, 'Admin');
                        try {
                            client.getContactById(raw.includes('@') ? raw : `${raw.replace(/\D/g, '')}@c.us`)
                                  .then(async c => { if (c && c.unblock) await c.unblock().catch(() => {}); })
                                  .catch(() => {});
                        } catch(e) {}
                        broadcastLog('security', 'Contato Desbloqueado pelo Comando Direct (Silencioso)', `JID: ${raw}`, '🟢');
                    }
                    return;
                }

                if (lower === '!pausar' || lower === '!admin pausar' || lower === '!ia pausar' || lower === '!admin pausar') {
                    setGlobalPaused(true);
                    broadcastLog('system', 'IA Pausada (Silencioso)', 'Cloud entrou em Modo Silencioso', '🔴');
                    return;
                }

                if (lower === '!retomar' || lower === '!admin retomar' || lower === '!ia retomar' || lower === '!admin retomar') {
                    setGlobalPaused(false);
                    broadcastLog('system', 'IA Reativada (Silencioso)', 'Cloud voltou a atender', '🟢');
                    return;
                }

                // Se o Administrador digitou qualquer outro comando ou mensagem comum em chat de cliente: SILÊNCIO ABSOLUTO!
                console.log(`ℹ️ [IGNORADO] Mensagem digitada pelo Administrador manualmente no chat [${currentChatJid}].`);
                return;
            }

            // B) MENSAGENS OU COMANDOS DIGITADOS NO CHAT PRÓPRIO DO ADMINISTRADOR ("VOCÊ" / isSelf === true)
            if (body.startsWith('!') || body.toLowerCase().startsWith('!admin') || body.toLowerCase().startsWith('!ia') || body.toLowerCase().startsWith('!nobazzy')) {
                if (lower === '!admin' || lower === '!ia' || lower === '!nobazzy' || lower === '!ajuda' || lower === '!comandos' || lower.includes('ajuda') || lower.includes('comandos')) {
                    await sendBotMessage(currentChatJid, getHelpMenuText());
                    return;
                }

                if (lower === '!admin perfil' || lower === '!ia perfil' || lower === '!nobazzy perfil' || lower === '!perfil') {
                    await sendBotMessage(currentChatJid, getProfileText());
                    return;
                }

                if (lower.startsWith('!admin set ') || lower.startsWith('!ia set ') || lower.startsWith('!admin set ') || lower.startsWith('!set ')) {
                    const rawArgs = body.startsWith('!admin set ') ? body.slice(13).trim() : body.slice(5).trim();
                    const spaceIdx = rawArgs.indexOf(' ');
                    if (spaceIdx > 0) {
                        const key = rawArgs.substring(0, spaceIdx).trim();
                        const val = rawArgs.substring(spaceIdx + 1).trim();
                        setProfileValue(key, val, 'Admin');
                        await sendBotMessage(currentChatJid, `✅ *DADO DO PERFIL SALVO NO SQLITE!*\n• *${key}*: ${val}`);
                    }
                    return;
                }

                if (lower === '!admin memorias' || lower === '!ia memorias' || lower === '!admin memorias' || lower === '!memorias') {
                    await sendBotMessage(currentChatJid, getMemoriesText());
                    return;
                }

                if (lower.startsWith('!admin nota ') || lower.startsWith('!ia nota ') || lower.startsWith('!admin nota ') || lower.startsWith('!nota ')) {
                    const noteText = body.startsWith('!admin nota ') ? body.slice(14).trim() : body.slice(6).trim();
                    if (noteText) {
                        addMemory('Anotação Geral', noteText, 'Admin');
                        await sendBotMessage(currentChatJid, `📝 *ANOTAÇÃO GRAVADA NO SQLITE!*\n• ${noteText}`);
                    }
                    return;
                }

                if (lower === '!admin contatos' || lower === '!ia contatos' || lower === '!admin contatos' || lower === '!contatos') {
                    await sendBotMessage(currentChatJid, getContactsText());
                    return;
                }

                if (lower.startsWith('!admin contato ') || lower.startsWith('!ia contato ') || lower.startsWith('!admin contato ') || lower.startsWith('!contato ')) {
                    const rawArgs = body.startsWith('!admin contato ') ? body.slice(17).trim() : body.slice(9).trim();
                    const parts = rawArgs.split(' ');
                    if (parts.length >= 2) {
                        const num = parts[0];
                        const name = parts[1];
                        const rel = parts.slice(2).join(' ') || 'Contato';
                        const jid = num.includes('@') ? num : `${num.replace(/\D/g, '')}@c.us`;
                        saveContact(jid, name, rel, '', '', 'Geral', 0, 'Admin');
                        await sendBotMessage(currentChatJid, `📇 *CONTATO CADASTRADO NO SQLITE!*\n• *Nome:* ${name}\n• *JID:* ${jid}`);
                    }
                    return;
                }

                if (lower.startsWith('!admin bloquear') || lower.startsWith('!ia bloquear') || lower.startsWith('!admin bloquear') || lower.startsWith('!bloquear') || lower.startsWith('!block')) {
                    let raw = '';
                    if (lower.startsWith('!admin bloquear') || lower.startsWith('!ia bloquear') || lower.startsWith('!admin bloquear')) raw = body.slice(17).trim();
                    else if (lower.startsWith('!bloquear')) raw = body.slice(9).trim();
                    else if (lower.startsWith('!block')) raw = body.slice(6).trim();

                    if (!raw) raw = currentChatJid;
                    if (raw) {
                        blockContact(raw, '', 'Admin');
                        try {
                            client.getContactById(raw.includes('@') ? raw : `${raw.replace(/\D/g, '')}@c.us`)
                                  .then(async c => { if (c && c.block) await c.block().catch(() => {}); })
                                  .catch(() => {});
                        } catch(e) {}
                        await sendBotMessage(currentChatJid, `🚫 *CONTATO BLOQUEADO SILENCIOSAMENTE!*\n• Contato: ${raw}`);
                    }
                    return;
                }

                if (lower.startsWith('!admin desbloquear') || lower.startsWith('!ia desbloquear') || lower.startsWith('!admin desbloquear') || lower.startsWith('!desbloquear') || lower.startsWith('!unblock')) {
                    let raw = '';
                    if (lower.startsWith('!admin desbloquear') || lower.startsWith('!ia desbloquear') || lower.startsWith('!admin desbloquear')) raw = body.slice(20).trim();
                    else if (lower.startsWith('!desbloquear')) raw = body.slice(12).trim();
                    else if (lower.startsWith('!unblock')) raw = body.slice(8).trim();

                    if (!raw) raw = currentChatJid;
                    if (raw) {
                        unblockContact(raw, 'Admin');
                        try {
                            client.getContactById(raw.includes('@') ? raw : `${raw.replace(/\D/g, '')}@c.us`)
                                  .then(async c => { if (c && c.unblock) await c.unblock().catch(() => {}); })
                                  .catch(() => {});
                        } catch(e) {}
                        await sendBotMessage(currentChatJid, `✅ *CONTATO DESBLOQUEADO SILENCIOSAMENTE!*\n• Contato: ${raw}`);
                    }
                    return;
                }

                if (lower === '!bloqueados' || lower === '!admin bloqueados') {
                    await sendBotMessage(currentChatJid, getBlockedText());
                    return;
                }

                if (lower === '!admin automacoes' || lower === '!ia automacoes' || lower === '!admin automacoes' || lower === '!automacoes') {
                    await sendBotMessage(currentChatJid, getAutomationsText());
                    return;
                }

                if (lower === '!pausar' || lower === '!admin pausar' || lower === '!ia pausar' || lower === '!admin pausar') {
                    setGlobalPaused(true);
                    await sendBotMessage(currentChatJid, '⏸️ *CLOUD PAUSADA (MODO SILENCIOSO)*');
                    return;
                }

                if (lower === '!retomar' || lower === '!admin retomar' || lower === '!ia retomar' || lower === '!admin retomar') {
                    setGlobalPaused(false);
                    await sendBotMessage(currentChatJid, '▶️ *CLOUD REATIVADA COM SUCESSO!*');
                    return;
                }

                if (lower === '!desligar' || lower === '!admin desligar') {
                    await sendBotMessage(currentChatJid, '🔴 *ENCERRANDO PROCESSO CLOUD AI...*');
                    setTimeout(() => process.exit(0), 1000);
                    return;
                }

                if (lower === '!status' || lower === '!admin status') {
                    await sendBotMessage(currentChatJid, getStatusText());
                    return;
                }

                if (lower === '!limpar' || lower === '!admin limpar') {
                    db.prepare('DELETE FROM chat_history WHERE chat_id = ?').run(currentChatJid);
                    await sendBotMessage(currentChatJid, '🧹 *HISTÓRICO DESTA CONVERSA LIMPO NO SQLITE!*');
                    return;
                }

                if (lower === '!admin rag' || lower === '!ia rag' || lower === '!admin rag' || lower === '!rag') {
                    await sendBotMessage(currentChatJid, getRagText());
                    return;
                }

                if (lower === '!admin templates' || lower === '!ia templates' || lower === '!admin templates' || lower === '!templates') {
                    await sendBotMessage(currentChatJid, getTemplatesText());
                    return;
                }

                return;
            }

            // C) MENSAGENS NORMAIS ENVIADAS PELO ADMINISTRADOR PARA SI MESMO (CHAT "VOCÊ" / isSelf === true)
            // QUANDO O ADMINISTRADOR ENVIA MENSAGEM NO PRÓPRIO CHAT ("VOCÊ"), A IA RESPONDE AO ADMINISTRADOR!
            console.log(`💬 [MENSAGEM ADMINISTRADOR -> CHAT VOCÊ]: "${body}"`);
            broadcastLog('chat', 'Mensagem do Administrador no Chat Você', `Para [Administrador]: "${body.substring(0, 40)}..."`, '🟢');
            db.prepare('INSERT INTO chat_history (chat_id, sender, message, timestamp) VALUES (?, ?, ?, ?)').run(currentChatJid, 'user', body, new Date().toISOString());

            const historyRows = db.prepare('SELECT sender, message FROM chat_history WHERE chat_id = ? ORDER BY id DESC LIMIT 10').all(currentChatJid).reverse();

            let promptMessages = [
                { role: 'system', content: buildSystemPrompt(true, 'Admin', {}, body) }
            ];

            historyRows.forEach(row => {
                promptMessages.push({
                    role: row.sender === 'user' ? 'user' : 'assistant',
                    content: row.message
                });
            });

            broadcastLog('ai', 'Enviando Prompt (Modo Criador/Administrador) para a IA', `Provedor: ${config.ACTIVE_PROVIDER || 'OpenAI'}`, '🔵');

            const aiReply = await callAIProvider(promptMessages);

            if (aiReply) {
                let formattedReply = aiReply;
                if (!aiReply.startsWith('🤖') && !aiReply.startsWith('☁️')) {
                    formattedReply = `🤖 ${aiReply}`;
                }

                db.prepare('INSERT INTO chat_history (chat_id, sender, message, timestamp) VALUES (?, ?, ?, ?)').run(currentChatJid, 'assistant', formattedReply, new Date().toISOString());
                console.log(`🤖 [IA RESPONDEU ADMINISTRADOR NO CHAT VOCÊ]: "${formattedReply}"`);
                broadcastLog('ai', 'IA Respondeu ao Administrador', `No Chat Você: "${formattedReply.substring(0, 40)}..."`, '🟢');

                await sendBotMessage(currentChatJid, formattedReply, msg);
            }
            return;
        }

        // ─── 2. MENSAGENS INCOMING RECEBIDAS DE TERCEIROS (!msg.fromMe) ───
        const customerJid = msg.from;

        // Se a mensagem incoming for do próprio Administrador (segundo aparelho/sessão), NUNCA TRATAR COMO CLIENTE!
        const cleanCustomer = cleanNumber(customerJid);
        const cleanMyNumber = cleanNumber(config.MY_NUMBER);
        if (isSelf || selfJids.has(customerJid) || (cleanMyNumber && cleanCustomer === cleanMyNumber)) {
            console.log(`ℹ️ [IGNORADO] Mensagem recebida do próprio número do Administrador [${customerJid}].`);
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

        // Verificação de Horário Comercial & Mensagem de Ausência
        const currentSettings = getAllSettings();
        const hoursEnabled = currentSettings && currentSettings.businessHours && currentSettings.businessHours.enabled;

        if (hoursEnabled && isOutsideBusinessHours()) {
            console.log(`🌙 [HORÁRIO COMERCIAL] Mensagem de [${customerJid}] recebida fora do expediente.`);
            broadcastLog('system', 'Fora do Horário Comercial', `Mensagem de ${customerJid} recebida fora do expediente (Controle Ativo)`, '🌙');

            const absenceEnabled = currentSettings && currentSettings.absence && currentSettings.absence.enabled;
            if (absenceEnabled && canSendAbsenceMessage(customerJid)) {
                const absenceMsg = (currentSettings && currentSettings.absence && currentSettings.absence.message)
                    ? currentSettings.absence.message
                    : 'Olá! No momento estamos fora do nosso horário de atendimento.';
                const formattedAbsence = `👋 ${absenceMsg}`;
                db.prepare('INSERT INTO chat_history (chat_id, sender, message, timestamp) VALUES (?, ?, ?, ?)').run(customerJid, 'assistant', formattedAbsence, new Date().toISOString());
                await sendBotMessage(customerJid, formattedAbsence, msg);
                recordAbsenceMessageSent(customerJid);
                broadcastLog('chat', 'Mensagem de Ausência Enviada', `Para [${customerJid}]: "${absenceMsg.substring(0, 40)}..."`, '🌙');
            } else if (!absenceEnabled) {
                console.log(`ℹ️ [AUSÊNCIA DESATIVADA] Mensagem de ausência desativada nas configurações. Permanecendo em silêncio fora do expediente.`);
            }
            return;
        }

        // ─── DISPARO COM BUFFER INTELIGENTE DE DEBOUNCE (AGRUPA MENSAGENS RÁPIDAS) ───
        scheduleCustomerAiReply(customerJid, msg, body);
        return;

    } catch (e) {
        console.error('⚠️ Erro no processamento do WhatsApp:', e.message);
    }
}

// ─── BUFFER DE DEBOUNCE & AGREGAÇÃO INTELIGENTE DE MENSAGENS POR CONTATO ───
// Evita respostas duplicadas quando o cliente envia frases curtas picadas em sequência rápida
const customerDebounceMap = new Map();
const customerProcessingSet = new Set();

/**
 * Enfileira e consolida mensagens rápidas do mesmo contato.
 * Aguarda uma janela de debounce (padrão 4.0s) antes de disparar a IA.
 * Se novas mensagens chegarem nessa janela, reinicia o timer e agrupa todas!
 */
function scheduleCustomerAiReply(customerJid, msgObj, bodyText) {
    const settings = getAllSettings();
    const debounceSeconds = (settings && settings.ai && settings.ai.debounce_seconds)
        ? Number(settings.ai.debounce_seconds)
        : 4.0;
    const debounceDelayMs = Math.max(1000, Math.min(15000, Math.round(debounceSeconds * 1000)));

    let buffer = customerDebounceMap.get(customerJid);

    if (!buffer) {
        buffer = {
            messages: [bodyText],
            lastMsgObj: msgObj,
            firstTimestamp: Date.now(),
            timer: null
        };
    } else {
        buffer.messages.push(bodyText);
        buffer.lastMsgObj = msgObj;
        if (buffer.timer) {
            clearTimeout(buffer.timer);
            buffer.timer = null;
        }
    }

    // Se a IA já estiver processando uma resposta para este cliente no momento,
    // apenas acumulamos no buffer. Quando a resposta atual terminar, ela iniciará
    // automaticamente um novo ciclo para responder às mensagens pendentes.
    if (customerProcessingSet.has(customerJid)) {
        console.log(`⏳ [BUFFER IA] Nova mensagem recebida de [${customerJid}] durante processamento ativo. Acumulada no buffer pendente.`);
        customerDebounceMap.set(customerJid, buffer);
        return;
    }

    // Limite máximo de espera acumulada (10s) para não travar respostas se o cliente digitar sem parar
    const MAX_WAIT_MS = 10000;
    const elapsed = Date.now() - buffer.firstTimestamp;
    const effectiveDelay = (elapsed + debounceDelayMs > MAX_WAIT_MS)
        ? Math.max(500, MAX_WAIT_MS - elapsed)
        : debounceDelayMs;

    console.log(`⏳ [BUFFER IA] Aguardando ${effectiveDelay / 1000}s para consolidar mensagens de [${customerJid}] (${buffer.messages.length} msg(s) agrupada(s))...`);
    broadcastLog('ai', 'Agrupando Mensagens Rápidas', `Cliente [${customerJid}] (${buffer.messages.length} msg(s) em buffer, espera ${effectiveDelay / 1000}s)`, '🔵');

    buffer.timer = setTimeout(async () => {
        const currentBuffer = customerDebounceMap.get(customerJid);
        if (!currentBuffer) return;
        customerDebounceMap.delete(customerJid);
        await processConsolidatedAiReply(customerJid, currentBuffer.lastMsgObj, currentBuffer.messages);
    }, effectiveDelay);

    customerDebounceMap.set(customerJid, buffer);
}

/**
 * Executa a chamada à IA consolidando todas as mensagens recebidas na rajada
 */
async function processConsolidatedAiReply(customerJid, lastMsgObj, bufferedMessages) {
    if (customerProcessingSet.has(customerJid)) return;
    customerProcessingSet.add(customerJid);

    try {
        const settings = getAllSettings();
        const historyLimit = (settings && settings.ai && settings.ai.history_limit) ? settings.ai.history_limit : 10;

        // Histórico recente do SQLite (as mensagens da rajada já foram salvas em chat_history individualmente)
        const historyRows = db.prepare(
            'SELECT sender, message FROM chat_history WHERE chat_id = ? ORDER BY id DESC LIMIT ?'
        ).all(customerJid, historyLimit).reverse();

        // Une as mensagens do lote atual para consulta de RAG e prompt do sistema
        const consolidatedQuery = bufferedMessages.join('\n');

        let promptMessages = [
            { role: 'system', content: buildSystemPrompt(false, customerJid.replace('@c.us', ''), {}, consolidatedQuery) }
        ];

        historyRows.forEach(row => {
            promptMessages.push({
                role: row.sender === 'user' ? 'user' : 'assistant',
                content: row.message
            });
        });

        console.log(`🤖 [PROCESSANDO RESPOSTA IA CONSOLIDADA] De [${customerJid}] (${bufferedMessages.length} msg(s): "${consolidatedQuery.replace(/\n/g, ' | ')}")...`);
        broadcastLog('ai', 'Enviando Prompt para a IA (Consolidado)', `Provedor: ${config.ACTIVE_PROVIDER || 'OpenAI'} (${bufferedMessages.length} msg(s) agrupada(s))`, '🔵');

        const aiReply = await callAIProvider(promptMessages);

        if (aiReply) {
            let formattedReply = aiReply;
            if (!aiReply.startsWith('🤖') && !aiReply.startsWith('☁️')) {
                formattedReply = `🤖 ${aiReply}`;
            }

            db.prepare('INSERT INTO chat_history (chat_id, sender, message, timestamp) VALUES (?, ?, ?, ?)').run(customerJid, 'assistant', formattedReply, new Date().toISOString());
            console.log(`✅ [IA RESPONDEU CLIENTE] Para [${customerJid}]: "${formattedReply}"`);
            broadcastLog('ai', 'IA Respondeu', `Para [${customerJid}]: "${formattedReply.substring(0, 40)}..."`, '🟢');

            await sendBotMessage(customerJid, formattedReply, lastMsgObj);
        } else {
            console.error(`⚠️ [ERRO IA] Provedor de IA não retornou conteúdo para [${customerJid}].`);
        }
    } catch (e) {
        console.error(`⚠️ Erro ao processar resposta consolidada da IA para [${customerJid}]:`, e.message);
    } finally {
        customerProcessingSet.delete(customerJid);

        // Se chegaram novas mensagens de texto enquanto a IA estava gerando resposta, agenda novo ciclo para elas
        const pendingBuffer = customerDebounceMap.get(customerJid);
        if (pendingBuffer && pendingBuffer.messages && pendingBuffer.messages.length > 0) {
            console.log(`🔄 [BUFFER IA] Disparando novo ciclo para ${pendingBuffer.messages.length} nova(s) mensagem(ns) pendente(s) de [${customerJid}]...`);
            if (pendingBuffer.timer) clearTimeout(pendingBuffer.timer);
            pendingBuffer.firstTimestamp = Date.now();
            const settings = getAllSettings();
            const debounceSeconds = (settings && settings.ai && settings.ai.debounce_seconds)
                ? Number(settings.ai.debounce_seconds)
                : 4.0;
            const delay = Math.max(1000, Math.min(15000, Math.round(debounceSeconds * 1000)));

            pendingBuffer.timer = setTimeout(async () => {
                const current = customerDebounceMap.get(customerJid);
                if (!current) return;
                customerDebounceMap.delete(customerJid);
                await processConsolidatedAiReply(customerJid, current.lastMsgObj, current.messages);
            }, delay);
        }
    }
}

// Eventos do WhatsApp (escuta mensagens recebidas e criadas com deduplicação)
client.on('message', (msg) => {
    handleIncomingOrCreatedMessage(msg, 'message');
});

client.on('message_create', (msg) => {
    handleIncomingOrCreatedMessage(msg, 'message_create');
});

async function resolveSingleLid(targetJidOrNumber) {
    try {
        if (!isReady || !client) return { success: false, error: 'WhatsApp não conectado' };

        const cleanDigits = targetJidOrNumber.replace(/\D/g, '');
        if (!cleanDigits) return { success: false, error: 'Número inválido' };

        // 1. Gerar candidatos de JID (com e sem 9º dígito para telefones do Brasil)
        const candidates = [];
        if (targetJidOrNumber.includes('@lid')) {
            candidates.push(targetJidOrNumber);
        } else {
            const primaryJid = targetJidOrNumber.includes('@') ? targetJidOrNumber : `${cleanDigits}@c.us`;
            candidates.push(primaryJid);

            // Variação brasileira de 9 dígitos (DDI 55)
            if (cleanDigits.startsWith('55') && cleanDigits.length === 13) {
                const noNine = `55${cleanDigits.substring(2, 4)}${cleanDigits.substring(5)}@c.us`;
                if (!candidates.includes(noNine)) candidates.push(noNine);
            } else if (cleanDigits.startsWith('55') && cleanDigits.length === 12) {
                const withNine = `55${cleanDigits.substring(2, 4)}9${cleanDigits.substring(4)}@c.us`;
                if (!candidates.includes(withNine)) candidates.push(withNine);
            }
        }

        console.log(`🔍 [RESOLVE SINGLE LID] Buscando LID para candidatos:`, candidates);

        let fetchedLid = '';
        let fetchedPhone = '';
        let fetchedName = '';

        // TENTATIVA 1: Via Puppeteer evaluate com enforceLidAndPnRetrieval e WAWebApiContact
        if (client.pupPage) {
            for (const cand of candidates) {
                try {
                    const result = await client.pupPage.evaluate(async (jid) => {
                        try {
                            if (window.WWebJS && typeof window.WWebJS.enforceLidAndPnRetrieval === 'function') {
                                const pair = await window.WWebJS.enforceLidAndPnRetrieval(jid);
                                if (pair && pair.lid) {
                                    const lidStr = pair.lid._serialized || pair.lid;
                                    const phoneStr = pair.phone ? (pair.phone._serialized || pair.phone) : '';
                                    if (lidStr && String(lidStr).includes('@lid')) {
                                        return { lid: String(lidStr), phone: String(phoneStr) };
                                    }
                                }
                            }

                            if (window.require) {
                                const widFactory = window.require('WAWebWidFactory');
                                const apiContact = window.require('WAWebApiContact');
                                if (widFactory && apiContact) {
                                    const wid = widFactory.createWid(jid);
                                    let lid = wid.server === 'lid' ? wid : apiContact.getCurrentLid(wid);
                                    let phone = wid.server === 'lid' ? apiContact.getPhoneNumber(wid) : wid;

                                    if (!lid) {
                                        const queryJob = window.require('WAWebQueryExistsJob');
                                        if (queryJob) {
                                            await queryJob.queryWidExists(wid);
                                            lid = apiContact.getCurrentLid(wid);
                                        }
                                    }

                                    if (lid) {
                                        const lidStr = lid._serialized || lid;
                                        const phoneStr = phone ? (phone._serialized || phone) : '';
                                        if (lidStr && String(lidStr).includes('@lid')) {
                                            return { lid: String(lidStr), phone: String(phoneStr) };
                                        }
                                    }
                                }
                            }
                        } catch(e) {}
                        return null;
                    }, cand);

                    if (result && result.lid) {
                        fetchedLid = result.lid;
                        fetchedPhone = result.phone || cand;
                        console.log(`✅ [RESOLVE SINGLE LID] Encontrado via enforceLidAndPnRetrieval: ${fetchedLid}`);
                        break;
                    }
                } catch(e) {}
            }
        }

        // TENTATIVA 2: Via client.getContactLidAndPhone nativo do whatsapp-web.js
        if (!fetchedLid && typeof client.getContactLidAndPhone === 'function') {
            for (const cand of candidates) {
                try {
                    const res = await client.getContactLidAndPhone([cand]);
                    if (res && res[0] && res[0].lid && res[0].lid.includes('@lid')) {
                        fetchedLid = res[0].lid;
                        fetchedPhone = res[0].pn || cand;
                        console.log(`✅ [RESOLVE SINGLE LID] Encontrado via getContactLidAndPhone: ${fetchedLid}`);
                        break;
                    }
                } catch(e) {}
            }
        }

        // TENTATIVA 3: Buscar nos chats/mensagens do WhatsApp Web Store
        if (!fetchedLid && client.pupPage) {
            try {
                const storeResult = await client.pupPage.evaluate((digits) => {
                    try {
                        const last8 = digits.slice(-8);
                        if (window.Store && window.Store.Chat) {
                            const chats = window.Store.Chat.models || window.Store.Chat._models || [];
                            for (const c of chats) {
                                const cId = c.id ? (c.id._serialized || c.id) : '';
                                const cContact = c.contact || {};
                                const cLid = cContact.lid ? (cContact.lid._serialized || cContact.lid) : '';
                                const cPhone = cContact.number || (cContact.id && cContact.id.user ? cContact.id.user : '');

                                if (cLid && cPhone && (cPhone.includes(last8) || cPhone === digits)) {
                                    return { lid: cLid, phone: `${cPhone}@c.us`, name: cContact.name || cContact.pushname || c.name || '' };
                                }
                                if (cId.includes('@lid') && (cPhone.includes(last8) || cPhone === digits)) {
                                    return { lid: cId, phone: `${cPhone}@c.us`, name: cContact.name || cContact.pushname || c.name || '' };
                                }
                            }
                        }
                    } catch(e) {}
                    return null;
                }, cleanDigits);

                if (storeResult && storeResult.lid) {
                    fetchedLid = storeResult.lid;
                    fetchedPhone = storeResult.phone || candidates[0];
                    fetchedName = storeResult.name || '';
                    console.log(`✅ [RESOLVE SINGLE LID] Encontrado via Store.Chat: ${fetchedLid}`);
                }
            } catch(e) {}
        }

        // TENTATIVA 4: Verificar se já temos mapeado no SQLite
        if (!fetchedLid) {
            const mapped = db.prepare("SELECT * FROM lid_mappings WHERE phone_number LIKE ? OR phone_jid = ?").get(`%${cleanDigits.slice(-8)}%`, candidates[0]);
            if (mapped && mapped.lid) {
                fetchedLid = mapped.lid;
                fetchedPhone = mapped.phone_jid || candidates[0];
                fetchedName = mapped.name || '';
            }
        }

        // TENTATIVA 5: Se o próprio parâmetro recebido já for um @lid
        if (!fetchedLid && targetJidOrNumber.includes('@lid')) {
            fetchedLid = targetJidOrNumber;
            fetchedPhone = candidates[0];
        }

        if (fetchedLid && fetchedLid.includes('@lid')) {
            if (!fetchedName) {
                try {
                    const cObj = await client.getContactById(fetchedPhone || candidates[0]).catch(() => null);
                    if (cObj) fetchedName = cObj.name || cObj.pushname || cObj.shortName || '';
                } catch(e) {}
            }
            if (!fetchedName) {
                const row = db.prepare("SELECT name FROM contacts WHERE phone_number LIKE ? OR phone_jid = ?").get(`%${cleanDigits.slice(-8)}%`, candidates[0]);
                if (row && row.name) fetchedName = row.name;
            }

            const phoneToSave = fetchedPhone || candidates[0];
            saveLidMapping(fetchedLid, phoneToSave, fetchedName);
            console.log(`💾 [RESOLVE SINGLE LID] Sucesso: ${fetchedLid} <-> ${phoneToSave} (${fetchedName})`);
            return { success: true, lidJid: fetchedLid, phoneJid: phoneToSave, name: fetchedName };
        }

        return { success: false, error: 'LID não retornado pelo WhatsApp para este contato' };
    } catch (e) {
        console.error('⚠️ [RESOLVE SINGLE LID ERROR]:', e.message);
        return { success: false, error: e.message };
    }
}

function getWhatsAppStatus() {
    return {
        connected: isReady,
        number: config.MY_NUMBER,
        paused: globalIsPaused,
        qr: currentQrDataUrl,
        headless: config.HEADLESS !== false
    };
}

async function disconnectWhatsApp(user = 'Admin') {
    try {
        if (isDisconnecting) {
            return { success: false, message: 'Processo de desconexão já em andamento...' };
        }
        isDisconnecting = true;
        isReady = false;
        currentQrRaw = null;
        currentQrDataUrl = null;

        addAuditLog(user, 'WHATSAPP_DISCONNECT', 'Sessão do WhatsApp desconectada pelo painel web');
        broadcastLog('security', 'Desconexão Solicitada', 'Encerrando sessão ativa do WhatsApp Web...', '🔴');

        try {
            await withTimeout(client.logout(), 8000);
            console.log('✅ [LOGOUT] Logout efetuado no WhatsApp Web.');
        } catch (errLogout) {
            console.warn('⚠️ [LOGOUT] client.logout() expirou ou falhou, finalizando via destroy():', errLogout.message);
            try {
                await withTimeout(client.destroy(), 4000);
            } catch (eD) {}
        }

        // Limpar arquivos de sessão para exigir novo QR code
        try {
            const authDir = config.AUTH_DIR;
            if (fs.existsSync(authDir)) {
                fs.rmSync(authDir, { recursive: true, force: true });
                console.log('🧹 [AUTH] Pasta de credenciais .wwebjs_auth removida.');
            }
        } catch (eRm) {
            console.warn('⚠️ Não foi possível limpar pasta .wwebjs_auth:', eRm.message);
        }

        broadcastLog('system', 'WhatsApp Desconectado', 'Sessão finalizada. Gerando novo QR Code...', '🟡');

        setTimeout(() => {
            console.log('🔄 [RE-INIT] Inicializando cliente WhatsApp para gerar novo QR Code...');
            isDisconnecting = false;
            cleanAuthSession();
            client.initialize().catch(e => console.error('⚠️ Erro ao reinicializar cliente após desconexão:', e.message));
        }, 1500);

        return { success: true, message: 'WhatsApp desconectado com sucesso. Novo QR Code em geração.' };
    } catch (e) {
        isDisconnecting = false;
        console.error('⚠️ Erro ao desconectar WhatsApp:', e.message);
        return { success: false, error: e.message };
    }
}

async function reconnectWhatsApp(user = 'Admin') {
    try {
        isReady = false;
        currentQrRaw = null;
        currentQrDataUrl = null;
        addAuditLog(user, 'WHATSAPP_RECONNECT', 'Reinicialização do WhatsApp solicitada pelo painel web');
        broadcastLog('system', 'Reconexão Solicitada', 'Reiniciando instância do WhatsApp Web...', '🔵');

        try {
            await withTimeout(client.destroy(), 4000);
        } catch (e) {}

        cleanAuthSession();

        setTimeout(() => {
            client.initialize().catch(e => console.error('⚠️ Erro ao reiniciar WhatsApp:', e.message));
        }, 1500);

        return { success: true, message: 'Reconexão iniciada.' };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

module.exports = {
    client,
    sendBotMessage,
    getWhatsAppStatus,
    disconnectWhatsApp,
    reconnectWhatsApp,
    syncWhatsAppContacts,
    resolveSingleLid,
    buildSystemPrompt,
    setGlobalPaused
};
