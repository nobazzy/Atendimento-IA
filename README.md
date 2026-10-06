# 🤖 Central de Atendimento WhatsApp com Inteligência Artificial Multiprovedor & RAG

<div align="center">

![Node.js Version](https://img.shields.io/badge/Node.js-v22.0.0%2B-339933?logo=node.js&logoColor=white)
![SQLite](https://img.shields.io/badge/Database-SQLite%20WAL%20(Native)-003B57?logo=sqlite&logoColor=white)
![Express](https://img.shields.io/badge/Backend-Express.js-000000?logo=express&logoColor=white)
![WhatsApp Web](https://img.shields.io/badge/Engine-whatsapp--web.js-25D366?logo=whatsapp&logoColor=white)
![AI Providers](https://img.shields.io/badge/IA-8%20Provedores%20Suportados-7928CA)
![License](https://img.shields.io/badge/License-ISC-blue.svg)

**Plataforma completa e profissional de automação e atendimento comercial para WhatsApp integrada a múltiplos provedores de Inteligência Artificial, motor RAG para documentos e planilhas, fila de envio resiliente e painel web administrativo.**

[Recursos](#-recursos-principais) • [Arquitetura](#-arquitetura-do-sistema) • [Instalação Rápida](#-instalação-rápida) • [Comandos WhatsApp](#-comandos-administrativos-no-whatsapp) • [Guia de Instalação](GUIA_DE_INSTALACAO.md) • [Manual de APIs](MANUAL_CONFIGURACAO_E_APIS.md)

</div>

---

## 📌 Visão Geral

Esta solução transforma uma conta comum ou WhatsApp Business em uma **Central de Atendimento Inteligente 24/7**, capaz de responder clientes com precisão humana, consultar tabelas de preços e manuais via **RAG**, respeitar horários comerciais, gerenciar contatos, isolar mensagens do proprietário e alternar entre provedores de IA líderes de mercado (OpenAI, Gemini, Claude, Groq, DeepSeek) ou modelos 100% locais e gratuitos (Ollama, LM Studio).

---

## 🚀 Recursos Principais

### 🧠 1. Inteligência Artificial Multiprovedor (8 Conexões)
- **Troca a Quente (Hot-Swap)**: Alterne o cérebro da IA no `.env` ou pelo painel web sem reiniciar a aplicação.
- **Provedores Nuvem**:
  - **OpenAI** (`gpt-4o-mini`, `gpt-4o`, `o3-mini`)
  - **Google Gemini** (`gemini-1.5-flash`, `gemini-1.5-pro`)
  - **Anthropic Claude** (`claude-3-5-sonnet-latest`, `claude-3-haiku`)
  - **Groq Cloud** (`llama-3.3-70b-versatile` — inferência ultra rápida)
  - **DeepSeek API** (`deepseek-chat`, `deepseek-reasoner`)
  - **Custom / OpenRouter** (Qualquer endpoint compatível com OpenAI)
- **Modelos Locais & Offline (Custo Zero)**:
  - **Ollama** (`qwen2.5:14b`, `llama3.2`, `mistral`)
  - **LM Studio** (qualquer GGUF local na porta `1234`)

### 📚 2. RAG Avançado (Base de Conhecimento com Busca Semântica)
- **Upload de Arquivos**: Carregue PDFs, planilhas Excel (`.xlsx`, `.xls`), documentos Word (`.docx`), CSV e arquivos de texto diretamente pelo painel web.
- **Indexação Inteligente & Chunking**: O sistema quebra os documentos em blocos e extrai palavras-chave, injetando no prompt da IA apenas as informações relevantes para a dúvida do cliente (preços, políticas, especificações).

### 🛡️ 3. Resiliência no WhatsApp & Anti-Ban
- **Fila Serial de Envio (Concurrency Guard)**: Envio ordenado com delays humanizados (2 a 5 segundos) e simulação de status de digitação (*typing...*).
- **Mapeamento 1:1 de LID e Telefone**: Resolução automática do identificador criptográfico `@lid` do WhatsApp para o número real (`@c.us`), evitando contatos duplicados.
- **Detecção do Administrador**: O bot detecta automaticamente mensagens do proprietário do número (`MY_NUMBER`), ignorando respostas no próprio chat e permitindo comandos secretos.
- **Blacklist Multicamadas**: Bloqueio de respostas automáticas por número, JID, LID ou nome.
- **Modo Intervenção Manual**: Pause e retome o atendimento automatizado a qualquer momento para assumir a conversa humana.

### 📊 4. Dashboard Web Moderno (Single Page Application)
- **Métricas em Tempo Real**: Total de contatos, mensagens processadas, tempo de resposta e consumo de tokens.
- **QR Code Web**: Escaneie o QR Code diretamente pela tela do navegador com auto-refresh.
- **Gestor de Personalidades & Prompts**: Crie e alterne agentes virtuais (ex: Cloud Tech Lead, Recepcionista Cordial, Especialista em Vendas).
- **Marketplace de Templates**: Prompts pré-configurados por nicho (Médico, Imobiliária, E-commerce, Advocacia, Pet Shop).
- **Logs de Auditoria & NOC Monitor**: Histórico de ações e status operacional de conexões.

### 💾 5. Banco de Dados Nativo SQLite (Zero Config)
- Utiliza o módulo nativo de alta performance `node:sqlite` do Node.js v22+.
- Modo **Write-Ahead Logging (WAL)** habilitado para suporte a múltiplas leituras e escritas concorrentes.
- **Criação e Migração Automática**: O banco de dados (`database.sqlite`) é gerado automaticamente na primeira execução, sem necessidade de instalar servidores SQL adicionais.

---

## 🏗️ Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                      WHATSAPP NETWORK                           │
└────────────────────────────────┬────────────────────────────────┘
                                 │ Webhook / Puppeteer
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NÚCLEO DO SISTEMA (Node.js)                   │
│                                                                 │
│  ┌───────────────────────┐             ┌─────────────────────┐  │
│  │  WhatsApp Client MD   │             │   Express REST API  │  │
│  │   (whatsapp-web.js)   │             │   & Static Server   │  │
│  └───────────┬───────────┘             └──────────┬──────────┘  │
│              │                                    │             │
│              ▼                                    ▼             │
│  ┌───────────────────────┐             ┌─────────────────────┐  │
│  │ Fila de Envio Serial  │             │   Dashboard Web     │  │
│  │  (Concurrency Guard)  │             │   (HTML5/CSS3/JS)   │  │
│  └───────────┬───────────┘             └─────────────────────┘  │
│              │                                                  │
│              ▼                                                  │
│  ┌───────────────────────┐             ┌─────────────────────┐  │
│  │  Motor de Prompt &    │◄───────────►│    Motor RAG        │  │
│  │    Contexto Dinâmico  │             │ (PDF/XLSX/Docx)     │  │
│  └───────────┬───────────┘             └─────────────────────┘  │
│              │                                    ▲             │
│              ▼                                    │             │
│  ┌───────────────────────┐             ┌──────────┴──────────┐  │
│  │  Provedor de IA Ativo │             │    SQLite WAL       │  │
│  │ (OpenAI/Gemini/Local) │             │ (node:sqlite)       │  │
│  └───────────────────────┘             └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Instalação Rápida

### Pré-requisitos
- **Node.js**: v22.0.0 ou superior ([Baixar Node.js](https://nodejs.org/))
- **Git**: Instalado no sistema

### 1. Clonar o Repositório
```bash
git clone https://github.com/nobazzy/Atendimento-IA.git
cd Atendimento-IA
```

### 2. Instalar as Dependências
```bash
npm install
```

### 3. Configurar as Variáveis de Ambiente
Copie o arquivo de exemplo `.env.example` para `.env`:
```bash
# Windows (PowerShell / CMD)
copy .env.example .env

# Linux / Mac
cp .env.example .env
```

Abra o arquivo `.env` e configure:
1. Seu número no WhatsApp em `MY_NUMBER` (ex: `5511999998888`).
2. O provedor de IA desejado em `ACTIVE_PROVIDER` (ex: `openai`, `gemini`, `groq` ou `ollama`).
3. A chave de API do provedor escolhido.

### 4. Iniciar a Aplicação
```bash
npm start
```
*Ou, no Windows, dê dois cliques em `iniciar_ia.bat`.*

Acesse o painel no navegador: **[http://localhost:3000](http://localhost:3000)** e escaneie o QR Code com seu WhatsApp!

---

## 📱 Comandos Administrativos no WhatsApp

O administrador pode enviar comandos diretamente no chat de qualquer pessoa ou no chat próprio ("Você"):

| Comando | Onde Executar | Descrição |
| :--- | :--- | :--- |
| `!admin` ou `!ia` | Chat Próprio | Exibe o menu completo de ajuda e comandos |
| `!admin perfil` | Chat Próprio | Visualiza as informações cadastrais salvas no SQLite |
| `!admin set <chave> <valor>` | Chat Próprio | Define uma informação permanente (ex: `!admin set cidade SP`) |
| `!admin memorias` | Chat Próprio | Lista fatos e memórias de longo prazo gravadas |
| `!admin nota <texto>` | Chat Próprio | Salva uma anotação rápida que a IA lembrará no futuro |
| `!admin contatos` | Chat Próprio | Lista a agenda de contatos mapeados |
| `!bloquear <número>` | Qualquer Chat | Adiciona número à Blacklist (IA não responde mais a ele) |
| `!bloquear` | Chat do Contato | Bloqueia silenciosamente a pessoa do chat atual |
| `!desbloquear <número>` | Qualquer Chat | Remove o número da Blacklist |
| `!desbloquear` | Chat do Contato | Desbloqueia silenciosamente a pessoa do chat atual |
| `!bloqueados` | Chat Próprio | Lista todos os números na Blacklist |
| `!pausar` | Qualquer Chat | Pausa globalmente todas as respostas automáticas |
| `!retomar` | Qualquer Chat | Reativa o atendimento automático global |
| `!status` | Chat Próprio | Mostra status da conexão, provedor ativo e telemetria |
| `!limpar` | Qualquer Chat | Apaga o histórico da conversa no banco de dados |
| `!admin rag` | Chat Próprio | Lista documentos e planilhas RAG indexados |
| `!admin templates` | Chat Próprio | Lista templates de personalidade disponíveis |

---

## 📁 Estrutura do Projeto

```
├── public/                     # Frontend do Painel Web Administrativo
│   ├── css/dashboard.css       # Estilos customizados e tema Dark Mode
│   ├── js/app.js               # Lógica da SPA (chamadas API, gráficos, modais)
│   ├── index.html              # Interface visual completa
│   ├── manifest.json           # Manifesto PWA
│   └── sw.js                   # Service Worker
├── src/
│   ├── api/
│   │   └── server.js           # Servidor Express & Rotas REST API
│   ├── config/
│   │   └── index.js            # Carregamento centralizado do .env
│   ├── core/
│   │   ├── llm/                # Conectores para os 8 provedores de IA
│   │   ├── scheduler/          # Agendador de tarefas e automações diárias
│   │   └── whatsapp/           # Motor whatsapp-web.js e fila serial
│   ├── database/
│   │   └── index.js            # Conexão SQLite, schemas e migrations
│   └── services/               # Camada de regras de negócio
│       ├── analytics.js        # Métricas de uso e telemetria
│       ├── audit.js            # Logs de auditoria do sistema
│       ├── automations.js      # Gerenciamento de envios automáticos
│       ├── backups.js          # Backups automáticos diários do SQLite
│       ├── companies.js        # Gestão multi-tenant
│       ├── contacts.js         # Mapeamento 1:1 de LID, contatos e blacklist
│       ├── memories.js         # Gestão de memórias de longo prazo
│       ├── prompts.js          # Versionamento e seleção de prompts
│       ├── rag.js              # Parser de PDF/Excel/Word e busca RAG
│       ├── settings.js         # Configurações gerais e horários
│       ├── templates.js        # Templates prontos por nicho comercial
│       └── training.js         # FAQs e regras de comportamento
├── uploads/
│   └── rag/                    # Diretório de armazenamento de uploads RAG
├── .env.example                # Modelo limpo de variáveis de ambiente
├── .gitignore                  # Regras estritas de proteção de credenciais
├── GUIA_DE_INSTALACAO.md       # Passo a passo completo de instalação
├── MANUAL_CONFIGURACAO_E_APIS.md # Manual detalhado dos 8 provedores de IA
├── index.js                    # Ponto de entrada (Entrypoint)
├── iniciar_ia.bat              # Script facilitador de inicialização no Windows
├── package.json                # Manifesto de dependências do Node.js
└── README.md                   # Documentação principal
```

---

## 🔒 Segurança & Privacidade

Este projeto foi construído seguindo boas práticas de segurança:
- **Zero Segredos Versionados**: Chaves de API e números de telefone são estritamente isolados no arquivo `.env`.
- **Zero Sessões no Git**: As pastas `.wwebjs_auth/`, `.wwebjs_cache/` e o arquivo `self_jids.json` estão protegidos no `.gitignore`.
- **Zero Bancos de Dados no Git**: O banco `database.sqlite` é gerado localmente em tempo de execução e nunca é enviado para repositórios públicos.
- **Sanitização de Entradas**: Todas as entradas de usuários passam por higienização contra injeções e caracteres de controle inválidos.

---

## 📄 Licença

Distribuído sob a licença **ISC**. Consulte o arquivo `package.json` para mais informações.
