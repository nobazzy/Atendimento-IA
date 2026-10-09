const fs = require('fs');
const path = require('path');
const multer = require('multer');
const xlsx = require('xlsx');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { db, sanitizeInput } = require('../database');
const { addAuditLog } = require('./audit');

// Diretório de armazenamento para uploads RAG
const UPLOADS_DIR = path.join(__dirname, '../../uploads/rag');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configuração do Multer para upload em disco
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();
        const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
        cb(null, `${base}-${uniqueSuffix}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedExts = ['.xlsx', '.xls', '.csv', '.pdf', '.docx', '.txt', '.md'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error(`Formato de arquivo não suportado: ${ext}. Use: .xlsx, .csv, .pdf, .docx, .txt`));
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 25 * 1024 * 1024 } // 25 MB
});

// Lista de Stopwords em Português para limpeza e scoring de busca
const PT_STOPWORDS = new Set([
    'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das',
    'em', 'no', 'na', 'nos', 'nas', 'por', 'pelo', 'pela', 'pelos', 'pelas', 'para',
    'com', 'como', 'que', 'se', 'ou', 'e', 'mas', 'ao', 'aos', 'meu', 'minha', 'seu',
    'sua', 'voce', 'voces', 'tem', 'qual', 'quanto', 'quantos', 'quantas', 'custa',
    'valor', 'preco', 'onde', 'quando', 'favor', 'ola', 'bom', 'dia', 'boa', 'tarde',
    'noite', 'oi', 'opa', 'eh', 'e', 'sao', 'ser', 'esta', 'estao', 'fazer', 'ter'
]);

function normalizeString(str) {
    if (!str) return '';
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function extractKeywords(text) {
    const normalized = normalizeString(text);
    return normalized
        .split(/[^a-z0-9_]+/)
        .map(t => t.trim())
        .filter(t => t.length >= 2 && !PT_STOPWORDS.has(t));
}

// ─── PROCESSAMENTO DE PLANILHAS (XLSX, XLS, CSV) ───
function processSpreadsheet(filePath, originalName) {
    try {
        const workbook = xlsx.readFile(filePath, { cellDates: true });
        const chunks = [];

        workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const rows = xlsx.utils.sheet_to_json(worksheet, { defval: '' });

            rows.forEach((row, idx) => {
                const entries = Object.entries(row).filter(([k, v]) => String(v).trim() !== '');
                if (entries.length === 0) return;

                const fieldsText = entries.map(([k, v]) => {
                    let valStr = v;
                    if (v instanceof Date) {
                        valStr = v.toLocaleDateString('pt-BR');
                    }
                    return `${k}: ${valStr}`;
                }).join(' | ');

                const chunkContent = `[PLANILHA: ${originalName} | ABA: ${sheetName} | REGISTRO #${idx + 1}]\n${fieldsText}`;
                chunks.push({
                    content: chunkContent,
                    metadata: JSON.stringify({ sheet: sheetName, row: idx + 1, type: 'spreadsheet' })
                });
            });
        });

        return chunks;
    } catch (e) {
        console.error('⚠️ Erro ao processar planilha:', e.message);
        throw e;
    }
}

// ─── PROCESSAMENTO DE DOCUMENTOS (PDF, DOCX, TXT) ───
async function processDocument(filePath, originalName, ext) {
    try {
        let rawText = '';

        if (ext === '.pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            const pdfData = await pdfParse(dataBuffer);
            rawText = pdfData.text || '';
        } else if (ext === '.docx') {
            const result = await mammoth.extractRawText({ path: filePath });
            rawText = result.value || '';
        } else {
            // .txt, .md
            rawText = fs.readFileSync(filePath, 'utf8');
        }

        // Limpeza básica
        rawText = rawText.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

        if (!rawText) return [];

        // Chunking inteligente com sobreposição (overlapping window de 700 chars com 100 de overlap)
        const chunkSize = 700;
        const overlap = 100;
        const chunks = [];
        let start = 0;
        let index = 1;

        while (start < rawText.length) {
            let end = start + chunkSize;
            if (end < rawText.length) {
                // Tenta quebrar em quebra de linha ou fim de frase
                const nextBreak = rawText.indexOf('\n', end);
                const nextPeriod = rawText.indexOf('. ', end);
                if (nextBreak !== -1 && nextBreak - end < 120) {
                    end = nextBreak;
                } else if (nextPeriod !== -1 && nextPeriod - end < 120) {
                    end = nextPeriod + 1;
                }
            } else {
                end = rawText.length;
            }

            const segment = rawText.substring(start, end).trim();
            if (segment.length > 20) {
                chunks.push({
                    content: `[DOCUMENTO: ${originalName} | PARTE #${index}]\n${segment}`,
                    metadata: JSON.stringify({ part: index, type: 'document' })
                });
                index++;
            }

            if (end >= rawText.length) break;
            start = end - overlap;
        }

        return chunks;
    } catch (e) {
        console.error('⚠️ Erro ao processar documento:', e.message);
        throw e;
    }
}

