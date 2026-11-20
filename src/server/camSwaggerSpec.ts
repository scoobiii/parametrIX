import { CAM_PRODUCTION_PROGRAMS } from '../kernel/camProcessEngine';

export function buildCamOpenApiSpec(baseUrl: string) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Parametrix CAD/CAM & Frostbite Datacenter API',
      version: '3.0.0',
      description:
        'API REST para envio de serviços CAM por upload de arquivo (.STL, .OBJ, .DXF, .STEP/.STP, .IPT, .3DM), por URL externa ou por payload JSON direto, com catálogo pré-programado para componentes do Datacenter Frostbite (Liquid Cooling 800VDC sem braço mecânico) e robôs humanoides de manutenção, reinício completo do começo ao fim (0% → 100%) e prova VUC determinística.',
    },
    servers: [{ url: baseUrl, description: 'Servidor Local / Sandbox Parametrix' }],
    tags: [
      {
        name: 'CAM Services (Upload · URL · API)',
        description:
          'Recebimento, cálculo G-Code/LPBF/SLA/Laser, listagem SQLite e reinício completo de serviços CAM.',
      },
      {
        name: 'CAM Programs (Datacenter & Humanoides)',
        description:
          'Processos pré-programados para produzir componentes do Datacenter Frostbite e os próprios robôs humanoides.',
      },
      {
        name: 'Frostbite 1MW & VUC',
        description: 'Auditoria determinística VUC e telemetria de recursos.',
      },
      {
        name: 'CAD Translators & MCP',
        description: 'Tradutores .IPT/.STEP anti-alucinação para LLMs e endpoint MCP JSON-RPC 2.0.',
      },
    ],
    paths: {
      '/api/cam/programs': {
        get: {
          tags: ['CAM Programs (Datacenter & Humanoides)'],
          summary: 'Lista processos CAM pré-programados (Datacenter e Robôs Humanoides)',
          parameters: [
            {
              name: 'category',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['datacenter', 'humanoid'] },
              description: 'Filtra entre componentes do datacenter ou dos robôs humanoides.',
            },
          ],
          responses: {
            '200': {
              description: 'Lista de programas CAM pré-programados.',
              content: {
                'application/json': {
                  example: {
                    total: CAM_PRODUCTION_PROGRAMS.length,
                    programs: CAM_PRODUCTION_PROGRAMS.slice(0, 2),
                  },
                },
              },
            },
          },
        },
      },
      '/api/cam/services': {
        get: {
          tags: ['CAM Services (Upload · URL · API)'],
          summary: 'Lista serviços CAM persistidos no SQLite com hash VUC',
          responses: {
            '200': {
              description: 'Serviços CAM ativos, reiniciáveis de começo ao fim.',
            },
          },
        },
        post: {
          tags: ['CAM Services (Upload · URL · API)'],
          summary: 'Envia um novo serviço CAM via Upload de Arquivo, URL ou API JSON',
          description:
            'Aceita sourceKind="file" (base64Data ou fileText + filename), sourceKind="url" (url http/https de arquivo CAD/programa), sourceKind="api" (parâmetros diretos ou programId) ou sourceKind="catalog". Calcula trajetória NURBS + pós-processador e gera hash VUC.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string', example: 'Cold-Plate Liquid Cooling Custom' },
                    sourceKind: {
                      type: 'string',
                      enum: ['file', 'url', 'api', 'catalog'],
                      example: 'api',
                    },
                    targetCategory: {
                      type: 'string',
                      enum: ['datacenter', 'humanoid'],
                      example: 'datacenter',
                    },
                    programId: { type: 'string', example: 'dc-coldplate' },
                    filename: { type: 'string', example: 'coldplate_v2.obj' },
                    base64Data: { type: 'string', description: 'Conteúdo do arquivo em Base64 (para sourceKind=file)' },
                    fileText: { type: 'string', description: 'Conteúdo ASCII direto (.obj/.dxf/.stl/.nc) opcional' },
                    url: { type: 'string', example: 'https://exemplo.com/modelos/coldplate.stl' },
                    machineType: {
                      type: 'string',
                      enum: ['cnc-5axis', 'cnc-3axis', 'powder-metal', 'resin-sla', 'laser-cut', 'robot-6axis', 'robot-weld', 'manual'],
                      example: 'powder-metal',
                    },
                    dimensionsMm: {
                      type: 'object',
                      properties: {
                        spanX: { type: 'number', example: 190 },
                        spanY: { type: 'number', example: 120 },
                        archHeight: { type: 'number', example: 24 },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Serviço CAM criado, calculado e persistido no SQLite com VUC.' },
            '400': { description: 'Parâmetros ou URL inválidos.' },
          },
        },
      },
      '/api/cam/services/{id}/restart': {
        post: {
          tags: ['CAM Services (Upload · URL · API)'],
          summary: 'Reinicia um serviço CAM do começo ao fim (0% → 100%)',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              example: 'cam-srv-dc-coldplate',
            },
          ],
          responses: {
            '200': { description: 'Serviço reiniciado a partir de 0% com novo hash VUC.' },
            '404': { description: 'Serviço CAM não encontrado.' },
          },
        },
      },
      '/api/vuc/verify': {
        post: {
          tags: ['Frostbite 1MW & VUC'],
          summary: 'Registra e valida hash determinístico SHA-256 VUC no SQLite',
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    domain: { type: 'string', example: 'FROSTBITE_DC_LIQUID_COOLING' },
                    summary: { type: 'string', example: 'Ciclo manutenção humanoide validado' },
                    payload: { type: 'object' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Prova VUC gravada no ledger SQLite.' } },
        },
      },
      '/api/cad/llm-briefing': {
        post: {
          tags: ['CAD Translators & MCP'],
          summary: 'Converte arquivos .IPT/.STEP em briefing compacto (<600 tokens) para LLMs',
          responses: { '200': { description: 'Briefing geométrico estruturado.' } },
        },
      },
      '/api/mcp': {
        post: {
          tags: ['CAD Translators & MCP'],
          summary: 'Endpoint MCP JSON-RPC 2.0 (initialize, tools/list, tools/call)',
          responses: { '200': { description: 'Resposta JSON-RPC 2.0.' } },
        },
      },
    },
  };
}

