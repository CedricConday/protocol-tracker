#!/usr/bin/env bash
# Idempotent installer for the Protocol Tracker Web Push service.
# Installs a systemd unit (local, 127.0.0.1:8091) and appends a Caddy block that
# exposes it at https://push.condaydigital.com. Safe to re-run. Needs sudo.
# DNS prerequisite: push.condaydigital.com A -> 138.2.162.173 (DNS-only) so Caddy
# can issue TLS. The systemd part works without DNS; the public HTTPS part does not.
set -euo pipefail

DIR="/home/ubuntu/workspace/bet/protocol-tracker/push-service"
NODE="/home/ubuntu/.nvm/versions/node/v24.16.0/bin/node"
UNIT="/etc/systemd/system/protocol-tracker-push.service"
CADDY="/etc/caddy/Caddyfile"

echo "==> Writing systemd unit ($UNIT)"
sudo tee "$UNIT" >/dev/null <<UNITEOF
[Unit]
Description=Protocol Tracker Web Push scheduler (zero-PHI, T0-driven)
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=$DIR
EnvironmentFile=$DIR/.env
ExecStart=$NODE server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
UNITEOF

sudo systemctl daemon-reload
sudo systemctl enable --now protocol-tracker-push.service
sleep 1
echo -n "==> local service health: "
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8091/health || echo "NO RESPONSE"

echo "==> Caddy: push.condaydigital.com block"
if sudo grep -q "push.condaydigital.com" "$CADDY"; then
  echo "    already present — not appending"
else
  sudo tee -a "$CADDY" >/dev/null <<'CADDYEOF'

push.condaydigital.com {
    reverse_proxy 127.0.0.1:8091
}
CADDYEOF
  echo "    appended"
fi

echo "==> Validating + reloading Caddy"
sudo caddy validate --config "$CADDY" --adapter caddyfile
sudo systemctl reload caddy

echo "==> Done. Public check (needs DNS live):"
echo "    curl -s https://push.condaydigital.com/health"
