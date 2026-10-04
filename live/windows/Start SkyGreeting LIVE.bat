@echo off
title SkyGreeting LIVE (keep this window open while you stream)
cd /d "%~dp0"
rem Optional: paste your Euler Stream API key after the = sign (the key, not the account ID).
set EULER_API_KEY=
rem Optional: set to 1 to print the raw TikTok chat, gift and like events in this window.
set LIVE_DEBUG=
echo.
echo   SkyGreeting LIVE is starting.
echo   The control panel opens in your browser in a moment.
echo   Keep this window open while you stream. Close it, or press
echo   "Stop SkyGreeting LIVE" on the control panel, to stop.
echo.
start "" /min cmd /c "timeout /t 2 /nobreak >nul && start "" http://localhost:8787/live/admin"
"%~dp0node\node.exe" "%~dp0live\server.mjs"
echo.
echo   SkyGreeting LIVE has stopped.
pause
