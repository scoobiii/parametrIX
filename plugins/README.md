# Plugins ParametrIX para apps de IA

Os perfis abaixo conectam qualquer cliente que suporte MCP HTTP ou MCP STDIO ao ParametrIX. Eles não embutem chaves nem afirmam que um provedor específico está conectado: a conexão só é real quando o cliente executar `initialize`, `tools/list` e uma `tools/call` e receber evidência do servidor.

- `claude/parametrix.mcp.json`: perfil MCP remoto/STDIO para Claude Desktop/Claude Code.
- `openai/parametrix.mcp.json`: perfil de servidor MCP remoto para ChatGPT/OpenAI-compatible.
- `generic/parametrix.mcp.json`: perfil neutro para Gemini, DeepSeek, Qwen, MoltH/OpenClaw e outros gateways.

Para STDIO, use `python3 scripts/hermes/parametrix_mcp_stdio.py`. Para HTTP, defina `PARAMETRIX_URL` e, se necessário, `MCP_TOKEN`.
