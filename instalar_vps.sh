#!/usr/bin/env bash
# ==============================================================================
# Script de Instalação e Deploy Automático em VPS (Ubuntu / Debian)
# Central de Atendimento WhatsApp com Inteligência Artificial
# ==============================================================================

set -e

echo "======================================================================"
echo "    INSTALADOR AUTOMÁTICO EM VPS - CENTRAL DE ATENDIMENTO IA"
echo "======================================================================"
echo ""

# 1. Atualizar pacotes do sistema
echo "[1/6] Atualizando pacotes do sistema..."
sudo apt-get update -y && sudo apt-get upgrade -y

# 2. Instalar dependências básicas e bibliotecas do Chrome/Puppeteer
echo "[2/6] Instalando dependências do sistema e Chromium headless..."
sudo apt-get install -y curl git build-essential ca-certificates \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 libpango-1.0-0 libcairo2 libx11-xcb1 \
    libxcb-dri3-0 fonts-liberation

# 3. Instalar Node.js v20 LTS caso não esteja presente
if ! command -v node &> /dev/null; then
    echo "[3/6] Instalando Node.js v20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "[3/6] Node.js já instalado: $(node -v)"
fi

# 4. Instalar PM2 globalmente para gerenciar o processo 24h
echo "[4/6] Instalando PM2 (Gerenciador de Processos 24/7)..."
sudo npm install -g pm2

# 5. Configurar ambiente (.env) e dependências do projeto
echo "[5/6] Instalando dependências do projeto via npm..."
cd "$(dirname "$0")"

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "Arquivo .env gerado a partir de .env.example."
    fi
fi

npm install

# 6. Iniciar aplicação com PM2
echo "[6/6] Iniciando Atendimento IA com PM2..."
pm2 delete atendimento-ia 2>/dev/null || true
pm2 start index.js --name "atendimento-ia" --time
pm2 save

echo ""
echo "======================================================================"
echo "    INSTALAÇÃO CONCLUÍDA COM SUCESSO!"
echo "======================================================================"
echo ""
IP_PUBLICO=$(curl -s ifconfig.me || echo "IP_DA_SUA_VPS")
echo "🌐 Acesse o Painel de Controle no seu navegador em:"
echo "👉 http://${IP_PUBLICO}:3000"
echo ""
echo "📱 Para ver o QR Code do WhatsApp no terminal da VPS, digite:"
echo "👉 pm2 logs atendimento-ia"
echo ""
echo "Comandos úteis:"
echo "- Ver logs em tempo real:   pm2 logs atendimento-ia"
echo "- Reiniciar o serviço:     pm2 restart atendimento-ia"
echo "- Parar o serviço:         pm2 stop atendimento-ia"
echo "- Status dos processos:    pm2 status"
echo "======================================================================"
