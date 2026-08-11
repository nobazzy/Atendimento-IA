# Central de Atendimento WhatsApp com Inteligencia Artificial Multiprovedor

Sistema corporativo de automacao comercial para WhatsApp integrado a múltiplos provedores de Inteligencia Artificial (OpenAI, Google Gemini, Anthropic Claude, Groq, DeepSeek, Ollama e LM Studio Local), com painel web administrativo.

---

## Funcionalidades Principais

- **Arquitetura Multiprovedor de IA**: Suporte a alternancia dinamica entre OpenAI (GPT-4o), Gemini 1.5, Claude 3.5, Groq, DeepSeek e LLMs locais (Ollama / LM Studio).
- **Modelo Relacional 1:1 e Mapeamento LID**: Mapeamento nativo entre identificadores de privacidade (@lid) e numeros telefonicos (@c.us), prevenindo duplicacao de registros de contatos.
- **Filtro Multichave de Bloqueio (Blacklist)**: Controle de bloqueio via LID, digitos numericos limpos, JID de telefone e nome real.
- **Fila Serial de Envio (Puppeteer Concurrency Guard)**: Processamento sequencial de mensagens de saida para evitar travamentos e erros de concorrencia no navegador Chromium.
- **Painel de Controle Administrativo**: Dashboard web para acompanhamento de metricas, gestao de contatos, configuracao de regras de blacklist, gerenciamento de personalidades de IA e auditoria de logs.
- **Modo de Intervencao Manual**: Capacidade de pausar e retomar automacoes para chats especificos diretamente pelo painel administrativo.

---

## Requisitos do Sistema e Tecnologias

- **Runtime**: Node.js v22.0.0 ou superior (utiliza o modulo nativo node:sqlite)
- **Engine WhatsApp**: whatsapp-web.js e Puppeteer
- **Framework Web**: Express.js
- **Banco de Dados**: SQLite3 com suporte a Write-Ahead Logging (WAL)
- **Provedores de IA**: APIs REST oficiais e endpoints locais compativeis com OpenAI

---

## Instrucoes de Instalacao e Execucao

### 1. Clonar o Repositorio
```bash
git clone https://github.com/seu-usuario/ia_atendimento_versao_para_git.git
cd ia_atendimento_versao_para_git
```

### 2. Instalar Dependencias
```bash
npm install
```

### 3. Configurar Variaveis de Ambiente
Crie o arquivo `.env` a partir do modelo `.env.example`:
```bash
cp .env.example .env
```
Edite o arquivo `.env` e insira as credenciais de API desejadas e o numero do WhatsApp responsavel.

### 4. Iniciar a Aplicacao
```bash
npm start
```

---

## Acesso ao Painel Administrativo

Apos a inicializacao, o painel web estara disponivel no endereco:
`http://localhost:3000`

No primeiro acesso, escaneie o código QR exibido no terminal ou no painel web utilizando a funcionalidade "Aparelhos Conectados" do WhatsApp no seu dispositivo móvel.

---

## Estrutura de Seguranca e Privacidade

O projeto contem um arquivo `.gitignore` pre-configurado para evitar o versionamento involuntario de:
- Credenciais de acesso e chaves de API (`.env`)
- Tokens e sessoes ativas de autenticacao do WhatsApp (`.wwebjs_auth/`)
- Base de dados local e dados de contatos (`database.sqlite`)

---

## Licenca

Este software e distribuido sob a licenca ISC.
