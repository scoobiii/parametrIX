import { describe, expect, it } from 'vitest';
import {
  QWEN_CORE_GGUF_REL_PATH,
  QWEN_CORE_MODEL_ID,
  QWEN_CORE_SYSTEM_PROMPT,
  buildFullProjectKnowledgeCorpus,
  buildQwenChatMlFinetuneDataset,
  retrieveQwenRagContext,
  serializeQwenFinetuneJsonl,
} from '../src/kernel/qwenProjectRagFinetune';
import type { RagSourceDocument } from '../src/types/cad';

const SAMPLE_DOC: RagSourceDocument = {
  id: 'doc-1',
  title: 'Manual Coldplate Frostbite',
  kind: 'upload',
  mimeType: 'text/plain',
  byteSize: 256,
  formatTag: 'TXT',
  chunkCount: 1,
  summary: 'Guia de usinagem liquid cooling 800VDC para rack 1 MW.',
  chunks: [
    {
      id: 'c1',
      docId: 'doc-1',
      docTitle: 'Manual Coldplate Frostbite',
      index: 0,
      text: 'Micro-canais de cobre usinados em CNC 5 eixos com tolerância IT6 e prova VUC Ed25519.',
    },
  ],
  addedAt: '2026-11-21T00:00:00.000Z',
};

describe('qwenProjectRagFinetune kernel', () => {
  it('builds complete project knowledge corpus with static modules, partial/full live state, and dynamic RAG docs', () => {
    expect(QWEN_CORE_MODEL_ID).toBe('qwen2.5-0.5b-instruct-q4');
    expect(QWEN_CORE_GGUF_REL_PATH).toContain('qwen2.5-0.5b-instruct-q4_k_m.gguf');
    expect(QWEN_CORE_SYSTEM_PROMPT).toContain('FrostbiteEngine');

    const baseCorpus = buildFullProjectKnowledgeCorpus();
    expect(baseCorpus.length).toBeGreaterThanOrEqual(9);
    expect(baseCorpus.some((e) => e.domain === 'MCP')).toBe(true);
    expect(baseCorpus.some((e) => e.domain === 'DATACENTER')).toBe(true);

    const partialLiveCorpus = buildFullProjectKnowledgeCorpus([], {});
    const partialLiveEntry = partialLiveCorpus.find((e) => e.id === 'live-workspace-state');
    expect(partialLiveEntry?.content).toContain('Parametrix');

    const richCorpus = buildFullProjectKnowledgeCorpus([SAMPLE_DOC], {
      partName: 'Coldplate 800V',
      activeSegment: 'industrial-cnc',
      machineType: 'powder-metal',
      processLabel: 'LPBF Pó Metálico',
      activeTool: 'T11 Laser 400W',
      postFormat: 'slm-powder',
      safetyFactor: 2.8,
      additiveConfig: {
        layerThicknessUm: 40,
        sinterTempC: 1200,
        supportPattern: 'tree-branch',
        supportDensityPct: 30,
      },
      vucHash: 'VUC-1234567890ABCDEF',
    });
    const richLiveEntry = richCorpus.find((e) => e.id === 'live-workspace-state');
    expect(richLiveEntry?.content).toContain('Coldplate 800V');
    expect(richLiveEntry?.content).toContain('2.8x');
    expect(richLiveEntry?.content).toContain('1200°C');
    expect(richLiveEntry?.content).toContain('VUC-1234567890ABCDEF');
    expect(richCorpus.some((e) => e.id === 'doc-doc-1')).toBe(true);
  });

  it('generates verifiable ChatML fine-tuning examples, JSONL serialization, and RAG context retrieval', () => {
    const defaultDataset = buildQwenChatMlFinetuneDataset();
    expect(defaultDataset.length).toBeGreaterThanOrEqual(7);

    const enrichedDataset = buildQwenChatMlFinetuneDataset([SAMPLE_DOC], {
      partName: 'Torso Humanoide',
      machineType: 'cnc-5axis',
    });
    expect(enrichedDataset.some((ex) => ex.domain === 'USER_RAG')).toBe(true);
    expect(enrichedDataset.some((ex) => ex.domain === 'LIVE_STATE')).toBe(true);

    const jsonl = serializeQwenFinetuneJsonl(enrichedDataset);
    const lines = jsonl.trim().split('\n');
    expect(lines).toHaveLength(enrichedDataset.length);
    expect(JSON.parse(lines[0]).vucHash).toMatch(/^VUC-[0-9A-F]{64}$/);

    const hitCtx = retrieveQwenRagContext({
      query: 'frostbite 800vdc frostbite rack liquid cooling coldplate',
      dynamicDocs: [SAMPLE_DOC],
      cadSummary: { partName: 'Rack 800V', safetyFactor: 2.4 },
      topK: 3,
    });
    expect(hitCtx.matchedEntries).toHaveLength(3);
    expect(hitCtx.matchedExamples).toHaveLength(2);
    expect(hitCtx.chatMlPrompt).toContain('<|im_start|>system');
    expect(hitCtx.chatMlPrompt).toContain('frostbite 800vdc');

    const emptyQueryCtx = retrieveQwenRagContext({
      query: ' ',
    });
    expect(emptyQueryCtx.matchedEntries).toHaveLength(4);
    expect(emptyQueryCtx.chatMlPrompt).toContain('Resuma o estado atual do projeto');
  });
});
