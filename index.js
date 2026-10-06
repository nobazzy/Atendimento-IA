process.on('uncaughtException', (err) => {
    console.error('⚠️ [CRASH GUARD] Exceção não capturada evitada:', err.message || err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [CRASH GUARD] Promessa rejeitada não tratada evitada:', reason);
});

const config = require('./src/config');
const { initDatabase } = require('./src/database');
const { client } = require('./src/core/whatsapp');
const { startScheduler } = require('./src/core/scheduler');
const { startServer } = require('./src/api/server');

console.log(`========================================================`);
console.log(`        PAINEL COMERCIAL WHATSAPP - CLOUD AI`);
console.log(`========================================================\n`);

// 1. Inicializar Banco de Dados SQLite
initDatabase();

// 2. Iniciar Servidor Web Express & REST API
startServer();

// 3. Iniciar Agendador de Automações & Telemetria
startScheduler();

// 4. Inicializar Cliente WhatsApp Web MD
client.initialize().catch(err => {
    if (err.message && err.message.includes('The browser is already running')) {
        console.error('\n⚠️ [WHATSAPP] A sessão já está em execução no computador.');
        console.error('👉 O bot já está ativo em segundo plano ou em outro terminal.');
    } else {
        console.error('⚠️ [WHATSAPP] Erro na inicialização:', err.message);
    }
});
