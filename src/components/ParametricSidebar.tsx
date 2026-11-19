import React, { useState } from 'react';
import {
  Activity,
  Award,
  Box,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Focus,
  Layers,
  RotateCcw,
  Ruler,
  ShieldAlert,
  ShieldCheck,
  Sigma,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { SEGMENT_CATALOG } from '../kernel/componentClassifier';
import { ISO_2768_CLASS_DEFAULTS } from '../kernel/layerTolerances';
import type { OptimizationObjective } from '../kernel/structuralFea';
import type {
  ApplicationSegment,
  BimElement,
  CadComponentPart,
  CadFeatureOperation,
  ControlPoint4D,
  CurvatureOptimizationReport,
  FeaComparisonReport,
  FeaLoadPattern,
  FeaResult,
  FeaSettings,
  FeaSupportMode,
  LayerToleranceClass,
  LayerToleranceComplianceReport,
  LayerToleranceSpec,
  MaterialFinish,
  NurbsSurfaceData,
  ParametricDesignParams,
  PartEngineeringProfile,
  PresetId,
  ScoobiiiVucProofReport,
  ViewportDisplayState,
} from '../types/cad';

interface ParametricSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  params: ParametricDesignParams;
  onChangeParams: (patch: Partial<ParametricDesignParams>) => void;
  surface: NurbsSurfaceData;
  bimElements: BimElement[];
  components: CadComponentPart[];
  partProfile: PartEngineeringProfile;
  activeSegment: ApplicationSegment;
  onChangeSegment: (seg: ApplicationSegment) => void;
  onApplyProfileCriteriaToFea: () => void;
  display: ViewportDisplayState;
  onUpdateDisplay: (patch: Partial<ViewportDisplayState>) => void;
  selectedControlPoint: { u: number; v: number } | null;
  onSelectControlPoint: (cp: { u: number; v: number } | null) => void;
  onUpdateControlPoint: (u: number, v: number, patch: Partial<ControlPoint4D>) => void;
  onResetControlPointOverrides: () => void;
  hasOverrides: boolean;
  hasImportedModel: boolean;
  feaSettings: FeaSettings;
  onChangeFeaSettings: (patch: Partial<FeaSettings>) => void;
  feaResult: FeaResult;
  feaComparison: FeaComparisonReport | null;
  onToggleHeatmap: () => void;
  onOptimizeGeometry: (objective: OptimizationObjective) => void;
  featureOps: CadFeatureOperation[];
  onRemoveFeatureOp: (id: string) => void;
  scoobiiiProof: ScoobiiiVucProofReport;
  onOpenScoobiiiModal: () => void;
  curvatureOptReport: CurvatureOptimizationReport;
  onApplyCurvatureOptimization: () => void;
  layerToleranceSpecs: LayerToleranceSpec[];
  onUpdateLayerTolerance: (layerName: string, patch: Partial<LayerToleranceSpec>) => void;
  layerComplianceReport: LayerToleranceComplianceReport;
  onRefineNurbsForTolerances: () => void;
}

const PRESET_OPTIONS: { id: PresetId; label: string; subtitle: string }[] = [
  { id: 'shell', label: 'Casca NURBS', subtitle: 'Dupla curvatura arquitetônica' },
  { id: 'impeller', label: 'Pá Helicoidal', subtitle: 'Perfil aerodinâmico torcido' },
  { id: 'cavity', label: 'Molde Cavidade', subtitle: 'Matriz CNC de precisão' },
  { id: 'diagrid', label: 'Abóbada BIM', subtitle: 'Cobertura treliçada estrutural' },
];

const MATERIAL_OPTIONS: { id: MaterialFinish; label: string }[] = [
  { id: 'aluminum', label: 'Alumínio 6061/7075' },
  { id: 'titanium', label: 'Titânio Ti-6Al-4V' },
  { id: 'carbon-fiber', label: 'Fibra de Carbono CFRP' },
  { id: 'matte-plastic', label: 'Polímero / Plástico Fosco' },
  { id: 'glass', label: 'Vidro Laminado' },
  { id: 'clay', label: 'Argila CAD' },
  { id: 'oak', label: 'Madeira Estrutural' },
];

