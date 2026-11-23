#!/usr/bin/env bash
# Setup anti-crash e resumivel para familia Claw baixa renda:
# OpenClaw (~/.openclaw/openclaw.json) + NanoClaw (~/.nanoclaw/config.yaml) + PicoClaw (~/.picoclaw/config.json)
# Compartilha Qwen 0.5B (:11435, 32k), Bridge STDIO MCP (<600 tokens) e VUC (SHA-256 + Ed25519).
# NUNCA usa exit ou pkill que matem a sessao interativa.
set -u

export PATH="/usr/local/node22/bin:/usr/bin:/usr/local/bin:${PATH:-}"
PARAMETRIX_URL="${PARAMETRIX_URL:-http://127.0.0.1:3000}"
LLAMA_PORT="${LLAMA_PORT:-11435}"
CLAW_CTX="${CLAW_CTX:-32768}"
QWEN_MODEL="${QWEN_MODEL:-qwen2.5-coder:0.5b}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BRIDGE_DST="${HOME}/.hermes/mcp/parametrix_mcp_stdio.py"
LOG_FILE="${HOME}/parametrix_claw_setup.log"

PASS=0
FAIL=0
: > "$LOG_FILE"

log_msg() { echo "[$(date +%H:%M:%S)] $1" | tee -a "$LOG_FILE"; }
mark_ok() { PASS=$((PASS + 1)); log_msg "[PASS $PASS] $1"; }
mark_fail() { FAIL=$((FAIL + 1)); log_msg "[WARN/FAIL] $1"; }

log_msg "=== SETUP OPENCLAW + NANOCLAW + PICOCLAW + QWEN 0.5B + PARAMETRIX MCP + VUC ==="

# 1. Pre-requisitos (Node >= 22, python3, curl, sha256sum)
if command -v node >/dev/null 2>&1; then
  NODE_VER="$(node -v | sed 's/^v//')"
  NODE_MAJOR="${NODE_VER%%.*}"
  if [ "${NODE_MAJOR:-0}" -ge 22 ]; then
    mark_ok "Node $(node -v) em $(command -v node)"
  else
    mark_fail "Node $(node -v) < 22. Exporte PATH=/usr/local/node22/bin:\$PATH"
  fi
else
  mark_fail "Node nao encontrado"
fi

command -v python3 >/dev/null 2>&1 && mark_ok "python3 $(python3 --version)" || mark_fail "python3 ausente"
command -v curl >/dev/null 2>&1 && mark_ok "curl disponivel" || mark_fail "curl ausente"
command -v sha256sum >/dev/null 2>&1 && mark_ok "sha256sum disponivel" || mark_fail "sha256sum ausente"

# 2. Instalar Bridge STDIO compartilhada + Skill compacta (<600 tokens)
mkdir -p \
  "$HOME/.hermes/mcp" \
  "$HOME/.openclaw/skills/parametrix" \
  "$HOME/.nanoclaw/skills/parametrix" \
  "$HOME/.picoclaw/workspace/skills/parametrix"

cp -f "$SCRIPT_DIR/parametrix_mcp_stdio.py" "$BRIDGE_DST" && chmod +x "$BRIDGE_DST" && mark_ok "Bridge STDIO compartilhada instalada em $BRIDGE_DST" || mark_fail "Falha ao instalar bridge STDIO"
cp -f "$SCRIPT_DIR/PARAMETRIX_SKILL.md" "$HOME/.openclaw/skills/parametrix/SKILL.md" \
  && cp -f "$SCRIPT_DIR/PARAMETRIX_SKILL.md" "$HOME/.nanoclaw/skills/parametrix/SKILL.md" \
  && cp -f "$SCRIPT_DIR/PARAMETRIX_SKILL.md" "$HOME/.picoclaw/workspace/skills/parametrix/SKILL.md" \
  && mark_ok "Skills SKILL.md (<600 tokens) gravadas em OpenClaw, NanoClaw e PicoClaw" || mark_fail "Falha ao gravar skills"

