#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNTIME_DIR="${CODY_RUNTIME_DIR:-$PROJECT_DIR/.cody-runtime}"
ENV_FILE="$RUNTIME_DIR/service.env"
mkdir -p "$RUNTIME_DIR"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi
PID_FILE="$RUNTIME_DIR/server.pid"
LOG_FILE="${CODY_LOG_FILE:-$RUNTIME_DIR/server.log}"
HOST="${CODY_HOST:-127.0.0.1}"
PORT="${CODY_PORT:-3000}"
PASSWORD="${CODY_PASSWORD:-}"

read_pid() { [[ -f "$PID_FILE" ]] || return 1; local pid; pid="$(tr -dc '0-9' < "$PID_FILE")"; [[ -n "$pid" ]] || return 1; printf '%s' "$pid"; }
is_our_process() { local command; kill -0 "$1" 2>/dev/null || return 1; command="$(ps -p "$1" -o command= 2>/dev/null || true)"; [[ "$command" == *"$PROJECT_DIR/dist-cli/index.js"* ]]; }
find_our_pids() {
  local pid known=""
  if pid="$(read_pid 2>/dev/null)" && is_our_process "$pid"; then known="$pid"; printf '%s\n' "$pid"; fi
  ps -axo pid=,command= | awk -v needle="$PROJECT_DIR/dist-cli/index.js" 'index($0, needle) { print $1 }' | while read -r pid; do
    [[ -n "$pid" && "$pid" != "$known" ]] && is_our_process "$pid" && printf '%s\n' "$pid"
  done || true
  return 0
}

stop_service() {
  local pid pids
  pids="$(find_our_pids)"
  if [[ -z "$pids" ]]; then echo "CodyWebUI is not running."; rm -f "$PID_FILE"; return 0; fi
  for pid in $pids; do echo "Stopping CodyWebUI (PID $pid)..."; kill -TERM "$pid" 2>/dev/null || true; done
  for _ in {1..50}; do
    local remaining=false
    for pid in $pids; do kill -0 "$pid" 2>/dev/null && remaining=true; done
    [[ "$remaining" == false ]] && break
    sleep 0.1
  done
  for pid in $pids; do
    if kill -0 "$pid" 2>/dev/null; then echo "Process $pid did not stop gracefully; sending SIGKILL."; kill -KILL "$pid"; fi
  done
  rm -f "$PID_FILE"
}

start_service() {
  local pid pids args
  pids="$(find_our_pids)"
  if [[ -n "$pids" ]]; then echo "CodyWebUI is already running (PID(s) ${pids//$'\n'/,})."; return 0; fi
  rm -f "$PID_FILE"; args=("$PROJECT_DIR/dist-cli/index.js" --host "$HOST" --port "$PORT")
  if [[ -n "$PASSWORD" ]]; then args+=(--password "$PASSWORD")
  elif [[ "$HOST" == "127.0.0.1" || "$HOST" == "localhost" || "$HOST" == "::1" ]]; then args+=(--no-password)
  else echo "CODY_PASSWORD is required when CODY_HOST is not loopback." >&2; return 1; fi
  echo "Starting CodyWebUI on $HOST:$PORT..."; nohup setsid node "${args[@]}" >> "$LOG_FILE" 2>&1 < /dev/null & pid=$!; printf '%s\n' "$pid" > "$PID_FILE"
  for _ in {1..50}; do
    if ! kill -0 "$pid" 2>/dev/null; then echo "CodyWebUI exited during startup. See $LOG_FILE" >&2; tail -n 30 "$LOG_FILE" >&2 || true; rm -f "$PID_FILE"; return 1; fi
    if node -e "fetch('http://$HOST:$PORT/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"; then echo "CodyWebUI is running (PID $pid). Log: $LOG_FILE"; return 0; fi
    sleep 0.2
  done
  echo "Process is running but the HTTP readiness check timed out. See $LOG_FILE" >&2; return 1
}

status_service() { local pids; pids="$(find_our_pids)"; if [[ -n "$pids" ]]; then echo "running pid=${pids//$'\n'/,} url=http://$HOST:$PORT log=$LOG_FILE"; return 0; fi; echo "stopped"; return 1; }

case "${1:-status}" in
  start) start_service ;; stop) stop_service ;; restart) stop_service; start_service ;;
  status) status_service ;; logs) touch "$LOG_FILE"; tail -n "${CODY_LOG_LINES:-100}" -f "$LOG_FILE" ;;
  *) echo "Usage: $0 {start|stop|restart|status|logs}" >&2; exit 2 ;;
esac
