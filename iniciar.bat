@echo off
title Kalena Notas - Inicializador
echo ============================================
echo   Iniciando Kalena Notas Fiscais
echo ============================================
echo.
echo Abrindo a API (porta 3334) e o App (porta 3001)...
echo Mantenha as duas janelas que vao abrir ABERTAS enquanto usar o sistema.
echo.

start "Kalena Notas - API"  cmd /k "cd /d %~dp0apps\api && npm run start:prod"
start "Kalena Notas - WEB"  cmd /k "cd /d %~dp0apps\web && npm run start"

echo Aguardando o sistema subir...
timeout /t 12 /nobreak >nul
start "" http://localhost:3001

echo.
echo Pronto! O navegador vai abrir em http://localhost:3001
echo Para PARAR o sistema, feche as duas janelas (API e WEB).
echo.
pause
