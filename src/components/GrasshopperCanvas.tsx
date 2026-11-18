import React, { useRef, useState } from 'react';
import { Plus, Trash2, Workflow, ZoomIn, ZoomOut } from 'lucide-react';
import { GRAPH_TEMPLATES } from '../kernel/graphEngine';
import type { GraphNode, GraphWire, NodeCategory } from '../types/cad';

interface GrasshopperCanvasProps {
  nodes: GraphNode[];
  wires: GraphWire[];
  nodeSummaries: Record<string, string>;
  evalMs: number;
  onChangeNodes: (nodes: GraphNode[]) => void;
  onChangeWires: (wires: GraphWire[]) => void;
  onLoadTemplate: (templateId: string) => void;
}

const CATEGORY_COLORS: Record<NodeCategory, { border: string; header: string; accent: string }> = {
  input: { border: 'border-sky-500/40', header: 'bg-sky-500/15 text-sky-300', accent: '#38bdf8' },
  nurbs: { border: 'border-amber-500/40', header: 'bg-amber-500/15 text-amber-300', accent: '#f59e0b' },
  bim: { border: 'border-emerald-500/40', header: 'bg-emerald-500/15 text-emerald-300', accent: '#10b981' },
  cam: { border: 'border-orange-500/40', header: 'bg-orange-500/15 text-orange-300', accent: '#f97316' },
  plugin: { border: 'border-indigo-400/40', header: 'bg-indigo-500/15 text-indigo-300', accent: '#818cf8' },
};

const NODE_WIDTH = 224;

