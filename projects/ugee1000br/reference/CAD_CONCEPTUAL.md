# UGEE1000BR — CAD conceitual FreeCAD

**Status:** `CONCEPTUAL_ONLY`  
**Validade dimensional:** `NONE`  
**Liberação para fabricação:** `BLOCKED`

## Escopo

O macro cria uma montagem visual de blocos simbólicos para organizar a discussão de arquitetura do pacote. As formas são envelopes abstratos em unidades gráficas arbitrárias; não representam dimensões, proporções físicas, interfaces nem arranjo interno do Kawasaki GPS1250 / M1A-01 ou de uma turbina UGEE1000BR.

Não há rotor, pás, combustor, bocais, dutos funcionais, eixo, mancais, engrenagens, desenhos cotados, materiais, tolerâncias, parâmetros de operação ou dados CAM. O modelo não pode ser usado para fabricação, compra, montagem, simulação física ou validação de desempenho.

## Execução local

Na raiz do repositório, com FreeCAD 1.0.x instalado:

```bash
QT_QPA_PLATFORM=offscreen freecadcmd scripts/cad/build_ugee1000br_conceptual.py
```

Saída esperada:

```text
deliverables/ugee1000br_conceptual/ugee1000br_conceptual.FCStd
```

O macro não exporta STEP/STL: esses formatos poderiam ser confundidos com geometria de fabricação. A saída é um documento nativo FreeCAD para inspeção visual e organização conceitual.

## Governança e proveniência

- Referência documental de potência: Kawasaki GPS1250 / M1A-01, 1.000 kW em serviço standby — ver `projects/ugee1000br/reference/README.md`.
- Não há equivalência demonstrada com serviço contínuo.
- Compatibilidade com etanol não confirmada.
- O modelo CAD é independente da geometria de rotor pendente e não reutiliza o preset aeroespacial.
- Cada objeto recebe propriedades de governança indicando ausência de validade dimensional e proibição de uso como geometria de fabricação.

## Critério de aceitação desta entrega

- [ ] Macro executado em FreeCAD 1.0.x.
- [ ] FCStd abre sem erro.
- [ ] Sete volumes simbólicos identificáveis na árvore.
- [ ] Nenhuma geometria funcional ou cota de engenharia presente.
- [ ] Hash SHA-256 e log de execução registrados após execução local/CI.

**Não declarar CAD validado antes da execução real e inspeção do FCStd.**
