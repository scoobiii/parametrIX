# Arquitetura ParametrIX: núcleo, adaptadores e instaladores

O repositório é organizado como uma aplicação full-stack com uma fronteira explícita entre **núcleo**, **adaptadores**, **instaladores** e **superfícies**. O objetivo é permitir uso via npm, desktop, mobile/Termux, VM e GitHub Actions sem duplicar regras CAD/CAE/CAM/VUC.

## Camadas

- `src/kernel/`: regras determinísticas e cálculo de engenharia; não deve importar SDK de provedor de IA.
- `packages/core/`: contratos pequenos e agnósticos para operações, evidência e capacidade de hardware.
- `packages/adapters/`: MCP HTTP/STDIO e perfis para Claude, ChatGPT/OpenAI-compatible e outros clientes.
- `packages/cli/`: entrada universal para diagnóstico e bridge.
- `scripts/`: instaladores, auditorias e geração de prova; scripts devem falhar explicitamente quando uma dependência real não estiver presente.
- `.github/workflows/`: execução externa reprodutível; binários opcionais (k6, FreeCAD, Qwen/harness) são detectados e reportados, não simulados silenciosamente.
- `src/components/` e `server.ts`: superfícies web/mobile e gateway HTTP/WebSocket.

## Scrum/agile

Cada sprint deve entregar uma fatia vertical com: (1) contrato; (2) adaptador; (3) teste determinístico; (4) teste de integração real quando a dependência existir; (5) evidência JSON/VUC; e (6) critério de aceite reproduzível. O backlog deve separar **kernel**, **integração**, **instalação** e **produto**, evitando uma branch que misture todos os riscos.

## Zero mock com honestidade

“Zero mock” é aplicado à execução de produção: nenhum mock, stub ou fixture é importado por `src/` ou pelos adaptadores de produção. Testes podem usar doubles para testar falhas locais, mas cada caso é classificado como `mock`, `stub`, `fixture-determinística` ou `integração-real`. O relatório gerado por `npm run classify:tests` é evidência de classificação, não prova de que todo teste é integração real.

## Hardware e desempenho

A ordem de seleção é GPU/TPU/NPU quando uma capacidade real é detectada e validada; caso contrário, CPU/WASM. HVM/Bend só deve ser ativado quando um binário e uma medição comparável existirem. Otimizações alternativas a Node/TS devem ser introduzidas apenas após um benchmark que prove ganho no gargalo.
