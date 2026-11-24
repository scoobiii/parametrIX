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
- Tela inicial com upload imediato, **10 Presets Completos 1-Clique** (Garfo Downhill multi-peça, Pá Helicoidal Titânio AS9100, Flange CNC + M8, **Engrenagem M2 Z24 em STEP/STL**, Abóbada BIM, Efetuador KUKA 6-Eixos, Rack Frostbite, SoC Híbrido, Pó Metálico LPBF e Resina SLA) e explicação por voz (`SpeechSynthesis pt-BR`) de cada módulo.
- Persistência isolada por usuário autenticado via Firebase Auth + Firestore (`users/{uid}/projects` e `users/{uid}/deliverables`).

### 9. Interface Mobile-First (`360px` a `1440px`)
- **Header Responsivo em 3 Zonas**: Em smartphones (`< 768px`), exibe a marca, o módulo ativo atual e ações de conta/exportação sem truncamento de abas.
- **Barra Inferior de Polegar (Thumb-Zone Nav)**: Navegação fixa inferior para **Início**, **3D IX**, **CAM**, **CO₂** e gaveta deslizante **Mais** (Grasshopper, MCP, Plugins, Arquivos CAD, Prova SCOOBIII/VUC e GitPage).
- **Sub-Visões Adaptativas**: Alternância dedicada entre *Simulação 3D / Parâmetros* em CAM, *Dividido / Grafo / Preview 3D* no Grasshopper e alternância *Plugins / Editor* no SDK. Popovers da barra IX respeitam a zona do D-Pad em telas estreitas.

### 10. GitPage Dinâmica (`/docs/index.html` e `/gitpage`)
- Landing page técnica e interativa pronta para **GitHub Pages** (`docs/index.html`) e servida diretamente pelo servidor em `/gitpage/` e `/docs/`.
- Inclui **Playground NURBS 3D em Canvas 2D/3D** com rotação por arraste, sliders paramétricos em tempo real (`Vão X`, `Altura Z`, `Torção`, `Espessura`, `Subdivisão`), otimização automática de curvatura, explorador dinâmico de segmentos + chamadas MCP JSON-RPC e matriz comparativa CNC vs Robô KUKA 6-eixos.

### 11. Onboarding para Agentes & Tradutor `.IPT` / `.STEP` para LLMs
- **Descoberta Automática**: `GET /llms.txt`, `GET /api/agent/onboarding` e `GET /.well-known/agent.json` expõem as capacidades, protocolos, ferramentas MCP e regras de ingestão para qualquer agente de IA.
- **Tradutor Anti-Alucinação & Anti-Estouro de Tokens (`POST /api/cad/llm-briefing`)**: Converte arquivos binários `.IPT` (OLE2 + zlib + ACIS SAT/Display Mesh) e `.STEP/.STP` (OpenCASCADE B-Rep WASM) em um briefing estruturado e compacto (< 600 tokens em `llmSummaryText`, bounding boxes em `mm`, papéis mecânicos, normas sugeridas e iProperties) — sem despejar milhares de floats de vértices na janela do LLM. Caso o `.IPT` use ShapeManager ASM criptografado sem malha exposta, devolve `geometryStatus: "metadata_only_asm_encrypted"` com streams OLE2, tokens e instrução clara de exportação `.STEP`.
- **MCP HTTP JSON-RPC 2.0 (`POST /api/mcp`)**: Suporta `initialize`, `tools/list` e `tools/call` com execução stateless server-side para `cad_inspect_ipt_step_briefing`, `cad_get_agent_onboarding`, `cad_run_structural_fea`, `cad_evaluate_nurbs_metrics`, `cad_optimize_surface_curvature` e `cad_get_scoobiii_vuc_proof`, além do bridge de cena 3D em `window.__PARAMETRIX_MCP__`.

