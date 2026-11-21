# Entrega — Engrenagem Cilíndrica M2 Z24 no Parametrix

**Branch:** `feat/engrenagem-m2-z24`  
**Repositório:** `scoobiii/parametrIX`  
**Data da entrega:** 2026-11-21  
**Status:** CAD validado, viewer integrado, vídeo gravado, prova VUC emitida

---

## 1. Resumo executivo

Esta entrega adiciona ao Parametrix CAD Studio uma peça mecânica real e parametrizável:
uma **engrenagem cilíndrica de dentes retos**, módulo 2, 24 dentes, ângulo de pressão 20°,
face de 12 mm, furo central Ø12 H7 e quatro alívios Ø8 mm em PCD 28 mm, em alumínio 7075-T6.

A peça foi construída em três camadas independentes e verificáveis:

1. **Kernel paramétrico** em TypeScript (`src/kernel/spurGear.ts`), com perfil de evolvente
   derivado da ISO 53 / ISO 21771 e malha fechada triangulada com Three.js.
2. **STEP B-Rep** gerado por FreeCAD/OpenCASCADE a partir do mesmo perfil exportado pelo kernel.
3. **Verificação tridimensional** comparando kernel × STEP × STL, com desvio relativo de volume
   da ordem de 3,5 × 10⁻¹⁵ entre kernel e STEP.

Além da peça, a entrega inclui um **preset de 1 clique**, **deep links de viewer**, uma
**galeria dos 10 presets**, um **vídeo walkthrough narrado de 6 min 37 s** e a
**prova VUC Ed25519** sobre os artefatos.

---

## 2. Escopo e premissas

O pedido original não especificava o componente. A escolha foi uma engrenagem de dentes retos
porque:

- todas as dimensões podem ser **derivadas de norma** (módulo, dentes, ângulo de pressão),
  sem valores "estimados";
- o perfil de evolvente é verificável matematicamente e visualmente;
- a peça exercita o pipeline completo: kernel → malha → STEP/STL/DXF → viewer → CAM/FEA → VUC;
- é um componente industrial reconhecível, adequado a usinagem CNC 3 eixos.

Premissas declaradas:

- Perfil de referência **sem deslocamento de perfil** e **sem backlash** (espessura teórica `s = p/2`).
- Raiz modelada com arco de raiz e transição radial, **sem filete trocoidal**.
- Material nominal **7075-T6** com densidade 2.810 kg/m³.
- Tolerância geral indicada como **ISO 2768-mK**; não há certificado dimensional de inspeção.
- Não houve usinagem física, ensaio mecânico ou medição em CMM.

---

## 3. Especificação da peça

| Parâmetro | Símbolo / fórmula | Valor |
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
| Volume B-Rep | V | 17.555,965 mm³ |
| Massa estimada | 7075-T6 | 49,33 g |

---

## 4. Arquitetura da solução

```text
┌─────────────────────────────┐
│ src/kernel/spurGear.ts      │  TS + Three.js ShapeUtils
│ buildSpurGearProfile()      │  evolvente ISO 53 / ISO 21771
│ buildSpurGearMesh()         │  malha fechada (tampo, paredes, furos)
│ computeSpurGearMetrics()    │  d/da/df/db, p, s, volume, massa
│ buildSpurGearModel()        │  ImportedCadModel para o viewer
│ buildSpurGearDxf()          │  perfil 2D para corte/inspeção
└──────────────┬──────────────┘
               │ profile.json
               ▼
┌─────────────────────────────┐
│ FreeCAD 0.20.2 / OCCT 7.6   │
│ Part.makePolygon / Face     │
│ cut (furo + alívios)        │
│ extrude 12 mm               │
│ Part.export STEP AP214      │
│ Mesh.export STL             │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ Verificação independente    │
│ STEP reimportado × kernel   │
│ × STL (volume/área/raio)    │
│ 9/9 checagens PASS          │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ Prova VUC Ed25519           │
│ SHA-256 de entrada/saída    │
│ assinatura + hashes         │
└─────────────────────────────┘
```

### 4.1 Kernel paramétrico

`src/kernel/spurGear.ts` expõe:

