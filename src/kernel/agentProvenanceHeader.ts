/**
 * @gos7-header v1.0
 * arquivo: src/kernel/agentProvenanceHeader.ts
 * responsabilidade: Geração e leitura de cabeçalhos GOS7 identificando Agente LLM, Harness e PO Humano (delegado ou direto).
 */
import type { AgentProvenanceMetadata, Gos7ArtifactStatus } from '../types/cad';
import { computeDeterministicVucHash } from './vucHash';

export interface BuildProvenanceInput {
  fileName: string;
  responsibility: string;
  dirOrUrl: string;
  version?: string;
  poHumanoName: string;
  poHumanoHandle: string;
  poHumanoEmail: string;
  delegatedByPo: boolean;
  delegationScope?: string;
  llmAgentId: string;
  llmModel?: string;
  harnessId?: string;
  status?: Gos7ArtifactStatus;
  createdAt?: string;
}

export function buildAgentProvenanceMetadata(input: BuildProvenanceInput): AgentProvenanceMetadata {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const poName = input.poHumanoName.trim() || 'Product Owner Parametrix';
  const poHandle = input.poHumanoHandle.trim() || '@po.parametrix';
  const poEmail = input.poHumanoEmail.trim() || 'po@parametrix.local';
  const llmAgentId = input.llmAgentId.trim() || 'harness-orchestrator';
  const llmModel = input.llmModel?.trim() || 'qwen2.5-coder:0.5b';
  const harnessId = input.harnessId?.trim() || 'parametrix-harness-v1';
  const delegationScope = input.delegatedByPo
    ? input.delegationScope?.trim() || `Delegado pelo PO ${poHandle} ao agente ${llmAgentId}`
    : `Execução direta supervisionada por ${poHandle}`;

  const core = {
    fileName: input.fileName,
    responsibility: input.responsibility,
    dirOrUrl: input.dirOrUrl,
    version: input.version ?? `1.0/${createdAt.slice(0, 10)}/${poHandle}`,
    poHumanoName: poName,
    poHumanoHandle: poHandle,
    poHumanoEmail: poEmail,
    delegatedByPo: input.delegatedByPo,
    delegationScope,
    llmAgentId,
    llmModel,
    harnessId,
    status: input.status ?? 'runtime-sandbox',
    createdAt,
  };

  return {
    ...core,
    vucHash: computeDeterministicVucHash('GOS7_PROVENANCE', core),
  };
}

export function formatGos7CommentLines(meta: AgentProvenanceMetadata): string[] {
  const autor = meta.delegatedByPo
    ? `${meta.llmAgentId} (modelo=${meta.llmModel}, harness=${meta.harnessId}) [DELEGADO_POR_PO: ${meta.poHumanoName} ${meta.poHumanoHandle}]`
    : `${meta.poHumanoName} ${meta.poHumanoHandle} + agente ${meta.llmAgentId} (${meta.llmModel})`;

  return [
    `@gos7-header v1.0 | gang-of-seven-agile-devops`,
    `nome_arquivo: ${meta.fileName}`,
    `autor: ${autor}`,
    `po_humano: ${meta.poHumanoName} <${meta.poHumanoEmail}> (${meta.poHumanoHandle})`,
    `agente_llm: ${meta.llmAgentId} | model=${meta.llmModel} | harness=${meta.harnessId}`,
    `delegado_por_po: ${meta.delegatedByPo ? 'SIM' : 'NAO'} | escopo=${meta.delegationScope}`,
    `versao: ${meta.version}`,
    `responsabilidade: ${meta.responsibility}`,
    `diretorio_url: ${meta.dirOrUrl}`,
    `status: ${meta.status}`,
    `vuc_hash: ${meta.vucHash}`,
  ];
}

