#!/usr/bin/env bash
# Self-setup for the home-hub dashboard (Vanilla TS + Vite + bindrjs, served on :8181).
# Run on the target Ubuntu host from inside this directory (sudo-capable user):
#   ./setup.sh
# Idempotent. Builds the static dashboard and serves it under systemd. No GPU/LLM involved.
# bindrjs is now a published npm package (>=1.4.0), so `npm ci` resolves it from the registry —
# no local `npm link` is needed for a deploy (the link workflow is dev-only; see package.json).
set -euo pipefail

SERVICE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_USER="${HOMEHUB_USER:-homehub}"
UNIT="homehub-dashboard.service"
PORT=8181
# Browser → hub URL baked into the build. Defaults to the in-code fallback (the hub LAN IP:8088);
# override by exporting VITE_SERVER_URL before running.
VITE_SERVER_URL="${VITE_SERVER_URL:-}"

log()  { printf '\n==> %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ "$(uname -s)" == "Linux" ]] || die "This installs systemd services — run it on the Ubuntu host, not $(uname -s)."

command -v node >/dev/null 2>&1 || die "Node.js not found. Install Node 18+ (e.g. via NodeSource)."
command -v npm  >/dev/null 2>&1 || die "npm not found (comes with Node.js)."

if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  log "Creating system user '$SERVICE_USER'"
  sudo useradd --system --no-create-home --home-dir "$SERVICE_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
fi

log "Installing dependencies (npm ci — pulls bindrjs from npm)"
( cd "$SERVICE_DIR" && { npm ci || npm install; } )

log "Building (npm run build)"
( cd "$SERVICE_DIR" && { [[ -n "$VITE_SERVER_URL" ]] && export VITE_SERVER_URL; npm run build; } )

sudo chown -R "$SERVICE_USER:$SERVICE_USER" "$SERVICE_DIR"

log "Installing systemd unit ($UNIT)"
# Serve the built dist/ with Vite's preview server (vite is already a devDependency, so no extra
# package is needed). nginx proxies '/' → :${PORT}.
sudo tee "/etc/systemd/system/$UNIT" >/dev/null <<UNITEOF
[Unit]
Description=home-hub dashboard (static Vite build, :${PORT})
After=network-online.target homehub-server.service
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${SERVICE_DIR}
ExecStart=${SERVICE_DIR}/node_modules/.bin/vite preview --config vite.config.js --host 0.0.0.0 --port ${PORT}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
UNITEOF
sudo systemctl daemon-reload
sudo systemctl enable --now "$UNIT"

log "Done. Check: systemctl status $UNIT  |  curl -I localhost:${PORT}"
warn "The hub URL is baked in at build time. If the hub isn't at the in-code default, re-run with VITE_SERVER_URL set."
