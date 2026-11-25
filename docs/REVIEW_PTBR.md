# Revisão técnica do Parametric Forge / ParametrIX

## Veredito curto

O projeto entrega um núcleo CAD/CAE/CAM determinístico forte e reproduzível: a auditoria executável passou em **27/27** casos e a suíte unitária, isolada da integração que não sobe neste ambiente, passou em **31 arquivos / 145 testes**, com **100% de statements, branches, functions e lines** nos **44 arquivos explicitamente incluídos** na configuração de cobertura. Isso não prova 100% de cobertura de todos os arquivos do repositório nem um CI verde: a suíte completa falha porque `tests/mcp/integration.test.ts` não consegue iniciar `server.ts`.

A integração Molt/Qwen/OpenAI-compatible foi adicionada de forma conservadora. O runner chama somente MCP JSON-RPC, mantém uma allowlist de ferramentas e nunca transforma prompt em shell. O workflow manual do GitHub Actions inicia o Parametrix no próprio runner, sem túnel público, e aceita uma única tool call estruturada quando há LLM.

## Métricas observadas no snapshot

- `npm ci` original: **falha**, pois `package.json` e `package-lock.json` estavam fora de sincronia. O lock foi regenerado no workspace entregue.
- Compatibilidade: as dependências Firebase instaladas exigem Node `>=24.12.0`; os workflows existentes usavam Node 22. Eles foram alinhados para Node 24 e o requisito foi declarado em `package.json`.
- `npm run lint`: **passa** após instalar os binários opcionais no ambiente ARM64; o primeiro resultado negativo foi causado pela ausência do pacote nativo TypeScript ARM64.
- `npm run audit:cad`: **27/27 PASS**, incluindo DXF, 3DM/NURBS, STL, STEP/IFC, IPT/OLE2/ACIS, CAM presets e LLM briefing.
- `npm run test:coverage` completo: **145 testes passaram, 14 ficaram skipped**, mas a suíte de integração MCP falhou no `beforeAll` com `servidor nao subiu`. O processo do servidor morre ao carregar `lightningcss` nativo ARM64 neste sandbox.
- Execução unitária sem `tests/mcp/integration.test.ts`: **31 arquivos / 145 testes PASS**; cobertura V8: **100% em todas as quatro métricas** para os 44 arquivos listados em `vitest.config.ts`.
- Build de produção: não validado neste ARM64 porque o binding nativo de `lightningcss` não foi instalado pelo lock/instalação corrente. Isso deve ser repetido no runner Ubuntu x64 com Node 24.
- Contagem auditada no workspace, excluindo dependências e artefatos gerados: **300 arquivos relevantes**; destes, **142 são código/testes** (**86 `src` + 24 `scripts` + 32 testes**). A cobertura V8 instrumentada permanece **44/142 arquivos de código/teste**, não 100% do repositório.

### Cobertura: o que o número significa

O `100%` é real para o conjunto configurado de 44 módulos kernel/servidor, mas a configuração não inclui todos os componentes React, `server.ts`, scripts Python/TypeScript, workflows, documentação ou artefatos CAD. A afirmação correta é: **100% de cobertura V8 do escopo instrumentado, com integração MCP ainda não executável neste ambiente**. Não é correto afirmar “100% dos arquivos do projeto”.

## README versus entrega

O README promete uma plataforma ampla: editor 3D, parser CAD, CAE/CAM, ERP, VUC, MCP, harness LLM, GitHub Pages e artefatos de engrenagem. A auditoria comprova diretamente o caminho CAD/CAE/CAM, o conjunto de presets e a prova VUC. O README também é transparente ao declarar limitações do IPT proprietário e que Qwen local só está comprovado quando existe um runtime local respondendo.

A entrega operacional pode ser resumida assim:

