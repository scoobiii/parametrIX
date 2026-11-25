# Publicação npm e clientes

O pacote passou a usar o nome `@scoobiii/parametrix`, `private: false` e `publishConfig.access=public`. Antes de publicar, o proprietário do escopo deve executar `npm login`, confirmar o nome no registry e rodar `npm run package:check`. Esta alteração prepara o pacote, mas não publica automaticamente nem presume que o escopo esteja disponível.

## Apps

- Claude: use `plugins/claude/parametrix.mcp.json` ou registre o comando STDIO no Claude Desktop/Code.
- ChatGPT/OpenAI-compatible: use `plugins/openai/parametrix.mcp.json` apontando para `/api/mcp` com token.
- MoltH/OpenClaw/DeepSeek/Qwen/Gemini: use `plugins/generic/parametrix.mcp.json` ou o bridge `scripts/hermes/parametrix_mcp_stdio.py`.

A primeira chamada de cada cliente deve ser `initialize`, depois `tools/list`, e somente então `tools/call`. O servidor deve retornar erro explícito quando estiver offline; não há fallback falso para “zero mock”.
