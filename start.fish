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
set cleanup_started 0

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

function collect_pid_tree
  for pid in $argv
    if test -z "$pid"
      continue
    end

    echo $pid
    set children (pgrep -P $pid 2>/dev/null)
    if test (count $children) -gt 0
      collect_pid_tree $children
    end
  end
end

function pid_alive
  kill -0 $argv[1] 2>/dev/null
end

function signal_pid_tree
  set signal_name $argv[1]
  for pid in $argv[2..-1]
    kill -s $signal_name $pid 2>/dev/null
  end
end

function stop_pid_tree
  set pids (collect_pid_tree $argv | sort -ur)
  if test (count $pids) -eq 0
    return 0
  end

  signal_pid_tree TERM $pids

  for attempt in (seq 1 10)
    set alive_pids
    for pid in $pids
      if pid_alive $pid
        set alive_pids $alive_pids $pid
      end
    end

    if test (count $alive_pids) -eq 0
      return 0
    end

    sleep 0.1
  end

  signal_pid_tree KILL $pids
end

function cleanup
  if test "$cleanup_started" = "1"
    return 0
  end
  set -g cleanup_started 1

  if set -q frontend_pid
    stop_pid_tree $frontend_pid
  end

  if set -q backend_pid
    stop_pid_tree $backend_pid
  end
end

function cleanup_on_exit --on-event fish_exit
  cleanup
end

function cleanup_on_interrupt --on-signal SIGINT
  cleanup
  exit 130
end

function cleanup_on_term --on-signal SIGTERM
  cleanup
  exit 143
end

set existing_backend (pids_on_port $backend_port)
if test (count $existing_backend) -gt 0
  echo "Backend port $backend_port is already in use: $existing_backend"
  echo "Stop that process yourself or change backend.port in config.yaml. This script will not kill unknown processes."
  exit 1
end

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
npm run dev &
set frontend_pid $last_pid

wait $frontend_pid
set frontend_status $status

cleanup
exit $frontend_status
