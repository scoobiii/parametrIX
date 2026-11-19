import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  convertImageToCadModel,
  inferImageMimeType,
  isRasterImageFilename,
} from '../src/kernel/imageToCad';

describe('imageToCad kernel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('detects raster image filenames and mime types cleanly', () => {
    expect(isRasterImageFilename('peca.PNG')).toBe(true);
    expect(isRasterImageFilename('foto.jpg')).toBe(true);
    expect(isRasterImageFilename('render.jpeg')).toBe(true);
    expect(isRasterImageFilename('preview.webp')).toBe(true);
    expect(isRasterImageFilename('blob', 'image/webp')).toBe(true);
    expect(isRasterImageFilename('modelo.stp', 'application/step')).toBe(false);

    expect(inferImageMimeType('a.bin', 'image/webp')).toBe('image/webp');
    expect(inferImageMimeType('a.bin', 'image/jpeg')).toBe('image/jpeg');
    expect(inferImageMimeType('a.bin', 'image/jpg')).toBe('image/jpeg');
    expect(inferImageMimeType('a.bin', 'image/png')).toBe('image/png');
    expect(inferImageMimeType('a.webp')).toBe('image/webp');
    expect(inferImageMimeType('a.jpg')).toBe('image/jpeg');
    expect(inferImageMimeType('a.jpeg')).toBe('image/jpeg');
    expect(inferImageMimeType('a.unknown')).toBe('image/png');
  });

  it('converts small transparent PNG and large dark-background JPEG into faithful CAD models and handles canvas/image/fetch errors', async () => {
    // Mock URL.createObjectURL / revokeObjectURL
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });

    // Helper to stub Image + document.createElement('canvas')
    const setupCanvasAndImage = (opts: {
      naturalWidth: number;
      naturalHeight: number;
      width?: number;
      height?: number;
      hasCtx?: boolean;
      hasUpCtx?: boolean;
      transparentCorners?: boolean;
      darkBg?: boolean;
      failImage?: boolean;
    }) => {
      class MockImage {
        naturalWidth = opts.naturalWidth;
        naturalHeight = opts.naturalHeight;
        width = opts.width ?? opts.naturalWidth;
        height = opts.height ?? opts.naturalHeight;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_v: string) {
          queueMicrotask(() => {
            if (opts.failImage) this.onerror?.();
            else this.onload?.();
          });
        }
      }
      vi.stubGlobal('Image', MockImage);

      let canvasCall = 0;
      vi.stubGlobal('document', {
        createElement: vi.fn(() => {
          canvasCall++;
          if (canvasCall === 1) {
            return {
              width: 0,
              height: 0,
              getContext: () =>
                opts.hasCtx === false
                  ? null
                  : {
                      drawImage: vi.fn(),
                      getImageData: (_x: number, _y: number, w: number, h: number) => {
                        const data = new Uint8ClampedArray(w * h * 4);
                        for (let i = 0; i < w * h; i++) {
                          const p = i * 4;
                          const isCenter = i > w * 2 && i < w * (h - 2);
                          if (opts.transparentCorners) {
                            data[p] = isCenter ? 120 : 255;
                            data[p + 1] = isCenter ? 130 : 255;
                            data[p + 2] = isCenter ? 140 : 255;
                            data[p + 3] = isCenter ? 255 : 0;
                          } else if (opts.darkBg) {
                            data[p] = isCenter ? 220 : 10;
                            data[p + 1] = isCenter ? 220 : 10;
                            data[p + 2] = isCenter ? 220 : 10;
                            data[p + 3] = 255;
                          } else {
                            data[p] = isCenter ? 20 : 240;
                            data[p + 1] = isCenter ? 20 : 240;
                            data[p + 2] = isCenter ? 20 : 240;
                            data[p + 3] = 255;
                          }
                        }
                        return { data };
                      },
                    },
            };
          }
          return {
            width: 0,
            height: 0,
            getContext: () =>
              opts.hasUpCtx === false
                ? null
                : {
                    drawImage: vi.fn(),
                  },
            toDataURL: () => 'data:image/png;base64,AAAA',
          };
        }),
      });
    };

    const blueprint = {
      partName: 'Suporte CNC',
      manufacturer: 'Parametrix',
      modelCode: 'SUP-01',
      segment: 'industrial-cnc',
      primaryMaterial: 'aluminum',
      intendedUse: 'Montagem',
      specifications: ['Al 6061-T6'],
      certifications: ['ISO 2768-mK'],
      recommendedLoadN: 2000,
      minSafetyFactor: 2,
      maxDeflectionMm: 1.5,
      criticalInspectionNote: 'OK',
      constructionMode: 'assembly',
      overallDimensionsMm: { width: 120, height: 60, depth: 30 },
      components: [
        {
          name: 'Base',
          shape: 'box',
          centerMm: [0, 10, 0],
          sizeMm: [100, 20, 30],
          material: 'aluminum',
        },
      ],
    };

    // 1. Small transparent wide PNG (uses ArrayBuffer fallback uploadBase64)
    setupCanvasAndImage({ naturalWidth: 400, naturalHeight: 200, transparentCorners: true });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ blueprint }),
      }))
    );
    const smallBuf = new Uint8Array([1, 2, 3, 4]).buffer;
    const res1 = await convertImageToCadModel({
      filename: 'suporte.png',
      blobOrBuffer: smallBuf,
    });
    expect(res1.model.triangleCount).toBeGreaterThan(0);
    expect(res1.ragTextSummary).toContain('Suporte CNC');

    // 2. Oversized tall JPEG with dark background (triggers resize branch + jpeg dataUrl + non-transparent dark bg)
    setupCanvasAndImage({ naturalWidth: 0, naturalHeight: 0, width: 800, height: 1600, darkBg: true });
    const blobJpg = new Blob([new Uint8Array([5, 6, 7])], { type: 'image/jpeg' });
    const res2 = await convertImageToCadModel({
      filename: 'tall.jpg',
      mimeType: 'image/jpeg',
      blobOrBuffer: blobJpg,
    });
    expect(res2.model.filename).toBe('tall.jpg');

    // 3. Large light-background PNG where resize canvas returns empty context & empty specs/certs/components
    setupCanvasAndImage({ naturalWidth: 1600, naturalHeight: 1600, hasUpCtx: false, darkBg: false });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          blueprint: {
            ...blueprint,
            specifications: undefined,
            certifications: undefined,
            components: [],
          },
        }),
      }))
    );
    const res3 = await convertImageToCadModel({
      filename: 'square.png',
      mimeType: 'image/png',
      blobOrBuffer: new Blob([new Uint8Array([8, 9])]),
    });
    expect(res3.model.filename).toBe('square.png');
    expect(res3.ragTextSummary).toContain('Sub-componentes 3D (0)');

    // 4. Resize PNG where toDataURL has no comma (empty split[1] triggers blob arrayBuffer fallback)
    setupCanvasAndImage({ naturalWidth: 1500, naturalHeight: 1500 });
    const origCreate = document.createElement;
    let callIdx = 0;
    vi.stubGlobal('document', {
      createElement: () => {
        callIdx++;
        const el = (origCreate as unknown as () => Record<string, unknown>)();
        if (callIdx === 2) {
          el.toDataURL = () => 'invalid';
        }
        return el;
      },
    });
    const res4 = await convertImageToCadModel({
      filename: 'emptydataurl.png',
      mimeType: 'image/png',
      blobOrBuffer: new Blob([new Uint8Array([1])]),
    });
    expect(res4.model.filename).toBe('emptydataurl.png');

    // 5. HTTP error with JSON message and without JSON message
    setupCanvasAndImage({ naturalWidth: 200, naturalHeight: 200 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 422,
        json: async () => ({ error: 'Imagem inválida' }),
      }))
    );
    await expect(
      convertImageToCadModel({ filename: 'bad.png', blobOrBuffer: new Uint8Array([1]).buffer })
    ).rejects.toThrow('Imagem inválida');

    setupCanvasAndImage({ naturalWidth: 200, naturalHeight: 200 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('bad json');
        },
      }))
    );
    await expect(
      convertImageToCadModel({ filename: 'bad2.png', blobOrBuffer: new Uint8Array([1]).buffer })
    ).rejects.toThrow('(500)');

    // 6. Missing 2D canvas context
    setupCanvasAndImage({ naturalWidth: 100, naturalHeight: 100, hasCtx: false });
    await expect(
      convertImageToCadModel({ filename: 'noctx.png', blobOrBuffer: new Uint8Array([1]).buffer })
    ).rejects.toThrow('Contexto 2D indisponível');

    // 7. Image decode error
    setupCanvasAndImage({ naturalWidth: 100, naturalHeight: 100, failImage: true });
    await expect(
      convertImageToCadModel({ filename: 'corrupt.png', blobOrBuffer: new Uint8Array([1]).buffer })
    ).rejects.toThrow('Não foi possível decodificar');
  });
});
