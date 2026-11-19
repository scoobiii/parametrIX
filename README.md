# Parametrix CAD Studio

Plataforma paramétrica full-stack para modelagem NURBS, análise estrutural FEA, visualização industrial **Editor 3D IX**, fabricação CAM CNC/Robótica KUKA 6-eixos, sustentabilidade LCA e verificação matemática determinística **SCOOBIII / VUC**.

---

## Principais Capacidades Implementadas

### 1. Kernel Real de Importação Multi-Formato (`.STP` / `.STEP` / `.IPT` / `.3DM` / `.STL` / `.OBJ` / `.DXF` / `.SVG` / Imagem-para-CAD)
- **STEP / STP / IGES / BREP via OpenCASCADE WASM (`occt-import-js`)** — Rota server-side `POST /api/cad/parse-step` (`serverCadParser.ts`) que executa tesselação B-Rep real, preservação da árvore de subcomponentes/hierarquia, detecção automática de unidades (m → mm) e conversão de coordenadas Z-up CAD para Y-up Three.js.
- **Autodesk Inventor `.IPT` via OLE2 + `zlib` + ACIS SAT/SAB (`cfb`)** — Rota `POST /api/cad/parse-ipt` extrai contêineres compostos OLE2, descomprime fluxos `zlib`, lê loops/superfícies ACIS SAT ASCII, malhas de exibição Float32 indexadas ou nuvens de coordenadas binárias SAB (com escala automática de cm → mm).
- **Imagem → CAD Fidedigno (`.PNG`, `.JPG`, `.WEBP`, `.SVG`)** — Vetorização de silhuetas e extrusão paramétrica fiel preservando proporções e gerando componente inspecionável no editor 3D.
- **Exportação Industrial** — OpenNURBS (`.3dm`), STL binário estanque (`.stl`), AutoCAD DXF R2000 (`.dxf` com camadas `3DFACE`, isocurvas e toolpaths), Fanuc G-Code (`.nc`) e KUKA KRL (`.src`), com suporte a exportação de peça isolada ou conjunto completo.

### 2. Editor 3D IX, Object Mask & Render PBR por Componente
- Barra de navegação **IX** com árvore de modelos, vista explodida (`explodeFactor`), seção em tempo real nos eixos `X / Y / Z` (com inversão), 7 vistas ortográficas/isométricas + cubo D-Pad, medição geométrica e upload direto de arquivo.
- **Classificação & Object Mask** — Segmentação automática por família e subfamília mecânica/estrutural, atribuindo cores únicas de máscara e permitindo alterar materiais PBR (`Alumínio`, `Titânio`, `Fibra de Carbono`, `Polímero`, `Vidro`, `Madeira`, `Argila`) globalmente ou por componente individual.
- **Contexto de Engenharia & Normas por Segmento** — Identifica fabricante, modelo, especificações, uso pretendido e certificações aplicáveis (`Ciclismo ISO 4210`, `Automotivo`, `Aeroespacial AS9100`, `Arquitetura/BIM NBR 8800 / Eurocode 3`, `Industrial CNC ISO 2768 / ASME Y14.5`, `Robótica ISO 10218`, `Médico ISO 13485`).

### 3. Caneta Mágica & Agente MCP Espacial
- Clique ou delimite qualquer ponto/região diretamente sobre a geometria 3D para abrir o menu flutuante translúcido da **Caneta Mágica**:
  - **Rasgo / Recorte Paramétrico** (`slot-cutout`) com largura, comprimento e profundidade configuráveis;
  - **Furo Passante** (`through-hole`);
  - **Parafusos Métricos ISO 68-1** (`M3` a `M12` com passo e brotamento reais);
  - **Nervuras / Reforços** (`rib-boss`);
  - **Prompt Livre via MCP** conectado às coordenadas espaciais exatas `[x, y, z]`, normal da face e `componentId`.

### 4. Análise de Curvatura NURBS & Otimização Automática de Peso
- Módulo `src/kernel/curvatureOptimizer.ts` calcula a geometria diferencial sobre a superfície NURBS biquadrática/bicúbica (curvatura Gaussiana $K$, curvatura média $H$, curvaturas principais $\kappa_1, \kappa_2$ e energia de Willmore $\int H^2\,dA$).
- Identifica regiões de dupla curvatura aptas a trabalhar por ação de casca/membrana e busca configurações paramétricas mais leves (`thicknessMm`, `archHeight`, `ribCountU`, `ribCountV`) mantendo Fator de Segurança $SF \ge SF_{\text{norma}}$ e flecha máxima dentro do limite normativo, aplicando diretamente via `setDesignParams`.

### 5. Tolerâncias Geométricas GD&T por Camada (Layer) Integradas ao NURBS
- Módulo `src/kernel/layerTolerances.ts` permite configurar classes ISO 2768-1/2 (`f`, `m`, `c`, `v` ou `Custom`), tolerância de perfil e tolerância linear por camada/componente do CAD.
- Calcula em tempo real o desvio geométrico combinado: erro cordal da discretização NURBS $e_{\text{chord}} = \frac{h_{\max}^2 |\kappa_{\max}|}{8}$ somado à deflexão elástica FEA sob carga real, cruzando com as normas do segmento ativo e oferecendo refinamento automático da subdivisão NURBS (`uDivisions`, `vDivisions`).

