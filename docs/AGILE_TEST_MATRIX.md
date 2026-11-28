# Matriz Scrum/Agile de qualidade ParametrIX

A definição de “100%” nesta matriz significa que todas as dimensões possuem contrato, executor, evidência e critério de aceite. Não significa que um único número de cobertura V8 cubra binários externos, pixels, leitores de tela ou rede distribuída.

| Trilha | Executor | Critério de aceite | Evidência |
|---|---|---|---|
| Núcleo/unitário | Vitest + V8 | testes unitários e branches do kernel aprovados | `coverage/`, logs Vitest |
| Integração | Vitest MCP + servidor real | REST, MCP, auth, WebSocket e VUC passam | `tests/mcp/`, `proof/vuc-latest.json` |
| GUI | build Vite + contrato de componentes | shell, viewport e painéis críticos presentes | `dist/`, `proof/quality-suite.json` |
| UX/mobile | contrato estático responsivo | navegação CAD/CAM/VUC/MCP e breakpoints presentes | quality report |
| Acessibilidade | scanner estático + browser/axe no CI | imagens rotuladas, controles nomeados, foco/teclado verificados | quality report + artefato browser |
| Performance | probes HTTP p95 | p95 abaixo do limite e zero erro | quality report |
| Stress | concorrência HTTP/WebSocket | sem erro 5xx inesperado; limites 429 observados quando exigidos | logs k6/Node |
| Balanceamento | contrato round-robin + runner distribuído | distribuição equilibrada; multi-host em runner externo | quality report |
| Segurança | MCP allowlist, auth, SSRF e payload limits | rejeição explícita sem sucesso fabricado | testes MCP |
| Scrum team | backlog, sprint, DoD, review e evidência | cada fatia vertical tem aceite reproduzível | PR/checklist |

## Definition of Done

Uma história só pode ser marcada como concluída quando: contrato e teste existem; execução real e fixture estão diferenciadas; UI/UX foi verificada; acessibilidade foi analisada; performance e carga têm baseline; a documentação foi atualizada; e a evidência JSON foi gerada. Dependências externas ausentes devem aparecer como `BLOCKED`, nunca como `PASS`.

## Execução

```bash
npm run quality:static
npm run quality:runtime   # requer servidor ParametrIX ativo
npm run quality:strict    # falha se houver FAIL ou BLOCKED
```
