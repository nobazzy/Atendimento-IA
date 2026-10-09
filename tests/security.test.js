const assert = require('assert');
const path = require('path');
const { generateToken, verifyToken } = require('../src/api/auth');

console.log('🧪 [TESTES UNITÁRIOS DE SEGURANÇA & CRIPTOGRAFIA]');

// 1. Teste de geração e validação de token válido
const token = generateToken({ role: 'admin', companyId: 'default' });
assert(token, 'Token deve ser gerado');
const decoded = verifyToken(token);
assert(decoded !== null, 'Decoded não pode ser nulo');
assert.strictEqual(decoded.companyId, 'default');
assert.strictEqual(decoded.role, 'admin');
console.log('  ✅ 1. Geração e decodificação de token válido OK');

// 2. Teste de assinatura com tamanho diferente (proteção contra quebra em crypto.timingSafeEqual)
const corruptedSigDiffLength = token + 'EXTRA_BYTES';
assert.strictEqual(verifyToken(corruptedSigDiffLength), null);
console.log('  ✅ 2. Assinatura com tamanho de buffer diferente tratada sem exceção OK');

// 3. Teste de assinatura com mesmo tamanho mas bytes forjados
const parts = token.split('.');
const tamperedSig = parts[2].substring(0, parts[2].length - 2) + 'XX';
const tamperedToken = parts[0] + '.' + parts[1] + '.' + tamperedSig;
assert.strictEqual(verifyToken(tamperedToken), null);
console.log('  ✅ 3. Assinatura forjada rejeitada via timingSafeEqual OK');

// 4. Testes com entradas inválidas, nulas e strings corrompidas
assert.strictEqual(verifyToken(null), null);
assert.strictEqual(verifyToken(''), null);
assert.strictEqual(verifyToken('invalid.token'), null);
assert.strictEqual(verifyToken('a.b.c.d'), null);
assert.strictEqual(verifyToken('not-a-token'), null);
console.log('  ✅ 4. Tokens malformados e inválidos tratados com segurança OK');

console.log('🎉 Todos os testes de segurança e criptografia passaram com sucesso!\n');