### 12. Rack `#FrostbiteEngine` vs `@nvidia` (`1 MW Bus & 800 VDC HVAC`) + Datacenter Liquid Cooling & Robôs Humanoides
- Módulo `src/kernel/rackFrostbiteEngine.ts` e painel `FrostbiteRackDashboard.tsx` comparam lado a lado um rack **1 MW / 800 VDC** baseado em **Frostbite** (CPU por **interaction nets** no estilo HVM/Bend, reescrita local em grafo sem cache/coerência/locks) frente a um rack **@nvidia** equivalente, calculando entregas líquidas, PUE térmico e hash SHA-256 **VUC** verificável em tempo real (`POST /api/vuc/verify`).
- **Datacenter Pronto Funcional (Sem Braço Mecânico)**: O menu Frostbite opera como um datacenter **Liquid Cooling 800 VDC** pronto e funcional, **sem braço mecânico industrial** na cena 3D (`Viewport3D` oculta o braço e exibe CDUs + manifolds liquid cooling + robôs **humanoides autônomos** `FBE-Humanoide-01..03` executando manutenção hidráulica e atualização hot-swap de lâminas).
- **Transparência Técnica Pré-Silício**: Especificações de Frostbite estritamente documentadas como **tiles em silício CMOS binário térmico padrão a 7 nm**, **500 MHz** até **GDS final** (co-design por enxame de agentes), **4,6× desempenho/Watt**, **pré-silício** (**não óptico e não quântico**), com ausência declarada de dados públicos de fornecedores, processos CAM comerciais, CAPEX/OPEX ou ROI.

### 13. Campo Visual Centralizado, Menus Recuados nas Bordas & Voz Full-App
- **Workspace 3D Centralizado (PC / Tablet / Mobile-First)**: Campo visual centralizado por padrão, com **menus recuados nas bordas esquerda (`CAD / FEA`) e direita (`CAM / VUC`)** revelados ao tocar/passar nas bordas, preservando visibilidade máxima da peça e atalhos de voz/toolbar inferior mobile.
- **Comandos de Voz Universais (`voiceCommandParser.ts` + Web Speech API)**: Controle por voz (`pt-BR`) para reiniciar o CAM, alternar processos (`powder-metal`, `resin-sla`, `robot-weld`, `laser-cut`), rodar FEA, otimizar curvatura NURBS, abrir o assistente de novo projeto, carregar presets e exportar entregas.

### 14. CAM Multi-Processo Datacenter/Humanoides, Serviços (Upload/URL/API) & Swagger UI
- **Programas CAM Pré-Programados**: Catálogo dedicado (`CAM_PRODUCTION_PROGRAMS`) para fabricar **todos os componentes do Datacenter** (`dc-coldplate`, `dc-manifold`, `dc-rack-frame`, `dc-hvac-cdu`, `dc-frostbite-tile`) e os **próprios Robôs Humanoides** (`hum-torso`, `hum-actuator`, `hum-visor-head`, `hum-hand-effector`), além de **CAM de CPU / GPU / SoC Silício, Óptico e Híbrido**.
- **8 Modalidades Produtivas Reiniciáveis (0% → 100%)**: `cnc-5axis`, `cnc-3axis`, `robot-6axis`, `powder-metal` (SLM/LPBF), `resin-sla` (UV), `robot-weld` (TIG/MIG arame + arco), `laser-cut` (feixe + ponto focal) e `manual`. Todo processo ou serviço CAM pode ser reiniciado do começo ao fim com novo hash VUC.
- **Ingestão de Serviços CAM & Swagger UI (`/swagger` e `/api/openapi.json`)**:
  - `GET /swagger` / `GET /api/docs` — Documentação interativa **Swagger / OpenAPI 3.0.3** com console *Try-It-Out* para testar os endpoints CAM ao vivo.
  - `GET /api/cam/programs` — Lista os 9 programas CAM pré-programados (`?category=datacenter|humanoid`).
  - `GET /api/cam/services` & `POST /api/cam/services` — Recebe ordens CAM via **Upload de arquivo** (`.STEP`, `.IPT`, `.STL`, `.DXF`, `.3DM`), **URL externa** (com proteção SSRF) ou **API JSON**, persistindo em SQLite com hash VUC.
  - `POST /api/cam/services/:id/restart` — Reinicia um serviço CAM do início ao fim (`0%`, incrementa contador de reinício e gera novo hash VUC).
- **Exportação & Despacho em Máquina Remota**: Além do download `.3dm/.stl/.dxf/.nc/.src`, permite conectar/despachar direto para máquinas remotas via `OPC-UA`, `HTTP-Moonraker` ou `SSH-KUKA-Bridge`.

