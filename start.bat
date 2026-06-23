@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

where uv >nul 2>nul
if errorlevel 1 (
  echo uv is required for Python environment management
  echo Install it from https://docs.astral.sh/uv/
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is required
  exit /b 1
)

if not exist .venv (
  uv venv .venv || exit /b 1
)

call .venv\Scripts\activate.bat
uv pip install -r requirements.txt || exit /b 1

if not exist node_modules (
  npm install || exit /b 1
)

for /f "usebackq delims=" %%A in (`python -c "import yaml; data=yaml.safe_load(open('config.yaml', encoding='utf-8')) or {}; print(((data.get('backend') or {}).get('port')) or '')"`) do set "BACKEND_PORT=%%A"
for /f "usebackq delims=" %%A in (`python -c "import yaml; data=yaml.safe_load(open('config.yaml', encoding='utf-8')) or {}; print(data.get('proxy_url') or '')"`) do set "PROXY_URL=%%A"
for /f "usebackq delims=" %%A in (`python -c "import yaml; data=yaml.safe_load(open('config.yaml', encoding='utf-8')) or {}; print(((data.get('frontend') or {}).get('url')) or '')"`) do set "FRONTEND_URL=%%A"

if "%BACKEND_PORT%"=="" (
  echo backend.port must be set in config.yaml
  exit /b 1
)

call :kill_port %BACKEND_PORT%

echo Starting Python proxy on %PROXY_URL%
start "hungry-rp backend" /B python -m backend.main

timeout /t 2 /nobreak >nul
call :port_open %BACKEND_PORT%
if errorlevel 1 (
  echo Python proxy failed to start on port %BACKEND_PORT%
  call :kill_port %BACKEND_PORT%
  exit /b 1
)

echo Starting Vite frontend on %FRONTEND_URL%
npm run dev
set "FRONTEND_STATUS=%ERRORLEVEL%"

call :kill_port %BACKEND_PORT%
exit /b %FRONTEND_STATUS%

:port_open
netstat -ano | findstr /R /C:":%~1 .*LISTENING" >nul 2>nul
exit /b %ERRORLEVEL%

:kill_port
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%~1 .*LISTENING"') do (
  echo Stopping stale process on port %~1: %%P
  taskkill /PID %%P /T /F >nul 2>nul
)
exit /b 0
