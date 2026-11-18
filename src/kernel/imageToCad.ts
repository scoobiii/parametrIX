import {
  buildCadModelFromVisionAndPixels,
  type PixelReliefGrid,
  type VisionCadBlueprint,
} from './cadFormats';
import type { ImportedCadModel } from '../types/cad';

export function isRasterImageFilename(filename: string, mimeType = ''): boolean {
  const lower = filename.toLowerCase();
  if (/\.(png|jpg|jpeg|webp)$/i.test(lower)) return true;
  return /^image\/(png|jpeg|jpg|webp)$/i.test(mimeType.toLowerCase());
}

export function inferImageMimeType(filename: string, providedMime = ''): string {
  const lowerMime = providedMime.toLowerCase();
  if (lowerMime.includes('webp')) return 'image/webp';
  if (lowerMime.includes('jpeg') || lowerMime.includes('jpg')) return 'image/jpeg';
  if (lowerMime.includes('png')) return 'image/png';

  const lower = filename.toLowerCase();
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/png';
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(parts.join(''));
}

async function decodeImageElement(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Não foi possível decodificar a imagem para análise CAD.'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function extractPixelReliefAndOptimizedBase64(
  blob: Blob,
  mimeType: string
): Promise<{
  reliefGrid: PixelReliefGrid;
  uploadMimeType: string;
  uploadBase64: string;
}> {
  const img = await decodeImageElement(blob);
  const natW = Math.max(1, img.naturalWidth || img.width);
  const natH = Math.max(1, img.naturalHeight || img.height);
  const aspectRatio = natW / natH;

  // 1. Sample a compact <= 72x72 relief/contour grid for deterministic pixel-faithful geometry
  const maxGrid = 72;
  const cols = aspectRatio >= 1 ? maxGrid : Math.max(20, Math.round(maxGrid * aspectRatio));
  const rows = aspectRatio >= 1 ? Math.max(20, Math.round(maxGrid / aspectRatio)) : maxGrid;

  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = cols;
  sampleCanvas.height = rows;
  const sCtx = sampleCanvas.getContext('2d');
  if (!sCtx) {
    throw new Error('Contexto 2D indisponível para amostragem da imagem.');
  }
  sCtx.drawImage(img, 0, 0, cols, rows);
  const imgData = sCtx.getImageData(0, 0, cols, rows).data;

  // Estimate background color from image corners
  const cornerCoords = [
    0,
    (cols - 1) * 4,
    ((rows - 1) * cols) * 4,
    ((rows - 1) * cols + (cols - 1)) * 4,
  ];
  let bgR = 0, bgG = 0, bgB = 0, bgAlphaSum = 0;
  for (const offset of cornerCoords) {
    bgR += imgData[offset];
    bgG += imgData[offset + 1];
    bgB += imgData[offset + 2];
    bgAlphaSum += imgData[offset + 3];
  }
  bgR /= 4;
  bgG /= 4;
  bgB /= 4;
  const hasTransparentBg = bgAlphaSum / 4 < 40;

  const depths = new Float32Array(cols * rows);
  const foregroundMask = new Uint8Array(cols * rows);
  let fgCount = 0;

  for (let i = 0; i < cols * rows; i++) {
    const p = i * 4;
    const r = imgData[p];
    const g = imgData[p + 1];
    const b = imgData[p + 2];
    const a = imgData[p + 3];
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    if (hasTransparentBg) {
      const isFg = a > 36;
      foregroundMask[i] = isFg ? 1 : 0;
      depths[i] = isFg ? 0.25 + (1 - lum * 0.5) * 0.75 : 0;
      if (isFg) fgCount++;
    } else {
      const colorDist = Math.hypot(r - bgR, g - bgG, b - bgB);
      const isFg = a > 36 && colorDist > 26;
      foregroundMask[i] = isFg ? 1 : 0;
      const bgLum = (0.299 * bgR + 0.587 * bgG + 0.114 * bgB) / 255;
      // Higher contrast relative to background = slightly stronger structural relief
      const contrast = Math.min(1, colorDist / 190);
      depths[i] = isFg
        ? Math.max(0.2, Math.min(1, bgLum > 0.5 ? 1 - lum * 0.65 : contrast))
        : 0;
      if (isFg) fgCount++;
    }
  }

  const coveragePct = (fgCount / Math.max(1, cols * rows)) * 100;

  // 2. Prepare resized upload image (<= 1280px max edge) so Vision payload is fast & crisp
  const maxEdge = 1280;
  let uploadMimeType = mimeType;
  let uploadBase64 = '';
  if (natW > maxEdge || natH > maxEdge || blob.size > 2_500_000) {
    const scale = Math.min(1, maxEdge / Math.max(natW, natH));
    const upCanvas = document.createElement('canvas');
    upCanvas.width = Math.max(1, Math.round(natW * scale));
    upCanvas.height = Math.max(1, Math.round(natH * scale));
    const uCtx = upCanvas.getContext('2d');
    if (uCtx) {
      uCtx.drawImage(img, 0, 0, upCanvas.width, upCanvas.height);
      const targetMime = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
      const dataUrl = upCanvas.toDataURL(targetMime, 0.88);
      uploadMimeType = targetMime;
      uploadBase64 = dataUrl.split(',')[1] || '';
    }
  }

  if (!uploadBase64) {
    const ab = await blob.arrayBuffer();
    uploadBase64 = arrayBufferToBase64(ab);
  }

  return {
    reliefGrid: {
      cols,
      rows,
      depths,
      foregroundMask,
      aspectRatio,
      coveragePct,
    },
    uploadMimeType,
    uploadBase64,
  };
}