### 15. Autenticação Proprietária SQLite (`localhost`), Login Offline & Multi-Agentes MCP Eye
- **SQLite Nativo (`node:sqlite` via `ParametrixSqliteStore`)**: Persistência local em `data/parametrix.sqlite` para usuários, projetos, histórico de chat WebSocket, registros ERP/CRM, telemetria GPS logística, nós de compartilhamento de processamento (20%), máquinas remotas e ledger VUC.
- **Login Offline 1-Clique**: Aceita provedores `Google`, `Microsoft`, `Oracle`, `Zoho`, `Apple` ou e-mail genérico, além de credenciais proprietárias `localhost` sem depender de nuvem externa.
- **Assistente em Tempo Real (Do Zero)**: `ProjectWizardModal` cria projetos paramétricos inéditos passo a passo a partir de dimensões, material, segmento e processo CAM.
- **Menu Multi-Agente + Bootstrap Local (`llmBootstrap.ts`)**: Seleção direta de `Gemini`, `Claude`, `Manus`, `Grok`, `DeepSeek`, `Qwen`, `Meta` ou `LLM Local` com **Olho MCP** exibindo entradas/saídas espaciais e leitura ao vivo de CPU/GPU/RAM/Rede/usuários logados (`/api/system/resources`) para recomendar/acionar o modelo local mais leve e eficiente.

### 16. Ecossistema Colaborativo, Logística Multimodal GPS & ERP/CRM Aberto
- **Chat em Tempo Real por Perfil (`/ws`)**: Comunicação entre **Cliente**, **Provedor CAM/Fab (CNC/Foxconn/Robôs)**, **Logística (iFood/99/Autônomos)** e **Fornecedor de Insumos**, com agentes autônomos reconfiguráveis por `@handle`, telefone e endereço.
- **Rastreamento GPS & Compartilhamento de 20% Compute**: Monitoramento multimodal ponto a ponto (**Rodoviário, Ferroviário, Aéreo e Fluvial**) com coordenadas em tempo real e pool de compartilhamento voluntário de 20% da capacidade dos dispositivos conectados.
- **ERP / CRM Open Free**: Gestão integrada de ordens de produção, fornecedores, lotes de insumos, cotações e entregas sem custo de licença.

### 17. ParametrIX Media Studio — Identidade Visual 1.0 & Motor Dual (GAN Criativo + Construtiva)
- **Identidade Oficial 1.0 (`src/kernel/mediaStudioEngine.ts` + `MediaStudioPanel.tsx`)**:
  - Marca **PARAMETRIX** — *Tecnologia • Inovação • Liberdade* — *"Engenharia paramétrica para um mundo melhor"*, construída sobre o símbolo **P geométrico** e paleta fixa **Preto (`#05070B`) · Azul (`#2563EB`) · Ciano (`#22D3EE`) · Branco (`#F8FAFC`)** com equivalência **RGB + CMYK**.
  - Suporte completo a **Identidade Oficial ParametrIX** ou criação sob medida para **produtos e marcas de clientes** (cartão de visita, camiseta, polo, embalagem, uniformes e kits corporativos).
- **Motor Criativo GAN (Vetor Latente `z`) + Engenharia Construtiva ParametrIX**:
  - **Camada Criativa (GAN Determinístico)**: Sintetiza vetor latente 8D (`seed`, intensidade criativa, harmônicos de malha NURBS, nós de circuito VUC e vetores cinéticos) com hash reprodutível.
  - **Camada Construtiva ParametrIX**: Audita proporção travada `1:1` do símbolo `P`, sangria industrial (`>= 3 mm` a `300 DPI`), limite de cobertura de tinta **CMYK TAC (`<= 290%`)**, trava de **URL/QR Code** (bloqueado por padrão até confirmação explícita do domínio oficial) e custo unitário/lote integrado ao ERP Open.
- **Pipeline em 7 Etapas & Formatos de Produção**:
  - Fluxo `1. Identidade → 2. Mídia (01–09) → 3. GAN + Construtiva → 4. Personalização → 5. Preview (Frente / Verso / Aplicação Real) → 6. Aprovação → 7. Exportação`.
  - Exporta arquivos reais **`.SVG`** vetorial, **`.PDF`** vetorial imprimível (`%PDF-1.4` com sangria e hash VUC), **`.PNG`** transparente e **`.JPG`**, lançando automaticamente nos entregáveis da sessão e no **ERP Open SQLite**.

