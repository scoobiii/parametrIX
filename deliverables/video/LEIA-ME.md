# Vídeo — Engrenagem M2 Z24 no Parametrix

**Arquivo:** `parametrix_engrenagem_m2_z24_walkthrough.mp4`  
**Duração:** 6 min 37 s · **Resolução:** 1920×1080 · **Áudio:** pt-BR sintetizado  
**Conteúdo:** gravação real do app (viewer, CAM, onboarding) + slides técnicos + narração passo a passo.

---

## Capítulos

| Tempo | Bloco |
| ---: | :--- |
| **00:00** | Abertura |
| **00:18** | A peça no viewer |
| **01:08** | API do kernel |
| **02:03** | STEP e validação |
| **02:58** | Processo CAM |
| **03:49** | Pessoa no Parametrix |
| **04:30** | Agente via API |
| **05:35** | O que mais posso produzir |
| **06:14** | Encerramento |

## Respostas rápidas

### 1. Qual API construiu a engrenagem?

A geometria nasceu no **kernel paramétrico interno** do Parametrix, em `src/kernel/spurGear.ts` (TypeScript + Three.js):

- `buildSpurGearProfile()` — perfil de evolvente (ISO 53 / ISO 21771) a partir de módulo, dentes e ângulo de pressão.

- `buildSpurGearMesh()` — triangulação de tampo, paredes e furos com `ShapeUtils` do Three.js; malha fechada.

- `computeSpurGearMetrics()` — diâmetro primitivo, externo, raiz, base, passo, espessura, volume e massa.

- `buildSpurGearModel()` — devolve o `ImportedCadModel` consumido pelo viewer/preset.

- `buildSpurGearDxf()` — perfil 2D para corte/inspeção.


O STEP B-Rep é gerado por **FreeCAD/OpenCASCADE** (`scripts/cad/build_spur_gear_step.py`): `Part.makePolygon`, `Part.Face`, `cut`, `extrude`, `Part.export` e `Mesh.export`.

### 2. Qual processo CAM foi usado?

O preset configura **fresamento CNC 3 eixos**, estratégia de **contorno**, fresa esférica **Ø4 mm**, **stepover 30%**, **stepdown 1,5 mm**, **sobremetal 0,2 mm**, altura segura 20 mm e pós-processador **Fanuc ISO (.nc)**.

**Importante:** o painel CAM do app simula a trajetória a partir da superfície NURBS; **não é um G-code validado para a engrenagem real**. Para produção, o CAM deve ser gerado a partir do STEP, com fresa de topo para o perfil 2.5D e reaming para o furo Ø12 H7. Nenhuma peça física foi usinada.

### 3. Entradas e acessos para pessoa ou agente

**Pessoa:** presets de 1 clique, upload (STEP/STP, IPT, STL, OBJ, DXF, 3DM, IFC, SVG, imagem), assistente “Novo do Zero”, Caneta Mágica, FEA, CAM e exportação STEP/STL/DXF/3DM/.nc/.src.

**Agente:** `GET /llms.txt`, `GET /api/agent/onboarding`, `GET /.well-known/agent.json`, `POST /api/mcp` (JSON-RPC 2.0, 19 ferramentas), `POST /api/cad/llm-briefing`, `GET /swagger`, `GET /api/openapi.json`, e a ponte `window.__PARAMETRIX_MCP__`. Autenticação local SQLite offline ou Firebase.

**Deep link:** `http://127.0.0.1:3000/?preset=preset-gear-m2-z24&mode=solid&finish=clay&view=isometric`.

### 4. O que mais dá para produzir

O mesmo pipeline **pode** entregar trens de engrenagens, famílias Z18/Z24/Z36, suportes e flanges, FEA com otimização de curvatura, desenhos de 4 vistas, G-code e prova VUC; também converte imagem em CAD, importa STEP/IPT e monta conjuntos explodidos.

---

## Transcrição da narração

### 00:00 — Abertura

Este é o registro de como eu construí uma engrenagem de verdade dentro do Parametrix: do kernel paramétrico ao arquivo STEP, do processo CAM à prova VUC. Eu sou o agente DeepSeek, e este é o passo a passo.

### 00:18 — A peça no viewer

Começando pelo viewer. A peça é uma engrenagem cilíndrica de dentes retos: módulo 2, 24 dentes, ângulo de pressão 20 graus, face de 12 milímetros, furo central de 12 H7 e quatro alívios de 8 milímetros. O app mostra 4.496 triângulos, volume de 17,556 centímetros cúbicos e massa de 49,33 gramas em alumínio 7075-T6. Todas essas cotas são derivadas das fórmulas da ISO 53 e da ISO 21771 — não são valores estimados.

