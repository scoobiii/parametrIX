import React, { useState } from 'react';
import { Code2, Play, Plus, Puzzle, Trash2, Upload } from 'lucide-react';
import { triggerBlobDownload } from '../kernel/cadFormats';
import type { CadPlugin } from '../types/cad';

interface PluginsSdkPanelProps {
  plugins: CadPlugin[];
  pluginLogs: { pluginId: string; status: 'ok' | 'error'; ms: number; message: string }[];
  onTogglePlugin: (id: string) => void;
  onUpdatePluginCode: (id: string, code: string) => void;
  onAddPlugin: (plugin: CadPlugin) => void;
  onDeletePlugin: (id: string) => void;
}

export const PluginsSdkPanel: React.FC<PluginsSdkPanelProps> = ({
  plugins,
  pluginLogs,
  onTogglePlugin,
  onUpdatePluginCode,
  onAddPlugin,
  onDeletePlugin,
}) => {
  const [selectedId, setSelectedId] = useState<string>(plugins[0]?.id ?? '');
  const [draftName, setDraftName] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [mobilePane, setMobilePane] = useState<'list' | 'editor'>('list');

  const selected = plugins.find((p) => p.id === selectedId) ?? plugins[0] ?? null;
  const activeLog = selected
    ? pluginLogs.find((l) => l.pluginId === selected.id)
    : undefined;

  const handleCreatePlugin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = draftName.trim() || 'Novo Modificador Customizado';
    const newPlug: CadPlugin = {
      id: `plugin-${Date.now().toString().slice(-5)}`,
      name: cleanName,
      author: 'Desenvolvedor Local',
      version: '1.0.0',
      category: 'Geometria',
      enabled: true,
      description: 'Plugin customizado criado via SDK integrado.',
      code: `// Modifica pontos de controle NURBS em tempo real
for (let u = 0; u < surface.uCount; u++) {
  for (let v = 0; v < surface.vCount; v++) {
    const cp = surface.controlPoints[u][v];
    cp.y += Math.cos(cp.x * 0.03) * 6;
  }
}
return { summary: 'Modulação cosseno aplicada' };`,
    };
    onAddPlugin(newPlug);
    setSelectedId(newPlug.id);
    setDraftName('');
    setShowNewForm(false);
  };

  const handleExportManifest = () => {
    if (!selected) return;
    const blob = new Blob([JSON.stringify(selected, null, 2)], {
      type: 'application/json',
    });
    triggerBlobDownload(blob, `${selected.id}.plugin.json`);
  };

  const handleImportManifest = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<CadPlugin>;
      if (parsed.name && parsed.code) {
        const imported: CadPlugin = {
          id: `plugin-${Date.now().toString().slice(-5)}`,
          name: parsed.name,
          author: parsed.author ?? 'Terceiro',
          version: parsed.version ?? '1.0.0',
          category: parsed.category ?? 'Geometria',
          enabled: true,
          description: parsed.description ?? 'Plugin importado via manifesto JSON.',
          code: parsed.code,
        };
        onAddPlugin(imported);
        setSelectedId(imported.id);
      }
    } catch {
      // Ignore invalid JSON silently
    }
    e.target.value = '';
  };

  return (
    <div className="w-full h-full flex flex-col md:flex-row bg-[#0b0e14] overflow-hidden">
      {/* Mobile Pane Toggle */}
      <div className="md:hidden grid grid-cols-2 gap-1 p-1.5 bg-[#0f141d] border-b border-white/10 shrink-0">
        <button
          type="button"
          onClick={() => setMobilePane('list')}
          className={`min-h-[40px] text-xs font-medium rounded-lg transition-colors cursor-pointer ${
            mobilePane === 'list'
              ? 'bg-sky-500 text-slate-950 font-semibold'
              : 'text-slate-300 bg-[#141a24]'
          }`}
        >
          Plugins ({plugins.length})
        </button>
        <button
          type="button"
          onClick={() => setMobilePane('editor')}
          className={`min-h-[40px] text-xs font-medium rounded-lg transition-colors cursor-pointer ${
            mobilePane === 'editor'
              ? 'bg-sky-500 text-slate-950 font-semibold'
              : 'text-slate-300 bg-[#141a24]'
          }`}
        >
          Editor SDK
        </button>
      </div>

      {/* Left: Plugin Registry */}
      <div
        className={`${
          mobilePane === 'list' ? 'flex' : 'hidden md:flex'
        } w-full md:w-[330px] lg:w-[360px] flex-1 md:flex-none md:h-full border-r border-white/10 bg-[#111620] flex-col shrink-0 min-h-0`}
      >
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Puzzle className="w-4 h-4 text-sky-400" />
            <h2 className="font-display text-sm font-semibold text-slate-100">
              Plugins & Extensões
            </h2>
          </div>

          <div className="flex items-center gap-1.5">
            <label
              title="Importar Manifesto JSON"
              className="p-1.5 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <input
                type="file"
                accept=".json"
                onChange={handleImportManifest}
                className="hidden"
              />
            </label>
            <button
              type="button"
              onClick={() => setShowNewForm((v) => !v)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-sky-500 text-slate-950 rounded-lg hover:bg-sky-400 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo
            </button>
          </div>
        </div>

        {showNewForm && (
          <form
            onSubmit={handleCreatePlugin}
            className="p-3 border-b border-white/10 bg-[#0d121b] space-y-2"
          >
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Nome do plugin..."
              className="w-full px-3 py-1.5 text-xs bg-[#0b0e14] border border-white/12 rounded-lg text-slate-100 outline-none focus:border-sky-400"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewForm(false)}
                className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-3 py-1 text-xs font-medium bg-emerald-500 text-slate-950 rounded-md hover:bg-emerald-400 cursor-pointer"
              >
                Criar Plugin
              </button>
            </div>
          </form>
        )}

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {plugins.map((plugin) => {
            const isSel = selected?.id === plugin.id;
            const log = pluginLogs.find((l) => l.pluginId === plugin.id);

            return (
              <div
                key={plugin.id}
                onClick={() => {
                  setSelectedId(plugin.id);
                  setMobilePane('editor');
                }}
                className={`p-3 rounded-xl border transition-colors cursor-pointer ${
                  isSel
                    ? 'border-sky-400/70 bg-sky-500/10'
                    : 'border-white/8 bg-[#0c1017] hover:border-white/16'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-slate-100">{plugin.name}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {plugin.category} · v{plugin.version} · {plugin.author}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePlugin(plugin.id);
                    }}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors shrink-0 cursor-pointer ${
                      plugin.enabled
                        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                        : 'border-white/10 bg-[#131924] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {plugin.enabled ? 'Ativo' : 'Ativar'}
                  </button>
                </div>

                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  {plugin.description}
                </p>

                {log && (
                  <div
                    className={`mt-2 text-[11px] font-mono-tabular ${
                      log.status === 'ok' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {log.status === 'ok' ? 'OK' : 'Erro'} ({log.ms} ms) — {log.message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Live Plugin SDK Editor */}
      <div
        className={`${
          mobilePane === 'editor' ? 'flex' : 'hidden md:flex'
        } flex-1 min-h-0 h-full flex-col overflow-hidden bg-[#0b0e14]`}
      >
        {selected ? (
          <>
            <div className="px-4 sm:px-6 py-3.5 border-b border-white/10 bg-[#111620] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Code2 className="w-4 h-4 text-amber-400" />
                <div>
                  <h3 className="font-display text-sm font-semibold text-slate-100">
                    {selected.name}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    API Sandbox: <code>(surface, context) =&gt; &#123; summary &#125;</code>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onTogglePlugin(selected.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    selected.enabled
                      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                      : 'border-sky-400/50 bg-sky-500 text-slate-950'
                  }`}
                >
                  <Play className="w-3.5 h-3.5" />
                  {selected.enabled ? 'Executando em Tempo Real' : 'Ativar & Executar'}
                </button>
                <button
                  type="button"
                  onClick={handleExportManifest}
                  className="px-3 py-1.5 text-xs text-slate-300 border border-white/10 rounded-lg hover:bg-white/5 cursor-pointer"
                >
                  Exportar JSON
                </button>
                {plugins.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onDeletePlugin(selected.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 border border-white/10 rounded-lg cursor-pointer"
                    title="Remover Plugin"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 p-5 flex flex-col gap-4 overflow-hidden">
              <textarea
                aria-label="Código JavaScript do Plugin"
                value={selected.code}
                onChange={(e) => onUpdatePluginCode(selected.id, e.target.value)}
                spellCheck={false}
                className="flex-1 w-full p-4 bg-[#080a0f] border border-white/10 rounded-xl font-mono-tabular text-xs text-slate-200 leading-relaxed outline-none focus:border-sky-500/60 resize-none"
              />

              <div className="p-3.5 bg-[#111620] border border-white/10 rounded-xl flex items-center justify-between text-xs">
                <div className="text-slate-400">
                  Objetos expostos: <span className="font-mono-tabular text-sky-300">surface.controlPoints[u][v]</span>{' '}
                  (<span className="font-mono-tabular">x, y, z, w</span>),{' '}
                  <span className="font-mono-tabular text-sky-300">surface.thicknessMm</span>
                </div>
                <div className="font-mono-tabular text-slate-300">
                  {activeLog
                    ? `${activeLog.status.toUpperCase()} · ${activeLog.ms} ms · ${activeLog.message}`
                    : selected.enabled
                      ? 'Pronto'
                      : 'Inativo'}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
            Selecione ou crie um plugin para editar.
          </div>
        )}
      </div>
    </div>
  );
};
