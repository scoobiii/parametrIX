# Parametrix CAD Studio: uso do MCP

## Visão geral
O MCP do Parametrix é um endpoint HTTP JSON-RPC 2.0 do próprio `server.ts`:

    POST /api/mcp        (Content-Type: application/json)

Tools expostas (catálogo em `src/kernel/mcpServer`):
- `cad_inspect_ipt_step_briefing`: briefing de arquivos .ipt/.step (`{ filename, base64Data }` ou `{ url }`)
- `cad_evaluate_nurbs_metrics`: área, volume e curvatura NURBS
- demais tools: `tools/list` retorna o catálogo atual

## Acessos

| Quem | Onde | Autenticação |
|---|---|---|
| Usuário no app (UI) | `http://localhost:3001` ou Web Preview | nenhuma (local) |
| Agente local (mesma VM) | `http://localhost:3001/api/mcp` | nenhuma (local) |
| Agente remoto / cliente externo | `https://<tunel>.trycloudflare.com/api/mcp` | `Authorization: Bearer $MCP_TOKEN` |

O `tunnelGuard` (`src/tunnelGuard.ts`) vale só para requisições vindas do túnel:
- só `POST /api/mcp` passa; todo o resto responde 404 (UI, WebSocket, ramdisk, colab-bridge, rag-agent);
- sem token ou token errado: 401.

## Exemplos

Listar tools:

    curl -s -X POST "$URL/api/mcp" \
      -H "Authorization: Bearer $MCP_TOKEN" -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

Chamar tool:

    curl -s -X POST "$URL/api/mcp" \
      -H "Authorization: Bearer $MCP_TOKEN" -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"cad_inspect_ipt_step_briefing","arguments":{"filename":"peca.ipt","base64Data":"<BASE64>"}}}'

## Agentes (clientes MCP)
Qualquer cliente que aceite URL HTTP + header customizado. Exemplo Claude Code:

    claude mcp add --transport http parametrix "$URL/api/mcp" \
      --header "Authorization: Bearer $MCP_TOKEN"

Nota: o endpoint foi verificado com `tools/list` e `tools/call`. Se o cliente exigir o
handshake `initialize` do MCP (Streamable HTTP), valide se o handler em `server.ts` (~linha 883) o suporta.

## Operação

Subir o servidor (sobrevive à queda do app):

    cd ~/parametrIX && tmux new -d -s px "set -a && . ./.env && set +a && PORT=3001 npm run dev"

Subir o túnel (URL muda a cada reinício):

    cd ~ && nohup ./cloudflared tunnel --url http://localhost:3001 > tunnel.log 2>&1 &
    sleep 8; grep -o "https://[a-z0-9-]*\.trycloudflare\.com" tunnel.log

Parar o túnel: `pkill cloudflared`

Rotacionar o token (gera, grava no .env, reinicia o servidor):

    ~/parametrIX/scripts/rotate-mcp-token.sh

Depois de rotacionar, atualize o header em todos os clientes.

## Segurança
- Token em `.env` (chmod 600, no .gitignore). Nunca em chat, print ou commit.
- Túnel `trycloudflare` é público por URL: ligue só quando precisar.
- Pendente: revisar o handler de `/api/mcp` quanto a SSRF (`{ url }` em `cad_inspect_ipt_step_briefing`):
  bloquear IPs privados e `169.254.169.254`, aceitar só https e limitar tamanho/tempo.
- Para uso contínuo: named tunnel + Cloudflare Access (service token).