/**
 * Converts a raster image (.PNG, .JPG, .JPEG, .WEBP) into a faithful 3D CAD project
 * by combining Gemini Vision reverse-engineering (/api/image-to-cad) and canvas pixel contour relief.
 */
export async function convertImageToCadModel(params: {
  filename: string;
  mimeType?: string;
  blobOrBuffer: Blob | ArrayBuffer;
}): Promise<{ model: ImportedCadModel; ragTextSummary: string }> {
  const mimeType = inferImageMimeType(params.filename, params.mimeType);
  const blob =
    params.blobOrBuffer instanceof Blob
      ? params.blobOrBuffer
      : new Blob([params.blobOrBuffer], { type: mimeType });

  const { reliefGrid, uploadMimeType, uploadBase64 } =
    await extractPixelReliefAndOptimizedBase64(blob, mimeType);

  const resp = await fetch('/api/image-to-cad', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: params.filename,
      mimeType: uploadMimeType,
      base64Data: uploadBase64,
      aspectRatio: reliefGrid.aspectRatio,
      coveragePct: reliefGrid.coveragePct,
    }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : `Falha ao converter imagem em projeto CAD (${resp.status}).`
    );
  }

  const blueprint = data.blueprint as VisionCadBlueprint;
  const model = buildCadModelFromVisionAndPixels({
    filename: params.filename,
    blueprint,
    reliefGrid,
  });

  const ragTextSummary = [
    `Projeto CAD 3D reconstruído de imagem: ${params.filename} (${uploadMimeType})`,
    `Peça / Conjunto: ${blueprint.partName} · Fabricante: ${blueprint.manufacturer} · Modelo: ${blueprint.modelCode}`,
    `Segmento: ${blueprint.segment} · Material primário: ${blueprint.primaryMaterial}`,
    `Uso pretendido: ${blueprint.intendedUse}`,
    `Dimensões estimadas (mm): ${blueprint.overallDimensionsMm.width} x ${blueprint.overallDimensionsMm.height} x ${blueprint.overallDimensionsMm.depth}`,
    `Especificações:\n- ${(blueprint.specifications || []).join('\n- ')}`,
    `Certificações aplicáveis:\n- ${(blueprint.certifications || []).join('\n- ')}`,
    `Critério FEA: Carga recomendada ${blueprint.recommendedLoadN} N · SF mínimo ${blueprint.minSafetyFactor} · Flecha máx ${blueprint.maxDeflectionMm} mm`,
    `Sub-componentes 3D (${model.components?.length ?? 0}): ${(model.components || []).map((c) => `${c.name} [${c.family} / ${c.inferredMaterial}]`).join('; ')}`,
  ].join('\n');

  return { model, ragTextSummary };
}
