#!/bin/bash
# ONBOARD VENDOR-THREE - 5 testes ANTES de corrigir
FAILED=0; PASSED=0; TOTAL=0
teste() {
  TOTAL=$((TOTAL+1))
  if eval "$2"; then echo "PASS $TOTAL: $1"; PASSED=$((PASSED+1)); else echo "FAIL $TOTAL: $1"; FAILED=$((FAILED+1)); fi
}
echo "===== ONBOARD VENDOR-THREE ====="
teste "vite.config existe" "[ -f vite.config.ts ]"
teste "vite.config tem manualChunks funcao" "grep -q 'manualChunks: (id' vite.config.ts"
teste "vite.config TEM vendor-three" "grep -q 'vendor-three' vite.config.ts"
teste "three instalado" "[ -d node_modules/three ]"
teste "App usa three via Viewport" "grep -rq 'three' src/components/Viewport3D.tsx src/App.tsx 2>/dev/null"
echo ""
echo "PASS: $PASSED / $TOTAL"
echo "FAIL: $FAILED / $TOTAL"
echo "===== FIM ====="