- **100% do escopo da auditoria CAD declarada:** 27/27.
- **100% do escopo de cobertura configurado:** 44/44 arquivos instrumentados, sob a execução unitária.
- **Contrato k6 ampliado:** o script agora cobre REST, JSON-RPC MCP, todas as ferramentas anunciadas, erros de protocolo, autenticação de túnel, métricas Prometheus, probe de concorrência e WebSocket. A execução real depende de um backend inicializado e do binário k6; o CI passou a instalá-lo explicitamente.
- **CI integral:** não entregue como verde no snapshot; o teste MCP integrado falha antes de executar seus 14 casos.
- **GitHub Pages:** workflow e `docs/index.html` existem; publicação real depende de push e configuração do repositório, portanto não foi provada localmente.
- **Molt/Qwen:** agora existe implementação de workflow e runner no pacote entregue; a inferência real só ocorre quando os Secrets/Variables e um endpoint LLM/Qwen forem configurados.

Assim, em vez de um percentual global artificial, a avaliação honesta é: **núcleo CAD/CAE/CAM comprovado; qualidade unitária do escopo instrumentado comprovada; integração/produção ainda pendentes**.

## Auditoria k6 e detecção de falhas

O contrato em `scripts/k6/parametrix_ws_load.js` deixou de testar somente bbox, Hermes e ping WebSocket. Ele enumera `tools/list` e despacha cada tool anunciada; ferramentas stateless recebem argumentos seguros, enquanto ferramentas que exigem navegador devem retornar `-32001` sem relay. Também valida `initialize`, `ping`, `notifications/initialized`, ferramenta inexistente (`-32601`), método desconhecido (`-32601`), argumentos obrigatórios ausentes (`-32602`), JSON inválido, 401 em túnel sem token/inválido, `/metrics`, onboarding, status Claw/Hermes, `ecosystem:sync` e ping/pong.

O runner agora falha no CI se k6 não estiver instalado (`REQUIRE_K6=1`), mas mantém fallback local explícito. O workflow principal adiciona um job Ubuntu x64 com Node 24, `grafana/setup-k6-action@v1`, backend local e artefato de log. O probe concorrente registra `429` acima de `MCP_MAX_INFLIGHT`; o modo estrito opcional é `EXPECT_429=1`, pois transformar a ocorrência em threshold obrigatório pode ser instável quando as respostas são rápidas. Nenhuma execução k6 real foi declarada neste Sandbox ARM64 sem o binário instalado.

O fallback Node foi executado contra o backend local após instalar os bindings ARM64 ausentes: `/api/claw/status` respondeu `readyForClaw: true`, `tools/list` anunciou 23 tools, o contrato completou **44 chamadas HTTP / 0 erros de assert**, e o stress WebSocket passou com 12 clientes, relay MCP bidirecional e VUC Ed25519 válido. A execução rápida observou 0 respostas `429`; isso não invalida o middleware, mas não constitui evidência de saturação nessa rodada. O k6 propriamente dito continua delegado ao job CI que instala o binário.

## README, landing page e GitHub Pages

O README **não é** a landing page. A landing page técnica é `docs/index.html`, publicada pelo workflow `.github/workflows/pages.yml` e também servida pelo backend em `/gitpage/` e `/docs/`. O README funciona como documentação e índice do projeto. A publicação real somente existe depois de o repositório ser enviado ao GitHub e o Pages ser habilitado.

## SWOT com notas de 1 a 3

A nota 1 significa fraco ou não comprovado; 2 significa parcial/condicionado; 3 significa forte e evidenciado.

### Strengths — Forças

- **Kernel CAD/CAE/CAM determinístico: 3/3.** A auditoria reproduz 27 casos com dados mensuráveis.
- **Engrenagem M2 Z24 e artefatos verificáveis: 3/3.** Existem STEP, STL, DXF, PNG, relatório e prova VUC; a validação declara 9/9 checagens.
- **Extensibilidade MCP e agentes: 3/3.** Há endpoint JSON-RPC, catálogo de tools, bridge STDIO e testes unitários do MCP.
- **Documentação de limitações: 3/3.** O README não promete decodificar ASM proprietário quando só existe fluxo criptografado.

### Weaknesses — Fraquezas

