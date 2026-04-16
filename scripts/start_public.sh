#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${TMPDIR:-/tmp}/antigravity-manager"
FRONTEND_LOG="$STATE_DIR/frontend.log"
FRONTEND_TUNNEL_LOG="$STATE_DIR/tunnel_frontend.log"
BACKEND_TUNNEL_LOG="$STATE_DIR/tunnel_backend.log"
SUMMARY_FILE="$STATE_DIR/last_run.env"

mkdir -p "$STATE_DIR"

# Load persisted env defaults if present
if [[ -f "$ROOT_DIR/docker/.env.public-https" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/docker/.env.public-https"
  set +a
fi

API_KEY="${API_KEY:-test}"
WEB_PASSWORD="${WEB_PASSWORD:-change-me-admin}"
LOG_LEVEL="${LOG_LEVEL:-info}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: missing command: $1"
    exit 1
  fi
}

extract_tunnel_url() {
  local log_file="$1"
  local max_wait_seconds="${2:-45}"
  local waited=0

  while [[ "$waited" -lt "$max_wait_seconds" ]]; do
    if [[ -f "$log_file" ]]; then
      local url
      url="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$log_file" | tail -1 || true)"
      if [[ -n "$url" ]]; then
        echo "$url"
        return 0
      fi
    fi
    sleep 1
    waited=$((waited + 1))
  done

  return 1
}

echo "Starting Antigravity in public mode..."

require_cmd docker
require_cmd npm
require_cmd cloudflared

# Stop old processes to avoid stale tunnels/ports
pkill -f "vite --host 0.0.0.0 --port 5173" >/dev/null 2>&1 || true
pkill -f "cloudflared tunnel --url http://localhost:5173" >/dev/null 2>&1 || true
pkill -f "cloudflared tunnel --url http://localhost:8045" >/dev/null 2>&1 || true

# (Re)start backend container with known credentials
if docker ps -a --format '{{.Names}}' | grep -qx 'antigravity-manager'; then
  docker rm -f antigravity-manager >/dev/null 2>&1 || true
fi

docker run -d \
  --name antigravity-manager \
  -p 8045:8045 \
  -v "$HOME/.antigravity_tools:/root/.antigravity_tools" \
  -e LOG_LEVEL="$LOG_LEVEL" \
  -e API_KEY="$API_KEY" \
  -e WEB_PASSWORD="$WEB_PASSWORD" \
  -e ABV_BIND_LOCAL_ONLY=false \
  lbjlaq/antigravity-manager >/dev/null

# Start frontend dev server
cd "$ROOT_DIR"
nohup npm run dev -- --host 0.0.0.0 --port 5173 >"$FRONTEND_LOG" 2>&1 &

# Start tunnels
nohup cloudflared tunnel --url http://localhost:5173 >"$FRONTEND_TUNNEL_LOG" 2>&1 &
nohup cloudflared tunnel --url http://localhost:8045 >"$BACKEND_TUNNEL_LOG" 2>&1 &

FRONTEND_URL="$(extract_tunnel_url "$FRONTEND_TUNNEL_LOG" 60 || true)"
BACKEND_URL="$(extract_tunnel_url "$BACKEND_TUNNEL_LOG" 60 || true)"

cat > "$SUMMARY_FILE" <<EOF
FRONTEND_URL=$FRONTEND_URL
API_BASE_URL=$BACKEND_URL
WEB_PASSWORD=$WEB_PASSWORD
API_KEY=$API_KEY
EOF

echo
if [[ -n "$FRONTEND_URL" ]]; then
  echo "Frontend URL: $FRONTEND_URL"
else
  echo "Frontend URL: NOT READY (check $FRONTEND_TUNNEL_LOG)"
fi

if [[ -n "$BACKEND_URL" ]]; then
  echo "API Base URL: $BACKEND_URL"
else
  echo "API Base URL: NOT READY (check $BACKEND_TUNNEL_LOG)"
fi

echo "Web Password: $WEB_PASSWORD"
echo "API Key: $API_KEY"
echo "Saved summary: $SUMMARY_FILE"
