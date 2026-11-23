import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import type {
  ComponentFatigueCycleEstimate,
  FatigueCycleAnalysisReport,
  FatigueRegime,
} from '../kernel/fatigueAnalysis';

export type FatigueChartMode = 'components' | 'sn-curve';

interface FatigueCyclesChartD3Props {
  report: FatigueCycleAnalysisReport;
}

const CHART_WIDTH = 760;
const CHART_HEIGHT = 320;
const MARGIN = { top: 24, right: 28, bottom: 48, left: 148 };
const SN_MARGIN = { top: 24, right: 28, bottom: 48, left: 68 };

const REGIME_COLORS: Record<FatigueRegime, string> = {
  'vida-infinita': '#10b981',
  'alto-ciclo-hcf': '#06b6d4',
  'baixo-ciclo-lcf': '#f59e0b',
  'critico-imediato': '#f43f5e',
};

const REGIME_LABELS: Record<FatigueRegime, string> = {
  'vida-infinita': 'Nominal · Vida Infinita (≥ 10⁷)',
  'alto-ciclo-hcf': 'HCF · Alto Ciclo (10⁵–10⁷)',
  'baixo-ciclo-lcf': 'LCF · Baixo Ciclo (10³–10⁵)',
  'critico-imediato': 'Crítico · Ruptura (< 10³)',
};

