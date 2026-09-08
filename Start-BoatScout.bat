@echo off
cd /d "%~dp0"
if not exist node_modules call npm install
call npm run setup
if errorlevel 1 exit /b 1
start http://127.0.0.1:3000
call npm run dev