export function formatGos7GcodeHeader(
  meta: AgentProvenanceMetadata,
  dialect: 'gcode-paren' | 'kuka-semi' | 'abb-bang' | 'hash'
): string {
  const lines = formatGos7CommentLines(meta);
  if (dialect === 'kuka-semi') {
    return lines.map((l) => `; ${l}`).join('\n');
  }
  if (dialect === 'abb-bang') {
    return lines.map((l) => `! ${l}`).join('\n');
  }
  if (dialect === 'hash') {
    return lines.map((l) => `# ${l}`).join('\n');
  }
  return lines.map((l) => `(${l.replace(/[()]/g, '')})`).join('\n');
}

export function injectGos7ProvenanceIntoTextArtifact(
  content: string,
  meta: AgentProvenanceMetadata,
  ext: 'nc' | 'src' | 'mod' | 'step' | 'ts' | 'sh'
): string {
  if (ext === 'step') {
    const summaryLine = `GOS7=${meta.llmAgentId}|PO=${meta.poHumanoHandle}|DELEGATED=${meta.delegatedByPo}|VUC=${meta.vucHash}`;
    if (content.includes('FILE_DESCRIPTION(')) {
      return content.replace(
        /FILE_DESCRIPTION\(\(([^)]*)\)/,
        `FILE_DESCRIPTION(($1,'${summaryLine.replace(/'/g, '')}')`
      );
    }
    return content;
  }

  if (ext === 'ts') {
    const block = ['/*', ...formatGos7CommentLines(meta).map((l) => ` * ${l}`), ' */'].join('\n');
    return `${block}\n${content}`;
  }

  const dialect =
    ext === 'src'
      ? 'kuka-semi'
      : ext === 'mod'
        ? 'abb-bang'
        : ext === 'sh'
          ? 'hash'
          : 'gcode-paren';
  const hdr = formatGos7GcodeHeader(meta, dialect);

  if (ext === 'nc' && content.startsWith('%')) {
    const rest = content.slice(1).replace(/^\r?\n/, '');
    return `%\n${hdr}\n${rest}`;
  }
  return `${hdr}\n${content}`;
}

export function buildArtifactProvenanceSidecarJson(meta: AgentProvenanceMetadata): string {
  return JSON.stringify(
    {
      schema: 'parametrix.gos7.provenance/v1',
      provenance: meta,
      verification: {
        identifiesLlmAgent: Boolean(meta.llmAgentId),
        identifiesPoHumano: Boolean(meta.poHumanoHandle && meta.poHumanoEmail),
        delegatedByPo: meta.delegatedByPo,
        vucHash: meta.vucHash,
      },
    },
    null,
    2
  );
}

export function parseGos7ProvenanceFromText(text: string): {
  detected: boolean;
  agenteLlm?: string;
  poHumano?: string;
  delegadoPorPo?: boolean;
  vucHash?: string;
} {
  const hasHeader = text.includes('@gos7-header') || text.includes('GOS7=');
  if (!hasHeader) return { detected: false };

  const agentMatch = text.match(/agente_llm:\s*([^|\n\r]+)/i) ?? text.match(/GOS7=([^|']+)/i);
  const poMatch = text.match(/po_humano:\s*([^\n\r]+)/i) ?? text.match(/PO=([^|']+)/i);
  const delegMatch = text.match(/delegado_por_po:\s*(SIM|NAO)/i) ?? text.match(/DELEGATED=(true|false)/i);
  const vucMatch = text.match(/vuc_hash:\s*(VUC-[0-9A-F]+)/i) ?? text.match(/VUC=(VUC-[0-9A-F]+)/i);

  const delegRaw = delegMatch?.[1]?.toUpperCase();
  return {
    detected: true,
    agenteLlm: agentMatch?.[1]?.trim(),
    poHumano: poMatch?.[1]?.trim().replace(/[()]/g, ''),
    delegadoPorPo: delegRaw === 'SIM' || delegRaw === 'TRUE',
    vucHash: vucMatch?.[1]?.trim(),
  };
}
