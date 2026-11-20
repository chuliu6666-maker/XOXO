@echo off
cd /d "%~dp0"
echo Open http://127.0.0.1:8773/ after the server starts.
node serve.mjs
pause
