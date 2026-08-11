@echo off
title Cloud AI - Plataforma Enterprise Comercial WhatsApp
cd /d "%~dp0"
set PATH=%PATH%;C:\Program Files\Nodejs;%LOCALAPPDATA%\Programs\Ollama

if not exist node_modules (
    echo 📦 Instalando dependencias necessarias do Node.js...
    call npm install
)

cls
echo ========================================================
echo         PAINEL COMERCIAL WHATSAPP - CLOUD AI
echo ========================================================
echo.
echo 🌐 Abrindo o Painel Web em http://localhost:3000...
start http://localhost:3000?v=3

node index.js
pause
