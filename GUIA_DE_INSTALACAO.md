# 📖 Guia Completo de Instalação e Execução

Este guia fornece instruções detalhadas, passo a passo, para instalar, configurar e rodar a **Central de Atendimento WhatsApp com Inteligência Artificial** no seu computador ou servidor (Windows, Linux ou VPS).

---

## 📋 Sumário
1. [Pré-requisitos do Sistema](#1-pré-requisitos-do-sistema)
2. [Passo a Passo de Instalação](#2-passo-a-passo-de-instalação)
3. [Configuração do Arquivo .env](#3-configuração-do-arquivo-env)
4. [Iniciando o Sistema](#4-iniciando-o-sistema)
5. [Conectando ao WhatsApp via QR Code](#5-conectando-ao-whatsapp-via-qr-code)
6. [Configurando os Provedores de IA](#6-configurando-os-provedores-de-ia)
7. [Utilizando o RAG (Upload de Documentos e Planilhas)](#7-utilizando-o-rag-upload-de-documentos-e-planilhas)
8. [Executando em Produção com PM2 (24/7)](#8-executando-em-produção-com-pm2-247)
9. [Resolução de Problemas Frequentes (FAQ)](#9-resolução-de-problemas-frequentes-faq)

---

## 1. Pré-requisitos do Sistema

Antes de iniciar, verifique se você possui os seguintes softwares instalados:

### A) Node.js (Versão 22 ou superior)
- O projeto utiliza a biblioteca nativa `node:sqlite`, disponível a partir do **Node.js v22.0.0**.
- **Download oficial:** [https://nodejs.org/](https://nodejs.org/) (Baixe a versão LTS atual ou versão 22+).
- Para confirmar sua versão no terminal:
  ```bash
  node -v
  # Deve retornar v22.x.x ou superior
  ```

### B) Git
- Necessário para clonar o repositório.
- **Download oficial:** [https://git-scm.com/](https://git-scm.com/)

### C) Navegador Google Chrome ou Chromium
- O motor `whatsapp-web.js` utiliza o Chromium via Puppeteer para emular a sessão web.

---

## 2. Passo a Passo de Instalação

### Passo 1: Clonar o Repositório
Abra o terminal (Prompt de Comando, PowerShell ou Terminal Linux) e execute:

```bash
git clone https://github.com/nobazzy/Atendimento-IA.git
cd Atendimento-IA
```

### Passo 2: Instalar as Dependências
Execute o comando de instalação do npm:

```bash
npm install
```

Este comando instalará os pacotes essenciais:
- `whatsapp-web.js`: Comunicação com o protocolo do WhatsApp Web.
- `express`: Servidor HTTP do painel administrativo e API REST.
- `dotenv`: Gerenciamento de variáveis de ambiente.
- `axios`: Requisições HTTP para os provedores de inteligência artificial.
- `xlsx`, `pdf-parse`, `mammoth`, `multer`: Processamento de planilhas Excel, PDFs e Word para o motor RAG.
- `qrcode` e `qrcode-terminal`: Geração do QR Code na tela e no navegador.

---

## 3. Configuração do Arquivo .env

O projeto conta com um modelo chamado `.env.example`.

### Passo 1: Copiar o modelo para `.env`
- **No Windows (PowerShell / CMD):**
  ```powershell
  copy .env.example .env
  ```
- **No Linux / macOS:**
  ```bash
  cp .env.example .env
  ```

### Passo 2: Editar as variáveis principais
Abra o arquivo `.env` com qualquer editor de texto (VS Code, Bloco de Notas, etc.):

```env
# Porta do Painel Web (padrão 3000)
PORT=3000

# Seu número pessoal do WhatsApp (com DDI e DDD, apenas números)
# Exemplo para Brasil: 5511999998888
# Isso permite que a IA saiba quem é o administrador e não responda no seu próprio chat
MY_NUMBER=5511999998888

# Provedor de IA ativo padrão: 'openai' | 'gemini' | 'claude' | 'groq' | 'deepseek' | 'ollama' | 'lmstudio' | 'custom'
ACTIVE_PROVIDER=openai

# Se usar OpenAI:
USE_OPENAI=true
OPENAI_API_KEY=sk-proj-sua_chave_aqui
OPENAI_MODEL=gpt-4o-mini
```

> 💡 **Nota de Segurança:** O arquivo `.env` está incluído no `.gitignore` e **nunca** será enviado para o GitHub. Mantenha suas chaves sempre protegidas.

---

## 4. Iniciando o Sistema

### No Windows:
Você tem duas opções simples:

1. **Via arquivo executável em lote (Recomendado):**
   Dê dois cliques no arquivo `iniciar_ia.bat`. Ele verificará automaticamente o Node.js, criará o `.env` se necessário e abrirá o painel no navegador.
2. **Via terminal:**
   ```bash
   npm start
   ```

### No Linux / macOS:
```bash
npm start
```

Ao iniciar, você verá no terminal a mensagem:
```
========================================================
        PAINEL COMERCIAL WHATSAPP - CLOUD AI
========================================================

✅ [DATABASE] Banco de dados SQLite inicializado com sucesso.
🚀 Servidor Web Express ativo em http://localhost:3000
```

---

## 5. Conectando ao WhatsApp via QR Code

Ao iniciar pela primeira vez:
1. O terminal exibirá um **QR Code ASCII**.
2. Paralelamente, o **Painel Web** estará acessível em:
   👉 **`http://localhost:3000`**
3. Você pode escanear o QR Code tanto no terminal quanto na tela do painel web:
   - Abra o WhatsApp no seu smartphone.
   - Toque no menu de **três pontos** (Android) ou **Configurações** (iOS).
   - Selecione **Aparelhos conectados** ➔ **Conectar um aparelho**.
   - Aponte a câmera para o QR Code.
4. Após o pareamento, o sistema salvará a sessão de forma segura na pasta local `.wwebjs_auth/`. Nas próximas inicializações, o login ocorrerá **automaticamente** sem precisar ler o QR Code novamente.

---

## 6. Configurando os Provedores de IA

Você pode escolher entre provedores em nuvem ou modelos executados 100% no seu computador (gratuitos e offline).

### Opção 1: Google Gemini (Grátis & Rápido)
1. Crie sua chave em: [Google AI Studio](https://aistudio.google.com/app/apikey).
2. No `.env`:
   ```env
   ACTIVE_PROVIDER=gemini
   GEMINI_API_KEY=AIzaSy_sua_chave_aqui
   GEMINI_MODEL=gemini-1.5-flash
   ```

### Opção 2: Groq Cloud (Ultra Rápido)
1. Crie sua chave em: [Groq Console](https://console.groq.com/keys).
2. No `.env`:
   ```env
   ACTIVE_PROVIDER=groq
   GROQ_API_KEY=gsk_sua_chave_aqui
   GROQ_MODEL=llama-3.3-70b-versatile
   ```

### Opção 3: Ollama (100% Offline e Grátis no seu PC)
1. Instale o Ollama em [ollama.com](https://ollama.com).
2. Baixe o modelo desejado pelo terminal:
   ```bash
   ollama run qwen2.5:14b
   ```
3. No `.env`:
   ```env
   ACTIVE_PROVIDER=ollama
   OLLAMA_URL=http://localhost:11434/api/chat
   OLLAMA_MODEL=qwen2.5:14b
   ```

> 📖 Para ver o tutorial completo de todos os 8 provedores, consulte o arquivo [MANUAL_CONFIGURACAO_E_APIS.md](MANUAL_CONFIGURACAO_E_APIS.md).

---

## 7. Utilizando o RAG (Upload de Documentos e Planilhas)

O sistema possui um motor RAG (Retrieval-Augmented Generation) integrado:

1. Acesse o painel web em `http://localhost:3000`.
2. Clique na aba **Base de Conhecimento (RAG)** no menu lateral.
3. Faça o upload de arquivos da sua empresa:
   - **Tabelas de Preços:** Arquivos `.xlsx`, `.xls` ou `.csv`.
   - **Manuais e Catálogos:** Arquivos `.pdf` ou `.docx`.
   - **Políticas e Procedimentos:** Arquivos `.txt`.
4. O sistema processará o documento automaticamente, gerando blocos de busca.
5. Quando um cliente enviar uma pergunta (ex: *"Quanto custa o serviço X?"*), a IA buscará diretamente o trecho relevante no documento e responderá com o valor exato!

---

## 8. Executando em Produção com PM2 (24/7)

Para manter a aplicação rodando continuamente em segundo plano (em um servidor Linux ou VPS):

1. Instale o gerenciador de processos PM2 globalmente:
   ```bash
   npm install -g pm2
   ```

2. Inicie a aplicação:
   ```bash
   pm2 start index.js --name "atendimento-ia"
   ```

3. Configure para inicializar automaticamente com o sistema operacional:
   ```bash
   pm2 startup
   pm2 save
   ```

4. Comandos úteis do PM2:
   ```bash
   pm2 logs atendimento-ia     # Ver logs em tempo real
   pm2 restart atendimento-ia  # Reiniciar aplicação
   pm2 stop atendimento-ia     # Parar aplicação
   ```

---

## 9. Resolução de Problemas Frequentes (FAQ)

### ❓ "The browser is already running / Session already active"
**Causa:** Um processo anterior do Chrome/Puppeteer ficou preso na memória.  
**Solução (Windows):**
Abra o Gerenciador de Tarefas e finalize os processos `node.exe` e `chrome.exe`, ou execute no terminal:
```powershell
taskkill /F /IM node.exe
taskkill /F /IM chrome.exe
```

### ❓ Erro no Linux: "Failed to launch the browser process: libatk-1.0.so.0 missing"
**Causa:** Faltam bibliotecas de sistema necessárias para o Chromium headless no Linux Ubuntu/Debian.  
**Solução:**
Instale as dependências com o comando:
```bash
sudo apt-get update
sudo apt-get install -y \
  gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 \
  libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 \
  libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 \
  libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 \
  libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 \
  libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates \
  fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget
```

### ❓ "database is locked" no SQLite
**Causa:** O banco de dados estava sendo acessado simultaneamente sem WAL ou por um programa externo.  
**Solução:** O sistema já vem com `PRAGMA journal_mode = WAL;` e `busy_timeout = 5000` configurados nativamente em `src/database/index.js`, garantindo 5 segundos de espera antes de falhar. Evite abrir o arquivo `database.sqlite` em editores externos enquanto o bot estiver rodando.

### ❓ O bot responde a ele mesmo ou não aceita comandos
**Causa:** O número configurado em `MY_NUMBER` no `.env` não corresponde ao número do chip conectado.  
**Solução:** Certifique-se de preencher `MY_NUMBER` com DDI + DDD + Telefone (ex: `5511999998888`), sem espaços, traços ou parênteses.