export const GrasshopperCanvas: React.FC<GrasshopperCanvasProps> = ({
  nodes,
  wires,
  nodeSummaries,
  evalMs,
  onChangeNodes,
  onChangeWires,
  onLoadTemplate,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pan, setPan] = useState({ x: 20, y: 20 });
  const [zoom, setZoom] = useState(0.95);
  const [draggingNode, setDraggingNode] = useState<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [panning, setPanning] = useState<{
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
  } | null>(null);
  const [pendingSource, setPendingSource] = useState<{
    nodeId: string;
    portId: string;
  } | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);

  const getPortPosition = (node: GraphNode, portId: string, isOutput: boolean) => {
    const list = isOutput ? node.outputs : node.inputs;
    const idx = Math.max(0, list.findIndex((p) => p.id === portId));
    const yOffset = 46 + idx * 24;
    return {
      x: node.x + (isOutput ? NODE_WIDTH : 0),
      y: node.y + yOffset,
    };
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.canvasBg === 'true') {
      setPendingSource(null);
      setPanning({
        startX: e.clientX,
        startY: e.clientY,
        origPanX: pan.x,
        origPanY: pan.y,
      });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingNode) {
      const dx = (e.clientX - draggingNode.startX) / zoom;
      const dy = (e.clientY - draggingNode.startY) / zoom;
      onChangeNodes(
        nodes.map((n) =>
          n.id === draggingNode.id
            ? { ...n, x: Math.round(draggingNode.origX + dx), y: Math.round(draggingNode.origY + dy) }
            : n
        )
      );
    } else if (panning) {
      setPan({
        x: panning.origPanX + (e.clientX - panning.startX),
        y: panning.origPanY + (e.clientY - panning.startY),
      });
    }
  };

  const handlePointerUp = () => {
    setDraggingNode(null);
    setPanning(null);
  };

  const handlePortClick = (nodeId: string, portId: string, isOutput: boolean) => {
    if (isOutput) {
      setPendingSource({ nodeId, portId });
      return;
    }
    if (pendingSource && pendingSource.nodeId !== nodeId) {
      // Remove any existing wire targeting this input port, then connect
      const filtered = wires.filter(
        (w) => !(w.toNodeId === nodeId && w.toPortId === portId)
      );
      const newWire: GraphWire = {
        id: `w-${Date.now()}`,
        fromNodeId: pendingSource.nodeId,
        fromPortId: pendingSource.portId,
        toNodeId: nodeId,
        toPortId: portId,
      };
      onChangeWires([...filtered, newWire]);
      setPendingSource(null);
    }
  };

  const updateNodeParam = (nodeId: string, key: string, value: number | string | boolean) => {
    onChangeNodes(
      nodes.map((n) =>
        n.id === nodeId ? { ...n, params: { ...n.params, [key]: value } } : n
      )
    );
  };

  const addNewNode = (type: GraphNode['type']) => {
    const id = `n-${Date.now().toString().slice(-5)}`;
    const basePos = { x: Math.round((-pan.x + 220) / zoom), y: Math.round((-pan.y + 160) / zoom) };
    let newNode: GraphNode;

    if (type === 'slider') {
      newNode = {
        id,
        type: 'slider',
        title: 'Controle Numérico',
        category: 'input',
        ...basePos,
        params: { value: 30, min: 0, max: 120, step: 2, unit: 'mm' },
        inputs: [],
        outputs: [{ id: 'val', label: 'Valor', dataType: 'number' }],
      };
    } else if (type === 'waffle_bim') {
      newNode = {
        id,
        type: 'waffle_bim',
        title: 'Costelas BIM Waffle',
        category: 'bim',
        ...basePos,
        params: { ribCountU: 6, ribCountV: 5, ribHeightMm: 16 },
        inputs: [{ id: 'surface', label: 'Superfície', dataType: 'surface' }],
        outputs: [{ id: 'bim', label: 'IFC Waffle', dataType: 'bim' }],
      };
    } else if (type === 'panelize_uv') {
      newNode = {
        id,
        type: 'panelize_uv',
        title: 'Painelização UV',
        category: 'bim',
        ...basePos,
        params: { panelsU: 8, panelsV: 6 },
        inputs: [{ id: 'surface', label: 'Superfície', dataType: 'surface' }],
        outputs: [{ id: 'mesh', label: 'Painéis', dataType: 'mesh' }],
      };
    } else if (type === 'robot_kinematics') {
      newNode = {
        id,
        type: 'robot_kinematics',
        title: 'Cinemática Robô 6-Eixos',
        category: 'cam',
        ...basePos,
        params: { stepoverPct: 22 },
        inputs: [{ id: 'surface', label: 'Superfície', dataType: 'surface' }],
        outputs: [{ id: 'toolpath', label: 'KRL 6-Eixos', dataType: 'toolpath' }],
      };
    } else {
      newNode = {
        id,
        type: 'plugin_modifier',
        title: 'Nó Script Plugin JS',
        category: 'plugin',
        ...basePos,
        params: { gain: 1.0 },
        inputs: [{ id: 'surface', label: 'NURBS', dataType: 'surface' }],
        outputs: [{ id: 'surface', label: 'NURBS Mod', dataType: 'surface' }],
      };
    }

    onChangeNodes([...nodes, newNode]);
    setShowCatalog(false);
  };

  const deleteNode = (nodeId: string) => {
    onChangeNodes(nodes.filter((n) => n.id !== nodeId));
    onChangeWires(wires.filter((w) => w.fromNodeId !== nodeId && w.toNodeId !== nodeId));
  };

  return (
    <div className="relative w-full h-full bg-[#0b0f16] overflow-hidden flex flex-col">
      {/* Grasshopper Canvas Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-white/10 bg-[#111620] z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
            <Workflow className="w-4 h-4 text-amber-400" />
            <span>Grafo Paramétrico</span>
          </div>
          <span className="text-slate-600">·</span>
          <span className="text-xs font-mono-tabular text-emerald-400">
            DAG {nodes.length} nós / {wires.length} conexões ({evalMs.toFixed(2)} ms)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Templates dropdown */}
          <select
            aria-label="Modelos de Automação"
            onChange={(e) => {
              if (e.target.value) onLoadTemplate(e.target.value);
            }}
            defaultValue=""
            className="px-2.5 py-1.5 text-xs bg-[#0c1017] border border-white/12 rounded-lg text-slate-200 outline-none focus:border-sky-400 cursor-pointer"
          >
            <option value="" disabled>
              Carregar Automação...
            </option>
            {GRAPH_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowCatalog((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sky-500 text-slate-950 rounded-lg hover:bg-sky-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar Nó
            </button>

            {showCatalog && (
              <div className="absolute right-0 mt-1.5 w-56 bg-[#151b26] border border-white/12 rounded-xl shadow-2xl p-1.5 z-30">
                {(
                  [
                    { type: 'slider', label: 'Controle Numérico (Slider)' },
                    { type: 'waffle_bim', label: 'Costelas BIM Waffle' },
                    { type: 'panelize_uv', label: 'Painelização UV' },
                    { type: 'robot_kinematics', label: 'Cinemática Robô 6-Eixos' },
                    { type: 'plugin_modifier', label: 'Nó Script Plugin JS' },
                  ] as { type: GraphNode['type']; label: string }[]
                ).map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => addNewNode(item.type)}
                    className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-sky-500/15 hover:text-sky-300 rounded-lg transition-colors cursor-pointer"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 border border-white/10 rounded-lg bg-[#0c1017] p-0.5">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.55, Number((z - 0.1).toFixed(2))))}
              className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
              title="Reduzir Zoom"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono-tabular text-slate-300 px-1.5">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.4, Number((z + 0.1).toFixed(2))))}
              className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
              title="Ampliar Zoom"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Node Graph Canvas */}
      <div
        ref={containerRef}
        data-canvas-bg="true"
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="relative flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
        style={{
          backgroundImage:
            'radial-gradient(rgba(148, 163, 184, 0.16) 1px, transparent 1px)',
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        {pendingSource && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 text-xs bg-sky-500 text-slate-950 font-medium rounded-lg shadow-lg">
            Clique em uma porta de entrada (à esquerda de um nó) para conectar — clique no fundo para cancelar
          </div>
        )}

        <div
          data-canvas-bg="true"
          className="absolute inset-0 origin-top-left"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {/* SVG Wires Layer */}
          <svg
            className="absolute overflow-visible pointer-events-none"
            width="1"
            height="1"
          >
            {wires.map((w) => {
              const fromNode = nodes.find((n) => n.id === w.fromNodeId);
              const toNode = nodes.find((n) => n.id === w.toNodeId);
              if (!fromNode || !toNode) return null;
              const p1 = getPortPosition(fromNode, w.fromPortId, true);
              const p2 = getPortPosition(toNode, w.toPortId, false);
              const dx = Math.max(45, Math.abs(p2.x - p1.x) * 0.55);
              const d = `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`;
              const color = CATEGORY_COLORS[fromNode.category].accent;

              return (
                <g key={w.id} className="pointer-events-auto cursor-pointer">
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    onClick={() => onChangeWires(wires.filter((item) => item.id !== w.id))}
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth={2.2}
                    strokeOpacity={0.85}
                    onClick={() => onChangeWires(wires.filter((item) => item.id !== w.id))}
                  />
                </g>
              );
            })}
          </svg>

          {/* Nodes Layer */}
          {nodes.map((node) => {
            const palette = CATEGORY_COLORS[node.category];
            return (
              <div
                key={node.id}
                style={{ left: node.x, top: node.y, width: NODE_WIDTH }}
                className={`absolute rounded-xl border ${palette.border} bg-[#141a24] shadow-xl select-none`}
              >
                {/* Draggable Node Header */}
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setDraggingNode({
                      id: node.id,
                      startX: e.clientX,
                      startY: e.clientY,
                      origX: node.x,
                      origY: node.y,
                    });
                  }}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-t-[11px] border-b border-white/8 cursor-move ${palette.header}`}
                >
                  <span className="text-xs font-semibold truncate">{node.title}</span>
                  <button
                    type="button"
                    title="Remover Nó"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNode(node.id);
                    }}
                    className="p-0.5 text-slate-400 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                {/* Ports Row */}
                <div className="px-3 py-2 flex justify-between gap-2 text-[11px]">
                  {/* Input Ports */}
                  <div className="space-y-1.5">
                    {node.inputs.map((port) => {
                      const isTarget =
                        pendingSource && pendingSource.nodeId !== node.id;
                      return (
                        <button
                          key={port.id}
                          type="button"
                          onClick={() => handlePortClick(node.id, port.id, false)}
                          className="flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer -ml-4.5"
                        >
                          <span
                            className={`w-3 h-3 rounded-full border-2 border-[#141a24] transition-transform ${
                              isTarget
                                ? 'bg-sky-400 scale-125'
                                : 'bg-slate-400 hover:bg-sky-400'
                            }`}
                          />
                          <span>{port.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Output Ports */}
                  <div className="space-y-1.5 ml-auto text-right">
                    {node.outputs.map((port) => {
                      const isActiveSource =
                        pendingSource?.nodeId === node.id &&
                        pendingSource?.portId === port.id;
                      return (
                        <button
                          key={port.id}
                          type="button"
                          onClick={() => handlePortClick(node.id, port.id, true)}
                          className="flex items-center justify-end gap-1.5 text-slate-300 hover:text-white cursor-pointer -mr-4.5"
                        >
                          <span>{port.label}</span>
                          <span
                            className={`w-3 h-3 rounded-full border-2 border-[#141a24] ${
                              isActiveSource
                                ? 'bg-amber-400 scale-125'
                                : 'bg-sky-400 hover:scale-110'
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Inline Node Parameters */}
                <div className="px-3 pb-2.5 pt-1 border-t border-white/6 space-y-2">
                  {node.type === 'slider' && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-mono-tabular text-slate-200">
                        <span>Valor</span>
                        <span>
                          {String(node.params.value)} {String(node.params.unit ?? '')}
                        </span>
                      </div>
                      <input
                        type="range"
                        className="cad-slider w-full"
                        min={Number(node.params.min ?? 0)}
                        max={Number(node.params.max ?? 100)}
                        step={Number(node.params.step ?? 1)}
                        value={Number(node.params.value ?? 0)}
                        onChange={(e) =>
                          updateNodeParam(node.id, 'value', parseFloat(e.target.value))
                        }
                      />
                    </div>
                  )}

                  {node.type === 'nurbs_generator' && (
                    <div className="space-y-1.5 text-[11px]">
                      <select
                        value={String(node.params.preset ?? 'shell')}
                        onChange={(e) => updateNodeParam(node.id, 'preset', e.target.value)}
                        className="w-full px-2 py-1 bg-[#0b0e14] border border-white/10 rounded text-slate-200 outline-none"
                      >
                        <option value="shell">Casca Dupla Curvatura</option>
                        <option value="impeller">Pá Aerodinâmica</option>
                        <option value="cavity">Molde Cavidade CNC</option>
                        <option value="diagrid">Abóbada BIM</option>
                      </select>
                      <div className="flex justify-between font-mono-tabular text-slate-400">
                        <span>Espessura</span>
                        <span>{String(node.params.thicknessMm)} mm</span>
                      </div>
                      <input
                        type="range"
                        className="cad-slider w-full"
                        min={0}
                        max={18}
                        step={1}
                        value={Number(node.params.thicknessMm ?? 6)}
                        onChange={(e) =>
                          updateNodeParam(node.id, 'thicknessMm', parseFloat(e.target.value))
                        }
                      />
                    </div>
                  )}

                  {node.type === 'waffle_bim' && (
                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between font-mono-tabular text-slate-400">
                        <span>Malha U×V</span>
                        <span>
                          {String(node.params.ribCountU)}×{String(node.params.ribCountV)}
                        </span>
                      </div>
                      <input
                        type="range"
                        className="cad-slider w-full"
                        min={2}
                        max={10}
                        step={1}
                        value={Number(node.params.ribCountU ?? 5)}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          updateNodeParam(node.id, 'ribCountU', v);
                        }}
                      />
                    </div>
                  )}

                  {(node.type === 'cam_toolpath' || node.type === 'robot_kinematics') && (
                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between font-mono-tabular text-slate-400">
                        <span>Passo Lateral</span>
                        <span>{String(node.params.stepoverPct)}%</span>
                      </div>
                      <input
                        type="range"
                        className="cad-slider w-full"
                        min={10}
                        max={55}
                        step={2}
                        value={Number(node.params.stepoverPct ?? 24)}
                        onChange={(e) =>
                          updateNodeParam(node.id, 'stepoverPct', parseInt(e.target.value, 10))
                        }
                      />
                    </div>
                  )}

                  <div className="text-[10px] font-mono-tabular text-slate-400 truncate">
                    {nodeSummaries[node.id] ?? 'Pronto'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
