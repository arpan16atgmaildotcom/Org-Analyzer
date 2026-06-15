#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

LOG="$SCRIPT_DIR/server.log"
PID_FILE="$SCRIPT_DIR/.server.pid"

# ── AI Insights config (optional) ────────────────────────────────────────────
# The AI Insights tab requires an API key. Copy .env.example to .env and set:
#   AI_PROVIDER=anthropic   (default)
#   AI_API_KEY=sk-ant-...
# Without this, all other features work normally; the AI tab shows a setup notice.
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a && source "$SCRIPT_DIR/.env" && set +a
fi

# ── Dependency check ──────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js is not installed. Install it from https://nodejs.org" >&2
  exit 1
fi

if ! command -v sf &>/dev/null; then
  echo "ERROR: Salesforce CLI not found. Run: npm install --global @salesforce/cli" >&2
  exit 1
fi

# ── Mode selection ────────────────────────────────────────────────────────────
# If client/dist/index.html exists, run in single-port production mode.
# Otherwise install dev deps and run the dev pair (Express + Vite).
if [ -f "$SCRIPT_DIR/client/dist/index.html" ]; then
  MODE="prod"
  PORT_TO_OPEN=3001
else
  MODE="dev"
  PORT_TO_OPEN=5173
fi

if [ "$MODE" = "prod" ]; then
  if [ ! -d "node_modules" ]; then
    echo "Installing server dependencies…"
    npm install --omit=dev
  fi
else
  if [ ! -d "node_modules" ] || [ ! -d "client/node_modules" ]; then
    echo "Installing dependencies…"
    npm run install:all
  fi
fi

# ── If our own instance is already running, just open the browser ─────────────
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Already running (PID $OLD_PID). Opening browser…"
    open "http://localhost:$PORT_TO_OPEN" 2>/dev/null || xdg-open "http://localhost:$PORT_TO_OPEN" 2>/dev/null || true
    exit 0
  else
    rm -f "$PID_FILE"
  fi
fi

# ── Clear any stale processes on our ports ────────────────────────────────────
PORTS_TO_CLEAR=(3001)
[ "$MODE" = "dev" ] && PORTS_TO_CLEAR+=(5173)
for PORT in "${PORTS_TO_CLEAR[@]}"; do
  PIDS=$(lsof -ti tcp:$PORT 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "Clearing stale process(es) on port $PORT (PID $PIDS)…"
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
done

# ── Start in the background (terminal can be closed) ──────────────────────────
echo "Starting Salesforce Org Health Analyzer ($MODE mode)…"
echo "Logs → $LOG"

if [ "$MODE" = "prod" ]; then
  nohup node server/index.js > "$LOG" 2>&1 &
else
  nohup npm run dev > "$LOG" 2>&1 &
fi
NPM_PID=$!
echo $NPM_PID > "$PID_FILE"

# ── Wait for the UI to be ready, then open browser ────────────────────────────
echo "Waiting for server…"
for i in $(seq 1 30); do
  if curl -s "http://localhost:$PORT_TO_OPEN" &>/dev/null; then
    open "http://localhost:$PORT_TO_OPEN" 2>/dev/null || xdg-open "http://localhost:$PORT_TO_OPEN" 2>/dev/null || true
    echo "✓ Opened http://localhost:$PORT_TO_OPEN"
    echo ""
    echo "  The tool is running in the background."
    echo "  To stop it, run:  ./stop.sh"
    echo "  To view logs:     tail -f $LOG"
    exit 0
  fi
  sleep 1
done

echo "WARNING: Server did not respond within 30 s. Check logs: $LOG" >&2