export const ParametricSidebar: React.FC<ParametricSidebarProps> = ({
  collapsed,
  onToggleCollapse,
  params,
  onChangeParams,
  surface,
  bimElements,
  components,
  partProfile,
  activeSegment,
  onChangeSegment,
  onApplyProfileCriteriaToFea,
  display,
  onUpdateDisplay,
  selectedControlPoint,
  onSelectControlPoint,
  onUpdateControlPoint,
  onResetControlPointOverrides,
  hasOverrides,
  hasImportedModel,
  feaSettings,
  onChangeFeaSettings,
  feaResult,
  feaComparison,
  onToggleHeatmap,
  onOptimizeGeometry,
  featureOps,
  onRemoveFeatureOp,
  scoobiiiProof,
  onOpenScoobiiiModal,
  curvatureOptReport,
  onApplyCurvatureOptimization,
  layerToleranceSpecs,
  onUpdateLayerTolerance,
  layerComplianceReport,
  onRefineNurbsForTolerances,
}) => {
  const [expandedLayerName, setExpandedLayerName] = useState<string | null>(null);

  if (collapsed) {
    return (
      <div className="h-full border-r border-white/10 bg-[#111620] flex flex-col items-center py-3 px-1.5 shrink-0">
        <button
          type="button"
          onClick={onToggleCollapse}
          title="Expandir Inspetor IX, Componentes & FEA"
          className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const activeCp =
    selectedControlPoint &&
    surface.controlPoints[selectedControlPoint.u]?.[selectedControlPoint.v];

  const selectedComp =
    components.find((c) => c.id === display.selectedComponentId) ?? null;

  const statusColor =
    feaResult.status === 'seguro'
      ? 'text-emerald-400'
      : feaResult.status === 'alerta'
        ? 'text-amber-400'
        : 'text-rose-400';

  const toggleHideComponent = (compId: string) => {
    const exists = display.hiddenComponentIds.includes(compId);
    onUpdateDisplay({
      hiddenComponentIds: exists
        ? display.hiddenComponentIds.filter((x) => x !== compId)
        : [...display.hiddenComponentIds, compId],
    });
  };

  return (
    <>
      <div
        onClick={onToggleCollapse}
        aria-hidden="true"
        className="fixed inset-0 top-12 z-20 bg-black/60 md:hidden"
      />
      <aside className="fixed md:static inset-y-12 left-0 z-30 w-[86vw] max-w-[330px] md:w-[328px] h-[calc(100%-3rem)] md:h-full border-r border-white/10 bg-[#111620] flex flex-col shrink-0 overflow-hidden shadow-2xl md:shadow-none">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="font-display text-sm font-semibold text-slate-100">
            Inspetor IX, Contexto & FEA
          </h2>
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Recolher Painel"
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {/* Part Engineering Identity & Certification Context */}
        <section className="p-3 bg-[#0c1017] border border-sky-500/25 rounded-xl space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-sky-300">
              <Award className="w-3.5 h-3.5 shrink-0" />
              Identidade & Certificação da Peça
            </span>
          </div>

          <div className="space-y-1 text-[11px]">
            <div className="font-semibold text-slate-100 leading-snug">
              {partProfile.partName}
            </div>
            <div className="text-slate-400">
              Fabricante: <strong className="text-slate-200">{partProfile.manufacturer}</strong>
            </div>
            <div className="text-slate-400 font-mono-tabular">
              Modelo: <span className="text-slate-200">{partProfile.modelCode}</span>
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 mb-1">
              Segmento de Aplicação (Normas & MCP)
            </label>
            <select
              aria-label="Segmento de aplicação industrial"
              value={activeSegment}
              onChange={(e) => onChangeSegment(e.target.value as ApplicationSegment)}
              className="w-full px-2.5 py-1.5 text-[11px] bg-[#111620] border border-white/12 rounded-lg text-slate-100 focus:outline-none focus:border-sky-400"
            >
              {SEGMENT_CATALOG.map((seg) => (
                <option key={seg.id} value={seg.id}>
                  {seg.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1 text-[11px] pt-1 border-t border-white/8">
            <div className="text-[10px] font-medium text-emerald-300 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              Certificações & Normas
            </div>
            <ul className="space-y-0.5 text-[10px] text-slate-300 list-disc list-inside">
              {partProfile.certifications.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>

          <div className="space-y-1 text-[10px] text-slate-400 pt-1 border-t border-white/8">
            <div>
              <strong className="text-slate-200">Uso:</strong> {partProfile.intendedUse}
            </div>
            <div>
              <strong className="text-slate-200">Critério Segurança:</strong> SF ≥{' '}
              <span className="font-mono-tabular text-emerald-300">
                {partProfile.safetyCriteria.minSafetyFactor}
              </span>{' '}
              · δ ≤{' '}
              <span className="font-mono-tabular text-sky-300">
                {partProfile.safetyCriteria.maxDeflectionMm} mm
              </span>{' '}
              · Carga{' '}
              <span className="font-mono-tabular text-amber-300">
                {partProfile.safetyCriteria.recommendedLoadN} N
              </span>
            </div>
            <p className="text-amber-200/90 leading-snug">
              {partProfile.safetyCriteria.criticalInspectionNote}
            </p>
          </div>

          <button
            type="button"
            onClick={onApplyProfileCriteriaToFea}
            className="w-full py-1.5 text-[11px] font-medium bg-sky-500/15 border border-sky-400/40 text-sky-200 hover:bg-sky-500/25 rounded-lg cursor-pointer"
          >
            Sincronizar Carga & Critérios com FEA
          </button>
        </section>

        {/* IX Assembly Tree, Explode, Rotate, Object Mask & Per-Component Materials */}
        <section className="space-y-3 pt-2 border-t border-white/8">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
              <Box className="w-3.5 h-3.5 text-sky-400" />
              Componentes & Máscara ({components.length})
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  onUpdateDisplay({
                    mode: display.mode === 'object-mask' ? 'component-pbr' : 'object-mask',
                  })
                }
                className={`px-2 py-0.5 text-[10px] rounded border cursor-pointer ${
                  display.mode === 'object-mask'
                    ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                    : 'border-white/12 text-slate-300 hover:border-sky-400/50'
                }`}
              >
                {display.mode === 'object-mask' ? 'Ver PBR' : 'Máscara Obj'}
              </button>
            </div>
          </div>

          <SliderRow
            label="Vista Explodida"
            value={Math.round(display.explodeFactor * 100)}
            min={0}
            max={100}
            step={2}
            unit="%"
            onChange={(v) => onUpdateDisplay({ explodeFactor: v / 100 })}
          />

          <div className="p-2.5 bg-[#0c1017] border border-white/8 rounded-lg space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-300 font-medium">Rotação Global do Conjunto</span>
              <button
                type="button"
                onClick={() => onUpdateDisplay({ assemblyRotationDeg: [0, 0, 0] })}
                className="text-[10px] text-sky-300 hover:text-white cursor-pointer"
              >
                Zerar
              </button>
            </div>
            <SliderRow
              label="Rotação Y"
              value={display.assemblyRotationDeg[1]}
              min={-180}
              max={180}
              step={5}
              unit="°"
              onChange={(v) =>
                onUpdateDisplay({
                  assemblyRotationDeg: [
                    display.assemblyRotationDeg[0],
                    v,
                    display.assemblyRotationDeg[2],
                  ],
                })
              }
            />
          </div>

          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-0.5">
            {components.map((comp) => {
              const isSel = display.selectedComponentId === comp.id;
              const isHidden = display.hiddenComponentIds.includes(comp.id);
              const activeMat =
                display.componentMaterials[comp.id] ?? comp.inferredMaterial;
              return (
                <div
                  key={comp.id}
                  onClick={() => onUpdateDisplay({ selectedComponentId: comp.id })}
                  className={`p-2 rounded-lg border text-[11px] transition-colors cursor-pointer ${
                    isSel
                      ? 'border-sky-400/70 bg-sky-500/12'
                      : 'border-white/8 bg-[#0c1017] hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: comp.maskColorHex }}
                        title={`Máscara: ${comp.family}`}
                      />
                      <span className="font-medium text-slate-100 truncate">
                        {comp.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        title={isHidden ? 'Mostrar componente' : 'Ocultar componente'}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleHideComponent(comp.id);
                        }}
                        className="p-1 text-slate-400 hover:text-white cursor-pointer"
                      >
                        {isHidden ? (
                          <EyeOff className="w-3 h-3 text-rose-400" />
                        ) : (
                          <Eye className="w-3 h-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        title="Isolar componente"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateDisplay({
                            isolationTarget:
                              display.isolationTarget === comp.id ? 'all' : comp.id,
                            fitViewTrigger: display.fitViewTrigger + 1,
                          });
                        }}
                        className={`p-1 rounded cursor-pointer ${
                          display.isolationTarget === comp.id
                            ? 'text-amber-300 bg-amber-500/20'
                            : 'text-slate-400 hover:text-amber-300'
                        }`}
                      >
                        <Focus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400 mt-1">
                    <span className="truncate">{comp.subFamily}</span>
                    <span className="font-mono-tabular text-sky-300 shrink-0">
                      {MATERIAL_OPTIONS.find((m) => m.id === activeMat)?.label.split(' ')[0]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedComp && (
            <div className="p-3 bg-[#0c1017] border border-sky-400/40 rounded-lg space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-sky-300 truncate">{selectedComp.name}</span>
                <button
                  type="button"
                  onClick={() => onUpdateDisplay({ selectedComponentId: null })}
                  className="text-[11px] text-slate-400 hover:text-white cursor-pointer"
                >
                  Fechar
                </button>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">
                  Material PBR do Componente (Render Individual)
                </label>
                <select
                  aria-label="Material individual do componente"
                  value={
                    display.componentMaterials[selectedComp.id] ??
                    selectedComp.inferredMaterial
                  }
                  onChange={(e) =>
                    onUpdateDisplay({
                      mode: 'component-pbr',
                      perComponentPbr: true,
                      componentMaterials: {
                        ...display.componentMaterials,
                        [selectedComp.id]: e.target.value as MaterialFinish,
                      },
                    })
                  }
                  className="w-full px-2 py-1.5 text-[11px] bg-[#111620] border border-white/12 rounded-md text-slate-100"
                >
                  {MATERIAL_OPTIONS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <SliderRow
                label="Rotação Y Peça"
                value={(display.componentRotations[selectedComp.id] ?? [0, 0, 0])[1]}
                min={-180}
                max={180}
                step={5}
                unit="°"
                onChange={(v) => {
                  const cur = display.componentRotations[selectedComp.id] ?? [0, 0, 0];
                  onUpdateDisplay({
                    componentRotations: {
                      ...display.componentRotations,
                      [selectedComp.id]: [cur[0], v, cur[2]],
                    },
                  });
                }}
              />
            </div>
          )}
        </section>

        {/* Structural FEA & Generative Optimization */}
        <section className="space-y-3 pt-3 border-t border-white/8">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
              <Activity className="w-3.5 h-3.5 text-rose-400" />
              Resistência Estrutural FEA
            </span>
            <span className={`text-[11px] font-mono-tabular uppercase font-semibold ${statusColor}`}>
              SF {feaResult.safetyFactor} · {feaResult.status}
            </span>
          </div>

          {feaResult.complianceNote && (
            <div className="p-2 bg-[#0c1017] border border-white/10 rounded-lg text-[10px] text-slate-300 leading-snug">
              {feaResult.complianceNote}
            </div>
          )}

          <div className="grid grid-cols-2 gap-1.5 p-2.5 bg-[#0c1017] border border-white/8 rounded-lg text-[11px]">
            <div>
              <div className="text-slate-500">Von Mises Máx</div>
              <div className="font-mono-tabular font-semibold text-slate-100">
                {feaResult.maxStressMpa} MPa
              </div>
            </div>
            <div>
              <div className="text-slate-500">Deflexão Máx</div>
              <div className="font-mono-tabular font-semibold text-slate-100">
                {feaResult.maxDeflectionMm} mm
              </div>
            </div>
            <div>
              <div className="text-slate-500">Escoamento Mat.</div>
              <div className="font-mono-tabular text-slate-300">
                {feaResult.yieldStrengthMpa} MPa
              </div>
            </div>
            <div>
              <div className="text-slate-500">Massa Est.</div>
              <div className="font-mono-tabular text-slate-300">{feaResult.totalMassKg} kg</div>
            </div>
          </div>

          <SliderRow
            label="Carga Aplicada"
            value={feaSettings.loadNewtons}
            min={500}
            max={25000}
            step={250}
            unit="N"
            onChange={(v) => onChangeFeaSettings({ loadNewtons: v })}
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Apoio / Contorno</label>
              <select
                aria-label="Condição de apoio FEA"
                value={feaSettings.supportMode}
                onChange={(e) =>
                  onChangeFeaSettings({ supportMode: e.target.value as FeaSupportMode })
                }
                className="w-full px-2 py-1 text-[11px] bg-[#0c1017] border border-white/10 rounded-md text-slate-200"
              >
                <option value="edge-clamped">Engaste Borda</option>
                <option value="four-corner-pins">4 Pinos / Coroa</option>
                <option value="cantilever-u">Balanço U</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Carregamento</label>
              <select
                aria-label="Padrão de carga FEA"
                value={feaSettings.loadPattern}
                onChange={(e) =>
                  onChangeFeaSettings({ loadPattern: e.target.value as FeaLoadPattern })
                }
                className="w-full px-2 py-1 text-[11px] bg-[#0c1017] border border-white/10 rounded-md text-slate-200"
              >
                <option value="center-point">Carga Central</option>
                <option value="uniform-pressure">Pressão Uniforme</option>
                <option value="torsion-tip">Torção / Impacto</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleHeatmap}
            className={`w-full py-1.5 px-3 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
              display.mode === 'stress-heatmap'
                ? 'border-rose-400/70 bg-rose-500/15 text-rose-200'
                : 'border-white/12 bg-[#0c1017] text-slate-200 hover:border-rose-400/50'
            }`}
          >
            {display.mode === 'stress-heatmap'
              ? 'Mapa de Calor de Estresse Ativo'
              : 'Exibir Mapa de Calor de Estresse'}
          </button>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <Sparkles className="w-3 h-3 text-sky-400" />
              Gerar Nova Geometria (Antes vs Depois)
            </div>
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => onOptimizeGeometry('minimize-stress')}
                className="px-2 py-1.5 text-[10px] font-medium bg-sky-500/15 border border-sky-400/40 text-sky-200 hover:bg-sky-500/25 rounded-md cursor-pointer"
              >
                +Resistência
              </button>
              <button
                type="button"
                onClick={() => onOptimizeGeometry('minimize-mass')}
                className="px-2 py-1.5 text-[10px] font-medium bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/25 rounded-md cursor-pointer"
              >
                -Massa
              </button>
              <button
                type="button"
                onClick={() => onOptimizeGeometry('balanced')}
                className="px-2 py-1.5 text-[10px] font-medium bg-amber-500/15 border border-amber-400/40 text-amber-200 hover:bg-amber-500/25 rounded-md cursor-pointer"
              >
                Equilibrado
              </button>
            </div>
          </div>

          {feaComparison && (
            <div className="p-2.5 bg-[#0c1017] border border-sky-500/30 rounded-lg space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sky-300">Antes vs Depois</span>
                <span
                  className={`text-[10px] font-mono-tabular ${
                    feaComparison.certificationPassedAfter
                      ? 'text-emerald-400'
                      : 'text-amber-300'
                  }`}
                >
                  {feaComparison.certificationPassedAfter ? 'Norma OK' : 'Ajustar'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono-tabular">
                <span className="text-slate-400">Tensão Máx:</span>
                <span className="text-right text-slate-100">
                  {feaComparison.before.maxStressMpa} → {feaComparison.after.maxStressMpa} MPa
                </span>
                <span className="text-slate-400">Deflexão:</span>
                <span className="text-right text-slate-100">
                  {feaComparison.before.maxDeflectionMm} → {feaComparison.after.maxDeflectionMm} mm
                </span>
                <span className="text-slate-400">Segurança SF:</span>
                <span className="text-right text-emerald-300">
                  {feaComparison.before.safetyFactor} → {feaComparison.after.safetyFactor}
                </span>
              </div>
            </div>
          )}
        </section>

        {/* SCOOBIII / VUC Mathematical Proof & Magic Pen Operations */}
        <section className="space-y-2.5 pt-3 border-t border-white/8">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
              <Sigma className="w-3.5 h-3.5 text-sky-400" />
              Prova SCOOBIII / VUC & Features
            </span>
            <span
              className={`px-1.5 py-0.5 text-[10px] font-mono-tabular rounded border ${
                scoobiiiProof.allPassed
                  ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                  : 'border-amber-400/40 bg-amber-500/15 text-amber-300'
              }`}
            >
              {scoobiiiProof.allPassed ? 'APROVADO' : 'AJUSTAR'}
            </span>
          </div>

          <div className="p-2.5 bg-[#0c1017] border border-white/10 rounded-lg space-y-2 text-[11px]">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>Certificado:</span>
              <span className="font-mono-tabular text-sky-300">
                {scoobiiiProof.certificateId}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>Partição Cox-de Boor / Jₘᵢₙ:</span>
              <span className="font-mono-tabular text-emerald-300">
                {scoobiiiProof.nurbsProof.maxPartitionUnityResidual} ·{' '}
                {scoobiiiProof.nurbsProof.minJacobian}
              </span>
            </div>
            <button
              type="button"
              onClick={onOpenScoobiiiModal}
              className="w-full py-1.5 text-[11px] font-medium bg-sky-500/15 border border-sky-400/40 text-sky-200 hover:bg-sky-500/25 rounded-md cursor-pointer"
            >
              Abrir Certificado SCOOBIII / VUC
            </button>
          </div>

          {featureOps.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1 text-[10px] font-medium text-amber-300">
                <Wand2 className="w-3 h-3" />
                Operações Caneta Mágica ({featureOps.length})
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1 pr-0.5">
                {featureOps.map((op) => (
                  <div
                    key={op.id}
                    className="flex items-center justify-between gap-2 px-2 py-1.5 bg-[#0c1017] border border-white/8 rounded-md text-[10px]"
                  >
                    <div className="min-w-0">
                      <div className="text-slate-200 font-medium truncate">{op.label}</div>
                      <div className="text-slate-500 font-mono-tabular">
                        {op.targetComponentId} · {op.widthMm}×{op.lengthMm}×{op.depthMm}mm
                        {op.threadSpec ? ` · ${op.threadSpec}` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveFeatureOp(op.id)}
                      title="Remover operação paramétrica"
                      className="p-1 text-slate-400 hover:text-rose-400 shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* NURBS Curvature Analysis & Automatic Weight Optimization */}
        <section className="space-y-2.5 pt-3 border-t border-white/8">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              Curvatura NURBS & Otimização Peso
            </span>
            <span className="text-[10px] font-mono-tabular text-emerald-300">
              -{curvatureOptReport.weightReductionPct}% massa
            </span>
          </div>

          <div className="p-2.5 bg-[#0c1017] border border-emerald-500/25 rounded-lg space-y-2 text-[11px]">
            <div className="grid grid-cols-2 gap-1.5 font-mono-tabular text-[10px]">
              <div>
                <div className="text-slate-500">Gaussiana |K̄|</div>
                <div className="text-slate-200">{curvatureOptReport.meanGaussianK} mm⁻²</div>
              </div>
              <div>
                <div className="text-slate-500">Média |H̄| · Willmore</div>
                <div className="text-slate-200">
                  {curvatureOptReport.meanAbsH} · {curvatureOptReport.willmoreEnergy}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Peso Antes → Depois</div>
                <div className="text-emerald-300 font-semibold">
                  {curvatureOptReport.weightBeforeKg} → {curvatureOptReport.weightAfterKg} kg
                </div>
              </div>
              <div>
                <div className="text-slate-500">Segurança SF</div>
                <div className="text-sky-300 font-semibold">
                  {curvatureOptReport.safetyFactorBefore} → {curvatureOptReport.safetyFactorAfter}×
                </div>
              </div>
            </div>

            <div className="text-[10px] text-slate-400 leading-snug">
              {curvatureOptReport.engineeringRationale}
            </div>

            <button
              type="button"
              onClick={onApplyCurvatureOptimization}
              disabled={hasImportedModel}
              className="w-full py-1.5 text-[11px] font-semibold bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-45 rounded-md cursor-pointer"
            >
              {hasImportedModel
                ? 'Otimização NURBS (Disponível em Peça Paramétrica)'
                : `Aplicar Otimização de Peso (-${curvatureOptReport.weightReductionPct}%)`}
            </button>
          </div>
        </section>

        {/* Per-Layer GD&T Geometric Tolerances & Technical Norm Compliance */}
        <section className="space-y-2.5 pt-3 border-t border-white/8">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              Tolerâncias GD&T por Layer ({layerComplianceReport.passCount}/
              {layerComplianceReport.totalLayers})
            </span>
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-mono-tabular font-semibold ${
                layerComplianceReport.overallStatus === 'conforme'
                  ? 'text-emerald-400'
                  : layerComplianceReport.overallStatus === 'atencao'
                    ? 'text-amber-300'
                    : 'text-rose-400'
              }`}
            >
              {layerComplianceReport.overallStatus === 'conforme' ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : (
                <ShieldAlert className="w-3 h-3" />
              )}
              {layerComplianceReport.overallStatus.toUpperCase()}
            </span>
          </div>

          <div className="text-[10px] text-slate-400">
            Norma ativa:{' '}
            <span className="text-slate-200">
              {layerComplianceReport.activeStandards[0] ?? 'ISO 2768'}
            </span>{' '}
            · Discretização NURBS ({surface.uDivisions}×{surface.vDivisions})
          </div>

          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-0.5">
            {layerToleranceSpecs.map((spec) => {
              const check = layerComplianceReport.results.find(
                (r) => r.layerName === spec.layerName
              );
              const isOpen = expandedLayerName === spec.layerName;
              const badgeStyle =
                check?.status === 'conforme'
                  ? 'text-emerald-300 border-emerald-500/35 bg-emerald-500/10'
                  : check?.status === 'atencao'
                    ? 'text-amber-300 border-amber-500/35 bg-amber-500/10'
                    : 'text-rose-300 border-rose-500/35 bg-rose-500/10';

              return (
                <div
                  key={spec.layerName}
                  className="p-2 bg-[#0c1017] border border-white/10 rounded-lg space-y-1.5 text-[10px]"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedLayerName(isOpen ? null : spec.layerName)
                      }
                      className="flex items-center gap-1.5 min-w-0 text-left cursor-pointer"
                    >
                      <Ruler className="w-3 h-3 text-amber-300 shrink-0" />
                      <span className="font-medium text-slate-100 truncate">
                        {spec.layerName}
                      </span>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <select
                        aria-label={`Classe ISO 2768 da camada ${spec.layerName}`}
                        value={spec.toleranceClass}
                        onChange={(e) => {
                          const cls = e.target.value as LayerToleranceClass;
                          if (cls === 'custom') {
                            onUpdateLayerTolerance(spec.layerName, { toleranceClass: 'custom' });
                          } else {
                            const def = ISO_2768_CLASS_DEFAULTS[cls];
                            onUpdateLayerTolerance(spec.layerName, {
                              toleranceClass: cls,
                              linearToleranceMm: def.linearMm,
                              profileToleranceMm: def.profileMm,
                              flatnessMm: def.flatnessMm,
                            });
                          }
                        }}
                        className="px-1.5 py-0.5 text-[10px] bg-[#111620] border border-white/15 rounded text-slate-200"
                      >
                        <option value="f">f (±0.05)</option>
                        <option value="m">m (±0.15)</option>
                        <option value="c">c (±0.40)</option>
                        <option value="v">v (±1.00)</option>
                        <option value="custom">Custom</option>
                      </select>
                      {check && (
                        <span
                          className={`px-1.5 py-0.5 rounded border font-mono-tabular ${badgeStyle}`}
                        >
                          {check.totalGeometricDeviationMm.toFixed(3)}mm
                        </span>
                      )}
                    </div>
                  </div>

                  {check && (
                    <div className="text-[10px] text-slate-400 leading-snug">
                      Erro NURBS {check.nurbsChordalErrorMm.toFixed(3)} + FEA{' '}
                      {check.feaElasticDeflectionMm.toFixed(3)} ≤{' '}
                      <span className="text-slate-200 font-mono-tabular">
                        {spec.profileToleranceMm.toFixed(2)} mm
                      </span>{' '}
                      ({check.utilizationPct}%)
                    </div>
                  )}

                  {isOpen && (
                    <div className="pt-1.5 border-t border-white/8 grid grid-cols-2 gap-1.5">
                      <label className="text-[10px] text-slate-400">
                        Perfil Máx (mm)
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max="5"
                          value={spec.profileToleranceMm}
                          onChange={(e) =>
                            onUpdateLayerTolerance(spec.layerName, {
                              toleranceClass: 'custom',
                              profileToleranceMm: Math.max(
                                0.01,
                                parseFloat(e.target.value) || 0.05
                              ),
                            })
                          }
                          className="mt-0.5 w-full px-1.5 py-1 bg-[#111620] border border-white/15 rounded text-slate-100 font-mono-tabular"
                        />
                      </label>
                      <label className="text-[10px] text-slate-400">
                        Linear ± (mm)
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max="5"
                          value={spec.linearToleranceMm}
                          onChange={(e) =>
                            onUpdateLayerTolerance(spec.layerName, {
                              toleranceClass: 'custom',
                              linearToleranceMm: Math.max(
                                0.01,
                                parseFloat(e.target.value) || 0.05
                              ),
                            })
                          }
                          className="mt-0.5 w-full px-1.5 py-1 bg-[#111620] border border-white/15 rounded text-slate-100 font-mono-tabular"
                        />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {layerComplianceReport.overallStatus !== 'conforme' && (
            <button
              type="button"
              onClick={onRefineNurbsForTolerances}
              className="w-full py-1.5 text-[11px] font-semibold bg-amber-500/20 border border-amber-400/50 text-amber-200 hover:bg-amber-500/30 rounded-md cursor-pointer"
            >
              Refinar Malha NURBS ({layerComplianceReport.suggestedMinDivisions}×
              {layerComplianceReport.suggestedMinDivisions}) p/ Norma
            </button>
          )}
        </section>

        {/* Parametric NURBS Presets & Sliders */}
        {!hasImportedModel && (
          <section className="space-y-3 pt-3 border-t border-white/8">
            <div className="text-xs font-medium text-slate-400">Tipologia & Dimensões NURBS</div>
            <div className="grid grid-cols-2 gap-1.5">
              {PRESET_OPTIONS.map((p) => {
                const active = params.preset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onChangeParams({ preset: p.id })}
                    className={`text-left px-2.5 py-2 rounded-lg border transition-colors cursor-pointer ${
                      active
                        ? 'border-sky-400/70 bg-sky-500/12 text-slate-100'
                        : 'border-white/8 bg-[#0c1017] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="text-xs font-medium truncate">{p.label}</div>
                    <div className="text-[10px] text-slate-500 truncate mt-0.5">{p.subtitle}</div>
                  </button>
                );
              })}
            </div>

            <SliderRow
              label="Vão X"
              value={params.spanX}
              min={100}
              max={320}
              step={5}
              unit="mm"
              onChange={(v) => onChangeParams({ spanX: v })}
            />
            <SliderRow
              label="Profundidade Y"
              value={params.spanY}
              min={80}
              max={240}
              step={5}
              unit="mm"
              onChange={(v) => onChangeParams({ spanY: v })}
            />
            <SliderRow
              label="Altura / Flecha Z"
              value={params.archHeight}
              min={10}
              max={110}
              step={2}
              unit="mm"
              onChange={(v) => onChangeParams({ archHeight: v })}
            />
            <SliderRow
              label="Ondulação Harmônica"
              value={params.waveAmplitude}
              min={0}
              max={45}
              step={1}
              unit="mm"
              onChange={(v) => onChangeParams({ waveAmplitude: v })}
            />
            <SliderRow
              label="Torção Axial"
              value={params.twistDeg}
              min={-90}
              max={90}
              step={2}
              unit="°"
              onChange={(v) => onChangeParams({ twistDeg: v })}
            />
            <SliderRow
              label="Espessura Sólida"
              value={params.thicknessMm}
              min={1}
              max={20}
              step={0.5}
              unit="mm"
              onChange={(v) => onChangeParams({ thicknessMm: v })}
            />

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs font-medium text-slate-400">
                Malha de Controle NURBS (6×6)
              </span>
              {hasOverrides && (
                <button
                  type="button"
                  onClick={onResetControlPointOverrides}
                  className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Resetar
                </button>
              )}
            </div>

            <div className="grid grid-cols-6 gap-1 p-2 bg-[#0c1017] border border-white/8 rounded-lg">
              {surface.controlPoints.map((row, uIdx) =>
                row.map((_, vIdx) => {
                  const isSel =
                    selectedControlPoint?.u === uIdx && selectedControlPoint?.v === vIdx;
                  return (
                    <button
                      key={`${uIdx}-${vIdx}`}
                      type="button"
                      title={`Ponto de Controle (${uIdx}, ${vIdx})`}
                      onClick={() => onSelectControlPoint({ u: uIdx, v: vIdx })}
                      className={`h-6 rounded text-[10px] font-mono-tabular transition-colors cursor-pointer ${
                        isSel
                          ? 'bg-amber-500 text-slate-950 font-semibold'
                          : 'bg-slate-800/70 text-slate-400 hover:bg-sky-500/25 hover:text-sky-300'
                      }`}
                    >
                      {uIdx},{vIdx}
                    </button>
                  );
                })
              )}
            </div>

            {activeCp && selectedControlPoint && (
              <div className="space-y-2 p-2.5 bg-[#0c1017] border border-amber-500/25 rounded-lg">
                <SliderRow
                  label="Coord X"
                  value={Math.round(activeCp.x)}
                  min={-200}
                  max={200}
                  step={2}
                  unit="mm"
                  onChange={(val) =>
                    onUpdateControlPoint(selectedControlPoint.u, selectedControlPoint.v, { x: val })
                  }
                />
                <SliderRow
                  label="Altura Z"
                  value={Math.round(activeCp.y)}
                  min={4}
                  max={160}
                  step={2}
                  unit="mm"
                  onChange={(val) =>
                    onUpdateControlPoint(selectedControlPoint.u, selectedControlPoint.v, { y: val })
                  }
                />
              </div>
            )}

            <div className="space-y-2 pt-2 border-t border-white/8">
              <div className="text-xs font-medium text-slate-400">
                Estrutura BIM Waffle ({bimElements.length} peças)
              </div>
              <SliderRow
                label="Longarinas U"
                value={params.ribCountU}
                min={0}
                max={10}
                step={1}
                unit="un"
                onChange={(v) => onChangeParams({ ribCountU: v })}
              />
              <SliderRow
                label="Travessas V"
                value={params.ribCountV}
                min={0}
                max={10}
                step={1}
                unit="un"
                onChange={(v) => onChangeParams({ ribCountV: v })}
              />
            </div>
          </section>
        )}
      </div>
    </aside>
    </>
  );
};

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-300">{label}</span>
      <span className="font-mono-tabular text-slate-200">
        {value}
        {unit ? ` ${unit}` : ''}
      </span>
    </div>
    <input
      type="range"
      className="cad-slider w-full"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
    />
  </div>
);