### 18. Biblioteca 01–09 & Projeto Especial — ParametrIX no Futebol
- **Matriz Única Derivada em 9 Categorias**: `01 Logotipo`, `02 Redes Sociais`, `03 Papelaria Corporativa` (Cartão de Visita `90×50 mm`, Timbrado, Crachá, Pasta), `04 Vestuário & Produtos` (Camiseta, Polo, Uniforme, Boné, Jaqueta), `05 Futebol & Estádio`, `06 Publicidade & Eventos`, `07 Produtos & Brindes`, `08 Digital` e `09 Manual da Marca`.
- **Projeto Especial Esportivo**: Camisa de Jogador (Frente/Verso), Manga, Calção, Placa de Campo (`6000×900 mm`), Painel LED de Estádio, Backdrop de Entrevista, Colete de Treino e Torcida — com **slot dedicado de patrocinador parceiro sem distorcer o `P`** e trava de conformidade para **direitos de imagem de atletas** e **regras de clube/competição/estádio**.

### 19. Fundação ParametrIF & Agentes Gestores no GitHub
- **ParametrIF Foundation**: Carta de governança da marca, certificação de **Representantes Oficiais** (*Embaixador Regional*, *Engenheiro Certificado VUC*, *Parceiro Manufatura CAM*, *Gestão Esportiva & Clubes*) com emissão de credencial VUC verificável.
- **Agentes Gestores no GitHub (`scoobiii/parametrIX`)**: `@parametrif-brand-guard` (auditoria de paleta/marca e trava QR em PRs), `@parametrix-ci-vuc` (gate obrigatório `100% V8 + 27/27 audit:cad + proof/vuc-latest.json`) e `@parametrif-registry` (sincronia de representantes), com exportação pronta do workflow `.github/workflows/parametrif-brand-guard.yml`.

### 20. Plano de Negócios ParametrIX & Organograma Multi-Agente ERP/CRM
- **Missão**: Democratizar engenharia paramétrica CAD/CAE/CAM, manufatura inteligente e identidade construtiva verificável por prova matemática VUC.
- **Visão**: Consolidar o sistema operacional aberto que une projeto 3D NURBS, chão de fábrica robótico, branding construtivo e ERP/CRM em tempo real.
- **Proposta de Valor**: Do arquivo técnico ou conceito visual à peça fabricada, certificada em Ed25519 VUC e precificada com ROI real em um único fluxo contínuo.
- **Organograma de 10 Agentes Autônomos Integrados ao ERP/CRM ao Vivo**: Mapeia cada agente (*Orquestrador VUC*, *ParametrIF & GitHub*, *Media Studio GAN*, *CAD NURBS*, *CAE FEA & CO₂*, *CAM & Robótica*, *Suprimentos & BOM*, *Logística Multimodal*, *CRM & Clientes*, *Financeiro & Fiscal*) diretamente aos módulos e KPIs em tempo real do **ERP Open / BI / CRM**.

### 21. HUD Flutuante de Curvatura NURBS, Caneta Mágica Blender/BIM & Buffers LMAX
- **HUD Exclusivo na Viewport 3D (`0.0–1.0`)**: Ajuste em tempo real do fator de compensação de curvatura NURBS diretamente sobre a viewport com recálculo ao vivo da otimização estrutural de massa.
- **Caneta Mágica Estendida (`magicPenToolsCatalog.ts`)**: Catálogo completo com **10 ferramentas de malha estilo Blender** (`extrude-face`, `inset-face`, `bevel-edge`, `loop-cut`, `mirror-symmetry`, `solidify-shell`, `subsurf-smooth`, `boolean-union`, `bridge-loops`, `bisect-plane`) + **10 elementos BIM/IFC** (`IfcWall`, `IfcSlab`, `IfcColumn`, `IfcBeam`, `IfcStair`, `IfcCurtainWall`, `IfcRoof`, `IfcFooting`, `IfcDoor`, `IfcWindow`) integrados à cena 3D, MCP e parser de voz.
- **Buffers Circulares LMAX & Probe Real de Hardware GPU**: Telemetria contínua sem alocação excessiva (`LmaxRingBuffer`) e sondagem real de WebGL2 + GPU/DRI Linux (`/api/system/resources`) com prova formal **Ed25519 + SHA-256 VUC** (`npm run vuc:proof` → `proof/vuc-latest.json`).

