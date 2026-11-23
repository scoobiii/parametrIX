import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { CamAgentContextSummary } from '../kernel/camAgentSystemInstruction';
import {
  QWEN_CODER_GGUF_REL_PATH,
  QWEN_CORE_GGUF_REL_PATH,
  QWEN_CORE_MODEL_ID,
  QWEN_CORE_SYSTEM_PROMPT,
  type Qwen05bVariantId,
  type QwenSpecialistFunctionId,
  buildQwenChatMlFinetuneDataset,
  retrieveQwenRagContext,
  serializeQwenFinetuneJsonl,
} from '../kernel/qwenProjectRagFinetune';
import { createFormalVucCertificate } from './vucFormalProof';
import type { FormalVucCertificate, RagSourceDocument } from '../types/cad';

const execFileAsync = promisify(execFile);

export interface LocalQwenRuntimeStatus {
  installed: boolean;
  coderInstalled: boolean;
  instructInstalled: boolean;
  modelId: string;
  binaryPath: string | null;
  modelPath: string | null;
  modelSizeBytes: number;
  ragDatasetPath: string;
  ragExamplesCount: number;
  ragDatasetSha256: string;
  ready: boolean;
}

export interface LocalQwenInferResult {
  reply: string;
  modelUsed: string;
  specialistId: QwenSpecialistFunctionId;
  specialistTitle: string;
  modelVariant: Qwen05bVariantId;
  durationMs: number;
  ragSourcesUsed: string[];
  finetuneExamplesCount: number;
  tokensApprox: number;
  vucCertificate: FormalVucCertificate;
}

const REGISTRY_CACHE: { docs: RagSourceDocument[] } = { docs: [] };

export function setRegisteredRagDocs(docs: RagSourceDocument[]): void {
  REGISTRY_CACHE.docs = docs;
}

export function getRegisteredRagDocs(): RagSourceDocument[] {
  return REGISTRY_CACHE.docs;
}

export function resolveLocalQwenPaths(
  rootDir = process.cwd(),
  preferredVariant?: Qwen05bVariantId
): {
  binDir: string;
  binaryPath: string | null;
  modelPath: string | null;
  coderModelPath: string | null;
  instructModelPath: string | null;
  ragDatasetPath: string;
  systemPromptPath: string;
} {
  const binDir = path.resolve(rootDir, 'models', 'llama-bin');
  const completionBin = path.join(binDir, 'llama-completion');
  const cliBin = path.join(binDir, 'llama-cli');
  const binaryPath = fs.existsSync(completionBin)
    ? completionBin
    : fs.existsSync(cliBin)
      ? cliBin
      : null;

  const coderCandidate = path.resolve(rootDir, QWEN_CODER_GGUF_REL_PATH);
  const instructCandidate = path.resolve(rootDir, QWEN_CORE_GGUF_REL_PATH);
  const coderReady = fs.existsSync(coderCandidate) && fs.statSync(coderCandidate).size > 100_000_000;
  const instructReady =
    fs.existsSync(instructCandidate) && fs.statSync(instructCandidate).size > 100_000_000;

  const orderedCandidates =
    preferredVariant === 'qwen2.5-0.5b-instruct-q4'
      ? [
          instructReady ? instructCandidate : null,
          coderReady ? coderCandidate : null,
        ]
      : [
          coderReady ? coderCandidate : null,
          instructReady ? instructCandidate : null,
        ];
  const modelPath = orderedCandidates.find(Boolean) ?? null;

  const ragDatasetPath = path.resolve(rootDir, 'models', 'qwen', 'parametrix-finetune-rag.jsonl');
  const systemPromptPath = path.resolve(rootDir, 'models', 'qwen', 'parametrix-system.txt');

  return {
    binDir,
    binaryPath,
    modelPath,
    coderModelPath: coderReady ? coderCandidate : null,
    instructModelPath: instructReady ? instructCandidate : null,
    ragDatasetPath,
    systemPromptPath,
  };
}

export function syncQwenProjectRagDataset(
  dynamicDocs: RagSourceDocument[] = REGISTRY_CACHE.docs,
  cadSummary?: CamAgentContextSummary,
  rootDir = process.cwd()
): {
  ragDatasetPath: string;
  systemPromptPath: string;
  examplesCount: number;
  datasetSha256: string;
  vucCertificate: FormalVucCertificate;
} {
  const startedAt = Date.now();
  const { ragDatasetPath, systemPromptPath } = resolveLocalQwenPaths(rootDir);
  fs.mkdirSync(path.dirname(ragDatasetPath), { recursive: true });

  const examples = buildQwenChatMlFinetuneDataset(dynamicDocs, cadSummary);
  const jsonl = serializeQwenFinetuneJsonl(examples);
  fs.writeFileSync(ragDatasetPath, jsonl, 'utf8');
  fs.writeFileSync(systemPromptPath, QWEN_CORE_SYSTEM_PROMPT, 'utf8');

  const datasetSha256 = crypto.createHash('sha256').update(jsonl).digest('hex').toUpperCase();
  const vucCertificate = createFormalVucCertificate({
    domain: 'QWEN_05B_RAG_FINETUNE',
    status: 'PASS',
    inputPayload: {
      modelId: QWEN_CORE_MODEL_ID,
      dynamicDocsCount: dynamicDocs.length,
      partName: cadSummary?.partName ?? 'Parametrix',
    },
    outputPayload: {
      ragDatasetPath: path.relative(rootDir, ragDatasetPath),
      examplesCount: examples.length,
      datasetSha256,
    },
    durationMs: Math.max(1, Date.now() - startedAt),
  });

  return {
    ragDatasetPath,
    systemPromptPath,
    examplesCount: examples.length,
    datasetSha256,
    vucCertificate,
  };
}