// ─── INDEXAÇÃO DE ARQUIVO ───
async function indexUploadedFile(file, user = 'Admin', companyId = 'default', keywords = '') {
    try {
        const ext = path.extname(file.originalname).toLowerCase();
        let chunks = [];
        let docType = 'txt';

        if (['.xlsx', '.xls', '.csv'].includes(ext)) {
            docType = ext.replace('.', '');
            chunks = processSpreadsheet(file.path, file.originalname);
        } else if (ext === '.pdf') {
            docType = 'pdf';
            chunks = await processDocument(file.path, file.originalname, ext);
        } else if (ext === '.docx') {
            docType = 'docx';
            chunks = await processDocument(file.path, file.originalname, ext);
        } else {
            docType = 'txt';
            chunks = await processDocument(file.path, file.originalname, ext);
        }

        if (chunks.length === 0) {
            throw new Error('Nenhum texto ou registro válido pôde ser extraído do arquivo.');
        }

        const nowStr = new Date().toISOString();
        const title = sanitizeInput(file.originalname);
        const filename = sanitizeInput(file.filename);
        const filePath = sanitizeInput(file.path);
        const fileSize = file.size || 0;
        const chunkCount = chunks.length;
        const sKeywords = sanitizeInput(keywords || '');

        // Salvar metadados em knowledge_docs
        const summaryContent = chunks[0] ? chunks[0].content : '';
        const insDoc = db.prepare(`
            INSERT INTO knowledge_docs (title, filename, type, content, file_path, file_size, chunk_count, keywords, source, company_id, active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'upload', ?, 1, ?)
        `);
        const docRes = insDoc.run(title, filename, docType, summaryContent, filePath, fileSize, chunkCount, sKeywords, companyId, nowStr);
        const docId = docRes.lastInsertRowid;

        // Salvar fragmentos em knowledge_chunks
        const insChunk = db.prepare(`
            INSERT INTO knowledge_chunks (doc_id, chunk_index, content, metadata, company_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (let i = 0; i < chunks.length; i++) {
            insChunk.run(docId, i + 1, chunks[i].content, chunks[i].metadata, companyId, nowStr);
        }

        addAuditLog(user, 'Indexou Arquivo RAG', `[${docType.toUpperCase()}] ${title} (${chunkCount} fragmentos)`, '🟢');

        return {
            id: docId,
            title,
            filename,
            type: docType,
            file_size: fileSize,
            chunk_count: chunkCount,
            keywords: sKeywords,
            created_at: nowStr
        };
    } catch (e) {
        console.error('⚠️ Erro ao indexar arquivo RAG:', e.message);
        throw e;
    }
}

// ─── INDEXAÇÃO MANUAL DE TEXTO / URL ───
function indexManualText(title, content, type = 'txt', source = '', user = 'Admin', companyId = 'default', keywords = '') {
    try {
        const sTitle = sanitizeInput(title);
        const sContent = sanitizeInput(content);
        const sType = sanitizeInput(type).toLowerCase() || 'txt';
        const sSource = sanitizeInput(source);
        const sKeywords = sanitizeInput(keywords || '');

        if (!sTitle || !sContent) throw new Error('Título e conteúdo são obrigatórios.');

        const nowStr = new Date().toISOString();
        const chunkSize = 700;
        const overlap = 100;
        const chunks = [];
        let start = 0;
        let index = 1;

        while (start < sContent.length) {
            let end = Math.min(start + chunkSize, sContent.length);
            const segment = sContent.substring(start, end).trim();
            if (segment.length > 10) {
                chunks.push({
                    content: `[FONTE MANUAL: ${sTitle} | PARTE #${index}]\n${segment}`,
                    metadata: JSON.stringify({ part: index, source: sSource })
                });
                index++;
            }
            if (end >= sContent.length) break;
            start = end - overlap;
        }

        const insDoc = db.prepare(`
            INSERT INTO knowledge_docs (title, filename, type, content, file_path, file_size, chunk_count, keywords, source, company_id, active, created_at)
            VALUES (?, '', ?, ?, '', ?, ?, ?, ?, ?, 1, ?)
        `);
        const docRes = insDoc.run(sTitle, sType, sContent, sContent.length, chunks.length, sKeywords, sSource || 'manual', companyId, nowStr);
        const docId = docRes.lastInsertRowid;

        const insChunk = db.prepare(`
            INSERT INTO knowledge_chunks (doc_id, chunk_index, content, metadata, company_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (let i = 0; i < chunks.length; i++) {
            insChunk.run(docId, i + 1, chunks[i].content, chunks[i].metadata, companyId, nowStr);
        }

        addAuditLog(user, 'Indexou Texto RAG Manual', `[${sType.toUpperCase()}] ${sTitle}`, '🟢');

        return {
            id: docId,
            title: sTitle,
            type: sType,
            chunk_count: chunks.length,
            keywords: sKeywords,
            created_at: nowStr
        };
    } catch (e) {
        console.error('⚠️ Erro ao indexar texto manual RAG:', e.message);
        throw e;
    }
}

// ─── ATUALIZAÇÃO DE PALAVRAS-GATILHO DE UM DOCUMENTO ───
function updateDocKeywords(docId, keywords, user = 'Admin', companyId = 'default') {
    try {
        const sKeywords = sanitizeInput(keywords || '');
        const doc = db.prepare('SELECT id, company_id FROM knowledge_docs WHERE id = ?').get(docId);
        if (!doc) return false;
        if (companyId && doc.company_id !== companyId) {
            console.warn(`⛔ [RAG SECURITY] Tenant ${companyId} tentou editar doc #${docId} da empresa ${doc.company_id}`);
            return false;
        }

        const stmt = db.prepare('UPDATE knowledge_docs SET keywords = ? WHERE id = ?');
        const res = stmt.run(sKeywords, docId);
        if (res.changes > 0) {
            addAuditLog(user, 'Atualizou Gatilhos RAG', `Doc #${docId}: ${sKeywords || '(limpos)'}`, '🔵', companyId);
            return true;
        }
        return false;
    } catch (e) {
        console.error('⚠️ Erro ao atualizar keywords do doc RAG:', e.message);
        return false;
    }
}

