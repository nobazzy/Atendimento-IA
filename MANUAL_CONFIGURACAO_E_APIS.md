# 📘 MANUAL COMPLETO DE CONFIGURAÇÃO E PROVEDORES DE IA (SISTEMA CLOUD AI)

Este guia prático ensina passo a passo como configurar o seu arquivo `.env`, adicionar chaves de API e alternar entre os **8 Provedores de Inteligência Artificial** suportados no sistema.

---

## 🛠️ 1. Onde Fica o Arquivo de Configuração?

O arquivo de configuração fica na raiz do projeto com o nome **`.env`**:
- **Caminho:** `.env` (na raiz do projeto)

> 💡 **Como editar:** Você pode abrir o arquivo `.env` usando qualquer editor de texto (Bloco de Notas, VS Code ou Antigravity).

---

## 🤖 2. Provedores de IA Suportados & Como Alternar

Para definir qual Inteligência Artificial o sistema utilizará para responder as mensagens no WhatsApp, edite a variável `ACTIVE_PROVIDER` no seu `.env`:

| Valor em `ACTIVE_PROVIDER` | Provedor de IA | Exemplo de Modelo Suportado |
| :--- | :--- | :--- |
| `openai` | **OpenAI Cloud** | `gpt-4o-mini`, `gpt-4o`, `o3-mini` |
| `gemini` | **Google Gemini** | `gemini-1.5-flash`, `gemini-1.5-pro` |
| `claude` | **Anthropic Claude** | `claude-3-5-sonnet-latest`, `claude-3-haiku-20240307` |
| `groq` | **Groq Cloud (Ultra Rápido)** | `llama-3.3-70b-versatile`, `mixtral-8x7b-32768` |
| `deepseek` | **DeepSeek Official API** | `deepseek-chat`, `deepseek-reasoner` |
| `ollama` | **Ollama Local (Offline)** | `qwen2.5:14b`, `llama3.2`, `deepseek-r1` |
| `lmstudio` | **LM Studio Local** | Modelo carregado na porta `1234` |
| `custom` | **API Personalizada** | OpenRouter, vLLM, RunPod, etc. |

---

## 📋 3. Tutorial Passo a Passo por Provedor

### 🟢 Opção A: Como Usar a OpenAI (Padrão Recomendado)
1. Acesse [platform.openai.com/api-keys](https://platform.openai.com/api-keys) e crie sua chave API.
2. No seu arquivo `.env`, altere:
```env
ACTIVE_PROVIDER=openai
USE_OPENAI=true
OPENAI_API_KEY=sk-proj-sua_chave_real_aqui
OPENAI_MODEL=gpt-4o-mini
```

---

### 🔵 Opção B: Como Usar o Google Gemini (Grátis / Alta Performance)
1. Acesse [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) e gere sua chave grátis.
2. No seu arquivo `.env`, altere:
```env
ACTIVE_PROVIDER=gemini
GEMINI_API_KEY=AIzaSy_sua_chave_gemini_aqui
GEMINI_MODEL=gemini-1.5-flash
```

---

### 🟠 Opção C: Como Usar o Anthropic Claude (Excelente Raciocínio)
1. Acesse [console.anthropic.com](https://console.anthropic.com/) e crie sua chave API.
2. No seu arquivo `.env`, altere:
```env
ACTIVE_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-api03_sua_chave_claude_aqui
ANTHROPIC_MODEL=claude-3-5-sonnet-latest
```

---

### ⚡ Opção D: Como Usar a Groq Cloud (Ultra Rápido - 500 tokens/segundo)
1. Acesse [console.groq.com/keys](https://console.groq.com/keys) e obtenha sua chave API grátis.
2. No seu arquivo `.env`, altere:
```env
ACTIVE_PROVIDER=groq
GROQ_API_KEY=gsk_sua_chave_groq_aqui
GROQ_MODEL=llama-3.3-70b-versatile
```

---

### 🐋 Opção E: Como Usar a DeepSeek API Oficial
1. Acesse [platform.deepseek.com](https://platform.deepseek.com/) e gere sua chave API.
2. No seu arquivo `.env`, altere:
```env
ACTIVE_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-sua_chave_deepseek_aqui
DEEPSEEK_MODEL=deepseek-chat
```

---

### 🦙 Opção F: Como Usar o Ollama (100% Grátis & Offline no Seu PC)
1. Baixe o Ollama em [ollama.com](https://ollama.com) e rode o modelo: `ollama run qwen2.5:14b`
2. No seu arquivo `.env`, altere:
```env
ACTIVE_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434/api/chat
OLLAMA_MODEL=qwen2.5:14b
```

---

## 🌐 4. Como Alternar o Provedor em Tempo Real pelo Painel Web
Além do arquivo `.env`, você também pode alternar o provedor de IA e a temperatura a qualquer momento pelo navegador:
1. Abra o painel em **`http://localhost:3000`**
2. Vá até a aba **⚙️ Configurações Gerais da IA**.
3. Selecione o Provedor de IA desejado no menu suspenso e clique em **`Salvar Configurações`**.

---

## 🚀 5. Como Iniciar o Sistema Após Editar o `.env`

Após fazer alterações no `.env`, execute `npm start` ou dê dois cliques em **`iniciar_ia.bat`** (ou `iniciar_minha_ia.bat`).
O sistema carregará automaticamente as novas chaves e estará 100% pronto!
