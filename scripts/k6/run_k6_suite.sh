#!/usr/bin/env bash
# Executa o contrato k6 (HTTP/MCP/REST/WebSocket) e o stress test Node.
set -euo pipefail

PARAMETRIX_URL="${PARAMETRIX_URL:-http://127.0.0.1:3000}"
REQUIRE_K6="${REQUIRE_K6:-${CI:+1}}"
REQUIRE_K6="${REQUIRE_K6:-0}"

if command -v k6 >/dev/null 2>&1; then
  echo "[PASS] k6 encontrado: $(k6 version)"
  PARAMETRIX_URL="$PARAMETRIX_URL" \
    MCP_TOKEN="${MCP_TOKEN:-}" \
    EXPECT_429="${EXPECT_429:-0}" \
    k6 run scripts/k6/parametrix_ws_load.js
else
  if [[ "$REQUIRE_K6" == "1" ]]; then
    echo "[FAIL] k6 não está instalado; CI não pode mascarar a ausência do contrato de carga." >&2
    echo "       Instale k6 (https://grafana.com/docs/k6/latest/set-up/install-k6/) ou use a action oficial no workflow." >&2
    exit 127
  fi
  echo "[INFO] k6 não instalado localmente; contrato preservado em scripts/k6/parametrix_ws_load.js."
  echo "       Executando fallback Node/TypeScript equivalente. Use REQUIRE_K6=1 para tornar a ausência um erro."
  PARAMETRIX_URL="$PARAMETRIX_URL" MCP_TOKEN="${MCP_TOKEN:-}" EXPECT_429="${EXPECT_429:-0}" \
    npx tsx scripts/k6/node_mcp_contract.ts
fi

echo "[RUN] Stress test WebSocket /ws + Relay MCP bidirecional + VUC Ed25519..."
PARAMETRIX_URL="$PARAMETRIX_URL" npx tsx scripts/k6/node_ws_stress.ts
