# Relatório técnico — Engrenagem Cilíndrica Reta M2 Z24

**Peça:** Engrenagem Cilíndrica de Dentes Retos M2 Z24  
**Código:** PX-GEAR-M2-Z24-20PA  
**Data:** 2026-11-21T04:45:48.543Z  
**Repositório:** `scoobiii/parametrIX`  
**Status da validação:** **PASS**  
**Certificado VUC:** `VUC-ED25519-29FEB5EB45C78289`

---

## 1. Especificação geométrica (derivada, não estimada)

| Parâmetro | Símbolo | Valor |
| :--- | :---: | ---: |
| Módulo | m | 2,000 mm |
| Número de dentes | z | 24 |
| Ângulo de pressão | α | 20,000° |
| Diâmetro primitivo | d = m·z | 48,000 mm |
| Diâmetro externo | da = m·(z+2) | 52,000 mm |
| Diâmetro de raiz | df = m·(z−2,5) | 43,000 mm |
| Diâmetro de base | db = d·cos α | 45,105 mm |
| Passo circular | p = π·m | 6,2832 mm |
| Espessura no primitivo | s = p/2 | 3,1416 mm |
| Espessura no topo | sa | 1,4311 mm |
| Largura de face | b | 12,000 mm |
| Furo central | Ø | 12,000 mm (H7) |
| Alívios | — | 4 × Ø8,000 mm |
| PCD dos alívios | — | 28,000 mm |
| Área da seção | A | 1.462,997 mm² |
| Volume (B-Rep) | V | 17,5560 cm³ |
| Massa (7075-T6, 2,81 g/cm³) | m | 49,33 g |

Referências normativas usadas apenas para as fórmulas: **ISO 53:1998** (perfil de referência) e **ISO 21771:2007** (geometria). Tolerâncias gerais indicadas como **ISO 2768-mK**; não há certificado dimensional de inspeção.

---

## 2. Método de construção

1. **Kernel paramétrico** (`src/kernel/spurGear.ts`): gera flancos de evolvente, arco de topo, arco de raiz, furo central e alívios. A malha é fechada e triangulada com o `ShapeUtils` do Three.js; o volume é medido por divergência.
2. **Perfil 2D** (`profile.json`): contorno de 76.214 bytes compartilhado entre o kernel e o FreeCAD, garantindo que STEP e malha venham da mesma geometria.
3. **STEP B-Rep** (FreeCAD 0.20.2 / OpenCASCADE 7.6): face planar com furos, extrusão de 12,000 mm, validação de sólido único, exportação STEP AP214.
4. **STL binário**: tesselação do B-Rep exportada pelo FreeCAD; volume fechado recalculado de forma independente.
5. **4 vistas**: projeções ortográficas e isométrica calculadas a partir dos triângulos do STL (frontal XY, superior XZ, lateral YZ e isométrica).

---

## 3. Verificação tridimensional (medida)

| OK | Verificação | Medido | Esperado | Desvio |
| :---: | :--- | ---: | ---: | ---: |
| ✅ | STEP é um único sólido | 1,000000 | 1,000000 | 0.00e+0 |
| ✅ | STEP válido (OpenCASCADE) | 1,000000 | 1,000000 | 0.00e+0 |
| ✅ | Volume STEP vs kernel | 17.555,964727 | 17.555,964727 | 3.52e-15 |
| ✅ | Área STEP vs kernel | 8.363,807587 | 8.363,807587 | 7.83e-15 |
| ✅ | Volume STL vs kernel | 17.555,964786 | 17.555,964727 | 3.32e-9 |
| ✅ | Espessura STEP (b) | 12,000000 | 12,000000 | 0.00e+0 |
| ✅ | Raio externo máximo STEP (da/2) | 26,000000 | 26,000000 | 4.94e-13 |
| ✅ | Raio externo no topo STEP | 26,000000 | 26,000000 | 4.94e-13 |
| ✅ | Triângulos STL | 4.496,000000 | 4.496,000000 | 0.00e+0 |

- Volume do kernel: **17.555,964727 mm³**
- Volume do STEP: **17.555,964727 mm³**
- Volume do STL: **17.555,964786 mm³**
- Sólidos no STEP: **1** · faces: **1122** · arestas: **3360**
- Caixa do STEP: 51,999212 × 51,999212 × 12,000000 mm
- Centro de massa: (0,000000, 0,000000, 6,000000) mm

> O diâmetro externo geométrico é 52,000 mm (raio de topo 26,000 mm, verificado nos vértices do STEP).
> A caixa alinhada aos eixos mede 51,999212 mm em X/Y porque o arco de topo é amostrado e nenhum
> vértice cai exatamente sobre o eixo X; isso é uma característica da discretização do perfil, não uma
> dimensão de projeto diferente.

---

## 4. Artefatos entregues (SHA-256)

