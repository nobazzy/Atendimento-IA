const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'database.sqlite');
let db;

try {
    db = new DatabaseSync(DB_PATH);
    // Configurar busy_timeout para 5000ms (esperar 5 segundos antes de falhar por bloqueio de outro processo)
    db.exec('PRAGMA busy_timeout = 5000;');
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');
} catch (err) {
    console.error('❌ ERRO CRÍTICO AO ABRIR BANCO SQLITE:', err.message);
}

// ─── UTILS DE SEGURANÇA E SANITIZAÇÃO DE DADOS ───
function sanitizeInput(val) {
    if (val === null || val === undefined) return '';
    if (typeof val !== 'string') val = String(val);
    // 1. Remover Null Bytes (\0) que tentam burlar parsers C/C++
    val = val.replace(/\0/g, '');
    // 2. Truncar textos gigantescos para impedir DoS de Memória (Limite: 10.000 chars)
    if (val.length > 10000) {
        val = val.substring(0, 10000);
    }
    return val.trim();
}

// ─── SISTEMA DE BACKUP AUTOMÁTICO DO BANCO DE DADOS ───
function backupDatabase() {
    try {
        const backupDir = path.join(__dirname, 'backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        const now = new Date();
        const dateStr = now.toISOString().replace(/:/g, '-').split('.')[0];
        const backupFile = path.join(backupDir, `database_backup_${dateStr}.sqlite`);

        fs.copyFileSync(DB_PATH, backupFile);
        console.log(`[Backup] 💾 Backup automático gerado com sucesso: ${path.basename(backupFile)}`);

        // Manter apenas os 7 backups diários mais recentes
        const files = fs.readdirSync(backupDir)
            .filter(f => f.endsWith('.sqlite'))
            .map(f => ({ name: f, path: path.join(backupDir, f), mtime: fs.statSync(path.join(backupDir, f)).mtime }))
            .sort((a, b) => b.mtime - a.mtime);

        if (files.length > 7) {
            for (let i = 7; i < files.length; i++) {
                try { fs.unlinkSync(files[i].path); } catch (e) {}
            }
        }
    } catch (e) {
        console.error('⚠️ Erro ao criar backup do SQLite:', e.message);
    }
}

// ─── INICIALIZAÇÃO E CRIAÇÃO DAS TABELAS ───
function initDatabase() {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS user_profile (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ai_identity (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                fact TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS contacts (
                jid TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                relationship TEXT DEFAULT 'Contato',
                notes TEXT DEFAULT '',
                custom_prompt TEXT DEFAULT '',
                auto_reply INTEGER DEFAULT 1,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS automations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_jid TEXT NOT NULL,
                type TEXT NOT NULL,
                time TEXT NOT NULL,
                message_template TEXT NOT NULL,
                active INTEGER DEFAULT 1,
                last_run TEXT DEFAULT '',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS chat_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id TEXT NOT NULL,
                sender TEXT NOT NULL,
                message TEXT NOT NULL,
                timestamp TEXT NOT NULL
            );
        `);

        // Garantir que a coluna last_run existe se a tabela já foi criada anteriormente
        try {
            db.exec("ALTER TABLE automations ADD COLUMN last_run TEXT DEFAULT '';");
        } catch (e) {}

        // Limpeza de entradas inválidas no banco de dados
        try {
            db.exec("DELETE FROM contacts WHERE jid = '@c.us' OR jid = '' OR jid IS NULL;");
        } catch (e) {}

        // Executar backup automático na inicialização
        backupDatabase();

    } catch (err) {
        console.error('❌ Erro na inicialização das tabelas:', err.message);
    }
}

// ─── FUNÇÕES PROTEGIDAS (PREPARED STATEMENTS + TRY/CATCH) ───

function getProfileData() {
    try {
        const stmt = db.prepare('SELECT key, value FROM user_profile');
        const rows = stmt.all();
        const profile = {};
        for (const row of rows) {
            profile[row.key] = row.value;
        }
        return profile;
    } catch (e) {
        console.error('⚠️ Erro ao ler user_profile:', e.message);
        return {};
    }
}

function setProfileValue(key, value) {
    try {
        const sKey = sanitizeInput(key).toLowerCase();
        const sVal = sanitizeInput(value);
        if (!sKey) return;

        const stmt = db.prepare(`
            INSERT INTO user_profile (key, value, updated_at) 
            VALUES (?, ?, ?) 
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `);
        stmt.run(sKey, sVal, new Date().toISOString());
    } catch (e) {
        console.error('⚠️ Erro ao salvar user_profile:', e.message);
    }
}

function getAiIdentityData() {
    try {
        const stmt = db.prepare('SELECT key, value FROM ai_identity');
        const rows = stmt.all();
        const identity = {};
        for (const row of rows) {
            identity[row.key] = row.value;
        }
        return identity;
    } catch (e) {
        console.error('⚠️ Erro ao ler ai_identity:', e.message);
        return {};
    }
}

function setAiIdentityValue(key, value) {
    try {
        const sKey = sanitizeInput(key).toLowerCase();
        const sVal = sanitizeInput(value);
        if (!sKey) return;

        const stmt = db.prepare(`
            INSERT INTO ai_identity (key, value, updated_at) 
            VALUES (?, ?, ?) 
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `);
        stmt.run(sKey, sVal, new Date().toISOString());
    } catch (e) {
        console.error('⚠️ Erro ao salvar ai_identity:', e.message);
    }
}

function getMemories() {
    try {
        const stmt = db.prepare('SELECT category, fact FROM memories ORDER BY id DESC LIMIT 30');
        return stmt.all();
    } catch (e) {
        console.error('⚠️ Erro ao ler memories:', e.message);
        return [];
    }
}

function addMemory(category, fact) {
    try {
        const sCat = sanitizeInput(category).toLowerCase() || 'geral';
        const sFact = sanitizeInput(fact);
        if (!sFact) return;

        const stmt = db.prepare('INSERT INTO memories (category, fact, created_at) VALUES (?, ?, ?)');
        stmt.run(sCat, sFact, new Date().toISOString());
    } catch (e) {
        console.error('⚠️ Erro ao salvar memory:', e.message);
    }
}

function getContact(jid) {
    try {
        const sJid = sanitizeInput(jid);
        if (!sJid || sJid === '@c.us') return null;
        const stmt = db.prepare('SELECT * FROM contacts WHERE jid = ?');
        return stmt.get(sJid);
    } catch (e) {
        console.error('⚠️ Erro ao buscar contato:', e.message);
        return null;
    }
}

function saveContact(jid, name, relationship = 'Contato', notes = '', customPrompt = '', autoReply = 1) {
    try {
        const sJid = sanitizeInput(jid);
        const sName = sanitizeInput(name);
        if (!sJid || !sName || sJid === '@c.us') return;

        const stmt = db.prepare(`
            INSERT INTO contacts (jid, name, relationship, notes, custom_prompt, auto_reply, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(jid) DO UPDATE SET
                name = excluded.name,
                relationship = excluded.relationship,
                notes = excluded.notes,
                custom_prompt = excluded.custom_prompt,
                auto_reply = excluded.auto_reply,
                updated_at = excluded.updated_at
        `);
        stmt.run(sJid, sName, sanitizeInput(relationship), sanitizeInput(notes), sanitizeInput(customPrompt), autoReply ? 1 : 0, new Date().toISOString());
    } catch (e) {
        console.error('⚠️ Erro ao salvar contato:', e.message);
    }
}

function blockContact(phoneOrJid, nameStr = '') {
    try {
        const sInput = sanitizeInput(phoneOrJid);
        if (!sInput) return;

        const cleanDigits = sInput.replace(/\D/g, '');
        let targetJid = '';

        if (cleanDigits.length >= 8) {
            targetJid = `${cleanDigits}@c.us`;
        } else {
            targetJid = sInput.includes('@') ? sInput : `${sInput}@c.us`;
        }

        if (targetJid === '@c.us') return;

        const contactName = nameStr || cleanDigits || sInput;
        const stmt = db.prepare(`
            INSERT INTO contacts (jid, name, relationship, notes, auto_reply, updated_at)
            VALUES (?, ?, 'Bloqueado', 'Bloqueado por número de celular', 0, ?)
            ON CONFLICT(jid) DO UPDATE SET auto_reply = 0, updated_at = excluded.updated_at
        `);
        stmt.run(targetJid, contactName, new Date().toISOString());
        console.log(`[SQLite] 🚫 Número de celular [${targetJid}] bloqueado com sucesso na Blacklist.`);
    } catch (e) {
        console.error('⚠️ Erro ao bloquear contato:', e.message);
    }
}

function unblockContact(phoneOrJid) {
    try {
        const sInput = sanitizeInput(phoneOrJid);
        if (!sInput) return;
        const cleanDigits = sInput.replace(/\D/g, '');

        if (cleanDigits && cleanDigits.length >= 8) {
            const last8 = cleanDigits.slice(-8);
            db.prepare('UPDATE contacts SET auto_reply = 1 WHERE jid LIKE ?').run(`%${last8}%`);
            db.prepare("DELETE FROM contacts WHERE jid LIKE ? AND (relationship = 'Bloqueado' OR notes LIKE '%Bloqueado%')").run(`%${last8}%`);
        } else {
            db.prepare('UPDATE contacts SET auto_reply = 1 WHERE jid = ? OR LOWER(name) = LOWER(?)').run(sInput, sInput);
            db.prepare("DELETE FROM contacts WHERE (jid = ? OR LOWER(name) = LOWER(?)) AND (relationship = 'Bloqueado' OR notes LIKE '%Bloqueado%')").run(sInput, sInput);
        }

        db.prepare("DELETE FROM contacts WHERE jid = '@c.us' OR jid = '' OR jid IS NULL").run();
        console.log(`[SQLite] ✅ Número [${sInput}] desbloqueado com sucesso.`);
    } catch (e) {
        console.error('⚠️ Erro ao desbloquear contato:', e.message);
    }
}

function getBlockedContacts() {
    try {
        const stmt = db.prepare("SELECT * FROM contacts WHERE auto_reply = 0 AND jid != '@c.us'");
        return stmt.all();
    } catch (e) {
        return [];
    }
}

function isContactBlocked(phoneOrJid) {
    try {
        if (!phoneOrJid) return false;
        const sVal = sanitizeInput(String(phoneOrJid));
        if (!sVal || sVal === '@c.us') return false;

        const cleanDigits = sVal.replace(/\D/g, '');

        // 1. Busca por dígitos do número do celular (últimos 8 dígitos)
        if (cleanDigits && cleanDigits.length >= 8) {
            const last8 = cleanDigits.slice(-8);
            const stmtNumber = db.prepare("SELECT auto_reply FROM contacts WHERE jid LIKE ? AND auto_reply = 0");
            if (stmtNumber.get(`%${last8}%`)) return true;
        }

        // 2. Busca por JID exato
        const stmtExact = db.prepare("SELECT auto_reply FROM contacts WHERE jid = ? AND auto_reply = 0");
        if (stmtExact.get(sVal)) return true;

        return false;
    } catch (e) {
        return false;
    }
}

function getAllContacts() {
    try {
        const stmt = db.prepare("SELECT * FROM contacts WHERE jid != '@c.us' ORDER BY name ASC");
        return stmt.all();
    } catch (e) {
        console.error('⚠️ Erro ao listar contatos:', e.message);
        return [];
    }
}

// ─── FUNÇÕES DE AUTOMAÇÕES E DISPARADOR ───
function saveAutomation(contactJid, type = 'bom_dia', time = '08:00', messageTemplate = 'Bom dia! Desejo um excelente dia para você!') {
    try {
        const sJid = sanitizeInput(contactJid);
        const sType = sanitizeInput(type);
        const sTime = sanitizeInput(time);
        const sTemplate = sanitizeInput(messageTemplate);

        const stmt = db.prepare('INSERT INTO automations (contact_jid, type, time, message_template, active, created_at) VALUES (?, ?, ?, ?, 1, ?)');
        stmt.run(sJid, sType, sTime, sTemplate, new Date().toISOString());
    } catch (e) {
        console.error('⚠️ Erro ao salvar automação:', e.message);
    }
}

function getPendingAutomations(currentTimeStr, todayDateStr) {
    try {
        const stmt = db.prepare('SELECT * FROM automations WHERE active = 1 AND time = ? AND (last_run IS NULL OR last_run != ?)');
        return stmt.all(currentTimeStr, todayDateStr);
    } catch (e) {
        console.error('⚠️ Erro ao buscar automações pendentes:', e.message);
        return [];
    }
}

function updateAutomationLastRun(id, todayDateStr) {
    try {
        const stmt = db.prepare('UPDATE automations SET last_run = ? WHERE id = ?');
        stmt.run(todayDateStr, id);
    } catch (e) {
        console.error('⚠️ Erro ao atualizar automação:', e.message);
    }
}

function getAllAutomations() {
    try {
        const stmt = db.prepare('SELECT * FROM automations ORDER BY id DESC');
        return stmt.all();
    } catch (e) {
        return [];
    }
}

function saveChatMessage(chatId, sender, message) {
    try {
        const sChatId = sanitizeInput(chatId);
        const sSender = sanitizeInput(sender);
        const sMessage = sanitizeInput(message);
        if (!sChatId || !sMessage) return;

        const stmt = db.prepare('INSERT INTO chat_history (chat_id, sender, message, timestamp) VALUES (?, ?, ?, ?)');
        stmt.run(sChatId, sSender, sMessage, new Date().toISOString());
    } catch (e) {
        console.error('⚠️ Erro ao salvar chat_history:', e.message);
    }
}

function clearChatHistory(chatId) {
    try {
        const sChatId = sanitizeInput(chatId);
        const stmt = db.prepare('DELETE FROM chat_history WHERE chat_id = ?');
        stmt.run(sChatId);
        return true;
    } catch (e) {
        console.error('⚠️ Erro ao limpar chat_history:', e.message);
        return false;
    }
}

function getRecentChatHistory(chatId, limit = 10) {
    try {
        const sChatId = sanitizeInput(chatId);
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);

        const stmt = db.prepare('SELECT sender, message FROM chat_history WHERE chat_id = ? ORDER BY id DESC LIMIT ?');
        const rows = stmt.all(sChatId, limitNum);
        return rows.reverse().map(r => ({
            role: r.sender === 'user' ? 'user' : 'assistant',
            content: r.message
        }));
    } catch (e) {
        console.error('⚠️ Erro ao ler chat_history:', e.message);
        return [];
    }
}

function getDatabaseStats() {
    try {
        const profileCount = db.prepare('SELECT COUNT(*) as count FROM user_profile').get().count;
        const memoryCount = db.prepare('SELECT COUNT(*) as count FROM memories').get().count;
        const contactCount = db.prepare("SELECT COUNT(*) as count FROM contacts WHERE jid != '@c.us'").get().count;
        const blockedCount = db.prepare("SELECT COUNT(*) as count FROM contacts WHERE auto_reply = 0 AND jid != '@c.us'").get().count;
        const chatCount = db.prepare('SELECT COUNT(*) as count FROM chat_history').get().count;
        const automationCount = db.prepare('SELECT COUNT(*) as count FROM automations').get().count;

        return { profileCount, memoryCount, contactCount, blockedCount, chatCount, automationCount };
    } catch (e) {
        return { profileCount: 0, memoryCount: 0, contactCount: 0, blockedCount: 0, chatCount: 0, automationCount: 0 };
    }
}

function getFormattedUserContext() {
    try {
        const profile = getProfileData();
        const identity = getAiIdentityData();
        const memories = getMemories();

        let context = '\n[SUA IDENTIDADE DE IA]\n';
        for (const [key, value] of Object.entries(identity)) {
            const label = key.charAt(0).toUpperCase() + key.slice(1);
            context += `- ${label}: ${value}\n`;
        }

        context += '\n[CONHECIMENTO SOBRE O ADMINISTRADOR]\n';
        for (const [key, value] of Object.entries(profile)) {
            const label = key.charAt(0).toUpperCase() + key.slice(1);
            context += `- ${label}: ${value}\n`;
        }

        if (memories.length > 0) {
            context += '\n[MEMÓRIAS E ANOTAÇÕES IMPORTANTES]\n';
            for (const m of memories) {
                context += `- [${m.category}]: ${m.fact}\n`;
            }
        }

        return context;
    } catch (e) {
        console.error('⚠️ Erro ao gerar contexto:', e.message);
        return '';
    }
}

initDatabase();

module.exports = {
    getProfileData,
    setProfileValue,
    getAiIdentityData,
    setAiIdentityValue,
    getMemories,
    addMemory,
    getContact,
    saveContact,
    blockContact,
    unblockContact,
    getBlockedContacts,
    isContactBlocked,
    getAllContacts,
    saveAutomation,
    getPendingAutomations,
    updateAutomationLastRun,
    getAllAutomations,
    saveChatMessage,
    clearChatHistory,
    getRecentChatHistory,
    getDatabaseStats,
    getFormattedUserContext,
    backupDatabase
};
