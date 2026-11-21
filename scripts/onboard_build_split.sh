#!/bin/bash
# ONBOARD BUILD SPLIT - 12 testes ANTES de corrigir vite.config.ts
# Sem exit, sem pkill, sem kill. Se falhar, NAO corrige.
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
echo "===== ONBOARD BUILD SPLIT ====="
teste "Esta em parametrIX" "[ -f ./package.json ] && [ -f ./vite.config.ts ] && [ -f ./src/App.tsx ]"
teste "Node e v22.x" "node --version 2>/dev/null | grep -q '^v22\.'"
teste "Backup existe" "[ -f vite.config.ts.bak ] && [ -f src/App.tsx.bak ]"
teste "vite.config sem __dirname" "! grep -q __dirname vite.config.ts"
teste "vite.config tem import.meta.dirname" "grep -q import.meta.dirname vite.config.ts"
teste "manualChunks NAO e objeto" "! grep -q 'manualChunks: {' vite.config.ts"
teste "manualChunks e funcao" "grep -q 'manualChunks: (id' vite.config.ts"
teste "App.tsx tem lazy" "grep -q 'lazy(' src/App.tsx"
teste "App.tsx tem Suspense" "grep -q 'Suspense' src/App.tsx"
teste "App.tsx NAO importa Frostbite direto" "! grep -q \"import { FrostbiteRackDashboard }\" src/App.tsx"
teste "App.tsx NAO importa Ecosystem direto" "! grep -q \"import { EcosystemHubPanel\" src/App.tsx"
teste "RAM available mais de 800MB" "[ $(free -m | grep '^Mem:' | awk '{print $7}') -gt 800 ]"
echo ""
echo "PASS: $PASSED / $TOTAL"
echo "FAIL: $FAILED / $TOTAL"
if [ "$FAILED" -gt 0 ]; then
  echo "NAO CORRIGE. Tem $FAILED falhando."
else
  echo "TODOS PASSARAM. Pode corrigir vite.config.ts e rodar build."
fi
echo "===== FIM ONBOARD BUILD SPLIT ====="
