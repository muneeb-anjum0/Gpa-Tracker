@echo off
title ZABCAL - Starting Server...
color 0A

echo.
echo ╔══════════════════════════════════════╗
echo ║          ZABCAL STARTING             ║
echo ║    Opening your GPA Calculator...    ║
echo ╚══════════════════════════════════════╝
echo.

cd /d "%~dp0"

REM Check if node_modules exist
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

REM Start the development server
echo Starting server on localhost:5173...
start http://localhost:5173
timeout /t 3

REM Run npm dev
call npm run dev

pause
