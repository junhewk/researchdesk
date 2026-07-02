@echo off
setlocal
set "ROOT_DIR=%~dp0.."
set "NODE=%ROOT_DIR%\runtime\node\node.exe"
if not exist "%NODE%" set "NODE=%ROOT_DIR%\runtime\node\bin\node.exe"
"%NODE%" "%ROOT_DIR%\lib\cli.mjs" %*
