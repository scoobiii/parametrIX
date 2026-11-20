import React, { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import type {
  ApplicationSegment,
  MachineType,
  MaterialFinish,
  ParametricDesignParams,
  PresetId,
} from '../types/cad';

interface ProjectWizardModalProps {
  open: boolean;
  onClose: () => void;
  onCreateProject: (config: {
    name: string;
    segment: ApplicationSegment;
    machineType: MachineType;
    materialFinish: MaterialFinish;
    designParamsPatch: Partial<ParametricDesignParams>;
    presetIdToLoad?: string;
    startCamImmediately: boolean;
  }) => void;
}

const ARCHETYPE_OPTIONS: {
  id: string;
  label: string;
  segment: ApplicationSegment;
  preset: PresetId;
  machineType: MachineType;
  material: MaterialFinish;
  presetId?: string;
}[] = [
  {
    id: 'rack-frostbite',
    label: 'Rack #FrostbiteEngine 1 MW / 800 VDC HVAC',
    segment: 'robotica',
    preset: 'diagrid',
    machineType: 'robot-weld',
    material: 'aluminum',
    presetId: 'preset-frostbite-rack',
  },
  {
    id: 'soc-hybrid',
    label: 'Chip / SoC Silício + Óptico Híbrido',
    segment: 'aeroespacial',
    preset: 'cavity',
    machineType: 'laser-cut',
    material: 'glass',
    presetId: 'preset-soc-hybrid',
  },
  {
    id: 'metal-powder',
    label: 'Peça Titânio — Impressão Pó Metálico (LPBF)',
    segment: 'aeroespacial',
    preset: 'shell',
    machineType: 'powder-metal',
    material: 'titanium',
  },
  {
    id: 'resin-sla',
    label: 'Prototipagem Óptica — Resina UV (SLA)',
    segment: 'medico',
    preset: 'cavity',
    machineType: 'resin-sla',
    material: 'matte-plastic',
  },
  {
    id: 'nurbs-custom',
    label: 'Casca NURBS / CNC Paramétrica do Zero',
    segment: 'industrial-cnc',
    preset: 'impeller',
    machineType: 'cnc-5axis',
    material: 'carbon-fiber',
  },
];

export const ProjectWizardModal: React.FC<ProjectWizardModalProps> = ({
  open,
  onClose,
  onCreateProject,
}) => {
  const [name, setName] = useState('Projeto Engenharia Zero-VUC');
  const [archetypeIdx, setArchetypeIdx] = useState(0);
  const [spanX, setSpanX] = useState(210);
  const [spanY, setSpanY] = useState(145);
  const [archHeight, setArchHeight] = useState(48);
  const [thicknessMm, setThicknessMm] = useState(6);
  const [startCam, setStartCam] = useState(true);

  if (!open) return null;
  const chosen = ARCHETYPE_OPTIONS[archetypeIdx];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-lg bg-[#111620] border border-white/15 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-sky-400" />
            <h3 className="font-display text-base font-bold text-slate-100">
              Assistente em Tempo Real — Novo Projeto do Zero
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">Nome do Projeto</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-[#0c1017] border border-white/12 rounded-lg text-slate-100"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-slate-400">Classe / Arquitetura do Produto</label>
            <div className="space-y-1.5">
              {ARCHETYPE_OPTIONS.map((opt, idx) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setArchetypeIdx(idx)}
                  className={`w-full px-3 py-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                    archetypeIdx === idx
                      ? 'border-sky-400 bg-sky-500/15 text-slate-100'
                      : 'border-white/10 bg-[#0c1017] text-slate-300'
                  }`}
                >
                  <div className="font-semibold">{opt.label}</div>
                  <div className="text-[11px] font-mono-tabular text-slate-400 mt-0.5">
                    {opt.segment} · CAM: {opt.machineType} · Material: {opt.material}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Vão X</span>
                <span className="font-mono-tabular text-slate-100">{spanX} mm</span>
              </div>
              <input
                type="range"
                className="cad-slider w-full"
                min={100}
                max={300}
                step={5}
                value={spanX}
                onChange={(e) => setSpanX(parseInt(e.target.value, 10))}
              />
            </div>
            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Vão Y</span>
                <span className="font-mono-tabular text-slate-100">{spanY} mm</span>
              </div>
              <input
                type="range"
                className="cad-slider w-full"
                min={80}
                max={240}
                step={5}
                value={spanY}
                onChange={(e) => setSpanY(parseInt(e.target.value, 10))}
              />
            </div>
            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Altura Z</span>
                <span className="font-mono-tabular text-slate-100">{archHeight} mm</span>
              </div>
              <input
                type="range"
                className="cad-slider w-full"
                min={12}
                max={100}
                step={2}
                value={archHeight}
                onChange={(e) => setArchHeight(parseInt(e.target.value, 10))}
              />
            </div>
            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Espessura</span>
                <span className="font-mono-tabular text-slate-100">{thicknessMm} mm</span>
              </div>
              <input
                type="range"
                className="cad-slider w-full"
                min={2}
                max={18}
                step={0.5}
                value={thicknessMm}
                onChange={(e) => setThicknessMm(parseFloat(e.target.value))}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={startCam}
              onChange={(e) => setStartCam(e.target.checked)}
              className="accent-emerald-400"
            />
            Iniciar simulação produtiva CAM com troca de ferramentas imediatamente
          </label>

          <button
            type="button"
            onClick={() => {
              onCreateProject({
                name,
                segment: chosen.segment,
                machineType: chosen.machineType,
                materialFinish: chosen.material,
                designParamsPatch: {
                  preset: chosen.preset,
                  spanX,
                  spanY,
                  archHeight,
                  thicknessMm,
                },
                presetIdToLoad: chosen.presetId,
                startCamImmediately: startCam,
              });
              onClose();
            }}
            className="w-full min-h-[42px] px-4 py-2 font-semibold bg-sky-500 text-slate-950 rounded-lg hover:bg-sky-400 transition-colors cursor-pointer"
          >
            Gerar Geometria 3D + Prova VUC
          </button>
        </div>
      </div>
    </div>
  );
};
