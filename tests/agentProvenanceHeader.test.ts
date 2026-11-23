import { describe, expect, it } from 'vitest';
import {
  buildAgentProvenanceMetadata,
  buildArtifactProvenanceSidecarJson,
  formatGos7CommentLines,
  formatGos7GcodeHeader,
  injectGos7ProvenanceIntoTextArtifact,
  parseGos7ProvenanceFromText,
} from '../src/kernel/agentProvenanceHeader';

describe('agentProvenanceHeader kernel', () => {
  it('builds deterministic GOS7 provenance identifying both LLM agent and PO Humano (delegated and direct)', () => {
    const delegated = buildAgentProvenanceMetadata({
      fileName: 'engrenagem_m2_z24_cam.nc',
      responsibility: 'Fresa 5-eixos',
      dirOrUrl: 'https://parametrix.app/?tab=cam',
      poHumanoName: 'Marcos Silva',
      poHumanoHandle: '@scoobiii',
      poHumanoEmail: 'marcos@parametrix.io',
      delegatedByPo: true,
      llmAgentId: 'gemini',
      llmModel: 'gemini-2.5-pro',
      harnessId: 'parametrix-harness',
      status: 'aprovado',
      createdAt: '2026-11-23T12:00:00.000Z',
    });
    expect(delegated.delegatedByPo).toBe(true);
    expect(delegated.delegationScope).toContain('@scoobiii');
    expect(delegated.vucHash).toMatch(/^VUC-[0-9A-F]{64}$/);

    const directFallback = buildAgentProvenanceMetadata({
      fileName: 'eixo.nc',
      responsibility: 'Torno CNC',
      dirOrUrl: 'http://localhost:3000',
      poHumanoName: '   ',
      poHumanoHandle: '   ',
      poHumanoEmail: '   ',
      delegatedByPo: false,
      llmAgentId: '   ',
    });
    expect(directFallback.poHumanoName).toBe('Product Owner Parametrix');
    expect(directFallback.poHumanoHandle).toBe('@po.parametrix');
    expect(directFallback.llmAgentId).toBe('harness-orchestrator');
    expect(directFallback.delegationScope).toContain('supervisionada');

    const delegatedLines = formatGos7CommentLines(delegated);
    expect(delegatedLines.join('\n')).toContain('DELEGADO_POR_PO');
    const directLines = formatGos7CommentLines(directFallback);
    expect(directLines.join('\n')).toContain('delegado_por_po: NAO');
  });

  it('formats dialects, injects into nc/src/mod/step/ts/sh, builds sidecar JSON, and parses back cleanly', () => {
    const meta = buildAgentProvenanceMetadata({
      fileName: 'peca_cam.nc',
      responsibility: 'Usinagem CNC',
      dirOrUrl: '/?tab=cam',
      poHumanoName: 'Ana PO',
      poHumanoHandle: '@anapo',
      poHumanoEmail: 'ana@parametrix.io',
      delegatedByPo: true,
      delegationScope: 'Escopo CAM Lote 1',
      llmAgentId: 'qwen',
      createdAt: '2026-11-23T12:00:00.000Z',
    });

    expect(formatGos7GcodeHeader(meta, 'kuka-semi')).toContain('; @gos7-header');
    expect(formatGos7GcodeHeader(meta, 'abb-bang')).toContain('! @gos7-header');
    expect(formatGos7GcodeHeader(meta, 'hash')).toContain('# @gos7-header');
    expect(formatGos7GcodeHeader(meta, 'gcode-paren')).toContain('(@gos7-header');

    const ncWithPercent = injectGos7ProvenanceIntoTextArtifact('%\nO0001\nG01 X10', meta, 'nc');
    expect(ncWithPercent.startsWith('%\n(')).toBe(true);
    const parsedNc = parseGos7ProvenanceFromText(ncWithPercent);
    expect(parsedNc).toEqual({
      detected: true,
      agenteLlm: 'qwen',
      poHumano: 'Ana PO <ana@parametrix.io> @anapo',
      delegadoPorPo: true,
      vucHash: meta.vucHash,
    });

    const ncNoPercent = injectGos7ProvenanceIntoTextArtifact('G21\nG01 X5', meta, 'nc');
    expect(ncNoPercent.startsWith('(')).toBe(true);

    const kukaSrc = injectGos7ProvenanceIntoTextArtifact('DEF PECA()\nEND', meta, 'src');
    expect(kukaSrc).toContain('; po_humano:');
    expect(injectGos7ProvenanceIntoTextArtifact('MODULE M\nENDMODULE', meta, 'mod')).toContain('! @gos7-header');
    expect(injectGos7ProvenanceIntoTextArtifact('#!/bin/bash', meta, 'sh')).toContain('# @gos7-header');
    expect(injectGos7ProvenanceIntoTextArtifact('export const x = 1;', meta, 'ts')).toContain(' * @gos7-header');

    const stepIn = "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('Parametrix'),'2;1');\nENDSEC;";
    const stepOut = injectGos7ProvenanceIntoTextArtifact(stepIn, meta, 'step');
    expect(stepOut).toContain('GOS7=qwen|PO=@anapo|DELEGATED=true|VUC=');
    expect(parseGos7ProvenanceFromText(stepOut)).toEqual({
      detected: true,
      agenteLlm: 'qwen',
      poHumano: '@anapo',
      delegadoPorPo: true,
      vucHash: meta.vucHash,
    });

    const stepWithoutDesc = 'ISO-10303-21;\nDATA;\nENDSEC;';
    expect(injectGos7ProvenanceIntoTextArtifact(stepWithoutDesc, meta, 'step')).toBe(stepWithoutDesc);

    expect(parseGos7ProvenanceFromText('G00 X0 Y0')).toEqual({ detected: false });

    const sidecar = JSON.parse(buildArtifactProvenanceSidecarJson(meta)) as {
      schema: string;
      verification: { identifiesLlmAgent: boolean; identifiesPoHumano: boolean; delegatedByPo: boolean };
    };
    expect(sidecar.schema).toBe('parametrix.gos7.provenance/v1');
    expect(sidecar.verification.identifiesLlmAgent).toBe(true);
    expect(sidecar.verification.identifiesPoHumano).toBe(true);
    expect(sidecar.verification.delegatedByPo).toBe(true);
  });
});