- `validateSpurGearSpec()` — valida módulo, dentes, ângulo, face, furo, alívios e condições
  de existência do perfil (ponta de dente positiva, paredes mínimas).
- `buildSpurGearProfile()` — contorno fechado anti-horário com flancos de evolvente, arco de topo
  e arco de raiz; amostragem configurável por flanco.
- `buildSpurGearHoles()` — furo central e alívios, fechados no sentido horário.
- `computeSpurGearMetrics()` — todas as cotas, área, volume, massa e área superficial.
- `buildSpurGearMesh()` — malha triangular fechada no referencial Three.js Y-up.
- `buildSpurGearModel()` — `ImportedCadModel` com componente, normais, bounding box,
  perfil de engenharia e notas medidas.
- `buildSpurGearDxf()` — DXF 2D com camadas `CONTORNO`, `FURO_CENTRAL` e `ALIVIO`.

A malha é considerada fechada quando toda aresta não direcionada aparece exatamente duas vezes.
O teste automatizado verifica essa condição, o volume por divergência e a orientação positiva.

### 4.2 STEP B-Rep

`scripts/cad/build_spur_gear_step.py` lê `profile.json` e usa a API do FreeCAD:

```python
face = Part.Face(closed_wire(outline))
for hole in holes:
    face = face.cut(Part.Face(closed_wire(hole["points"])))
solid = face.extrude(FreeCAD.Vector(0, 0, 12.0))
Part.export([obj], "engrenagem_m2_z24.step")
Mesh.export([obj], "engrenagem_m2_z24.stl")
```

O resultado é **1 sólido, 1.122 faces e 3.360 arestas**, reimportado e medido de forma
independente por `scripts/cad/verify_spur_gear_delivery.py`.

### 4.3 Integração no app

- Preset `preset-gear-m2-z24` em `src/kernel/workspacePresets.ts`.
- Deep link de viewer em `src/App.tsx`:
  `?preset=...&mode=...&finish=...&view=...`.
- Presets podem declarar `showMachine` e `showToolpath`; a engrenagem abre limpa, sem spindle
  e sem toolpath.
- O viewer mostra a peça com 4.496 triângulos, 1 componente e o perfil de engenharia completo.

---

## 5. APIs, entradas e acessos

### 5.1 Para pessoa (UI)

| Caminho | O que faz |
| :--- | :--- |
| Presets de 1 clique | 10 projetos completos, incluindo a engrenagem M2 Z24 |
| Upload | STEP/STP, IPT, STL, OBJ, DXF, 3DM, IFC, SVG e imagem → CAD |
| Novo do Zero | assistente por dimensões, material, segmento e processo CAM |
| Caneta Mágica | furos, rasgos, parafusos métricos e nervuras sobre a geometria |
| FEA | tensões, fator de segurança e otimização de curvatura |
| CAM | trajetória, simulação, pós-processador e exportação `.nc`/`.src` |
| Exportação | STEP, STL, DXF, 3DM e G-code |

### 5.2 Para agente (API)

| Recurso | Endpoint |
| :--- | :--- |
| Descoberta | `GET /llms.txt` |
| Capacidades | `GET /api/agent/onboarding` |
| Descoberta well-known | `GET /.well-known/agent.json` |
| MCP JSON-RPC 2.0 | `POST /api/mcp` |
| Briefing STEP/IPT | `POST /api/cad/llm-briefing` |
| Swagger | `GET /swagger` |
| OpenAPI | `GET /api/openapi.json` |
| Ponte no navegador | `window.__PARAMETRIX_MCP__` |

O endpoint `/api/mcp` expõe **19 ferramentas**, entre elas:

- Geometria/inspeção: `cad_inspect_ipt_step_briefing`, `cad_detect_part_context`,
  `cad_set_segment_profile`, `cad_explode_assembly`, `cad_rotate_component`,
  `cad_set_component_material`, `cad_set_parametric_params`, `cad_isolate_part`,
  `cad_evaluate_nurbs_metrics`, `cad_set_material_finish`.
- FEA/CAM: `cad_run_structural_fea`, `cad_generate_optimized_geometry`,
  `cad_generate_cam_toolpath`.
- Entrega/VUC: `cad_export_deliverable`, `cad_run_plugin_script`, `cad_magic_pen_feature`,
  `cad_get_scoobiii_vuc_proof`, `cad_get_agent_onboarding`,
  `session_get_deliverables_summary`.

