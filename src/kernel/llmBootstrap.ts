import type {
  AgentProviderId,
  LocalLlmRecommendation,
  McpEyeEvent,
  SystemResourceSnapshot,
} from '../types/cad';
import { buildVucExecutionProof } from './vucHash';

export interface AgentProviderCatalogEntry {
  id: AgentProviderId;
  label: string;
  vendor: string;
  defaultModel: string;
  supportsServerCloud: boolean;
  loginMethodLabel: string;
}

export const AGENT_PROVIDER_CATALOG: AgentProviderCatalogEntry[] = [
  {
    id: 'gemini',
    label: 'Google Gemini (Cloud / MCP Server)',
    vendor: 'Google AI',
    defaultModel: 'gemini-4-hydrogen',
    supportsServerCloud: true,
    loginMethodLabel: 'API Server-Side GEMINI_API_KEY',
  },
  {
    id: 'claude',
    label: 'Anthropic Claude',
    vendor: 'Anthropic',
    defaultModel: 'claude-3-7-sonnet',
    supportsServerCloud: false,
    loginMethodLabel: 'Login / Token OAuth Tradicional',
  },
  {
    id: 'manus',
    label: 'Manus Autonomous Agent',
    vendor: 'Manus AI',
    defaultModel: 'manus-industrial-v1',
    supportsServerCloud: false,
    loginMethodLabel: 'Sessão Tradicional Manus',
  },
  {
    id: 'grok',
    label: 'xAI Grok',
    vendor: 'xAI',
    defaultModel: 'grok-3-beta',
    supportsServerCloud: false,
    loginMethodLabel: 'Login / Chave xAI',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek Reasoner / Coder',
    vendor: 'DeepSeek',
    defaultModel: 'deepseek-r1',
    supportsServerCloud: false,
    loginMethodLabel: 'Conta DeepSeek / OpenAI-Compat',
  },
  {
    id: 'qwen',
    label: 'Alibaba Qwen 2.5 Max / Coder',
    vendor: 'Qwen Cloud',
    defaultModel: 'qwen-2.5-coder-32b',
    supportsServerCloud: false,
    loginMethodLabel: 'Login Qwen / DashScope',
  },
  {
    id: 'meta',
    label: 'Meta Llama 3.3 / 4',
    vendor: 'Meta AI',
    defaultModel: 'llama-3.3-70b',
    supportsServerCloud: false,
    loginMethodLabel: 'Login Meta / Endpoint Compatível',
  },
  {
    id: 'local-llm',
    label: 'LLM Local (Bootstrap Automático)',
    vendor: 'Localhost / WebGPU / Ollama',
    defaultModel: 'auto-bootstrap',
    supportsServerCloud: false,
    loginMethodLabel: 'Auto-seleção por Hardware & Carga',
  },
];

/**
 * Selects the lightest & most efficient Local LLM tier based on real-time CPU, GPU,
 * free RAM, OS, network speed, and active logged-in users.
 */
export function selectOptimalLocalLlm(
  snapshot: SystemResourceSnapshot
): LocalLlmRecommendation {
  const freeRam = Math.max(0.5, snapshot.freeRamGb);
  const cores = Math.max(1, snapshot.cpuCores);
  const load = Math.max(0, Math.min(100, snapshot.cpuLoadPct));
  const users = Math.max(1, snapshot.loggedInUsers);
  const effectiveRamPerUser = freeRam / Math.max(1, Math.sqrt(users));

  if (effectiveRamPerUser < 2.5 || load > 82 || cores <= 2) {
    return {
      modelId: 'smollm2-360m-q4',
      displayName: 'SmolLM2 360M Instruct (Ultra-Leve)',
      quantization: 'Q4_K_M',
      estimatedRamGb: 0.45,
      estimatedTokPerSec: Math.round(18 + cores * 4),
      tier: 'ultra-light',
      rationale: `Carga CPU ${load.toFixed(0)}%, RAM livre ${freeRam.toFixed(1)} GB e ${users} usuário(s) ativos: selecionado modelo sub-500MB para latência zero.`,
    };
  }

  if (effectiveRamPerUser < 6.0 || snapshot.gpuTier === 'none' || snapshot.gpuTier === 'integrated') {
    return {
      modelId: 'qwen2.5-1.5b-instruct-q4',
      displayName: 'Qwen 2.5 1.5B Instruct (Compacto)',
      quantization: 'Q4_K_M',
      estimatedRamGb: 1.35,
      estimatedTokPerSec: Math.round(24 + cores * 3),
      tier: 'compact',
      rationale: `GPU ${snapshot.gpuTier} (${snapshot.gpuName}) com ${freeRam.toFixed(1)} GB livre: Qwen2.5-1.5B entrega bom parsing MCP/JSON consumindo <1.4 GB.`,
    };
  }

  if (effectiveRamPerUser < 14.0 || snapshot.gpuTier === 'dedicated-mid') {
    return {
      modelId: 'phi-4-mini-3.8b-q4',
      displayName: 'Phi-4 Mini 3.8B Reasoning (Equilibrado)',
      quantization: 'Q4_K_M',
      estimatedRamGb: 2.9,
      estimatedTokPerSec: Math.round(45 + cores * 2),
      tier: 'balanced',
      rationale: `GPU dedicada média (${snapshot.gpuName}) e ${freeRam.toFixed(1)} GB livre: ideal para raciocínio CAD/CAM + feedback visual MCP.`,
    };
  }

  return {
    modelId: 'qwen2.5-coder-7b-q4',
    displayName: 'Qwen 2.5 Coder 7B (Workstation)',
    quantization: 'Q4_K_M',
    estimatedRamGb: 5.4,
    estimatedTokPerSec: Math.round(75 + cores * 2),
    tier: 'workstation',
    rationale: `Workstation/Datacenter (${snapshot.gpuName}, ${freeRam.toFixed(1)} GB livre, rede ${snapshot.networkMbps} Mbps): máxima precisão local em G-Code e NURBS.`,
  };
}

export function createMcpEyeEvent(
  direction: McpEyeEvent['direction'],
  source: string,
  summary: string,
  payload: unknown
): McpEyeEvent {
  const proof = buildVucExecutionProof(`MCP_EYE_${direction.toUpperCase()}`, summary, payload);
  return {
    id: `eye-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    direction,
    source,
    summary,
    payloadPreview: JSON.stringify(payload).slice(0, 180),
    vucHash: proof.vucHash,
    timestamp: new Date().toLocaleTimeString('pt-BR'),
  };
}
