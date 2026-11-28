# Preparação ParametrIX — UGEE1000BR

Data da preparação: 2026-11-27 (sandbox Manus).

## Resultado

O snapshot fornecido foi clonado para esta cópia de trabalho e recebeu um pacote de projeto UGEE1000BR para um rotor de turbina de 1 MW a etanol. O artefato está em estado `PROTOTYPE_REQUIREMENTS_INCOMPLETE`; não há autorização de fabricação, voo ou certificação.

## Evidências executadas

- `npm ci --ignore-scripts`: concluído; o ambiente reportou Node 22.23.4, enquanto algumas dependências declaram Node >=24.12.0.
- `npm run lint`: PASS.
- `npm test -- --run`: PASS — 32 arquivos, 160 testes.
- `npm run build`: PASS — bundle Vite produzido.
- `node scripts/validate_ugee1000br.mjs`: BLOCKED esperado — 12 entradas de engenharia ausentes.
- `npm run ugee:kernel-gate`: PASS real do kernel — CAD, CAE, CAM e `vuc.allPassed` passaram; 4.832 triângulos, 744 pontos de toolpath 5-eixos, fator de segurança calculado 37,92, flecha 1,31 mm e residual VUC 0.
- Ferramentas ausentes no sandbox: `k6`, `freecadcmd`, `lean`, `lake`, `z3`, `cvc5`.

## O que foi preparado

- especificação controlada do rotor;
- registro normativo somente como índice de revisão;
- gate determinístico de requisitos;
- rota do harness com estados PASS/FAIL/BLOCKED;
- comando `npm run ugee:validate`;
- roteamento do harness para prompts contendo `UGEE1000BR` ou “rotor a etanol”;
- preservação do gravador de ponteiro existente como telemetria opt-in, sem tratá-lo como prova de execução;
- cópia do ZIP original preservada fora da árvore de trabalho.

## Limites

A prova VUC pode comprovar integridade, hashes, assinatura e vínculo entre comando e artefato. Ela não prova sozinha segurança física, resistência, velocidade crítica, overspeed, balanceamento, fabricação, aeronavegabilidade ou conformidade normativa. A matriz normativa precisa ser revisada com textos controlados, responsável técnico, organização de qualidade e autoridade competente.

O PASS CAD/CAE/CAM registrado é do perfil aeroespacial provisional `preset-aero-titanium`, com espessura corrigida de 16 mm, executado por funções reais do kernel ParametrIX. O relatório não o apresenta como rotor final UGEE1000BR nem como solver físico externo.

Nenhuma chamada de nuvem ou consumo de crédito foi feito nesta preparação.
