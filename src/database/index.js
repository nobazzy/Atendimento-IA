const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const config = require('../config');

let db;

try {
    db = new DatabaseSync(config.DB_PATH);
    db.exec('PRAGMA busy_timeout = 5000;');
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');
} catch (err) {
    console.error('❌ ERRO CRÍTICO AO ABRIR BANCO SQLITE:', err.message);
}

function sanitizeInput(val) {
    if (val === null || val === undefined) return '';
    if (typeof val !== 'string') val = String(val);
    val = val.replace(/\0/g, '');
    if (val.length > 10000) {
        val = val.substring(0, 10000);
    }
    return val.trim();
}

function initDatabase() {
    try {
        db.exec(`
            -- TABELA MULTI-TENANT (EMPRESAS)
            CREATE TABLE IF NOT EXISTS companies (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                segment TEXT DEFAULT 'Geral',
                onboarded INTEGER DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS user_profile (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                company_id TEXT DEFAULT 'default',
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ai_identity (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                company_id TEXT DEFAULT 'default',
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                fact TEXT NOT NULL,
                company_id TEXT DEFAULT 'default',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS contacts (
                jid TEXT PRIMARY KEY,
                phone_number TEXT DEFAULT '',
                phone_jid TEXT DEFAULT '',
                lid_jid TEXT DEFAULT '',
                name TEXT NOT NULL,
                relationship TEXT DEFAULT 'Contato',
                notes TEXT DEFAULT '',
                custom_prompt TEXT DEFAULT '',
                auto_reply INTEGER DEFAULT 1,
                tags TEXT DEFAULT 'Geral',
                favorite INTEGER DEFAULT 0,
                company_id TEXT DEFAULT 'default',
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS blacklist (
                jid TEXT PRIMARY KEY,
                name TEXT DEFAULT '',
                phone_digits TEXT DEFAULT '',
                company_id TEXT DEFAULT 'default',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS lid_mappings (
                lid TEXT PRIMARY KEY,
                phone_number TEXT DEFAULT '',
                phone_jid TEXT DEFAULT '',
                name TEXT DEFAULT '',
                company_id TEXT DEFAULT 'default',
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
                company_id TEXT DEFAULT 'default',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS chat_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id TEXT NOT NULL,
                sender TEXT NOT NULL,
                message TEXT NOT NULL,
                company_id TEXT DEFAULT 'default',
                timestamp TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS manual_override (
                chat_id TEXT PRIMARY KEY,
                paused INTEGER DEFAULT 1,
                company_id TEXT DEFAULT 'default',
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS system_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                company_id TEXT DEFAULT 'default',
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS prompt_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version INTEGER NOT NULL,
                prompt TEXT NOT NULL,
                author TEXT NOT NULL,
                notes TEXT NOT NULL,
                company_id TEXT DEFAULT 'default',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS personalities (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                prompt TEXT NOT NULL,
                active INTEGER DEFAULT 0,
                company_id TEXT DEFAULT 'default',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS faqs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                category TEXT DEFAULT 'Geral',
                active INTEGER DEFAULT 1,
                company_id TEXT DEFAULT 'default',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS training_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rule TEXT NOT NULL,
                active INTEGER DEFAULT 1,
                company_id TEXT DEFAULT 'default',
                created_at TEXT NOT NULL
            );

            -- RAG KNOWLEDGE BASE (DOCUMENTOS & URLS)
            CREATE TABLE IF NOT EXISTS knowledge_docs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                filename TEXT DEFAULT '',
                type TEXT NOT NULL, -- 'pdf', 'docx', 'xlsx', 'csv', 'txt', 'url'
                content TEXT DEFAULT '',
                file_path TEXT DEFAULT '',
                file_size INTEGER DEFAULT 0,
                chunk_count INTEGER DEFAULT 0,
                keywords TEXT DEFAULT '',
                source TEXT DEFAULT '',
                company_id TEXT DEFAULT 'default',
                active INTEGER DEFAULT 1,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS knowledge_chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                doc_id INTEGER NOT NULL,
                chunk_index INTEGER NOT NULL,
                content TEXT NOT NULL,
                metadata TEXT DEFAULT '{}',
                company_id TEXT DEFAULT 'default',
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON knowledge_chunks(doc_id);
            CREATE INDEX IF NOT EXISTS idx_chunks_company ON knowledge_chunks(company_id);

            -- MARKETPLACE DE TEMPLATES DE PROMPT POR NICHO
            CREATE TABLE IF NOT EXISTS prompt_templates (
                id TEXT PRIMARY KEY,
                niche TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                prompt TEXT NOT NULL,
                icon TEXT DEFAULT '💼',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user TEXT NOT NULL,
                action TEXT NOT NULL,
                details TEXT NOT NULL,
                status TEXT DEFAULT '🟢',
                company_id TEXT DEFAULT 'default',
                timestamp TEXT NOT NULL
            );

            -- DEDUPLICAÇÃO PERSISTENTE DE MENSAGENS (SOBREVIVE A REINICIALIZAÇÃO)
            CREATE TABLE IF NOT EXISTS processed_messages (
                msg_id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_processed_messages_created ON processed_messages(created_at);
        `);

        // Migration safety checks
        try { db.exec("ALTER TABLE contacts ADD COLUMN tags TEXT DEFAULT 'Geral';"); } catch (e) {}
        try { db.exec("ALTER TABLE contacts ADD COLUMN favorite INTEGER DEFAULT 0;"); } catch (e) {}
        try { db.exec("ALTER TABLE contacts ADD COLUMN company_id TEXT DEFAULT 'default';"); } catch (e) {}
        try { db.exec("ALTER TABLE contacts ADD COLUMN phone_number TEXT DEFAULT '';"); } catch (e) {}
        try { db.exec("ALTER TABLE contacts ADD COLUMN phone_jid TEXT DEFAULT '';"); } catch (e) {}
        try { db.exec("ALTER TABLE contacts ADD COLUMN lid_jid TEXT DEFAULT '';"); } catch (e) {}
        try { db.exec("ALTER TABLE lid_mappings ADD COLUMN phone_number TEXT DEFAULT '';"); } catch (e) {}
        try { db.exec("ALTER TABLE personalities ADD COLUMN company_id TEXT DEFAULT 'default';"); } catch (e) {}
        try { db.exec("ALTER TABLE chat_history ADD COLUMN company_id TEXT DEFAULT 'default';"); } catch (e) {}
        try { db.exec("ALTER TABLE system_config ADD COLUMN company_id TEXT DEFAULT 'default';"); } catch (e) {}
        try { db.exec("ALTER TABLE knowledge_docs ADD COLUMN filename TEXT DEFAULT '';"); } catch (e) {}
        try { db.exec("ALTER TABLE knowledge_docs ADD COLUMN file_path TEXT DEFAULT '';"); } catch (e) {}
        try { db.exec("ALTER TABLE knowledge_docs ADD COLUMN file_size INTEGER DEFAULT 0;"); } catch (e) {}
        try { db.exec("ALTER TABLE knowledge_docs ADD COLUMN chunk_count INTEGER DEFAULT 0;"); } catch (e) {}
        try { db.exec("ALTER TABLE knowledge_docs ADD COLUMN keywords TEXT DEFAULT '';"); } catch (e) {}
        try {
            db.exec(`
                CREATE TABLE IF NOT EXISTS knowledge_chunks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    doc_id INTEGER NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    metadata TEXT DEFAULT '{}',
                    company_id TEXT DEFAULT 'default',
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON knowledge_chunks(doc_id);
                CREATE INDEX IF NOT EXISTS idx_chunks_company ON knowledge_chunks(company_id);
            `);
        } catch (e) {}

        // Seed default company
        const checkCo = db.prepare("SELECT COUNT(*) as count FROM companies").get();
        if (checkCo.count === 0) {
            const nowStr = new Date().toISOString();
            db.prepare("INSERT INTO companies (id, name, segment, onboarded, created_at) VALUES (?, ?, ?, ?, ?)").run('default', 'Minha Empresa', 'Tecnologia', 1, nowStr);
        }

        // Seed System Config defaults
        const checkConfig = db.prepare("SELECT COUNT(*) as count FROM system_config").get();
        if (checkConfig.count === 0) {
            const nowStr = new Date().toISOString();
            const setCfg = db.prepare("INSERT OR IGNORE INTO system_config (key, value, company_id, updated_at) VALUES (?, ?, 'default', ?)");
            setCfg.run("active_provider", config.USE_OPENAI ? "openai" : "ollama", nowStr);
            setCfg.run("active_model", config.USE_OPENAI ? config.OPENAI_MODEL : config.OLLAMA_MODEL, nowStr);
            setCfg.run("temperature", "0.7", nowStr);
            setCfg.run("max_tokens", "2048", nowStr);
            setCfg.run("history_limit", "10", nowStr);
            setCfg.run("business_hours_enabled", "false", nowStr);
            setCfg.run("business_hours_start", "08:00", nowStr);
            setCfg.run("business_hours_end", "18:00", nowStr);
            setCfg.run("absence_message", "Olá! Nosso atendimento funciona de 08:00 às 18:00. Responderemos assim que possível!", nowStr);
            setCfg.run("active_personality", "cloud", nowStr);
        }

        // Seed Prompt Templates Marketplace
        const checkTemplates = db.prepare("SELECT COUNT(*) as count FROM prompt_templates").get();
        if (checkTemplates.count === 0) {
            const nowStr = new Date().toISOString();
            const insT = db.prepare("INSERT INTO prompt_templates (id, niche, title, description, prompt, icon, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
            
            insT.run("medico", "Saúde & Medicina", "Clínica Médica / Odontologia", "Atendimento acolhedor, triagem de sintomas e agendamento de consultas.", 
                "Você é a Assistente Virtual da Clínica Médica. Atenda os pacientes com extrema empatia, tire dúvidas sobre especialidades e ajude no agendamento. NUNCA faça diagnósticos prescritivos.", "🏥", nowStr);

            insT.run("imobiliaria", "Imobiliária & Corretagem", "Corretora de Imóveis", "Qualificação de compradores, apresentação de imóveis e agendamento de visitas.", 
                "Você é a Consultora Imobiliária Virtual. Apresente os imóveis com entusiasmo, qualifique o interesse do comprador (compra ou aluguel) e agende visitas com os corretores.", "🏠", nowStr);

            insT.run("ecommerce", "E-commerce & Vendas", "Loja Virtual / E-commerce", "Suporte a pedidos, sugestão de produtos e rastreio de entregas.", 
                "Você é o Especialista de Atendimento da Loja Virtual. Ajude os clientes a encontrar produtos ideais, tirar dúvidas sobre frete e acompanhar pedidos.", "🛍️", nowStr);

            insT.run("advocacia", "Serviços Jurídicos", "Escritório de Advocacia", "Triagem de casos jurídicos, agendamento de pareceres e atendimento formal.", 
                "Você é a Secretária Jurídica Virtual. Atenda clientes com tom formal e sigiloso, entenda o ramo do direito necessário e agende a consulta técnica com os advogados.", "⚖️", nowStr);

            insT.run("petshop", "Pet Shop & Veterinária", "Pet Shop & Clínica Vet", "Agendamento de banho/tosa, consultas veterinárias e vendas de produtos pet.", 
                "Você é a Atendente da Clínica Pet. Atenda os tutores de pets com carinho, agende serviços de banho, tosa e consultas veterinárias.", "🐾", nowStr);
        }

        // Seed default personalities if empty
        const checkPersonalities = db.prepare("SELECT COUNT(*) as count FROM personalities").get();
        if (checkPersonalities.count === 0) {
            const nowStr = new Date().toISOString();
            const insP = db.prepare("INSERT INTO personalities (id, name, description, prompt, active, company_id, created_at) VALUES (?, ?, ?, ?, ?, 'default', ?)");
            insP.run("cloud", "Cloud (Tech Lead & Assistente)", "IA de elite pragmática, inteligente e leal ao Administrador.", "Você é a CLOUD, uma Inteligência Artificial de elite desenvolvida especificamente para servir como Assistente Pessoal, Parceira Técnica e Tech Lead do Administrador. Responda com clareza, alta inteligência e foco absoluto em soluções eficientes.", 1, nowStr);
            insP.run("recepcionista", "Recepcionista Amigável", "Atendimento receptivo e cordial para novos contatos.", "Você é a Recepcionista Virtual Comercial da Empresa. Atenda todos os clientes com simpatia inigualável, cordialidade, dedicação e paciência. Esclareça dúvidas simples e anote recados detalhados para o Administrador.", 0, nowStr);
            insP.run("vendas", "Especialista em Vendas", "Focada em qualificação de leads, apresentação de soluções e conversão.", "Você é a Especialista em Vendas e Qualificação Comercial da Empresa.\n\nSEU OBJETIVO PRINCIPAL:\nAtuar como uma consultora comercial persuasiva, empática, estratégica e focada em qualificação de leads, apresentação de soluções e conversão de negócios.\n\nDIRETRIZES DE COMPORTAMENTO E TOM DE VOZ:\n1. Mantenha um tom comercial enérgico, confiante, acolhedor e altamente profissional.\n2. Use técnicas de vendas consultivas: faça perguntas estratégicas para entender a necessidade e urgência do cliente antes de oferecer soluções.\n3. Destaque o valor agregado, os diferenciais competitivos e a qualidade dos serviços da Empresa.\n4. Supere dúvidas e objeções com clareza, oferecendo informações precisas e demonstrando autoridade no assunto.\n5. Conduza ativamente o atendimento para o próximo passo (Call to Action), convidando o cliente para agendar uma conversa, apresentação ou enviar os detalhes do projeto.", 0, nowStr);
        }

    } catch (err) {
        console.error('❌ Erro na inicialização do banco SQLite:', err.message);
    }
}

function isMessageProcessed(msgId) {
    if (!msgId) return false;
    try {
        const row = db.prepare('SELECT msg_id FROM processed_messages WHERE msg_id = ?').get(String(msgId));
        return Boolean(row);
    } catch (e) {
        return false;
    }
}

function markMessageProcessed(msgId) {
    if (!msgId) return;
    try {
        db.prepare('INSERT OR IGNORE INTO processed_messages (msg_id, created_at) VALUES (?, ?)').run(String(msgId), new Date().toISOString());
    } catch (e) {}
}

function cleanupOldProcessedMessages(days = 7) {
    try {
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        db.prepare('DELETE FROM processed_messages WHERE created_at < ?').run(cutoff);
    } catch (e) {}
}

initDatabase();

module.exports = {
    db,
    sanitizeInput,
    initDatabase,
    isMessageProcessed,
    markMessageProcessed,
    cleanupOldProcessedMessages
};
