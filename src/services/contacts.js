const { db, sanitizeInput } = require('../database');
const { addAuditLog } = require('./audit');

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

function cleanRawLidContacts() {
    try {
        const lidBlocked = db.prepare("SELECT * FROM contacts WHERE (jid LIKE '%@lid' OR jid LIKE '%@bot') AND (auto_reply = 0 OR relationship = 'Bloqueado')").all();
        lidBlocked.forEach(b => {
            if (isHumanName(b.name)) {
                db.prepare("UPDATE contacts SET auto_reply = 0, relationship = 'Bloqueado' WHERE name = ?").run(b.name);
                const digits = b.jid.replace(/\D/g, '');
                db.prepare("INSERT INTO blacklist (jid, name, phone_digits, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(jid) DO NOTHING")
                  .run(b.jid, b.name, digits, new Date().toISOString());
            }
        });
        db.prepare("DELETE FROM contacts WHERE jid LIKE '%@lid' OR jid LIKE '%@bot' OR (length(jid) > 20 AND jid LIKE '27%@c.us')").run();
        return true;
    } catch (e) {
        return false;
    }
}

function getAllContacts() {
    try {
        cleanRawLidContacts();
        const rows = db.prepare("SELECT * FROM contacts WHERE jid NOT LIKE '%@bot' AND jid != '@c.us' ORDER BY auto_reply ASC, favorite DESC, name ASC").all();

        const map = new Map();
        rows.forEach(r => {
            // Se o contato não tem lid_jid preenchido, tenta recuperar automaticamente da tabela lid_mappings
            if (!r.lid_jid) {
                const phoneDigits = r.phone_number || (r.phone_jid ? r.phone_jid.replace(/\D/g, '') : (r.jid ? r.jid.replace(/\D/g, '') : ''));
                let mappedLid = null;
                if (r.phone_jid) {
                    mappedLid = db.prepare("SELECT lid FROM lid_mappings WHERE phone_jid = ?").get(r.phone_jid);
                }
                if (!mappedLid && phoneDigits) {
                    mappedLid = db.prepare("SELECT lid FROM lid_mappings WHERE phone_number = ?").get(phoneDigits);
                }
                if (!mappedLid && r.name && isHumanName(r.name) && r.name !== '@nobazzy') {
                    mappedLid = db.prepare("SELECT lid FROM lid_mappings WHERE name = ?").get(r.name);
                }
                if (mappedLid && mappedLid.lid) {
                    r.lid_jid = mappedLid.lid;
                    try {
                        db.prepare("UPDATE contacts SET lid_jid = ? WHERE jid = ?").run(mappedLid.lid, r.jid);
                    } catch (e) {}
                }
            }

            const key = r.phone_number || (r.phone_jid ? r.phone_jid.replace('@c.us', '') : (r.lid_jid || r.jid));
            if (!map.has(key)) {
                map.set(key, r);
            } else {
                const existing = map.get(key);
                if (!existing.phone_number && r.phone_number) existing.phone_number = r.phone_number;
                if (!existing.phone_jid && r.phone_jid) existing.phone_jid = r.phone_jid;
                if (!existing.lid_jid && r.lid_jid) existing.lid_jid = r.lid_jid;
            }
        });
        return Array.from(map.values());
    } catch (e) {
        console.error('⚠️ Erro ao buscar contatos:', e.message);
        return [];
    }
}

function isContactBlocked(jidOrNumber) {
    try {
        const raw = sanitizeInput(jidOrNumber);
        if (!raw || raw === '@c.us' || raw === '@lid') return false;

        const cleanDigits = raw.replace(/\D/g, '');

        // 1. CHECAGEM NA TABELA DEDICADA DE BLACKLIST (IMUTÁVEL)
        const inBlacklistDirect = db.prepare("SELECT jid FROM blacklist WHERE jid = ?").get(raw);
        if (inBlacklistDirect) return true;

        if (cleanDigits.length >= 8) {
            const last8 = cleanDigits.slice(-8);
            const inBlacklistDigits = db.prepare("SELECT jid FROM blacklist WHERE phone_digits LIKE ?").get(`%${last8}%`);
            if (inBlacklistDigits) return true;
        }

        if (isHumanName(raw)) {
            const blName = db.prepare("SELECT jid FROM blacklist WHERE name = ?").get(raw);
            if (blName) return true;
        }

        // 2. CHECAGEM NA TABELA DE CONTATOS
        const stmt = db.prepare("SELECT auto_reply, relationship, name FROM contacts WHERE jid = ?");
        const contact = stmt.get(raw);
        if (contact && (Number(contact.auto_reply) === 0 || contact.relationship === 'Bloqueado')) return true;

        if (cleanDigits.length >= 8) {
            const last8 = cleanDigits.slice(-8);
            const pattern = `%${last8}%`;
            const checkNum = db.prepare("SELECT jid FROM contacts WHERE jid LIKE ? AND (auto_reply = 0 OR relationship = 'Bloqueado')").get(pattern);
            if (checkNum) return true;
        }

        if (contact && isHumanName(contact.name)) {
            const nameMatch = db.prepare("SELECT jid FROM contacts WHERE name = ? AND (auto_reply = 0 OR relationship = 'Bloqueado')").get(contact.name);
            if (nameMatch) return true;
            const blName = db.prepare("SELECT jid FROM blacklist WHERE name = ?").get(contact.name);
            if (blName) return true;
        }

        return false;
    } catch (e) {
        return false;
    }
}

