document.addEventListener('DOMContentLoaded', () => {
    // ─── CHECK ONBOARDING WIZARD STATUS ───
    async function checkOnboarding() {
        try {
            const res = await fetch('/api/onboarding/status');
            const data = await res.json();
            if (data.success && !data.onboarded) {
                document.getElementById('wizard-modal').classList.add('open');
            }
        } catch (e) {}
    }
    checkOnboarding();

    document.getElementById('form-wizard').addEventListener('submit', async (e) => {
        e.preventDefault();
        const companyName = document.getElementById('w-company-name').value;
        const segment = document.getElementById('w-segment').value;
        const provider = document.getElementById('w-provider').value;
        const start = document.getElementById('w-hours-start').value;
        const end = document.getElementById('w-hours-end').value;
        const absence = document.getElementById('w-absence-msg').value;

        const res = await fetch('/api/onboarding/setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyName, segment, provider, businessHoursStart: start, businessHoursEnd: end, absenceMessage: absence })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('wizard-modal').classList.remove('open');
            loadDashboard();
        }
    });

    // ─── TAB NAVIGATION COM BREADCRUMB DINÂMICO ───
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const breadcrumbLabel = document.getElementById('current-page-breadcrumb');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            navButtons.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(targetTab).classList.add('active');

            if (breadcrumbLabel) {
                const btnText = btn.innerText.replace(/^[^\s]+\s+/, '');
                breadcrumbLabel.innerText = btnText || 'Dashboard Executivo';
            }

            if (targetTab === 'tab-dashboard') loadDashboard();
            if (targetTab === 'tab-noc') loadNoc();
            if (targetTab === 'tab-chats') loadChats();
            if (targetTab === 'tab-rag') loadRag();
            if (targetTab === 'tab-marketplace') loadMarketplace();
            if (targetTab === 'tab-training') loadTraining();
            if (targetTab === 'tab-prompts') loadPrompts();
            if (targetTab === 'tab-contacts') loadContacts();
            if (targetTab === 'tab-memories') loadMemories();
            if (targetTab === 'tab-automations') loadAutomations();
            if (targetTab === 'tab-audit') loadAudit();
        });
    });

    // ─── BUSCA GLOBAL (CTRL + K) ───
    const searchModal = document.getElementById('search-modal');
    const searchInput = document.getElementById('global-search-input');
    const searchTrigger = document.getElementById('btn-search-trigger');
    const searchResults = document.getElementById('global-search-results');

    function openSearch() { searchModal.classList.add('open'); searchInput.focus(); }
    function closeSearch() { searchModal.classList.remove('open'); }

    searchTrigger.addEventListener('click', openSearch);
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
        if (e.key === 'Escape') closeSearch();
    });
    searchModal.addEventListener('click', (e) => { if (e.target === searchModal) closeSearch(); });

    searchInput.addEventListener('input', async () => {
        const query = searchInput.value.trim();
        if (!query) { searchResults.innerHTML = ''; return; }

        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            if (data.success) renderSearchResults(data.results);
        } catch (e) {}
    });

    function renderSearchResults(results) {
        let html = '';
        if (results.contacts && results.contacts.length > 0) {
            html += `<div style="font-weight:600; margin-bottom:0.5rem; color:var(--brand-cyan);">👤 Contatos:</div>`;
            results.contacts.forEach(c => { html += `<div style="padding:0.5rem; border-bottom:1px solid var(--border-color);">${c.name} (${c.jid}) - ${c.relationship}</div>`; });
        }
        if (results.chatHistory && results.chatHistory.length > 0) {
            html += `<div style="font-weight:600; margin:1rem 0 0.5rem 0; color:var(--brand-emerald);">💬 Mensagens:</div>`;
            results.chatHistory.forEach(m => { html += `<div style="padding:0.5rem; border-bottom:1px solid var(--border-color); font-size:0.85rem;">${m.chat_id}: ${m.message}</div>`; });
        }
        searchResults.innerHTML = html || '<div style="color:var(--text-muted);">Nenhum resultado encontrado.</div>';
    }

    // ─── DASHBOARD EXECUTIVO ENTERPRISE ───
    async function loadDashboard() {
        try {
            const res = await fetch('/api/dashboard');
            const data = await res.json();
            if (data.success) {
                document.getElementById('dash-total-leads').innerText = data.metrics.totalChats;
                document.getElementById('dash-ai-rate').innerText = data.metrics.aiResolutionRate;
                document.getElementById('dash-cost-saved').innerText = data.metrics.costSavedBrl;
                document.getElementById('dash-cost-today').innerText = data.metrics.costTodayBrl;
                document.getElementById('dash-tokens-today').innerText = `${data.metrics.tokensToday.toLocaleString()} tokens`;

                // Horizontal Vercel-style Health Board
                const grid = document.getElementById('health-board-grid');
                if (grid) {
                    grid.innerHTML = '';
                    for (const [key, item] of Object.entries(data.health)) {
                        const isRed = item.status.includes('🔴') || item.status.includes('Desconectado') || item.status.includes('Erro');
                        grid.innerHTML += `
                            <div class="health-item">
                                <span class="status-dot ${isRed ? 'red' : ''}"></span>
                                <div>
                                    <div style="font-size:0.82rem; font-weight:700; color:#fff;">${item.name}</div>
                                    <div style="font-size:0.75rem; color:var(--text-muted);">${item.details}</div>
                                </div>
                            </div>
                        `;
                    }
                }

                // Atualizar pílulas de status de saúde no topo do cabeçalho
                const pillsContainer = document.getElementById('health-pills-container');
                if (pillsContainer && data.health) {
                    const nodeOk = data.health.node && data.health.node.status.includes('🟢');
                    const waOk = data.health.whatsapp && data.health.whatsapp.status.includes('🟢');
                    const aiOk = data.health.openai && data.health.openai.status.includes('🟢');

                    pillsContainer.innerHTML = `
                        <div class="pill"><span class="status-dot ${nodeOk ? '' : 'red'}"></span> Node</div>
                        <div class="pill"><span class="status-dot ${waOk ? '' : 'red'}"></span> WhatsApp</div>
                        <div class="pill"><span class="status-dot ${aiOk ? '' : 'red'}"></span> Multi-LLM</div>
                    `;
                }

                // Telemetria da IA no Dashboard
                try {
                    const nocRes = await fetch('/api/noc/status');
                    const nocData = await nocRes.json();
                    if (nocData.success && nocData.noc.llmStats) {
                        const s = nocData.noc.llmStats;
                        if (document.getElementById('dash-stat-provider')) document.getElementById('dash-stat-provider').innerText = s.provider.toUpperCase() + ` (${s.activeModel})`;
                        if (document.getElementById('dash-stat-latency')) document.getElementById('dash-stat-latency').innerText = `${s.lastLatencyMs} ms`;
                        if (document.getElementById('dash-stat-tokens')) document.getElementById('dash-stat-tokens').innerText = s.totalTokensToday.toLocaleString();
                    }
                } catch(e) {}

                // Feed de Eventos Ao Vivo
                try {
                    const auditRes = await fetch('/api/audit');
                    const auditData = await auditRes.json();
                    if (auditData.success && auditData.logs) {
                        const liveBody = document.getElementById('dash-live-events-body');
                        if (liveBody) {
                            let lhtml = '';
                            auditData.logs.slice(0, 5).forEach(l => {
                                lhtml += `
                                    <tr>
                                        <td><code style="color:var(--text-muted);">${new Date(l.timestamp).toLocaleTimeString('pt-BR')}</code></td>
                                        <td><strong style="color:var(--brand-cyan);">${l.action}</strong></td>
                                        <td style="color:var(--text-secondary);">${l.details}</td>
                                    </tr>
                                `;
                            });
                            liveBody.innerHTML = lhtml || '<tr><td colspan="3" style="color:var(--text-muted);">Nenhum evento registrado ainda.</td></tr>';
                        }
                    }
                } catch(e) {}
            }
        } catch (e) {}
    }

    // ─── NOC REAL-TIME MONITOR ───
    async function loadNoc() {
        try {
            const res = await fetch('/api/noc/status');
            const data = await res.json();
            if (data.success) {
                document.getElementById('noc-llm-details').innerText = `Latência Média: ${data.noc.llmStats.lastLatencyMs}ms | Provedor: ${data.noc.llmStats.provider}`;
            }
        } catch (e) {}
    }

    // ─── MARKETPLACE DE TEMPLATES ───
    async function loadMarketplace() {
        try {
            const res = await fetch('/api/templates');
            const data = await res.json();
            if (data.success) {
                const grid = document.getElementById('templates-grid');
                grid.innerHTML = '';
                data.templates.forEach(t => {
                    grid.innerHTML += `
                        <div class="card" style="display:flex; flex-direction:column; justify-content:space-between;">
                            <div>
                                <div style="font-size:2rem; margin-bottom:0.5rem;">${t.icon}</div>
                                <h3 style="font-size:1.1rem; margin-bottom:0.35rem;">${t.title}</h3>
                                <div style="font-size:0.75rem; color:var(--accent-blue); margin-bottom:0.75rem;">${t.niche}</div>
                                <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:1rem;">${t.description}</p>
                            </div>
                            <button class="btn btn-primary" style="width:100%;" onclick="applyTemplate('${t.id}')">🚀 Aplicar este Template</button>
                        </div>
                    `;
                });
            }
        } catch (e) {}
    }

    window.applyTemplate = async function(templateId) {
        if (confirm('Deseja ativar este template de prompt comercial no seu assistente?')) {
            await fetch('/api/templates/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ templateId })
            });
            alert('Template aplicado com sucesso!');
            loadPrompts();
        }
    };

    // ─── RAG KNOWLEDGE BASE ───
    async function loadRag() {
        try {
            const res = await fetch('/api/training/docs');
            const data = await res.json();
            if (data.success) {
                const list = document.getElementById('rag-docs-list');
                list.innerHTML = '';
                data.docs.forEach(d => {
                    list.innerHTML += `
                        <div style="padding:0.75rem; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <span style="background:rgba(59,130,246,0.2); color:var(--accent-blue); padding:2px 6px; border-radius:4px; font-size:0.75rem;">[${d.type.toUpperCase()}]</span>
                                <strong>${d.title}</strong><br>
                                <span style="font-size:0.8rem; color:var(--text-muted);">${new Date(d.created_at).toLocaleDateString()}</span>
                            </div>
                            <button class="btn btn-danger" style="padding:2px 8px;" onclick="deleteRagDoc(${d.id})">Apagar</button>
                        </div>
                    `;
                });
            }
        } catch (e) {}
    }

    document.getElementById('form-add-rag-doc').addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('rag-title-input').value;
        const type = document.getElementById('rag-type-input').value;
        const content = document.getElementById('rag-content-input').value;

        await fetch('/api/training/docs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, type, content })
        });
        document.getElementById('rag-title-input').value = '';
        document.getElementById('rag-content-input').value = '';
        loadRag();
    });

    window.deleteRagDoc = async function(id) {
        await fetch(`/api/training/docs/${id}`, { method: 'DELETE' });
        loadRag();
    };

    // ─── SSE LOGS EM TEMPO REAL ───
    const evtSource = new EventSource('/api/logs/stream');
    const logsBody = document.getElementById('logs-table-body');

    evtSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'history') {
                if (logsBody) logsBody.innerHTML = '';
                data.logs.forEach(addLogRow);
            } else {
                addLogRow(data);
                // Atualização em tempo real do front-end
                if (data.type === 'chat' || data.type === 'ai' || data.type === 'system') {
                    if (typeof loadChats === 'function') loadChats();
                    if (currentActiveChat && typeof selectChat === 'function') {
                        selectChat(currentActiveChat, currentActiveChat);
                    }
                    if (typeof loadDashboard === 'function') loadDashboard();
                }
            }
        } catch (e) {}
    };

    function addLogRow(log) {
        if (!logsBody) return;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${log.time}</td>
            <td><span style="background:rgba(255,255,255,0.08); padding:2px 6px; border-radius:4px; font-size:0.75rem;">${log.type}</span></td>
            <td><strong>${log.event}</strong></td>
            <td>${log.details}</td>
            <td>${log.status}</td>
        `;
        logsBody.insertBefore(tr, logsBody.firstChild);
        if (logsBody.children.length > 50) logsBody.removeChild(logsBody.lastChild);
    }

    // ─── CONVERSAS & ATENDIMENTO MANUAL ───
    let currentActiveChat = null;

    async function loadChats() {
        try {
            const res = await fetch('/api/chats');
            const data = await res.json();
            if (data.success) {
                const container = document.getElementById('chats-list-container');
                container.innerHTML = '';
                data.chats.forEach(c => {
                    const titleStr = c.display_name || c.name || c.chat_id;
                    container.innerHTML += `
                        <div class="chat-item" style="padding:0.75rem; border-bottom:1px solid var(--border-color); cursor:pointer;" onclick="selectChat('${c.chat_id}', '${escapeJs(titleStr)}')">
                            <div style="font-weight:600; color:var(--text-primary);">${titleStr} ${c.manual_override ? '👤 (Manual)' : ''}</div>
                            <div style="font-size:0.8rem; color:var(--text-muted); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${c.last_message || ''}</div>
                        </div>
                    `;
                });
            }
        } catch (e) {}
    }

    window.selectChat = async function(chatId, fallbackName) {
        currentActiveChat = chatId;
        document.getElementById('active-chat-title').innerText = fallbackName || chatId;
        
        try {
            const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/messages`);
            const data = await res.json();
            if (data.success) {
                if (data.chat_info && data.chat_info.display) {
                    document.getElementById('active-chat-title').innerText = data.chat_info.display;
                }

                const container = document.getElementById('chat-messages-container');
                container.innerHTML = '';
                data.messages.forEach(m => {
                    const isBot = m.sender === 'assistant';
                    container.innerHTML += `
                        <div style="margin-bottom:0.75rem; text-align: ${isBot ? 'right' : 'left'};">
                            <span style="display:inline-block; padding:0.6rem 1rem; border-radius:10px; background: ${isBot ? 'var(--accent-blue)' : 'rgba(255,255,255,0.08)'}; color: white; max-width:80%;">
                                ${m.message}
                            </span>
                        </div>
                    `;
                });

                const btnManual = document.getElementById('btn-toggle-manual');
                if (data.manual_override) {
                    btnManual.innerText = '🤖 Devolver para a IA';
                    btnManual.className = 'btn btn-primary';
                } else {
                    btnManual.innerText = '👤 Assumir Atendimento Manual';
                    btnManual.className = 'btn btn-danger';
                }
            }
        } catch (e) {}
    };

    document.getElementById('btn-toggle-manual').addEventListener('click', async () => {
        if (!currentActiveChat) return;
        const btn = document.getElementById('btn-toggle-manual');
        const isPausing = btn.innerText.includes('Assumir');

        await fetch(`/api/chats/${encodeURIComponent(currentActiveChat)}/manual-override`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pause: isPausing })
        });
        selectChat(currentActiveChat, currentActiveChat);
    });

    document.getElementById('btn-clear-chat-history').addEventListener('click', async () => {
        if (!currentActiveChat) return;
        if (confirm(`Tem certeza que deseja apagar todo o histórico desta conversa?`)) {
            await fetch(`/api/chats/${encodeURIComponent(currentActiveChat)}/history`, {
                method: 'DELETE'
            });
            selectChat(currentActiveChat, currentActiveChat);
            loadChats();
        }
    });

    document.getElementById('btn-send-chat-reply').addEventListener('click', async () => {
        if (!currentActiveChat) return;
        const input = document.getElementById('chat-reply-input');
        const text = input.value.trim();
        if (!text) return;

        await fetch(`/api/chats/${encodeURIComponent(currentActiveChat)}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });
        input.value = '';
        selectChat(currentActiveChat, currentActiveChat);
    });

    // ─── TREINAMENTO (FAQS E REGRAS) ───
    async function loadTraining() {
        const faqsRes = await fetch('/api/training/faqs');
        const faqsData = await faqsRes.json();
        if (faqsData.success) {
            const list = document.getElementById('faqs-list');
            list.innerHTML = '';
            faqsData.faqs.forEach(f => {
                list.innerHTML += `
                    <div style="padding:0.75rem; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong>P: ${f.question}</strong><br>
                            <span style="color:var(--text-secondary); font-size:0.85rem;">R: ${f.answer}</span>
                        </div>
                        <div style="display:flex; gap:0.35rem;">
                            <button class="btn btn-primary" style="padding:2px 8px; font-size:0.75rem;" onclick="editFaq(${f.id}, '${escapeJs(f.question)}', '${escapeJs(f.answer)}')">✏️ Editar</button>
                            <button class="btn btn-danger" style="padding:2px 8px; font-size:0.75rem;" onclick="deleteFaq(${f.id})">Apagar</button>
                        </div>
                    </div>
                `;
            });
        }

        const rulesRes = await fetch('/api/training/rules');
        const rulesData = await rulesRes.json();
        if (rulesData.success) {
            const list = document.getElementById('rules-list');
            list.innerHTML = '';
            rulesData.rules.forEach(r => {
                list.innerHTML += `
                    <div style="padding:0.75rem; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                        <span>⚠️ ${r.rule}</span>
                        <div style="display:flex; gap:0.35rem;">
                            <button class="btn btn-primary" style="padding:2px 8px; font-size:0.75rem;" onclick="editRule(${r.id}, '${escapeJs(r.rule)}')">✏️ Editar</button>
                            <button class="btn btn-danger" style="padding:2px 8px; font-size:0.75rem;" onclick="deleteRule(${r.id})">Apagar</button>
                        </div>
                    </div>
                `;
            });
        }
    }

    document.getElementById('form-add-faq').addEventListener('submit', async (e) => {
        e.preventDefault();
        const q = document.getElementById('faq-question-input').value;
        const a = document.getElementById('faq-answer-input').value;
        await fetch('/api/training/faqs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: q, answer: a })
        });
        document.getElementById('faq-question-input').value = '';
        document.getElementById('faq-answer-input').value = '';
        loadTraining();
    });

    document.getElementById('form-add-rule').addEventListener('submit', async (e) => {
        e.preventDefault();
        const r = document.getElementById('rule-input').value;
        await fetch('/api/training/rules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rule: r })
        });
        document.getElementById('rule-input').value = '';
        loadTraining();
    });

    window.editFaq = async function(id, currentQ, currentA) {
        const newQ = prompt('Editar Pergunta:', currentQ);
        if (!newQ) return;
        const newA = prompt('Editar Resposta Oficial:', currentA);
        if (!newA) return;

        await fetch(`/api/training/faqs/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: newQ, answer: newA })
        });
        loadTraining();
    };

    window.editRule = async function(id, currentRule) {
        const newRule = prompt('Editar Regra de Negócio:', currentRule);
        if (!newRule) return;

        await fetch(`/api/training/rules/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rule: newRule })
        });
        loadTraining();
    };

    window.deleteFaq = async function(id) {
        await fetch(`/api/training/faqs/${id}`, { method: 'DELETE' });
        loadTraining();
    };

    window.deleteRule = async function(id) {
        await fetch(`/api/training/rules/${id}`, { method: 'DELETE' });
        loadTraining();
    };

    // ─── PLAYGROUND ───
    document.getElementById('btn-run-playground').addEventListener('click', async () => {
        const prompt = document.getElementById('pg-prompt-input').value;
        const msg = document.getElementById('pg-message-input').value;
        const resBox = document.getElementById('pg-results-container');

        resBox.innerText = 'Executando teste...';

        const res = await fetch('/api/playground', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userPrompt: prompt, testMessage: msg })
        });
        const data = await res.json();
        if (data.success) {
            resBox.innerHTML = `
                <div style="background:rgba(255,255,255,0.05); padding:1rem; border-radius:8px;">
                    <strong>Resposta:</strong><br>${data.reply}<br><br>
                    <div style="font-size:0.8rem; color:var(--accent-blue);">
                        ⏱️ Tempo: ${data.latencyMs}ms | 🤖 Modelo: ${data.model} | 📊 Tokens: ${data.tokens} | 💰 Custo: ${data.costBrl}
                    </div>
                </div>
            `;
        }
    });

    // ─── PROMPTS & PERSONALIDADES ───
    async function loadPrompts() {
        const pRes = await fetch('/api/personalities');
        const pData = await pRes.json();
        if (pData.success) {
            const list = document.getElementById('personalities-list');
            list.innerHTML = '';
            pData.personalities.forEach(p => {
                list.innerHTML += `
                    <div style="padding:0.75rem; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong>${p.name}</strong> ${p.active ? '🟢 (Ativo)' : ''}<br>
                            <span style="font-size:0.8rem; color:var(--text-muted);">${p.description}</span>
                        </div>
                        <div style="display:flex; gap:0.5rem;">
                            ${!p.active ? `<button class="btn btn-primary" onclick="activatePersonality('${p.id}')">Ativar</button>` : ''}
                            ${p.id !== 'cloud' ? `<button class="btn btn-danger" onclick="deletePersonality('${p.id}')">Apagar</button>` : ''}
                        </div>
                    </div>
                `;
            });
        }

        const vRes = await fetch('/api/prompts/versions');
        const vData = await vRes.json();
        if (vData.success) {
            const list = document.getElementById('prompt-versions-list');
            list.innerHTML = '';
            vData.versions.forEach(v => {
                list.innerHTML += `
                    <div style="padding:0.75rem; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong>Prompt v${v.version}</strong> (${v.author}) - ${new Date(v.created_at).toLocaleDateString()}<br>
                            <span style="font-size:0.8rem; color:var(--text-muted);">${v.notes}</span>
                        </div>
                        <div style="display:flex; gap:0.35rem;">
                            <button class="btn btn-primary" style="padding:2px 8px; font-size:0.75rem;" onclick="restorePromptVersion(${v.version})">Restaurar</button>
                            <button class="btn btn-danger" style="padding:2px 8px; font-size:0.75rem;" onclick="deletePromptVersion(${v.id || v.version})">Apagar</button>
                        </div>
                    </div>
                `;
            });
        }
    }

    window.deletePromptVersion = async function(id) {
        if (confirm('Tem certeza que deseja apagar esta versão do prompt do histórico?')) {
            await fetch(`/api/prompts/versions/${id}`, { method: 'DELETE' });
            loadPrompts();
        }
    };

    document.getElementById('form-add-personality').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('p-name-input').value;
        const desc = document.getElementById('p-desc-input').value;
        const prompt = document.getElementById('p-prompt-input').value;

        await fetch('/api/personalities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description: desc, prompt })
        });
        loadPrompts();
    });

    window.activatePersonality = async function(id) {
        await fetch('/api/personalities/active', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        loadPrompts();
    };

    window.deletePersonality = async function(id) {
        await fetch(`/api/personalities/${id}`, { method: 'DELETE' });
        loadPrompts();
    };

    window.restorePromptVersion = async function(versionId) {
        await fetch('/api/prompts/versions/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ versionId })
        });
        loadPrompts();
    };

    // ─── CONTATOS ───
    async function loadContacts() {
        const res = await fetch('/api/contacts');
        const data = await res.json();
        if (data.success) {
            // 1. Render Blacklist Card (1:1 Deduplicated)
            const blockedContainer = document.getElementById('blocked-table-container');
            if (blockedContainer) {
                if (!data.blocked || data.blocked.length === 0) {
                    blockedContainer.innerHTML = '<div style="color:var(--text-muted); font-size:0.9rem; padding:0.5rem 0;">Nenhum contato na blacklist no momento.</div>';
                } else {
                    let bhtml = `<table class="data-table"><thead><tr><th>Nome</th><th>Número (Telefone)</th><th>Phone JID (@c.us)</th><th>LID JID (@lid)</th><th>Status</th><th>Ações</th></tr></thead><tbody>`;
                    data.blocked.forEach(b => {
                        const rawDigits = (b.phone_number || (b.phone_jid ? b.phone_jid.replace('@c.us', '') : (b.jid.includes('@c.us') ? b.jid.replace('@c.us', '') : ''))).replace(/\D/g, '');
                        const isRealPhone = rawDigits.length >= 10 && rawDigits.length <= 13 && !rawDigits.startsWith('2702');

                        const pNum = isRealPhone ? rawDigits : '---';
                        const pJid = b.phone_jid || (isRealPhone ? `${rawDigits}@c.us` : '---');
                        const lJid = b.lid_jid || (b.jid.includes('@lid') ? b.jid : (!isRealPhone && rawDigits.length >= 14 ? `${rawDigits}@lid` : '---'));

                        bhtml += `
                            <tr>
                                <td><strong style="color:#f87171;">🚫 ${b.name || b.jid}</strong></td>
                                <td><code style="color:#4ade80;">${pNum}</code></td>
                                <td><code>${pJid}</code></td>
                                <td><code style="color:#a78bfa;">${lJid}</code></td>
                                <td><span style="background:rgba(239,68,68,0.2); color:#f87171; padding:2px 8px; border-radius:4px; font-size:0.75rem;">Bloqueado</span></td>
                                <td>
                                    <button class="btn btn-primary" style="padding:4px 10px; font-size:0.8rem;" onclick="unblockContact('${b.jid}')">🔓 Desbloquear</button>
                                </td>
                            </tr>
                        `;
                    });
                    bhtml += `</tbody></table>`;
                    blockedContainer.innerHTML = bhtml;
                }
            }

            // 2. Render Active Contacts Table
            const container = document.getElementById('contacts-table-container');
            if (container) {
                let html = `<table class="data-table"><thead><tr><th>Nome</th><th>Número (Telefone)</th><th>Phone JID (@c.us)</th><th>LID JID (@lid)</th><th>Relação</th><th>Status</th><th>Ações</th></tr></thead><tbody>`;
                data.contacts.forEach(c => {
                    const isBlocked = Number(c.auto_reply) === 0 || c.relationship === 'Bloqueado';

                    const rawDigits = (c.phone_number || (c.phone_jid ? c.phone_jid.replace('@c.us', '') : (c.jid.includes('@c.us') ? c.jid.replace('@c.us', '') : ''))).replace(/\D/g, '');
                    const isRealPhone = rawDigits.length >= 10 && rawDigits.length <= 13 && !rawDigits.startsWith('2702');

                    const pNum = isRealPhone ? rawDigits : (c.phone_number || '---');
                    const pJid = c.phone_jid || (isRealPhone ? `${rawDigits}@c.us` : '---');
                    
                    let lJidHtml = '---';
                    if (c.lid_jid && c.lid_jid !== '---') {
                        lJidHtml = `<code style="color:#a78bfa;">${c.lid_jid}</code>`;
                    } else if (c.jid && c.jid.includes('@lid')) {
                        lJidHtml = `<code style="color:#a78bfa;">${c.jid}</code>`;
                    } else {
                        lJidHtml = `<button class="btn" style="padding:2px 7px; font-size:0.72rem; background:rgba(167,139,250,0.14); color:#a78bfa; border:1px solid rgba(167,139,250,0.3); border-radius:6px; cursor:pointer;" onclick="resolveLidForContact('${c.jid}', '${escapeJs(c.name)}')">🔍 Obter LID</button>`;
                    }

                    html += `
                        <tr>
                            <td><strong>${c.name}</strong> ${c.favorite ? '⭐' : ''}</td>
                            <td><code style="color:#4ade80;">${pNum}</code></td>
                            <td><code>${pJid}</code></td>
                            <td>${lJidHtml}</td>
                            <td>${c.relationship}</td>
                            <td>${isBlocked ? '<span style="color:#f87171;">🔴 Bloqueado</span>' : '<span style="color:#4ade80;">🟢 Ativo</span>'}</td>
                            <td style="display:flex; gap:0.35rem;">
                                <button class="btn btn-primary" style="padding:2px 6px; font-size:0.75rem;" onclick="editContact('${c.jid}', '${escapeJs(c.name)}', '${escapeJs(c.relationship)}', '${escapeJs(c.tags || '')}', '${escapeJs(c.lid_jid || '')}')">✏️ Editar</button>
                                ${isBlocked ? `<button class="btn btn-primary" style="padding:2px 6px; font-size:0.75rem;" onclick="unblockContact('${c.jid}')">Desbloquear</button>` : `<button class="btn btn-danger" style="padding:2px 6px; font-size:0.75rem;" onclick="blockContact('${c.jid}')">Bloquear</button>`}
                                <button class="btn btn-danger" style="padding:2px 6px; font-size:0.75rem;" onclick="deleteContact('${c.jid}')">Apagar</button>
                            </td>
                        </tr>
                    `;
                });
                html += `</tbody></table>`;
                container.innerHTML = html;
            }
        }
    }

    window.resolveLidForContact = async function(jid, name) {
        alert(`🔍 Solicitando ao WhatsApp o LID JID de ${name}...`);
        try {
            const res = await fetch('/api/contacts/resolve-lids', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetJid: jid })
            });
            const data = await res.json();
            if (data.success) {
                loadContacts();
            } else {
                alert('Não foi possível obter o LID deste contato no momento.');
            }
        } catch (e) {
            alert('Erro ao buscar LID.');
        }
    };

    document.getElementById('btn-sync-contacts').addEventListener('click', async () => {
        const btn = document.getElementById('btn-sync-contacts');
        btn.innerText = '⏳ Capturando LIDs & Sincronizando...';
        btn.disabled = true;
        try {
            const res = await fetch('/api/contacts/sync', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                alert(`✅ Sincronização concluída!\n\n${data.synced} contatos e LIDs foram mapeados da sua agenda com sucesso.`);
                loadContacts();
            } else {
                alert('Aguarde a conexão do WhatsApp para sincronizar.');
            }
        } catch (e) {
            alert('Erro ao sincronizar agenda.');
        } finally {
            btn.innerText = '🔄 Sincronizar Agenda do WhatsApp';
            btn.disabled = false;
        }
    });

    document.getElementById('form-save-contact').addEventListener('submit', async (e) => {
        e.preventDefault();
        const jid = document.getElementById('c-jid-input').value;
        const lidInput = document.getElementById('c-lid-input') ? document.getElementById('c-lid-input').value : '';
        const name = document.getElementById('c-name-input').value;
        const rel = document.getElementById('c-rel-input').value;
        const tags = document.getElementById('c-tags-input').value;

        await fetch('/api/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jid, lid_jid: lidInput, name, relationship: rel, tags })
        });
        document.getElementById('c-jid-input').value = '';
        if (document.getElementById('c-lid-input')) document.getElementById('c-lid-input').value = '';
        document.getElementById('c-name-input').value = '';
        loadContacts();
    });

    window.editContact = async function(jid, currentName, currentRel, currentTags, currentLid) {
        const newName = prompt('Editar Nome do Contato:', currentName);
        if (!newName) return;
        const newRel = prompt('Editar Relação (ex: Cliente, Amigo):', currentRel);
        const newTags = prompt('Editar Tags (ex: VIP, URGENTE):', currentTags);
        const newLid = prompt('Editar LID JID (@lid) [Deixe em branco se não souber]:', currentLid || '');

        await fetch('/api/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jid, lid_jid: newLid, name: newName, relationship: newRel, tags: newTags })
        });
        loadContacts();
    };

    window.blockContact = async function(jid) {
        try {
            await fetch('/api/contacts/block', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jidOrNumber: jid })
            });
        } catch (e) {}
        await loadContacts();
    };

    window.unblockContact = async function(jid) {
        try {
            await fetch('/api/contacts/unblock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jidOrNumber: jid })
            });
        } catch (e) {}
        await loadContacts();
    };

    window.deleteContact = async function(jid) {
        await fetch(`/api/contacts/${encodeURIComponent(jid)}`, { method: 'DELETE' });
        loadContacts();
    };

    // ─── MEMÓRIAS & PERFIL ───
    async function loadMemories() {
        const res = await fetch('/api/memories');
        const data = await res.json();
        if (data.success) {
            const list = document.getElementById('memories-list');
            list.innerHTML = '';
            data.memories.forEach(m => {
                list.innerHTML += `
                    <div style="padding:0.75rem; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <span style="background:rgba(59,130,246,0.2); color:var(--accent-blue); padding:2px 6px; border-radius:4px; font-size:0.75rem;">[${m.category}]</span><br>
                            <span style="font-size:0.9rem;">${m.fact}</span>
                        </div>
                        <div style="display:flex; gap:0.35rem;">
                            <button class="btn btn-primary" style="padding:2px 6px; font-size:0.75rem;" onclick="editMemory(${m.id}, '${escapeJs(m.category)}', '${escapeJs(m.fact)}')">✏️ Editar</button>
                            <button class="btn btn-danger" style="padding:2px 6px; font-size:0.75rem;" onclick="deleteMemory(${m.id})">Apagar</button>
                        </div>
                    </div>
                `;
            });

            const profContainer = document.getElementById('profile-table-container');
            let phtml = `<table class="data-table"><thead><tr><th>Campo</th><th>Valor</th><th>Ações</th></tr></thead><tbody>`;
            data.profile.forEach(p => {
                phtml += `
                    <tr>
                        <td><strong>${p.key}</strong></td>
                        <td>${p.value}</td>
                        <td style="display:flex; gap:0.35rem;">
                            <button class="btn btn-primary" style="padding:2px 6px; font-size:0.75rem;" onclick="editProfileKey('${p.key}', '${escapeJs(p.value)}')">✏️ Editar</button>
                            <button class="btn btn-danger" style="padding:2px 6px; font-size:0.75rem;" onclick="deleteProfileKey('${p.key}')">Apagar</button>
                        </td>
                    </tr>
                `;
            });
            phtml += `</tbody></table>`;
            profContainer.innerHTML = phtml;
        }
    }

    document.getElementById('form-add-memory').addEventListener('submit', async (e) => {
        e.preventDefault();
        const cat = document.getElementById('m-category-input').value;
        const fact = document.getElementById('m-fact-input').value;

        await fetch('/api/memories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: cat, fact })
        });
        document.getElementById('m-fact-input').value = '';
        loadMemories();
    });

    document.getElementById('form-save-profile').addEventListener('submit', async (e) => {
        e.preventDefault();
        const key = document.getElementById('prof-key-input').value;
        const val = document.getElementById('prof-val-input').value;

        await fetch('/api/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value: val })
        });
        document.getElementById('prof-key-input').value = '';
        document.getElementById('prof-val-input').value = '';
        loadMemories();
    });

    window.editMemory = async function(id, currentCat, currentFact) {
        const newCat = prompt('Editar Categoria da Memória:', currentCat);
        if (!newCat) return;
        const newFact = prompt('Editar Fato da Memória:', currentFact);
        if (!newFact) return;

        await fetch(`/api/memories/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: newCat, fact: newFact })
        });
        loadMemories();
    };

    window.editProfileKey = async function(key, currentValue) {
        const newVal = prompt(`Editar Valor do Campo (${key}):`, currentValue);
        if (!newVal) return;

        await fetch('/api/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value: newVal })
        });
        loadMemories();
    };

    window.deleteMemory = async function(id) {
        await fetch(`/api/memories/${id}`, { method: 'DELETE' });
        loadMemories();
    };

    window.deleteProfileKey = async function(key) {
        await fetch(`/api/profile/${encodeURIComponent(key)}`, { method: 'DELETE' });
        loadMemories();
    };

    // ─── AUTOMAÇÕES ───
    async function loadAutomations() {
        const res = await fetch('/api/automations');
        const data = await res.json();
        if (data.success) {
            const container = document.getElementById('automations-table-container');
            let html = `<table class="data-table"><thead><tr><th>Contato JID</th><th>Tipo</th><th>Horário</th><th>Mensagem</th><th>Status</th><th>Ações</th></tr></thead><tbody>`;
            data.automations.forEach(a => {
                html += `
                    <tr>
                        <td>${a.contact_jid}</td>
                        <td>${a.type}</td>
                        <td><strong>${a.time}</strong></td>
                        <td>${a.message_template}</td>
                        <td>${a.active ? '🟢 Ativo' : '🔴 Pausado'}</td>
                        <td style="display:flex; gap:0.35rem;">
                            <button class="btn ${a.active ? 'btn-danger' : 'btn-primary'}" style="padding:2px 6px; font-size:0.75rem;" onclick="toggleAutomation(${a.id}, ${!a.active})">${a.active ? 'Pausar' : 'Ativar'}</button>
                            <button class="btn btn-danger" style="padding:2px 6px; font-size:0.75rem;" onclick="deleteAutomation(${a.id})">Apagar</button>
                        </td>
                    </tr>
                `;
            });
            html += `</tbody></table>`;
            container.innerHTML = html;
        }
    }

    document.getElementById('form-add-automation').addEventListener('submit', async (e) => {
        e.preventDefault();
        const jid = document.getElementById('auto-jid-input').value;
        const type = document.getElementById('auto-type-input').value;
        const time = document.getElementById('auto-time-input').value;
        const tpl = document.getElementById('auto-tpl-input').value;

        await fetch('/api/automations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contact_jid: jid, type, time, message_template: tpl })
        });
        loadAutomations();
    });

    window.toggleAutomation = async function(id, active) {
        await fetch(`/api/automations/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active })
        });
        loadAutomations();
    };

    window.deleteAutomation = async function(id) {
        await fetch(`/api/automations/${id}`, { method: 'DELETE' });
        loadAutomations();
    };

    // ─── AUDITORIA ───
    async function loadAudit() {
        const res = await fetch('/api/audit');
        const data = await res.json();
        if (data.success) {
            const container = document.getElementById('audit-table-container');
            let html = `<table class="data-table"><thead><tr><th>Hora</th><th>Usuário</th><th>Ação</th><th>Detalhes</th></tr></thead><tbody>`;
            data.logs.forEach(l => {
                html += `<tr><td>${new Date(l.timestamp).toLocaleTimeString('pt-BR')}</td><td>${l.user}</td><td>${l.action}</td><td>${l.details}</td></tr>`;
            });
            html += `</tbody></table>`;
            container.innerHTML = html;
        }
    }

    function escapeJs(str) {
        if (!str) return '';
        return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
    }

    // ─── KILL SWITCH ───
    document.getElementById('btn-killswitch').addEventListener('click', async () => {
        if (confirm('Tem certeza que deseja encerrar o servidor Node.js agora?')) {
            await fetch('/api/system/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'kill' })
            });
            alert('Servidor desligado.');
        }
    });

    loadDashboard();
});
