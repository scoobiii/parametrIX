#!/usr/bin/env bash
# Setup anti-crash e resumivel: Hermes (Git) + Qwen 0.5B (32k) + Parametrix MCP + Search + VUC
# NUNCA usa exit/pkill que matem a sessao interativa ao rodar com `source` ou bash.
set -u

export PATH="/usr/local/node22/bin:/usr/bin:/usr/local/bin:${PATH:-}"
PARAMETRIX_URL="${PARAMETRIX_URL:-http://127.0.0.1:3000}"
LLAMA_PORT="${LLAMA_PORT:-11435}"
HERMES_CTX="${HERMES_CTX:-32768}"
HERMES_DIR="${HERMES_DIR:-$HOME/hermes-agent}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_FILE="${HOME}/parametrix_hermes_setup.log"

PASS=0
FAIL=0
: > "$LOG_FILE"

log_msg() { echo "[$(date +%H:%M:%S)] $1" | tee -a "$LOG_FILE"; }
mark_ok() { PASS=$((PASS + 1)); log_msg "[PASS $PASS] $1"; }
mark_fail() { FAIL=$((FAIL + 1)); log_msg "[WARN/FAIL] $1"; }

log_msg "=== SETUP HERMES + QWEN 0.5B + PARAMETRIX MCP + VUC ==="

# 1. Validar Node >= 22 (nunca usar Node Termux/apt v20 quebrado dentro do proot)
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

# 2. Instalar Skill e Bridge STDIO do Parametrix para o Hermes (idempotente)
mkdir -p "$HOME/.hermes/skills/parametrix" "$HOME/.hermes/mcp" "$HOME/.config/hermes"
cp -f "$SCRIPT_DIR/PARAMETRIX_SKILL.md" "$HOME/.hermes/skills/parametrix/SKILL.md" && mark_ok "Skill instalada em ~/.hermes/skills/parametrix/SKILL.md" || mark_fail "Falha ao copiar SKILL.md"
cp -f "$SCRIPT_DIR/parametrix_mcp_stdio.py" "$HOME/.hermes/mcp/parametrix_mcp_stdio.py" && chmod +x "$HOME/.hermes/mcp/parametrix_mcp_stdio.py" && mark_ok "Bridge STDIO instalado em ~/.hermes/mcp/parametrix_mcp_stdio.py" || mark_fail "Falha ao instalar bridge STDIO"

# 3. Configurar ~/.hermes/config.yaml e ~/.config/hermes/config.yaml com contexto 32k + MCP Parametrix
write_hermes_yaml() {
  local target="$1"
  cat > "$target" <<YAML
# Gerado por setup_parametrix_hermes.sh (anti-crash, 32k + Parametrix MCP + VUC + Search)
providers:
  qwen05b:
    base_url: http://127.0.0.1:${LLAMA_PORT}/v1
    model: qwen2.5-coder:0.5b
    api_key: local
    context_length: ${HERMES_CTX}
default_provider: qwen05b
context_length: ${HERMES_CTX}
mcp_servers:
  parametrix:
    command: python3
    args:
      - ${HOME}/.hermes/mcp/parametrix_mcp_stdio.py
    env:
      PARAMETRIX_URL: ${PARAMETRIX_URL}
YAML
}

write_hermes_yaml "$HOME/.hermes/config.yaml" && mark_ok "Config salvo em ~/.hermes/config.yaml" || mark_fail "Falha ~/.hermes/config.yaml"
write_hermes_yaml "$HOME/.config/hermes/config.yaml" && mark_ok "Config salvo em ~/.config/hermes/config.yaml" || mark_fail "Falha ~/.config/hermes/config.yaml"

# 4. Patch automatico opcional do gate 64000 -> 32000 caso ~/hermes-agent esteja clonado
if [ -d "$HERMES_DIR" ]; then
  mark_ok "Hermes Git encontrado em $HERMES_DIR"
  PATCHED_FILES="$(grep -rlE '64000|64_000' "$HERMES_DIR" --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.venv-hermes 2>/dev/null || true)"
  if [ -n "$PATCHED_FILES" ]; then
    for pf in $PATCHED_FILES; do
      sed -i 's/64000/32000/g; s/64_000/32_000/g' "$pf" 2>/dev/null || true
    done
    mark_ok "Gate de contexto ajustado para ${HERMES_CTX} no Hermes Git"
  else
    mark_ok "Gate 64000 ja ajustado ou ausente no Hermes Git"
  fi
else
  log_msg "[INFO] Clone Hermes opcional nao encontrado em $HERMES_DIR (ok se estiver em outro diretorio)."
fi

# 5. Descobrir GGUF real no ambiente (Coder ou Instruct 0.5B) sem inventar caminho
FOUND_GGUF="$(find "$REPO_ROOT/models" "$HOME" -maxdepth 4 -type f -name '*qwen*0.5b*.gguf' 2>/dev/null | head -n 1 || true)"
if [ -n "$FOUND_GGUF" ]; then
  GGUF_SIZE="$(wc -c < "$FOUND_GGUF")"
  mark_ok "GGUF detectado: $FOUND_GGUF (${GGUF_SIZE} bytes)"
else
  log_msg "[INFO] Nenhum *qwen*0.5b*.gguf encontrado ainda. Para baixar: npm run llm:install-qwen"
fi

# 6. Checar servidor Parametrix MCP + Search + VUC e porta 11435 (sem falhar fatalmente)
if curl -fsS -m 4 -X POST "${PARAMETRIX_URL}/api/mcp" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -q '"cad_get_bbox"'; then
  mark_ok "Parametrix MCP respondendo em ${PARAMETRIX_URL}/api/mcp"
else
  mark_fail "Parametrix MCP offline em ${PARAMETRIX_URL}/api/mcp (suba npm run dev)"
fi

if curl -fsS -m 4 -X POST "${PARAMETRIX_URL}/api/hermes/search" -H 'content-type: application/json' -d '{"query":"engrenagem M2 Z24","includeWeb":false}' | grep -q '"vucCertificate"'; then
  mark_ok "Parametrix Hermes Search + VUC operacional em ${PARAMETRIX_URL}/api/hermes/search"
else
  mark_fail "Endpoint /api/hermes/search indisponivel (suba npm run dev)"
fi

if curl -fsS -m 2 "http://127.0.0.1:${LLAMA_PORT}/v1/models" >/dev/null 2>&1; then
  mark_ok "Servidor Qwen local ativo na porta ${LLAMA_PORT}"
else
  log_msg "[INFO] Porta ${LLAMA_PORT} sem listener agora. Suba llama-server/Ollama com -c ${HERMES_CTX} na porta ${LLAMA_PORT}."
fi

HASH_LOG="$(sha256sum "$LOG_FILE" 2>/dev/null | awk '{print $1}' || echo 'no-sha256')"
log_msg "=== RESUMO PASS=$PASS WARN/FAIL=$FAIL SHA256_LOG=$HASH_LOG ==="
echo "Proximo: curl -sSf ${PARAMETRIX_URL}/api/hermes/status"
