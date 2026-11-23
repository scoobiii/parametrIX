/**
 * @gos7-header v1.0
 * arquivo: src/kernel/sessionPointerRecorder.ts
 * responsabilidade: Gravação da sessão com movimentação do ponteiro, log de produção histórico e análise determinística de refinamento.
 */
import type {
  MachineType,
  ProductionSessionLogRecord,
  SessionActionKind,
  SessionHeatmapCell,
  SessionInteractionEvent,
  SessionRefinementInsight,
  WorkspaceTab,
} from '../types/cad';
import { computeDeterministicVucHash } from './vucHash';

export const HEATMAP_COLS = 6;
export const HEATMAP_ROWS = 4;

export function shouldRecordPointerSample(
  lastSample: { timestampMs: number; xPct: number; yPct: number } | null,
  next: { timestampMs: number; xPct: number; yPct: number },
  minIntervalMs = 220,
  minDeltaPct = 2.5
): boolean {
  if (!lastSample) return true;
  const elapsed = next.timestampMs - lastSample.timestampMs;
  if (elapsed < minIntervalMs) return false;
  const dist = Math.hypot(next.xPct - lastSample.xPct, next.yPct - lastSample.yPct);
  return dist >= minDeltaPct || elapsed >= 1500;
}

export function createSessionEvent(input: {
  seq: number;
  kind: SessionActionKind;
  timestampMs: number;
  xPct: number;
  yPct: number;
  activeTab: WorkspaceTab;
  processMachine: MachineType;
  selectedComponentId?: string | null;
  detail: string;
}): SessionInteractionEvent {
  return {
    seq: input.seq,
    kind: input.kind,
    timestampMs: input.timestampMs,
    xPct: Number(Math.max(0, Math.min(100, input.xPct)).toFixed(1)),
    yPct: Number(Math.max(0, Math.min(100, input.yPct)).toFixed(1)),
    activeTab: input.activeTab,
    processMachine: input.processMachine,
    selectedComponentId: input.selectedComponentId ?? null,
    detail: input.detail.slice(0, 200),
  };
}

export function analyzeSessionRefinement(input: {
  sessionId: string;
  userId: string;
  poHumano: string;
  llmAgent: string;
  delegatedByPo: boolean;
  activeTab: WorkspaceTab;
  processMachine: MachineType;
  processUrl: string;
  events: SessionInteractionEvent[];
  createdAt?: string;
}): ProductionSessionLogRecord {
  const grid = new Map<string, SessionHeatmapCell>();
  for (let r = 0; r < HEATMAP_ROWS; r++) {
    for (let c = 0; c < HEATMAP_COLS; c++) {
      grid.set(`${c}:${r}`, { col: c, row: r, count: 0 });
    }
  }

  let pointerCount = 0;
  let actionCount = 0;
  let camRestartCount = 0;
  let probeOrDispatchCount = 0;
  let componentSelectCount = 0;
  const tabsVisited = new Set<WorkspaceTab>();

  for (const ev of input.events) {
    tabsVisited.add(ev.activeTab);
    if (ev.kind === 'pointer-move') {
      pointerCount++;
    } else {
      actionCount++;
    }
    if (ev.kind === 'cam-restart') camRestartCount++;
    if (ev.kind === 'machine-probe' || ev.kind === 'machine-dispatch') probeOrDispatchCount++;
    if (ev.kind === 'component-select') componentSelectCount++;

    const col = Math.min(HEATMAP_COLS - 1, Math.max(0, Math.floor((ev.xPct / 100) * HEATMAP_COLS)));
    const row = Math.min(HEATMAP_ROWS - 1, Math.max(0, Math.floor((ev.yPct / 100) * HEATMAP_ROWS)));
    const cell = grid.get(`${col}:${row}`)!;
    cell.count += 1;
  }

  const heatmap = Array.from(grid.values());
  let topCell = heatmap[0];
  for (const cell of heatmap) {
    if (cell.count > topCell.count) topCell = cell;
  }

  const hotXStart = Math.round((topCell.col / HEATMAP_COLS) * 100);
  const hotXEnd = Math.round(((topCell.col + 1) / HEATMAP_COLS) * 100);
  const hotYStart = Math.round((topCell.row / HEATMAP_ROWS) * 100);
  const hotYEnd = Math.round(((topCell.row + 1) / HEATMAP_ROWS) * 100);
  const hotzoneLabel =
    topCell.count > 0
      ? `Q[${topCell.col},${topCell.row}] X:${hotXStart}-${hotXEnd}% · Y:${hotYStart}-${hotYEnd}% (${topCell.count} amostras)`
      : 'Sem movimento registrado';

  const firstTs = input.events[0]?.timestampMs ?? 0;
  const lastTs = input.events[input.events.length - 1]?.timestampMs ?? firstTs;
  const durationSec = Math.max(0, Number(((lastTs - firstTs) / 1000).toFixed(1)));

  const insights: SessionRefinementInsight[] = [];
  if (camRestartCount >= 3) {
    insights.push({
      code: 'HIGH_CAM_RESTARTS',
      severity: 'atencao',
      recommendation: `Detectados ${camRestartCount} reinícios de CAM na sessão; valide passo lateral e seguro Z antes do despacho real.`,
    });
  }
  if (tabsVisited.size >= 4) {
    insights.push({
      code: 'MULTI_MODULE_FLOW',
      severity: 'otimizacao',
      recommendation: `Fluxo transversal em ${tabsVisited.size} módulos; fixe a URL do processo no chat para retomar o contexto sem alternar abas.`,
    });
  }
  if (componentSelectCount === 0 && input.events.length > 0) {
    insights.push({
      code: 'LOW_OBJECT_MASK_INSPECTION',
      severity: 'info',
      recommendation:
        'Nenhum subcomponente selecionado na sessão; ative Máscara Obj (Object Mask) no 3D IX para vincular material PBR e processo CAM por peça.',
    });
  }
  if (probeOrDispatchCount === 0) {
    insights.push({
      code: 'MACHINE_NOT_PROBED',
      severity: 'info',
      recommendation:
        'Nenhum teste real de conexão em máquina executado nesta sessão; associe um endpoint em Máquinas Remotas antes de gerar código final.',
    });
  }
  if (insights.length === 0) {
    insights.push({
      code: 'SESSION_NOMINAL',
      severity: 'info',
      recommendation:
        'Fluxo CAD/CAE/CAM nominal com inspeção de componentes e acionamento de máquina rastreados.',
    });
  }

  const createdAt = input.createdAt ?? new Date().toISOString();
  const baseRecord = {
    sessionId: input.sessionId,
    userId: input.userId,
    poHumano: input.poHumano,
    llmAgent: input.llmAgent,
    delegatedByPo: input.delegatedByPo,
    activeTab: input.activeTab,
    processMachine: input.processMachine,
    processUrl: input.processUrl,
    pointerCount,
    actionCount,
    durationSec,
    hotzoneLabel,
    heatmap,
    events: input.events,
    insights,
    createdAt,
  };

  const vucHash = computeDeterministicVucHash('SESSION_PRODUCTION_LOG', {
    sessionId: input.sessionId,
    pointerCount,
    actionCount,
    durationSec,
    hotzoneLabel,
    processMachine: input.processMachine,
  });

  return {
    id: `sess-${input.sessionId}`,
    ...baseRecord,
    vucHash,
  };
}