---

## Auditoria Experimental do Motor CAD / Inventor `.IPT` / CAE / CAM

Todos os submódulos críticos são verificados pela suíte determinística [`scripts/cad_engine_audit.ts`](scripts/cad_engine_audit.ts) (`npm run audit:cad`, **27/27 testes aprovados**) e pela suíte unitária/integração **Vitest com cobertura V8 de 100%** em todo o kernel e no store SQLite (`npm run ci`). Durante a auditoria técnica, bugs reais foram isolados e corrigidos:

### Arquitetura do Decoder Autodesk Inventor (`.IPT`)
Arquivos `.IPT` modernos usam contêineres compostos Microsoft **OLE2 / CFB** com múltiplos fluxos comprimidos proprietários (*ShapeManager ASM* binário, *B-Rep/ACIS*, e eventualmente *Graphics Display Mesh* pré-tesselado):
1. **Descompactação OLE2 + `zlib` (`cfb` + `zlib`)**: Varre todas as entradas de diretório CFB e localiza assinaturas `0x78` (`9C`/`DA`/`01`/`5E`), descomprimindo fluxos com **`zlib.inflateSync`** (tolerando *trailing bytes* de bloco OLE após o `ADLER32` antes de recorrer a `Z_SYNC_FLUSH`).
2. **Extração ACIS SAT / SAB**: Remonta registros multi-linha delimitados por `#`, extrai loops de vértices (`vertex` → `point`) e vértices de malha curva com reconstrução de envoltória *multi-slice* quando faces cilíndricas não possuem laços lineares explícitos.
3. **Display Mesh Float32 & Nuvens Alinhadas (`.IPT` em `cm`)**: Localiza blocos indexados `[vertCount][vtx Float32×3][triCount][idx Uint32×3]` e nuvens alinhadas por fase (`24B Float64` / `12B Float32`), **preservando vértices em planos datum `X=0 / Y=0 / Z=0`** e convertendo automaticamente a unidade interna padrão do Inventor (**centímetros → milímetros**, `×10`) ou metros (`×1000`).
4. **Limitação Estrutural Documentada**: Quando um `.IPT` contém apenas fluxos proprietários criptografados/ofuscados do Autodesk ShapeManager ASM **sem** ACIS SAT/SAB nem *Graphics Display Mesh*, nenhum leitor *open-source* pode decodificar a árvore ASM proprietária sem o kernel comercial da Autodesk; o servidor retorna diagnóstico explícito orientando exportação `.STEP/.STP` no Inventor (sem gerar caixas falsas).

### Bugs Descobertos e Corrigidos via Testes

