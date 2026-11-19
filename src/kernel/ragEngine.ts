import {
  parse3DM,
  parseDXF,
  parseIPT,
  parseIPTAsync,
  parseOBJ,
  parseSTEPAsync,
  parseSTEPorIFC,
  parseSTL,
  parseSVGToCad,
} from './cadFormats';
import type { ImportedCadModel, RagDocumentChunk, RagSourceDocument, RagSourceKind } from '../types/cad';

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 180;

export function chunkTextForRag(docId: string, docTitle: string, text: string): RagDocumentChunk[] {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (!clean) return [];

  const chunks: RagDocumentChunk[] = [];
  let pos = 0;
  let idx = 0;
  while (pos < clean.length && idx < 40) {
    const slice = clean.slice(pos, pos + CHUNK_SIZE).trim();
    if (slice) {
      chunks.push({
        id: `${docId}-c${idx}`,
        docId,
        docTitle,
        index: idx + 1,
        text: slice,
      });
      idx++;
    }
    if (pos + CHUNK_SIZE >= clean.length) break;
    pos += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

/**
 * Simple client-side BM25-inspired keyword + numeric token retriever for RAG chunks.
 */
export function retrieveTopRagChunks(
  docs: RagSourceDocument[],
  query: string,
  topK = 6
): RagDocumentChunk[] {
  const allChunks = docs.flatMap((d) => d.chunks);
  if (allChunks.length === 0) return [];

  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9áéíóúãõâêîôûç_-]+/i)
    .filter((t) => t.length >= 2);

  if (tokens.length === 0) {
    return allChunks.slice(0, topK);
  }

  const scored = allChunks.map((chunk) => {
    const hay = `${chunk.docTitle} ${chunk.text}`.toLowerCase();
    let score = 0;
    for (const tok of tokens) {
      if (hay.includes(tok)) {
        score += 2;
        const occurrences = hay.split(tok).length - 1;
        score += Math.min(3, occurrences * 0.4);
      }
    }
    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const positives = scored.filter((s) => s.score > 0).slice(0, topK).map((s) => s.chunk);
  return positives.length > 0 ? positives : allChunks.slice(0, Math.min(3, topK));
}

export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Parses CAD geometry if the ingested file is .STL, .OBJ, .DXF, .3DM, .STEP/.STP, .IFC, .IPT, .SVG,
 * or attaches a pre-converted Image-to-CAD project, building a descriptive RAG text summary.
 */
export function tryBuildCadAndRagDoc(params: {
  title: string;
  kind: RagSourceKind;
  originUrl?: string;
  mimeType: string;
  byteSize: number;
  extractedText?: string;
  buffer?: ArrayBuffer;
  preBuiltCad?: ImportedCadModel | null;
}): { ragDoc: RagSourceDocument; importedCad: ImportedCadModel | null } {
  const lower = params.title.toLowerCase();
  let importedCad: ImportedCadModel | null = params.preBuiltCad ?? null;
  let cadTextSummary = '';

  try {
    if (!importedCad) {
      if (lower.endsWith('.stl') && params.buffer) {
        importedCad = parseSTL(params.buffer, params.title);
      } else if (lower.endsWith('.3dm') && params.buffer) {
        importedCad = parse3DM(params.buffer, params.title);
      } else if (lower.endsWith('.ipt') && params.buffer) {
        importedCad = parseIPT(params.buffer, params.title);
      } else if (lower.endsWith('.obj') && params.extractedText) {
        importedCad = parseOBJ(params.extractedText, params.title);
      } else if (lower.endsWith('.dxf') && params.extractedText) {
        importedCad = parseDXF(params.extractedText, params.title);
      } else if ((lower.endsWith('.step') || lower.endsWith('.stp')) && params.extractedText) {
        importedCad = parseSTEPorIFC(params.extractedText, params.title, 'STEP');
      } else if (lower.endsWith('.ifc') && params.extractedText) {
        importedCad = parseSTEPorIFC(params.extractedText, params.title, 'IFC');
      } else if (lower.endsWith('.svg') && params.extractedText) {
        importedCad = parseSVGToCad(params.extractedText, params.title);
      }
    }
  } catch {
    // Non-fatal: still index raw text for RAG even if CAD parsing fails
  }

  if (importedCad) {
    cadTextSummary = [
      `Arquivo CAD importado: ${importedCad.filename} (Formato ${importedCad.format})`,
      `Triângulos: ${importedCad.triangleCount} · Entidades: ${importedCad.entityCount}`,
      `Camadas / Grupos: ${importedCad.layers.join(', ')}`,
      `Dimensões (Caixa Envoltória X×Y×Z mm): ${importedCad.boundingBox.size
        .map((n) => n.toFixed(1))
        .join(' x ')} mm`,
      `Notas técnicas: ${importedCad.notes}`,
    ].join('\n');
  }

  const combinedText = [cadTextSummary, params.extractedText || '']
    .filter(Boolean)
    .join('\n\n')
    .trim();

  const docId = `rag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const effectiveText =
    combinedText ||
    `Documento binário "${params.title}" (${params.mimeType}, ${(params.byteSize / 1024).toFixed(1)} KB) anexado para referência.`;
  const chunks = chunkTextForRag(docId, params.title, effectiveText);

  const extMatch = /\.([a-z0-9]+)$/i.exec(params.title);
  const formatTag = extMatch ? extMatch[1].toUpperCase() : 'DOC';

  const ragDoc: RagSourceDocument = {
    id: docId,
    title: params.title,
    kind: params.kind,
    originUrl: params.originUrl,
    mimeType: params.mimeType,
    byteSize: params.byteSize,
    formatTag,
    chunkCount: chunks.length,
    summary: importedCad
      ? importedCad.notes
      : `${chunks.length} trecho(s) indexados · ${(params.byteSize / 1024).toFixed(1)} KB`,
    chunks,
    addedAt: new Date().toLocaleTimeString('pt-BR'),
  };

  return { ragDoc, importedCad };
}

/**
 * Async variant that uses OpenCASCADE (OCCT WASM) for .STEP/.STP and OLE2+zlib+ACIS for .IPT.
 */
export async function tryBuildCadAndRagDocAsync(params: {
  title: string;
  kind: RagSourceKind;
  originUrl?: string;
  mimeType: string;
  byteSize: number;
  extractedText?: string;
  buffer?: ArrayBuffer;
  preBuiltCad?: ImportedCadModel | null;
}): Promise<{ ragDoc: RagSourceDocument; importedCad: ImportedCadModel | null }> {
  const lower = params.title.toLowerCase();
  let preBuiltCad = params.preBuiltCad ?? null;

  if (!preBuiltCad) {
    try {
      if ((lower.endsWith('.step') || lower.endsWith('.stp')) && (params.buffer || params.extractedText)) {
        preBuiltCad = await parseSTEPAsync(
          params.buffer ?? params.extractedText!,
          params.title,
          'STEP'
        );
      } else if (lower.endsWith('.ipt') && params.buffer) {
        preBuiltCad = await parseIPTAsync(params.buffer, params.title);
      }
    } catch {
      // Fall back gracefully to text RAG indexing if binary CAD cannot be tessellated
    }
  }

  return tryBuildCadAndRagDoc({ ...params, preBuiltCad });
}

