@echo off
title Cloud AI - Plataforma Enterprise Comercial WhatsApp
cd /d "%~dp0"
set PATH=%PATH%;C:\Program Files\Nodejs;%LOCALAPPDATA%\Programs\Ollama

cls
echo ========================================================
echo         PAINEL COMERCIAL WHATSAPP - CLOUD AI
echo ========================================================
echo.
echo 🌐 Abrindo o Painel Web Atualizado em http://localhost:3000...
start http://localhost:3000?v=3

node index.js
pause
