@echo off
title Central de Atendimento WhatsApp AI - Inicializador
cd /d "%~dp0"
set PATH=%PATH%;C:\Program Files\nodejs;%LOCALAPPDATA%\Programs\Ollama

cls
echo ======================================================================
echo       CENTRAL DE ATENDIMENTO WHATSAPP COM INTELIGENCIA ARTIFICIAL
echo ======================================================================
echo.

:: 1. Verificar Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [AVISO] O Node.js nao foi encontrado no seu computador!
    echo.
    echo Para usar a Inteligencia Artificial, instale o Node.js v20 ou v22:
    echo Acesse: https://nodejs.org/ (baixe a versao recomendada LTS)
    echo.
    echo Apos concluir a instalacao do Node.js, feche esta janela e
    echo abra este arquivo novamente.
    echo.
    pause
    exit /b 1
)

:: 2. Gerar arquivo de configuracao inicial caso nao exista
if not exist ".env" (
    if exist ".env.example" (
        echo [INFO] Criando arquivo .env inicial a partir de .env.example...
        copy /y ".env.example" ".env" >nul
        echo [INFO] Arquivo .env gerado com sucesso.
    )
)

:: 3. Instalar dependencias automaticamente
if not exist "node_modules" (
    echo ======================================================================
    echo [INFO] Instalando dependencias necessarias do sistema...
    echo Isso ocorre apenas na primeira inicializacao (aguarde 1 a 2 minutos).
    echo ======================================================================
    echo.
    call npm.cmd install
    if errorlevel 1 (
        echo.
        echo [ERRO] Ocorreu uma falha ao instalar os pacotes via npm.
        echo Verifique sua conexao com a internet e tente novamente.
        pause
        exit /b 1
    )
    echo.
    echo [OK] Dependencias instaladas com sucesso!
    echo.
)

:: 4. Abrir Painel Administrativo no Navegador
echo [WEB] Abrindo Painel de Controle em http://localhost:3000...
timeout /t 2 >nul
start http://localhost:3000

:: 5. Executar Servidor e WhatsApp
echo [START] Iniciando Servidor e Cliente WhatsApp...
echo.
echo DICA: Escaneie o QR Code que aparecera na tela (ou no painel web).
echo.
node index.js

pause
