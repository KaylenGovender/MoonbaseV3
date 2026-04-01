@echo off
title Moonbase Tunnel
echo ==========================================
echo  Moonbase - Public Tunnel
echo  Keep this window open while players play
echo ==========================================
echo.

:loop
echo [%TIME%] Starting tunnel...
npx localtunnel --port 3001
echo.
echo [%TIME%] Tunnel disconnected. Restarting in 3 seconds...
timeout /t 3 /nobreak >nul
goto loop
