#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/.server.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "No running instance found (no .server.pid file)."
  exit 0
fi

PID=$(cat "$PID_FILE")

if ! kill -0 "$PID" 2>/dev/null; then
  echo "Process $PID is not running. Cleaning up."
  rm -f "$PID_FILE"
  exit 0
fi

# Kill the npm process group so concurrently + child processes all stop
kill -- -$(ps -o pgid= -p "$PID" | tr -d ' ') 2>/dev/null || kill "$PID" 2>/dev/null
rm -f "$PID_FILE"
echo "Salesforce Org Health Analyzer stopped."
