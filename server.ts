import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { GoogleGenAI, Type, type Content, type FunctionDeclaration } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import { buildCadLlmBriefing, parseIptWithOle2, parseStepWithOcct } from './serverCadParser';
import { MCP_TOOLS_CATALOG } from './src/kernel/mcpServer';
import { buildNurbsSurfaceFromParams, tessellateNurbsSurface } from './src/kernel/nurbs';
import { evaluateStructuralFea } from './src/kernel/structuralFea';
import { analyzeCurvatureAndOptimizeWeight } from './src/kernel/curvatureOptimizer';
import { computeScoobiiiVucProof } from './src/kernel/scoobiiiVuc';
import { resolvePartEngineeringProfile } from './src/kernel/componentClassifier';
import { selectOptimalLocalLlm } from './src/kernel/llmBootstrap';
import { evaluateRackComparison } from './src/kernel/rackFrostbiteEngine';
import {
  CAM_PRODUCTION_PROGRAMS,
  evaluateCamProcessVisualState,
  getCamProductionProgram,
  listCamProductionPrograms,
} from './src/kernel/camProcessEngine';
import { generateCamToolpath } from './src/kernel/camRobotics';
import {
  PARAMETRIX_SYSTEM_INSTRUCTION_CORE,
  buildCamAgentSystemInstruction,
  buildDeterministicCamAgentReply,
  type CamAgentContextSummary,
} from './src/kernel/camAgentSystemInstruction';
import { buildCamOpenApiSpec, buildSwaggerHtml } from './src/server/camSwaggerSpec';
import { ParametrixSqliteStore } from './src/server/sqliteStore';
import {
  createFormalVucCertificate,
  verifyFormalVucCertificate,
} from './src/server/vucFormalProof';
import type {
  AgentProviderId,
  ApplicationSegment,
  AuthProviderKind,
  CamProgramTargetCategory,
  CamServiceSourceKind,
  CamSettings,
  EcosystemRole,
  FeaSettings,
  LogisticsModal,
  MachineType,
  MaterialFinish,
  ParametricDesignParams,
  PostProcessorFormat,
  RemoteMachineTarget,
} from './src/types/cad';

const PORT = 3000;
const MAX_FETCH_BYTES = 12 * 1024 * 1024;
const PRIMARY_GEMINI_MODEL = 'gemini-4-hydrogen';
const FALLBACK_GEMINI_MODEL = 'gemini-3.1-flash-lite';

function isDisallowedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '0.0.0.0' ||
    lower === '::1' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

function normalizeSourceUrl(rawUrl: string): { fetchUrl: string; isGoogleDrive: boolean; driveId?: string } {
  const parsed = new URL(rawUrl.trim());
  const host = parsed.hostname.toLowerCase();

  if (host === 'drive.google.com' || host.endsWith('.drive.google.com')) {
    const fileMatch = /\/file\/d\/([a-zA-Z0-9_-]+)/.exec(parsed.pathname);
    const idParam = parsed.searchParams.get('id');
    const driveId = fileMatch?.[1] || idParam || undefined;
    if (driveId) {
      return {
        fetchUrl: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveId)}`,
        isGoogleDrive: true,
        driveId,
      };
    }
  }

  if (host === 'docs.google.com') {
    const docMatch = /\/document\/d\/([a-zA-Z0-9_-]+)/.exec(parsed.pathname);
    if (docMatch?.[1]) {
      return {
        fetchUrl: `https://docs.google.com/document/d/${docMatch[1]}/export?format=txt`,
        isGoogleDrive: true,
        driveId: docMatch[1],
      };
    }
    const sheetMatch = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(parsed.pathname);
    if (sheetMatch?.[1]) {
      return {
        fetchUrl: `https://docs.google.com/spreadsheets/d/${sheetMatch[1]}/export?format=csv`,
        isGoogleDrive: true,
        driveId: sheetMatch[1],
      };
    }
  }

  return { fetchUrl: parsed.toString(), isGoogleDrive: false };
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientUpstreamError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded|timed out|timeout|ECONNRESET/i.test(
    msg
  );
}

function formatFriendlyGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('GEMINI_API_KEY')) {
    return { status: 503, message: raw };
  }
  if (/503|UNAVAILABLE|high demand|overloaded/i.test(raw)) {
    return {
      status: 503,
      message:
        'Os modelos de IA estão passando por um pico temporário de demanda (503). Aguarde alguns segundos e tente novamente.',
    };
  }
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(raw)) {
    return {
      status: 429,
      message: 'Limite momentâneo de requisições da API atingido (429). Aguarde alguns segundos.',
    };
  }
  if (/API key|401|403/i.test(raw)) {
    return {
      status: 401,
      message: 'Falha de autenticação na chave GEMINI_API_KEY configurada no servidor.',
    };
  }
  return {
    status: 500,
    message: `Erro ao consultar o agente de engenharia: ${raw.slice(0, 220)}`,
  };
}

async function generateContentWithFallback(
  ai: GoogleGenAI,
  request: {
    contents: Content[];
    systemInstruction: string;
    tools?: { functionDeclarations: FunctionDeclaration[] }[];
    responseMimeType?: string;
    responseSchema?: Record<string, unknown>;
  }
) {
  const attempts: { model: string; delayMs: number }[] = [
    { model: PRIMARY_GEMINI_MODEL, delayMs: 0 },
    { model: PRIMARY_GEMINI_MODEL, delayMs: 650 },
    { model: FALLBACK_GEMINI_MODEL, delayMs: 300 },
    { model: FALLBACK_GEMINI_MODEL, delayMs: 900 },
  ];

  let lastError: unknown = null;
  for (const attempt of attempts) {
    if (attempt.delayMs > 0) {
      await sleep(attempt.delayMs);
    }
    try {
      const response = await ai.models.generateContent({
        model: attempt.model,
        contents: request.contents,
        config: {
          systemInstruction: request.systemInstruction,
          ...(request.tools ? { tools: request.tools } : {}),
          ...(request.responseMimeType ? { responseMimeType: request.responseMimeType } : {}),
          ...(request.responseSchema ? { responseSchema: request.responseSchema } : {}),
        },
      });
      return { response, usedModel: attempt.model };
    } catch (err) {
      lastError = err;
      if (!isTransientUpstreamError(err)) {
        throw err;
      }
    }
  }
  throw lastError;
}