Exemplo de chamada:

```bash
curl -s http://127.0.0.1:3000/api/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

---

## 6. Processo CAM

O preset configura:

| Parâmetro | Valor |
| :--- | :--- |
| Máquina | CNC 3 eixos |
| Estratégia | Contorno |
| Ferramenta | Fresa esférica Ø4 mm (`tool-ball-4`) |
| Stepover | 30% |
| Stepdown | 1,5 mm |
| Sobremetal | 0,2 mm |
| Altura segura | 20 mm |
| Pós-processador | Fanuc ISO (`.nc`) |

**Limitação importante:** o painel CAM do Parametrix gera a trajetória a partir da superfície
NURBS paramétrica, não da malha STEP importada. Portanto, o programa exibido é uma
**simulação de processo**, não um G-code validado para usinar esta engrenagem.

Para produção real, o fluxo correto é:

1. Gerar o CAM a partir do STEP (por exemplo, FreeCAD Path ou CAM comercial).
2. Usar fresa de topo para o perfil 2.5D e para os alívios.
3. Furar/usinar o furo Ø12 e aplicar **reaming H7**.
4. Simular colisões, fixação e zero-peça antes de enviar à máquina.
5. Medir a primeira peça (CMM/rugosímetro) e registrar a prova VUC da usinagem.

Nenhuma peça física foi usinada nesta entrega.

---

## 7. Verificação e evidências

### 7.1 Checagens CAD (9/9)

| Verificação | Resultado |
| :--- | :--- |
| STEP é um único sólido | PASS |
| STEP válido (OpenCASCADE) | PASS |
| Volume STEP × kernel | desvio 3,5 × 10⁻¹⁵ |
| Área STEP × kernel | desvio 7,8 × 10⁻¹⁵ |
| Volume STL × kernel | desvio 3,3 × 10⁻⁹ |
| Espessura STEP | 12,000000 mm |
| Raio externo máximo | 26,000000 mm |
| Raio externo no topo | 26,000000 mm |
| Triângulos STL | 4.496 |

### 7.2 Suítes do repositório

| Gate | Resultado |
| :--- | :--- |
| `npm run lint` | PASS |
| `npm run test:coverage` | 52 testes, 100% statements/branches/functions/lines |
| `npm run audit:cad` | 27/27 |
| `npm run build` | PASS |
| `npm run vuc:proof` | PASS |

### 7.3 Prova VUC da peça

- `vuc_id`: `VUC-ED25519-395A4FE74C953B3D`
- `commit`: `23b6097`
- `hash_input`: `46D618BADFCD07F9BFD7EC2276F554B871C4A3892C30DC41C3C66D6DA0C8B27C`
- `hash_output`: `2EA966B6E935B2EF94D600AB38C20DF2C17BBBD9710097B575A445729A95F1AD`
- `hash_processo`: `395A4FE74C953B3D0F25F5C395EADC24DE8C3D7C83D7747B02D41BBE2DC673E7`
- Verificação da assinatura Ed25519: **válida**.

Arquivo: `proof/vuc-engrenagem-m2-z24.json` e cópia em `deliverables/engrenagem_m2_z24/vuc_proof.json`.

---

## 8. Artefatos entregues

### CAD

| Arquivo | Descrição |
| :--- | :--- |
| `deliverables/engrenagem_m2_z24/engrenagem_m2_z24.step` | STEP AP214, 1 sólido, 1.122 faces |
| `deliverables/engrenagem_m2_z24/engrenagem_m2_z24.stl` | STL binário estanque, 4.496 triângulos |
| `deliverables/engrenagem_m2_z24/engrenagem_m2_z24.dxf` | Perfil 2D com camadas |
| `deliverables/engrenagem_m2_z24/engrenagem_m2_z24_4vistas.png` | Vistas frontal, superior, lateral e isométrica cotadas |
| `deliverables/engrenagem_m2_z24/engrenagem_m2_z24_iso.png` | Perspectiva isométrica de apresentação |
| `deliverables/engrenagem_m2_z24/relatorio_tecnico.md` | Memória de cálculo e limitações |
| `deliverables/engrenagem_m2_z24/manifest.json` | SHA-256 de todos os arquivos |
| `deliverables/engrenagem_m2_z24/engrenagem_m2_z24_validacao.json` | Medições e checagens |

### Viewer

| Arquivo | Descrição |
| :--- | :--- |
| `deliverables/viewer/viewer_engrenagem_m2_z24.png` | Engrenagem carregada no Editor 3D IX |
| `deliverables/viewer/parametrix_presets_viewer.png` | Galeria dos 10 presets no viewer |

### Vídeo

| Arquivo | Descrição |
| :--- | :--- |
| `deliverables/video/parametrix_engrenagem_m2_z24_walkthrough.mp4` | 6 min 37 s, 1080p, narração pt-BR |
| `deliverables/video/LEIA-ME.md` | Capítulos, respostas rápidas e transcrição |
| `deliverables/video/poster.jpg` | Poster 1920×1080 |

---

## 9. Como reproduzir

### 9.1 Subir o app

```bash
cd parametrIX
npm ci
npm run dev
# abrir http://127.0.0.1:3000
```

Deep link da peça:

```text
http://127.0.0.1:3000/?preset=preset-gear-m2-z24&mode=solid&finish=clay&view=isometric
```

### 9.2 Regenerar a peça completa

```bash
npx tsx scripts/cad/export_spur_gear_geometry.ts
QT_QPA_PLATFORM=offscreen freecadcmd scripts/cad/build_spur_gear_step.py
MPLCONFIGDIR=.cache/matplotlib python3 scripts/cad/render_spur_gear_views.py
QT_QPA_PLATFORM=offscreen MPLCONFIGDIR=.cache/matplotlib freecadcmd scripts/cad/verify_spur_gear_delivery.py
npx tsx scripts/cad/finalize_spur_gear_delivery.ts
```

Ou, em um comando:

```bash
npm run cad:gear
```

### 9.3 Validar o repositório

```bash
npm run ci
```

---

## 10. Limitações e riscos

- **Raiz sem filete trocoidal**: para produção seriada, aplicar filete conforme ISO 53 e
  recalcular a concentração de tensão.
- **Sem coroamento de flanco, backlash definido ou tratamento térmico/superficial**.
- **STEP com faces planas discretizadas** (1.122 faces), adequado a CAM/inspeção, mas não é
  um B-Rep com flancos em spline.
- **CAM simulado a partir da NURBS**, não gerado do STEP; não é G-code validado.
- **Massa nominal** depende do certificado do lote de 7075-T6.
- **Vistas de referência**, não substituem desenho normatizado ASME Y14.5 / ISO 129.
- **Sem ensaio mecânico, CMM ou usinagem física**.
- O vídeo tem narração sintetizada em pt-BR; a captura do app é real, mas a voz não é humana.

---

## 11. Próximos passos sugeridos

1. **Trem de engrenagens** Z18/Z24/Z36 com montagem, relações de transmissão e STEP de conjunto.
2. **G-code 2.5D real** gerado a partir do STEP, com fresa de topo, furação e reaming H7,
   incluindo simulação e lista de ferramentas.
3. **Família paramétrica** com tabela de dimensões e desenho de 4 vistas por variante.
4. **FEA dedicada** da engrenagem com carga de torque, contato no flanco e otimização de massa.
5. **Suporte/flange** com Caneta Mágica + FEA + CAM para completar o portfólio mecânico.
6. **Vídeo curto (60 s)** para divulgação, com os melhores momentos do walkthrough.

---

## 12. Histórico de commits

| Commit | Conteúdo |
| :--- | :--- |
| `67bb173` | Kernel da engrenagem, preset, testes e scripts CAD |
| `b669969` | STEP/STL/DXF, 4 vistas, relatório e prova VUC |
| `23b6097` | Payloads auditáveis no certificado VUC |
| `af45501` | Reemissão da prova vinculada ao commit de origem |
| `3dd4952` | Deep link de preset/render e capturas dos 10 presets |
| `38a5d5f` | Galeria com destaque da engrenagem |
| `d072155` | Vídeo walkthrough, poster e transcrição |

Branch: `feat/engrenagem-m2-z24`  
Base: `main` em `4dfd4d0`.
