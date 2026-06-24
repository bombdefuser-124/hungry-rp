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

call :port_open %BACKEND_PORT%
if not errorlevel 1 (
  echo Backend port %BACKEND_PORT% is already in use.
  echo Stop that process yourself or change backend.port in config.yaml. This script will not kill unknown processes.
  exit /b 1
)

echo Starting Python proxy on %PROXY_URL%
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "$p = Start-Process -FilePath python -ArgumentList '-m','backend.main' -PassThru -WindowStyle Hidden; $p.Id"`) do set "BACKEND_PID=%%P"

timeout /t 2 /nobreak >nul
call :port_open %BACKEND_PORT%
if errorlevel 1 (
  echo Python proxy failed to start on port %BACKEND_PORT%
  call :cleanup_backend
  exit /b 1
)

echo Starting Vite frontend on %FRONTEND_URL%
npm run dev
set "FRONTEND_STATUS=%ERRORLEVEL%"

call :cleanup_backend
exit /b %FRONTEND_STATUS%

:port_open
netstat -ano | findstr /R /C:":%~1 .*LISTENING" >nul 2>nul
exit /b %ERRORLEVEL%

:cleanup_backend
if not "%BACKEND_PID%"=="" (
  taskkill /PID %BACKEND_PID% /T /F >nul 2>nul
)
exit /b 0