### 6. Dashboard de Pegada de Carbono (LCA de Fabricação)
- Aba **Pegada CO₂** (`src/components/SustainabilityDashboard.tsx` + `src/kernel/carbonFootprint.ts`) cruza:
  - Carbono incorporado e densidade do material selecionado;
  - Volume de tarugo bruto vs peça líquida (`Buy-to-Fly`), desperdício de cavaco CAM (`stockMarginMm`, `stepdownMm`) e crédito de reciclagem;
  - Eficiência energética e curva de potência de máquinas CNC 3/5-eixos vs Robô KUKA 6-eixos sob diferentes matrizes elétricas (`Rede Brasil SIN`, `UE`, `Global`, `Térmica`).

### 7. Prova Matemática Determinística SCOOBIII / VUC
- Módulo `src/kernel/scoobiiiVuc.ts` e `ScoobiiiVucModal.tsx` emitem certificado auditável verificando:
  - Partição da unidade racional Cox-de Boor ($\sum R_{i,j} = 1$) e vetor de nós clamped;
  - Positividade do Jacobiano superficial ($\|\partial S/\partial u \times \partial S/\partial v\| > 0$);
  - Inércia efetiva BIM, fator de concentração de tensões $K_t$ (Kirsch/Peterson) dos recortes da Caneta Mágica e engajamento de roscas ISO;
  - Critério de Von Mises, elástica de Euler-Bernoulli e Fator de Segurança normativo com exportação em Markdown (`.md`) e JSON (`.json`).

### 8. Guia Guiado por Voz, Presets Completos e Firebase Isolado
- Tela inicial com upload imediato, **5 Presets Completos 1-Clique** (Garfo Downhill multi-peça, Pá Helicoidal Titânio AS9100, Flange CNC + M8, Abóbada BIM, Efetuador KUKA 6-Eixos) e explicação por voz (`SpeechSynthesis pt-BR`) de cada módulo.
- Persistência isolada por usuário autenticado via Firebase Auth + Firestore (`users/{uid}/projects` e `users/{uid}/deliverables`).

### 9. Interface Mobile-First (`360px` a `1440px`)
- **Header Responsivo em 3 Zonas**: Em smartphones (`< 768px`), exibe a marca, o módulo ativo atual e ações de conta/exportação sem truncamento de abas.
- **Barra Inferior de Polegar (Thumb-Zone Nav)**: Navegação fixa inferior para **Início**, **3D IX**, **CAM**, **CO₂** e gaveta deslizante **Mais** (Grasshopper, MCP, Plugins, Arquivos CAD, Prova SCOOBIII/VUC e GitPage).
- **Sub-Visões Adaptativas**: Alternância dedicada entre *Simulação 3D / Parâmetros* em CAM, *Dividido / Grafo / Preview 3D* no Grasshopper e alternância *Plugins / Editor* no SDK. Popovers da barra IX respeitam a zona do D-Pad em telas estreitas.

### 10. GitPage Dinâmica (`/docs/index.html` e `/gitpage`)
- Landing page técnica e interativa pronta para **GitHub Pages** (`docs/index.html`) e servida diretamente pelo servidor em `/gitpage/` e `/docs/`.
- Inclui **Playground NURBS 3D em Canvas 2D/3D** com rotação por arraste, sliders paramétricos em tempo real (`Vão X`, `Altura Z`, `Torção`, `Espessura`, `Subdivisão`), otimização automática de curvatura, explorador dinâmico de segmentos + chamadas MCP JSON-RPC e matriz comparativa CNC vs Robô KUKA 6-eixos.

---

## Stack & Arquitetura

- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4, Three.js (`OrbitControls`, `TransformControls`, `RoomEnvironment`), Lucide Icons.
- **Backend (`server.ts`, porta `3000`)**: Express + Vite middleware, `occt-import-js` (OpenCASCADE WASM), `cfb` + `zlib` (OLE2 `.ipt`), `@google/genai` (Agente RAG + MCP Tool Calling em `/api/rag-mcp-agent`), rotas estáticas `/gitpage` e `/docs`.
- **Banco & Autenticação**: Firebase Authentication (Google) e Cloud Firestore com isolamento estrito por `uid`.

## Como Publicar a GitPage no GitHub Pages

1. Faça push do repositório para o GitHub mantendo a pasta `docs/index.html`.
2. Acesse **Settings → Pages** no repositório do GitHub.
3. Em **Build and deployment**, selecione **Deploy from a branch** → Branch `main` e pasta `/docs`.
4. Localmente ou no ambiente Node.js, acesse diretamente `http://localhost:3000/gitpage/`.

## Scripts

```bash
npm run dev      # Inicia server.ts + Vite em http://localhost:3000 (e /gitpage)
npm run lint     # Verificação de tipos TypeScript (tsc --noEmit)
npm run build    # Build de produção Vite (dist/)
npm run start    # Servidor em produção (node server.ts)
```

