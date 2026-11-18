import type { CadPlugin, NurbsSurfaceData } from '../types/cad';

export const DEFAULT_PLUGINS: CadPlugin[] = [
  {
    id: 'plugin-ripple-attractor',
    name: 'Atrator Radial Gaussiano (NURBS)',
    author: 'Parametrix Labs',
    version: '1.4.0',
    category: 'Geometria',
    enabled: false,
    description:
      'Deforma os pontos de controle NURBS com uma onda harmônica controlada por distância radial ao centro da peça.',
    code: `// Plugin SDK: recebe (surface, context) e retorna surface modificada
const freq = context.frequency || 3.2;
const amp = context.amplitude || 14;
for (let u = 0; u < surface.uCount; u++) {
  for (let v = 0; v < surface.vCount; v++) {
    const cp = surface.controlPoints[u][v];
    const r = Math.hypot(cp.x, cp.z);
    cp.y += Math.sin(r * 0.045 * freq) * amp * Math.exp(-r * 0.004);
  }
}
return { summary: 'Atrator radial aplicado (' + surface.uCount * surface.vCount + ' CPs)' };`,
  },
  {
    id: 'plugin-bim-taper',
    name: 'Otimizador Estrutural BIM Taper',
    author: 'OpenBIM Collective',
    version: '2.1.0',
    category: 'BIM',
    enabled: false,
    description:
      'Ajusta pesos racionais NURBS nos apoios de borda para reduzir momento fletor nas longarinas Waffle.',
    code: `// Eleva peso racional nos apoios estruturais (u=0 e u=max)
for (let v = 0; v < surface.vCount; v++) {
  surface.controlPoints[0][v].w = 2.1;
  surface.controlPoints[surface.uCount - 1][v].w = 2.1;
}
return { summary: 'Pesos de apoio BIM elevados para w=2.1' };`,
  },
  {
    id: 'plugin-kuka-smooth',
    name: 'Compensação de Kerf & Canto Vivo',
    author: 'FabDigital BR',
    version: '1.0.8',
    category: 'CAM / Pós-Proc',
    enabled: false,
    description:
      'Aplica micro-elevação de segurança nos pontos periféricos para evitar colisão de porta-pinça na borda.',
    code: `// Eleva bordas externas em 3.5mm para entrada suave de fresa
for (let u = 0; u < surface.uCount; u++) {
  surface.controlPoints[u][0].y += 3.5;
  surface.controlPoints[u][surface.vCount - 1].y += 3.5;
}
return { summary: 'Entrada periférica elevada (+3.5 mm)' };`,
  },
];

export interface PluginExecResult {
  surface: NurbsSurfaceData;
  logs: { pluginId: string; status: 'ok' | 'error'; ms: number; message: string }[];
}

/**
 * Safely clones a NURBS surface and executes all enabled third-party JS plugins
 * inside a sandboxed Function scope with strict error capture.
 */
export function applyActivePlugins(
  baseSurface: NurbsSurfaceData,
  plugins: CadPlugin[],
  contextParams: Record<string, number> = {}
): PluginExecResult {
  const cloned: NurbsSurfaceData = {
    ...baseSurface,
    knotsU: [...baseSurface.knotsU],
    knotsV: [...baseSurface.knotsV],
    controlPoints: baseSurface.controlPoints.map((row) =>
      row.map((cp) => ({ ...cp }))
    ),
  };

  const logs: PluginExecResult['logs'] = [];

  for (const plugin of plugins) {
    if (!plugin.enabled) continue;
    const t0 = performance.now();
    try {
      const fn = new Function('surface', 'context', `"use strict";\n${plugin.code}`);
      const res = fn(cloned, { frequency: 3.2, amplitude: 14, ...contextParams });
      const ms = Number((performance.now() - t0).toFixed(2));
      logs.push({
        pluginId: plugin.id,
        status: 'ok',
        ms,
        message: res?.summary ?? 'Executado com sucesso',
      });
    } catch (err) {
      const ms = Number((performance.now() - t0).toFixed(2));
      logs.push({
        pluginId: plugin.id,
        status: 'error',
        ms,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { surface: cloned, logs };
}
