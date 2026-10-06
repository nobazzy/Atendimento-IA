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
    echo [AVISO] O arquivo .env foi gerado. Configure suas chaves de API nele se desejar.
    echo.
)

:: 3. Detecção e instalação automática de dependências (npm install)
set "NEED_INSTALL=0"
if not exist "node_modules\" set "NEED_INSTALL=1"
if not exist "node_modules\dotenv\" set "NEED_INSTALL=1"
if not exist "node_modules\express\" set "NEED_INSTALL=1"
if not exist "node_modules\whatsapp-web.js\" set "NEED_INSTALL=1"

if "%NEED_INSTALL%"=="1" (
    echo ======================================================================
    echo [INFO] Dependências não encontradas ou incompletas.
    echo [INFO] Executando instalação automática das dependências (npm install)...
    echo Isso pode levar de 1 a 2 minutos na primeira execução.
    echo ======================================================================
    echo.
    where npm.cmd >nul 2>nul
    if %errorlevel% equ 0 (
        call npm.cmd install
    ) else (
        call npm install
    )
    if %errorlevel% neq 0 (
        echo.
        echo [ERRO] Falha ao instalar as dependências do projeto via npm.
        echo Verifique sua conexão com a internet e permissões de pasta.
        echo.
        pause
        exit /b 1
    )
    echo.
    echo [OK] Todas as dependências foram instaladas com sucesso!
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
