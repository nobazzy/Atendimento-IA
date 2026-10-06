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

    // ─── GERENCIAMENTO DE TEMA (CINZA SUAVE / MODO NOTURNO) ───
    const themeBtn = document.getElementById('btn-theme-toggle');
    const themeIcon = document.getElementById('theme-toggle-icon');
    const themeLabel = document.getElementById('theme-toggle-label');

    function applyTheme(isDark) {
        if (isDark) {
            document.body.classList.add('dark-mode');
            document.documentElement.setAttribute('data-theme', 'dark');
            if (themeLabel) themeLabel.innerText = 'Modo Cinza';
            if (themeIcon) themeIcon.setAttribute('data-lucide', 'sun');
            localStorage.setItem('theme-preference', 'dark');
        } else {
            document.body.classList.remove('dark-mode');
            document.documentElement.removeAttribute('data-theme');
            if (themeLabel) themeLabel.innerText = 'Modo Escuro';
            if (themeIcon) themeIcon.setAttribute('data-lucide', 'moon');
            localStorage.setItem('theme-preference', 'gray');
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    const savedTheme = localStorage.getItem('theme-preference');
    if (savedTheme === 'dark') {
        applyTheme(true);
    }

    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const isDarkNow = document.body.classList.contains('dark-mode');
            applyTheme(!isDarkNow);
        });
    }

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
                const labelText = btn.textContent.replace(/\s+/g, ' ').trim();
                breadcrumbLabel.innerText = labelText || 'Dashboard Executivo';
            }

            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }

            if (targetTab === 'tab-dashboard') loadDashboard();
            if (targetTab === 'tab-noc') loadNoc();
            if (targetTab === 'tab-chats') loadChats();
            if (targetTab === 'tab-rag') loadRag();
            if (targetTab === 'tab-marketplace') loadMarketplace();
            if (targetTab === 'tab-training') loadTraining();
            if (targetTab === 'tab-contacts') loadContacts();
            if (targetTab === 'tab-memories') loadMemories();
            if (targetTab === 'tab-automations') loadAutomations();
            if (targetTab === 'tab-audit') loadAudit();
            if (targetTab === 'tab-settings') loadSettings();
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

                        // Atualizar widget lateral estilo CastroDrive
                        const provSide = document.getElementById('sidebar-provider-label');
                        if (provSide) provSide.innerText = s.provider.toUpperCase();
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
                                        <td><code style="color:var(--text-muted); font-size:0.78rem;">${new Date(l.timestamp).toLocaleTimeString('pt-BR')}</code></td>
                                        <td><strong style="color:var(--brand-blue); font-size:0.84rem;">${l.action}</strong></td>
                                        <td style="color:var(--text-secondary); font-size:0.84rem;">${l.details}</td>
                                    </tr>
                                `;
                            });
                            liveBody.innerHTML = lhtml || '<tr><td colspan="3" style="color:var(--text-muted); text-align:center; padding:1.25rem;">Nenhum evento registrado ainda.</td></tr>';
                        }
                    }
                } catch(e) {}
                
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        } catch (e) {}
    }

    // ─── NOC REAL-TIME MONITOR ───
    async function loadNoc() {
        try {
            const res = await fetch('/api/noc/status');
            const data = await res.json();
            if (data.success) {
                if (document.getElementById('noc-llm-details')) {
                    document.getElementById('noc-llm-details').innerText = `Latência Média: ${data.noc.llmStats.lastLatencyMs}ms | Provedor: ${data.noc.llmStats.provider}`;
                }
                checkWhatsAppStatus();
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
                                <h3 style="font-size:1.05rem; font-weight:700; color:var(--text-primary); margin-bottom:0.25rem;">${t.title}</h3>
                                <div class="badge-tag badge-blue" style="margin-bottom:0.75rem;">${t.niche}</div>
                                <p style="font-size:0.84rem; color:var(--text-muted); margin-bottom:1.25rem; line-height:1.45;">${t.description}</p>
                            </div>
                            <button class="btn btn-primary" style="width:100%;" onclick="applyTemplate('${t.id}')">
                                Aplicar Template
                            </button>
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

    // ─── RAG KNOWLEDGE BASE (MULTIFORMATO: EXCEL, PDF, WORD, TXT) ───
    window.switchRagMode = function(mode) {
        const uploadBtn = document.getElementById('rag-tab-upload-btn');
        const manualBtn = document.getElementById('rag-tab-manual-btn');
        const uploadPanel = document.getElementById('rag-upload-panel');
        const manualPanel = document.getElementById('rag-manual-panel');

        if (mode === 'upload') {
            if (uploadBtn) uploadBtn.classList.add('active');
            if (manualBtn) manualBtn.classList.remove('active');
            if (uploadPanel) uploadPanel.style.display = 'block';
            if (manualPanel) manualPanel.style.display = 'none';
        } else {
            if (uploadBtn) uploadBtn.classList.remove('active');
            if (manualBtn) manualBtn.classList.add('active');
            if (uploadPanel) uploadPanel.style.display = 'none';
            if (manualPanel) manualPanel.style.display = 'block';
        }
    };

    function getFormatBadge(type, filename) {
        const t = (type || '').toLowerCase();
        const ext = (filename || '').split('.').pop().toLowerCase();
        if (t === 'xlsx' || ext === 'xlsx') return '<span class="file-badge badge-xlsx"><i data-lucide="file-spreadsheet" style="width:11px;height:11px;"></i> XLSX</span>';
        if (t === 'xls' || ext === 'xls') return '<span class="file-badge badge-xls"><i data-lucide="file-spreadsheet" style="width:11px;height:11px;"></i> XLS</span>';
        if (t === 'csv' || ext === 'csv') return '<span class="file-badge badge-csv"><i data-lucide="table" style="width:11px;height:11px;"></i> CSV</span>';
        if (t === 'pdf' || ext === 'pdf') return '<span class="file-badge badge-pdf"><i data-lucide="file-text" style="width:11px;height:11px;"></i> PDF</span>';
        if (t === 'docx' || ext === 'docx' || t === 'doc' || ext === 'doc') return '<span class="file-badge badge-docx"><i data-lucide="file" style="width:11px;height:11px;"></i> DOCX</span>';
        return '<span class="file-badge badge-txt"><i data-lucide="file-text" style="width:11px;height:11px;"></i> TXT</span>';
    }

    function formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function escapeQuotes(str) {
        if (!str) return '';
        return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
    }

    window.appendRagKeyword = function(targetInputId, keywordsToAdd) {
        const inp = document.getElementById(targetInputId);
        if (!inp) return;
        const current = (inp.value || '').trim();
        if (!current) {
            inp.value = keywordsToAdd;
        } else {
            const currentList = current.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
            const toAddList = keywordsToAdd.split(',').map(s => s.trim()).filter(Boolean);
            const newWords = toAddList.filter(w => !currentList.includes(w.toLowerCase()));
            if (newWords.length > 0) {
                inp.value = current + ', ' + newWords.join(', ');
            }
        }
        inp.focus();
    };

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async function loadRag() {
        try {
            const res = await fetch('/api/rag/docs');
            const data = await res.json();
            if (data.success) {
                const list = document.getElementById('rag-docs-list');
                const totalDocsEl = document.getElementById('rag-total-docs-count');
                const totalChunksEl = document.getElementById('rag-total-chunks-count');
                
                const docs = data.docs || [];
                const totalChunks = docs.reduce((acc, d) => acc + (d.chunk_count || 0), 0);
                if (totalDocsEl) totalDocsEl.textContent = docs.length;
                if (totalChunksEl) totalChunksEl.textContent = totalChunks;

                if (!list) return;
                list.innerHTML = '';

                if (docs.length === 0) {
                    list.innerHTML = `
                        <div style="color:var(--text-muted); font-size:0.84rem; padding:2.5rem 1rem; text-align:center;">
                            <i data-lucide="folder-open" style="width:36px;height:36px;margin:0 auto 0.75rem auto;opacity:0.4;display:block;"></i>
                            Nenhum arquivo ou documento indexado.<br>
                            <span style="font-size:0.76rem;">Faça upload de planilhas Excel ou documentos ao lado.</span>
                        </div>
                    `;
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                    return;
                }

                docs.forEach(d => {
                    const badge = getFormatBadge(d.type, d.filename);
                    const sizeFormatted = d.file_size ? formatFileSize(d.file_size) : '';
                    const dateFormatted = d.created_at ? new Date(d.created_at).toLocaleDateString('pt-BR') : '';
                    const metaParts = [];
                    if (d.chunk_count) metaParts.push(`<strong>${d.chunk_count}</strong> blocos`);
                    if (sizeFormatted) metaParts.push(sizeFormatted);
                    if (dateFormatted) metaParts.push(dateFormatted);

                    let keywordsHtml = '';
                    if (d.keywords && d.keywords.trim()) {
                        const tags = d.keywords.split(',').map(t => t.trim()).filter(Boolean);
                        if (tags.length > 0) {
                            keywordsHtml = `
                                <div class="rag-keywords-container">
                                    ${tags.map(t => `<span class="rag-keyword-chip"><i data-lucide="tag" style="width:9px;height:9px;"></i> ${escapeHtml(t)}</span>`).join('')}
                                </div>
                            `;
                        }
                    }

                    const item = document.createElement('div');
                    item.className = 'rag-doc-item';
                    item.innerHTML = `
                        <div style="display:flex; align-items:flex-start; gap:0.75rem; min-width:0; flex:1;">
                            <div style="margin-top:0.2rem;">${badge}</div>
                            <div style="min-width:0; flex:1;">
                                <div style="font-weight:600; font-size:0.86rem; color:var(--text-primary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${escapeHtml(d.title)}">
                                    ${escapeHtml(d.title)}
                                </div>
                                <div class="rag-doc-meta">
                                    ${metaParts.join(' • ')}
                                </div>
                                ${keywordsHtml}
                            </div>
                        </div>
                        <div class="rag-doc-actions">
                            <button type="button" class="btn btn-secondary btn-sm" onclick="openEditRagKeywords(${d.id}, '${escapeQuotes(d.title)}', '${escapeQuotes(d.keywords || '')}')" title="Editar Palavras-Gatilho" style="padding:0.35rem 0.6rem;">
                                <i data-lucide="tag" style="width:13px;height:13px;"></i>
                            </button>
                            <button type="button" class="btn btn-secondary btn-sm" onclick="previewRagDoc(${d.id})" title="Visualizar Blocos Indexados" style="padding:0.35rem 0.6rem;">
                                <i data-lucide="eye" style="width:13px;height:13px;"></i>
                            </button>
                            <button type="button" class="btn btn-danger btn-sm" onclick="deleteRagDoc(${d.id})" title="Excluir Documento" style="padding:0.35rem 0.6rem;">
                                <i data-lucide="trash-2" style="width:13px;height:13px;"></i>
                            </button>
                        </div>
                    `;
                    list.appendChild(item);
                });

                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        } catch (e) {
            console.error('Erro ao carregar RAG:', e);
        }
    }

    // Upload de Arquivos (Drag & Drop e Input File)
    const ragDropzone = document.getElementById('rag-dropzone');
    const ragFileInput = document.getElementById('rag-file-input');
    const ragUploadStatus = document.getElementById('rag-upload-status');

    async function uploadRagFiles(fileList) {
        if (!fileList || fileList.length === 0) return;
        
        if (ragUploadStatus) {
            ragUploadStatus.style.display = 'block';
            ragUploadStatus.innerHTML = `<span style="color:var(--brand-blue);"><i data-lucide="loader" style="width:13px;height:13px;animation:spin 1s linear infinite;display:inline-block;vertical-align:middle;"></i> Processando e indexando ${fileList.length} arquivo(s)...</span>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        const formData = new FormData();
        for (let i = 0; i < fileList.length; i++) {
            formData.append('files', fileList[i]);
        }

        const fileKeywords = (document.getElementById('rag-file-keywords')?.value || '').trim();
        if (fileKeywords) {
            formData.append('keywords', fileKeywords);
        }

        try {
            const res = await fetch('/api/rag/upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                const uploadedDocs = data.docs || data.results || [];
                const totalChunks = uploadedDocs.reduce((acc, r) => acc + (r.chunk_count || r.chunkCount || 0), 0);
                if (ragUploadStatus) {
                    ragUploadStatus.innerHTML = `<span style="color:var(--brand-emerald-text);"><i data-lucide="check-circle" style="width:13px;height:13px;display:inline-block;vertical-align:middle;"></i> ✅ Sucesso! ${uploadedDocs.length} arquivo(s) indexado(s) com ${totalChunks} blocos de conhecimento gerados.</span>`;
                    setTimeout(() => { if (ragUploadStatus) ragUploadStatus.style.display = 'none'; }, 5000);
                }
                const kwInp = document.getElementById('rag-file-keywords');
                if (kwInp) kwInp.value = '';
                loadRag();
            } else {
                if (ragUploadStatus) {
                    ragUploadStatus.innerHTML = `<span style="color:var(--brand-rose-text);">❌ Erro no upload: ${escapeHtml(data.error || 'Falha ao processar arquivo')}</span>`;
                }
            }
        } catch (err) {
            if (ragUploadStatus) {
                ragUploadStatus.innerHTML = `<span style="color:var(--brand-rose-text);">❌ Falha de rede ao enviar arquivo: ${escapeHtml(err.message)}</span>`;
            }
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    if (ragDropzone) {
        ['dragenter', 'dragover'].forEach(eventName => {
            ragDropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                ragDropzone.classList.add('dragover');
            });
        });
        ['dragleave', 'drop'].forEach(eventName => {
            ragDropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                ragDropzone.classList.remove('dragover');
            });
        });
        ragDropzone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            if (dt && dt.files && dt.files.length > 0) {
                uploadRagFiles(dt.files);
            }
        });
    }

    if (ragFileInput) {
        ragFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                uploadRagFiles(e.target.files);
                e.target.value = '';
            }
        });
    }

    // Formulário de Texto Manual
    const formAddRagManual = document.getElementById('form-add-rag-manual');
    if (formAddRagManual) {
        formAddRagManual.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = (document.getElementById('rag-manual-title').value || '').trim();
            const content = (document.getElementById('rag-manual-content').value || '').trim();
            const keywords = (document.getElementById('rag-manual-keywords')?.value || '').trim();
            const btn = document.getElementById('btn-save-rag-manual');

            if (!title || !content) return;
            if (btn) btn.disabled = true;

            try {
                const res = await fetch('/api/rag/text', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, content, keywords })
                });
                const data = await res.json();
                if (data.success) {
                    document.getElementById('rag-manual-title').value = '';
                    document.getElementById('rag-manual-content').value = '';
                    const kwManual = document.getElementById('rag-manual-keywords');
                    if (kwManual) kwManual.value = '';
                    loadRag();
                    alert(`✅ Documento '${title}' indexado com sucesso! (${data.doc.chunk_count || data.doc.chunkCount} blocos gerados)`);
                } else {
                    alert('Erro ao indexar texto: ' + (data.error || 'Erro desconhecido'));
                }
            } catch (err) {
                alert('Falha ao conectar com o servidor: ' + err.message);
            } finally {
                if (btn) btn.disabled = false;
            }
        });
    }

    // Modal Editar Palavras-Gatilho RAG
    const modalRagEdit = document.getElementById('modal-rag-edit-keywords');
    const btnCloseRagEdit = document.getElementById('btn-close-rag-edit');
    const btnCancelRagEdit = document.getElementById('btn-cancel-rag-edit');
    const formEditRagKeywords = document.getElementById('form-edit-rag-keywords');

    function closeRagEditModal() {
        if (modalRagEdit) modalRagEdit.classList.remove('open');
    }

    if (btnCloseRagEdit) btnCloseRagEdit.addEventListener('click', closeRagEditModal);
    if (btnCancelRagEdit) btnCancelRagEdit.addEventListener('click', closeRagEditModal);
    if (modalRagEdit) {
        modalRagEdit.addEventListener('click', (e) => {
            if (e.target === modalRagEdit) closeRagEditModal();
        });
    }

    window.openEditRagKeywords = function(id, title, currentKeywords) {
        if (!modalRagEdit) return;
        const idInp = document.getElementById('rag-edit-doc-id');
        const titleEl = document.getElementById('rag-edit-doc-title');
        const keywordsInp = document.getElementById('rag-edit-keywords-input');

        if (idInp) idInp.value = id;
        if (titleEl) titleEl.textContent = `Gatilhos: ${title}`;
        if (keywordsInp) keywordsInp.value = currentKeywords || '';

        modalRagEdit.classList.add('open');
        if (keywordsInp) keywordsInp.focus();
    };

    if (formEditRagKeywords) {
        formEditRagKeywords.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('rag-edit-doc-id')?.value;
            const keywords = (document.getElementById('rag-edit-keywords-input')?.value || '').trim();
            const btnSave = document.getElementById('btn-save-rag-keywords');

            if (!id) return;
            if (btnSave) btnSave.disabled = true;

            try {
                const res = await fetch(`/api/rag/docs/${id}/keywords`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ keywords })
                });
                const data = await res.json();
                if (data.success) {
                    closeRagEditModal();
                    loadRag();
                } else {
                    alert('Erro ao salvar palavras-gatilho: ' + (data.error || 'Falha'));
                }
            } catch (err) {
                alert('Falha de rede ao salvar gatilhos: ' + err.message);
            } finally {
                if (btnSave) btnSave.disabled = false;
            }
        });
    }

    // Modal de Preview de Blocos RAG
    const modalRagPreview = document.getElementById('modal-rag-preview');
    const btnCloseRagPreview = document.getElementById('btn-close-rag-preview');

    function closeRagPreviewModal() {
        if (modalRagPreview) modalRagPreview.classList.remove('open');
    }

    if (btnCloseRagPreview) btnCloseRagPreview.addEventListener('click', closeRagPreviewModal);
    if (modalRagPreview) {
        modalRagPreview.addEventListener('click', (e) => {
            if (e.target === modalRagPreview) closeRagPreviewModal();
        });
    }

    window.previewRagDoc = async function(id) {
        if (!modalRagPreview) return;
        const titleEl = document.getElementById('rag-preview-title');
        const metaEl = document.getElementById('rag-preview-meta');
        const chunksEl = document.getElementById('rag-preview-chunks');

        if (titleEl) titleEl.textContent = 'Carregando blocos...';
        if (metaEl) metaEl.textContent = '';
        if (chunksEl) chunksEl.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted);">Buscando fragmentos...</div>';

        modalRagPreview.classList.add('open');

        try {
            const res = await fetch(`/api/rag/docs/${id}/preview`);
            const data = await res.json();
            if (data.success && data.doc) {
                const doc = data.doc;
                if (titleEl) titleEl.textContent = doc.title;
                if (metaEl) {
                    const sizeStr = doc.file_size ? ` • ${formatFileSize(doc.file_size)}` : '';
                    metaEl.textContent = `${doc.chunks.length} blocos indexados • Tipo: ${(doc.type || 'DOC').toUpperCase()}${sizeStr}`;
                }
                if (chunksEl) {
                    chunksEl.innerHTML = '';
                    if (doc.chunks.length === 0) {
                        chunksEl.innerHTML = '<div style="text-align:center; padding:1.5rem; color:var(--text-muted);">Nenhum bloco encontrado neste documento.</div>';
                    } else {
                        doc.chunks.forEach((c, idx) => {
                            const chunkCard = document.createElement('div');
                            chunkCard.className = 'rag-chunk-card';
                            chunkCard.innerHTML = `
                                <div class="rag-chunk-header">
                                    <span><strong>Bloco #${idx + 1}</strong> (${(c.content || '').length} caracteres)</span>
                                    <span style="font-size:0.72rem; color:var(--text-muted);">ID #${c.id}</span>
                                </div>
                                <div class="rag-chunk-content">${escapeHtml(c.content)}</div>
                            `;
                            chunksEl.appendChild(chunkCard);
                        });
                    }
                }
            } else {
                if (chunksEl) chunksEl.innerHTML = `<div style="color:var(--brand-rose-text); padding:1rem;">Erro ao carregar pré-visualização: ${escapeHtml(data.error || 'Não encontrado')}</div>`;
            }
        } catch (e) {
            if (chunksEl) chunksEl.innerHTML = `<div style="color:var(--brand-rose-text); padding:1rem;">Falha de rede: ${escapeHtml(e.message)}</div>`;
        }
    };

    window.deleteRagDoc = async function(id) {
        if (!confirm('Deseja realmente excluir este documento e todos os seus blocos indexados da IA?')) return;
        try {
            const res = await fetch(`/api/rag/docs/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                loadRag();
            } else {
                alert('Erro ao excluir documento: ' + (data.error || 'Erro desconhecido'));
            }
        } catch (e) {
            alert('Falha de rede ao excluir: ' + e.message);
        }
    };

    // Botão Recarregar
    const btnRefreshRag = document.getElementById('btn-refresh-rag-docs');
    if (btnRefreshRag) btnRefreshRag.addEventListener('click', () => loadRag());

    // Playground de Teste de Busca RAG
    const btnTestRagSearch = document.getElementById('btn-test-rag-search');
    const inputTestRagQuery = document.getElementById('rag-test-query');
    const ragSearchResults = document.getElementById('rag-search-results');

    async function executeRagTestSearch() {
        if (!inputTestRagQuery || !ragSearchResults) return;
        const q = inputTestRagQuery.value.trim();
        if (!q) {
            ragSearchResults.innerHTML = '<div style="text-align:center; color:var(--text-muted); font-size:0.82rem; padding:1.5rem 0;">Digite uma pergunta ou palavra-chave para testar a busca.</div>';
            return;
        }

        ragSearchResults.innerHTML = '<div style="text-align:center; color:var(--text-muted); font-size:0.82rem; padding:1.5rem 0;"><i data-lucide="loader" style="width:14px;height:14px;animation:spin 1s linear infinite;display:inline-block;vertical-align:middle;"></i> Calculando relevância e recuperando blocos...</div>';
        if (typeof lucide !== 'undefined') lucide.createIcons();

        try {
            const res = await fetch('/api/rag/test-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: q, limit: 5 })
            });
            const data = await res.json();
            if (data.success) {
                const chunks = data.chunks || [];
                if (chunks.length === 0) {
                    ragSearchResults.innerHTML = `
                        <div style="text-align:center; color:var(--text-muted); font-size:0.82rem; padding:1.5rem 0;">
                            ⚠️ Nenhum bloco de conhecimento atingiu o limiar de relevância para a consulta: <em>"${escapeHtml(q)}"</em>.
                        </div>
                    `;
                    return;
                }

                ragSearchResults.innerHTML = `
                    <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:0.5rem;">
                        🎯 <strong>${chunks.length} bloco(s) recuperado(s)</strong> para a consulta <em>"${escapeHtml(q)}"</em>:
                    </div>
                `;

                chunks.forEach((c, idx) => {
                    const chunkEl = document.createElement('div');
                    chunkEl.className = 'rag-chunk-card';
                    chunkEl.style.marginBottom = '0.5rem';
                    chunkEl.innerHTML = `
                        <div class="rag-chunk-header">
                            <span>
                                <span class="rag-score-badge">Relevância: ${c.score}</span>
                                <strong style="margin-left:0.4rem; color:var(--text-primary);">${escapeHtml(c.doc_title)}</strong>
                            </span>
                            <span style="font-size:0.72rem; color:var(--text-muted);">Bloco #${idx + 1}</span>
                        </div>
                        <div class="rag-chunk-content" style="max-height:100px;">${escapeHtml(c.content)}</div>
                    `;
                    ragSearchResults.appendChild(chunkEl);
                });
            } else {
                ragSearchResults.innerHTML = `<div style="color:var(--brand-rose-text); font-size:0.82rem; padding:1rem 0;">Erro: ${escapeHtml(data.error || 'Falha na busca')}</div>`;
            }
        } catch (err) {
            ragSearchResults.innerHTML = `<div style="color:var(--brand-rose-text); font-size:0.82rem; padding:1rem 0;">Falha de conexão: ${escapeHtml(err.message)}</div>`;
        }
    }

    if (btnTestRagSearch) btnTestRagSearch.addEventListener('click', executeRagTestSearch);
    if (inputTestRagQuery) {
        inputTestRagQuery.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                executeRagTestSearch();
            }
        });
    }

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
                if (data.type === 'chat' || data.type === 'ai' || data.type === 'system' || data.type === 'security') {
                    if (typeof loadChats === 'function') loadChats();
                    if (currentActiveChat && typeof selectChat === 'function') {
                        selectChat(currentActiveChat, currentActiveChat);
                    }
                    if (typeof loadDashboard === 'function') loadDashboard();
                    if (typeof checkWhatsAppStatus === 'function') checkWhatsAppStatus();
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
                if (!data.chats || data.chats.length === 0) {
                    container.innerHTML = '<div style="color:var(--text-muted); font-size:0.82rem; padding:1rem; text-align:center;">Nenhuma conversa iniciada ainda.</div>';
                    return;
                }
                data.chats.forEach(c => {
                    const titleStr = c.display_name || c.name || c.chat_id;
                    const isActive = currentActiveChat === c.chat_id;
                    container.innerHTML += `
                        <div class="chat-item ${isActive ? 'active' : ''}" onclick="selectChat('${c.chat_id}', '${escapeJs(titleStr)}')">
                            <div style="font-weight:600; color:var(--text-primary); font-size:0.86rem; display:flex; justify-content:space-between; align-items:center;">
                                <span style="text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:200px;">${titleStr}</span>
                                ${c.manual_override ? '<span class="badge-tag badge-amber" style="font-size:0.65rem; padding:0.1rem 0.4rem;">Manual</span>' : ''}
                            </div>
                            <div style="font-size:0.76rem; color:var(--text-muted); text-overflow:ellipsis; overflow:hidden; white-space:nowrap; margin-top:0.25rem;">
                                ${c.last_message || 'Sem mensagens'}
                            </div>
                        </div>
                    `;
                });
            }
        } catch (e) {}
    }

    window.selectChat = async function(chatId, fallbackName) {
        currentActiveChat = chatId;
        document.getElementById('active-chat-title').innerText = fallbackName || chatId;
        
        // Atualizar estado ativo na lista
        document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
        
        try {
            const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/messages`);
            const data = await res.json();
            if (data.success) {
                if (data.chat_info && data.chat_info.display) {
                    document.getElementById('active-chat-title').innerText = data.chat_info.display;
                }

                const container = document.getElementById('chat-messages-container');
                container.innerHTML = '';
                if (!data.messages || data.messages.length === 0) {
                    container.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem; text-align:center; margin-top:2rem;">Nenhuma mensagem registrada nesta conversa.</div>';
                } else {
                    data.messages.forEach(m => {
                        const isBot = m.sender === 'assistant';
                        const timeStr = m.timestamp ? new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
                        container.innerHTML += `
                            <div style="margin-bottom:0.75rem; display:flex; justify-content: ${isBot ? 'flex-end' : 'flex-start'};">
                                <div class="chat-bubble ${isBot ? 'assistant' : 'user'}">
                                    <div style="white-space:pre-wrap; word-break:break-word;">${m.message}</div>
                                    <div style="font-size:0.65rem; color:${isBot ? 'rgba(255,255,255,0.75)' : 'var(--text-subtle)'}; text-align:right; margin-top:0.3rem;">
                                        ${timeStr}
                                    </div>
                                </div>
                            </div>
                        `;
                    });
                    container.scrollTop = container.scrollHeight;
                }

                const btnManual = document.getElementById('btn-toggle-manual');
                if (data.manual_override) {
                    btnManual.innerHTML = '<i data-lucide="bot" style="width:14px; height:14px;"></i> Devolver para a IA';
                    btnManual.className = 'btn btn-primary btn-sm';
                } else {
                    btnManual.innerHTML = '<i data-lucide="user-check" style="width:14px; height:14px;"></i> Assumir Manualmente';
                    btnManual.className = 'btn btn-danger btn-sm';
                }
                if (typeof lucide !== 'undefined') lucide.createIcons();
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
            if (!faqsData.faqs || faqsData.faqs.length === 0) {
                list.innerHTML = '<div style="color:var(--text-muted); font-size:0.84rem; padding:1rem; text-align:center;">Nenhuma FAQ cadastrada ainda.</div>';
            } else {
                faqsData.faqs.forEach(f => {
                    list.innerHTML += `
                        <div style="padding:0.75rem; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <strong style="color:var(--text-primary); font-size:0.86rem;">P: ${f.question}</strong><br>
                                <span style="color:var(--text-secondary); font-size:0.82rem; margin-top:0.2rem; display:block;">R: ${f.answer}</span>
                            </div>
                            <div style="display:flex; gap:0.35rem; flex-shrink:0;">
                                <button class="btn btn-secondary btn-sm" onclick="editFaq(${f.id}, '${escapeJs(f.question)}', '${escapeJs(f.answer)}')">Editar</button>
                                <button class="btn btn-danger btn-sm" onclick="deleteFaq(${f.id})">Apagar</button>
                            </div>
                        </div>
                    `;
                });
            }
        }

        const rulesRes = await fetch('/api/training/rules');
        const rulesData = await rulesRes.json();
        if (rulesData.success) {
            const list = document.getElementById('rules-list');
            list.innerHTML = '';
            if (!rulesData.rules || rulesData.rules.length === 0) {
                list.innerHTML = '<div style="color:var(--text-muted); font-size:0.84rem; padding:1rem; text-align:center;">Nenhuma regra rígida cadastrada ainda.</div>';
            } else {
                rulesData.rules.forEach(r => {
                    list.innerHTML += `
                        <div style="padding:0.75rem; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:0.84rem; color:var(--text-secondary);"><strong style="color:var(--brand-rose-text);">⚠️ Regra:</strong> ${r.rule}</span>
                            <div style="display:flex; gap:0.35rem; flex-shrink:0;">
                                <button class="btn btn-secondary btn-sm" onclick="editRule(${r.id}, '${escapeJs(r.rule)}')">Editar</button>
                                <button class="btn btn-danger btn-sm" onclick="deleteRule(${r.id})">Apagar</button>
                            </div>
                        </div>
                    `;
                });
            }
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
                <div style="background:var(--bg-primary); border:1px solid var(--border-color); padding:1rem; border-radius:10px;">
                    <strong style="color:var(--text-primary); font-size:0.86rem;">Resposta Gerada:</strong>
                    <div style="white-space:pre-wrap; margin-top:0.5rem; color:var(--text-secondary); font-size:0.85rem; line-height:1.5;">${data.reply}</div>
                    <div style="margin-top:1rem; padding-top:0.75rem; border-top:1px solid var(--border-color); font-size:0.76rem; color:var(--text-muted); display:flex; gap:0.75rem; flex-wrap:wrap;">
                        <span>⏱️ <strong>${data.latencyMs}ms</strong></span>
                        <span>🤖 <strong>${data.model}</strong></span>
                        <span>📊 <strong>${data.tokens} tokens</strong></span>
                        <span>💰 <strong>${data.costBrl}</strong></span>
                    </div>
                </div>
            `;
        }
    });



    // ─── CONTATOS ───
    async function loadContacts() {
        const res = await fetch('/api/contacts');
        const data = await res.json();
        if (data.success) {
            // 1. Render Blacklist Card (1:1 Deduplicated)
            const blockedContainer = document.getElementById('blocked-table-container');
            if (blockedContainer) {
                if (!data.blocked || data.blocked.length === 0) {
                    blockedContainer.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem; padding:1rem; text-align:center;">Nenhum contato na blacklist no momento.</div>';
                } else {
                    let bhtml = `<table class="data-table"><thead><tr><th>Nome</th><th>Telefone</th><th>Phone JID</th><th>LID JID</th><th>Status</th><th style="text-align: right;">Ações</th></tr></thead><tbody>`;
                    data.blocked.forEach(b => {
                        const rawDigits = (b.phone_number || (b.phone_jid ? b.phone_jid.replace('@c.us', '') : (b.jid.includes('@c.us') ? b.jid.replace('@c.us', '') : ''))).replace(/\D/g, '');
                        const isRealPhone = rawDigits.length >= 10 && rawDigits.length <= 13 && !rawDigits.startsWith('2702');

                        const pNum = isRealPhone ? rawDigits : '---';
                        const pJid = b.phone_jid || (isRealPhone ? `${rawDigits}@c.us` : '---');
                        const lJid = b.lid_jid || (b.jid.includes('@lid') ? b.jid : (!isRealPhone && rawDigits.length >= 14 ? `${rawDigits}@lid` : '---'));

                        bhtml += `
                            <tr>
                                <td><strong style="color:var(--brand-rose-text);">${b.name || b.jid}</strong></td>
                                <td><code style="color:var(--brand-blue);">${pNum}</code></td>
                                <td><code>${pJid}</code></td>
                                <td><code style="color:var(--brand-purple);">${lJid}</code></td>
                                <td><span class="badge-tag badge-rose">Bloqueado</span></td>
                                <td style="text-align: right; white-space: nowrap; vertical-align: middle;">
                                    <button class="btn btn-secondary btn-sm" onclick="unblockContact('${b.jid}')">Desbloquear</button>
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
                let html = `<table class="data-table"><thead><tr><th>Nome</th><th>Telefone</th><th>Phone JID</th><th>LID JID</th><th>Relação</th><th>Status</th><th style="text-align: right;">Ações</th></tr></thead><tbody>`;
                data.contacts.forEach(c => {
                    const isBlocked = Number(c.auto_reply) === 0 || c.relationship === 'Bloqueado';

                    const rawDigits = (c.phone_number || (c.phone_jid ? c.phone_jid.replace('@c.us', '') : (c.jid.includes('@c.us') ? c.jid.replace('@c.us', '') : ''))).replace(/\D/g, '');
                    const isRealPhone = rawDigits.length >= 10 && rawDigits.length <= 13 && !rawDigits.startsWith('2702');

                    const pNum = isRealPhone ? rawDigits : (c.phone_number || '---');
                    const pJid = c.phone_jid || (isRealPhone ? `${rawDigits}@c.us` : '---');
                    
                    let lJidHtml = '---';
                    if (c.lid_jid && c.lid_jid !== '---') {
                        lJidHtml = `<code style="color:var(--brand-purple);">${c.lid_jid}</code>`;
                    } else if (c.jid && c.jid.includes('@lid')) {
                        lJidHtml = `<code style="color:var(--brand-purple);">${c.jid}</code>`;
                    } else {
                        lJidHtml = `<button class="btn btn-secondary btn-sm" style="padding:2px 7px; font-size:0.72rem;" onclick="resolveLidForContact('${c.jid}', '${escapeJs(c.name)}')">Obter LID</button>`;
                    }

                    html += `
                        <tr>
                            <td><strong style="color:var(--text-primary);">${c.name}</strong> ${c.favorite ? '⭐' : ''}</td>
                            <td><code style="color:var(--brand-blue);">${pNum}</code></td>
                            <td><code>${pJid}</code></td>
                            <td>${lJidHtml}</td>
                            <td><span class="badge-tag badge-slate">${c.relationship || 'Contato'}</span></td>
                            <td>${isBlocked ? '<span class="badge-tag badge-rose">Bloqueado</span>' : '<span class="badge-tag badge-emerald">Ativo</span>'}</td>
                            <td style="text-align: right; white-space: nowrap; vertical-align: middle;">
                                <div style="display: inline-flex; gap: 0.35rem; justify-content: flex-end;">
                                    <button class="btn btn-secondary btn-sm" onclick="editContact('${c.jid}', '${escapeJs(c.name)}', '${escapeJs(c.relationship)}', '${escapeJs(c.tags || '')}', '${escapeJs(c.lid_jid || '')}')">Editar</button>
                                    ${isBlocked ? `<button class="btn btn-secondary btn-sm" onclick="unblockContact('${c.jid}')">Desbloquear</button>` : `<button class="btn btn-danger btn-sm" onclick="blockContact('${c.jid}')">Bloquear</button>`}
                                    <button class="btn btn-danger btn-sm" onclick="deleteContact('${c.jid}')">Apagar</button>
                                </div>
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
        try {
            const res = await fetch('/api/contacts/resolve-lids', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetJid: jid })
            });
            const data = await res.json();
            if (data.success && data.lidJid) {
                alert(`✅ LID obtido com sucesso!\n\n• Contato: ${name || data.name || jid}\n• LID: ${data.lidJid}\n• Telefone: ${data.phoneJid || jid}`);
                loadContacts();
            } else {
                alert(`Não foi possível obter o LID deste contato no momento.\nDetalhe: ${data.error || 'WhatsApp não retornou o LID'}`);
            }
        } catch (e) {
            alert('Erro ao buscar LID: ' + e.message);
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
            if (!data.memories || data.memories.length === 0) {
                list.innerHTML = '<div style="color:var(--text-muted); font-size:0.84rem; padding:1rem; text-align:center;">Nenhuma memória registrada ainda.</div>';
            } else {
                data.memories.forEach(m => {
                    list.innerHTML += `
                        <div style="padding:0.75rem; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <span class="badge-tag badge-blue" style="font-size:0.7rem;">${m.category}</span><br>
                                <span style="font-size:0.86rem; color:var(--text-primary); margin-top:0.25rem; display:block;">${m.fact}</span>
                            </div>
                            <div style="display:flex; gap:0.35rem; flex-shrink:0;">
                                <button class="btn btn-secondary btn-sm" onclick="editMemory(${m.id}, '${escapeJs(m.category)}', '${escapeJs(m.fact)}')">Editar</button>
                                <button class="btn btn-danger btn-sm" onclick="deleteMemory(${m.id})">Apagar</button>
                            </div>
                        </div>
                    `;
                });
            }

            const profContainer = document.getElementById('profile-table-container');
            if (!data.profile || data.profile.length === 0) {
                profContainer.innerHTML = '<div style="color:var(--text-muted); font-size:0.84rem; padding:1rem; text-align:center;">Nenhum metadado cadastrado ainda.</div>';
                return;
            }
            let phtml = `
                <div class="table-container">
                    <table class="data-table" style="table-layout: fixed; width: 100%;">
                        <thead>
                            <tr>
                                <th style="width: 25%;">Campo</th>
                                <th style="width: 55%;">Valor</th>
                                <th style="width: 20%; text-align: right;">Ações</th>
                            </tr>
                        </thead>
                        <tbody>`;
            data.profile.forEach(p => {
                phtml += `
                    <tr>
                        <td style="font-weight: 600; color: var(--text-primary); word-break: break-word; vertical-align: middle;">${p.key}</td>
                        <td style="color: var(--brand-blue); word-break: break-word; font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; vertical-align: middle;">${p.value}</td>
                        <td style="text-align: right; white-space: nowrap; vertical-align: middle;">
                            <div style="display: inline-flex; gap: 0.35rem; justify-content: flex-end;">
                                <button class="btn btn-secondary btn-sm" onclick="editProfileKey('${p.key}', '${escapeJs(p.value)}')">Editar</button>
                                <button class="btn btn-danger btn-sm" onclick="deleteProfileKey('${p.key}')">Apagar</button>
                            </div>
                        </td>
                    </tr>
                `;
            });
            phtml += `</tbody></table></div>`;
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
            if (!data.automations || data.automations.length === 0) {
                container.innerHTML = '<div style="color:var(--text-muted); font-size:0.84rem; padding:1rem; text-align:center;">Nenhum agendamento ativo no momento.</div>';
                return;
            }
            let html = `<table class="data-table"><thead><tr><th>Contato JID</th><th>Tipo</th><th>Horário</th><th>Mensagem</th><th>Status</th><th style="text-align: right;">Ações</th></tr></thead><tbody>`;
            data.automations.forEach(a => {
                html += `
                    <tr>
                        <td style="vertical-align: middle;"><code style="color:var(--brand-blue);">${a.contact_jid}</code></td>
                        <td style="vertical-align: middle;"><span class="badge-tag badge-slate">${a.type}</span></td>
                        <td style="vertical-align: middle;"><strong>${a.time}</strong></td>
                        <td style="vertical-align: middle; font-size:0.84rem;">${a.message_template}</td>
                        <td style="vertical-align: middle;">${a.active ? '<span class="badge-tag badge-emerald">Ativo</span>' : '<span class="badge-tag badge-rose">Pausado</span>'}</td>
                        <td style="text-align: right; white-space: nowrap; vertical-align: middle;">
                            <div style="display: inline-flex; gap: 0.35rem; justify-content: flex-end;">
                                <button class="btn ${a.active ? 'btn-secondary' : 'btn-primary'} btn-sm" onclick="toggleAutomation(${a.id}, ${!a.active})">${a.active ? 'Pausar' : 'Ativar'}</button>
                                <button class="btn btn-danger btn-sm" onclick="deleteAutomation(${a.id})">Apagar</button>
                            </div>
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
            if (!data.logs || data.logs.length === 0) {
                container.innerHTML = '<div style="color:var(--text-muted); font-size:0.84rem; padding:1rem; text-align:center;">Nenhum registro de auditoria encontrado.</div>';
                return;
            }
            let html = `<table class="data-table"><thead><tr><th>Hora</th><th>Usuário</th><th>Ação</th><th>Detalhes</th></tr></thead><tbody>`;
            data.logs.forEach(l => {
                html += `<tr><td><code style="color:var(--text-muted); font-size:0.78rem;">${new Date(l.timestamp).toLocaleTimeString('pt-BR')}</code></td><td><strong>${l.user}</strong></td><td><strong style="color:var(--brand-blue);">${l.action}</strong></td><td>${l.details}</td></tr>`;
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

    // ─── CONFIGURAÇÕES GERAIS & GESTÃO DE AGENTES ───
    let currentPersonalities = [];
    let activePersonalityId = 'cloud';

    const tempInput = document.getElementById('cfg-ai-temp');
    const tempValLabel = document.getElementById('cfg-temp-val');
    if (tempInput && tempValLabel) {
        tempInput.addEventListener('input', () => {
            tempValLabel.innerText = tempInput.value;
        });
    }

    const btnSaveTop = document.getElementById('btn-save-settings-top');
    if (btnSaveTop) {
        btnSaveTop.addEventListener('click', () => {
            const form = document.getElementById('form-settings');
            if (form) form.requestSubmit();
        });
    }

    // Modal Criar Novo Agente
    const modalAgent = document.getElementById('modal-create-agent');
    const btnOpenCreateAgent = document.getElementById('btn-open-create-agent');
    const btnCloseModalAgent = document.getElementById('btn-close-modal-agent');
    const btnCancelModalAgent = document.getElementById('btn-cancel-modal-agent');
    const formCreateAgent = document.getElementById('form-create-agent');

    function openAgentModal() {
        if (modalAgent) {
            modalAgent.classList.add('open');
            const nameInp = document.getElementById('new-agent-name');
            if (nameInp) nameInp.focus();
        }
    }
    function closeAgentModal() {
        if (modalAgent) {
            modalAgent.classList.remove('open');
            if (formCreateAgent) formCreateAgent.reset();
        }
    }

    if (btnOpenCreateAgent) btnOpenCreateAgent.addEventListener('click', openAgentModal);
    if (btnCloseModalAgent) btnCloseModalAgent.addEventListener('click', closeAgentModal);
    if (btnCancelModalAgent) btnCancelModalAgent.addEventListener('click', closeAgentModal);
    if (modalAgent) {
        modalAgent.addEventListener('click', (e) => {
            if (e.target === modalAgent) closeAgentModal();
        });
    }

    // Criação de Agente pelo Modal
    if (formCreateAgent) {
        formCreateAgent.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('new-agent-name').value.trim();
            const desc = document.getElementById('new-agent-desc').value.trim();
            const prompt = document.getElementById('new-agent-prompt').value.trim();
            const btnSubmit = document.getElementById('btn-submit-create-agent');

            if (btnSubmit) {
                btnSubmit.disabled = true;
                btnSubmit.innerHTML = '<i data-lucide="loader" style="width: 14px; height: 14px;"></i> Criando...';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }

            try {
                const res = await fetch('/api/personalities', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, description: desc, prompt })
                });
                const data = await res.json();
                if (data.success && data.personality) {
                    // Ativa automaticamente o novo agente criado
                    await fetch('/api/personalities/active', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: data.personality.id })
                    });
                    closeAgentModal();
                    await loadSettings();
                } else {
                    alert('Erro ao criar agente: ' + (data.error || 'Verifique os campos'));
                }
            } catch (err) {
                alert('Erro de conexão ao criar agente');
            } finally {
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.innerHTML = '<i data-lucide="check" style="width: 14px; height: 14px;"></i> Criar e Ativar Agente';
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }
            }
        });
    }

    // Seletor de Agente e Edição de Detalhes
    const selectAgent = document.getElementById('cfg-select-agent');
    const agentDescInput = document.getElementById('cfg-agent-desc');
    const agentPromptInput = document.getElementById('cfg-agent-prompt');
    const agentActiveBadge = document.getElementById('cfg-agent-active-badge');
    const btnSaveAgentDetails = document.getElementById('btn-save-agent-details');
    const btnDeleteAgent = document.getElementById('btn-delete-agent');
    const agentFeedback = document.getElementById('cfg-agent-feedback');

    function syncSelectedAgentUI(selectedId) {
        const found = currentPersonalities.find(p => p.id === selectedId);
        if (!found) return;

        if (agentDescInput) agentDescInput.value = found.description || '';
        if (agentPromptInput) agentPromptInput.value = found.prompt || '';

        const isActive = (found.id === activePersonalityId);
        if (agentActiveBadge) {
            if (isActive) {
                agentActiveBadge.className = 'badge-tag badge-emerald';
                agentActiveBadge.innerHTML = '<i data-lucide="check-circle" style="width: 11px; height: 11px;"></i> Ativo no WhatsApp';
            } else {
                agentActiveBadge.className = 'badge-tag badge-slate';
                agentActiveBadge.innerHTML = '<i data-lucide="circle" style="width: 11px; height: 11px;"></i> Inativo (Salve para ativar)';
            }
        }

        if (btnDeleteAgent) {
            btnDeleteAgent.disabled = (found.id === 'cloud');
            btnDeleteAgent.title = found.id === 'cloud' ? 'O agente padrão Cloud não pode ser excluído' : 'Excluir este agente customizado';
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    if (selectAgent) {
        selectAgent.addEventListener('change', () => {
            syncSelectedAgentUI(selectAgent.value);
        });
    }

    if (btnSaveAgentDetails) {
        btnSaveAgentDetails.addEventListener('click', async () => {
            const currentId = selectAgent ? selectAgent.value : '';
            if (!currentId) return;

            const found = currentPersonalities.find(p => p.id === currentId);
            const name = found ? found.name : currentId;
            const description = agentDescInput ? agentDescInput.value.trim() : '';
            const prompt = agentPromptInput ? agentPromptInput.value.trim() : '';

            btnSaveAgentDetails.disabled = true;
            btnSaveAgentDetails.innerHTML = '<i data-lucide="loader" style="width: 13px; height: 13px;"></i> Salvando...';
            if (typeof lucide !== 'undefined') lucide.createIcons();

            try {
                const res = await fetch(`/api/personalities/${currentId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, description, prompt })
                });
                const data = await res.json();
                if (data.success) {
                    if (found) {
                        found.description = description;
                        found.prompt = prompt;
                    }
                    if (agentFeedback) {
                        agentFeedback.style.display = 'block';
                        agentFeedback.style.color = 'var(--brand-emerald)';
                        agentFeedback.innerText = '✅ Alterações do agente salvas com sucesso!';
                        setTimeout(() => { agentFeedback.style.display = 'none'; }, 3000);
                    }
                }
            } catch (err) {
                if (agentFeedback) {
                    agentFeedback.style.display = 'block';
                    agentFeedback.style.color = 'var(--brand-rose)';
                    agentFeedback.innerText = '❌ Erro ao salvar alterações do agente';
                }
            } finally {
                btnSaveAgentDetails.disabled = false;
                btnSaveAgentDetails.innerHTML = '<i data-lucide="save" style="width: 13px; height: 13px;"></i> Salvar Alterações';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        });
    }

    if (btnDeleteAgent) {
        btnDeleteAgent.addEventListener('click', async () => {
            const currentId = selectAgent ? selectAgent.value : '';
            if (!currentId || currentId === 'cloud') {
                alert('O agente padrão do sistema não pode ser excluído.');
                return;
            }
            const found = currentPersonalities.find(p => p.id === currentId);
            const agentName = found ? found.name : currentId;

            if (confirm(`Deseja realmente excluir o agente "${agentName}"?`)) {
                try {
                    const res = await fetch(`/api/personalities/${currentId}`, { method: 'DELETE' });
                    const data = await res.json();
                    if (data.success) {
                        await loadSettings();
                    } else {
                        alert('Não foi possível excluir o agente.');
                    }
                } catch (err) {
                    alert('Erro de conexão ao excluir agente.');
                }
            }
        });
    }

    function syncHoursAndAbsenceUI() {
        const hoursEnabled = document.getElementById('cfg-hours-enabled');
        const hoursBadge = document.getElementById('cfg-hours-state-badge');
        const hoursNoticeOff = document.getElementById('cfg-hours-notice-off');
        const hoursBody = document.getElementById('cfg-hours-body');

        const isHoursOn = hoursEnabled ? hoursEnabled.checked : false;
        if (hoursBadge) {
            hoursBadge.className = isHoursOn ? 'badge-tag badge-emerald' : 'badge-tag badge-slate';
            hoursBadge.textContent = isHoursOn ? '🟢 Ativo' : '⚪ Desativado (24/7)';
        }
        if (hoursNoticeOff) {
            hoursNoticeOff.style.display = isHoursOn ? 'none' : 'flex';
        }
        if (hoursBody) {
            if (isHoursOn) {
                hoursBody.classList.remove('settings-disabled-body');
            } else {
                hoursBody.classList.add('settings-disabled-body');
            }
        }

        const absenceEnabled = document.getElementById('cfg-absence-enabled');
        const absenceBadge = document.getElementById('cfg-absence-state-badge');
        const absenceNoticeOff = document.getElementById('cfg-absence-notice-off');
        const absenceBody = document.getElementById('cfg-absence-body');

        const isAbsenceOn = absenceEnabled ? absenceEnabled.checked : false;
        if (absenceBadge) {
            absenceBadge.className = isAbsenceOn ? 'badge-tag badge-emerald' : 'badge-tag badge-slate';
            absenceBadge.textContent = isAbsenceOn ? '🟢 Ativo' : '⚪ Desativada';
        }
        if (absenceNoticeOff) {
            absenceNoticeOff.style.display = isAbsenceOn ? 'none' : 'flex';
        }
        if (absenceBody) {
            if (isAbsenceOn) {
                absenceBody.classList.remove('settings-disabled-body');
            } else {
                absenceBody.classList.add('settings-disabled-body');
            }
        }
    }

    // Listeners diretos para os switches de Horário e Ausência (feedback instantâneo)
    const hoursToggle = document.getElementById('cfg-hours-enabled');
    if (hoursToggle) {
        hoursToggle.addEventListener('change', () => {
            syncHoursAndAbsenceUI();
            const start = document.getElementById('cfg-hours-start')?.value || '08:00';
            const end = document.getElementById('cfg-hours-end')?.value || '18:00';
            const selectedDays = [];
            document.querySelectorAll('input[name="cfg-days"]:checked').forEach(cb => {
                selectedDays.push(parseInt(cb.value, 10));
            });
            updateLiveHoursStatus(hoursToggle.checked, start, end, selectedDays);
            // Salva automaticamente a alteração do switch
            const form = document.getElementById('form-settings');
            if (form) form.requestSubmit();
        });
    }

    const absenceToggle = document.getElementById('cfg-absence-enabled');
    if (absenceToggle) {
        absenceToggle.addEventListener('change', () => {
            syncHoursAndAbsenceUI();
            // Salva automaticamente a alteração do switch
            const form = document.getElementById('form-settings');
            if (form) form.requestSubmit();
        });
    }

    async function loadSettings() {
        try {
            const [setRes, perRes] = await Promise.all([
                fetch('/api/settings'),
                fetch('/api/personalities')
            ]);
            const data = await setRes.json();
            const perData = await perRes.json();

            if (!data.success) return;

            const cfg = data.settings || data || {};
            const company = cfg.company || {};
            const businessHours = cfg.businessHours || {};
            const absence = cfg.absence || {};
            const ai = cfg.ai || {};

            // Perfil da empresa
            const companyNameInput = document.getElementById('cfg-company-name');
            const companySegInput = document.getElementById('cfg-company-segment');
            if (companyNameInput) companyNameInput.value = company.name || '';
            if (companySegInput) companySegInput.value = company.segment || '';

            // Horário de atendimento
            const hoursEnabled = document.getElementById('cfg-hours-enabled');
            const hoursStart = document.getElementById('cfg-hours-start');
            const hoursEnd = document.getElementById('cfg-hours-end');
            if (hoursEnabled) hoursEnabled.checked = !!businessHours.enabled;
            if (hoursStart) hoursStart.value = businessHours.start || '08:00';
            if (hoursEnd) hoursEnd.value = businessHours.end || '18:00';

            // Dias da semana
            const activeDays = Array.isArray(businessHours.days) ? businessHours.days : [1, 2, 3, 4, 5];
            for (let d = 0; d <= 6; d++) {
                const dayEl = document.getElementById(`day-${d}`);
                if (dayEl) {
                    dayEl.checked = activeDays.includes(d);
                }
            }

            // Mensagem de ausência
            const absenceEnabled = document.getElementById('cfg-absence-enabled');
            const absenceMsgInput = document.getElementById('cfg-absence-message');
            if (absenceEnabled) absenceEnabled.checked = !!absence.enabled;
            if (absenceMsgInput) {
                absenceMsgInput.value = absence.message || 'Olá! No momento estamos fora do nosso horário de atendimento. Responderemos assim que retornarmos!';
            }

            // Sincroniza visual dos cards (badges e áreas esmaecidas se desativados)
            syncHoursAndAbsenceUI();

            // Status ao vivo
            updateLiveHoursStatus(businessHours.enabled, businessHours.start, businessHours.end, activeDays);

            // Parâmetros da IA
            const aiProvider = document.getElementById('cfg-ai-provider');
            const aiModel = document.getElementById('cfg-ai-model');
            const aiTemp = document.getElementById('cfg-ai-temp');
            const aiLimit = document.getElementById('cfg-ai-limit');

            if (aiProvider) aiProvider.value = (ai.provider || 'openai').toLowerCase();
            if (aiModel) aiModel.value = ai.model || 'gpt-4o-mini';
            if (aiTemp) {
                aiTemp.value = ai.temperature !== undefined ? ai.temperature : 0.7;
                if (tempValLabel) tempValLabel.innerText = aiTemp.value;
            }
            if (aiLimit) aiLimit.value = ai.history_limit || 10;
            const aiDebounce = document.getElementById('cfg-ai-debounce');
            if (aiDebounce) aiDebounce.value = ai.debounce_seconds !== undefined ? ai.debounce_seconds : 4.0;

            // Agentes & Personalidades
            if (perData && perData.success && Array.isArray(perData.personalities)) {
                currentPersonalities = perData.personalities;
                const activeFromDb = currentPersonalities.find(p => p.active);
                activePersonalityId = activeFromDb ? activeFromDb.id : (ai.personality || 'cloud');

                if (selectAgent) {
                    selectAgent.innerHTML = '';
                    currentPersonalities.forEach(p => {
                        const opt = document.createElement('option');
                        opt.value = p.id;
                        opt.textContent = `${p.name} ${p.active ? '★ (Ativo)' : ''}`;
                        if (p.id === activePersonalityId) opt.selected = true;
                        selectAgent.appendChild(opt);
                    });

                    syncSelectedAgentUI(selectAgent.value || activePersonalityId);
                }
            }

            checkWhatsAppStatus();
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } catch (err) {
            console.error('Erro ao carregar configurações:', err);
        }
    }

    function updateLiveHoursStatus(enabled, start, end, days) {
        const pill = document.getElementById('cfg-live-status-pill');
        if (!pill) return;

        if (!enabled) {
            pill.className = 'status-pill-indicator badge-slate';
            pill.innerHTML = '<i data-lucide="info" style="width: 12px; height: 12px;"></i> Controle Desativado (Modo 24/7)';
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        const now = new Date();
        const brazilTimeStr = now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
        const brDate = new Date(brazilTimeStr);
        const dayOfWeek = brDate.getDay();

        if (days && !days.includes(dayOfWeek)) {
            pill.className = 'status-pill-indicator badge-rose';
            pill.innerHTML = '<i data-lucide="moon" style="width: 12px; height: 12px;"></i> Fora do Expediente (Dia Fechado)';
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        const [startH, startM] = (start || '08:00').split(':').map(Number);
        const [endH, endM] = (end || '18:00').split(':').map(Number);
        const currentMinutes = brDate.getHours() * 60 + brDate.getMinutes();
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
            pill.className = 'status-pill-indicator badge-emerald';
            pill.innerHTML = '<i data-lucide="check-circle" style="width: 12px; height: 12px;"></i> Dentro do Expediente';
        } else {
            pill.className = 'status-pill-indicator badge-rose';
            pill.innerHTML = '<i data-lucide="moon" style="width: 12px; height: 12px;"></i> Fora do Expediente';
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    const formSettings = document.getElementById('form-settings');
    if (formSettings) {
        formSettings.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btnSave = document.getElementById('btn-save-settings');
            const feedback = document.getElementById('cfg-save-feedback');

            // Coleta dias selecionados
            const selectedDays = [];
            document.querySelectorAll('input[name="cfg-days"]:checked').forEach(cb => {
                selectedDays.push(parseInt(cb.value, 10));
            });

            const chosenAgentId = selectAgent ? selectAgent.value : activePersonalityId;

            const payload = {
                company: {
                    name: document.getElementById('cfg-company-name').value.trim(),
                    segment: document.getElementById('cfg-company-segment').value.trim()
                },
                businessHours: {
                    enabled: document.getElementById('cfg-hours-enabled').checked,
                    start: document.getElementById('cfg-hours-start').value.trim() || '08:00',
                    end: document.getElementById('cfg-hours-end').value.trim() || '18:00',
                    days: selectedDays
                },
                absence: {
                    enabled: document.getElementById('cfg-absence-enabled').checked,
                    message: document.getElementById('cfg-absence-message').value.trim()
                },
                ai: {
                    provider: document.getElementById('cfg-ai-provider').value,
                    model: document.getElementById('cfg-ai-model').value.trim(),
                    temperature: parseFloat(document.getElementById('cfg-ai-temp').value) || 0.7,
                    history_limit: parseInt(document.getElementById('cfg-ai-limit').value, 10) || 10,
                    debounce_seconds: parseFloat(document.getElementById('cfg-ai-debounce')?.value) || 4.0,
                    personality: chosenAgentId
                }
            };

            if (btnSave) {
                btnSave.disabled = true;
                btnSave.innerHTML = '<i data-lucide="loader" style="width: 16px; height: 16px;"></i> Salvando...';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }

            try {
                const res = await fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const resData = await res.json();

                if (resData.success) {
                    activePersonalityId = chosenAgentId;
                    if (feedback) {
                        feedback.style.display = 'inline';
                        feedback.style.color = 'var(--brand-emerald)';
                        feedback.innerText = '✅ Configurações e Agente salvos com sucesso!';
                        setTimeout(() => { feedback.style.display = 'none'; }, 4000);
                    }
                    syncHoursAndAbsenceUI();
                    updateLiveHoursStatus(payload.businessHours.enabled, payload.businessHours.start, payload.businessHours.end, payload.businessHours.days);
                    syncSelectedAgentUI(chosenAgentId);
                    // Atualiza a marcação no select
                    if (selectAgent) {
                        Array.from(selectAgent.options).forEach(opt => {
                            const isAct = (opt.value === chosenAgentId);
                            const rawText = opt.textContent.replace('★ (Ativo)', '').trim();
                            opt.textContent = `${rawText} ${isAct ? '★ (Ativo)' : ''}`;
                        });
                    }
                } else {
                    if (feedback) {
                        feedback.style.display = 'inline';
                        feedback.style.color = 'var(--brand-rose)';
                        feedback.innerText = `❌ Erro: ${resData.error || 'Falha ao salvar'}`;
                    }
                }
            } catch (err) {
                if (feedback) {
                    feedback.style.display = 'inline';
                    feedback.style.color = 'var(--brand-rose)';
                    feedback.innerText = `❌ Erro de conexão ao salvar`;
                }
            } finally {
                if (btnSave) {
                    btnSave.disabled = false;
                    btnSave.innerHTML = '<i data-lucide="save" style="width: 16px; height: 16px;"></i> Salvar Todas as Configurações';
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }
            }
        });
    }

    // ─── GESTÃO COMPLETA DE SESSÃO WHATSAPP & QR CODE ───
    let waPollTimer = null;
    let isDisconnectingWa = false;

    async function checkWhatsAppStatus(forceModal = false) {
        try {
            const res = await fetch('/api/whatsapp/status');
            const data = await res.json();
            if (!data.success) return;

            const isConnected = !!data.connected;
            const hasQr = !!data.qr;
            const number = data.number || 'Configurado no .env';
            const isHeadless = data.headless !== false;

            // 1. Atualizar Card no NOC (Dashboard)
            const nocBadge = document.getElementById('noc-wa-badge');
            const nocState = document.getElementById('noc-wa-state');
            const nocDetails = document.getElementById('noc-wa-details');
            const btnNocDisconnect = document.getElementById('btn-noc-disconnect-wa');
            const btnNocViewQr = document.getElementById('btn-noc-view-qr');

            if (nocBadge && nocState && nocDetails) {
                if (isConnected) {
                    nocBadge.className = 'badge-tag badge-emerald';
                    nocBadge.innerText = '🟢 Conectado';
                    nocState.innerText = 'Conectado';
                    nocState.style.color = 'var(--brand-emerald-text)';
                    nocDetails.innerText = `Sessão ativa em segundo plano (${number})`;
                    if (btnNocDisconnect) {
                        btnNocDisconnect.style.display = 'inline-flex';
                        btnNocDisconnect.disabled = false;
                        btnNocDisconnect.innerHTML = '<i data-lucide="log-out" style="width: 12px; height: 12px;"></i> Desconectar';
                    }
                    if (btnNocViewQr) btnNocViewQr.style.display = 'none';
                } else if (hasQr) {
                    nocBadge.className = 'badge-tag badge-amber';
                    nocBadge.innerText = '🟡 QR Pendente';
                    nocState.innerText = 'Aguardando Leitura';
                    nocState.style.color = 'var(--brand-amber)';
                    nocDetails.innerText = 'Escaneie o QR Code para conectar a sessão';
                    if (btnNocDisconnect) btnNocDisconnect.style.display = 'none';
                    if (btnNocViewQr) btnNocViewQr.style.display = 'inline-flex';
                } else {
                    nocBadge.className = 'badge-tag badge-rose';
                    nocBadge.innerText = '🔴 Desconectado';
                    nocState.innerText = 'Desconectado';
                    nocState.style.color = 'var(--brand-rose)';
                    nocDetails.innerText = isDisconnectingWa ? 'Desconectando sessão e limpando dados...' : 'Instância parada ou gerando novo QR Code...';
                    if (btnNocDisconnect) btnNocDisconnect.style.display = 'none';
                    if (btnNocViewQr) btnNocViewQr.style.display = 'inline-flex';
                }
            }

            // 2. Atualizar Card em Configurações Gerais
            const setBadge = document.getElementById('settings-wa-badge');
            const setMode = document.getElementById('settings-wa-mode');
            const setNumber = document.getElementById('settings-wa-number');
            const setStatusText = document.getElementById('settings-wa-status-text');
            const btnSetDisconnect = document.getElementById('btn-settings-disconnect-wa');
            const btnSetQr = document.getElementById('btn-settings-qr-wa');

            if (setBadge) {
                if (isConnected) {
                    setBadge.className = 'badge-tag badge-emerald';
                    setBadge.innerText = '🟢 Conectado';
                    if (setStatusText) {
                        setStatusText.innerText = 'Ativa e Pronta';
                        setStatusText.style.color = 'var(--brand-emerald-text)';
                    }
                    if (btnSetDisconnect) {
                        btnSetDisconnect.style.display = 'inline-flex';
                        btnSetDisconnect.disabled = false;
                        btnSetDisconnect.innerHTML = '<i data-lucide="log-out" style="width: 14px; height: 14px;"></i> Desconectar Sessão';
                    }
                    if (btnSetQr) btnSetQr.style.display = 'none';
                } else if (hasQr) {
                    setBadge.className = 'badge-tag badge-amber';
                    setBadge.innerText = '🟡 QR Code Pendente';
                    if (setStatusText) {
                        setStatusText.innerText = 'Aguardando Escanear QR';
                        setStatusText.style.color = 'var(--brand-amber)';
                    }
                    if (btnSetDisconnect) btnSetDisconnect.style.display = 'none';
                    if (btnSetQr) btnSetQr.style.display = 'inline-flex';
                } else {
                    setBadge.className = 'badge-tag badge-rose';
                    setBadge.innerText = '🔴 Desconectado';
                    if (setStatusText) {
                        setStatusText.innerText = isDisconnectingWa ? 'Encerrando sessão...' : 'Desconectado';
                        setStatusText.style.color = 'var(--brand-rose)';
                    }
                    if (btnSetDisconnect) btnSetDisconnect.style.display = 'none';
                    if (btnSetQr) btnSetQr.style.display = 'inline-flex';
                }
            }

            if (setMode) setMode.innerText = isHeadless ? 'Headless (Segundo Plano)' : 'Visível';
            if (setNumber) setNumber.innerText = isConnected ? number : 'Desconectado';

            // 3. Atualizar Pílula de Saúde no Topo
            const pillsContainer = document.getElementById('health-pills-container');
            if (pillsContainer) {
                const pills = pillsContainer.querySelectorAll('.pill');
                if (pills.length >= 2) {
                    const waDot = pills[1].querySelector('.status-dot');
                    if (waDot) {
                        waDot.className = `status-dot ${isConnected ? '' : 'red'}`;
                    }
                }
            }

            // 4. Modal QR Code
            const qrModal = document.getElementById('modal-whatsapp-qr');
            const qrImg = document.getElementById('wa-qr-img');
            const qrLoading = document.getElementById('wa-qr-loading');
            const qrStatusMsg = document.getElementById('wa-qr-status-msg');

            if (hasQr && qrImg && qrLoading) {
                qrImg.src = data.qr;
                qrImg.style.display = 'block';
                qrLoading.style.display = 'none';
                isDisconnectingWa = false;
            } else if (!hasQr && qrLoading && qrImg) {
                qrImg.style.display = 'none';
                qrLoading.style.display = 'flex';
                if (qrStatusMsg) {
                    qrStatusMsg.innerText = isConnected
                        ? 'WhatsApp já conectado!'
                        : (isDisconnectingWa ? 'Desconectando sessão do WhatsApp...' : 'Gerando novo QR Code no WhatsApp Web...');
                }
            }

            // Se conectou com sucesso e o modal estava aberto, fecha automaticamente
            if (isConnected && qrModal && qrModal.classList.contains('active')) {
                setTimeout(() => {
                    qrModal.classList.remove('active');
                    stopWaPolling();
                }, 1000);
            }

            if (forceModal && qrModal) {
                qrModal.classList.add('active');
            }

            if (typeof lucide !== 'undefined') lucide.createIcons();
        } catch (e) {}
    }

    async function handleWhatsAppDisconnect() {
        const confirmed = confirm('Deseja realmente desconectar a sessão do WhatsApp? O WhatsApp Web será desvinculado e você precisará escanear um novo QR Code.');
        if (!confirmed) return;

        isDisconnectingWa = true;

        const qrModal = document.getElementById('modal-whatsapp-qr');
        const qrImg = document.getElementById('wa-qr-img');
        const qrLoading = document.getElementById('wa-qr-loading');
        const qrStatusMsg = document.getElementById('wa-qr-status-msg');
        const btnNocDisconnect = document.getElementById('btn-noc-disconnect-wa');
        const btnSetDisconnect = document.getElementById('btn-settings-disconnect-wa');

        if (btnNocDisconnect) {
            btnNocDisconnect.disabled = true;
            btnNocDisconnect.innerHTML = '<i data-lucide="loader-2" class="spin" style="width:12px;height:12px;"></i> Desconectando...';
        }
        if (btnSetDisconnect) {
            btnSetDisconnect.disabled = true;
            btnSetDisconnect.innerHTML = '<i data-lucide="loader-2" class="spin" style="width:14px;height:14px;"></i> Desconectando...';
        }

        if (qrModal) qrModal.classList.add('active');
        if (qrImg) qrImg.style.display = 'none';
        if (qrLoading) {
            qrLoading.style.display = 'flex';
            if (qrStatusMsg) qrStatusMsg.innerText = 'Desconectando sessão e gerando novo QR Code...';
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();

        try {
            const res = await fetch('/api/whatsapp/disconnect', { method: 'POST' });
            const data = await res.json();
            console.log('Desconexão WhatsApp:', data);
        } catch (e) {
            console.error('Erro ao desconectar WhatsApp:', e);
        }

        startWaPolling(2000);
    }

    function openWhatsAppQrModal() {
        const qrModal = document.getElementById('modal-whatsapp-qr');
        if (qrModal) qrModal.classList.add('active');
        checkWhatsAppStatus();
        startWaPolling(2500);
    }

    function closeWhatsAppQrModal() {
        const qrModal = document.getElementById('modal-whatsapp-qr');
        if (qrModal) qrModal.classList.remove('active');
        stopWaPolling();
    }

    function startWaPolling(intervalMs = 3000) {
        stopWaPolling();
        waPollTimer = setInterval(() => {
            checkWhatsAppStatus();
        }, intervalMs);
    }

    function stopWaPolling() {
        if (waPollTimer) {
            clearInterval(waPollTimer);
            waPollTimer = null;
        }
    }

    // Binds de botões de WhatsApp
    const btnNocDisconnect = document.getElementById('btn-noc-disconnect-wa');
    if (btnNocDisconnect) btnNocDisconnect.addEventListener('click', handleWhatsAppDisconnect);

    const btnSetDisconnect = document.getElementById('btn-settings-disconnect-wa');
    if (btnSetDisconnect) btnSetDisconnect.addEventListener('click', handleWhatsAppDisconnect);

    const btnNocViewQr = document.getElementById('btn-noc-view-qr');
    if (btnNocViewQr) btnNocViewQr.addEventListener('click', openWhatsAppQrModal);

    const btnSetQr = document.getElementById('btn-settings-qr-wa');
    if (btnSetQr) btnSetQr.addEventListener('click', openWhatsAppQrModal);

    const btnCloseQr = document.getElementById('btn-close-wa-qr');
    if (btnCloseQr) btnCloseQr.addEventListener('click', closeWhatsAppQrModal);

    const btnDoneQr = document.getElementById('btn-done-wa-qr');
    if (btnDoneQr) btnDoneQr.addEventListener('click', closeWhatsAppQrModal);

    const qrModal = document.getElementById('modal-whatsapp-qr');
    if (qrModal) {
        qrModal.addEventListener('click', (e) => {
            if (e.target === qrModal) closeWhatsAppQrModal();
        });
    }

    const btnRefreshQr = document.getElementById('btn-refresh-wa-qr');
    if (btnRefreshQr) {
        btnRefreshQr.addEventListener('click', async () => {
            btnRefreshQr.disabled = true;
            btnRefreshQr.innerHTML = '<i data-lucide="loader-2" class="spin" style="width:13px;height:13px;"></i> Atualizando...';
            try {
                await fetch('/api/whatsapp/reconnect', { method: 'POST' });
            } catch(e) {}
            setTimeout(() => {
                btnRefreshQr.disabled = false;
                btnRefreshQr.innerHTML = '<i data-lucide="refresh-cw" style="width:13px;height:13px;"></i> Atualizar';
                if (typeof lucide !== 'undefined') lucide.createIcons();
                checkWhatsAppStatus();
            }, 1500);
        });
    }

    // Checagem periódica em segundo plano (a cada 15 segundos)
    setInterval(() => {
        checkWhatsAppStatus();
    }, 15000);

    // Checagem inicial
    checkWhatsAppStatus();

    loadDashboard();
});