export function buildSwaggerHtml(baseUrl: string): string {
  const specJson = JSON.stringify(buildCamOpenApiSpec(baseUrl));
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Parametrix CAM API — Swagger & OpenAPI 3.0.3</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #0b0e14; color: #e2e8f0; line-height: 1.5; }
    header { background: #111620; border-bottom: 1px solid rgba(255,255,255,0.1); padding: 16px 24px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; }
    h1 { margin: 0; font-size: 18px; color: #f8fafc; }
    .sub { font-size: 12px; color: #94a3b8; margin-top: 2px; }
    .btn { background: #0ea5e9; color: #082f49; border: 0; border-radius: 6px; padding: 8px 14px; font-size: 12px; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-block; }
    .btn-sec { background: #1e293b; color: #e2e8f0; border: 1px solid rgba(255,255,255,0.15); }
    main { max-width: 1120px; margin: 24px auto; padding: 0 16px; display: grid; gap: 20px; }
    .card { background: #111620; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 18px; }
    .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
    .method { display: inline-block; font-family: monospace; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; margin-right: 8px; }
    .GET { background: #0284c7; color: #fff; }
    .POST { background: #059669; color: #fff; }
    .path { font-family: monospace; font-size: 13px; color: #38bdf8; }
    label { display: block; font-size: 12px; color: #94a3b8; margin: 10px 0 4px; }
    input, select, textarea { width: 100%; background: #090c11; color: #e2e8f0; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 8px 10px; font-size: 12px; font-family: monospace; }
    pre { background: #090c11; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 12px; overflow: auto; font-size: 12px; max-height: 360px; color: #a7f3d0; }
    .endpoint { border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px; margin-top: 12px; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Swagger Explorer · Parametrix CAM & Frostbite Datacenter API</h1>
      <div class="sub">OpenAPI 3.0.3 · Recebimento por Upload, URL ou API JSON · Reinício Completo · VUC Auditável</div>
    </div>
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <a class="btn btn-sec" href="/api/openapi.json" target="_blank" rel="noopener noreferrer">OpenAPI JSON</a>
      <a class="btn" href="/">Voltar ao Estúdio 3D</a>
    </div>
  </header>

  <main>
    <section class="card">
      <h2 style="margin:0 0 8px; font-size:15px;">Try It Out — Enviar Serviço CAM (Upload / URL / API JSON)</h2>
      <div class="grid-2">
        <div>
          <label for="srcKind">Modo de Envio (sourceKind)</label>
          <select id="srcKind">
            <option value="api">API JSON Direta (programId / dimensões)</option>
            <option value="url">URL Externa (arquivo CAD remoto)</option>
            <option value="file">Upload de Arquivo (.STL/.OBJ/.DXF/.STEP)</option>
          </select>

          <label for="srvTitle">Título do Serviço</label>
          <input id="srvTitle" value="Cold-Plate Frostbite 800VDC (Lote API)" />

          <label for="srvCat">Alvo (Datacenter ou Robô Humanoide)</label>
          <select id="srvCat">
            <option value="datacenter">Datacenter Frostbite (Liquid Cooling / Rack / 7nm)</option>
            <option value="humanoid">Robô Humanoide de Manutenção</option>
          </select>

          <label for="progId">Programa Pré-Programado</label>
          <select id="progId"></select>

          <label for="machType">Máquina / Processo CAM</label>
          <select id="machType">
            <option value="cnc-5axis">cnc-5axis</option>
            <option value="powder-metal">powder-metal</option>
            <option value="resin-sla">resin-sla</option>
            <option value="laser-cut">laser-cut</option>
            <option value="cnc-3axis">cnc-3axis</option>
            <option value="robot-6axis">robot-6axis</option>
          </select>
        </div>

        <div>
          <label for="srvUrl">URL CAD (usada quando sourceKind = url)</label>
          <input id="srvUrl" placeholder="https://exemplo.com/peca.obj" />

          <label for="srvFile">Upload Arquivo CAD (usado quando sourceKind = file)</label>
          <input id="srvFile" type="file" />

          <label for="restartId">ID do Serviço para Reiniciar do Começo ao Fim</label>
          <input id="restartId" value="cam-srv-dc-coldplate" />

          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:14px;">
            <button class="btn" id="btnSubmitService" type="button">POST /api/cam/services</button>
            <button class="btn btn-sec" id="btnRestartService" type="button">POST /api/cam/services/:id/restart</button>
            <button class="btn btn-sec" id="btnListServices" type="button">GET /api/cam/services</button>
          </div>
        </div>
      </div>

      <label>Resposta em Tempo Real</label>
      <pre id="apiOutput">Pronto. Clique em qualquer ação acima para testar a API.</pre>
    </section>

    <section class="card">
      <h2 style="margin:0 0 8px; font-size:15px;">Especificação de Endpoints (OpenAPI 3.0.3)</h2>
      <div id="endpointsContainer"></div>
    </section>
  </main>

  <script>
    const SPEC = ${specJson};
    const out = document.getElementById('apiOutput');
    const progSel = document.getElementById('progId');
    const programs = SPEC.paths['/api/cam/programs'].get.responses['200'].content['application/json'].example.programs || [];

    fetch('/api/cam/programs').then(r => r.json()).then(data => {
      const list = data.programs || programs;
      progSel.innerHTML = list.map(p => '<option value="' + p.id + '">' + p.id + ' — ' + p.title + '</option>').join('');
    }).catch(() => {});

    const container = document.getElementById('endpointsContainer');
    for (const [route, methods] of Object.entries(SPEC.paths)) {
      for (const [method, meta] of Object.entries(methods)) {
        const div = document.createElement('div');
        div.className = 'endpoint';
        div.innerHTML =
          '<div><span class="method ' + method.toUpperCase() + '">' + method.toUpperCase() + '</span><span class="path">' + route + '</span></div>' +
          '<div style="font-size:13px; color:#cbd5e1; margin-top:4px;">' + (meta.summary || '') + '</div>' +
          (meta.description ? '<div style="font-size:12px; color:#94a3b8; margin-top:2px;">' + meta.description + '</div>' : '');
        container.appendChild(div);
      }
    }

    function readFileAsBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const res = String(reader.result || '');
          const idx = res.indexOf(',');
          resolve(idx >= 0 ? res.slice(idx + 1) : res);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    document.getElementById('btnSubmitService').addEventListener('click', async () => {
      const kind = document.getElementById('srcKind').value;
      const body = {
        title: document.getElementById('srvTitle').value,
        sourceKind: kind,
        targetCategory: document.getElementById('srvCat').value,
        programId: document.getElementById('progId').value || 'dc-coldplate',
        machineType: document.getElementById('machType').value,
      };
      if (kind === 'url') {
        body.url = document.getElementById('srvUrl').value;
      } else if (kind === 'file') {
        const fileEl = document.getElementById('srvFile');
        if (fileEl.files && fileEl.files[0]) {
          body.filename = fileEl.files[0].name;
          body.base64Data = await readFileAsBase64(fileEl.files[0]);
        }
      }
      const r = await fetch('/api/cam/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await r.json();
      if (json.job && json.job.id) {
        document.getElementById('restartId').value = json.job.id;
      }
      out.textContent = JSON.stringify(json, null, 2);
    });

    document.getElementById('btnRestartService').addEventListener('click', async () => {
      const id = encodeURIComponent(document.getElementById('restartId').value.trim());
      const r = await fetch('/api/cam/services/' + id + '/restart', { method: 'POST' });
      out.textContent = JSON.stringify(await r.json(), null, 2);
    });

    document.getElementById('btnListServices').addEventListener('click', async () => {
      const r = await fetch('/api/cam/services');
      out.textContent = JSON.stringify(await r.json(), null, 2);
    });
  </script>
</body>
</html>`;
}
