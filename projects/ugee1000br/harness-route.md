# Rota do harness — UGEE1000BR

Painel compacto na metade inferior da tela:

`CONTEXT → REQUIREMENTS_GATE → CAD_KERNEL → CAE_KERNEL → ROTORDYNAMICS → CAM_KERNEL → K6 → VUC_SEAL → REVIEW`

Cada etapa deve produzir `PASS`, `FAIL` ou `BLOCKED`. `BLOCKED` é obrigatório quando a dependência não existe ou quando faltam entradas de engenharia. A etapa `VUC_SEAL` comprova integridade e vínculo com artefatos; não transforma uma análise incompleta em certificação.

O gate `ugee:kernel-gate` foi executado sem mock e passou CAD, CAE, CAM e `vuc.allPassed` no kernel determinístico. A correção aplicada foi geométrica: espessura provisional de 16 mm, que produziu flecha de 1,31 mm contra limite de 3,5 mm. O resultado é salvo em `ugee1000br.kernel-gate.json` e identifica explicitamente o perfil aeroespacial provisional usado como fonte.

## Limites atuais observados no sandbox

- `npm run lint`: disponível e executado.
- `npm test -- --run`: disponível e executado.
- `k6`: ausente; gate deve ser `BLOCKED/SKIPPED`.
- `freecadcmd`: ausente; exportação/validação B-Rep deve ser `BLOCKED/SKIPPED`.
- `lean`, `lake`, `z3`, `cvc5`: ausentes; provas formais externas devem ser `BLOCKED/SKIPPED`.

A gravação de mouse não deve ser tratada como prova de execução: é somente telemetria/replay de sessão. A prova é o conjunto de comandos, versões, saída, hashes e verificadores independentes.
