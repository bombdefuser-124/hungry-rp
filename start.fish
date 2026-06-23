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

function config_value
  python -c "import yaml, sys; data=yaml.safe_load(open('config.yaml', encoding='utf-8')) or {}; cur=data
for part in sys.argv[1].split('.'):
    cur = cur.get(part, '') if isinstance(cur, dict) else ''
print('' if cur is None else cur)" $argv[1]
end

set backend_port (config_value backend.port)
set proxy_url (config_value proxy_url)
set frontend_url (config_value frontend.url)

if test -z "$backend_port"
  echo "backend.port must be set in config.yaml"
  exit 1
end

function pids_on_port
  set port $argv[1]
  if command -q ss
    ss -ltnp "sport = :$port" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u
  else if command -q lsof
    lsof -ti tcp:$port -sTCP:LISTEN 2>/dev/null | sort -u
  end
end

function kill_pid_tree
  for pid in $argv
    if test -z "$pid"
      continue
    end

    set children (pgrep -P $pid 2>/dev/null)
    if test (count $children) -gt 0
      kill_pid_tree $children
    end

    kill -TERM $pid 2>/dev/null
  end
end

function kill_port
  set port $argv[1]
  set pids (pids_on_port $port)
  if test (count $pids) -eq 0
    return 0
  end

  echo "Stopping stale process on port $port: $pids"
  kill_pid_tree $pids
  sleep 1

  set remaining (pids_on_port $port)
  if test (count $remaining) -gt 0
    echo "Force stopping remaining process on port $port: $remaining"
    kill -KILL $remaining 2>/dev/null
  end
end

function cleanup
  if set -q backend_pid
    kill_pid_tree $backend_pid
    sleep 1
  end

  set remaining_backend (pids_on_port $backend_port)
  if test (count $remaining_backend) -gt 0
    echo "Cleaning up proxy process on port $backend_port: $remaining_backend"
    kill_pid_tree $remaining_backend
  end
end

function cleanup_on_exit --on-event fish_exit
  cleanup
end

kill_port $backend_port

echo "Starting Python proxy on $proxy_url"
python -m backend.main &
set backend_pid $last_pid

sleep 1
if test (count (pids_on_port $backend_port)) -eq 0
  echo "Python proxy failed to start on port $backend_port"
  cleanup
  exit 1
end

echo "Starting Vite frontend on $frontend_url"
npm run dev
set frontend_status $status

cleanup
exit $frontend_status