| Módulo | Bug Descoberto nos Testes | Correção Aplicada |
| :--- | :--- | :--- |
| **DXF (`parseDXF`)** | Camadas 2D (`CIRCLE`, `LWPOLYLINE`, `LINE`, `ARC`) geravam `0 triângulos` e caíam em `buildBoxTriangles` (placa branca retangular genérica na viewport); `3DFACE` ia só para a 1ª camada. | Extrusão real por camada (anéis concêntricos, colares de furação, prismas poligonais `bulge 42`, fitas 3D de arame) + suporte a `ARC`, `ELLIPSE`, `SPLINE`, `POLYLINE/VERTEX/SEQEND`, `SOLID` e `3DFACE` por camada. Exemplo `CHAVETA` corrigido para perfil DIN 6885 real (`44 tri`). |
| **Inventor `.IPT` (`zlib` / ACIS / Float32)** | Streams `zlib` com bytes OLE finais falhavam em `Z_SYNC_FLUSH`; registros ACIS multi-linha `#` quebravam; coordenadas em datum `0` (`Math.abs(v) >= 0.05`) eram descartadas; malha indexada em `cm` ficava `10×` menor; parser fallback local só lia `Float64` sem `0`. | `zlib.inflateSync` primário c/ fallback `Z_SYNC_FLUSH`; montador multi-linha ACIS + envoltória de pontos; extração alinhada por fase aceitando datum `v === 0`; auto-escala `cm → mm` (`×10`) em `serverCadParser.ts` e `parseIPT()`. |
| **STEP & IFC (`parseSTEPorIFC` + OCCT)** | Peças pequenas `< 6mm` com `SI_UNIT(.MILLI.,.METRE.)` eram multiplicadas por `1000×`; `parsePoint3` rejeitava floats ISO sem dígito após o ponto (`0.`, `120.`); comentários `/* ... */` e `;` em strings corrompiam entidades; `IFCFACE`/`IFCPOLYLOOP` retornava `0 tri`; `parseStepWithOcct` re-escalava resultados já convertidos pelo OCCT. | Scanner STEP seguro a strings/comentários, leitura explícita de `SI_UNIT`/`CONVERSION_BASED_UNIT`, regex float ISO `(0. / .5)`, suporte completo `IFCFACE -> IFCFACEOUTERBOUND -> IFCPOLYLOOP`, e trava na re-escala do OCCT quando há unidade explícita. |
| **OpenNURBS (`.3dm`)** | Chunk NURBS `0x20000002` lia `pos + 8` em vez de `pos + 16`, interpretando `degreeU`/`degreeV` (inteiros) como coordenadas Float32 dos pontos de controle. | Detecção do cabeçalho de 16 bytes (`uC, vC, degreeU, degreeV`), restaurando *round-trip* exato (`-108.281 === -108.281`). |
| **STL ASCII/Binário (`parseSTL`)** | Cabeçalhos ASCII `solid` com >256 bytes ou arquivos >= 5 MB eram decodificados como lixo Float32 binário. | Checagem exata de tamanho binário `84 + triCount * 50` + varredura *case-insensitive* de `solid` + `facet` até 32 KB sem teto artificial de 5 MB. |
| **Exportação Isolada (`buildIsolatedEvaluatedMesh`)** | Exportar conjunto importado (`isolationTarget="all"`) devolvia a casca NURBS oculta em vez da montagem importada; parte isolada usava `mesh.boundingBox` global. | Retorna `importedModel` para `'all'`/`'imported'` quando carregado e calcula `computeBounds(matchedImportedPart.positions)` na peça isolada. |
| **SVG (`parseSVGToCad`)** | Falhava fora do DOM (`DOMParser is not defined`), ignorava `<g transform>` e comandos Bézier suaves `S/s` e `T/t`. | Parser XML/SVG puro em TypeScript com pilha de `<g transform="translate/scale">` e suporte completo a `S/s/T/t`. |
| **FEA & Curvatura (`structuralFea.ts`, `curvatureOptimizer.ts`)** | Massa de peça importada tinha dupla divisão por `1000` (`0.000018 / 1000`) travada em piso `0.6 kg`; otimizador de curvatura travava redução em `0%` quando havia `importedModel`. | Cálculo físico real de volume de malha fechada (em `cm³`); otimizador de curvatura avalia a casca NURBS paramétrica sem congelar na massa importada. |
| **CAM Presets (`camRobotics.ts`)** | Preset `preset-cnc-flange` referenciava `tool-flat-12` ausente de `CAM_TOOLS`. | Adicionada `Fresa Topo Plano Ø12mm 4 Cortes` (`tool-flat-12`) à biblioteca `CAM_TOOLS`. |
| **UI Mobile (`Viewport3D.tsx`)** | HUD superior esquerdo (`max-w-[calc(100%-92px)]`) encostava no cubo D-Pad vermelho em telas estreitas. | Margem ampliada para `max-w-[calc(100%-128px)] sm:max-w-[440px]` com truncamento responsivo. |

---

## Peça CAD de Referência — Engrenagem Cilíndrica M2 Z24

Peça mecânica real gerada pelo kernel paramétrico (`src/kernel/spurGear.ts`), disponível no preset
**“Engrenagem Cilíndrica M2 Z24 (ISO 53 · 7075-T6)”**. Todas as dimensões são derivadas de
módulo, número de dentes e ângulo de pressão (ISO 53 / ISO 21771); nenhum valor foi estimado.

