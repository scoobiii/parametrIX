# UGEE1000BR — referência documental Kawasaki GPS1250 / M1A-01

**Revisão:** REV-0  
**Status:** referência documental parcial; sem liberação de engenharia.

## Referência confirmada

A Kawasaki publica o conjunto gerador de emergência GPS1250 com potência elétrica nominal de **1.000 kW**, associado à turbina **M1A-01**. A correspondência de potência é exata, mas a fonte caracteriza o produto como serviço *standby*. Isso não comprova equivalência com uma turbina de 1 MW em serviço contínuo.

Fonte primária: [Kawasaki GPS Product Lineup — catálogo KTK-0100-F, 2023-09](https://global.kawasaki.com/en/energy/pdf/202309Standby.pdf).

Página oficial: [Kawasaki Standby Generator Sets](https://global.kawasaki.com/en/energy/equipment/gas_turbines/emergency.html).

## Dados publicados do GPS1250 / M1A-01

| Parâmetro | Valor | Escopo |
|---|---:|---|
| Potência elétrica | 1.000 kW | Conjunto GPS1250, standby |
| Modelo da turbina | M1A-01 | Identificação do fabricante |
| Rotação da turbina | 22.000 rpm | Catálogo |
| Rotação de saída | 1.500 / 1.800 rpm | 50 / 60 Hz |
| Massa seca da turbina | 3,0 t | Turbina, não pacote completo |
| Tanque de óleo | aprox. 100 L | Catálogo |
| Consumo de óleo | 0,08 L/h | Catálogo |
| Dimensões do pacote indoor | 4,9 × 1,7 × 2,5 m | Conjunto gerador |
| Massa do pacote indoor | 10,4 t | Conjunto gerador |
| Alternador | 1.250 kVA | Não equivale a 1.250 kW |
| Combustíveis listados | querosene, diesel, opção gás | Configuração GPS1250 |

**Nota de consumo:** o valor de 525 L/h indicado no catálogo refere-se a diesel em plena carga, a 15 °C. Não é consumo de gás natural nem de etanol.

## Limite de combustível

A opção de gás está documentada para o GPS1250. O catálogo não comprova operação com etanol. A expressão *dual-fuel* não autoriza inferir compatibilidade com qualquer combustível líquido; etanol permanece **NOT CONFIRMED**.

## Decisão para o ParametrIX

- Registrar GPS1250 / M1A-01 como referência de pacote gerador **standby de 1 MW**.
- Não transferir dimensões, rotação, materiais ou geometria para um rotor UGEE1000BR.
- Não converter o rating standby em rating contínuo.
- Manter etanol e os requisitos termodinâmicos sem comprovação como `BLOCKED`.
- Não liberar geometria funcional, especificação de compra ou fabricação com base neste catálogo.

O baseline computacional `preset-aero-titanium` existente no projeto não é dado Kawasaki e não pode ser apresentado como validação desta turbina.

## Arquivo estruturado

`kawasaki-gps1250-m1a01.reference.json` contém os dados publicados, a origem, o escopo de aplicabilidade e os gates pendentes.

**Resultado:** referência documental útil para 1 MW standby; dados insuficientes para especificar ou construir uma turbina UGEE1000BR.
