#!/bin/bash
# Bootstrap resiliente, anti-falha e resumável (sem exit / pkill) para Parametrix CAD / FrostbiteEngine

echo "=== [1/7] AMBIENTE ==="
echo "node: $(which node 2>/dev/null || echo 'nao achado')"
node --version 2>&1 || echo "WARN: node falhou"
echo "npm: $(which npm 2>/dev/null || echo 'nao achado')"
uname -m
echo "PWD: $(pwd)"
echo ""

echo "=== [2/7] DETECTA TERMUX vs DEBIAN vs NODE < 22 ==="
NODE_BIN=$(which node 2>/dev/null || echo "")
if echo "$NODE_BIN" | grep -q "com.termux"; then
  echo "ERRO: Node do Termux detectado ($NODE_BIN) - quebra rolldown/dlopen dentro do proot."
  echo "CORRECAO: export PATH=/usr/local/node22/bin:/usr/bin:/usr/local/bin:\$PATH"
  echo "Onboard pausado aqui. Troque o Node e rode de novo."
fi

NODE_MAJOR=$(node --version 2>/dev/null | sed 's/v//;s/\..*//')
NODE_MAJOR=${NODE_MAJOR:-0}
echo "Node major: $NODE_MAJOR"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "ERRO: Precisa Node >= 22, atual e $NODE_MAJOR."
  echo "Instale Node 22 via NodeSource ou tarball antes de continuar."
else
  echo "OK: Node >= 22 verificado."
fi
echo ""

echo "=== [3/7] GIT + GITIGNORE ==="
git config user.email "sobrinhosj@gmail.com" 2>/dev/null || echo "WARN: git config email pulado"
git config user.name "scoobiii" 2>/dev/null || echo "WARN: git config name pulado"
touch .gitignore
grep -q "data/parametrix.db" .gitignore || echo "data/parametrix.db" >> .gitignore
grep -q "data/\*.db" .gitignore || echo "data/*.db" >> .gitignore
grep -q "data/\*.sqlite\*" .gitignore || echo "data/*.sqlite*" >> .gitignore
grep -q "node_modules/" .gitignore || echo "node_modules/" >> .gitignore
echo "OK: .gitignore travado para bancos locais (.db / .sqlite)."
echo ""

echo "=== [4/7] DEPENDENCIAS ==="
if [ ! -d node_modules ]; then
  echo "node_modules ausente, instalando..."
  npm install --legacy-peer-deps 2>&1 | tail -n 20
else
  echo "node_modules ja existe, pulando install."
fi
echo ""

echo "=== [5/7] VERIFICACAO ARM64 / ROLLDOWN WASM FALLBACK ==="
ARCH=$(uname -m)
if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
  echo "Arquitetura ARM64 detectada: garantindo @rolldown/binding-wasm32-wasi se necessario..."
  npm i -D @rolldown/binding-wasm32-wasi --no-save --legacy-peer-deps 2>&1 | tail -n 3 || echo "WARN: rolldown WASM fallback opcional indisponivel"
else
  echo "OK: arquitetura $ARCH com bindings nativos."
fi
echo ""

echo "=== [6/7] SUITE DE QUALIDADE + COBERTURA 100% + PROVA VUC ==="
echo "--- audit:cad ---"
npm run audit:cad 2>&1 | tail -n 10 || echo "WARN: audit:cad falhou"
echo ""
echo "--- vitest coverage 100% ---"
npm run test:coverage 2>&1 | tail -n 25 || echo "WARN: vitest coverage falhou"
echo ""
echo "--- lint ---"
npm run lint 2>&1 | tail -n 10 || echo "WARN: lint falhou"
echo ""

echo "=== [7/7] PROVA FORMAL VUC SHA-256 + ED25519 ==="
npm run vuc:proof 2>&1 | tail -n 15 || echo "WARN: vuc:proof falhou"
echo ""
echo "=== ONBOARD FIM ==="
echo "Se audit:cad = 27/27 e coverage = 100%, inicie com:"
echo "  npm run dev"