- **Reprodutibilidade de instalação: 1/3.** O lock original não correspondia ao manifest e os bindings opcionais ARM64 não foram resolvidos por `npm ci`.
- **Integração end-to-end MCP: 1/3.** O servidor integrado não sobe neste ambiente; isso impede afirmar CI verde.
- **Cobertura global do repositório: 2/3.** O escopo instrumentado tem 100%, mas componentes React, scripts e workflows ficam fora.
- **Segurança operacional: 2/3.** Existe token e isolamento de túnel, mas o próprio documento marca revisão SSRF pendente para URLs remotas.
- **UX, acessibilidade e design system: 1/3.** Há sinais de responsividade mobile e uma interface rica, porém não encontrei suíte automatizada de acessibilidade, critérios WCAG, navegação completa por teclado ou auditoria com axe.

### Opportunities — Oportunidades

- **Molt/Qwen no CI: 3/3.** O fluxo recém-adicionado transforma o MCP local em uma capacidade real de runner, com allowlist e secrets.
- **Melhoria de reprodutibilidade: 3/3.** Fixar Node 24, lock consistente e testar x64/ARM64 reduz a maior fonte atual de falso negativo.
- **Produto orientado a equipes Scrum/Agile: 2/3.** Os módulos permitem fatias verticais CAD → FEA → CAM → prova, mas faltam backlog priorizado, DoD e métricas de fluxo no repositório.
- **Acessibilidade industrial e UX de operador: 3/3.** Contraste, teclado, foco, leitura por screen reader e estados de erro podem diferenciar o produto em chão de fábrica.

### Threats — Ameaças

- **Confusão modelo + harness + prompt: 1/3.** O desempenho de DeepSeek, Qwen ou outro LLM não pode ser inferido apenas pelo nome do modelo.
- **Secrets e execução remota: 1/3.** Expor MCP por túnel ou permitir tool destrutiva sem aprovação pode transformar o agente em caminho de execução indevida.
- **Dependências nativas e evolução de vendors: 1/3.** Vite/Rolldown, lightningcss, Firebase e Node mudam rapidamente.
- **Interpretação de “prova perfeita”: 2/3.** A engrenagem é validada como artefato e malha; isso não equivale a certificação mecânica, tolerância de fabricação ou validação experimental.

## Scrum/Agile: leitura da equipe e do produto

A unidade ideal de trabalho é uma fatia vertical pequena e demonstrável: por exemplo, “importar uma peça STEP, medir NURBS, rodar FEA, registrar hash VUC e expor o resultado por MCP”. Cada item deve ter aceite observável, fixture determinístico, teste de regressão e evidência visual ou JSON.

A equipe precisa separar quatro papéis mesmo que uma pessoa acumule funções: Product Owner para priorizar o fluxo de fabricação; engenharia CAD/CAE/CAM para o domínio; plataforma/agentes para MCP, runners e secrets; e UX/accessibility para operador, mobile e estados de falha. A Definition of Done deve exigir lint, teste, cobertura do escopo afetado, auditoria CAD quando aplicável, prova VUC, documentação e verificação de teclado/contraste para mudanças de UI.

## DeepSeek Harness, Hermes, Claw e “conseguem mesmo?”

O repositório contém um `AgentHarnessDock`, provedores opcionais e bundles para Hermes/OpenClaw/NanoClaw/PicoClaw, mas isso é uma integração/configuração, não prova de que cada agente tenha executado a engrenagem de ponta a ponta. A evidência local prova o kernel e a engrenagem; não há log assinado identificando um run do DeepSeek Harness que tenha criado o artefato.

A referência de Akita é útil justamente porque mede o sistema completo `modelo + harness + prompt + tools + contexto + execução + auditoria`, não apenas o modelo. No ranking v2 consultado, o grupo A.1 inclui Claude Fable 5, Claude Sonnet 5, Claude Opus 5, Kimi K3, GPT 5.6 Sol/Terra, GLM 5.2, Kimi K2.5, Gemini 3.6 Flash e outros. DeepSeek V4 Pro aparece em Tier B no ranking geral citado, mas o relatório do próprio benchmark registra que o caminho `deepclaude` dentro do Claude Code elevou o resultado para 84/89 e Tier A naquela prova. Isso demonstra que o harness pode mudar muito o resultado; não autoriza extrapolar para CAD paramétrico.

