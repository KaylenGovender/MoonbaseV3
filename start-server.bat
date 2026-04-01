@echo off
title Moonbase Game Server
echo ==========================================
echo  Moonbase - Game Server
echo  Keep this window open while players play
echo ==========================================
echo.

cd /d "%~dp0server"
echo Starting game server on port 3001...
node src/index.js