### 01:08 — API do kernel

A construção começa no kernel paramétrico, no arquivo src/kernel/spurGear.ts. A API interna tem quatro funções principais. buildSpurGearProfile gera o contorno de evolvente, usando o módulo, o número de dentes e o ângulo de pressão. buildSpurGearMesh triangula tampo, paredes e furos com o ShapeUtils do Three.js. computeSpurGearMetrics calcula diâmetro primitivo, externo, de raiz e de base, passo circular e espessura do dente. E buildSpurGearModel devolve o ImportedCadModel que o viewer consome. O módulo é determinístico, testado e tem cobertura de cem por cento.

### 02:03 — STEP e validação

Para fabricação, o kernel exporta o perfil em profile.json e um script FreeCAD usa a API do OpenCASCADE: Part.makePolygon para o contorno, Part.Face, cut para o furo e os alívios, extrude de 12 milímetros e exportação STEP AP214. O STEP reimportado tem um sólido único, 1.122 faces e volume de 17.555,965 milímetros cúbicos. O desvio contra o kernel é de 3,5 vezes dez elevado a menos quinze. A entrega inclui ainda STL, DXF, quatro vistas cotadas e a prova VUC assinada.

### 02:58 — Processo CAM

O preset carrega o processo CAM de três eixos: estratégia de contorno, fresa esférica de 4 milímetros, stepover de 30 por cento, 1,5 milímetro de profundidade por passe, 0,2 de sobremetal e pós-processador Fanuc. O painel CAM calcula a trajetória, o tempo estimado e o programa. Importante: isso é a simulação do Parametrix a partir da superfície NURBS. Para usinar a engrenagem real, o correto é gerar o CAM a partir do STEP, usar fresa de topo para o perfil 2.5D e reaming para o furo H7. Eu não usinei uma peça física.

### 03:49 — Pessoa no Parametrix

Uma pessoa produz no Parametrix por três caminhos: carrega um preset de um clique, envia STEP, STL, DXF, IPT ou até uma imagem, ou usa o assistente Novo do Zero. Depois, a Caneta Mágica cria furos e rasgos, o painel FEA calcula tensões e o CAM gera a trajetória. Na exportação saem STEP, STL, DXF, 3DM e G-code. E o deep link abre qualquer preset já no modo de render desejado.

### 04:30 — Agente via API

Um agente entra por API. O ponto de descoberta é llms.txt e o onboarding em api/agent/onboarding. O endpoint MCP em api/mcp fala JSON-RPC 2.0 e expõe 19 ferramentas, de cad_detect_part_context e cad_set_component_material até cad_generate_cam_toolpath e cad_export_deliverable. Também existe o api/cad/llm-briefing, que converte STEP e IPT em um briefing compacto para LLMs, o Swagger em swagger, e a ponte window.__PARAMETRIX_MCP__ dentro do navegador. Os acessos são locais, com login SQLite offline ou Firebase.

### 05:35 — O que mais posso produzir

E o que mais eu posso produzir? O mesmo pipeline pode entregar trens de engrenagens, famílias paramétricas Z18, Z24 e Z36, suportes e flanges, análise FEA com otimização de curvatura, desenhos de quatro vistas, G-code e prova VUC. Também posso converter imagem em CAD, importar STEP e IPT e montar conjuntos explodidos. A galeria mostra os dez presets que já estão no app, incluindo esta engrenagem.

### 06:14 — Encerramento

O app está em 127.0.0.1:3000. Os arquivos, o relatório e a prova VUC estão em deliverables. Se quiser, o próximo passo é transformar essa engrenagem em um trem de engrenagens usinável, com G-code gerado a partir do STEP.

---

## Limitações declaradas

- Raiz sem filete trocoidal; sem coroamento de flanco/backlash definido.

- STEP com faces planas discretizadas (1.122 faces), adequado a CAM/inspeção, não é B-Rep com flancos em spline.

- CAM do app é simulação; não houve usinagem física nem medição CMM.

- Massa usa densidade nominal 2.810 kg/m³ (7075-T6).

- As vistas são de referência, não substituem desenho normatizado ASME Y14.5/ISO 129.


## Artefatos

- `deliverables/engrenagem_m2_z24/engrenagem_m2_z24.step`

- `deliverables/engrenagem_m2_z24/engrenagem_m2_z24.stl`

- `deliverables/engrenagem_m2_z24/engrenagem_m2_z24_4vistas.png`

- `deliverables/engrenagem_m2_z24/relatorio_tecnico.md`

- `proof/vuc-engrenagem-m2-z24.json`

