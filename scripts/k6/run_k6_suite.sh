#!/usr/bin/env bash
# Executa k6 nativo (se instalado no host) + stress test WebSocket real em Node 22 com prova VUC Ed25519.
set -u

export PATH="/usr/local/node22/bin:/usr/bin:/usr/local/bin:${PATH:-}"
PARAMETRIX_URL="${PARAMETRIX_URL:-http://127.0.0.1:3000}"

if command -v k6 >/dev/null 2>&1; then
  echo "[PASS] k6 encontrado: $(k6 version)"
  PARAMETRIX_URL="$PARAMETRIX_URL" k6 run scripts/k6/parametrix_ws_load.js
else
  echo "[INFO] Binario nativo k6 nao instalado neste ambiente; mantendo script oficial em scripts/k6/parametrix_ws_load.js."
fi

echo "[RUN] Stress test WebSocket /ws + Relay MCP bidirecional + VUC Ed25519..."
PARAMETRIX_URL="$PARAMETRIX_URL" npx tsx scripts/k6/node_ws_stress.ts