| Arquivo | Bytes | SHA-256 |
| :--- | ---: | :--- |
| `profile.json` | 76.214 | `7018451F9614923D3789FED703E255CF14A31491595C54C11FA30ADFB49CCEC4` |
| `engrenagem_m2_z24.step` | 4.479.017 | `5F34A8989B01BA691666C8C46557292103F9F4E0F7028FC779E69831985EC9DC` |
| `engrenagem_m2_z24.stl` | 224.884 | `B91CEA216E6A2E48D323700EFBC8743FB9E898F7A24F049EB8A918CCBB31A5C6` |
| `engrenagem_m2_z24.dxf` | 21.944 | `5D93A62EF451A055E5428956DCEFD22B7513FCF2D4F268CBA5C0B9D2D70144E4` |
| `engrenagem_m2_z24_4vistas.png` | 382.949 | `50D9BC641DFF69C04E538BA5EB7A9E696A08BE42193F91E1595E9F464E3DF29A` |
| `engrenagem_m2_z24_iso.png` | 62.115 | `984186A7BE11A89A80B6247C19C3FDAF5B8FD79183249C83E3CED4328E5E2783` |
| `engrenagem_m2_z24_metricas_kernel.json` | 1.421 | `13F0E20B3D0F31E0A0DEDE24B294E9752C5FE5EF1DE956CD7695EE8168521968` |
| `engrenagem_m2_z24_metricas_freecad.json` | 1.047 | `91DC162CC64611EC9A5D09CD7432C178BFE62B8A1DBD14CE60BCCAADF12BB6D6` |
| `engrenagem_m2_z24_validacao.json` | 3.567 | `149193491F7C2993D3C5740E09659123602C7DEAD44C6F336ADA8A92B94E6A2B` |

O `manifest.json` inclui também o hash deste relatório e do certificado VUC.

---

## 5. Prova VUC (Ed25519 + SHA-256)

- `vuc_id`: **VUC-ED25519-29FEB5EB45C78289**
- `hash_input`: `46D618BADFCD07F9BFD7EC2276F554B871C4A3892C30DC41C3C66D6DA0C8B27C`
- `hash_output`: `2EA966B6E935B2EF94D600AB38C20DF2C17BBBD9710097B575A445729A95F1AD`
- `hash_processo`: `29FEB5EB45C7828946B54CBC6DE21DFA74EFA0BCACFE44FE3C06A0FF1770C825`
- `commit`: `e254f91`
- `runner`: `local-sandbox-cad-pipeline`
- `duracao_ms`: 39
- Verificação da assinatura: **VÁLIDA** — Assinatura Ed25519 e hashes SHA-256 verificados.

A chave privada Ed25519 é efêmera (gerada no processo) e a chave pública acompanha o certificado em
`vuc_proof.json`, permitindo verificar que os hashes de entrada/saída não foram alterados.

---

## 6. Limitações declaradas (engenharia, não marketing)

- A raiz é modelada com arco de raiz e transição radial, **sem filete trocoidal**; para produção seriada recomenda-se aplicar o filete de raiz conforme ISO 53 e recalcular a tensão.
- Não há **coroamento de flanco**, **backlash** definido nem tratamento térmico/superficial especificado; a espessura no primitivo é teórica (s = p/2).
- O STEP contém **1122 faces planas** resultantes da discretização do perfil, adequado para CAM/inspeção, mas não é um modelo B-Rep com flancos em spline.
- A massa usa densidade nominal de 2.810 kg/m³ para 7075-T6; a massa real depende do certificado do lote de material.
- As 4 vistas são projeções de referência, **não substituem** um desenho normatizado ASME Y14.5 / ISO 129 com GD&T.
- O STEP carrega o timestamp do exportador no cabeçalho; a reprodutibilidade é verificada por volume/área/raio (e não por hash byte a byte do arquivo).
- Não foi executado ensaio mecânico nem medição em CMM; a validação é geométrica e documental.

---

## 7. Reprodução

```bash
cd parametrIX
npm ci
npx tsx scripts/cad/export_spur_gear_geometry.ts
QT_QPA_PLATFORM=offscreen freecadcmd scripts/cad/build_spur_gear_step.py
MPLCONFIGDIR=.cache/matplotlib python3 scripts/cad/render_spur_gear_views.py
QT_QPA_PLATFORM=offscreen MPLCONFIGDIR=.cache/matplotlib freecadcmd scripts/cad/verify_spur_gear_delivery.py
npx tsx scripts/cad/finalize_spur_gear_delivery.ts
```

No Parametrix CAD Studio, a peça está disponível no preset **“Engrenagem Cilíndrica M2 Z24 (ISO 53 · 7075-T6)”**, que carrega a malha paramétrica, o perfil de engenharia, o CAM 3-eixos e o FEA configurados.