// ─── LISTAGEM DE DOCUMENTOS ISOLADA POR EMPRESA ───
function getKnowledgeDocs(companyId = 'default') {
    try {
        const stmt = db.prepare(`
            SELECT id, title, filename, type, file_size, chunk_count, keywords, source, active, created_at
            FROM knowledge_docs
            WHERE company_id = ?
            ORDER BY id DESC
        `);
        return stmt.all(companyId);
    } catch (e) {
        console.error('⚠️ Erro ao buscar knowledge_docs:', e.message);
        return [];
    }
}

// ─── PRÉ-VISUALIZAÇÃO DE DOCUMENTO COM VALIDAÇÃO DE POSSE ───
function getDocPreview(docId, companyId = 'default', limit = 8) {
    try {
        const doc = db.prepare('SELECT id, title, type, chunk_count, keywords, company_id FROM knowledge_docs WHERE id = ?').get(docId);
        if (!doc) return null;
        if (companyId && doc.company_id !== companyId) {
            console.warn(`⛔ [RAG SECURITY] Tenant ${companyId} tentou visualizar doc #${docId} da empresa ${doc.company_id}`);
            return null;
        }

        const chunks = db.prepare('SELECT chunk_index, content, metadata FROM knowledge_chunks WHERE doc_id = ? ORDER BY chunk_index ASC LIMIT ?').all(docId, limit);
        return { doc, chunks };
    } catch (e) {
        console.error('⚠️ Erro ao buscar preview do documento:', e.message);
        return null;
    }
}

// ─── EXCLUSÃO SEGURA DE DOCUMENTO & CHUNKS POR EMPRESA ───
function deleteKnowledgeDoc(id, user = 'Admin', companyId = 'default') {
    try {
        const doc = db.prepare('SELECT id, title, file_path, company_id FROM knowledge_docs WHERE id = ?').get(id);
        if (!doc) return false;

        if (companyId && doc.company_id !== companyId) {
            console.warn(`⛔ [RAG SECURITY] Tenant ${companyId} tentou excluir doc #${id} pertencente à empresa ${doc.company_id}`);
            return false;
        }

        // Remove arquivo físico se existir
        if (doc.file_path && fs.existsSync(doc.file_path)) {
            try { fs.unlinkSync(doc.file_path); } catch (err) {}
        }

        // Remove fragmentos e documento
        db.prepare('DELETE FROM knowledge_chunks WHERE doc_id = ?').run(id);
        db.prepare('DELETE FROM knowledge_docs WHERE id = ?').run(id);

        addAuditLog(user, 'Removeu Documento RAG', `Título: ${doc.title} (ID: ${id}) [Empresa: ${doc.company_id}]`, '🔴', companyId);
        return true;
    } catch (e) {
        console.error('⚠️ Erro ao excluir documento RAG:', e.message);
        return false;
    }
}

