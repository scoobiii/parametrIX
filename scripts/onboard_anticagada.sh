#!/usr/bin/env bash
# ONBOARD ANTI-CAGADA — Parametrix CAD Studio
# Diagnóstico somente leitura: não instala, remove, mata processos ou troca Node.
# Inclui perfil MOBILE_LITE para Android/Termux/Proot com baixa infraestrutura.

PASSED=0
FAILED=0
TOTAL=0

section() {
  echo
  echo "===== $1 ====="
}

teste() {
  TOTAL=$((TOTAL + 1))
  local label="$1"
  local command="$2"
  if eval "$command" >/dev/null 2>&1; then
    echo "PASS TESTE $TOTAL: $label"
    PASSED=$((PASSED + 1))
  else
    echo "FAIL TESTE $TOTAL: $label"
    FAILED=$((FAILED + 1))
  fi
}

info() {
  echo "INFO: $*"
}

export PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
hash -r 2>/dev/null || true

section "ONBOARD PARAMETRIX — AMBIENTE ANTES DE EXECUTAR"
echo "Data: $(date)"
echo "Diretório: $(pwd)"
echo "Este script é somente leitura. Ele não corrige Node nem instala dependências."

section "RUNTIME LINUX"
teste "Esta em parametrIX" "[ -f ./package.json ] && [ -f ./server.ts ]"
teste "Proot Debian" "[ -f /etc/debian_version ]"
teste "Node existe" "command -v node"
teste "Node Linux ARM64" "[ \"$(node -p 'process.platform' 2>/dev/null)\" = linux ] && [ \"$(node -p 'process.arch' 2>/dev/null)\" = arm64 ]"
teste "Node >= 24.12" "node -e 'const [a,b]=process.versions.node.split(\".\").map(Number); process.exit(a > 24 || (a === 24 && b >= 12) ? 0 : 1)' 2>/dev/null"
teste "Node não é o executável Termux" "[ \"$(node -p 'process.execPath' 2>/dev/null)\" != /data/data/com.termux/files/usr/bin/node ]"
teste "npm existe e não é Termux" "command -v npm && case \"$(readlink -f \"$(command -v npm)\")\" in /data/data/com.termux/*) false;; *) true;; esac"
teste "tsx local existe" "[ -x ./node_modules/.bin/tsx ]"

section "DEPENDÊNCIAS NATIVAS E BUILD"
teste "package.json tem build/dev" "grep -q '\"build\"' package.json && grep -q '\"dev\"' package.json"
teste "Vite executável" "[ -x ./node_modules/.bin/vite ]"
teste "Binding Rolldown Linux ARM64" "find node_modules -type f -path '*binding-linux-arm64-gnu*' -name '*.node' -print -quit 2>/dev/null | grep -q ."
teste "Sem binding Rolldown Android" "! find node_modules -type f -path '*binding-android*' -print -quit 2>/dev/null | grep -q ."
teste "server.ts não vazio" "[ -s server.ts ]"
teste "vite.config.ts existe" "[ -f vite.config.ts ]"
teste ".npmrc usa legacy-peer-deps" "grep -q '^legacy-peer-deps=true' .npmrc 2>/dev/null"

section "RECURSOS DO DISPOSITIVO"
teste "Disco com mais de 1 GB livre" "[ \$(df -Pm . | awk 'NR==2 {print \$4}') -gt 1024 ]"
teste "RAM disponível acima de 500 MB" "[ \$(free -m | awk '/^Mem:/ {print \$7}') -gt 500 ]"

section "RESULTADO DO ONBOARD"
echo "PASS: $PASSED / $TOTAL"
echo "FAIL: $FAILED / $TOTAL"

section "PERFIL MOBILE_LITE — ANDROID/TERMUX/PROOT"
cat <<'LITE'
Comando validado para baixa infraestrutura:

  termux-wake-lock
  export PATH=/usr/bin:/bin:/usr/sbin:/sbin
  NODE_OPTIONS="--max-old-space-size=384" \
    ./node_modules/.bin/tsx server.ts 2>&1 | tee /tmp/parametrix-server-lite.log

Regras do perfil Lite:
  - não usar --watch;
  - não executar npm install durante o boot;
  - não iniciar uma segunda instância na porta 3000;
  - manter o Termux em primeiro plano durante o teste;
  - validar com: curl -I http://127.0.0.1:3000/;
  - esperar HTTP 200 antes de abrir o Chrome.
LITE

section "LLM LOCAL OFFLINE — CAPACIDADE REAL"
if [ -f src/kernel/llmBootstrap.ts ] && grep -q "local-llm" src/kernel/llmBootstrap.ts; then
  info "Bootstrap/seletor local presente: recomenda tier e modelo por CPU/RAM/GPU."
else
  info "Bootstrap local não encontrado."
fi
if grep -q "localhost.*11434\|/api/generate" server.ts src/components/AgentVoiceCommandBar.tsx 2>/dev/null; then
  info "Ponte Ollama/llama.cpp presente: inferência local é suportada por endpoint localhost."
else
  info "Ponte Ollama/llama.cpp não encontrada."
fi
if command -v curl >/dev/null 2>&1 && curl -fsS --max-time 1 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  echo "PASS LLM LOCAL: runtime Ollama respondeu em localhost:11434"
else
  echo "INFO LLM LOCAL: nenhum runtime Ollama respondeu em localhost:11434"
  echo "INFO LLM LOCAL: o seletor está pronto, mas não há prova de inferência offline neste boot"
fi

if [ "$FAILED" -gt 0 ]; then
  echo "ONBOARD REPROVADO: corrija os itens FAIL antes de instalar ou iniciar."
  exit 1
fi

echo "ONBOARD APROVADO: ambiente compatível com o perfil MOBILE_LITE."
exit 0