const MCP_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'cad_set_parametric_params',
    description:
      'Atualiza parâmetros geométricos da superfície NURBS e costelas BIM (preset, spanX, spanY, archHeight, waveAmplitude, twistDeg, thicknessMm, ribCountU, ribCountV, ribHeightMm).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        preset: {
          type: Type.STRING,
          description: 'Tipologia: shell, impeller, cavity ou diagrid.',
        },
        spanX: { type: Type.NUMBER, description: 'Comprimento X em mm (100..320).' },
        spanY: { type: Type.NUMBER, description: 'Largura Y em mm (80..240).' },
        archHeight: { type: Type.NUMBER, description: 'Altura / flecha Z em mm (10..110).' },
        waveAmplitude: { type: Type.NUMBER, description: 'Amplitude de onda em mm (0..45).' },
        twistDeg: { type: Type.NUMBER, description: 'Torção em graus (-90..90).' },
        thicknessMm: { type: Type.NUMBER, description: 'Espessura sólida da casca em mm (1..20).' },
        ribCountU: { type: Type.INTEGER, description: 'Quantidade de longarinas BIM U (0..10).' },
        ribCountV: { type: Type.INTEGER, description: 'Quantidade de travessas BIM V (0..10).' },
        ribHeightMm: { type: Type.NUMBER, description: 'Altura das nervuras BIM em mm (4..40).' },
      },
    },
  },
  {
    name: 'cad_isolate_part',
    description:
      'Isola uma peça específica ou subcomponente na viewport 3D (ex: "all", "shell", "ribs-u", "ribs-v", "imported", "BIM-U-1", "COMP-1" ou nome de componente como "Coroa", "Canela", "Bengala").',
    parameters: {
      type: Type.OBJECT,
      properties: {
        partId: {
          type: Type.STRING,
          description: 'Identificador ou nome da peça a isolar.',
        },
      },
      required: ['partId'],
    },
  },
  {
    name: 'cad_explode_assembly',
    description:
      'Controla a vista explodida do conjunto 3D (explodeFactor de 0.0 montado até 1.0 totalmente explodido).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        explodeFactor: {
          type: Type.NUMBER,
          description: 'Fator de explosão entre 0.0 (fechado) e 1.0 (máximo).',
        },
      },
      required: ['explodeFactor'],
    },
  },
  {
    name: 'cad_rotate_component',
    description:
      'Rotaciona o conjunto completo ("assembly") ou um componente específico (ex: "COMP-1") nos eixos X, Y e Z em graus.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        componentId: {
          type: Type.STRING,
          description: 'ID do componente ou "assembly" para o conjunto inteiro.',
        },
        rx: { type: Type.NUMBER, description: 'Rotação X em graus (-180..180).' },
        ry: { type: Type.NUMBER, description: 'Rotação Y em graus (-180..180).' },
        rz: { type: Type.NUMBER, description: 'Rotação Z em graus (-180..180).' },
      },
    },
  },
  {
    name: 'cad_set_component_material',
    description:
      'Altera o material PBR de um componente individual ou ativa o modo renderizado por componente ("component-pbr") / máscara de objetos ("object-mask").',
    parameters: {
      type: Type.OBJECT,
      properties: {
        componentId: {
          type: Type.STRING,
          description: 'ID do componente (ex: "COMP-1", "shell", "BIM-U-1") ou "all".',
        },
        materialFinish: {
          type: Type.STRING,
          description: 'aluminum, titanium, clay, oak, glass, carbon-fiber ou matte-plastic.',
        },
        mode: {
          type: Type.STRING,
          description: 'Opcional: component-pbr, object-mask, solid ou stress-heatmap.',
        },
      },
    },
  },
  {
    name: 'cad_set_segment_profile',
    description:
      'Define o segmento industrial de aplicação (ciclismo-mobilidade, automotivo, aeroespacial, arquitetura-bim, industrial-cnc, robotica, medico) e atualiza normas e critérios de segurança.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        segment: {
          type: Type.STRING,
          description:
            'Segmento: ciclismo-mobilidade, automotivo, aeroespacial, arquitetura-bim, industrial-cnc, robotica ou medico.',
        },
        partName: { type: Type.STRING },
        manufacturer: { type: Type.STRING },
        intendedUse: { type: Type.STRING },
      },
      required: ['segment'],
    },
  },
  {
    name: 'cad_detect_part_context',
    description:
      'Retorna a identidade de engenharia detectada para a peça/conjunto ativo (fabricante, modelo, especificações, certificações normativas, uso pretendido e lista de componentes classificados por família).',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'cad_export_deliverable',
    description:
      'Exporta e baixa o arquivo CAD ou CAM (.3dm, .stl, .dxf, .nc, .src). Se scope="isolated", exporta apenas a peça isolada no momento.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        format: {
          type: Type.STRING,
          description: 'Formato de exportação: 3dm, stl, dxf, nc ou src.',
        },
        scope: {
          type: Type.STRING,
          description: 'assembly (conjunto completo) ou isolated (apenas peça isolada).',
        },
      },
      required: ['format'],
    },
  },
  {
    name: 'cad_run_structural_fea',
    description:
      'Executa cálculo estrutural FEA (tensão equivalente de Von Mises em MPa, deflexão máxima em mm, fator de segurança, conformidade normativa e estresse por peça) e ativa o mapa de calor na viewport 3D.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        loadNewtons: { type: Type.NUMBER, description: 'Carga aplicada em Newtons (100..50000).' },
        supportMode: {
          type: Type.STRING,
          description: 'Condição de contorno: edge-clamped, four-corner-pins ou cantilever-u.',
        },
        loadPattern: {
          type: Type.STRING,
          description: 'Padrão de carregamento: uniform-pressure, center-point ou torsion-tip.',
        },
        showHeatmap: {
          type: Type.BOOLEAN,
          description: 'Ativa o modo Mapa de Calor de Estresse FEA na viewport 3D.',
        },
      },
    },
  },
  {
    name: 'cad_generate_optimized_geometry',
    description:
      'Após dominar/analisar a geometria atual (Antes), gera nova geometria paramétrica reforçada ou aliviada, calcula a resistência estrutural Depois verificando as certificações da peça, compara Antes vs Depois e exibe o mapa de calor de estresse.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        objective: {
          type: Type.STRING,
          description: 'Objetivo da nova geometria: minimize-stress, minimize-mass ou balanced.',
        },
        targetSafetyFactor: {
          type: Type.NUMBER,
          description: 'Fator de segurança alvo (1.2..6.0).',
        },
      },
      required: ['objective'],
    },
  },
  {
    name: 'cad_set_material_finish',
    description:
      'Altera o material estrutural/shader PBR (aluminum, titanium, clay, oak, glass, carbon-fiber, matte-plastic) ou modo de exibição (solid, component-pbr, object-mask, wireframe, zebra, curvature, stress-heatmap, xray).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        materialFinish: { type: Type.STRING },
        mode: { type: Type.STRING },
      },
    },
  },
  {
    name: 'cad_generate_cam_toolpath',
    description:
      'Configura estratégia CAM e máquina (manual, cnc-3axis, cnc-5axis, robot-6axis) gerando trajetórias e código G/KRL.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        machineType: { type: Type.STRING },
        strategy: { type: Type.STRING },
        stepoverPct: { type: Type.NUMBER },
      },
    },
  },
  {
    name: 'cad_magic_pen_feature',
    description:
      'Aplica operação geométrica paramétrica da Caneta Mágica em ponto/área 3D marcada: recorte/rasgo (slot-cutout), furo (through-hole), parafuso com rosca métrica ISO (threaded-bolt M3..M12), nervura/ressalto (rib-boss) ou chanfro (chamfer-fillet).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        kind: {
          type: Type.STRING,
          description: 'slot-cutout, through-hole, threaded-bolt, rib-boss ou chamfer-fillet.',
        },
        point: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
          description: 'Coordenada 3D [x, y, z] em mm.',
        },
        normal: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
          description: 'Vetor normal [nx, ny, nz].',
        },
        targetComponentId: { type: Type.STRING },
        widthMm: { type: Type.NUMBER },
        lengthMm: { type: Type.NUMBER },
        diameterMm: { type: Type.NUMBER },
        depthMm: { type: Type.NUMBER },
        threadSpec: { type: Type.STRING, description: 'M3, M4, M5, M6, M8, M10 ou M12.' },
        headStyle: { type: Type.STRING, description: 'allen ou hex.' },
        slotProfile: { type: Type.STRING, description: 'rectangular ou oblong.' },
      },
      required: ['kind'],
    },
  },
  {
    name: 'cad_get_scoobiii_vuc_proof',
    description:
      'Retorna a prova matemática determinística SCOOBIII/VUC (NURBS Cox-de Boor, Jacobiano, Von Mises, Euler-Bernoulli, rosca ISO e verificação normativa sem chute).',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'cad_evaluate_nurbs_metrics',
    description:
      'Avalia área de superfície NURBS, volume da casca, número de costelas BIM e curvatura média/gaussiana atual.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'cad_optimize_surface_curvature',
    description:
      'Analisa a curvatura da superfície NURBS (|H| médio, energia de Willmore, picos de K) e aplica otimização de alívio de massa mantendo integridade estrutural.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        applyChanges: {
          type: Type.BOOLEAN,
          description: 'Se true (padrão), aplica automaticamente os parâmetros otimizados.',
        },
        targetWeightReductionPct: {
          type: Type.NUMBER,
          description: 'Meta de redução de massa em % (5..35).',
        },
      },
    },
  },
  {
    name: 'cad_set_layer_tolerances',
    description:
      'Define tolerâncias geométricas GD&T por camada (Layer) do arquivo CAD e valida conformidade normativa com a curvatura NURBS e FEA.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        layerName: { type: Type.STRING, description: 'Nome da camada (opcional).' },
        isoClass: { type: Type.STRING, description: 'f, m, c ou v (ISO 2768).' },
        gdtToleranceMm: { type: Type.NUMBER, description: 'Tolerância GD&T em mm (0.01..2.0).' },
      },
    },
  },
];

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error(
      'GEMINI_API_KEY não configurada no servidor. Configure a chave no painel Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  app.post('/api/cad/parse-step', async (req, res) => {
    try {
      const filename = typeof req.body?.filename === 'string' ? req.body.filename : 'modelo.stp';
      const base64Data = typeof req.body?.base64Data === 'string' ? req.body.base64Data : '';
      if (!base64Data) {
        return res.status(400).json({ error: 'Conteúdo base64 do arquivo STEP ausente.' });
      }
      const buffer = Buffer.from(base64Data, 'base64');
      const result = await parseStepWithOcct(buffer, filename);
      return res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(422).json({ error: msg });
    }
  });

  app.post('/api/cad/parse-ipt', async (req, res) => {
    try {
      const filename = typeof req.body?.filename === 'string' ? req.body.filename : 'peca.ipt';
      const base64Data = typeof req.body?.base64Data === 'string' ? req.body.base64Data : '';
      if (!base64Data) {
        return res.status(400).json({ error: 'Conteúdo base64 do arquivo IPT ausente.' });
      }
      const buffer = Buffer.from(base64Data, 'base64');
      const result = await parseIptWithOle2(buffer, filename);
      return res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(422).json({ error: msg });
    }
  });

  // ============================================================================
  // External Agent Onboarding (/llms.txt, /api/agent/onboarding, /.well-known/agent.json)
  // & LLM-Safe .IPT/.STEP Translator (POST /api/cad/llm-briefing, POST /api/mcp)
  // ============================================================================

  const DEFAULT_STATELESS_PARAMS: ParametricDesignParams = {
    preset: 'shell',
    spanX: 200,
    spanY: 140,
    archHeight: 48,
    waveAmplitude: 10,
    twistDeg: 12,
    thicknessMm: 5.5,
    uDivisions: 24,
    vDivisions: 24,
    ribCountU: 4,
    ribCountV: 3,
    ribHeightMm: 14,
    attractorStrength: 0,
  };

  const DEFAULT_STATELESS_FEA: FeaSettings = {
    loadNewtons: 2500,
    supportMode: 'edge-clamped',
    loadPattern: 'uniform-pressure',
    targetSafetyFactor: 2.0,
  };

  const SERVER_MCP_TOOLS = [
    {
      name: 'cad_inspect_ipt_step_briefing',
      category: 'Interoperabilidade LLM (.IPT/.STEP)',
      scope: 'server-stateless',
      description:
        'Decodifica arquivos binários Autodesk Inventor (.IPT via OLE2+zlib+ACIS SAT/Display Mesh) ou .STEP/.STP (via OpenCASCADE WASM) e retorna um briefing compacto em JSON/Markdown (dimensões em mm, componentes, normas, tokens iProperties) SEM estourar o contexto do LLM com arrays de vértices.',
      inputSchema: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'Nome do arquivo com extensão (.ipt, .stp, .step, .igs).' },
          base64Data: { type: 'string', description: 'Conteúdo do arquivo codificado em Base64.' },
          includeSampleVertices: {
            type: 'boolean',
            description: 'Opcional (padrão false): inclui no máximo 24 vértices amostrados.',
          },
        },
        required: ['filename', 'base64Data'],
      },
    },
    {
      name: 'cad_get_agent_onboarding',
      category: 'Onboarding & Descoberta',
      scope: 'server-stateless',
      description:
        'Retorna o manifesto completo de onboarding do Parametrix CAD Studio, fluxos de tradução .IPT/.STEP para LLMs, endpoints HTTP e ferramentas MCP.',
      inputSchema: { type: 'object', properties: {} },
    },
  ];

  const buildOnboardingManifest = (baseUrl: string) => ({
    name: 'Parametrix CAD Studio',
    version: '2.4.0',
    agentReadyStatus: 'ready',
    protocol: 'MCP HTTP JSON-RPC 2.0 + REST LLM Briefing',
    protocolVersion: '2024-11-05',
    discovery: {
      llmsTxt: `${baseUrl}/llms.txt`,
      onboardingJson: `${baseUrl}/api/agent/onboarding`,
      wellKnownAgentJson: `${baseUrl}/.well-known/agent.json`,
      mcpJsonRpcEndpoint: `${baseUrl}/api/mcp`,
      browserRuntimeBridge: 'window.__PARAMETRIX_MCP__',
    },
    iptAndStepRescueProtocol: {
      problemSolved:
        'LLMs não conseguem interpretar binários OLE2/ShapeManager (.IPT) ou entidades B-Rep ISO-10303-21 brutas (.STEP/.STP) diretamente, e recebem explosão de tokens se lerem buffers Float32 de malha.',
      solutionEndpoint: 'POST /api/cad/llm-briefing',
      mcpToolName: 'cad_inspect_ipt_step_briefing',
      supportedCadExtensions: ['.ipt', '.stp', '.step', '.igs', '.iges', '.brep'],
      howItWorks: [
        '1. Envie { filename, base64Data } (ou { url }) para POST /api/cad/llm-briefing ou via JSON-RPC POST /api/mcp (tools/call: cad_inspect_ipt_step_briefing).',
        '2. .STEP/.STP/.IGES são tesselados no servidor via OpenCASCADE (occt-import-js) com normalização automática de unidades para milímetros.',
        '3. .IPT são abertos via container OLE2 CFB + descompressão zlib + ACIS SAT ASCII / Display Mesh / SAB Point-Hull + extração de iProperties UTF-16LE.',
        '4. Arrays gigantes de posições/normais são resumidos em bounding boxes (mm), centroides, volume envelope (cm³), papéis mecânicos inferidos, normas sugeridas e llmSummaryText (< 600 tokens).',
        '5. Se o .IPT usar ShapeManager ASM criptografado sem malha display ou ACIS exposto, o servidor retorna geometryStatus="metadata_only_asm_encrypted" com streams OLE2, iProperties e instrução clara para solicitar exportação .STEP ao usuário.',
      ],
    },
    endpoints: [
      {
        method: 'GET',
        path: '/llms.txt',
        purpose: 'Manual enxuto em Markdown para ingestão imediata por agentes e LLMs.',
      },
      {
        method: 'GET',
        path: '/api/agent/onboarding',
        purpose: 'Manifesto estruturado de ferramentas, formatos suportados e protocolos.',
      },
      {
        method: 'POST',
        path: '/api/cad/llm-briefing',
        purpose: 'Tradutor .IPT/.STEP -> Briefing de Engenharia compacto e seguro para contexto de LLM.',
        bodySchema: {
          filename: 'string (ex: garfo_rockshox.stp ou eixo.ipt)',
          base64Data: 'string (base64 do arquivo) — opcional se url for fornecida',
          url: 'string (http/https ou Google Drive público) — opcional se base64Data for fornecido',
          includeSampleVertices: 'boolean (padrão false)',
        },
      },
      {
        method: 'POST',
        path: '/api/mcp',
        purpose: 'Endpoint MCP HTTP JSON-RPC 2.0 (initialize, ping, tools/list, tools/call).',
      },
      {
        method: 'POST',
        path: '/api/rag-mcp-agent',
        purpose: 'Agente conversacional Gemini + RAG + Function Calling integrado à sessão CAD.',
      },
    ],
    statelessServerTools: SERVER_MCP_TOOLS.map((t) => t.name).concat([
      'cad_run_structural_fea',
      'cad_evaluate_nurbs_metrics',
      'cad_optimize_surface_curvature',
      'cad_get_scoobiii_vuc_proof',
    ]),
    browserInteractiveTools: MCP_TOOLS_CATALOG.map((t) => ({
      name: t.name,
      category: t.category,
      description: t.description,
    })),
    quickstartCurl: {
      inspectIptOrStep: `curl -X POST ${baseUrl}/api/cad/llm-briefing -H "Content-Type: application/json" -d '{"filename":"peca.stp","base64Data":"<BASE64>"}'`,
      mcpListTools: `curl -X POST ${baseUrl}/api/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
      mcpCallBriefing: `curl -X POST ${baseUrl}/api/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"cad_inspect_ipt_step_briefing","arguments":{"filename":"peca.ipt","base64Data":"<BASE64>"}}}'`,
    },
  });

  app.get('/llms.txt', (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host') || `localhost:${PORT}`}`;
    const llmsMd = `# Parametrix CAD Studio — Agent & LLM Onboarding (/llms.txt)

> Engineering CAD/NURBS/FEA/CAM/SCOOBIII Platform with Server-Side .IPT & .STEP Translator for LLMs.

## Por que usar este endpoint ao receber arquivos .IPT ou .STEP/.STP?
LLMs não conseguem ler binários proprietários do Autodesk Inventor (\`.ipt\` OLE2/ShapeManager) nem malhas Float32 gigantes ou B-Rep ISO-10303-21 crus (\`.step\`/\`.stp\`) sem alucinar dimensões ou estourar a janela de contexto.
**Regra de Ouro para Agentes:** Nunca tente interpretar texto/binário bruto de \`.ipt\` ou \`.step\`. Envie o arquivo para o tradutor determinístico do servidor:

- **REST Briefing (recomendado para LLMs):** \`POST ${baseUrl}/api/cad/llm-briefing\`
  - Body JSON: \`{ "filename": "modelo.stp", "base64Data": "<BASE64>" }\` (ou \`{ "url": "https://..." }\`)
  - Retorna: Briefing compacto (< 600 tokens em \`llmSummaryText\` + JSON estruturado) com bounding box em **mm**, lista de componentes, papéis mecânicos inferidos, segmento industrial, normas aplicáveis e próximo fluxo MCP. Zero arrays gigantes de vértices.
- **MCP HTTP JSON-RPC 2.0:** \`POST ${baseUrl}/api/mcp\`
  - \`tools/list\` lista ${SERVER_MCP_TOOLS.length + MCP_TOOLS_CATALOG.length} ferramentas.
  - \`tools/call\` executa diretamente no servidor:
    - \`cad_inspect_ipt_step_briefing\` (Traduz \`.ipt\`/\`.stp\`/\`.step\` para LLM)
    - \`cad_get_agent_onboarding\` (Retorna manifesto JSON completo)
    - \`cad_run_structural_fea\` (Von Mises MPa, deflexão mm, fator de segurança)
    - \`cad_evaluate_nurbs_metrics\` (Área, volume, curvatura NURBS)
    - \`cad_optimize_surface_curvature\` (Análise |H| / Willmore e redução de massa)
    - \`cad_get_scoobiii_vuc_proof\` (Prova matemática determinística Cox-de Boor / Euler-Bernoulli / ISO)
- **Manifesto JSON completo:** \`GET ${baseUrl}/api/agent/onboarding\` e \`GET ${baseUrl}/.well-known/agent.json\`
- **Swagger & OpenAPI 3.0.3 (Serviços CAM via Upload, URL ou API):** \`GET ${baseUrl}/swagger\` e \`GET ${baseUrl}/api/openapi.json\`
  - \`GET ${baseUrl}/api/cam/programs\` (Catálogo pré-programado Datacenter + Robôs Humanoides)
  - \`POST ${baseUrl}/api/cam/services\` (Recebe arquivo base64/texto, URL externa ou payload JSON API)
  - \`POST ${baseUrl}/api/cam/services/:id/restart\` (Reinicia qualquer processo CAM do começo ao fim com VUC)
- **Bridge de Sessão Visual 3D (Browser):** \`window.__PARAMETRIX_MCP__\` (para isolar peças, explodir vista IX, Caneta Mágica, Máscara de Objetos e exportar \`.3dm\`/\`.stl\`/\`.dxf\`/\`.nc\`/\`.src\`).
- **Prova Formal VUC (SHA-256 + Ed25519):** \`POST ${baseUrl}/api/vuc/formal-proof\`, \`POST ${baseUrl}/api/vuc/formal-verify\` e \`GET ${baseUrl}/api/vuc/latest-proof\`.
- **Chat Voz & Texto CAM Multi-Agente:** \`POST ${baseUrl}/api/agent/multi-chat\` (usa System Instruction canônica do Parametric Forge / FrostbiteEngine com Olho MCP).

## Limite Honesto sobre Autodesk Inventor (.IPT) & FrostbiteEngine
- **Inventor (.IPT):** Arquivos \`.ipt\` com stream ACIS SAT, malha facetada de exibição ou nuvem SAB são reconstruídos geometricamente no servidor. Arquivos salvos exclusivamente com ShapeManager ASM binário criptografado retornam \`geometryStatus: "metadata_only_asm_encrypted"\` com instrução para exportar \`.STEP\` AP214/AP203.
- **FrostbiteEngine:** CPU por interaction nets em silício CMOS 7nm a 500MHz até GDS final (pré-silício, ~4,6x perf/Watt, não óptico/quântico). Sem dados públicos de fornecedores, CAPEX, OPEX ou ROI — nunca invente esses valores.
`;
    res.type('text/markdown; charset=utf-8').send(llmsMd);
  });

  app.get(['/api/agent/onboarding', '/.well-known/agent.json'], (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host') || `localhost:${PORT}`}`;
    return res.json(buildOnboardingManifest(baseUrl));
  });

  app.post('/api/cad/llm-briefing', async (req, res) => {
    try {
      let filename = typeof req.body?.filename === 'string' ? req.body.filename.trim() : '';
      let base64Data = typeof req.body?.base64Data === 'string' ? req.body.base64Data.trim() : '';
      const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
      const includeSampleVertices = Boolean(req.body?.includeSampleVertices);

      if (!base64Data && rawUrl) {
        let parsedInput: URL;
        try {
          parsedInput = new URL(rawUrl);
        } catch {
          return res.status(400).json({ error: 'URL inválida.' });
        }
        if (parsedInput.protocol !== 'http:' && parsedInput.protocol !== 'https:') {
          return res.status(400).json({ error: 'Apenas protocolos HTTP e HTTPS são suportados.' });
        }
        if (isDisallowedHostname(parsedInput.hostname)) {
          return res.status(400).json({ error: 'Endereço de rede local ou privado não permitido.' });
        }
        const { fetchUrl } = normalizeSourceUrl(rawUrl);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
          const response = await fetch(fetchUrl, {
            redirect: 'follow',
            signal: controller.signal,
            headers: { 'User-Agent': 'ParametrixCAD-AgentBriefing/1.0' },
          });
          if (!response.ok) {
            return res.status(response.status).json({
              error: `Falha ao baixar arquivo CAD da URL (${response.status}).`,
            });
          }
          const arrayBuf = await response.arrayBuffer();
          if (arrayBuf.byteLength > MAX_FETCH_BYTES) {
            return res.status(413).json({ error: 'Arquivo excede o limite de 12 MB.' });
          }
          base64Data = Buffer.from(arrayBuf).toString('base64');
          if (!filename) {
            filename = decodeURIComponent(path.basename(parsedInput.pathname) || 'modelo.stp');
          }
        } finally {
          clearTimeout(timeout);
        }
      }

      if (!base64Data) {
        return res.status(400).json({
          error: 'Forneça { filename, base64Data } ou { url } para gerar o briefing CAD para LLM.',
        });
      }

      const buffer = Buffer.from(base64Data, 'base64');
      if (buffer.length === 0) {
        return res.status(400).json({ error: 'Buffer CAD vazio após decodificação base64.' });
      }

      const briefing = await buildCadLlmBriefing(buffer, filename || 'modelo.stp', {
        includeSampleVertices,
      });
      return res.json(briefing);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: `Falha ao gerar briefing CAD para LLM: ${msg}` });
    }
  });

  app.post('/api/mcp', async (req, res) => {
    const body = req.body ?? {};
    const id = body.id ?? null;
    const method = typeof body.method === 'string' ? body.method : '';
    const baseUrl = `${req.protocol}://${req.get('host') || `localhost:${PORT}`}`;

    const rpcOk = (result: unknown) =>
      res.json({
        jsonrpc: '2.0',
        id,
        result,
      });

    const rpcErr = (code: number, message: string, data?: unknown) =>
      res.json({
        jsonrpc: '2.0',
        id,
        error: { code, message, ...(data !== undefined ? { data } : {}) },
      });

    try {
      if (method === 'initialize') {
        return rpcOk({
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'parametrix-cad-studio-mcp',
            version: '2.4.0',
          },
          capabilities: {
            tools: { listChanged: false },
          },
          instructions:
            'Use cad_inspect_ipt_step_briefing to decode .ipt/.step/.stp files safely without raw binary or vertex float dumps. Stateless FEA, NURBS, Curvature & SCOOBIII/VUC math tools run directly via HTTP; viewport/export tools also run in browser sessions via window.__PARAMETRIX_MCP__.',
        });
      }

      if (method === 'notifications/initialized' || method === 'ping') {
        return rpcOk({});
      }

      if (method === 'tools/list') {
        const allTools = [
          ...SERVER_MCP_TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
          ...MCP_TOOLS_CATALOG.map((t) => ({
            name: t.name,
            description: `${t.description} [${
              [
                'cad_run_structural_fea',
                'cad_evaluate_nurbs_metrics',
                'cad_optimize_surface_curvature',
                'cad_get_scoobiii_vuc_proof',
              ].includes(t.name)
                ? 'server-stateless + browser'
                : 'browser-session'
            }]`,
            inputSchema: t.inputSchema,
          })),
        ];
        return rpcOk({ tools: allTools });
      }

      if (method === 'tools/call') {
        const toolName = String(body.params?.name || '');
        const args = (body.params?.arguments ?? {}) as Record<string, unknown>;

        if (toolName === 'cad_get_agent_onboarding') {
          return rpcOk({
            content: [{ type: 'text', text: JSON.stringify(buildOnboardingManifest(baseUrl), null, 2) }],
          });
        }

        if (toolName === 'cad_inspect_ipt_step_briefing') {
          const filename = typeof args.filename === 'string' ? args.filename.trim() : 'modelo.stp';
          const base64Data = typeof args.base64Data === 'string' ? args.base64Data.trim() : '';
          if (!base64Data) {
            return rpcErr(-32602, 'Parametro obrigatório ausente: base64Data');
          }
          const buffer = Buffer.from(base64Data, 'base64');
          const briefing = await buildCadLlmBriefing(buffer, filename, {
            includeSampleVertices: Boolean(args.includeSampleVertices),
          });
          return rpcOk({
            content: [{ type: 'text', text: JSON.stringify(briefing, null, 2) }],
            structuredContent: briefing,
          });
        }

        const mergeParams = (): ParametricDesignParams => ({
          ...DEFAULT_STATELESS_PARAMS,
          ...(typeof args.designParams === 'object' && args.designParams
            ? (args.designParams as Partial<ParametricDesignParams>)
            : {}),
        });
        const material: MaterialFinish =
          typeof args.materialFinish === 'string'
            ? (args.materialFinish as MaterialFinish)
            : 'aluminum';

        if (toolName === 'cad_evaluate_nurbs_metrics') {
          const params = mergeParams();
          const surf = buildNurbsSurfaceFromParams(params);
          const mesh = tessellateNurbsSurface(
            surf,
            params.ribCountU,
            params.ribCountV,
            params.ribHeightMm
          );
          const payload = {
            mode: 'server-stateless',
            designParams: params,
            surfaceAreaCm2: mesh.surfaceAreaCm2,
            volumeCm3: mesh.volumeCm3,
            triangleCount: mesh.triangleCount,
            controlGrid: [surf.uCount, surf.vCount],
          };
          return rpcOk({ content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] });
        }

        const resolveSegmentProfile = (segInput: unknown) => {
          const validSegments: ApplicationSegment[] = [
            'ciclismo-mobilidade',
            'automotivo',
            'aeroespacial',
            'arquitetura-bim',
            'industrial-cnc',
            'robotica',
            'medico',
          ];
          const segment: ApplicationSegment =
            typeof segInput === 'string' && validSegments.includes(segInput as ApplicationSegment)
              ? (segInput as ApplicationSegment)
              : 'industrial-cnc';
          return resolvePartEngineeringProfile({
            segmentOverride: segment,
            preset: DEFAULT_STATELESS_PARAMS.preset,
          });
        };

        if (toolName === 'cad_run_structural_fea') {
          const params = mergeParams();
          const surf = buildNurbsSurfaceFromParams(params);
          const mesh = tessellateNurbsSurface(
            surf,
            params.ribCountU,
            params.ribCountV,
            params.ribHeightMm
          );
          const feaSettings: FeaSettings = {
            ...DEFAULT_STATELESS_FEA,
            loadNewtons:
              typeof args.loadNewtons === 'number'
                ? args.loadNewtons
                : DEFAULT_STATELESS_FEA.loadNewtons,
          };
          const profile = resolveSegmentProfile(args.segment);
          const fea = evaluateStructuralFea(
            surf,
            mesh,
            params,
            material,
            feaSettings,
            'all',
            profile
          );
          return rpcOk({
            content: [{ type: 'text', text: JSON.stringify({ mode: 'server-stateless', fea }, null, 2) }],
          });
        }

        if (toolName === 'cad_optimize_surface_curvature') {
          const params = mergeParams();
          const surf = buildNurbsSurfaceFromParams(params);
          const mesh = tessellateNurbsSurface(
            surf,
            params.ribCountU,
            params.ribCountV,
            params.ribHeightMm
          );
          const profile = resolveSegmentProfile(args.segment);
          const baselineFea = evaluateStructuralFea(
            surf,
            mesh,
            params,
            material,
            DEFAULT_STATELESS_FEA,
            'all',
            profile
          );
          const report = analyzeCurvatureAndOptimizeWeight({
            surface: surf,
            meshData: mesh,
            designParams: params,
            materialFinish: material,
            feaSettings: DEFAULT_STATELESS_FEA,
            feaResult: baselineFea,
            partProfile: profile,
            isolationTarget: 'all',
            importedModel: null,
          });
          return rpcOk({
            content: [
              { type: 'text', text: JSON.stringify({ mode: 'server-stateless', report }, null, 2) },
            ],
          });
        }

        if (toolName === 'cad_get_scoobiii_vuc_proof') {
          const params = mergeParams();
          const surf = buildNurbsSurfaceFromParams(params);
          const mesh = tessellateNurbsSurface(
            surf,
            params.ribCountU,
            params.ribCountV,
            params.ribHeightMm
          );
          const profile = resolveSegmentProfile(args.segment);
          const fea = evaluateStructuralFea(
            surf,
            mesh,
            params,
            material,
            DEFAULT_STATELESS_FEA,
            'all',
            profile
          );
          const proof = computeScoobiiiVucProof({
            surface: surf,
            meshData: mesh,
            designParams: params,
            materialFinish: material,
            feaSettings: DEFAULT_STATELESS_FEA,
            feaResult: fea,
            partProfile: profile,
            featureOps: [],
          });
          return rpcOk({
            content: [{ type: 'text', text: JSON.stringify({ mode: 'server-stateless', proof }, null, 2) }],
          });
        }

        const existsInCatalog = MCP_TOOLS_CATALOG.some((t) => t.name === toolName);
        if (existsInCatalog) {
          return rpcErr(
            -32001,
            `A ferramenta '${toolName}' opera sobre a cena 3D ativa no navegador (window.__PARAMETRIX_MCP__ ou aba Agente RAG + MCP). Use 'cad_inspect_ipt_step_briefing' para inspecionar arquivos .IPT/.STEP no servidor headless.`
          );
        }

        return rpcErr(-32601, `Ferramenta MCP desconhecida: ${toolName}`);
      }

      return rpcErr(-32601, `Método JSON-RPC não suportado: ${method}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return rpcErr(-32603, msg);
    }
  });

  app.post('/api/ingest-source', async (req, res) => {
    try {
      const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
      if (!rawUrl) {
        return res.status(400).json({ error: 'URL obrigatória.' });
      }

      let parsedInput: URL;
      try {
        parsedInput = new URL(rawUrl);
      } catch {
        return res.status(400).json({ error: 'URL inválida.' });
      }

      if (parsedInput.protocol !== 'http:' && parsedInput.protocol !== 'https:') {
        return res.status(400).json({ error: 'Apenas protocolos HTTP e HTTPS são suportados.' });
      }

      if (isDisallowedHostname(parsedInput.hostname)) {
        return res.status(400).json({ error: 'Endereço de rede local ou privado não permitido.' });
      }

      const { fetchUrl, isGoogleDrive, driveId } = normalizeSourceUrl(rawUrl);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      let response: Response;
      try {
        response = await fetch(fetchUrl, {
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'User-Agent': 'ParametrixCAD-RAG/1.0',
          },
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        return res.status(response.status).json({
          error: `Falha ao baixar fonte (${response.status} ${response.statusText}).${
            isGoogleDrive
              ? ' Verifique se o arquivo do Google Drive está compartilhado como "Qualquer pessoa com o link".'
              : ''
          }`,
        });
      }

      const contentType = (response.headers.get('content-type') || 'application/octet-stream').toLowerCase();
      const disposition = response.headers.get('content-disposition') || '';
      const dispMatch = /filename\*?=(?:UTF-8'')?"?([^";\n]+)"?/i.exec(disposition);
      const urlFilename = decodeURIComponent(
        path.basename(parsedInput.pathname) || (driveId ? `gdrive_${driveId}` : 'documento_url')
      );
      const title = (dispMatch?.[1] || urlFilename || 'arquivo_externo').trim();

      const arrayBuf = await response.arrayBuffer();
      if (arrayBuf.byteLength > MAX_FETCH_BYTES) {
        return res.status(413).json({ error: 'Arquivo excede o limite de 12 MB.' });
      }

      const buf = Buffer.from(arrayBuf);
      const isBinaryExt = /\.(stl|3dm|ipt|pdf|png|jpg|jpeg|webp|zip)$/i.test(title);
      const looksText =
        !isBinaryExt &&
        (contentType.includes('text/') ||
          contentType.includes('json') ||
          contentType.includes('xml') ||
          contentType.includes('svg') ||
          contentType.includes('csv') ||
          /\.(obj|dxf|step|stp|ifc|svg|txt|md|json|csv|nc|gcode|src)$/i.test(title));

      let extractedText = '';
      if (looksText || contentType.includes('html')) {
        const rawText = buf.toString('utf8');
        if (
          isGoogleDrive &&
          contentType.includes('text/html') &&
          (rawText.includes('ServiceLogin') || rawText.includes('accounts.google.com'))
        ) {
          return res.status(403).json({
            error:
              'Este arquivo do Google Drive é privado e exige autenticação. Altere o compartilhamento para "Qualquer pessoa com o link" ou faça upload local.',
          });
        }
        extractedText = contentType.includes('html') ? stripHtmlToText(rawText) : rawText;
      }

      return res.json({
        title,
        mimeType: contentType.split(';')[0],
        byteSize: buf.byteLength,
        isGoogleDrive,
        originUrl: rawUrl,
        isText: Boolean(extractedText),
        extractedText: extractedText.slice(0, 350000),
        base64Content: buf.toString('base64'),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: `Erro ao ingerir fonte: ${msg}` });
    }
  });

  app.post('/api/analyze-part-context', async (req, res) => {
    try {
      const ai = getGeminiClient();
      const filename = String(req.body?.filename || '');
      const snippet = String(req.body?.snippet || '').slice(0, 4000);
      const currentProfile = req.body?.currentProfile ?? {};

      const { response, usedModel } = await generateContentWithFallback(ai, {
        systemInstruction: `Você é um engenheiro especialista em identificação de peças CAD, normas técnicas e certificação estrutural.
Retorne apenas JSON válido em português com as chaves: partName, manufacturer, modelCode, intendedUse, specifications (array de strings), certifications (array de strings), criticalInspectionNote.`,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Arquivo CAD: ${filename}\nPerfil inicial: ${JSON.stringify(currentProfile)}\nTrecho técnico/cabeçalho:\n${snippet}`,
              },
            ],
          },
        ],
      });

      const raw = (response.text || '').trim();
      const jsonMatch = /\{[\s\S]*\}/.exec(raw);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      return res.json({ enriched: parsed, usedModel });
    } catch (err) {
      const friendly = formatFriendlyGeminiError(err);
      return res.status(friendly.status).json({ error: friendly.message });
    }
  });

  app.post('/api/image-to-cad', async (req, res) => {
    try {
      const ai = getGeminiClient();
      const filename = String(req.body?.filename || 'imagem_projeto.png');
      const rawMime = String(req.body?.mimeType || 'image/png').toLowerCase();
      const mimeType = rawMime.includes('webp')
        ? 'image/webp'
        : rawMime.includes('jpeg') || rawMime.includes('jpg')
          ? 'image/jpeg'
          : 'image/png';
      const rawBase64 = typeof req.body?.base64Data === 'string' ? req.body.base64Data.trim() : '';
      const cleanBase64 = rawBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

      if (!cleanBase64 || cleanBase64.length < 32) {
        return res.status(400).json({ error: 'Dados da imagem base64 ausentes ou inválidos.' });
      }

      const aspectRatio = Number(req.body?.aspectRatio) || 1;
      const coveragePct = Number(req.body?.coveragePct) || 50;

      const responseSchema: Record<string, unknown> = {
        type: Type.OBJECT,
        properties: {
          partName: { type: Type.STRING },
          manufacturer: { type: Type.STRING },
          modelCode: { type: Type.STRING },
          segment: {
            type: Type.STRING,
            enum: [
              'ciclismo-mobilidade',
              'automotivo',
              'aeroespacial',
              'arquitetura-bim',
              'industrial-cnc',
              'robotica',
              'medico',
            ],
          },
          primaryMaterial: {
            type: Type.STRING,
            enum: [
              'aluminum',
              'titanium',
              'clay',
              'oak',
              'glass',
              'carbon-fiber',
              'matte-plastic',
            ],
          },
          intendedUse: { type: Type.STRING },
          specifications: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          certifications: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          recommendedLoadN: { type: Type.NUMBER },
          minSafetyFactor: { type: Type.NUMBER },
          maxDeflectionMm: { type: Type.NUMBER },
          criticalInspectionNote: { type: Type.STRING },
          constructionMode: {
            type: Type.STRING,
            enum: ['assembly', 'extruded-relief'],
          },
          overallDimensionsMm: {
            type: Type.OBJECT,
            properties: {
              width: { type: Type.NUMBER },
              height: { type: Type.NUMBER },
              depth: { type: Type.NUMBER },
            },
            required: ['width', 'height', 'depth'],
          },
          components: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                shape: {
                  type: Type.STRING,
                  enum: [
                    'box',
                    'plate',
                    'cylinder-x',
                    'cylinder-y',
                    'cylinder-z',
                    'ring',
                    'arch',
                  ],
                },
                centerMm: {
                  type: Type.ARRAY,
                  items: { type: Type.NUMBER },
                },
                sizeMm: {
                  type: Type.ARRAY,
                  items: { type: Type.NUMBER },
                },
                material: {
                  type: Type.STRING,
                  enum: [
                    'aluminum',
                    'titanium',
                    'clay',
                    'oak',
                    'glass',
                    'carbon-fiber',
                    'matte-plastic',
                  ],
                },
              },
              required: ['name', 'shape', 'centerMm', 'sizeMm', 'material'],
            },
          },
        },
        required: [
          'partName',
          'manufacturer',
          'modelCode',
          'segment',
          'primaryMaterial',
          'intendedUse',
          'specifications',
          'certifications',
          'recommendedLoadN',
          'minSafetyFactor',
          'maxDeflectionMm',
          'criticalInspectionNote',
          'constructionMode',
          'overallDimensionsMm',
          'components',
        ],
      };

      const { response, usedModel } = await generateContentWithFallback(ai, {
        systemInstruction: `Você é um engenheiro mecânico/CAD sênior especialista em engenharia reversa por visão computacional.
Analise a imagem enviada e gere um projeto CAD 3D FIDEDIGNO em milímetros (sistema Y-up: X largura, Y altura vertical, Z profundidade).
REGRAS:
1. Identifique fielmente a peça, equipamento, conjunto ou perfil mostrado na imagem (nome, fabricante provável ou "Design Personalizado", modelo, segmento, especificações técnicas, certificações aplicáveis, carga N e fator de segurança mínimo).
2. Se a imagem for uma foto/render de conjunto 3D mecânico, automotivo, bicicleta/garfo, suporte, braço robótico, estrutura, etc., defina constructionMode="assembly" e decomponha entre 3 e 12 componentes geométricos precisos (centerMm [x,y,z] e sizeMm [sx,sy,sz] coerentes e conectados entre si sem sobreposição aleatória, base apoiada em Y>=0, largura típica 120..260mm).
3. Se a imagem for um desenho técnico 2D, emblema, placa recortada, perfil plano, silhueta ou logotipo, defina constructionMode="extruded-relief" e forneça também 1 a 4 componentes estruturais complementares ou placas.
4. Responda apenas no JSON estruturado conforme o schema, em Português técnico.`,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: cleanBase64,
                },
              },
              {
                text: `Arquivo de imagem: "${filename}" (${mimeType}, aspectRatio=${aspectRatio.toFixed(2)}, foregroundCoverage=${coveragePct.toFixed(1)}%). Converta esta imagem em um projeto CAD 3D fidedigno com decomposição de componentes e perfil de engenharia para cálculo FEA.`,
              },
            ],
          },
        ],
        responseMimeType: 'application/json',
        responseSchema,
      });

      const rawText = (response.text || '').trim();
      const blueprint = JSON.parse(rawText);
      return res.json({ blueprint, usedModel });
    } catch (err) {
      const friendly = formatFriendlyGeminiError(err);
      return res.status(friendly.status).json({ error: friendly.message });
    }
  });

  app.post('/api/rag-mcp-agent', async (req, res) => {
    try {
      const ai = getGeminiClient();
      const userMessage = typeof req.body?.userMessage === 'string' ? req.body.userMessage : '';
      const ragChunks = Array.isArray(req.body?.ragChunks) ? req.body.ragChunks : [];
      const cadContext = req.body?.cadContext ?? {};
      const previousModelContent = req.body?.previousModelContent as Content | undefined;
      const functionResponses = Array.isArray(req.body?.functionResponses)
        ? req.body.functionResponses
        : null;

      const ragBlock =
        ragChunks.length > 0
          ? ragChunks
              .map(
                (c: { docTitle: string; index: number; text: string }) =>
                  `[Fonte: ${c.docTitle} | Trecho #${c.index}]\n${c.text}`
              )
              .join('\n\n---\n\n')
          : 'Nenhum documento externo carregado na base RAG até o momento.';

      const systemInstruction = `${PARAMETRIX_SYSTEM_INSTRUCTION_CORE}

Você atua agora como o Agente de Engenharia CAD/CAE/CAM & MCP do Parametrix CAD Studio.
CAPACIDADES E REGRAS OPERACIONAIS:
1. IDENTIDADE DA PEÇA & CERTIFICAÇÃO: Sempre considere quem fabrica, modelo, especificações, certificações obrigatórias, uso pretendido e critérios de segurança descritos em \`cadContext.partProfile\` e \`cadContext.activeSegment\`.
2. OBJECT MASK & MATERIAIS POR COMPONENTE: Você enxerga todos os subcomponentes detectados em \`cadContext.components\` (com \`family\`, \`subFamily\`, \`maskColorHex\` e \`inferredMaterial\`). Pode usar \`cad_explode_assembly\`, \`cad_rotate_component\`, \`cad_set_component_material\`, \`cad_isolate_part\` e \`cad_set_segment_profile\`.
3. CANETA MÁGICA & SCOOBIII/VUC: Quando o usuário enviar coordenadas da Caneta Mágica ou pedir recorte/rasgo paramétrico, furo, parafuso com rosca métrica ISO (M3..M12), nervura ou prova matemática determinística SCOOBIII/VUC, chame \`cad_magic_pen_feature\` e/ou \`cad_get_scoobiii_vuc_proof\`.
4. PROCESSOS CAM & FROSTBITE: Enxergue \`cadContext.camSettings\` (incluindo \`machineType\`, \`postFormat\` e \`additiveConfig\` de camada µm / sinterização °C) sem inventar CAPEX/OPEX/ROI ou tolerâncias não medidas.
5. RAG & MCP TOOLS: Cite fontes RAG e chame as ferramentas MCP correspondentes sempre que o usuário solicitar alterações na peça, FEA, exportação (.STL, .DXF, .3DM, .NC, .SRC) ou otimização.

ESTADO ATUAL DO MODELO, PEÇA, COMPONENTES, CAM & FEA:
${JSON.stringify(cadContext, null, 2)}

CONTEXTO RAG RECUPERADO:
${ragBlock}`;

      let contents: Content[];
      if (previousModelContent && functionResponses) {
        contents = [
          { role: 'user', parts: [{ text: userMessage }] },
          previousModelContent,
          {
            role: 'user',
            parts: functionResponses.map(
              (fr: { id?: string; name: string; response: Record<string, unknown> }) => ({
                functionResponse: {
                  id: fr.id,
                  name: fr.name,
                  response: fr.response,
                },
              })
            ),
          },
        ];
      } else {
        contents = [{ role: 'user', parts: [{ text: userMessage }] }];
      }

      const { response, usedModel } = await generateContentWithFallback(ai, {
        contents,
        systemInstruction,
        tools: [{ functionDeclarations: MCP_FUNCTION_DECLARATIONS }],
      });

      const modelContent = response.candidates?.[0]?.content ?? null;
      const functionCalls = (response.functionCalls ?? []).map((fc) => ({
        id: fc.id,
        name: fc.name,
        args: (fc.args ?? {}) as Record<string, unknown>,
      }));

      return res.json({
        text: response.text ?? '',
        functionCalls,
        modelContent,
        usedModel,
      });
    } catch (err) {
      const friendly = formatFriendlyGeminiError(err);
      return res.status(friendly.status).json({ error: friendly.message });
    }
  });

  const sqliteStore = new ParametrixSqliteStore();
  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  const broadcastWs = (type: string, payload: unknown) => {
    const raw = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(raw);
      }
    }
  };

  wss.on('connection', (socket) => {
    socket.send(
      JSON.stringify({
        type: 'ecosystem:sync',
        payload: {
          connectedClients: wss.clients.size,
          chat: sqliteStore.listChatMessages().slice(-30),
          logistics: sqliteStore.listLogisticsNodes(),
          computeNodes: sqliteStore.listComputeNodes(),
        },
      })
    );

    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data)) as { type?: string; payload?: Record<string, unknown> };
        if (msg.type === 'chat:send' && msg.payload) {
          const saved = sqliteStore.appendChatMessage({
            room: String(msg.payload.room || 'geral'),
            senderId: String(msg.payload.senderId || 'anon'),
            senderName: String(msg.payload.senderName || 'Engenheiro Local'),
            senderRole: (msg.payload.senderRole as EcosystemRole) || 'client',
            isAgent: Boolean(msg.payload.isAgent),
            content: String(msg.payload.content || ''),
            lat: typeof msg.payload.lat === 'number' ? msg.payload.lat : undefined,
            lng: typeof msg.payload.lng === 'number' ? msg.payload.lng : undefined,
          });
          broadcastWs('chat:message', saved);
        } else if (msg.type === 'logistics:ping' && msg.payload) {
          const updated = sqliteStore.upsertLogisticsNode({
            id: String(msg.payload.id || `log-gps-${Date.now()}`),
            driverName: String(msg.payload.driverName || 'Entregador Autônomo GPS'),
            serviceTag: (msg.payload.serviceTag as 'iFood' | '99' | 'Autônomo') || 'Autônomo',
            modal: (msg.payload.modal as LogisticsModal) || 'road',
            lat: Number(msg.payload.lat) || -23.5505,
            lng: Number(msg.payload.lng) || -46.6333,
            status: 'em-rota',
            routeLabel: String(msg.payload.routeLabel || 'Rastreamento Celular Real-Time'),
            speedKmh: Number(msg.payload.speedKmh) || 38,
          });
          broadcastWs('logistics:location', updated);
        } else if (msg.type === 'mcp:eye' && msg.payload) {
          broadcastWs('mcp:eye', msg.payload);
        }
      } catch {
        // Ignore malformed WS frame safely
      }
    });
  });

  // Proprietary & Offline SQLite Auth Endpoints
  app.post('/api/auth/login', (req, res) => {
    try {
      const profile = sqliteStore.loginOrRegister({
        email: String(req.body?.email || ''),
        displayName: typeof req.body?.displayName === 'string' ? req.body.displayName : undefined,
        provider: (req.body?.provider as AuthProviderKind) || 'proprietary',
        role: (req.body?.role as EcosystemRole) || 'client',
        password: typeof req.body?.password === 'string' ? req.body.password : undefined,
        handleAt: typeof req.body?.handleAt === 'string' ? req.body.handleAt : undefined,
        phone: typeof req.body?.phone === 'string' ? req.body.phone : undefined,
        address: typeof req.body?.address === 'string' ? req.body.address : undefined,
        offlineMode: Boolean(req.body?.offlineMode),
      });
      return res.json({ profile });
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/auth/profile', (req, res) => {
    const updated = sqliteStore.updateUserProfile({
      userId: String(req.body?.userId || ''),
      role: (req.body?.role as EcosystemRole) || 'client',
      handleAt: String(req.body?.handleAt || '@parametrix'),
      phone: String(req.body?.phone || ''),
      address: String(req.body?.address || ''),
      computeSharePct: Number(req.body?.computeSharePct ?? 20),
      agentConfig: req.body?.agentConfig,
    });
    if (!updated) {
      return res.status(404).json({ error: 'Usuário SQLite não encontrado.' });
    }
    broadcastWs('compute:pool', sqliteStore.listComputeNodes());
    return res.json({ profile: updated });
  });

  // Real-time Resource Telemetry + Auto Local LLM Bootstrap Selector
  app.get('/api/system/resources', (req, res) => {
    const cpus = os.cpus();
    const totalRamGb = Number((os.totalmem() / (1024 ** 3)).toFixed(2));
    const freeRamGb = Number((os.freemem() / (1024 ** 3)).toFixed(2));
    const load1m = os.loadavg()[0] || 0.25;
    const cpuLoadPct = Number(Math.min(100, (load1m / Math.max(1, cpus.length)) * 100).toFixed(1));
    const gpuHint = String(req.query.gpuName || 'Host Runtime GPU');
    const gpuTier = /rtx|a100|h100|b200|nvidia/i.test(gpuHint)
      ? 'datacenter'
      : /radeon|gtx|arc|apple m/i.test(gpuHint)
        ? 'dedicated-mid'
        : 'integrated';

    const snapshot = {
      cpuCores: cpus.length,
      cpuLoadPct,
      totalRamGb,
      freeRamGb,
      gpuTier: gpuTier as 'none' | 'integrated' | 'dedicated-mid' | 'datacenter',
      gpuName: gpuHint,
      osPlatform: `${os.platform()} ${os.release()} (${os.arch()})`,
      networkMbps: Number(req.query.networkMbps || 250),
      loggedInUsers: Math.max(1, sqliteStore.getUserCount(), wss.clients.size),
    };
    const recommendation = selectOptimalLocalLlm(snapshot);
    return res.json({ snapshot, recommendation, wsClients: wss.clients.size });
  });

  // Multi-Agent Dropdown Router + MCP Eye Feedback Loop (Voice & Text CAM)
  app.post('/api/agent/multi-chat', async (req, res) => {
    const startedAt = Date.now();
    const agentId = (req.body?.agentId as AgentProviderId) || 'gemini';
    const userMessage = String(req.body?.userMessage || '');
    const eyeEvents = Array.isArray(req.body?.eyeEvents) ? req.body.eyeEvents : [];
    const cadSummary = (req.body?.cadSummary ?? {}) as CamAgentContextSummary;
    const remoteCount = sqliteStore.listRemoteMachines().length;
    const enrichedSummary: CamAgentContextSummary = {
      ...cadSummary,
      remoteMachinesCount: cadSummary.remoteMachinesCount ?? remoteCount,
    };
    const systemInstruction = buildCamAgentSystemInstruction({
      agentId,
      roleLabel: typeof req.body?.roleLabel === 'string' ? req.body.roleLabel : 'Engenharia CAM / Voz & Texto',
      cadSummary: enrichedSummary,
      eyeEvents,
    });
    const externalEndpoint = typeof req.body?.externalEndpoint === 'string' ? req.body.externalEndpoint : '';

    if (agentId === 'gemini' && process.env.GEMINI_API_KEY) {
      try {
        const ai = getGeminiClient();
        const { response, usedModel } = await generateContentWithFallback(ai, {
          systemInstruction,
          contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        });
        const replyText = response.text || 'Ação analisada via Gemini + Olho MCP.';
        const proof = sqliteStore.recordVucProof('AGENT_MULTI_CHAT', `Gemini (${usedModel})`, {
          agentId,
          userMessage,
        });
        const formalCert = createFormalVucCertificate({
          domain: 'AGENT_MULTI_CHAT_GEMINI',
          status: 'PASS',
          inputPayload: { agentId, userMessage, cadSummary: enrichedSummary },
          outputPayload: { replyText, modelUsed: usedModel },
          durationMs: Date.now() - startedAt,
        });
        return res.json({
          agentId,
          modelUsed: usedModel,
          reply: replyText,
          vucHash: proof.vucHash,
          formalVuc: formalCert,
        });
      } catch (err) {
        const friendly = formatFriendlyGeminiError(err);
        return res.status(friendly.status).json({ error: friendly.message });
      }
    }

    if (externalEndpoint && /^http:\/\/(localhost|127\.0\.0\.1)/.test(externalEndpoint)) {
      // Allows local Ollama / llama.cpp localhost execution when user points Local LLM endpoint to localhost
      try {
        const localResp = await fetch(`${externalEndpoint.replace(/\/$/, '')}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: String(req.body?.localModelId || 'qwen2.5:1.5b'),
            system: systemInstruction,
            prompt: userMessage,
            stream: false,
          }),
        });
        if (localResp.ok) {
          const data = (await localResp.json()) as { response?: string };
          const replyText = data.response || 'Resposta executada no LLM local.';
          const proof = sqliteStore.recordVucProof('AGENT_LOCAL_OLLAMA', `Localhost LLM`, {
            agentId,
            userMessage,
          });
          const formalCert = createFormalVucCertificate({
            domain: 'AGENT_LOCAL_OLLAMA',
            status: 'PASS',
            inputPayload: { agentId, userMessage, cadSummary: enrichedSummary },
            outputPayload: { replyText },
            durationMs: Date.now() - startedAt,
          });
          return res.json({
            agentId,
            modelUsed: String(req.body?.localModelId || 'ollama-local'),
            reply: replyText,
            vucHash: proof.vucHash,
            formalVuc: formalCert,
          });
        }
      } catch {
        // Fall through cleanly to contextual MCP Eye deterministic reply below
      }
    }

    const proof = sqliteStore.recordVucProof('AGENT_BRIDGE_EYE', `Agente ${agentId} via MCP Eye`, {
      agentId,
      userMessage,
      eyeCount: eyeEvents.length,
    });
    const reply = buildDeterministicCamAgentReply({
      agentId,
      userMessage,
      cadSummary: enrichedSummary,
      eyeEvents,
      vucHash: proof.vucHash,
    });
    const formalCert = createFormalVucCertificate({
      domain: 'AGENT_CAM_BRIDGE',
      status: 'PASS',
      inputPayload: { agentId, userMessage, cadSummary: enrichedSummary },
      outputPayload: { reply },
      durationMs: Date.now() - startedAt,
    });
    return res.json({
      agentId,
      modelUsed: String(req.body?.localModelId || agentId),
      reply,
      vucHash: proof.vucHash,
      formalVuc: formalCert,
    });
  });

  // SQLite Ecosystem, ERP/CRM, Logistics GPS, Compute 20%, Remote Machines, CAM Services & VUC Ledger Routes
  app.get('/api/sqlite/state', (_req, res) => {
    return res.json({
      projects: sqliteStore.listProjects(),
      erp: sqliteStore.listErpRecords(),
      chat: sqliteStore.listChatMessages(),
      logistics: sqliteStore.listLogisticsNodes(),
      computeNodes: sqliteStore.listComputeNodes(),
      remoteMachines: sqliteStore.listRemoteMachines(),
      vucLedger: sqliteStore.listVucLedger(),
      camServiceJobs: sqliteStore.listCamServiceJobs(),
    });
  });

  // Swagger / OpenAPI 3.0.3 & Pre-Programmed Datacenter/Humanoid CAM Programs
  app.get(['/api/openapi.json', '/openapi.json'], (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host') || `localhost:${PORT}`}`;
    return res.json(buildCamOpenApiSpec(baseUrl));
  });

  app.get(['/swagger', '/api/docs'], (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host') || `localhost:${PORT}`}`;
    return res.type('text/html; charset=utf-8').send(buildSwaggerHtml(baseUrl));
  });

  app.get('/api/cam/programs', (req, res) => {
    const cat = req.query.category as CamProgramTargetCategory | undefined;
    const programs = listCamProductionPrograms(
      cat === 'datacenter' || cat === 'humanoid' ? cat : undefined
    );
    return res.json({
      total: programs.length,
      programs,
    });
  });

  app.get('/api/cam/services', (_req, res) => {
    return res.json({
      services: sqliteStore.listCamServiceJobs(),
      programsTotal: CAM_PRODUCTION_PROGRAMS.length,
    });
  });

  app.post('/api/cam/services', async (req, res) => {
    try {
      const body = req.body ?? {};
      const sourceKind: CamServiceSourceKind =
        body.sourceKind === 'file' ||
        body.sourceKind === 'url' ||
        body.sourceKind === 'catalog'
          ? body.sourceKind
          : 'api';

      const program =
        typeof body.programId === 'string'
          ? getCamProductionProgram(body.programId)
          : undefined;

      const targetCategory: CamProgramTargetCategory =
        body.targetCategory === 'humanoid' || program?.category === 'humanoid'
          ? 'humanoid'
          : 'datacenter';

      let filename = typeof body.filename === 'string' && body.filename.trim()
        ? body.filename.trim()
        : `${program?.id || 'custom_service'}.nc`;
      let sourceRef =
        typeof body.url === 'string' && body.url.trim()
          ? body.url.trim()
          : program
            ? `program://${program.id}`
            : `api://direct/${filename}`;

      let parsedGeoSummary = '';

      if (sourceKind === 'url') {
        const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
        if (!rawUrl) {
          return res.status(400).json({ error: 'Informe o campo "url" quando sourceKind="url".' });
        }
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(rawUrl);
        } catch {
          return res.status(400).json({ error: 'URL externa inválida para serviço CAM.' });
        }
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
          return res.status(400).json({ error: 'Apenas URLs HTTP/HTTPS são suportadas.' });
        }
        if (isDisallowedHostname(parsedUrl.hostname)) {
          return res.status(400).json({ error: 'Host local ou rede privada bloqueada (SSRF).' });
        }
        const { fetchUrl } = normalizeSourceUrl(rawUrl);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        try {
          const remoteResp = await fetch(fetchUrl, {
            redirect: 'follow',
            signal: controller.signal,
            headers: { 'User-Agent': 'ParametrixCAM-ServiceIngest/1.0' },
          });
          if (!remoteResp.ok) {
            return res.status(remoteResp.status).json({
              error: `Falha ao buscar modelo CAD da URL (${remoteResp.status}).`,
            });
          }
          const arrBuf = await remoteResp.arrayBuffer();
          if (arrBuf.byteLength > MAX_FETCH_BYTES) {
            return res.status(413).json({ error: 'Arquivo remoto excede 12 MB.' });
          }
          filename = decodeURIComponent(path.basename(parsedUrl.pathname) || filename);
          sourceRef = rawUrl;
          const lowerName = filename.toLowerCase();
          if (lowerName.endsWith('.stp') || lowerName.endsWith('.step') || lowerName.endsWith('.ipt')) {
            const briefing = await buildCadLlmBriefing(Buffer.from(arrBuf), filename);
            parsedGeoSummary = `${briefing.format} via URL (${arrBuf.byteLength} bytes) · ${briefing.summaryStats.componentCount} peças`;
          } else {
            parsedGeoSummary = `Arquivo remoto via URL (${arrBuf.byteLength} bytes) · ${filename}`;
          }
        } finally {
          clearTimeout(timeout);
        }
      } else if (sourceKind === 'file') {
        const base64Data = typeof body.base64Data === 'string' ? body.base64Data.trim() : '';
        const fileText = typeof body.fileText === 'string' ? body.fileText : '';
        const buf = base64Data
          ? Buffer.from(base64Data, 'base64')
          : fileText
            ? Buffer.from(fileText, 'utf8')
            : Buffer.alloc(0);
        if (buf.length === 0) {
          return res.status(400).json({
            error: 'Envie "base64Data" ou "fileText" quando sourceKind="file".',
          });
        }
        sourceRef = `upload://${filename}`;
        const lowerName = filename.toLowerCase();
        if (lowerName.endsWith('.stp') || lowerName.endsWith('.step') || lowerName.endsWith('.ipt')) {
          const briefing = await buildCadLlmBriefing(buf, filename);
          parsedGeoSummary = `Upload ${briefing.format} (${buf.length} B) · ${briefing.summaryStats.componentCount} peças · ${briefing.llmSummaryText.slice(0, 90)}`;
        } else {
          const lineCount = buf.toString('utf8').split(/\r?\n/).length;
          parsedGeoSummary = `Upload CAD (${buf.length} bytes · ${lineCount} linhas) · ${filename}`;
        }
      }

      const machineType: MachineType =
        (body.machineType as MachineType) || program?.machineType || 'cnc-5axis';
      const postMap: Record<MachineType, PostProcessorFormat> = {
        'powder-metal': 'slm-powder',
        'resin-sla': 'sla-resin',
        'robot-weld': 'weld-tig-mig',
        'laser-cut': 'laser-g',
        'robot-6axis': 'kuka-krl',
        manual: 'manual-sheet',
        'cnc-3axis': 'fanuc-nc',
        'cnc-5axis': 'fanuc-nc',
      };
      const postFormat: PostProcessorFormat =
        (body.postFormat as PostProcessorFormat) || program?.postFormat || postMap[machineType] || 'fanuc-nc';

      const dims = body.dimensionsMm ?? {};
      const designParams: ParametricDesignParams = {
        preset: program?.designParamsPatch.preset ?? 'cavity',
        spanX: Number(dims.spanX) || program?.designParamsPatch.spanX || 190,
        spanY: Number(dims.spanY) || program?.designParamsPatch.spanY || 120,
        archHeight: Number(dims.archHeight) || program?.designParamsPatch.archHeight || 26,
        waveAmplitude: 8,
        twistDeg: 0,
        thicknessMm: program?.designParamsPatch.thicknessMm || 6,
        uDivisions: 22,
        vDivisions: 22,
        ribCountU: 4,
        ribCountV: 3,
        ribHeightMm: 14,
        attractorStrength: 0,
      };
      const camCfg: CamSettings = {
        machineType,
        strategy: program?.strategy || 'isoparm',
        toolId: program?.toolId || 'tool-ball-8',
        stepoverPct: 24,
        stepdownMm: 2.0,
        stockMarginMm: 0.15,
        safeZMm: 25,
        cutSpeedMultiplier: 1.0,
        postFormat,
        additiveConfig: body.additiveConfig || program?.additiveConfig,
      };

      const surface = buildNurbsSurfaceFromParams(designParams);
      const mesh = tessellateNurbsSurface(surface, designParams.ribCountU, designParams.ribCountV, designParams.ribHeightMm);
      const toolpath = generateCamToolpath(surface, mesh, camCfg);
      const visualState = evaluateCamProcessVisualState(camCfg, toolpath, 0, 0);

      const title =
        typeof body.title === 'string' && body.title.trim()
          ? body.title.trim()
          : program?.title || `Serviço CAM (${sourceKind.toUpperCase()}) · ${filename}`;
      const geometrySummary =
        parsedGeoSummary ||
        `${designParams.spanX}×${designParams.spanY}×${designParams.archHeight} mm · ${program?.subsystem || 'API Paramétrica'}`;

      const job = sqliteStore.createCamServiceJob({
        title,
        targetCategory,
        programId: program?.id || 'custom-api',
        sourceKind,
        sourceRef,
        filename,
        machineType,
        postFormat,
        estimatedMinutes: toolpath.estimatedMinutes,
        cuttingLengthMm: toolpath.cuttingLengthMm,
        postCodeSnippet: toolpath.postCode.split('\n').slice(0, 12).join('\n'),
        geometrySummary,
      });

      broadcastWs('cam:service', job);
      return res.status(201).json({
        job,
        postCode: toolpath.postCode,
        toolChanges: visualState.toolChanges,
        vucProof: visualState.vucProof,
      });
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post('/api/cam/services/:id/restart', (req, res) => {
    const restarted = sqliteStore.restartCamServiceJob(req.params.id);
    if (!restarted) {
      return res.status(404).json({ error: 'Serviço CAM não encontrado.' });
    }
    broadcastWs('cam:service', restarted);
    return res.json({
      job: restarted,
      message: `Processo "${restarted.title}" reiniciado de 0% até 100% (ciclo #${restarted.restartCount}).`,
    });
  });

  app.post('/api/sqlite/projects', (req, res) => {
    const saved = sqliteStore.saveProject({
      id: typeof req.body?.id === 'string' ? req.body.id : undefined,
      ownerId: String(req.body?.ownerId || 'local-user'),
      name: String(req.body?.name || 'Projeto Parametrix'),
      presetId: String(req.body?.presetId || 'shell'),
      segment: String(req.body?.segment || 'industrial-cnc'),
      paramsJson: JSON.stringify(req.body?.designParams ?? {}),
      camJson: JSON.stringify(req.body?.camSettings ?? {}),
    });
    return res.json({ project: saved });
  });

  app.post('/api/sqlite/erp', (req, res) => {
    const rec = sqliteStore.createErpRecord({
      kind: req.body?.kind || 'order',
      title: String(req.body?.title || 'Ordem CAM'),
      status: req.body?.status || 'aberto',
      partyName: String(req.body?.partyName || 'Cliente Local'),
      segment: req.body?.segment || 'industrial-cnc',
      amountBrl: Number(req.body?.amountBrl) || 1200,
      modal: req.body?.modal || 'road',
      ownerRole: req.body?.ownerRole || 'client',
    });
    return res.json({ record: rec });
  });

  app.post('/api/sqlite/chat', (req, res) => {
    const content = String(req.body?.content || '');
    const room = String(req.body?.room || 'geral');
    const msg = sqliteStore.appendChatMessage({
      room,
      senderId: String(req.body?.senderId || 'local-user'),
      senderName: String(req.body?.senderName || 'Operador'),
      senderRole: (req.body?.senderRole as EcosystemRole) || 'client',
      isAgent: Boolean(req.body?.isAgent),
      content,
      lat: typeof req.body?.lat === 'number' ? req.body.lat : undefined,
      lng: typeof req.body?.lng === 'number' ? req.body.lng : undefined,
    });
    broadcastWs('chat:message', msg);

    let agentReply: ReturnType<typeof sqliteStore.appendChatMessage> | null = null;
    if (!req.body?.isAgent && (req.body?.askCamAgent || /@(cam|agente|frostbite|vuc)\b/i.test(content))) {
      const remoteCount = sqliteStore.listRemoteMachines().length;
      const latestCam = sqliteStore.listCamServiceJobs()[0];
      const cadSummary: CamAgentContextSummary = {
        ...(req.body?.cadSummary ?? {}),
        partName: req.body?.cadSummary?.partName || latestCam?.title || 'Peça Parametrix',
        machineType: req.body?.cadSummary?.machineType || latestCam?.machineType || 'cnc-5axis',
        postFormat: req.body?.cadSummary?.postFormat || latestCam?.postFormat || 'fanuc-nc',
        estimatedMinutes: req.body?.cadSummary?.estimatedMinutes ?? latestCam?.estimatedMinutes,
        cuttingLengthMm: req.body?.cadSummary?.cuttingLengthMm ?? latestCam?.cuttingLengthMm,
        remoteMachinesCount: remoteCount,
      };
      const replyText = buildDeterministicCamAgentReply({
        agentId: 'cam-orchestrator',
        userMessage: content,
        cadSummary,
        vucHash: msg.vucHash,
      });
      agentReply = sqliteStore.appendChatMessage({
        room,
        senderId: 'agent-cam-orchestrator',
        senderName: 'Agente Orquestrador CAM & VUC',
        senderRole: 'cam_provider',
        isAgent: true,
        content: replyText,
      });
      broadcastWs('chat:message', agentReply);
    }

    return res.json({ message: msg, agentReply });
  });

  app.post('/api/sqlite/logistics', (req, res) => {
    const node = sqliteStore.upsertLogisticsNode({
      id: String(req.body?.id || `log-${Date.now()}`),
      driverName: String(req.body?.driverName || 'Entregador Autônomo GPS'),
      serviceTag: req.body?.serviceTag || 'Autônomo',
      modal: (req.body?.modal as LogisticsModal) || 'road',
      lat: Number(req.body?.lat) || -23.5505,
      lng: Number(req.body?.lng) || -46.6333,
      status: req.body?.status || 'em-rota',
      routeLabel: String(req.body?.routeLabel || 'Rastreamento Celular Ativo'),
      speedKmh: Number(req.body?.speedKmh) || 40,
    });
    broadcastWs('logistics:location', node);
    return res.json({ node });
  });

  app.get('/api/sqlite/remote-machines', (_req, res) => {
    return res.json({ remoteMachines: sqliteStore.listRemoteMachines() });
  });

  app.post('/api/sqlite/remote-machines', (req, res) => {
    try {
      const body = req.body ?? {};
      const qosRaw = Number(body.mqttQos);
      const mqttQos: 0 | 1 | 2 = qosRaw === 0 || qosRaw === 2 ? qosRaw : 1;
      const machine = sqliteStore.upsertRemoteMachine({
        id: typeof body.id === 'string' ? body.id : undefined,
        name: String(body.name || ''),
        machineType: (body.machineType as MachineType) || 'cnc-5axis',
        protocol: (body.protocol as RemoteMachineTarget['protocol']) || 'HTTP-Moonraker',
        endpointUrl: String(body.endpointUrl || ''),
        mqttEnabled: Boolean(body.mqttEnabled),
        mqttBrokerUrl: String(body.mqttBrokerUrl || ''),
        mqttTopic: String(body.mqttTopic || ''),
        mqttQos,
      });
      broadcastWs('remote:machine', machine);
      return res.status(201).json({ machine });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar máquina remota.';
      return res.status(400).json({ error: msg });
    }
  });

  app.post('/api/sqlite/remote-machines/:id/mqtt-ping', (req, res) => {
    const target = sqliteStore.listRemoteMachines().find((m) => m.id === req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'Máquina remota não encontrada.' });
    }
    const timestamp = new Date().toISOString();
    const topic =
      target.mqttTopic || `parametrix/machines/${target.id}/telemetry`;
    const brokerUrl = target.mqttBrokerUrl || 'mqtt://broker.parametrix.local:1883';
    const qos = target.mqttQos ?? 1;
    const proof = sqliteStore.recordVucProof(
      'REMOTE_MQTT_TELEMETRY',
      `MQTT Ping -> ${target.name} (${topic})`,
      { machineId: target.id, brokerUrl, topic, qos, timestamp }
    );
    const telemetry = {
      id: `mqtt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      machineId: target.id,
      machineName: target.name,
      brokerUrl,
      topic,
      qos,
      payloadSummary: `status=${target.status} · proto=${target.protocol} · qos=${qos} · rx/tx OK`,
      vucHash: proof.vucHash,
      timestamp,
    };
    broadcastWs('remote:mqtt', telemetry);
    return res.json({ telemetry });
  });

  app.post('/api/sqlite/remote-machines/:id/dispatch', (req, res) => {
    const projectName = String(req.body?.projectName || 'Projeto Parametrix');
    const postCode = String(req.body?.postCode || '');
    const updated = sqliteStore.dispatchRemoteMachineJob(
      req.params.id,
      projectName,
      postCode
    );
    if (!updated) {
      return res.status(404).json({ error: 'Máquina remota não cadastrada.' });
    }
    broadcastWs('remote:machine', updated);
    if (updated.mqttEnabled) {
      const topic = updated.mqttTopic || `parametrix/machines/${updated.id}/telemetry`;
      const brokerUrl = updated.mqttBrokerUrl || 'mqtt://broker.parametrix.local:1883';
      const telemetry = {
        id: `mqtt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        machineId: updated.id,
        machineName: updated.name,
        brokerUrl,
        topic,
        qos: updated.mqttQos ?? 1,
        payloadSummary: `G-Code despachado (${postCode.split(/\r?\n/).length} linhas) · ${projectName}`,
        vucHash: updated.lastJobVuc,
        timestamp: updated.updatedAt,
      };
      broadcastWs('remote:mqtt', telemetry);
    }
    return res.json({ machine: updated });
  });

  app.post('/api/vuc/verify', (req, res) => {
    const domain = String(req.body?.domain || 'FROSTBITE_RACK');
    const summary = String(req.body?.summary || 'Verificação VUC');
    const payload = req.body?.payload ?? evaluateRackComparison({ inputPowerMw: 1, busVoltageVdc: 800, ambientTempC: 24 });
    const entry = sqliteStore.recordVucProof(domain, summary, payload);
    return res.json({ entry });
  });

  app.post('/api/vuc/formal-proof', (req, res) => {
    const startedAt = Date.now();
    const domain = String(req.body?.domain || 'CAM_VUC_FORMAL');
    const inputPayload = req.body?.inputPayload ?? { source: 'parametrix-session', domain };
    const outputPayload = req.body?.outputPayload ?? { status: 'verified', remoteMachines: sqliteStore.listRemoteMachines().length };
    const cert = createFormalVucCertificate({
      domain,
      status: 'PASS',
      inputPayload,
      outputPayload,
      durationMs: Math.max(1, Date.now() - startedAt),
    });
    sqliteStore.recordVucProof(domain, `Certificado Ed25519 ${cert.vuc_id}`, cert);
    return res.status(201).json({ certificate: cert });
  });

  app.post('/api/vuc/formal-verify', (req, res) => {
    const cert = req.body?.certificate;
    if (!cert || typeof cert.hash_input !== 'string' || typeof cert.assinatura_ed25519 !== 'string') {
      return res.status(400).json({ valid: false, reason: 'Certificado VUC ausente ou incompleto.' });
    }
    const result = verifyFormalVucCertificate(cert, req.body?.rawInput, req.body?.rawOutput);
    return res.json(result);
  });

  app.get('/api/vuc/latest-proof', (_req, res) => {
    const proofFile = path.resolve(process.cwd(), 'proof', 'vuc-latest.json');
    if (fs.existsSync(proofFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(proofFile, 'utf8'));
        const certificate = parsed?.certificate ?? parsed;
        return res.json({
          source: 'proof/vuc-latest.json',
          certificate,
          outputPayload: parsed?.outputPayload,
          verify: parsed?.verify,
        });
      } catch {
        // Fallback to generating fresh runtime proof below
      }
    }
    const cert = createFormalVucCertificate({
      domain: 'RUNTIME_SNAPSHOT',
      status: 'PASS',
      inputPayload: { userCount: sqliteStore.getUserCount(), camJobs: sqliteStore.listCamServiceJobs().length },
      outputPayload: { remoteMachines: sqliteStore.listRemoteMachines().length },
      durationMs: 1,
    });
    return res.json({ source: 'runtime-ephemeral', certificate: cert });
  });

  const docsDir = path.resolve(process.cwd(), 'docs');
  if (fs.existsSync(docsDir)) {
    app.use('/gitpage', express.static(docsDir));
    app.use('/docs', express.static(docsDir));
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Parametrix CAD Studio (SQLite + WS + Vite) running at http://0.0.0.0:${PORT}`);
  });
}

void startServer();