// ─── RECUPERADOR DE RELEVÂNCIA RAG (ESTRITAMENTE ISOLADO POR TENANT) ───
function retrieveRelevantChunks(query, companyId = 'default', limit = 4) {
    try {
        if (!query || typeof query !== 'string' || query.trim().length < 3) {
            return [];
        }

        const keywords = extractKeywords(query);
        if (keywords.length === 0) return [];

        // Busca fragmentos estritamente isolados da empresa requisitante
        const chunks = db.prepare(`
            SELECT c.id, c.doc_id, c.chunk_index, c.content, d.title, d.type, d.keywords
            FROM knowledge_chunks c
            INNER JOIN knowledge_docs d ON d.id = c.doc_id
            WHERE d.active = 1 AND c.company_id = ?
        `).all(companyId);

        if (chunks.length === 0) return [];

        const scored = [];

        chunks.forEach(chunk => {
            const normContent = normalizeString(chunk.content);
            let score = 0;
            let matchedKeywords = 0;

            keywords.forEach(kw => {
                // Frequência do termo
                const regex = new RegExp(`\\b${kw}`, 'g');
                const matches = normContent.match(regex);
                if (matches) {
                    score += matches.length * 1.5;
                    matchedKeywords++;
                } else if (normContent.includes(kw)) {
                    score += 0.8;
                    matchedKeywords++;
                }
            });

            // Bônus se mais de metade das palavras-chave estiverem presentes no mesmo fragmento
            if (matchedKeywords > 1) {
                score += matchedKeywords * 2.0;
            }

            // Bônus para planilhas que casam termos exatos
            if (chunk.type === 'xlsx' || chunk.type === 'csv') {
                score *= 1.25;
            }

            // Bônus de Palavras-Gatilho / Tags de Ativação do Documento
            if (chunk.keywords && typeof chunk.keywords === 'string') {
                const triggerWords = chunk.keywords.split(',').map(k => normalizeString(k.trim())).filter(Boolean);
                const normQuery = normalizeString(query);
                let triggerMatches = 0;
                triggerWords.forEach(tw => {
                    if (tw.length >= 2 && (normQuery.includes(tw) || keywords.includes(tw))) {
                        triggerMatches++;
                    }
                });
                if (triggerMatches > 0) {
                    score += triggerMatches * 7.5 + 4.0;
                }
            }

            if (score > 1.2) {
                scored.push({
                    id: chunk.id,
                    docId: chunk.doc_id,
                    docTitle: chunk.title,
                    type: chunk.type,
                    content: chunk.content,
                    keywords: chunk.keywords || '',
                    score: Math.round(score * 100) / 100
                });
            }
        });

        // Ordena por pontuação decrescente
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, limit);
    } catch (e) {
        console.error('⚠️ Erro ao recuperar chunks RAG:', e.message);
        return [];
    }
}

// ─── GERADOR DE CONTEXTO RAG PARA INJEÇÃO NO PROMPT ───
function buildRagPromptContext(query, companyId = 'default') {
    try {
        const relevantChunks = retrieveRelevantChunks(query, companyId, 4);
        if (!relevantChunks || relevantChunks.length === 0) return '';

        let context = '\n[INFORMAÇÕES OFICIAIS RECUPERADAS DA BASE DE CONHECIMENTO / PLANILHAS DO SEU NEGÓCIO]\n';
        context += 'Utilize com prioridade absoluta os dados abaixo para responder com precisão cirúrgica à dúvida do cliente:\n';
        context += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

        relevantChunks.forEach((c, idx) => {
            context += `• INFORMAÇÃO #${idx + 1} (${c.docTitle} [${c.type.toUpperCase()}]):\n${c.content}\n\n`;
        });

        context += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        context += 'Instrução: Se a resposta contiver valores, serviços, procedimentos ou regras presentes nos dados acima, cite-os com clareza e fidelidade total.\n';

        return context;
    } catch (e) {
        console.error('⚠️ Erro ao construir contexto RAG para prompt:', e.message);
        return '';
    }
}

module.exports = {
    upload,
    indexUploadedFile,
    indexManualText,
    updateDocKeywords,
    getKnowledgeDocs,
    getDocPreview,
    deleteKnowledgeDoc,
    retrieveRelevantChunks,
    buildRagPromptContext
};