Para este projeto, o ranking prático deve ser validado com uma prova própria: importar a engrenagem, executar `tools/list`, chamar FEA/NURBS/VUC, criar ou ajustar um parâmetro, produzir artefatos e passar a auditoria. O agente só “consegue” quando deixa esse rastro executável, não quando escreve um README convincente.

## Arquitetura Molt/Qwen → MCP → CI Runner

Foram adicionados:

- `scripts/molt/parametrix_molt_runner.py`: cliente MCP seguro; suporta `--list`, chamada direta allowlisted e modo opcional `--prompt` para uma única tool call OpenAI-compatible/Qwen.
- `.github/workflows/molt-parametrix.yml`: workflow manual com operações `tools-list`, `vuc-proof`, `structural-fea` e `nurbs-metrics`; inicia o Parametrix no runner e não abre túnel público.
- `docs/MOLTBOT_CI.md`: configuração dos Secrets/Variables, uso e limites.
- `scripts/hermes/parametrix_mcp_stdio.py`: agora encaminha `MCP_TOKEN` como Bearer, corrigindo a diferença entre documentação e comportamento.

Secrets/Variables esperados: `PARAMETRIX_MCP_TOKEN`, opcionalmente `MOLT_LLM_API_KEY`, `MOLT_LLM_BASE_URL`, `MOLT_LLM_MODEL`, `QWEN_API_KEY`, `QWEN_BASE_URL` e `QWEN_MODEL`. O workflow usa `permissions: contents: read` e não aceita shell pelo prompt. Ferramentas destrutivas não devem entrar na allowlist padrão; para elas use aprovação de environment e uma workflow separada.

A relação com Moltbot é por MCP STDIO: o Moltbot/OpenClaw pode iniciar o bridge e receber o Parametrix como servidor MCP. O runner do Actions é a variante reproduzível para CI. O gateway Moltbot em si não foi instalado no sandbox nem pode ser declarado operacional sem endpoint, token e run real fornecidos pelo usuário.

## Próximos bloqueios para declarar “produção”

1. Rodar `npm ci`, lint, cobertura completa, auditoria e build em Ubuntu x64 com Node 24.
2. Corrigir ou isolar o boot do servidor para que `tests/mcp/integration.test.ts` suba sem depender de binding ausente; depois repetir a suíte completa.
3. Adicionar testes de acessibilidade (axe ou equivalente), teclado, foco, semântica e contraste.
4. Resolver a revisão SSRF de `cad_inspect_ipt_step_briefing` quando aceitar `url` remoto.
5. Executar o workflow Molt com um Secret real em um repositório de teste e guardar apenas o resultado sanitizado, nunca a chave.
6. Definir um benchmark agente/harness próprio para a engrenagem e registrar modelo, harness, prompt, versão, custo, latência, tools chamadas e artefatos.

## Referências

[1]: https://github.com/akitaonrails/llm-coding-benchmark "Akita — repositório do LLM Coding Benchmark"
[2]: https://www.akitaonrails.com/2026/07/30/novo-llm-benchmark-refiz-todos-os-testes/ "Akita — novo benchmark com harnesses nativos e ranking v2"
[3]: https://github.com/NERDDAO/moltbot "Moltbot/OpenClaw — repositório e arquitetura do gateway"
[4]: https://github.com/sandraschi/moltbot-mcp "Moltbot MCP — servidor de integração com gateway"
[5]: https://modelcontextprotocol.io/specification/2025-06-18 "Model Context Protocol — especificação e segurança"
[6]: https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows "GitHub Actions — eventos e workflow_run"
[7]: https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect "GitHub Actions — hardening com OIDC"
