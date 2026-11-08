@echo off
rem Abre a demonstração com o mapa de fundo funcionando (Windows).
title RuaMais - demonstracao
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor-local.ps1"