function saveContact(jid, name, relationship = 'Contato', notes = '', customPrompt = '', tags = 'Geral', favorite = 0, user = 'Alex', explicitLid = '') {
    try {
        const sJid = sanitizeInput(jid);
        const sName = sanitizeInput(name);
        if (!sJid || !sName || sJid.includes('@bot')) return null;

        const cleanDigits = sJid.replace(/\D/g, '');
        const phoneJid = sJid.includes('@c.us') ? sJid : (cleanDigits ? `${cleanDigits}@c.us` : '');
        // Priorizar LID explícito vindo do formulário, senão usar se o próprio JID for @lid
        const sanitizedExplicitLid = explicitLid ? sanitizeInput(explicitLid).trim() : '';
        const lidJid = sanitizedExplicitLid || (sJid.includes('@lid') ? sJid : '');

        if (sJid.includes('@lid')) {
            saveLidMapping(sJid, '', sName);
            addAuditLog(user, 'Associou LID', `LID: ${sJid} -> Nome: ${sName}`, '🟢');
            return { jid: sJid, phone_number: cleanDigits, phone_jid: phoneJid, lid_jid: sJid, name: sName, relationship: relationship || 'Contato', tags: tags || 'Geral' };
        }

        const isAlreadyBlocked = isContactBlocked(sJid) || (isHumanName(sName) && isContactBlocked(sName));
        const targetAutoReply = isAlreadyBlocked ? 0 : 1;
        const targetRel = isAlreadyBlocked ? 'Bloqueado' : (sanitizeInput(relationship) || 'Contato');

        const sNotes = sanitizeInput(notes);
        const sPrompt = sanitizeInput(customPrompt);
        const sTags = sanitizeInput(tags) || 'Geral';
        const isFav = favorite ? 1 : 0;
        const timestamp = new Date().toISOString();

        const existing = db.prepare(`
            SELECT * FROM contacts 
            WHERE jid = ? OR phone_jid = ? OR (lid_jid != '' AND lid_jid = ?) OR (phone_number != '' AND phone_number = ?)
        `).get(sJid, phoneJid, lidJid, cleanDigits);

        if (existing) {
            db.prepare(`
                UPDATE contacts SET 
                    phone_number = CASE WHEN ? != '' THEN ? ELSE phone_number END,
                    phone_jid = CASE WHEN ? != '' THEN ? ELSE phone_jid END,
                    lid_jid = CASE WHEN ? != '' THEN ? ELSE lid_jid END,
                    name = ?, 
                    relationship = CASE WHEN contacts.relationship = 'Bloqueado' OR contacts.auto_reply = 0 OR ? = 0 THEN 'Bloqueado' ELSE ? END,
                    auto_reply = CASE WHEN contacts.relationship = 'Bloqueado' OR contacts.auto_reply = 0 OR ? = 0 THEN 0 ELSE ? END,
                    notes = ?, 
                    custom_prompt = ?,
                    tags = ?,
                    favorite = ?,
                    updated_at = ?
                WHERE jid = ?
            `).run(cleanDigits, cleanDigits, phoneJid, phoneJid, lidJid, lidJid, sName, targetAutoReply, targetRel, targetAutoReply, targetAutoReply, sNotes, sPrompt, sTags, isFav, timestamp, existing.jid);
        } else {
            db.prepare(`
                INSERT INTO contacts (jid, phone_number, phone_jid, lid_jid, name, relationship, notes, custom_prompt, auto_reply, tags, favorite, updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(sJid, cleanDigits, phoneJid, lidJid, sName, targetRel, sNotes, sPrompt, targetAutoReply, sTags, isFav, timestamp);
        }

        cleanRawLidContacts();
        addAuditLog(user, 'Salvou Contato', `Contato: ${sName} (${sJid})`, '🟢');
        return getContact(sJid);
    } catch (e) {
        console.error('⚠️ Erro ao salvar contato:', e.message);
        return null;
    }
}

function deleteContact(jid, user = 'Alex') {
    try {
        const sJid = sanitizeInput(jid);
        const target = getContact(sJid);
        db.prepare('DELETE FROM contacts WHERE jid = ?').run(sJid);
        db.prepare('DELETE FROM blacklist WHERE jid = ?').run(sJid);
        if (target && isHumanName(target.name)) {
            db.prepare('DELETE FROM contacts WHERE name = ?').run(target.name);
            db.prepare('DELETE FROM blacklist WHERE name = ?').run(target.name);
        }
        cleanRawLidContacts();
        addAuditLog(user, 'Excluiu Contato', `JID: ${sJid}`, '🔴');
        return true;
    } catch (e) {
        return false;
    }
}

function getContact(jid) {
    try {
        const sJid = sanitizeInput(jid);
        if (!sJid || sJid === '@c.us' || sJid.includes('@lid') || sJid.includes('@bot')) return null;
        const stmt = db.prepare('SELECT * FROM contacts WHERE jid = ?');
        const exact = stmt.get(sJid);
        if (exact) return exact;

        const cleanDigits = sJid.replace(/\D/g, '');
        if (cleanDigits.length >= 8) {
            const pattern = `%${cleanDigits.slice(-8)}%`;
            return db.prepare('SELECT * FROM contacts WHERE jid LIKE ?').get(pattern) || null;
        }
        return null;
    } catch (e) {
        return null;
    }
}

function blockContact(jidOrNumber, name = '', user = 'Alex') {
    try {
        const raw = sanitizeInput(jidOrNumber);
        if (!raw) return false;

        const resolved = resolveContactDisplay(raw);
        const contactName = (resolved && isHumanName(resolved.name)) ? resolved.name : (name || raw);
        const phoneNum = resolved.phoneNumber || raw.replace(/\D/g, '');
        const phoneJid = resolved.phoneJid || (phoneNum && phoneNum.length <= 13 ? `${phoneNum}@c.us` : '');
        const lidJid = resolved.lidJid || (raw.includes('@lid') ? raw : '');

        const timestamp = new Date().toISOString();
        const last8 = phoneNum.length >= 8 ? phoneNum.slice(-8) : phoneNum;

        const insBl = db.prepare(`
            INSERT INTO blacklist (jid, name, phone_digits, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(jid) DO UPDATE SET name = excluded.name, phone_digits = excluded.phone_digits
        `);

        // Bloquear todas as chaves associadas (RAW, Phone JID e LID JID) na Blacklist
        insBl.run(raw, contactName, last8, timestamp);
        if (phoneJid && phoneJid !== raw) insBl.run(phoneJid, contactName, last8, timestamp);
        if (lidJid && lidJid !== raw) insBl.run(lidJid, contactName, last8, timestamp);

        // Atualizar status 1:1 na tabela de contatos
        db.prepare(`
            UPDATE contacts SET 
                auto_reply = 0, 
                relationship = 'Bloqueado',
                lid_jid = CASE WHEN ? != '' THEN ? ELSE lid_jid END,
                phone_jid = CASE WHEN ? != '' THEN ? ELSE phone_jid END,
                phone_number = CASE WHEN ? != '' THEN ? ELSE phone_number END,
                updated_at = ?
            WHERE jid = ? OR phone_jid = ? OR lid_jid = ? OR name = ?
        `).run(lidJid, lidJid, phoneJid, phoneJid, phoneNum, phoneNum, timestamp, raw, phoneJid, lidJid, contactName);

        addAuditLog(user, 'Adicionou à Blacklist', `Contato: ${contactName} (Phone: ${phoneJid}, LID: ${lidJid})`, '🔴');
        return true;
    } catch (e) {
        console.error('⚠️ Erro ao bloquear contato:', e.message);
        return false;
    }
}

function unblockContact(jidOrNumber, user = 'Alex') {
    try {
        const raw = sanitizeInput(jidOrNumber);
        if (!raw) return false;

        const resolved = resolveContactDisplay(raw);
        const contactName = resolved.name || raw;
        const phoneNum = resolved.phoneNumber || raw.replace(/\D/g, '');
        const phoneJid = resolved.phoneJid;
        const lidJid = resolved.lidJid;

        const timestamp = new Date().toISOString();

        // Remover todas as chaves associadas da tabela blacklist
        db.prepare('DELETE FROM blacklist WHERE jid = ? OR jid = ? OR jid = ? OR name = ? OR (phone_digits != \'\' AND phone_digits = ?)').run(raw, phoneJid || '', lidJid || '', contactName, phoneNum);

        if (phoneNum.length >= 8) {
            const pattern = `%${phoneNum.slice(-8)}%`;
            db.prepare("DELETE FROM blacklist WHERE phone_digits LIKE ? OR jid LIKE ?").run(pattern, pattern);
        }

        // Atualizar status na tabela contacts
        db.prepare(`
            UPDATE contacts SET 
                auto_reply = 1, 
                relationship = 'Contato',
                updated_at = ?
            WHERE jid = ? OR phone_jid = ? OR lid_jid = ? OR name = ? OR (phone_number != '' AND phone_number = ?)
        `).run(timestamp, raw, phoneJid || '', lidJid || '', contactName, phoneNum);

        addAuditLog(user, 'Removeu da Blacklist', `Identificador: ${raw}`, '🟢');
        return true;
    } catch (e) {
        console.error('⚠️ Erro ao desbloquear contato:', e.message);
        return false;
    }
}

function cleanRawLidContacts() {
    try {
        db.prepare("DELETE FROM contacts WHERE (jid LIKE '%@lid' OR jid LIKE '%@bot') AND jid NOT IN (SELECT jid FROM blacklist)").run();
        return true;
    } catch (e) {
        return false;
    }
}

function getBlockedContacts() {
    try {
        const bl = db.prepare("SELECT jid, name, phone_digits, created_at FROM blacklist").all();
        const ct = db.prepare("SELECT * FROM contacts WHERE auto_reply = 0 OR relationship = 'Bloqueado'").all();

        const map = new Map();

        // 1. Processar tabela de contatos
        ct.forEach(r => {
            const resolved = resolveContactDisplay(r.jid);
            const key = resolved.name || resolved.phoneNumber || r.name || r.jid;

            if (!map.has(key)) {
                map.set(key, {
                    jid: r.jid,
                    name: r.name || resolved.name || r.jid,
                    phone_number: r.phone_number || resolved.phoneNumber || '',
                    phone_jid: r.phone_jid || resolved.phoneJid || '',
                    lid_jid: r.lid_jid || resolved.lidJid || '',
                    relationship: 'Bloqueado',
                    auto_reply: 0
                });
            } else {
                const existing = map.get(key);
                if (!existing.phone_number && r.phone_number) existing.phone_number = r.phone_number;
                if (!existing.phone_jid && r.phone_jid) existing.phone_jid = r.phone_jid;
                if (!existing.lid_jid && r.lid_jid) existing.lid_jid = r.lid_jid;
            }
        });

        // 2. Processar tabela de blacklist
        bl.forEach(r => {
            const resolved = resolveContactDisplay(r.jid);
            const key = resolved.name || resolved.phoneNumber || r.name || r.jid;

            if (!map.has(key)) {
                map.set(key, {
                    jid: r.jid,
                    name: r.name || resolved.name || r.jid,
                    phone_number: resolved.phoneNumber || (r.phone_digits && r.phone_digits.length <= 13 ? r.phone_digits : ''),
                    phone_jid: resolved.phoneJid || '',
                    lid_jid: resolved.lidJid || (r.jid.includes('@lid') ? r.jid : ''),
                    relationship: 'Bloqueado',
                    auto_reply: 0
                });
            } else {
                const existing = map.get(key);
                if (!existing.phone_number && resolved.phoneNumber) existing.phone_number = resolved.phoneNumber;
                if (!existing.phone_jid && resolved.phoneJid) existing.phone_jid = resolved.phoneJid;
                if (!existing.lid_jid && (resolved.lidJid || r.jid.includes('@lid'))) existing.lid_jid = resolved.lidJid || r.jid;
            }
        });

        return Array.from(map.values());
    } catch (e) {
        console.error('⚠️ Erro em getBlockedContacts:', e.message);
        return [];
    }
}

function cleanUnsavedSyncedContacts() {
    try {
        db.prepare("DELETE FROM contacts WHERE tags = 'WhatsApp' AND (relationship = 'Contato' OR relationship = 'Contato Salvo')").run();
        cleanRawLidContacts();
        return true;
    } catch (e) {
        return false;
    }
}

function toggleManualOverride(chatId, pause = true, user = 'Alex') {
    try {
        const sChatId = sanitizeInput(chatId);
        if (!sChatId) return false;

        const timestamp = new Date().toISOString();
        const val = pause ? 1 : 0;

        db.prepare(`
            INSERT INTO manual_override (chat_id, paused, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(chat_id) DO UPDATE SET paused = excluded.paused, updated_at = excluded.updated_at
        `).run(sChatId, val, timestamp);

        addAuditLog(user, pause ? 'Assumiu Atendimento Manual' : 'Devolveu para a IA', `Chat: ${sChatId}`, pause ? '🔵' : '🟢');
        return true;
    } catch (e) {
        console.error('⚠️ Erro ao alternar atendimento manual:', e.message);
        return false;
    }
}

function isManualOverrideActive(chatId) {
    try {
        const sChatId = sanitizeInput(chatId);
        const row = db.prepare('SELECT paused FROM manual_override WHERE chat_id = ?').get(sChatId);
        return Boolean(row && row.paused === 1);
    } catch (e) {
        return false;
    }
}

function saveLidMapping(lid, phoneJidOrNum = '', name = '') {
    try {
        const sLid = sanitizeInput(lid);
        if (!sLid || !sLid.includes('@lid')) return false;

        const sInput = sanitizeInput(phoneJidOrNum);
        const cleanDigits = sInput ? sInput.replace(/\D/g, '') : '';
        const realPhoneDigits = (cleanDigits.length >= 10 && cleanDigits.length <= 13) ? cleanDigits : '';
        const phoneJid = realPhoneDigits ? `${realPhoneDigits}@c.us` : '';
        const sName = sanitizeInput(name);

        const cleanMyNum = config.MY_NUMBER ? config.MY_NUMBER.replace(/\D/g, '') : '';
        const now = new Date().toISOString();

        // Se o LID for do Alex (ou mapeamento do Alex), associar diretamente com o MY_NUMBER
        if (sLid === `${cleanMyNum}@lid` || sLid === '272653298487378@lid' || sName === '@nobazzy') {
            const alexPhone = cleanMyNum || '5511935855321';
            const alexJid = `${alexPhone}@c.us`;
            db.prepare(`
                INSERT INTO lid_mappings (lid, phone_number, phone_jid, name, updated_at) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(lid) DO UPDATE SET phone_number = ?, phone_jid = ?, name = '@nobazzy', updated_at = ?
            `).run(sLid, alexPhone, alexJid, '@nobazzy', now, alexPhone, alexJid, now);
            return true;
        }

        // 1. Upsert na tabela lid_mappings para contatos terceiros
        db.prepare(`
            INSERT INTO lid_mappings (lid, phone_number, phone_jid, name, updated_at) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(lid) DO UPDATE SET 
                phone_number = CASE WHEN excluded.phone_number != '' THEN excluded.phone_number ELSE lid_mappings.phone_number END,
                phone_jid = CASE WHEN excluded.phone_jid != '' THEN excluded.phone_jid ELSE lid_mappings.phone_jid END,
                name = CASE WHEN excluded.name != '' THEN excluded.name ELSE lid_mappings.name END,
                updated_at = excluded.updated_at
        `).run(sLid, realPhoneDigits, phoneJid, sName, now);

        // 2. Auto-vínculo 1:1 na tabela contacts por telefone real ou por nome
        let existing = null;
        if (realPhoneDigits) {
            existing = db.prepare(`
                SELECT * FROM contacts 
                WHERE jid = ? OR phone_jid = ? OR (phone_number != '' AND phone_number = ?)
            `).get(phoneJid, phoneJid, realPhoneDigits);
        }

        if (!existing && sName && isHumanName(sName) && sName !== '@nobazzy') {
            existing = db.prepare(`SELECT * FROM contacts WHERE name = ? AND (phone_number != '' OR phone_jid != '')`).get(sName);
        }

        if (existing) {
            db.prepare(`
                UPDATE contacts SET 
                    phone_number = CASE WHEN ? != '' THEN ? ELSE phone_number END,
                    phone_jid = CASE WHEN ? != '' THEN ? ELSE phone_jid END,
                    lid_jid = ?,
                    name = CASE WHEN ? != '' AND ? != '@nobazzy' THEN ? ELSE name END,
                    updated_at = ?
                WHERE jid = ?
            `).run(realPhoneDigits, realPhoneDigits, phoneJid, phoneJid, sLid, sName, sName, sName, now, existing.jid);
        } else if (sName && isHumanName(sName) && sName !== '@nobazzy') {
            const primaryJid = phoneJid || sLid;
            db.prepare(`
                INSERT INTO contacts (jid, phone_number, phone_jid, lid_jid, name, relationship, notes, custom_prompt, auto_reply, tags, favorite, updated_at)
                VALUES (?, ?, ?, ?, ?, 'Contato', '', '', 1, 'Auto Mapeado', 0, ?)
            `).run(primaryJid, realPhoneDigits, phoneJid, sLid, sName, now);
        }

        return true;
    } catch (e) {
        return false;
    }
}

function resolveContactDisplay(chatId) {
    try {
        const raw = sanitizeInput(chatId);
        if (!raw) return { name: 'Desconhecido', display: 'Desconhecido', phoneNumber: '', phoneJid: '', lidJid: '', jid: raw };

        const digits = raw.replace(/\D/g, '');

        let ct = db.prepare(`
            SELECT * FROM contacts 
            WHERE jid = ? OR phone_jid = ? OR lid_jid = ? OR (phone_number != '' AND phone_number = ?)
        `).get(raw, raw, raw, digits);

        if (ct && ct.name) {
            const pNum = ct.phone_number || (ct.phone_jid ? ct.phone_jid.replace('@c.us', '') : digits);
            return {
                name: ct.name,
                phoneNumber: pNum,
                phoneJid: ct.phone_jid || (pNum ? `${pNum}@c.us` : ''),
                lidJid: ct.lid_jid || (raw.includes('@lid') ? raw : ''),
                display: pNum ? `${ct.name} (${pNum})` : ct.name,
                jid: raw
            };
        }

        if (raw.includes('@lid')) {
            const lidRow = db.prepare("SELECT * FROM lid_mappings WHERE lid = ?").get(raw);
            if (lidRow) {
                const pNum = lidRow.phone_number || (lidRow.phone_jid ? lidRow.phone_jid.replace('@c.us', '') : '');
                let rName = lidRow.name;

                if (lidRow.phone_jid) {
                    const cByJid = db.prepare("SELECT name FROM contacts WHERE jid = ?").get(lidRow.phone_jid);
                    if (cByJid && cByJid.name) rName = cByJid.name;
                }

                if (rName && isHumanName(rName) && rName !== '@nobazzy') {
                    return {
                        name: rName,
                        phoneNumber: pNum,
                        phoneJid: lidRow.phone_jid || '',
                        lidJid: raw,
                        display: pNum ? `${rName} (${pNum})` : rName,
                        jid: raw
                    };
                }

                if (pNum) {
                    return {
                        name: pNum,
                        phoneNumber: pNum,
                        phoneJid: lidRow.phone_jid || `${pNum}@c.us`,
                        lidJid: raw,
                        display: pNum,
                        jid: raw
                    };
                }
            }
        }

        if (digits && digits.length >= 8) {
            const last8 = digits.slice(-8);
            const ctNum = db.prepare("SELECT * FROM contacts WHERE jid LIKE ? OR phone_number LIKE ?").get(`%${last8}%`, `%${last8}%`);
            if (ctNum && ctNum.name) {
                const pNum = ctNum.phone_number || digits;
                return {
                    name: ctNum.name,
                    phoneNumber: pNum,
                    phoneJid: ctNum.phone_jid || `${pNum}@c.us`,
                    lidJid: ctNum.lid_jid || '',
                    display: `${ctNum.name} (${pNum})`,
                    jid: raw
                };
            }
        }

        return {
            name: raw.replace('@c.us', ''),
            phoneNumber: digits,
            phoneJid: raw.includes('@c.us') ? raw : (digits ? `${digits}@c.us` : ''),
            lidJid: raw.includes('@lid') ? raw : '',
            display: digits ? `${raw.replace('@c.us', '')} (${digits})` : raw,
            jid: raw
        };
    } catch (e) {
        return { name: chatId, display: chatId, phoneNumber: '', phoneJid: '', lidJid: '', jid: chatId };
    }
}

module.exports = {
    cleanNumber,
    getAllContacts,
    saveContact,
    deleteContact,
    getContact,
    isHumanName,
    blockContact,
    unblockContact,
    isContactBlocked,
    getBlockedContacts,
    cleanUnsavedSyncedContacts,
    cleanRawLidContacts,
    toggleManualOverride,
    isManualOverrideActive,
    saveLidMapping,
    resolveContactDisplay
};
