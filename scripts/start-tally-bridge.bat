@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18+ is required. Install from https://nodejs.org then run this again.
  pause
  exit /b 1
)
echo ============================================================
echo  GA Tally bridge v3.5  —  http://127.0.0.1:34876
echo  Live sync budget: ~10 seconds (no day fan-out by default)
echo ============================================================
echo  Keep this window open while using Tally live sync.
echo  Pulls Payment + Receipt by type in parallel, then filters
echo  to the From/To dates selected in Cashflow.
echo  Tally HTTP/XML must be enabled on port 9000.
echo ============================================================
echo.
node "%~dp0tally_bridge.mjs"
echo.
echo Bridge stopped.
pause
