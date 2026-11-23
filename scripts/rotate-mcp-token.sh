#!/usr/bin/env bash
# Gera novo MCP_TOKEN, grava no .env e reinicia o servidor (tmux "px").
set -euo pipefail
cd "$(dirname "$0")/.."
ENV=.env
touch "$ENV"; chmod 600 "$ENV"
NEW=$(openssl rand -hex 32)
if grep -q '^MCP_TOKEN=' "$ENV"; then
  sed -i "s/^MCP_TOKEN=.*/MCP_TOKEN=$NEW/" "$ENV"
else
  echo "MCP_TOKEN=$NEW" >> "$ENV"
fi
tmux kill-session -t px 2>/dev/null || true
fuser -k 3001/tcp 2>/dev/null || true
sleep 1
tmux new -d -s px "cd $PWD && set -a && . ./$ENV && set +a && PORT=\${PORT:-3001} npm run dev"
sleep 5
ss -ltnp | grep -q ':3001' && echo "Servidor OK na 3001" || echo "ATENCAO: 3001 nao subiu (tmux attach -t px)"
echo "Token rotacionado: ${NEW:0:6}...${NEW: -4}  (completo em $PWD/$ENV)"
echo "Atualize o token em todos os clientes MCP."
