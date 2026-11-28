# Estratégia de testes Parametrix

Atualizado em 2026-11-28; validação desta entrega executada com Node **24.12.0**.

## Cobertura unitária

A suíte Vitest instrumenta o escopo kernel/servidor configurado e, nesse escopo, pode atingir 100% de statements, branches, functions e lines. Isso não equivale a 100% do repositório. O inventário automatizado `npm run quality:static` é a fonte de verdade do total atual, excluindo `.git`, `node_modules`, `dist`, coverage, caches e artefatos temporários; no último run local foram contados **195 arquivos relevantes**. A matriz completa também cobre GUI, UX, acessibilidade, performance, stress e balanceamento.

A integração MCP e o build foram validados no Sandbox ARM64 com Node 24.12.0 após `npm ci`; o gate remoto roda em `ubuntu-latest` com exatamente Node 24.12.0, onde a matriz k6 instala o binário e valida o contrato real.

## Contrato k6

`scripts/k6/parametrix_ws_load.js` é um contrato funcional, não apenas um teste de throughput. Ele cobre:

- REST: `/api/claw/status`, `/api/hermes/status`, `/api/agent/onboarding` e `/metrics`;
- JSON-RPC MCP: `initialize`, `ping`, `notifications/initialized`, `tools/list`, chamada de todas as ferramentas anunciadas, método desconhecido, ferramenta inexistente e argumentos inválidos;
- segurança: JSON inválido, requisição sem token e token inválido em modo túnel; token válido quando `MCP_TOKEN` estiver configurado;
- limites: probe concorrente acima de `MCP_MAX_INFLIGHT`, contabilizando respostas `429`;
- WebSocket: upgrade `/ws`, `ecosystem:sync`, ping/pong e resposta de relay MCP;
- thresholds de erro, latência, checks e métricas Prometheus.

Ferramentas de navegador sem uma aba relay retornam erro MCP tipado `-32001`; isso é uma resposta funcional esperada, e não um HTTP 5xx. Ferramentas stateless são executadas com argumentos seguros/defaults.

## Execução

Com o backend já iniciado:

```bash
PARAMETRIX_URL=http://127.0.0.1:3000 npm run test:k6
```

Em ambiente local sem k6, o runner preserva o contrato e executa `scripts/k6/node_mcp_contract.ts`, que replica REST, MCP, segurança, concorrência e WebSocket, seguido do stress test Node. Para detectar ausência do binário como falha:

```bash
REQUIRE_K6=1 npm run test:k6
```

Para tornar o probe concorrente estrito e exigir ao menos um `429` observado:

```bash
EXPECT_429=1 REQUIRE_K6=1 npm run test:k6
```

O CI instala k6 via `grafana/setup-k6-action@v1`, inicia o servidor em Node 24.12.0 e executa o contrato com `K6_SMOKE=1`. O modo estrito de `429` não é usado como threshold obrigatório no CI porque a ocorrência depende do escalonamento e do tempo de execução do backend; a cobertura determinística desse ramo permanece na suíte de integração/limites.

## Evidência executada no Sandbox — 2026-11-28

Com Node 24.12.0, o backend respondeu `readyForClaw: true` e anunciou 23 tools. O fallback executou com sucesso **44 chamadas HTTP**, sem erros de assert; o probe concorrente observou 0 respostas `429` nessa execução rápida. O stress WebSocket também passou com 12 clientes, `ecosystem:sync`, ping/pong e relay MCP bidirecional com VUC Ed25519 válido. `npm ci`, lint, **165 testes**, cobertura de 100% no escopo configurado e build de produção também passaram. Isso valida o contrato fallback Node; não substitui a execução do binário k6, ainda pendente nos checks remotos após a atualização do PR.

## Interpretação

A matriz k6 mede cobertura funcional de endpoints, cobertura de branches de protocolo/segurança, concorrência observada e WebSocket. Ela não substitui a cobertura V8 de código: k6 não deve ser usado para declarar 100% dos arquivos TypeScript cobertos.

## Quality gate multidimensional

O executor `scripts/quality-suite.mjs` gera `proof/quality-suite.json` com estados `PASS`, `FAIL` e `BLOCKED` para inventário, Scrum/Agile, GUI, UX responsivo, acessibilidade estática, p95 HTTP, concorrência e contrato de balanceamento. O workflow `.github/workflows/quality-suite.yml` separa qualidade estática de runtime. `--strict` falha em qualquer `FAIL` ou dependência externa `BLOCKED`; nenhum binário ausente é contado como sucesso.
