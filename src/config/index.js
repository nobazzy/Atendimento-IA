require('dotenv').config();
const path = require('path');

module.exports = {
    PORT: process.env.PORT || 3000,
    MY_NUMBER: process.env.MY_NUMBER || '',
    
    // Provedor Ativo Padrão: 'openai' | 'gemini' | 'claude' | 'groq' | 'deepseek' | 'ollama' | 'lmstudio' | 'custom'
    ACTIVE_PROVIDER: (process.env.ACTIVE_PROVIDER || (process.env.USE_OPENAI === 'true' ? 'openai' : 'ollama')).toLowerCase(),
    
    // OpenAI
    USE_OPENAI: String(process.env.USE_OPENAI).toLowerCase() === 'true',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    
    // Google Gemini
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    
    // Anthropic Claude
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest',
    
    // Groq Cloud (Ultra Rápido)
    GROQ_API_KEY: process.env.GROQ_API_KEY || '',
    GROQ_MODEL: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    
    // DeepSeek API
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
    DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    
    // Ollama Local
    OLLAMA_URL: process.env.OLLAMA_URL || 'http://localhost:11434/api/chat',
    OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'qwen2.5:14b',
    
    // LM Studio Local
    LMSTUDIO_URL: process.env.LMSTUDIO_URL || 'http://localhost:1234/v1/chat/completions',
    LMSTUDIO_MODEL: process.env.LMSTUDIO_MODEL || 'local-model',
    
    // Endpoint Personalizado Compatível com OpenAI (ex: OpenRouter, vLLM)
    CUSTOM_API_URL: process.env.CUSTOM_API_URL || '',
    CUSTOM_API_KEY: process.env.CUSTOM_API_KEY || '',
    CUSTOM_MODEL: process.env.CUSTOM_MODEL || '',

    // Sistema e Paths
    DB_PATH: path.join(__dirname, '../../database.sqlite'),
    BACKUP_DIR: path.join(__dirname, '../../backups'),
    SELF_JIDS_PATH: path.join(__dirname, '../../self_jids.json'),
    AUTH_DIR: path.join(__dirname, '../../.wwebjs_auth')
};
