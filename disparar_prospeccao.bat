@echo off
title Disparador de Prospeccao IA - ProspectBR
cd /d "%~dp0"
set PATH=%PATH%;C:\Program Files\nodejs

cls
node disparar_prospeccao.js
pause
