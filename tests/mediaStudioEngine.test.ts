import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARAMETRIF_REPRESENTATIVES,
  GAN_CREATIVE_PRESETS,
  GITHUB_GOVERNANCE_AGENTS,
  MEDIA_STUDIO_PIECE_LIBRARY,
  PARAMETRIF_FOUNDATION_CHARTER,
  PARAMETRIX_BUSINESS_PLAN,
  PARAMETRIX_OFFICIAL_IDENTITY_PRESET,
  PARAMETRIX_OFFICIAL_PALETTE,
  buildAgentOrganogramBoard,
  buildGithubBrandGuardWorkflowYaml,
  buildVectorPdfDocument,
  certifyFoundationRepresentative,
  createClientBrandIdentityPreset,
  escapeXml,
  evaluateConstructiveMediaEngineering,
  generateBrandAssetSvg,
  hexToRgb,
  rgbToCmyk,
  synthesizeGanLatentMatrix,
} from '../src/kernel/mediaStudioEngine';
import type { OpenErpWorkspaceSnapshot } from '../src/kernel/openErpEngine';

describe('mediaStudioEngine — Identidade 1.0, GAN + Engenharia Construtiva, ParametrIF & Organograma', () => {
  it('converte hex/RGB/CMYK e escapa XML de forma segura', () => {
    expect(hexToRgb('#2563EB')).toEqual([37, 99, 235]);
    expect(hexToRgb('invalido')).toEqual([37, 99, 235]);

    expect(rgbToCmyk(0, 0, 0)).toEqual({ c: 0, m: 0, y: 0, k: 100 });
    expect(rgbToCmyk(255, 0, 0)).toEqual({ c: 0, m: 100, y: 100, k: 0 });
    expect(rgbToCmyk(37, 99, 235).k).toBeGreaterThan(0);

    expect(escapeXml('<P & "1.0" \'test\'>')).toBe('&lt;P &amp; &quot;1.0&quot; &apos;test&apos;&gt;');
  });

  it('gera presets de identidade oficial 1.0 e customizada para produtos de clientes', () => {
    expect(PARAMETRIX_OFFICIAL_PALETTE).toHaveLength(4);
    expect(PARAMETRIX_OFFICIAL_IDENTITY_PRESET.officialDomainConfirmed).toBe(false);

    const custom = createClientBrandIdentityPreset('  Indústria Alfa  ', '#0ea5e9', '#10b981', 'Patrocinador X');
    expect(custom.mode).toBe('client-custom');
    expect(custom.brandName).toBe('Indústria Alfa');
    expect(custom.partnerSponsorName).toBe('Patrocinador X');

    const fallbackCustom = createClientBrandIdentityPreset('   ', 'bad', 'bad2');
    expect(fallbackCustom.brandName).toBe('Cliente Industrial');
    expect(fallbackCustom.palette[1].hex).toBe('#2563EB');
    expect(fallbackCustom.palette[2].hex).toBe('#22D3EE');
  });

  it('sintetiza vetor latente GAN determinístico com limites seguros', () => {
    expect(GAN_CREATIVE_PRESETS).toHaveLength(4);
    const ganA = synthesizeGanLatentMatrix({
      seed: 0,
      preset: 'kinetic-stadium',
      creativeIntensity: Number.NaN,
      curvatureHarmonic: 1.5,
      circuitDensity: -0.2,
      motionSweep: 0.8,
    });
    const ganB = synthesizeGanLatentMatrix({
      seed: 104729,
      preset: 'parametric-mesh',
      creativeIntensity: 0.7,
      curvatureHarmonic: 0.6,
      circuitDensity: 0.5,
      motionSweep: 0.4,
    });

    expect(ganA.seed).toBe(104729);
    expect(ganA.latentVector).toHaveLength(8);
    expect(ganA.waveCurves.length).toBeGreaterThanOrEqual(3);
    expect(ganA.circuitNodes.length).toBeGreaterThanOrEqual(4);
    expect(ganA.motionStreaks.length).toBeGreaterThanOrEqual(2);
    expect(ganA.motionStreaks[0].angleDeg).toBe(-12);
    expect(ganB.motionStreaks[0].angleDeg).toBe(-4);
    expect(ganA.ganHash).not.toBe(ganB.ganHash);
  });

  it('valida regras construtivas: trava de domínio/QR, proporção do P, patrocinador, TAC e futebol', () => {
    const gan = synthesizeGanLatentMatrix({
      seed: 4096,
      preset: 'parametric-mesh',
      creativeIntensity: 0.6,
      curvatureHarmonic: 0.7,
      circuitDensity: 0.5,
      motionSweep: 0.6,
    });

    const footballPiece = MEDIA_STUDIO_PIECE_LIBRARY.find((p) => p.id === '05-football')!;
    const cardPiece = MEDIA_STUDIO_PIECE_LIBRARY.find((p) => p.id === '03-stationery')!;
    const digitalPiece = MEDIA_STUDIO_PIECE_LIBRARY.find((p) => p.id === '08-digital')!;

    // Sem confirmação de domínio nem compliance de futebol
    const pendingFootball = evaluateConstructiveMediaEngineering(
      PARAMETRIX_OFFICIAL_IDENTITY_PRESET,
      footballPiece,
      gan,
      10
    );
    expect(pendingFootball.qrCodeEnabled).toBe(false);
    expect(pendingFootball.allPassed).toBe(false);

    // Com domínio inválido, logo destravado e patrocinador em peça não suportada
    const invalidIdentity = {
      ...createClientBrandIdentityPreset('Cliente Teste', '#1d4ed8', '#22d3ee', 'Patrocinador Y'),
      logoAspectLocked: false,
      officialDomainConfirmed: true,
      officialDomain: 'dominio-invalido',
      palette: [
        { ...PARAMETRIX_OFFICIAL_PALETTE[0], cmyk: { c: 100, m: 100, y: 100, k: 100 } },
        ...PARAMETRIX_OFFICIAL_PALETTE.slice(1),
      ],
    };
    const badCard = evaluateConstructiveMediaEngineering(invalidIdentity, cardPiece, gan, 0);
    expect(badCard.allPassed).toBe(false);
    expect(badCard.batchQty).toBe(1);
    expect(badCard.checks.find((c) => c.id === 'cmyk-tac')?.passed).toBe(false);

    // Totalmente aprovado: futebol + direitos + clube + domínio confirmado + patrocinador
    const approvedFootballIdentity = {
      ...PARAMETRIX_OFFICIAL_IDENTITY_PRESET,
      officialDomainConfirmed: true,
      officialDomain: 'https://parametrix.org',
      partnerSponsorName: 'TechPartner BR',
      athleteImageRightsCleared: true,
      clubRulesVerified: true,
    };
    const okFootball = evaluateConstructiveMediaEngineering(
      approvedFootballIdentity,
      footballPiece,
      gan,
      20
    );
    expect(okFootball.qrCodeEnabled).toBe(true);
    expect(okFootball.allPassed).toBe(true);
    expect(okFootball.batchTotalBrl).toBeGreaterThan(0);

    // Peça digital sem bleed nem TAC print
    const okDigital = evaluateConstructiveMediaEngineering(
      PARAMETRIX_OFFICIAL_IDENTITY_PRESET,
      digitalPiece,
      gan,
      5
    );
    expect(okDigital.allPassed).toBe(true);
  });

  it('gera SVG autônomo (frente, verso e aplicação) e PDF vetorial %PDF-1.4 válido', () => {
    const gan = synthesizeGanLatentMatrix({
      seed: 7777,
      preset: 'neural-circuit',
      creativeIntensity: 0.7,
      curvatureHarmonic: 0.7,
      circuitDensity: 0.8,
      motionSweep: 0.5,
    });
    const monoGan = synthesizeGanLatentMatrix({
      seed: 8888,
      preset: 'monochrome-steel',
      creativeIntensity: 0.5,
      curvatureHarmonic: 0.5,
      circuitDensity: 0.5,
      motionSweep: 0.5,
    });

    const footballPiece = MEDIA_STUDIO_PIECE_LIBRARY.find((p) => p.id === '05-football')!;
    const cardPiece = MEDIA_STUDIO_PIECE_LIBRARY.find((p) => p.id === '03-stationery')!;

    const svgFront = generateBrandAssetSvg(
      {
        ...PARAMETRIX_OFFICIAL_IDENTITY_PRESET,
        partnerSponsorName: 'Parceiro Sul',
      },
      footballPiece,
      gan,
      'front'
    );
    const svgBack = generateBrandAssetSvg(
      PARAMETRIX_OFFICIAL_IDENTITY_PRESET,
      footballPiece,
      gan,
      'back'
    );
    const svgApp = generateBrandAssetSvg(
      {
        ...PARAMETRIX_OFFICIAL_IDENTITY_PRESET,
        officialDomainConfirmed: true,
        officialDomain: 'https://parametrix.org',
      },
      cardPiece,
      monoGan,
      'application'
    );
    const svgCardBack = generateBrandAssetSvg(
      PARAMETRIX_OFFICIAL_IDENTITY_PRESET,
      cardPiece,
      gan,
      'back'
    );

    expect(svgFront).toContain('<svg');
    expect(svgFront).toContain('PATROCINADOR PARCEIRO');
    expect(svgFront).toContain('QR / URL TRAVADO');
    expect(svgBack).toContain('10');
    expect(svgApp).toContain('URL OFICIAL ATIVA');
    expect(svgCardBack).toContain('#F8FAFC');

    // Fallbacks quando paleta estiver vazia
    const emptyPaletteIdentity = {
      ...PARAMETRIX_OFFICIAL_IDENTITY_PRESET,
      palette: [],
    };
    const fallbackSvg = generateBrandAssetSvg(emptyPaletteIdentity, cardPiece, gan, 'front');
    expect(fallbackSvg).toContain('#05070B');

    const reportLocked = evaluateConstructiveMediaEngineering(
      emptyPaletteIdentity,
      cardPiece,
      gan,
      10
    );
    const pdfLocked = buildVectorPdfDocument(emptyPaletteIdentity, cardPiece, reportLocked, 'front');
    expect(pdfLocked.startsWith('%PDF-1.4')).toBe(true);
    expect(pdfLocked).toContain('BLOQUEADO ATE CONFIRMACAO DE DOMINIO');
    expect(pdfLocked).toContain('%%EOF');

    const reportOpen = evaluateConstructiveMediaEngineering(
      {
        ...PARAMETRIX_OFFICIAL_IDENTITY_PRESET,
        officialDomainConfirmed: true,
        officialDomain: 'https://parametrix.org',
      },
      footballPiece,
      gan,
      10
    );
    const pdfOpen = buildVectorPdfDocument(
      {
        ...PARAMETRIX_OFFICIAL_IDENTITY_PRESET,
        officialDomainConfirmed: true,
        officialDomain: 'https://parametrix.org',
      },
      footballPiece,
      reportOpen,
      'application'
    );
    expect(pdfOpen).toContain('https://parametrix.org');
  });

  it('gerencia Fundação ParametrIF, agentes GitHub, Business Plan e Organograma ERP/CRM', () => {
    expect(PARAMETRIF_FOUNDATION_CHARTER.principles.length).toBeGreaterThanOrEqual(4);
    expect(DEFAULT_PARAMETRIF_REPRESENTATIVES.length).toBeGreaterThanOrEqual(3);
    expect(GITHUB_GOVERNANCE_AGENTS.length).toBeGreaterThanOrEqual(3);

    const updatedReps = certifyFoundationRepresentative(DEFAULT_PARAMETRIF_REPRESENTATIVES, {
      fullName: 'Engenheira Clara',
      role: 'Engenheiro Certificado VUC',
      region: 'Brasil — Minas Gerais',
      githubHandle: 'clara-vuc',
      email: 'clara@parametrif.org',
    });
    expect(updatedReps[0].githubHandle).toBe('@clara-vuc');
    expect(updatedReps[0].badgeHash.startsWith('VUC-IF-')).toBe(true);

    const fallbackReps = certifyFoundationRepresentative(updatedReps, {
      fullName: '  ',
      role: 'Parceiro Manufatura CAM',
      region: '  ',
      githubHandle: '@already-prefixed',
      email: '  ',
    });
    expect(fallbackReps[0].fullName).toBe('Novo Representante');
    expect(fallbackReps[0].githubHandle).toBe('@already-prefixed');

    const emptyHandleReps = certifyFoundationRepresentative(fallbackReps, {
      fullName: 'Operador Sem Handle',
      role: 'Embaixador Regional',
      region: 'Sul',
      githubHandle: '  ',
      email: 'op@parametrif.org',
    });
    expect(emptyHandleReps[0].githubHandle).toBe('@rep-parametrix');

    const yaml = buildGithubBrandGuardWorkflowYaml();
    expect(yaml).toContain('scoobiii/parametrIX');
    expect(yaml).toContain('npm run vuc:proof');

    expect(PARAMETRIX_BUSINESS_PLAN.pillars).toHaveLength(5);

    // Organograma sem snapshot ERP
    const emptyOrg = buildAgentOrganogramBoard(null);
    expect(emptyOrg).toHaveLength(10);
    expect(emptyOrg.find((n) => n.id === 'ag-fin-fiscal')?.liveKpiValue).toBe('Aguardando ERP');

    // Organograma com snapshot ERP real (normal e com alerta/bloqueio pré-silício)
    const mockSnapshot = {
      partName: 'Suporte Ti-6Al-4V',
      bomTotalBatchBrl: 4520,
      routingCost: {
        machineType: 'cnc-5axis',
        cycleMinutesPerUnit: 18,
      },
      logistics: {
        modalLabel: 'Rodoviário',
        totalFreightBrl: 380,
      },
      pricingAndRoi: {
        commercialDisclosureBlocked: false,
        parametrixPriceUnitBrl: 890,
      },
      biSummary: {
        weightedCrmValueBrl: 48000,
        techReadinessPct: 96,
      },
      correlatedAreas: [
        { area: 'CAD', status: 'sincronizado' },
        { area: 'CAE', status: 'alerta' },
        { area: 'CAM', status: 'sincronizado' },
      ],
    } as unknown as OpenErpWorkspaceSnapshot;

    const liveOrg = buildAgentOrganogramBoard(mockSnapshot);
    expect(liveOrg.find((n) => n.id === 'ag-fin-fiscal')?.liveKpiValue).toContain('890');
    expect(liveOrg.find((n) => n.id === 'ag-cae-co2')?.status).toBe('alerta');

    const frostbiteOrg = buildAgentOrganogramBoard({
      ...mockSnapshot,
      pricingAndRoi: {
        ...mockSnapshot.pricingAndRoi,
        commercialDisclosureBlocked: true,
      },
      correlatedAreas: [
        {
          area: 'CAD',
          erpModule: 'BOM',
          status: 'sincronizado',
          headline: 'Geometria OK',
          metricsSummary: '100 cm³',
        },
        {
          area: 'CAE',
          erpModule: 'Qualidade',
          status: 'sincronizado',
          headline: 'SF OK',
          metricsSummary: 'SF 2.4',
        },
        {
          area: 'CAM',
          erpModule: 'Roteiro',
          status: 'sincronizado',
          headline: '5-Eixos OK',
          metricsSummary: '18 min',
        },
      ],
    });
    expect(frostbiteOrg.find((n) => n.id === 'ag-fin-fiscal')?.liveKpiValue).toBe('Pré-Silício');
    expect(frostbiteOrg.find((n) => n.id === 'ag-cae-co2')?.status).toBe('online');
  });
});
