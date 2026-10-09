#!/usr/bin/env bash
# ==============================================================================
# Script de Instalação e Deploy Automático em VPS Dedicada (Ubuntu / Debian)
# Central de Atendimento WhatsApp com Inteligência Artificial
# ==============================================================================

set -e

echo "======================================================================"
echo "    INSTALADOR AUTOMÁTICO EM VPS - CENTRAL DE ATENDIMENTO IA"
echo "    (Arquitetura Segura Single-Tenant por Servidor Dedicado)"
echo "======================================================================"
echo ""

# 1. Atualizar pacotes do sistema
echo "[1/6] Atualizando pacotes do sistema..."
sudo apt-get update -y && sudo apt-get upgrade -y

# 2. Instalar dependências básicas e bibliotecas do Chrome/Puppeteer
echo "[2/6] Instalando dependências do sistema e Chromium headless..."
sudo apt-get install -y curl git build-essential ca-certificates openssl \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 libpango-1.0-0 libcairo2 libx11-xcb1 \
    libxcb-dri3-0 fonts-liberation

# 3. Instalar Node.js v22 LTS (necessário para node:sqlite nativo) caso não esteja presente
if ! command -v node &> /dev/null; then
    echo "[3/6] Instalando Node.js v22 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "[3/6] Node.js já instalado: $(node -v)"
fi

# 4. Instalar PM2 globalmente para gerenciar o processo 24h
echo "[4/6] Instalando PM2 (Gerenciador de Processos 24/7)..."
sudo npm install -g pm2

# 5. Configurar ambiente (.env), segurança e dependências do projeto
echo "[5/6] Configurando ambiente de segurança e dependências..."
cd "$(dirname "$0")"

# Criar diretórios de persistência
mkdir -p uploads/rag backups .wwebjs_auth

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "Arquivo .env gerado a partir de .env.example."
    fi
fi

# Configuração automática de segurança do servidor dedicado
if [ -f ".env" ]; then
    # Ativar autenticação obrigatória
    sed -i 's/^REQUIRE_AUTH=.*/REQUIRE_AUTH=true/' .env || true
    sed -i 's/^DISABLE_KILL_SWITCH=.*/DISABLE_KILL_SWITCH=true/' .env || true

    # Gerar JWT_SECRET exclusivo caso esteja em branco
    if grep -q '^JWT_SECRET=$' .env 2>/dev/null || grep -q '^JWT_SECRET=""$' .env 2>/dev/null; then
        RANDOM_JWT=$(openssl rand -hex 32)
        sed -i "s/^JWT_SECRET=.*/JWT_SECRET=${RANDOM_JWT}/" .env
        echo "🔒 JWT_SECRET exclusivo gerado com sucesso."
    fi

    # Gerar ADMIN_PASSWORD forte caso esteja em branco
    if grep -q '^ADMIN_PASSWORD=$' .env 2>/dev/null || grep -q '^ADMIN_PASSWORD=""$' .env 2>/dev/null; then
        RANDOM_PASS=$(openssl rand -base64 12 | tr -dc 'a-zA-Z0-9' | head -c 16)
        sed -i "s/^ADMIN_PASSWORD=.*/ADMIN_PASSWORD=${RANDOM_PASS}/" .env
        echo "🔑 Senha de administrador gerada com sucesso."
    fi
fi

npm install

# 6. Iniciar aplicação com PM2
echo "[6/6] Iniciando Atendimento IA com PM2..."
pm2 delete atendimento-ia 2>/dev/null || true
pm2 start index.js --name "atendimento-ia" --time
pm2 save

ADMIN_PASS_EXIBIDA=$(grep '^ADMIN_PASSWORD=' .env | cut -d '=' -f2- || echo "Definida no .env")
IP_PUBLICO=$(curl -s ifconfig.me || echo "IP_DA_SUA_VPS")

echo ""
echo "======================================================================"
echo "    🎉 INSTALAÇÃO CONCLUÍDA COM SUCESSO!"
echo "======================================================================"
echo ""
echo "🌐 URL DO PAINEL WEB:      http://${IP_PUBLICO}:3000"
echo "🔐 AUTENTICAÇÃO:           ATIVADA (REQUIRE_AUTH=true)"
echo "🔑 SENHA DO ADMINISTRADOR:  ${ADMIN_PASS_EXIBIDA}"
echo ""
echo "⚠️  IMPORTANTE: Guarde a senha de administrador acima para acessar o painel!"
echo "    Você também pode alterá-la a qualquer momento editando o arquivo .env"
echo ""
echo "📱 PARA CONECTAR O WHATSAPP (QR CODE):"
echo "👉 Digite no terminal: pm2 logs atendimento-ia"
echo "   (Escaneie o QR Code com o aplicativo do WhatsApp)"
echo ""
echo "🛠️ COMANDOS ÚTEIS:"
echo "- Ver logs e mensagens:    pm2 logs atendimento-ia"
echo "- Reiniciar o serviço:     pm2 restart atendimento-ia"
echo "- Parar o serviço:         pm2 stop atendimento-ia"
echo "- Status da aplicação:     pm2 status"
echo "======================================================================"
