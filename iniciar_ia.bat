@echo off
chcp 65001 >nul
title Central de Atendimento Inteligente WhatsApp - AI
cd /d "%~dp0"
set PATH=%PATH%;C:\Program Files\Nodejs;%LOCALAPPDATA%\Programs\Ollama

cls
echo ======================================================================
echo       CENTRAL DE ATENDIMENTO WHATSAPP COM INTELIGÊNCIA ARTIFICIAL
echo ======================================================================
echo.

:: 1. Verificar se o Node.js está instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Node.js não foi encontrado no sistema!
    echo Por favor, instale o Node.js v22 ou superior em: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 2. Verificar se o arquivo .env existe, caso contrário cria a partir do .env.example
if not exist ".env" (
    echo [INFO] Arquivo .env não encontrado. Criando cópia inicial a partir de .env.example...
    copy .env.example .env >nul
    echo [AVISO] O arquivo .env foi criado. Configure suas chaves de API nele se desejar.
    echo.
)

:: 3. Verificar dependências (node_modules)
if not exist "node_modules\" (
    echo [INFO] Instalando dependências do projeto (npm install)...
    echo Isso pode levar alguns minutos na primeira execução.
    call npm install
    if %errorlevel% neq 0 (
        echo [ERRO] Falha ao instalar dependências via npm install.
        pause
        exit /b 1
    )
    echo [OK] Dependências instaladas com sucesso!
    echo.
)

:: 4. Abrir Painel Administrativo no Navegador Padrão
echo 🌐 Abrindo o Painel Administrativo Web em http://localhost:3000...
start http://localhost:3000

:: 5. Executar aplicação
echo 🚀 Iniciando o servidor e o cliente WhatsApp...
echo.
node index.js

if %errorlevel% neq 0 (
    echo.
    echo [AVISO] A aplicação encerrou com código de saída %errorlevel%.
)

pause
