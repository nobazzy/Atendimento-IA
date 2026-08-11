const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const srcDir = 'C:\\Users\\vasco\\.gemini\\antigravity\\scratch\\atendimento-ia';
const destDir = 'C:\\Users\\vasco\\.gemini\\antigravity\\scratch\\ia_atendimento_versao_para_git';

console.log('🚀 Criando diretório de destino...');
if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
}

const ignoreList = [
    '.wwebjs_auth',
    '.wwebjs_cache',
    'node_modules',
    'backups',
    'database.sqlite',
    'database.sqlite-wal',
    'database.sqlite-shm',
    '.env',
    'self_jids.json'
];

function copyRecursiveSync(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();
    const basename = path.basename(src);

    if (ignoreList.includes(basename)) return;

    if (isDirectory) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        fs.readdirSync(src).forEach((childItemName) => {
            copyRecursiveSync(
                path.join(src, childItemName),
                path.join(dest, childItemName)
            );
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

console.log('📋 Copiando arquivos do projeto...');
copyRecursiveSync(srcDir, destDir);

// 1. Criar .env limpo
console.log('🔑 Criando arquivo .env limpo e descaracterizado...');
const cleanEnvContent = `PORT=3000
MY_NUMBER=

ACTIVE_PROVIDER=openai

USE_OPENAI=true
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash

ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-3-5-sonnet-latest

GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile

DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat

OLLAMA_URL=http://localhost:11434/api/chat
OLLAMA_MODEL=qwen2.5:14b

LMSTUDIO_URL=http://localhost:1234/v1/chat/completions
LMSTUDIO_MODEL=local-model

CUSTOM_API_URL=
CUSTOM_API_KEY=
CUSTOM_MODEL=
`;
fs.writeFileSync(path.join(destDir, '.env'), cleanEnvContent, 'utf-8');

// 2. Criar self_jids.json vazio
fs.writeFileSync(path.join(destDir, 'self_jids.json'), '[]', 'utf-8');

// 3. Inicializar e Sanitizar Banco SQLite Novo
console.log('🗄️ Inicializando banco SQLite virgem no projeto Git...');
const targetDbPath = path.join(destDir, 'database.sqlite');
if (fs.existsSync(targetDbPath)) fs.unlinkSync(targetDbPath);

// Importar e rodar inicializador de schema no banco de destino
const db = new DatabaseSync(targetDbPath);
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
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
    CREATE TABLE IF NOT EXISTS knowledge_docs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        source TEXT DEFAULT '',
        company_id TEXT DEFAULT 'default',
        active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
    );
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
`);

const nowStr = new Date().toISOString();
db.prepare("INSERT INTO companies (id, name, segment, onboarded, created_at) VALUES (?, ?, ?, ?, ?)").run('default', 'Minha Empresa', 'Tecnologia', 1, nowStr);

const setCfg = db.prepare("INSERT OR IGNORE INTO system_config (key, value, company_id, updated_at) VALUES (?, ?, 'default', ?)");
setCfg.run("active_provider", "openai", nowStr);
setCfg.run("active_model", "gpt-4o-mini", nowStr);
setCfg.run("temperature", "0.7", nowStr);
setCfg.run("history_limit", "10", nowStr);
setCfg.run("business_hours_enabled", "false", nowStr);
setCfg.run("business_hours_start", "08:00", nowStr);
setCfg.run("business_hours_end", "18:00", nowStr);
setCfg.run("absence_message", "Olá! Nosso atendimento funciona de 08:00 às 18:00. Responderemos assim que possível!", nowStr);
setCfg.run("active_personality", "cloud", nowStr);

const insP = db.prepare("INSERT INTO personalities (id, name, description, prompt, active, company_id, created_at) VALUES (?, ?, ?, ?, ?, 'default', ?)");
insP.run("cloud", "Cloud (Tech Lead & Assistente)", "IA de elite pragmática, inteligente e leal ao Administrador.", "Você é a CLOUD, uma Inteligência Artificial de elite desenvolvida especificamente para servir como Assistente Pessoal, Parceira Técnica e Tech Lead do Administrador. Responda com clareza, alta inteligência e foco absoluto em soluções eficientes.", 1, nowStr);
insP.run("recepcionista", "Recepcionista Amigável", "Atendimento receptivo e cordial para novos contatos.", "Você é a Recepcionista Virtual Comercial da Empresa. Atenda todos os clientes com simpatia inigualável, cordialidade, dedicação e paciência. Esclareça dúvidas simples e anote recados detalhados para o Administrador.", 0, nowStr);
insP.run("vendas", "Especialista em Vendas", "Focada em qualificação de leads, apresentação de soluções e conversão.", "Você é a Especialista em Vendas e Qualificação Comercial da Empresa.\n\nSEU OBJETIVO PRINCIPAL:\nAtuar como uma consultora comercial persuasiva, empática, estratégica e focada em qualificação de leads, apresentação de soluções e conversão de negócios.\n\nDIRETRIZES DE COMPORTAMENTO E TOM DE VOZ:\n1. Mantenha um tom comercial enérgico, confiante, acolhedor e altamente profissional.\n2. Use técnicas de vendas consultivas: faça perguntas estratégicas para entender a necessidade e urgência do cliente antes de oferecer soluções.\n3. Destaque o valor agregado, os diferenciais competitivos e a qualidade dos serviços da Empresa.\n4. Supere dúvidas e objeções com clareza, oferecendo informações precisas e demonstrando autoridade no assunto.\n5. Conduza ativamente o atendimento para o próximo passo (Call to Action), convidando o cliente para agendar uma conversa, apresentação ou enviar os detalhes do projeto.", 0, nowStr);

db.close();

console.log('✅ PROJETO DE RELEASE PARA GIT CRIADO COM SUCESSO EM:');
console.log(destDir);
