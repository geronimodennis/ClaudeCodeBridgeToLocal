@echo off
setlocal
set "PROXY_NODE=node"
where node >nul 2>nul
if errorlevel 1 (
  set "PROXY_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  if not exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
    echo Install Node.js 20 or newer from https://nodejs.org then run this again.
    exit /b 1
  )
)
"%PROXY_NODE%" "%~dp0cli.cjs" %*
exit /b %errorlevel%