| Artefato | Conteúdo |
| :--- | :--- |
| [`engrenagem_m2_z24.step`](deliverables/engrenagem_m2_z24/engrenagem_m2_z24.step) | B-Rep AP214 (FreeCAD/OpenCASCADE): 1 sólido, 1.122 faces, volume 17.555,965 mm³ |
| [`engrenagem_m2_z24.stl`](deliverables/engrenagem_m2_z24/engrenagem_m2_z24.stl) | Malha binária estanque (4.496 triângulos) |
| [`engrenagem_m2_z24.dxf`](deliverables/engrenagem_m2_z24/engrenagem_m2_z24.dxf) | Perfil 2D com camadas `CONTORNO`, `FURO_CENTRAL` e `ALIVIO` |
| [`engrenagem_m2_z24_4vistas.png`](deliverables/engrenagem_m2_z24/engrenagem_m2_z24_4vistas.png) | Vistas frontal, superior, lateral e isométrica cotadas |
| [`engrenagem_m2_z24_iso.png`](deliverables/engrenagem_m2_z24/engrenagem_m2_z24_iso.png) | Perspectiva isométrica de apresentação |
| [`relatorio_tecnico.md`](deliverables/engrenagem_m2_z24/relatorio_tecnico.md) | Memória de cálculo, verificação tridimensional, limitações e hashes |
| [`vuc_proof.json`](deliverables/engrenagem_m2_z24/vuc_proof.json) | Certificado VUC Ed25519 + SHA-256 dos artefatos |

**Especificação:** m = 2,000 mm · z = 24 · α = 20° · d = 48,000 mm · da = 52,000 mm · df = 43,000 mm ·
b = 12,000 mm · furo Ø12 H7 · 4 × Ø8 em PCD 28,000 mm · alumínio 7075-T6 · massa 49,33 g.

**Verificação:** STEP × kernel × STL com desvio de volume relativo de 3,3 × 10⁻⁹ e 9/9 checagens aprovadas
(volume, área, espessura, raio externo, sólido único e validade OpenCASCADE). A entrega inclui prova VUC
assinada; a raiz é modelada sem filete trocoidal e o desenho é de referência — limitações declaradas no relatório.

Reprodução completa: `npm run cad:gear`.

