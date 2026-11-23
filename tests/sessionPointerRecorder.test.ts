import { describe, expect, it } from 'vitest';
import {
  HEATMAP_COLS,
  HEATMAP_ROWS,
  analyzeSessionRefinement,
  createSessionEvent,
  shouldRecordPointerSample,
} from '../src/kernel/sessionPointerRecorder';
import type { SessionInteractionEvent } from '../src/types/cad';

describe('sessionPointerRecorder kernel', () => {
  it('throttles pointer movement samples accurately by time and distance', () => {
    expect(shouldRecordPointerSample(null, { timestampMs: 1000, xPct: 10, yPct: 10 })).toBe(true);
    const base = { timestampMs: 1000, xPct: 20, yPct: 20 };
    expect(shouldRecordPointerSample(base, { timestampMs: 1100, xPct: 80, yPct: 80 })).toBe(false);
    expect(shouldRecordPointerSample(base, { timestampMs: 1300, xPct: 20.5, yPct: 20.5 })).toBe(false);
    expect(shouldRecordPointerSample(base, { timestampMs: 1300, xPct: 25, yPct: 20 })).toBe(true);
    expect(shouldRecordPointerSample(base, { timestampMs: 2600, xPct: 20, yPct: 20 })).toBe(true);
  });

  it('creates clamped session events and derives empty, overloaded, and nominal insights', () => {
    const emptyLog = analyzeSessionRefinement({
      sessionId: 's-empty',
      userId: 'u1',
      poHumano: 'Ana (@ana)',
      llmAgent: 'gemini',
      delegatedByPo: false,
      activeTab: 'viewport',
      processMachine: 'cnc-5axis',
      processUrl: 'http://localhost:3000/?tab=viewport',
      events: [],
      createdAt: '2026-11-23T12:00:00.000Z',
    });
    expect(emptyLog.hotzoneLabel).toBe('Sem movimento registrado');
    expect(emptyLog.heatmap).toHaveLength(HEATMAP_COLS * HEATMAP_ROWS);
    expect(emptyLog.insights.some((i) => i.code === 'MACHINE_NOT_PROBED')).toBe(true);

    const overloadedEvents: SessionInteractionEvent[] = [
      createSessionEvent({
        seq: 1,
        kind: 'pointer-move',
        timestampMs: 1000,
        xPct: -5,
        yPct: 105,
        activeTab: 'viewport',
        processMachine: 'powder-metal',
        detail: 'move',
      }),
      createSessionEvent({
        seq: 2,
        kind: 'cam-restart',
        timestampMs: 2000,
        xPct: 50,
        yPct: 50,
        activeTab: 'cam',
        processMachine: 'powder-metal',
        selectedComponentId: 'comp-1',
        detail: 'restart 1',
      }),
      createSessionEvent({
        seq: 3,
        kind: 'cam-restart',
        timestampMs: 3000,
        xPct: 50,
        yPct: 50,
        activeTab: 'frostbite',
        processMachine: 'powder-metal',
        detail: 'restart 2',
      }),
      createSessionEvent({
        seq: 4,
        kind: 'cam-restart',
        timestampMs: 4000,
        xPct: 50,
        yPct: 50,
        activeTab: 'ecosystem',
        processMachine: 'powder-metal',
        detail: 'restart 3',
      }),
    ];
    const overloaded = analyzeSessionRefinement({
      sessionId: 's-overloaded',
      userId: 'u1',
      poHumano: 'Ana (@ana)',
      llmAgent: 'gemini',
      delegatedByPo: true,
      activeTab: 'cam',
      processMachine: 'powder-metal',
      processUrl: 'http://localhost:3000/?tab=cam',
      events: overloadedEvents,
    });
    expect(overloaded.pointerCount).toBe(1);
    expect(overloaded.actionCount).toBe(3);
    expect(overloaded.durationSec).toBe(3);
    expect(overloaded.hotzoneLabel).toContain('3 amostras');
    expect(overloaded.insights.map((i) => i.code)).toEqual(
      expect.arrayContaining([
        'HIGH_CAM_RESTARTS',
        'MULTI_MODULE_FLOW',
        'LOW_OBJECT_MASK_INSPECTION',
        'MACHINE_NOT_PROBED',
      ])
    );

    const nominalEvents: SessionInteractionEvent[] = [
      createSessionEvent({
        seq: 1,
        kind: 'component-select',
        timestampMs: 1000,
        xPct: 30,
        yPct: 30,
        activeTab: 'viewport',
        processMachine: 'cnc-5axis',
        selectedComponentId: 'comp-2',
        detail: 'Select piece',
      }),
      createSessionEvent({
        seq: 2,
        kind: 'machine-probe',
        timestampMs: 2500,
        xPct: 30,
        yPct: 30,
        activeTab: 'ecosystem',
        processMachine: 'cnc-5axis',
        detail: 'Probe ok',
      }),
    ];
    const nominal = analyzeSessionRefinement({
      sessionId: 's-nominal',
      userId: 'u1',
      poHumano: 'Ana (@ana)',
      llmAgent: 'gemini',
      delegatedByPo: true,
      activeTab: 'ecosystem',
      processMachine: 'cnc-5axis',
      processUrl: 'http://localhost:3000/?tab=ecosystem',
      events: nominalEvents,
    });
    expect(nominal.insights).toHaveLength(1);
    expect(nominal.insights[0].code).toBe('SESSION_NOMINAL');
    expect(nominal.vucHash).toMatch(/^VUC-[0-9A-F]{64}$/);
  });
});
