import React, { useState } from 'react';
import { Box, Download, Eye, FileCode2, FolderOpen, Layers, Trash2 } from 'lucide-react';
import {
  SAMPLE_CAD_FILES,
  buildIsolatedEvaluatedMesh,
  exportAsciiDXF,
  exportBinarySTL,
  exportOpenNurbs3DM,
  parse3DM,
  parseDXF,
  parseOBJ,
  parseSTEPorIFC,
  parseSTL,
  triggerBlobDownload,
} from '../kernel/cadFormats';
import type {
  EvaluatedMesh,
  ImportedCadModel,
  NurbsSurfaceData,
  ToolpathResult,
} from '../types/cad';

interface CadFilesPanelProps {
  surface: NurbsSurfaceData;
  meshData: EvaluatedMesh;
  toolpath: ToolpathResult;
  importedModel: ImportedCadModel | null;
  isolationTarget: string;
  showImportedOverlay: boolean;
  onSetImportedModel: (model: ImportedCadModel | null) => void;
  onToggleImportedOverlay: () => void;
  onOpenViewport: () => void;
}

export const CadFilesPanel: React.FC<CadFilesPanelProps> = ({
  surface,
  meshData,
  toolpath,
  importedModel,
  isolationTarget,
  showImportedOverlay,
  onSetImportedModel,
  onToggleImportedOverlay,
  onOpenViewport,
}) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [exportIsolatedOnly, setExportIsolatedOnly] = useState<boolean>(
    isolationTarget !== 'all'
  );

  const handleFileImport = async (file: File) => {
    setErrorMsg(null);
    setStatusMsg(null);
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    try {
      if (ext === 'stl') {
        const buf = await file.arrayBuffer();
        const model = parseSTL(buf, file.name);
        onSetImportedModel(model);
        setStatusMsg(model.notes);
      } else if (ext === 'obj') {
        const text = await file.text();
        const model = parseOBJ(text, file.name);
        onSetImportedModel(model);
        setStatusMsg(model.notes);
      } else if (ext === 'dxf') {
        const text = await file.text();
        const model = parseDXF(text, file.name);
        onSetImportedModel(model);
        setStatusMsg(model.notes);
      } else if (ext === '3dm') {
        const buf = await file.arrayBuffer();
        const model = parse3DM(buf, file.name);
        onSetImportedModel(model);
        setStatusMsg(model.notes);
      } else if (ext === 'step' || ext === 'stp' || ext === 'ifc') {
        const text = await file.text();
        const model = parseSTEPorIFC(text, file.name, ext === 'ifc' ? 'IFC' : 'STEP');
        onSetImportedModel(model);
        setStatusMsg(model.notes);
      } else {
        setErrorMsg(`Extensão .${ext} não suportada. Utilize STL, OBJ, DXF, 3DM, STEP ou IFC.`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao analisar o arquivo CAD.');
    }
  };

  const handleLoadSample = (sample: (typeof SAMPLE_CAD_FILES)[number]) => {
    setErrorMsg(null);
    if (sample.format === 'DXF') {
      const m = parseDXF(sample.content, sample.filename);
      onSetImportedModel(m);
      setStatusMsg(m.notes);
    } else if (sample.format === 'OBJ') {
      const m = parseOBJ(sample.content, sample.filename);
      onSetImportedModel(m);
      setStatusMsg(m.notes);
    } else {
      const m = parseSTEPorIFC(sample.content, sample.filename, sample.format);
      onSetImportedModel(m);
      setStatusMsg(m.notes);
    }
  };

  const handleExport = (fmt: 'stl' | 'dxf' | '3dm') => {
    const useIsolated = exportIsolatedOnly && isolationTarget !== 'all';
    const { evaluated, partLabel } = buildIsolatedEvaluatedMesh(
      meshData,
      useIsolated ? isolationTarget : 'all',
      importedModel
    );
    const baseName = `${surface.id.replace(/[^a-z0-9-_]/gi, '_')}${
      useIsolated ? `_${partLabel}` : ''
    }`;
    if (fmt === 'stl') {
      triggerBlobDownload(exportBinarySTL(evaluated, surface.name), `${baseName}.stl`);
      setStatusMsg(
        `Arquivo ${baseName}.stl (Binário · ${evaluated.triangleCount} triângulos) exportado.`
      );
    } else if (fmt === 'dxf') {
      triggerBlobDownload(
        exportAsciiDXF(evaluated, evaluated.isocurves, useIsolated ? undefined : toolpath.points),
        `${baseName}.dxf`
      );
      setStatusMsg(`Arquivo ${baseName}.dxf (AutoCAD R2000) exportado.`);
    } else {
      triggerBlobDownload(exportOpenNurbs3DM(surface, evaluated), `${baseName}.3dm`);
      setStatusMsg(`Arquivo ${baseName}.3dm (OpenNURBS Rhino v7) exportado.`);
    }
  };

  return (
    <div className="w-full h-full overflow-y-auto bg-[#0b0e14] p-6 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100">
            Interoperabilidade CAD & Exportação Industrial
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Importe referências externas (.STL, .OBJ, .DXF, .3DM, .STEP, .IFC) para abrir automaticamente o Editor 3D GrabCAD com Object Mask e cálculo estrutural.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Import Zone */}
          <div className="p-6 bg-[#111620] border border-white/10 rounded-xl space-y-5">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-sky-400" />
              <h3 className="font-display text-sm font-semibold text-slate-100">
                Importar Arquivo CAD Externo
              </h3>
            </div>

            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) void handleFileImport(file);
              }}
              className="flex flex-col items-center justify-center p-8 border border-dashed border-sky-400/35 rounded-xl bg-[#0c1017] hover:border-sky-400/70 transition-colors cursor-pointer text-center"
            >
              <span className="text-sm font-medium text-slate-200">
                Arraste um arquivo CAD ou clique para selecionar
              </span>
              <span className="text-xs text-slate-400 mt-1">
                Suporte nativo: .STL (Binário/ASCII) · .OBJ · .DXF · .3DM · .STEP · .IFC
              </span>
              <input
                type="file"
                accept=".stl,.obj,.dxf,.3dm,.step,.stp,.ifc"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFileImport(file);
                  e.target.value = '';
                }}
                className="hidden"
              />
            </label>

            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-400">
                Carregar Exemplos Prontos para Teste
              </div>
              <div className="flex flex-wrap gap-2">
                {SAMPLE_CAD_FILES.map((s) => (
                  <button
                    key={s.filename}
                    type="button"
                    onClick={() => handleLoadSample(s)}
                    className="px-3 py-1.5 text-xs bg-[#0c1017] border border-white/10 hover:border-sky-400/50 text-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300">
                {errorMsg}
              </div>
            )}
            {statusMsg && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300">
                {statusMsg}
              </div>
            )}
          </div>

          {/* Export Zone */}
          <div className="p-6 bg-[#111620] border border-white/10 rounded-xl space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-amber-400" />
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  Exportar Modelo Paramétrico Atual
                </h3>
              </div>
              {isolationTarget !== 'all' && (
                <label className="flex items-center gap-2 text-xs text-amber-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportIsolatedOnly}
                    onChange={(e) => setExportIsolatedOnly(e.target.checked)}
                    className="accent-amber-400"
                  />
                  Apenas peça isolada ({isolationTarget})
                </label>
              )}
            </div>

            <div className="space-y-3">
              <ExportCard
                title="Rhino OpenNURBS (.3DM)"
                desc="Arquivo binário OpenNURBS v7 contendo malha tesselada e rede completa de pontos de controle racionais NURBS."
                actionLabel="Exportar .3DM"
                onClick={() => handleExport('3dm')}
              />
              <ExportCard
                title="Malha Sólida Binária (.STL)"
                desc="STL binário estanque com normais recalculadas, pronto para fatiadores 3D (Cura, PrusaSlicer) e CAM."
                actionLabel="Exportar .STL"
                onClick={() => handleExport('stl')}
              />
              <ExportCard
                title="AutoCAD Intercâmbio (.DXF)"
                desc="DXF ASCII R2000 em milímetros com camadas separadas: NURBS_SURFACE (3DFACE), ISOCURVES e CAM_TOOLPATH."
                actionLabel="Exportar .DXF"
                onClick={() => handleExport('dxf')}
              />
            </div>
          </div>
        </div>

        {/* Active Imported Model Inspector */}
        {importedModel && (
          <div className="p-6 bg-[#111620] border border-white/10 rounded-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <FileCode2 className="w-4 h-4 text-sky-400" />
                <div>
                  <h3 className="font-display text-sm font-semibold text-slate-100">
                    Referência Importada: {importedModel.filename}
                  </h3>
                  <p className="text-xs text-slate-400">{importedModel.notes}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenViewport}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-sky-500 text-slate-950 rounded-lg hover:bg-sky-400 cursor-pointer"
                >
                  <Box className="w-3.5 h-3.5" />
                  Abrir no Editor 3D GrabCAD
                </button>
                <button
                  type="button"
                  onClick={onToggleImportedOverlay}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer ${
                    showImportedOverlay
                      ? 'border-sky-400/50 bg-sky-500/15 text-sky-300'
                      : 'border-white/10 text-slate-300'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  {showImportedOverlay ? 'Visível no 3D' : 'Oculto no 3D'}
                </button>
                <button
                  type="button"
                  onClick={() => onSetImportedModel(null)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-rose-300 border border-rose-500/30 rounded-lg hover:bg-rose-500/10 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remover
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-white/8 text-xs">
              <div>
                <div className="text-slate-500">Formato</div>
                <div className="font-mono-tabular text-slate-100 mt-0.5">
                  {importedModel.format}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Componentes / Triângulos</div>
                <div className="font-mono-tabular text-slate-100 mt-0.5">
                  {importedModel.components?.length ?? 1} / {importedModel.triangleCount}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Envelope (mm)</div>
                <div className="font-mono-tabular text-slate-100 mt-0.5">
                  {importedModel.boundingBox.size[0].toFixed(1)} ×{' '}
                  {importedModel.boundingBox.size[2].toFixed(1)} ×{' '}
                  {importedModel.boundingBox.size[1].toFixed(1)}
                </div>
              </div>
              <div>
                <div className="text-slate-500 flex items-center gap-1">
                  <Layers className="w-3 h-3" /> Camadas
                </div>
                <div className="font-mono-tabular text-slate-200 mt-0.5 truncate">
                  {importedModel.layers.slice(0, 4).join(', ')}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface ExportCardProps {
  title: string;
  desc: string;
  actionLabel: string;
  onClick: () => void;
}

const ExportCard: React.FC<ExportCardProps> = ({ title, desc, actionLabel, onClick }) => (
  <div className="flex items-center justify-between gap-4 p-4 bg-[#0c1017] border border-white/8 rounded-xl">
    <div className="space-y-0.5">
      <div className="text-xs font-semibold text-slate-100">{title}</div>
      <p className="text-[11px] text-slate-400 leading-relaxed">{desc}</p>
    </div>
    <button
      type="button"
      onClick={onClick}
      className="px-3.5 py-2 text-xs font-medium bg-sky-500 text-slate-950 rounded-lg hover:bg-sky-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
    >
      {actionLabel}
    </button>
  </div>
);
