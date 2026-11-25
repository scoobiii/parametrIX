# Molt/Qwen + Parametrix MCP no GitHub Actions

O fluxo `Molt Parametrix MCP Runner` inicia o Parametrix no próprio runner, mantém o endpoint MCP em `127.0.0.1` e executa uma única operação allowlisted. Isso evita expor o runner por túnel público e evita transformar texto de LLM em comandos de shell.

## Configuração

Cadastre `PARAMETRIX_MCP_TOKEN` como Secret. Para usar um LLM compatível com OpenAI, cadastre `MOLT_LLM_API_KEY` e configure as Variables `MOLT_LLM_BASE_URL` e `MOLT_LLM_MODEL`. Para Qwen local ou remoto, use `QWEN_API_KEY`, `QWEN_BASE_URL` e `QWEN_MODEL`. Sem chave ou endpoint, use as operações diretas; o harness embutido do projeto continua disponível, mas não é inferência Qwen real.

O bridge STDIO existente em `scripts/hermes/parametrix_mcp_stdio.py` também pode ser apontado pelo Moltbot/OpenClaw. Ele aceita `PARAMETRIX_URL` e, agora, encaminha `MCP_TOKEN` como `Authorization: Bearer`.

## Limites de segurança

O workflow usa `permissions: contents: read`, Node 24 e uma lista explícita de ferramentas. O modo LLM permite no máximo uma chamada MCP e rejeita ferramentas fora de `PARAMETRIX_ALLOWED_TOOLS`. Não coloque chaves em `args_json`, prompts, artefatos ou logs. Para execução destrutiva, crie uma workflow separada com aprovação de ambiente; não adicione esse tipo de ferramenta à allowlist padrão.

## Uso

Em **Actions → Molt Parametrix MCP Runner → Run workflow**, escolha `tools-list`, `vuc-proof`, `structural-fea` ou `nurbs-metrics`. O campo `prompt` é opcional e só é usado para propor uma chamada MCP estruturada através de Qwen/OpenAI-compatible.
