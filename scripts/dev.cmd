@echo off
rem Abre o Grifo Quest em modo dev (atalho da Area de Trabalho).
rem Fecha antes o app INSTALADO: os dois usam o mesmo banco e o single-instance faria o dev sair na hora.
title Grifo Quest (dev)
set "SHIMS=%LOCALAPPDATA%\grifo-dev-bin"
set "COREPACK_ENABLE_DOWNLOAD_PROMPT=0"
set "PATH=%SHIMS%;%USERPROFILE%\.cargo\bin;%APPDATA%\npm;%PATH%"
rem Sem pnpm instalado: o corepack (vem com o Node) cria o comando numa pasta do usuario, sem admin.
if not exist "%SHIMS%" mkdir "%SHIMS%"
where pnpm >nul 2>&1 || call corepack enable --install-directory "%SHIMS%" pnpm
powershell -NoProfile -Command "Get-Process grifo-quest -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*\Grifo Quest\*' } | Stop-Process -Force"
cd /d "%~dp0.."
call pnpm tauri dev
pause
