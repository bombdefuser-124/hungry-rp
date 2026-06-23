#!/usr/bin/env fish

set root (dirname (status --current-filename))
cd $root

if not command -q uv
  echo "uv is required for Python environment management"
  echo "Install it from https://docs.astral.sh/uv/"
  exit 1
end

if not command -q npm
  echo "npm is required"
  exit 1
end

if not test -d .venv
  uv venv .venv
end

source .venv/bin/activate.fish
uv pip install -r requirements.txt

if not test -d node_modules
  npm install
end

function cleanup --on-event fish_exit
  if set -q backend_pid
    kill $backend_pid 2>/dev/null
  end
end

echo "Starting Python proxy on http://localhost:8025"
python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8025 &
set backend_pid $last_pid

echo "Starting Vite frontend on http://localhost:5173"
npm run dev -- --host 0.0.0.0
