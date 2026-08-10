const { db, sanitizeInput } = require('../database');
const { addAuditLog } = require('./audit');

function getFaqs() {
    try {
        const stmt = db.prepare('SELECT * FROM faqs ORDER BY id DESC');
        return stmt.all();
    } catch (e) {
        console.error('⚠️ Erro ao buscar faqs:', e.message);
        return [];
    }
}

function addFaq(question, answer, category = 'Geral', user = 'Alex') {
    try {
        const sQ = sanitizeInput(question);
        const sA = sanitizeInput(answer);
        const sCat = sanitizeInput(category) || 'Geral';
        if (!sQ || !sA) return null;

        const timestamp = new Date().toISOString();
        const stmt = db.prepare('INSERT INTO faqs (question, answer, category, active, created_at) VALUES (?, ?, ?, 1, ?)');
        const res = stmt.run(sQ, sA, sCat, timestamp);

        addAuditLog(user, 'Adicionou FAQ', `Pergunta: ${sQ}`, '🟢');
        return { id: res.lastInsertRowid, question: sQ, answer: sA, category: sCat, active: 1, created_at: timestamp };
    } catch (e) {
        console.error('⚠️ Erro ao adicionar faq:', e.message);
        return null;
    }
}

function updateFaq(id, question, answer, category = 'Geral', user = 'Alex') {
    try {
        const sQ = sanitizeInput(question);
        const sA = sanitizeInput(answer);
        const sCat = sanitizeInput(category) || 'Geral';
        if (!sQ || !sA) return false;

        db.prepare('UPDATE faqs SET question = ?, answer = ?, category = ? WHERE id = ?').run(sQ, sA, sCat, id);
        addAuditLog(user, 'Atualizou FAQ', `ID ${id}: ${sQ}`, '🟢');
        return true;
    } catch (e) {
        return false;
    }
}

function deleteFaq(id, user = 'Alex') {
    try {
        db.prepare('DELETE FROM faqs WHERE id = ?').run(id);
        addAuditLog(user, 'Removeu FAQ', `ID: ${id}`, '🔴');
        return true;
    } catch (e) {
        return false;
    }
}

function getTrainingRules() {
    try {
        const stmt = db.prepare('SELECT * FROM training_rules ORDER BY id DESC');
        return stmt.all();
    } catch (e) {
        console.error('⚠️ Erro ao buscar training_rules:', e.message);
        return [];
    }
}

function addTrainingRule(ruleText, user = 'Alex') {
    try {
        const sRule = sanitizeInput(ruleText);
        if (!sRule) return null;

        const timestamp = new Date().toISOString();
        const stmt = db.prepare('INSERT INTO training_rules (rule, active, created_at) VALUES (?, 1, ?)');
        const res = stmt.run(sRule, timestamp);

        addAuditLog(user, 'Adicionou Regra de Treinamento', `Regra: ${sRule}`, '🟢');
        return { id: res.lastInsertRowid, rule: sRule, active: 1, created_at: timestamp };
    } catch (e) {
        console.error('⚠️ Erro ao adicionar training_rule:', e.message);
        return null;
    }
}

function updateTrainingRule(id, ruleText, user = 'Alex') {
    try {
        const sRule = sanitizeInput(ruleText);
        if (!sRule) return false;

        db.prepare('UPDATE training_rules SET rule = ? WHERE id = ?').run(sRule, id);
        addAuditLog(user, 'Atualizou Regra de Negócio', `ID ${id}: ${sRule}`, '🟢');
        return true;
    } catch (e) {
        return false;
    }
}

function deleteTrainingRule(id, user = 'Alex') {
    try {
        db.prepare('DELETE FROM training_rules WHERE id = ?').run(id);
        addAuditLog(user, 'Removeu Regra de Treinamento', `ID: ${id}`, '🔴');
        return true;
    } catch (e) {
        return false;
    }
}

// ─── BASE DE CONHECIMENTO RAG (DOCUMENTOS & URLS) ───
function getKnowledgeDocs() {
    try {
        const stmt = db.prepare('SELECT id, title, type, source, active, created_at FROM knowledge_docs ORDER BY id DESC');
        return stmt.all();
    } catch (e) {
        console.error('⚠️ Erro ao buscar knowledge_docs:', e.message);
        return [];
    }
}

function addKnowledgeDoc(title, type, content, source = '', user = 'Alex') {
    try {
        const sTitle = sanitizeInput(title);
        const sType = sanitizeInput(type).toLowerCase() || 'txt';
        const sContent = sanitizeInput(content);
        const sSource = sanitizeInput(source);
        if (!sTitle || !sContent) return null;

        const timestamp = new Date().toISOString();
        const stmt = db.prepare('INSERT INTO knowledge_docs (title, type, content, source, active, created_at) VALUES (?, ?, ?, ?, 1, ?)');
        const res = stmt.run(sTitle, sType, sContent, sSource, timestamp);

        addAuditLog(user, 'Indexou Documento RAG na Base de Conhecimento', `[${sType.toUpperCase()}] ${sTitle}`, '🟢');
        return { id: res.lastInsertRowid, title: sTitle, type: sType, source: sSource, active: 1, created_at: timestamp };
    } catch (e) {
        console.error('⚠️ Erro ao indexar documento RAG:', e.message);
        return null;
    }
}

function deleteKnowledgeDoc(id, user = 'Alex') {
    try {
        db.prepare('DELETE FROM knowledge_docs WHERE id = ?').run(id);
        addAuditLog(user, 'Removeu Documento RAG', `ID: ${id}`, '🔴');
        return true;
    } catch (e) {
        return false;
    }
}

function getFormattedTrainingContext() {
    try {
        const faqs = db.prepare('SELECT question, answer FROM faqs WHERE active = 1').all();
        const rules = db.prepare('SELECT rule FROM training_rules WHERE active = 1').all();
        const docs = db.prepare('SELECT title, content FROM knowledge_docs WHERE active = 1 LIMIT 5').all();

        let context = '';

        if (rules.length > 0) {
            context += '\n[REGRAS RÍGIDAS DE ATENDIMENTO E NEGÓCIO]\n';
            rules.forEach(r => {
                context += `⚠️ REGRA: ${r.rule}\n`;
            });
        }

        if (faqs.length > 0) {
            context += '\n[BASE DE CONHECIMENTO & PERGUNTAS FREQUENTES (FAQ)]\n';
            faqs.forEach(f => {
                context += `• PERGUNTA: ${f.question}\n  RESPOSTA OFICIAL: ${f.answer}\n`;
            });
        }

        if (docs.length > 0) {
            context += '\n[DOCUMENTOS E MANUAIS RAG INDEXADOS]\n';
            docs.forEach(d => {
                context += `📄 DOCUMENTO (${d.title}): ${d.content.substring(0, 1500)}\n`;
            });
        }

        return context;
    } catch (e) {
        console.error('⚠️ Erro ao gerar treinamento:', e.message);
        return '';
    }
}

module.exports = {
    getFaqs,
    addFaq,
    updateFaq,
    deleteFaq,
    getTrainingRules,
    addTrainingRule,
    updateTrainingRule,
    deleteTrainingRule,
    getKnowledgeDocs,
    addKnowledgeDoc,
    deleteKnowledgeDoc,
    getFormattedTrainingContext
};
