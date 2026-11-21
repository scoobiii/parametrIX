#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run test:mcp 2>&1 | tail -25 > /tmp/cov.txt
{ echo "# Testes MCP"; echo; echo "Atualizado: $(date -u +%F\ %H:%MZ)"; echo; echo '```'; cat /tmp/cov.txt; echo '```'; } > docs/TESTING.md
git add package-lock.json docs/ src/tunnelGuard.ts src/mcpLimits.ts tests/mcp scripts vitest.mcp.config.ts package.json server.ts
git status --short | grep -E '\.env$|\.db$|data/' && { echo "ABORTADO: arquivo sensivel no stage"; exit 1; } || true
git diff --cached --quiet && echo "nada novo" || git commit -m "test(mcp): testes, limites e docs"
git push