export const FatigueCyclesChartD3: React.FC<FatigueCyclesChartD3Props> = ({ report }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [chartMode, setChartMode] = useState<FatigueChartMode>('components');
  const [hoveredComp, setHoveredComp] = useState<ComponentFatigueCycleEstimate | null>(null);

  const inspectedComp = useMemo(
    () => hoveredComp ?? report.criticalComponent,
    [hoveredComp, report.criticalComponent]
  );

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    if (chartMode === 'components') {
      const innerWidth = CHART_WIDTH - MARGIN.left - MARGIN.right;
      const innerHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

      const g = svg
        .append('g')
        .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

      const displayItems = report.components.slice(0, 10);

      const xScale = d3
        .scaleLog()
        .domain([100, 1e8])
        .range([0, innerWidth])
        .clamp(true);

      const yScale = d3
        .scaleBand()
        .domain(displayItems.map((c) => c.elementId))
        .range([0, innerHeight])
        .padding(0.28);

      // Vertical logarithmic gridlines
      const tickExponents = [1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8];
      g.append('g')
        .attr('class', 'grid-log-x')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(
          d3
            .axisBottom(xScale)
            .tickValues(tickExponents)
            .tickSize(-innerHeight)
            .tickFormat(() => '')
        )
        .call((sel) => sel.select('.domain').remove())
        .call((sel) =>
          sel
            .selectAll('line')
            .attr('stroke', 'rgba(148,163,184,0.14)')
            .attr('stroke-dasharray', '3,3')
        );

      // Threshold lines: 10^5 LCF->HCF and 10^7 Infinite life
      const hcfX = xScale(1e5);
      g.append('line')
        .attr('x1', hcfX)
        .attr('x2', hcfX)
        .attr('y1', 0)
        .attr('y2', innerHeight)
        .attr('stroke', 'rgba(245,158,11,0.5)')
        .attr('stroke-width', 1.25)
        .attr('stroke-dasharray', '4,4');

      const infX = xScale(1e7);
      g.append('line')
        .attr('x1', infX)
        .attr('x2', infX)
        .attr('y1', 0)
        .attr('y2', innerHeight)
        .attr('stroke', 'rgba(16,185,129,0.55)')
        .attr('stroke-width', 1.25)
        .attr('stroke-dasharray', '4,4');

      g.append('text')
        .attr('x', hcfX + 5)
        .attr('y', 11)
        .attr('fill', '#fbbf24')
        .attr('font-size', '9.5px')
        .attr('font-family', 'ui-monospace, SFMono-Regular, monospace')
        .text('Limite LCF (10⁵)');

      g.append('text')
        .attr('x', infX - 88)
        .attr('y', 11)
        .attr('fill', '#34d399')
        .attr('font-size', '9.5px')
        .attr('font-family', 'ui-monospace, SFMono-Regular, monospace')
        .text('Vida Infinita (10⁷)');

      // Bottom axis
      g.append('g')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(
          d3
            .axisBottom(xScale)
            .tickValues(tickExponents)
            .tickFormat((v) => {
              const exp = Math.round(Math.log10(Number(v)));
              return `10^${exp}`;
            })
        )
        .call((sel) => sel.select('.domain').attr('stroke', 'rgba(148,163,184,0.35)'))
        .call((sel) => sel.selectAll('line').attr('stroke', 'rgba(148,163,184,0.35)'))
        .call((sel) =>
          sel
            .selectAll('text')
            .attr('fill', '#94a3b8')
            .attr('font-size', '10px')
            .attr('font-family', 'ui-monospace, SFMono-Regular, monospace')
        );

      // Left component axis
      g.append('g')
        .call(
          d3.axisLeft(yScale).tickFormat((id) => {
            const match = displayItems.find((item) => item.elementId === id);
            const txt = match ? match.label : String(id);
            return txt.length > 20 ? `${txt.slice(0, 19)}…` : txt;
          })
        )
        .call((sel) => sel.select('.domain').attr('stroke', 'rgba(148,163,184,0.35)'))
        .call((sel) => sel.selectAll('line').attr('stroke', 'rgba(148,163,184,0.25)'))
        .call((sel) =>
          sel
            .selectAll('text')
            .attr('fill', '#cbd5e1')
            .attr('font-size', '10px')
            .attr('font-family', 'ui-monospace, SFMono-Regular, monospace')
        );

      g.append('text')
        .attr('x', innerWidth / 2)
        .attr('y', innerHeight + 38)
        .attr('text-anchor', 'middle')
        .attr('fill', '#cbd5e1')
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .text('Ciclos de Fadiga Esperados N_f (Escala Log₁₀ · Palmgren-Miner)');

      // Bars for expected vs remaining cycles
      displayItems.forEach((item) => {
        const yPos = yScale(item.elementId) ?? 0;
        const barH = Math.max(10, yScale.bandwidth());
        const expectedW = Math.max(6, xScale(item.expectedCycles));
        const remainingW = Math.max(4, xScale(Math.max(100, item.remainingCycles)));
        const color = REGIME_COLORS[item.regime];

        // Ghost background bar for total nominal N_f
        g.append('rect')
          .attr('x', 0)
          .attr('y', yPos)
          .attr('width', expectedW)
          .attr('height', barH)
          .attr('rx', 3)
          .attr('fill', color)
          .attr('fill-opacity', 0.22)
          .attr('stroke', color)
          .attr('stroke-opacity', 0.5)
          .attr('stroke-width', 1);

        // Foreground bar for remaining life after telemetry Miner damage
        g.append('rect')
          .attr('x', 0)
          .attr('y', yPos + 2)
          .attr('width', Math.min(expectedW, remainingW))
          .attr('height', Math.max(6, barH - 4))
          .attr('rx', 2)
          .attr('fill', color)
          .attr('fill-opacity', 0.85)
          .style('cursor', 'pointer')
          .on('mouseenter', () => setHoveredComp(item))
          .on('click', () => setHoveredComp(item));

        g.append('text')
          .attr('x', Math.min(innerWidth - 6, expectedW + 6))
          .attr('y', yPos + barH / 2 + 3.5)
          .attr('text-anchor', expectedW > innerWidth - 68 ? 'end' : 'start')
          .attr('fill', expectedW > innerWidth - 68 ? '#0b0e14' : '#e2e8f0')
          .attr('font-size', '9.5px')
          .attr('font-weight', '600')
          .attr('font-family', 'ui-monospace, SFMono-Regular, monospace')
          .text(
            item.expectedCycles >= 1e7
              ? '≥1.0e7 (Inf.)'
              : item.expectedCycles.toExponential(2)
          );
      });
    } else {
      // S-N Basquin Curve + Component Operating Points
      const innerWidth = CHART_WIDTH - SN_MARGIN.left - SN_MARGIN.right;
      const innerHeight = CHART_HEIGHT - SN_MARGIN.top - SN_MARGIN.bottom;

      const g = svg
        .append('g')
        .attr('transform', `translate(${SN_MARGIN.left},${SN_MARGIN.top})`);

      const xScale = d3
        .scaleLog()
        .domain([100, 1e8])
        .range([0, innerWidth])
        .clamp(true);

      const maxStressY = Math.max(
        report.materialSpec.fatigueStrengthCoeffMpa * 0.9,
        d3.max(report.components, (c) => c.goodmanEquivalentMpa * 1.15) ?? 100
      );

      const yScale = d3
        .scaleLinear()
        .domain([0, maxStressY])
        .range([innerHeight, 0])
        .nice();

      const tickExponents = [1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8];

      g.append('g')
        .call(d3.axisLeft(yScale).ticks(5).tickSize(-innerWidth).tickFormat(() => ''))
        .call((sel) => sel.select('.domain').remove())
        .call((sel) =>
          sel
            .selectAll('line')
            .attr('stroke', 'rgba(148,163,184,0.14)')
            .attr('stroke-dasharray', '3,3')
        );

      g.append('g')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(
          d3
            .axisBottom(xScale)
            .tickValues(tickExponents)
            .tickSize(-innerHeight)
            .tickFormat(() => '')
        )
        .call((sel) => sel.select('.domain').remove())
        .call((sel) =>
          sel
            .selectAll('line')
            .attr('stroke', 'rgba(148,163,184,0.14)')
            .attr('stroke-dasharray', '3,3')
        );

      // Endurance limit horizontal line
      const modEndurance =
        report.materialSpec.enduranceLimitMpa * report.materialSpec.surfaceFactorKa * 0.85;
      const endY = yScale(modEndurance);
      g.append('line')
        .attr('x1', 0)
        .attr('x2', innerWidth)
        .attr('y1', endY)
        .attr('y2', endY)
        .attr('stroke', 'rgba(16,185,129,0.55)')
        .attr('stroke-width', 1.25)
        .attr('stroke-dasharray', '5,4');

      g.append('text')
        .attr('x', 8)
        .attr('y', Math.max(12, endY - 5))
        .attr('fill', '#34d399')
        .attr('font-size', '9.5px')
        .attr('font-family', 'ui-monospace, SFMono-Regular, monospace')
        .text(`Limite de Resistência à Fadiga (σe' = ${modEndurance.toFixed(1)} MPa)`);

      // Basquin theoretical curve
      const snLine = d3
        .line<(typeof report.snCurve)[number]>()
        .x((d) => xScale(d.cycles))
        .y((d) => yScale(d.allowableStressMpa))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(report.snCurve)
        .attr('fill', 'none')
        .attr('stroke', '#38bdf8')
        .attr('stroke-width', 2.2)
        .attr('d', snLine);

      // Component operating points
      report.components.forEach((item) => {
        const cx = xScale(item.expectedCycles);
        const cy = yScale(item.goodmanEquivalentMpa);
        const fill = REGIME_COLORS[item.regime];

        g.append('circle')
          .attr('cx', cx)
          .attr('cy', cy)
          .attr('r', 5.5)
          .attr('fill', fill)
          .attr('stroke', '#0b0e14')
          .attr('stroke-width', 1.5)
          .style('cursor', 'pointer')
          .on('mouseenter', () => setHoveredComp(item))
          .on('click', () => setHoveredComp(item));
      });

      g.append('g')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(
          d3
            .axisBottom(xScale)
            .tickValues(tickExponents)
            .tickFormat((v) => `10^${Math.round(Math.log10(Number(v)))}`)
        )
        .call((sel) => sel.select('.domain').attr('stroke', 'rgba(148,163,184,0.35)'))
        .call((sel) =>
          sel
            .selectAll('text')
            .attr('fill', '#94a3b8')
            .attr('font-size', '10px')
            .attr('font-family', 'ui-monospace, SFMono-Regular, monospace')
        );

      g.append('g')
        .call(d3.axisLeft(yScale).ticks(5))
        .call((sel) => sel.select('.domain').attr('stroke', 'rgba(148,163,184,0.35)'))
        .call((sel) =>
          sel
            .selectAll('text')
            .attr('fill', '#94a3b8')
            .attr('font-size', '10px')
            .attr('font-family', 'ui-monospace, SFMono-Regular, monospace')
        );

      g.append('text')
        .attr('x', innerWidth / 2)
        .attr('y', innerHeight + 38)
        .attr('text-anchor', 'middle')
        .attr('fill', '#cbd5e1')
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .text('Ciclos até Falha N (Curva S-N de Basquin)');

      g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -innerHeight / 2)
        .attr('y', -48)
        .attr('text-anchor', 'middle')
        .attr('fill', '#cbd5e1')
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .text('Tensão Equiv. Goodman σ_ar (MPa)');
    }
  }, [report, chartMode]);

  return (
    <div className="p-5 bg-[#111620] border border-white/10 rounded-xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-100">
            Ciclos de Fadiga Esperados por Componente & Curva S-N ({report.materialSpec.materialName})
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Equação de Basquin + Correção de tensão média Goodman (R={report.loadRatio}) + Dano cumulativo Palmgren-Miner.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#0c1017] border border-white/10 rounded-lg shrink-0">
          <button
            type="button"
            onClick={() => setChartMode('components')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              chartMode === 'components'
                ? 'bg-sky-500/20 text-sky-200 border border-sky-400/50'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            Ciclos por Componente
          </button>
          <button
            type="button"
            onClick={() => setChartMode('sn-curve')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              chartMode === 'sn-curve'
                ? 'bg-sky-500/20 text-sky-200 border border-sky-400/50'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            Curva S-N (Basquin)
          </button>
        </div>
      </div>

      <div className="w-full overflow-x-auto bg-[#080b10] border border-white/8 rounded-lg p-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="w-full h-auto min-w-[460px] select-none"
          role="img"
          aria-label="Gráfico D3.js de ciclos de fadiga esperados baseados em carregamento cíclico e histórico de telemetria"
        />
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 pt-2 border-t border-white/8 text-[11px]">
        <div className="flex flex-wrap items-center gap-4 text-slate-400">
          <span>Regime:</span>
          <span className="text-emerald-300">● Vida Infinita (≥10⁷)</span>
          <span className="text-sky-300">● Alto Ciclo (10⁵–10⁷)</span>
          <span className="text-amber-300">● Baixo Ciclo (10³–10⁵)</span>
          <span className="text-rose-300">● Crítico (&lt;10³)</span>
        </div>

        <div className="font-mono-tabular text-slate-200">
          <strong>{inspectedComp.label}</strong> · σ_ar={inspectedComp.goodmanEquivalentMpa} MPa ·
          N_f={inspectedComp.expectedCycles.toExponential(2)} · Vida rest.{' '}
          <span className="text-emerald-300 font-semibold">{inspectedComp.remainingLifePct}%</span>{' '}
          · {REGIME_LABELS[inspectedComp.regime]}
        </div>
      </div>
    </div>
  );
};
