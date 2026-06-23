#!/usr/bin/env sh

set -u

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$ROOT" || exit 1

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is required for Python environment management"
  echo "Install it from https://docs.astral.sh/uv/"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required"
  exit 1
fi

if [ ! -d .venv ]; then
  uv venv .venv || exit 1
fi

# shellcheck disable=SC1091
. ./.venv/bin/activate
uv pip install -r requirements.txt || exit 1

if [ ! -d node_modules ]; then
  npm install || exit 1
fi

config_value() {
  python -c "import yaml, sys; data=yaml.safe_load(open('config.yaml', encoding='utf-8')) or {}; cur=data
for part in sys.argv[1].split('.'):
    cur = cur.get(part, '') if isinstance(cur, dict) else ''
print('' if cur is None else cur)" "$1"
}

BACKEND_PORT=$(config_value backend.port)
PROXY_URL=$(config_value proxy_url)
FRONTEND_URL=$(config_value frontend.url)

if [ -z "$BACKEND_PORT" ]; then
  echo "backend.port must be set in config.yaml"
  exit 1
fi

pids_on_port() {
  port=$1
  if command -v ss >/dev/null 2>&1; then
    ss -ltnp "sport = :$port" 2>/dev/null | grep -o 'pid=[0-9]*' | sed 's/pid=//' | sort -u
  elif command -v lsof >/dev/null 2>&1; then
    lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null | sort -u
  fi
}

kill_pid_tree() {
  for pid in "$@"; do
    [ -z "$pid" ] && continue
    children=$(pgrep -P "$pid" 2>/dev/null || true)
    if [ -n "$children" ]; then
      # shellcheck disable=SC2086
      kill_pid_tree $children
    fi
    kill -TERM "$pid" 2>/dev/null || true
  done
}

kill_port() {
  port=$1
  pids=$(pids_on_port "$port")
  [ -z "$pids" ] && return 0

  echo "Stopping stale process on port $port: $pids"
  # shellcheck disable=SC2086
  kill_pid_tree $pids
  sleep 1

  remaining=$(pids_on_port "$port")
  if [ -n "$remaining" ]; then
    echo "Force stopping remaining process on port $port: $remaining"
    # shellcheck disable=SC2086
    kill -KILL $remaining 2>/dev/null || true
  fi
}

cleanup() {
  if [ -n "${BACKEND_PID:-}" ]; then
    kill_pid_tree "$BACKEND_PID"
    sleep 1
  fi

  remaining_backend=$(pids_on_port "$BACKEND_PORT")
  if [ -n "$remaining_backend" ]; then
    echo "Cleaning up proxy process on port $BACKEND_PORT: $remaining_backend"
    # shellcheck disable=SC2086
    kill_pid_tree $remaining_backend
  fi
}

trap cleanup EXIT INT TERM

kill_port "$BACKEND_PORT"

echo "Starting Python proxy on $PROXY_URL"
python -m backend.main &
BACKEND_PID=$!

sleep 1
if [ -z "$(pids_on_port "$BACKEND_PORT")" ]; then
  echo "Python proxy failed to start on port $BACKEND_PORT"
  exit 1
fi

echo "Starting Vite frontend on $FRONTEND_URL"
npm run dev
FRONTEND_STATUS=$?

exit "$FRONTEND_STATUS"
