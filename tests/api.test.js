process.env.REQUIRE_AUTH = 'true';
process.env.ADMIN_PASSWORD = 'senha_teste_segura_123';
process.env.JWT_SECRET = 'segredo_estavel_para_testes_123456789';

const http = require('http');
const assert = require('assert');
const { createServer } = require('../src/api/server');

const app = createServer();
const server = http.createServer(app);

const PORT = 3097;

server.listen(PORT, async () => {
    try {
        console.log(`🧪 [TESTES DE INTEGRAÇÃO DA API EXPRESS (PORTA ${PORT})`);

        // 1. Testar bloqueio de rota protegida sem token
        const resUnauth = await fetch(`http://localhost:${PORT}/api/settings`);
        assert.strictEqual(resUnauth.status, 401);
        console.log('  ✅ 1. Bloqueio automático de rotas protegidas sem autenticação OK');

        // 2. Testar spoofing de empresa inexistente com senha válida -> deve validar no banco e retornar 404
        const resFakeCompany = await fetch(`http://localhost:${PORT}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'senha_teste_segura_123', companyId: 'empresa_fantasma_xyz' })
        });
        const dataFakeCompany = await resFakeCompany.json();
        assert.strictEqual(resFakeCompany.status, 404);
        assert.strictEqual(dataFakeCompany.success, false);
        console.log('  ✅ 2. Tentativa de spoofing com tenant inexistente bloqueada com 404 OK');

        // 3. Testar login para empresa válida 'default' com senha correta
        const resValidLogin = await fetch(`http://localhost:${PORT}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'senha_teste_segura_123', companyId: 'default' })
        });
        const dataValidLogin = await resValidLogin.json();
        assert.strictEqual(resValidLogin.status, 200);
        assert.strictEqual(dataValidLogin.success, true);
        assert(dataValidLogin.token, 'Token deve ser retornado');
        assert.strictEqual(dataValidLogin.companyId, 'default');
        console.log('  ✅ 3. Login com tenant validado emitindo Bearer Token OK');

        // 4. Testar acesso à rota protegida utilizando o Bearer Token
        const resProtected = await fetch(`http://localhost:${PORT}/api/settings`, {
            headers: { 'Authorization': `Bearer ${dataValidLogin.token}` }
        });
        assert.strictEqual(resProtected.status, 200);
        console.log('  ✅ 4. Acesso liberado para rotas protegidas com Bearer Token OK');

        // 5. Testar rejeição imediata com token adulterado/forjado
        const resBadToken = await fetch(`http://localhost:${PORT}/api/settings`, {
            headers: { 'Authorization': `Bearer ${dataValidLogin.token}tampered` }
        });
        assert.strictEqual(resBadToken.status, 401);
        console.log('  ✅ 5. Token forjado/adulterado rejeitado com 401 OK');

        server.close(() => {
            console.log('🎉 Todos os testes de integração da API passaram com sucesso!\n');
            process.exit(0);
        });
    } catch (err) {
        console.error('❌ Falha nos testes de integração:', err);
        server.close(() => process.exit(1));
    }
});
