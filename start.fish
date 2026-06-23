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

function pids_on_port
  set port $argv[1]
  ss -ltnp "sport = :$port" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u
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

  set remaining_backend (pids_on_port 8025)
  if test (count $remaining_backend) -gt 0
    echo "Cleaning up proxy process on port 8025: $remaining_backend"
    kill_pid_tree $remaining_backend
  end
end

function cleanup_on_exit --on-event fish_exit
  cleanup
end

if not test -d .venv
  uv venv .venv
end

source .venv/bin/activate.fish
uv pip install -r requirements.txt

if not test -d node_modules
  npm install
end

kill_port 8025

echo "Starting Python proxy on http://localhost:8025"
python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8025 &
set backend_pid $last_pid

sleep 1
if test (count (pids_on_port 8025)) -eq 0
  echo "Python proxy failed to start on port 8025"
  cleanup
  exit 1
end

echo "Starting Vite frontend on http://localhost:5173"
npm run dev -- --host 0.0.0.0
set frontend_status $status

cleanup
exit $frontend_status
