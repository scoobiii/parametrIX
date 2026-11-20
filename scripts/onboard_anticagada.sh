#!/bin/bash
# ONBOARD ANTI-CAGADA - Parametrix - 14 testes ANTES de corrigir Node
# Sem exit, sem pkill, sem kill. Anti-falha, resumivel.
FAILED=0
PASSED=0
TOTAL=0
teste() {
  TOTAL=$((TOTAL + 1))
  if eval "$2"; then
    echo "PASS TESTE $TOTAL: $1"
    PASSED=$((PASSED + 1))
  else
    echo "FAIL TESTE $TOTAL: $1"
    FAILED=$((FAILED + 1))
  fi
}
echo "===== ONBOARD ANTI-CAGADA ====="
echo "Data: $(date)"
teste "Esta em parametrIX" "[ -f ./package.json ] && [ -f ./server.ts ]"
teste "PATH nao comeca com Termux" "case \"$PATH\" in *com.termux*) false;; *) true;; esac"
teste "which node nao e Termux" "[ \"$(which node)\" != \"/data/data/com.termux/files/usr/bin/node\" ]"
teste "node existe" "command -v node >/dev/null 2>&1"
teste "node e v22.x" "node --version 2>/dev/null | grep -q '^v22\.'"
teste "npm existe e nao e Termux" "command -v npm >/dev/null 2>&1 && case \"$(which npm)\" in *com.termux*) false;; *) true;; esac"
teste "corepack existe" "command -v corepack >/dev/null 2>&1"
teste "Disco mais de 1G livre" "[ $(df -m . | tail -1 | awk '{print $4}') -gt 1024 ]"
teste "RAM available mais de 800MB" "[ $(free -m | grep '^Mem:' | awk '{print $7}') -gt 800 ]"
teste "package.json tem dev" "grep -q '\"dev\"' package.json"
teste "Sem binding Android" "[ ! -d node_modules/@rolldown/binding-android-arm64 ]"
teste "server.ts nao vazio" "[ -s server.ts ]"
teste "vite.config.ts existe" "[ -f vite.config.ts ]"
teste "Esta no proot Debian" "[ -f /etc/debian_version ]"
echo ""
echo "PASS: $PASSED / $TOTAL"
echo "FAIL: $FAILED / $TOTAL"
if [ "$FAILED" -gt 0 ]; then
  echo "NAO CORRIGE O NODE. Tem $FAILED falhando. Roda de novo depois de corrigir."
else
  echo "TODOS PASSARAM. Corrigindo Node agora..."
  export PATH=/usr/bin:/usr/local/bin:$PATH
  hash -r
  echo "Node travado: $(which node) $(node --version)"
  corepack enable
  corepack prepare npm@10.9.0 --activate
  echo "npm travado: $(which npm) $(npm --version)"
  node --version | grep -q '^v22\.' && echo "Node continua v22.x OK" || echo "Node mudou, revisa PATH"
  echo "Proximo: rm -rf node_modules && npm i && npm run build"
fi
echo "===== FIM ONBOARD ====="