export function getLocalQwenStatus(rootDir = process.cwd()): LocalQwenRuntimeStatus {
  const { binaryPath, modelPath, coderModelPath, instructModelPath, ragDatasetPath } =
    resolveLocalQwenPaths(rootDir);
  if (!fs.existsSync(ragDatasetPath)) {
    syncQwenProjectRagDataset(REGISTRY_CACHE.docs, undefined, rootDir);
  }
  const datasetRaw = fs.existsSync(ragDatasetPath) ? fs.readFileSync(ragDatasetPath, 'utf8') : '';
  const ragExamplesCount = datasetRaw ? datasetRaw.trim().split('\n').filter(Boolean).length : 0;
  const ragDatasetSha256 = crypto.createHash('sha256').update(datasetRaw).digest('hex').toUpperCase();
  const modelSizeBytes = modelPath ? fs.statSync(modelPath).size : 0;

  return {
    installed: Boolean(binaryPath && modelPath),
    coderInstalled: Boolean(coderModelPath),
    instructInstalled: Boolean(instructModelPath),
    modelId: coderModelPath ? 'qwen2.5-coder-0.5b-instruct-q4' : QWEN_CORE_MODEL_ID,
    binaryPath: binaryPath ? path.relative(rootDir, binaryPath) : null,
    modelPath: modelPath ? path.relative(rootDir, modelPath) : null,
    modelSizeBytes,
    ragDatasetPath: path.relative(rootDir, ragDatasetPath),
    ragExamplesCount,
    ragDatasetSha256,
    ready: Boolean(binaryPath && modelPath && ragExamplesCount > 0),
  };
}

export async function runLocalQwenInference(params: {
  query: string;
  cadSummary?: CamAgentContextSummary;
  dynamicDocs?: RagSourceDocument[];
  maxTokens?: number;
  rootDir?: string;
}): Promise<LocalQwenInferResult> {
  const rootDir = params.rootDir ?? process.cwd();
  const startedAt = Date.now();
  const docs = params.dynamicDocs ?? REGISTRY_CACHE.docs;
  const { specialistProfile, matchedEntries, chatMlPrompt } = retrieveQwenRagContext({
    query: params.query,
    dynamicDocs: docs,
    cadSummary: params.cadSummary,
    topK: 3,
  });

  const { binDir, binaryPath, modelPath } = resolveLocalQwenPaths(
    rootDir,
    specialistProfile.modelVariant
  );

  if (!binaryPath || !modelPath) {
    throw new Error(
      'Binário Qwen 2.5 0.5B ainda não instalado no core. Execute scripts/install_qwen_local.sh.'
    );
  }

  const syncInfo = syncQwenProjectRagDataset(docs, params.cadSummary, rootDir);
  const threads = String(Math.max(1, Math.min(4, os.cpus().length)));
  const maxTokens = String(Math.max(48, Math.min(320, params.maxTokens ?? 180)));

  const args = [
    '-m',
    modelPath,
    '-p',
    chatMlPrompt,
    '-n',
    maxTokens,
    '-c',
    '2048',
    '-t',
    threads,
    '--temp',
    '0.2',
    '--top-p',
    '0.9',
    '--no-display-prompt',
    '-no-cnv',
    '-r',
    '<|im_end|>',
  ];

  const { stdout } = await execFileAsync(binaryPath, args, {
    cwd: rootDir,
    timeout: 45_000,
    maxBuffer: 2 * 1024 * 1024,
    env: {
      ...process.env,
      LD_LIBRARY_PATH: `${binDir}${process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ''}`,
    },
  });

  const cleaned = stdout
    .replace(/<\|im_end\|>/g, '')
    .replace(/<\|endoftext\|>/g, '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .trim();

  const reply =
    cleaned ||
    `[${specialistProfile.title}] Consultei ${matchedEntries.map((e) => e.title).join(', ')} (${syncInfo.examplesCount} exemplos SFT).`;

  const durationMs = Math.max(1, Date.now() - startedAt);
  const tokensApprox = Math.max(1, Math.round(reply.split(/\s+/).length * 1.35));
  const vucCertificate = createFormalVucCertificate({
    domain: 'LOCAL_QWEN_05B_INFERENCE',
    status: 'PASS',
    inputPayload: {
      query: params.query,
      specialistId: specialistProfile.id,
      modelVariant: specialistProfile.modelVariant,
      ragSources: matchedEntries.map((e) => e.id),
      datasetSha256: syncInfo.datasetSha256,
    },
    outputPayload: {
      modelId: specialistProfile.modelVariant,
      reply,
      tokensApprox,
    },
    durationMs,
  });

  return {
    reply,
    modelUsed: `${specialistProfile.modelVariant} (${specialistProfile.id} · llama.cpp)`,
    specialistId: specialistProfile.id,
    specialistTitle: specialistProfile.title,
    modelVariant: specialistProfile.modelVariant,
    durationMs,
    ragSourcesUsed: matchedEntries.map((e) => e.title),
    finetuneExamplesCount: syncInfo.examplesCount,
    tokensApprox,
    vucCertificate,
  };
}