**Abrir direto no viewer:** [`/?preset=preset-gear-m2-z24&mode=solid&finish=clay&view=isometric`](http://127.0.0.1:3000/?preset=preset-gear-m2-z24&mode=solid&finish=clay&view=isometric)
(exige `npm run dev`). O deep link aceita `preset`, `mode` (`solid`, `component-pbr`, `object-mask`, `zebra`, `curvature`,
`stress-heatmap`, `xray`), `finish` (`aluminum`, `titanium`, `clay`, `oak`, `glass`, `carbon-fiber`, `matte-plastic`)
e `view` (`perspective`, `isometric`, `top`, `front`, `right`...).

| Evidência de execução | Conteúdo |
| :--- | :--- |
| [`viewer_engrenagem_m2_z24.png`](deliverables/viewer/viewer_engrenagem_m2_z24.png) | Engrenagem carregada no Editor 3D IX (captura real do app) |
| [`parametrix_presets_viewer.png`](deliverables/viewer/parametrix_presets_viewer.png) | Os 10 presets carregados no viewer |


## Vídeo Walkthrough — da API ao CAM

Gravação de tela comentada (6 min 37 s, 1080p, narração pt-BR) mostrando a peça no viewer, o kernel
`spurGear.ts`, a geração STEP/OpenCASCADE, o processo CAM 3 eixos, os caminhos para pessoa e agente,
e o que mais o pipeline pode produzir.

| Conteúdo | Arquivo |
| :--- | :--- |
| Vídeo completo | [`parametrix_engrenagem_m2_z24_walkthrough.mp4`](deliverables/video/parametrix_engrenagem_m2_z24_walkthrough.mp4) |
| Capítulos, respostas rápidas e transcrição | [`LEIA-ME.md`](deliverables/video/LEIA-ME.md) |
| Poster | [`poster.jpg`](deliverables/video/poster.jpg) |

Capítulos: `00:18` peça no viewer · `01:08` API do kernel · `02:03` STEP e validação · `02:58` CAM ·
`03:49` pessoa no Parametrix · `04:30` agente via API · `05:35` o que mais produzir · `06:14` encerramento.

## Documentação da entrega

O detalhamento técnico completo — escopo, arquitetura do kernel, APIs, processo CAM, verificação,
artefatos, limitações e histórico de commits — está em
[`docs/entrega_engrenagem_m2_z24.md`](docs/entrega_engrenagem_m2_z24.md).

## Stack & Arquitetura

- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4, Three.js (`OrbitControls`, `TransformControls`, `RoomEnvironment`), Lucide Icons.
- **Backend (`server.ts`, porta `3000`)**: Express + WebSocket (`/ws`) + Vite middleware, `node:sqlite` (`ParametrixSqliteStore`), `occt-import-js` (OpenCASCADE WASM), `cfb` + `zlib` (OLE2 `.ipt`), `@google/genai` + hub multi-agente (`/api/agent/multi-chat`), telemetria OS (`/api/system/resources`), despacho remoto (`/api/remote-machine/dispatch`), ledger VUC (`/api/vuc/verify`), Onboarding & MCP JSON-RPC (`/llms.txt`, `/api/agent/onboarding`, `/api/cad/llm-briefing`, `/api/mcp`), rotas estáticas `/gitpage` e `/docs`.
- **Banco & Autenticação**: Modo proprietário local SQLite + login offline (`Google`, `Microsoft`, `Oracle`, `Zoho`, `Apple`, e-mail genérico) e integração opcional Firebase Authentication / Cloud Firestore com isolamento por `uid`.

## Perfil MOBILE_LITE — Android/Termux/Proot de baixa infraestrutura

O perfil Lite validado para o Parametrix usa uma única instância sem `--watch`, Node 24 Linux ARM64 e heap limitado a 384 MB. O diagnóstico somente leitura está em [`scripts/onboard_anticagada.sh`](scripts/onboard_anticagada.sh); ele não instala dependências, não troca o Node e não encerra processos.

```bash
# No Termux, antes de entrar no Debian
termux-wake-lock
proot-distro login debian

# Dentro do Debian, em ~/parametrIX
cd ~/parametrIX
export PATH=/usr/bin:/bin:/usr/sbin:/sbin
NODE_OPTIONS="--max-old-space-size=384" \
  ./node_modules/.bin/tsx server.ts \
  2>&1 | tee /tmp/parametrix-server-lite.log

# Em outra sessão Debian, sem abrir um Proot dentro de outro
curl -I http://127.0.0.1:3000/
```

O aceite mínimo é `HTTP/1.1 200 OK`. Não rode `npm install` durante o boot, não use `tsx --watch` nesse perfil e não inicie uma segunda instância na porta 3000. O build de produção (`npm run build`) é uma etapa separada.

### LLM local offline: estado verificável

O projeto possui o bootstrap/seletor local em `src/kernel/llmBootstrap.ts`, que recomenda um tier/modelo com base em CPU, RAM, GPU, carga e usuários. Também possui uma ponte de inferência para Ollama/llama.cpp via `http://localhost:11434/api/generate` quando o agente `local-llm` é selecionado.

Isso não baixa nem inicia um modelo automaticamente. A inferência offline só está comprovada quando um runtime local responde a `http://127.0.0.1:11434/api/tags` e há um modelo instalado. Sem essa resposta, o seletor está disponível, mas a rota recua para a resposta determinística do MCP Eye; não se deve declarar que o LLM local está executando.

## Como Publicar a GitPage no GitHub Pages

1. Faça push do repositório para o GitHub mantendo a pasta `docs/index.html`.
2. Acesse **Settings → Pages** no repositório do GitHub.
3. Em **Build and deployment**, selecione **Deploy from a branch** → Branch `main` e pasta `/docs`.
4. Localmente ou no ambiente Node.js, acesse diretamente `http://localhost:3000/gitpage/`.

## Scripts & CI (`100% Cobertura V8`)

```bash
npm run dev            # Inicia server.ts + WebSocket + Vite em http://localhost:3000 (e /gitpage)
npm run lint           # Verificação de tipos TypeScript (tsc --noEmit)
npm run test:coverage  # Suíte Vitest com 100% statements/branches/functions/lines (V8)
npm run audit:cad      # Suíte de auditoria determinística do motor CAD/IPT/CAE/CAM (27 testes)
npm run build          # Build de produção Vite (dist/)
npm run vuc:proof      # Emite certificado formal SHA-256 + Ed25519 (proof/vuc-latest.json)
npm run ci             # Gate obrigatório: lint + 100% coverage + audit:cad + build + vuc:proof
npm run onboard        # Diagnóstico somente leitura do ambiente e do perfil MOBILE_LITE
npm run start          # Servidor em produção (tsx server.ts)
```
