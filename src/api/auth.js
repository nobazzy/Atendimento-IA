const crypto = require('crypto');
const config = require('../config');

// Chave secreta estável para assinatura dos tokens
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    JWT_SECRET = crypto.randomBytes(32).toString('hex');
    console.warn('⚠️ [SEGURANÇA] JWT_SECRET não configurado no .env. Uma chave temporária foi gerada em runtime. Defina JWT_SECRET no .env para manter sessões ativas após reinicializações.');
}

let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const REQUIRE_AUTH = process.env.REQUIRE_AUTH === 'true' || Boolean(ADMIN_PASSWORD);
const DISABLE_KILL_SWITCH = process.env.DISABLE_KILL_SWITCH === 'true';

// Se REQUIRE_AUTH estiver ativado mas sem ADMIN_PASSWORD definida, gera senha temporária segura
if (REQUIRE_AUTH && !ADMIN_PASSWORD) {
    ADMIN_PASSWORD = crypto.randomBytes(16).toString('hex');
    console.warn('\n======================================================================');
    console.warn('🔐 [AVISO DE SEGURANÇA] REQUIRE_AUTH está ativo, mas ADMIN_PASSWORD não foi definida!');
    console.warn(`🔑 SENHA DE ADMIN TEMPORÁRIA GERADA: ${ADMIN_PASSWORD}`);
    console.warn('👉 Defina ADMIN_PASSWORD no seu arquivo .env para fixar sua senha.');
    console.warn('======================================================================\n');
}

/**
 * Gera um token assinado (HMAC-SHA256) com payload codificado em base64url.
 * Sem dependências externas, usando crypto nativo do Node.js.
 */
function generateToken(payload, expiresInSeconds = 7 * 24 * 60 * 60) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const body = { ...payload, exp };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedBody = Buffer.from(JSON.stringify(body)).toString('base64url');
    const signature = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(`${encodedHeader}.${encodedBody}`)
        .digest('base64url');

    return `${encodedHeader}.${encodedBody}.${signature}`;
}

/**
 * Valida o token e retorna o payload decodificado se válido.
 * Trata exceções e valida tamanhos de buffers antes de timingSafeEqual.
 */
function verifyToken(token) {
    if (!token || typeof token !== 'string') return null;

    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;

        const [encodedHeader, encodedBody, signature] = parts;
        const expectedSignature = crypto
            .createHmac('sha256', JWT_SECRET)
            .update(`${encodedHeader}.${encodedBody}`)
            .digest('base64url');

        const sigBuf = Buffer.from(signature, 'utf8');
        const expectedBuf = Buffer.from(expectedSignature, 'utf8');

        // crypto.timingSafeEqual() exige buffers de mesmo tamanho.
        // Se os comprimentos diferirem, a assinatura é inválida.
        if (sigBuf.length !== expectedBuf.length) {
            return null;
        }

        // Validação em tempo constante contra timing attacks
        if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) {
            return null;
        }

        const payload = JSON.parse(Buffer.from(encodedBody, 'base64url').toString('utf8'));
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            return null; // Token expirado
        }
        return payload;
    } catch (e) {
        // Captura tokens malformados, JSON inválido ou buffers corrompidos
        return null;
    }
}

/**
 * Middleware Express para proteger rotas da API.
 */
function requireAuth(req, res, next) {
    // Se a autenticação estiver explicitamente desligada e não houver senha definida, libera
    if (!REQUIRE_AUTH) {
        req.user = { role: 'admin', companyId: 'default' };
        req.companyId = 'default';
        return next();
    }

    // Permitir autenticação via:
    // 1. Header 'Authorization: Bearer <token>'
    // 2. Header 'x-api-key: <ADMIN_PASSWORD>'
    // 3. Query param '?token=<token>' (para streams SSE como /api/logs/stream)
    const authHeader = req.headers['authorization'];
    const apiKey = req.headers['x-api-key'];
    const queryToken = req.query.token;

    let token = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
    } else if (queryToken) {
        token = String(queryToken).trim();
    }

    // 1. Validação por API Key direta
    if (apiKey && ADMIN_PASSWORD && apiKey === ADMIN_PASSWORD) {
        req.user = { role: 'admin', companyId: 'default' };
        req.companyId = 'default';
        return next();
    }

    // 2. Validação por Token JWT
    if (token) {
        const decoded = verifyToken(token);
        if (decoded) {
            req.user = decoded;
            req.companyId = decoded.companyId || 'default';
            return next();
        }
    }

    return res.status(401).json({
        success: false,
        error: 'Acesso não autorizado. Autenticação obrigatória.',
        authRequired: true
    });
}

module.exports = {
    generateToken,
    verifyToken,
    requireAuth,
    REQUIRE_AUTH,
    ADMIN_PASSWORD,
    DISABLE_KILL_SWITCH
};