# 3. Gerar ~/.openclaw/openclaw.json (JSON estrito validado para Zod do OpenClaw)
cat > "$HOME/.openclaw/openclaw.json" <<JSON
{
  "models": {
    "mode": "merge",
    "providers": {
      "qwen05b": {
        "baseUrl": "http://127.0.0.1:${LLAMA_PORT}/v1",
        "apiKey": "local",
        "api": "openai-completions",
        "models": [
          {
            "id": "${QWEN_MODEL}",
            "name": "Qwen 0.5B Local (${CLAW_CTX} ctx)",
            "contextWindow": ${CLAW_CTX},
            "maxTokens": 4096
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "qwen05b/${QWEN_MODEL}"
      }
    }
  },
  "mcp": {
    "servers": {
      "parametrix": {
        "command": "python3",
        "args": [
          "${BRIDGE_DST}"
        ],
        "env": {
          "PARAMETRIX_URL": "${PARAMETRIX_URL}"
        }
      }
    }
  }
}
JSON

if python3 -m json.tool "$HOME/.openclaw/openclaw.json" >/dev/null 2>&1; then
  mark_ok "OpenClaw config JSON valido em ~/.openclaw/openclaw.json"
else
  mark_fail "JSON invalido em ~/.openclaw/openclaw.json"
fi

# 4. Gerar ~/.nanoclaw/config.yaml (sandbox-ready)
cat > "$HOME/.nanoclaw/config.yaml" <<YAML
# NanoClaw Sandbox + Qwen 0.5B + Parametrix MCP + VUC
provider:
  type: openai
  base_url: http://127.0.0.1:${LLAMA_PORT}/v1
  api_key: local
  model: ${QWEN_MODEL}
  context_length: ${CLAW_CTX}
mcp:
  sandbox: true
  servers:
    parametrix:
      command: python3
      args:
        - ${BRIDGE_DST}
      env:
        PARAMETRIX_URL: ${PARAMETRIX_URL}
YAML
[ -s "$HOME/.nanoclaw/config.yaml" ] && mark_ok "NanoClaw config salvo em ~/.nanoclaw/config.yaml" || mark_fail "Falha ~/.nanoclaw/config.yaml"

# 5. Gerar ~/.picoclaw/config.json (Go ultra-leve ~10MB RAM)
cat > "$HOME/.picoclaw/config.json" <<JSON
{
  "version": 2,
  "agents": {
    "defaults": {
      "workspace": "${HOME}/.picoclaw/workspace",
      "model_name": "qwen05b",
      "max_tokens": 2048,
      "temperature": 0.2
    }
  },
  "model_list": [
    {
      "model_name": "qwen05b",
      "model": "openai/${QWEN_MODEL}",
      "api_base": "http://127.0.0.1:${LLAMA_PORT}/v1",
      "api_key": "local"
    }
  ],
  "tools": {
    "mcp": {
      "enabled": true,
      "servers": [
        {
          "name": "parametrix",
          "transport": "stdio",
          "command": "python3",
          "args": [
            "${BRIDGE_DST}"
          ],
          "env": {
            "PARAMETRIX_URL": "${PARAMETRIX_URL}"
          }
        }
      ]
    }
  }
}
JSON

if python3 -m json.tool "$HOME/.picoclaw/config.json" >/dev/null 2>&1; then
  mark_ok "PicoClaw config JSON valido em ~/.picoclaw/config.json"
else
  mark_fail "JSON invalido em ~/.picoclaw/config.json"
fi

# 6. Detectar binarios Claw e GGUF 0.5B reais no ambiente (informativo sem inventar)
for cli in openclaw nanoclaw picoclaw; do
  if command -v "$cli" >/dev/null 2>&1; then
    mark_ok "Binario ${cli} detectado em $(command -v "$cli")"
  else
    log_msg "[INFO] CLI ${cli} ainda nao instalada no PATH (configs e bridge MCP ja gravados)."
  fi
done

FOUND_GGUF="$(find "$REPO_ROOT/models" "$HOME" -maxdepth 4 -type f -name '*qwen*0.5b*.gguf' 2>/dev/null | head -n 1 || true)"
if [ -n "$FOUND_GGUF" ]; then
  mark_ok "GGUF Qwen 0.5B encontrado: $FOUND_GGUF"
else
  log_msg "[INFO] Nenhum *qwen*0.5b*.gguf encontrado ainda. Para baixar: MODEL_VARIANT=coder npm run llm:install-qwen"
fi

# 7. Validar endpoints reais Parametrix MCP, Claw Bundle & Search VUC
if curl -fsS -m 4 "${PARAMETRIX_URL}/api/claw/status" | grep -q '"readyForClaw":true'; then
  mark_ok "Parametrix Claw Status operacional em ${PARAMETRIX_URL}/api/claw/status"
else
  mark_fail "Parametrix /api/claw/status indisponivel (suba npm run dev)"
fi

if curl -fsS -m 4 -X POST "${PARAMETRIX_URL}/api/mcp" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -q '"cad_get_bbox"'; then
  mark_ok "Parametrix MCP JSON-RPC respondendo em ${PARAMETRIX_URL}/api/mcp"
else
  mark_fail "Parametrix /api/mcp offline (suba npm run dev)"
fi

HASH_LOG="$(sha256sum "$LOG_FILE" 2>/dev/null | awk '{print $1}' || echo 'no-sha256')"
log_msg "=== RESUMO CLAW PASS=$PASS WARN/FAIL=$FAIL SHA256_LOG=$HASH_LOG ==="
echo "Proximo: curl -sSf ${PARAMETRIX_URL}/api/claw/status"
