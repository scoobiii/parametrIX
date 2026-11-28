import { describe, expect, it } from 'vitest';
import {
  HARNESS_OPTIONAL_API_PROVIDERS,
  SIMPLE_TOOL_SCHEMAS,
  executeQwenSimpleToolHarness,
  listHarnessDynamicProjects,
  matchDynamicProjectFromPrompt,
  resolveLayerTargetTab,
  type HarnessLiveWorkspaceContext,
} from '../src/kernel/qwenSimpleToolHarness';

const baseContext: HarnessLiveWorkspaceContext = {
  activeProjectId: 'preset-cnc-flange',
  activeProjectTitle: 'Flange CNC M8',
  segment: 'industrial-cnc',
  partName: 'Flange ISO 2768',
  triangleCount: 2048,
  volumeCm3: 54.2,
  safetyFactor: 2.8,
  maxStressMpa: 41.5,
  co2TotalKg: 1.85,
  machineType: 'cnc-5axis',
  batchQty: 12,
  marginPct: 30,
  taxRegime: 'presumido',
  parametrixPriceUnitBrl: 450,
  vucHash: 'VUC-TEST-1234567890ABCDEF',
};

describe('Qwen 0.5B + SimpleTool Harness Kernel', () => {
  it('expõe schemas SimpleTool comprimidos (4-6x) e Qwen 0.5B como motor padrão sem download', () => {
    expect(HARNESS_OPTIONAL_API_PROVIDERS[0]?.id).toBe('local-llm');
    expect(HARNESS_OPTIONAL_API_PROVIDERS[0]?.kind).toBe('embedded');
    expect(SIMPLE_TOOL_SCHEMAS.length).toBe(6);
    for (const s of SIMPLE_TOOL_SCHEMAS) {
      expect(s.argSlots.length).toBeLessThanOrEqual(6);
      expect(s.rawSchemaChars / s.compressedSchemaChars).toBeGreaterThanOrEqual(4);
    }
  });

  it('mapeia corretamente todas as camadas para abas alvo', () => {
    expect(resolveLayerTargetTab('cad')).toBe('viewport');
    expect(resolveLayerTargetTab('cae')).toBe('sustainability');
    expect(resolveLayerTargetTab('cam')).toBe('cam');
    expect(resolveLayerTargetTab('erp')).toBe('ecosystem');
  });

  it('mescla projetos SQLite dinâmicos com presets ParametrIX', () => {
    const merged = listHarnessDynamicProjects([
      { id: 'sql-1', name: 'Turbina Hidráulica Custom', segment: 'aeroespacial', machineType: 'cnc-5axis' },
      { id: 'sql-2', name: 'Suporte Padrão Sem Tipo' },
    ]);
    expect(merged[0]?.source).toBe('sqlite-project');
    expect(merged[1]?.segment).toBe('industrial-cnc');
    expect(merged[1]?.machineType).toBe('cnc-5axis');
    expect(merged.some((p) => p.id === 'preset-gear-m2-z24')).toBe(true);
    expect(listHarnessDynamicProjects().every((p) => p.source === 'preset')).toBe(true);
  });

  it('identifica todos os projetos por palavra-chave e trata ausência de match', () => {
    const projects = listHarnessDynamicProjects([
      { id: 'sql-custom', name: 'Suporte Turbina Especial' },
    ]);

    expect(matchDynamicProjectFromPrompt('desenhar engrenagem z24 m2', projects)?.id).toBe('preset-gear-m2-z24');
    expect(matchDynamicProjectFromPrompt('trocar para garfo downhill bike', projects)?.id).toBe('preset-dh-fork');
    expect(matchDynamicProjectFromPrompt('abrir flange chaveta m8', projects)?.id).toBe('preset-cnc-flange');
    expect(matchDynamicProjectFromPrompt('helice titanio aero as9100', projects)?.id).toBe('preset-aero-titanium');
    expect(matchDynamicProjectFromPrompt('abobada waffle nbr 8800 bim', projects)?.id).toBe('preset-bim-dome');
    expect(matchDynamicProjectFromPrompt('efetuador kuka 6 eixos', projects)?.id).toBe('preset-robot-6axis');
    expect(matchDynamicProjectFromPrompt('abrir projeto UGEE1000BR rotor de etanol', projects)?.id).toBe('preset-aero-titanium');
    expect(matchDynamicProjectFromPrompt('rack frostbite 1 mw 800vdc', projects)?.id).toBe('preset-frostbite-rack');
    expect(matchDynamicProjectFromPrompt('interposer soc chiplet silicio', projects)?.id).toBe('preset-soc-hybrid');
    expect(matchDynamicProjectFromPrompt('po metalico lpbf sinterizacao', projects)?.id).toBe('preset-metal-powder');
    expect(matchDynamicProjectFromPrompt('resina sla uv microfluido', projects)?.id).toBe('preset-resin-sla');
    expect(matchDynamicProjectFromPrompt('abrir turbina especial', projects)?.id).toBe('sql-custom');
    expect(matchDynamicProjectFromPrompt('oi tudo bem', projects)).toBeNull();

    // Lista reduzida / vazia para testar fallbacks ?? null e projects[0]
    expect(matchDynamicProjectFromPrompt('engrenagem', [])).toBeNull();
    expect(matchDynamicProjectFromPrompt('garfo', [])).toBeNull();
    expect(matchDynamicProjectFromPrompt('flange', [])).toBeNull();
    expect(matchDynamicProjectFromPrompt('helice', [])).toBeNull();
    expect(matchDynamicProjectFromPrompt('abobada', [])).toBeNull();
    expect(matchDynamicProjectFromPrompt('kuka', [])).toBeNull();
    expect(matchDynamicProjectFromPrompt('ugee1000br rotor de etanol', [])).toBeNull();
    expect(matchDynamicProjectFromPrompt('frostbite', [])).toBeNull();
    expect(matchDynamicProjectFromPrompt('soc', [])).toBeNull();
    expect(matchDynamicProjectFromPrompt('lpbf', [])).toBeNull();
    expect(matchDynamicProjectFromPrompt('resina', [])).toBeNull();
    expect(
      matchDynamicProjectFromPrompt('engrenagem', [
        {
          id: 'alt-1',
          title: 'Alternativo',
          source: 'preset',
          segment: 'industrial-cnc',
          machineType: 'cnc-3axis',
          summary: 'Alt',
        },
      ])?.id
    ).toBe('alt-1');
  });

  it('desenha Engrenagem M2 Z24 determinística quando usuário pede peça CAD genérica no repo scoobiii/parametrIX', () => {
    const projects = listHarnessDynamicProjects();
    const res = executeQwenSimpleToolHarness({
      layer: 'cad',
      prompt: 'desenha uma peça cad no scoobiii/parametrIX',
      projects,
      context: baseContext,
    });

    expect(res.engineId).toBe('local-llm');
    expect(res.activeProject.id).toBe('preset-gear-m2-z24');
    expect(res.actionsToApply).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'switch-project', presetId: 'preset-gear-m2-z24' }),
        expect.objectContaining({ type: 'switch-layer', targetTab: 'viewport' }),
      ])
    );
    expect(res.compressionStats.compressionRatio).toBeGreaterThanOrEqual(4);
    expect(res.trajectory.some((t) => t.toolName === 'cad_build_part')).toBe(true);
    expect(res.trajectory[res.trajectory.length - 1]?.phase).toBe('VUC_NOTARIO');
    expect(res.vucHash).toMatch(/^VUC-/);

    // Sem presets disponíveis, usa contexto ativo sem crash e sem switch-project
    const emptyProjRes = executeQwenSimpleToolHarness({
      layer: 'cad',
      prompt: 'construa uma peça cad no scoobiii/parametrix',
      projects: [],
      context: { ...baseContext, activeProjectId: undefined },
    });
    expect(emptyProjRes.activeProject.id).toBe('active-workspace');
    expect(emptyProjRes.actionsToApply.some((a) => a.type === 'switch-layer')).toBe(true);
  });

  it('alterna dinamicamente projetos preset e SQLite no backend', () => {
    const projects = listHarnessDynamicProjects([
      { id: 'sqlite-orbita', name: 'Suporte Órbita Custom' },
    ]);

    const resPreset = executeQwenSimpleToolHarness({
      layer: 'cad',
      prompt: 'trocar projeto para garfo downhill',
      engineId: 'deepseek',
      projects,
      context: baseContext,
    });
    expect(resPreset.engineId).toBe('deepseek');
    expect(resPreset.actionsToApply[0]).toEqual({
      type: 'switch-project',
      presetId: 'preset-dh-fork',
      title: resPreset.activeProject.title,
    });

    const resSqlite = executeQwenSimpleToolHarness({
      layer: 'cad',
      prompt: 'abrir projeto orbita custom',
      engineId: 'provider-desconhecido' as unknown as 'local-llm',
      projects,
      context: baseContext,
    });
    expect(resSqlite.engineId).toBe('local-llm');
    expect(resSqlite.activeProject.id).toBe('sqlite-orbita');
    expect(resSqlite.actionsToApply).toEqual([]);

    const resExplicitResinSwitch = executeQwenSimpleToolHarness({
      layer: 'cad',
      prompt: 'trocar projeto para resina sla',
      projects,
      context: baseContext,
    });
    expect(resExplicitResinSwitch.actionsToApply[0]).toMatchObject({
      type: 'switch-project',
      presetId: 'preset-resin-sla',
    });

    // Fallback when activeProjectId is missing from non-empty projects list
    const resFallbackGear = executeQwenSimpleToolHarness({
      layer: 'cad',
      prompt: 'status atual',
      projects,
      context: { ...baseContext, activeProjectId: 'inexistente-id' },
    });
    expect(resFallbackGear.activeProject.id).toBe('preset-gear-m2-z24');

    const resFallbackFirst = executeQwenSimpleToolHarness({
      layer: 'cad',
      prompt: 'status atual',
      projects: [
        {
          id: 'only-1',
          title: 'Projeto Único',
          source: 'preset',
          segment: 'industrial-cnc',
          machineType: 'cnc-3axis',
          summary: 'Único',
        },
      ],
      context: { ...baseContext, activeProjectId: 'inexistente-id' },
    });
    expect(resFallbackFirst.activeProject.id).toBe('only-1');

    // Mode phrase in CAD switches machine without replacing current project
    const resCadCamMode = executeQwenSimpleToolHarness({
      layer: 'cad',
      prompt: 'modo resina sla',
      projects,
      context: baseContext,
    });
    expect(resCadCamMode.activeProject.id).toBe('preset-cnc-flange');
    expect(resCadCamMode.actionsToApply[0]).toMatchObject({
      type: 'set-cam-machine',
      machineType: 'resin-sla',
    });

    // Prompt referencing already-active CAD project without switch keyword keeps project in place
    const resSameProjectCad = executeQwenSimpleToolHarness({
      layer: 'cad',
      prompt: 'verificar flange atual',
      projects,
      context: baseContext,
    });
    expect(resSameProjectCad.activeProject.id).toBe('preset-cnc-flange');
    expect(resSameProjectCad.actionsToApply).toEqual([]);
  });

  it('executa comandos nas camadas CAE, CAM (8 máquinas) e ERP com sincronização total', () => {
    const projects = listHarnessDynamicProjects();

    // CAE sem e com otimização + fallback de métricas indefinidas
    const caeOpt = executeQwenSimpleToolHarness({
      layer: 'cae',
      prompt: 'rodar FEA e otimizar curvatura massa',
      projects,
      context: { ...baseContext, safetyFactor: undefined, maxStressMpa: undefined, co2TotalKg: undefined },
    });
    expect(caeOpt.actionsToApply).toEqual([{ type: 'run-fea' }, { type: 'optimize-curvature' }]);

    const caePlain = executeQwenSimpleToolHarness({
      layer: 'cae',
      prompt: 'auditar fator de seguranca',
      projects,
      context: baseContext,
    });
    expect(caePlain.actionsToApply).toEqual([{ type: 'run-fea' }]);

    // CAM cobrindo todas as 8 máquinas e restart
    const camCases: { prompt: string; expected: string; restart: boolean }[] = [
      { prompt: 'modo resina sla e reiniciar cam', expected: 'resin-sla', restart: true },
      { prompt: 'modo po metalico lpbf', expected: 'powder-metal', restart: false },
      { prompt: 'solda mig tig gcode', expected: 'robot-weld', restart: true },
      { prompt: 'corte laser 4kw', expected: 'laser-cut', restart: false },
      { prompt: 'robo kuka 6 eixos reset', expected: 'robot-6axis', restart: true },
      { prompt: 'usinagem cnc 3 eixos', expected: 'cnc-3axis', restart: false },
      { prompt: 'usinagem cnc 5 eixos executar', expected: 'cnc-5axis', restart: true },
      { prompt: 'modo manual dro', expected: 'manual', restart: false },
      { prompt: 'inspecionar cam atual', expected: 'cnc-3axis', restart: false },
    ];
    for (const c of camCases) {
      const camRes = executeQwenSimpleToolHarness({
        layer: 'cam',
        prompt: c.prompt,
        projects,
        context: baseContext,
      });
      expect(camRes.actionsToApply[0]).toEqual({
        type: 'set-cam-machine',
        machineType: c.expected,
        restart: c.restart,
      });
    }

    // ERP: Simples, Lucro Real, Presumido, Modais e Gravação de Pedido
    const erpSimples = executeQwenSimpleToolHarness({
      layer: 'erp',
      prompt: 'lote 25 un simples margem 34 ferro registrar pedido',
      projects,
      context: baseContext,
    });
    expect(erpSimples.actionsToApply).toEqual([
      {
        type: 'update-erp',
        batchQty: 25,
        marginPct: 34,
        taxRegime: 'simples',
        logisticsModal: 'rail',
      },
      expect.objectContaining({
        type: 'record-erp-order',
        amountBrl: 11250,
      }),
    ]);

    const erpRealAir = executeQwenSimpleToolHarness({
      layer: 'erp',
      prompt: 'lucro real transporte aereo registrar cotacao',
      projects,
      context: { ...baseContext, parametrixPriceUnitBrl: null },
    });
    expect(erpRealAir.actionsToApply).toEqual([
      {
        type: 'update-erp',
        batchQty: undefined,
        marginPct: undefined,
        taxRegime: 'real',
        logisticsModal: 'air',
      },
      expect.objectContaining({
        type: 'record-erp-order',
        amountBrl: 5040,
      }),
    ]);

    const erpPresumidoRiver = executeQwenSimpleToolHarness({
      layer: 'erp',
      prompt: 'presumido modal fluvial',
      projects,
      context: baseContext,
    });
    expect(erpPresumidoRiver.actionsToApply[0]).toMatchObject({
      type: 'update-erp',
      taxRegime: 'presumido',
      logisticsModal: 'river',
    });

    const erpRoadNoParams = executeQwenSimpleToolHarness({
      layer: 'erp',
      prompt: 'caminhao rodo',
      projects,
      context: baseContext,
    });
    expect(erpRoadNoParams.actionsToApply[0]).toMatchObject({ logisticsModal: 'road' });

    const erpSummaryOnly = executeQwenSimpleToolHarness({
      layer: 'erp',
      prompt: 'resumo erp',
      projects,
      context: baseContext,
    });
    expect(erpSummaryOnly.actionsToApply).toEqual([]);
  });

  it('retorna inspeção contextual padrão em CAD quando prompt é neutro', () => {
    const projects = listHarnessDynamicProjects();
    const res = executeQwenSimpleToolHarness({
      layer: 'cad',
      prompt: 'status atual da peca',
      projects,
      context: baseContext,
    });
    expect(res.actionsToApply).toEqual([]);
    expect(res.reply).toContain('2048 triângulos');
  });
});
