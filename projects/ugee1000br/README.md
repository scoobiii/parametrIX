# UGEE1000BR — rotor de turbina 1 MW a etanol

## Estado

Este diretório contém um **protótipo de requisitos e harness**, não uma peça liberada para fabricação ou voo. O estado atual é `PROTOTYPE_REQUIREMENTS_INCOMPLETE` porque faltam, entre outros, rotação, temperaturas, vazão mássica, razão de pressão, diâmetros, número de pás, material, vida de projeto e fator de overspeed.

O verificador deve bloquear a execução de engenharia enquanto esses dados não forem fornecidos:

```bash
node scripts/validate_ugee1000br.mjs
```

Um resultado `BLOCKED` é correto para o gate de requisitos e não deve ser convertido em `PASS` por normalização, mock ou métrica simulada.

O gate real do kernel CAD/CAE/CAM pode ser executado com:

```bash
npm run ugee:kernel-gate
```

Na execução registrada, o kernel passou `cad=true`, `cae=true`, `cam=true` e `vuc.allPassed=true`, com 4.832 triângulos, 744 pontos de toolpath 5-eixos, fator de segurança calculado de 37,92, flecha de 1,31 mm e residual VUC 0. A espessura provisional foi 16 mm; o limite CAE de 3,5 mm não foi alterado. Esse PASS é do perfil aeroespacial provisional `preset-aero-titanium`, usado como baseline computacional; não é ainda a validação final de um rotor de turbomáquina com requisitos termodinâmicos aprovados.

## Fluxo preparado

1. **CAD:** parametrização do rotor e exportação STEP/STL somente após fechar os requisitos e unidades.
2. **CAE:** térmico, tensões, fadiga/fluência, modal, velocidade crítica, contato/raiz e overspeed com solver identificado e evidência.
3. **CAM:** estratégia 5-eixos, pós-processador versionado, simulação de remoção e verificação de colisão; nenhum G-code é considerado validado sem máquina/processo qualificados.
4. **Harness:** cada comando deverá produzir trajetória, stdout/stderr, hashes, duração, artefatos e envelope VUC assinado.
5. **k6:** smoke, integração, carga e stress contra endpoints locais; ausência do binário deve resultar em `BLOCKED/SKIPPED` com dependência explícita.
6. **Normativo:** `normative-registry.json` é apenas um índice de revisão. Não representa conformidade, aprovação de aeronavegabilidade ou verdade normativa final.

## Layout de operação

A viewport de produção permanece como área primária centralizada. A rota do harness fica em um painel compacto na metade inferior. O gravador de ponteiro existente deve ser usado apenas com opt-in da sessão, registrando amostras normalizadas e não teclas, segredos ou conteúdo fora da área de trabalho.

## Próximos dados necessários

Preencher `ugee1000br.rotor.spec.json` com os requisitos aprovados pelo responsável técnico. Depois disso, gerar a geometria nominal, executar os gates CAD/CAE/CAM e anexar evidências de metrologia, balanceamento, ensaio de overspeed, END e revisão normativa.
