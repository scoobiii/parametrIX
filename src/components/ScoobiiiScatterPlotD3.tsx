import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import type {
  CorrelationRegressionStats,
  ScoobiiiScatterPoint,
} from '../kernel/scoobiiiProofTelemetry';

export type ScatterFilterMode = 'all' | 'sweep' | 'presets' | 'financial';
export type ScatterYAxisMetric = 'failureRatePct' | 'unitTotalCostBrl';

interface ScoobiiiScatterPlotD3Props {
  points: ScoobiiiScatterPoint[];
  correlation: CorrelationRegressionStats;
  onSelectPoint?: (point: ScoobiiiScatterPoint) => void;
}

const CHART_WIDTH = 760;
const CHART_HEIGHT = 310;
const MARGIN = { top: 22, right: 26, bottom: 48, left: 62 };

const DOMAIN_COLORS: Record<ScoobiiiScatterPoint['domainTag'], string> = {
  CAD: '#38bdf8',
  CAE: '#f59e0b',
  CAM: '#a855f7',
  FINANCEIRO: '#10b981',
};

export const ScoobiiiScatterPlotD3: React.FC<ScoobiiiScatterPlotD3Props> = ({
  points,
  correlation,
  onSelectPoint,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [filterMode, setFilterMode] = useState<ScatterFilterMode>('all');
  const [yMetric, setYMetric] = useState<ScatterYAxisMetric>('failureRatePct');
  const [hoveredPoint, setHoveredPoint] = useState<ScoobiiiScatterPoint | null>(null);

  const visiblePoints = useMemo(() => {
    if (filterMode === 'sweep') {
      return points.filter((p) => p.series === 'sweep-uv' || p.series === 'active-uv');
    }
    if (filterMode === 'presets') {
      return points.filter(
        (p) => p.series === 'preset-cad-cae-cam' && p.domainTag !== 'FINANCEIRO'
      );
    }
    if (filterMode === 'financial') {
      return points.filter(
        (p) => p.domainTag === 'FINANCEIRO' || p.series === 'active-uv' || p.series === 'sweep-uv'
      );
    }
    return points;
  }, [points, filterMode]);

  const activePoint = useMemo(
    () => points.find((p) => p.series === 'active-uv') ?? points[0] ?? null,
    [points]
  );

  const inspectedPoint = hoveredPoint ?? activePoint;

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const innerWidth = CHART_WIDTH - MARGIN.left - MARGIN.right;
    const innerHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

    const g = svg
      .append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    const maxXData = d3.max(visiblePoints, (d) => d.subdivisionComplexity) ?? 2304;
    const xScale = d3
      .scaleLinear()
      .domain([0, Math.max(400, maxXData * 1.06)])
      .range([0, innerWidth])
      .nice();

    const maxYData =
      yMetric === 'failureRatePct'
        ? Math.max(25, d3.max(visiblePoints, (d) => d.failureRatePct) ?? 100)
        : Math.max(100, (d3.max(visiblePoints, (d) => d.unitTotalCostBrl) ?? 500) * 1.12);

    const yScale = d3
      .scaleLinear()
      .domain([0, yMetric === 'failureRatePct' ? Math.min(100, Math.ceil(maxYData / 10) * 10 + 5) : maxYData])
      .range([innerHeight, 0])
      .nice();

    // Horizontal grid lines
    g.append('g')
      .attr('class', 'grid-y')
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickSize(-innerWidth)
          .tickFormat(() => '')
      )
      .call((sel) => sel.select('.domain').remove())
      .call((sel) =>
        sel
          .selectAll('line')
          .attr('stroke', 'rgba(148,163,184,0.14)')
          .attr('stroke-dasharray', '3,3')
      );

    // Vertical grid lines
    g.append('g')
      .attr('class', 'grid-x')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(6)
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

    // Sweep curve connecting sequential U x V evaluations
    const sweepOrdered = visiblePoints
      .filter((d) => d.series === 'sweep-uv' || d.series === 'active-uv')
      .sort((a, b) => a.subdivisionComplexity - b.subdivisionComplexity);

    if (sweepOrdered.length > 1) {
      const sweepPath = d3
        .line<ScoobiiiScatterPoint>()
        .x((d) => xScale(d.subdivisionComplexity))
        .y((d) => yScale(yMetric === 'failureRatePct' ? d.failureRatePct : d.unitTotalCostBrl))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(sweepOrdered)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(56,189,248,0.45)')
        .attr('stroke-width', 2)
        .attr('d', sweepPath);
    }

    // Regression line & optimal zero-failure marker when showing failureRatePct
    if (yMetric === 'failureRatePct' && correlation.sampleCount > 1) {
      const xDomain = xScale.domain();
      const regPoints: Array<[number, number]> = [
        [
          xDomain[0],
          Math.max(0, Math.min(100, correlation.slope * xDomain[0] + correlation.intercept)),
        ],
        [
          xDomain[1],
          Math.max(0, Math.min(100, correlation.slope * xDomain[1] + correlation.intercept)),
        ],
      ];

      const regLine = d3
        .line<[number, number]>()
        .x((d) => xScale(d[0]))
        .y((d) => yScale(d[1]));

      g.append('path')
        .datum(regPoints)
        .attr('fill', 'none')
        .attr('stroke', '#f43f5e')
        .attr('stroke-width', 1.75)
        .attr('stroke-dasharray', '6,4')
        .attr('d', regLine);

      if (correlation.optimalMinSubdivisions > 0) {
        const optX = xScale(correlation.optimalMinSubdivisions);
        g.append('line')
          .attr('x1', optX)
          .attr('x2', optX)
          .attr('y1', 0)
          .attr('y2', innerHeight)
          .attr('stroke', 'rgba(16,185,129,0.55)')
          .attr('stroke-width', 1.25)
          .attr('stroke-dasharray', '4,4');

        g.append('text')
          .attr('x', Math.min(innerWidth - 115, optX + 6))
          .attr('y', 14)
          .attr('fill', '#6ee7b7')
          .attr('font-size', '10px')
          .attr('font-family', 'ui-monospace, SFMono-Regular, monospace')
          .text(`Limiar 0% falha: ${correlation.optimalMinSubdivisions} cél.`);
      }
    }

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(6))
      .call((sel) => sel.select('.domain').attr('stroke', 'rgba(148,163,184,0.35)'))
      .call((sel) => sel.selectAll('line').attr('stroke', 'rgba(148,163,184,0.35)'))
      .call((sel) =>
        sel
          .selectAll('text')
          .attr('fill', '#94a3b8')
          .attr('font-size', '10px')
          .attr('font-family', 'ui-monospace, SFMono-Regular, monospace')
      );

    g.append('g')
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickFormat((val) =>
            yMetric === 'failureRatePct' ? `${val}%` : `R$${Number(val).toFixed(0)}`
          )
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

    // Axis titles
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 38)
      .attr('text-anchor', 'middle')
      .attr('fill', '#cbd5e1')
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .text('Complexidade Paramétrica (Subdivisões U × V)');

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -46)
      .attr('text-anchor', 'middle')
      .attr('fill', '#cbd5e1')
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .text(
        yMetric === 'failureRatePct'
          ? 'Taxa de Falha SCOOBIII (%)'
          : 'Custo Unitário Fabril (R$)'
      );

    // Scatter points
    const dotsGroup = g.append('g').attr('class', 'scatter-dots');

    visiblePoints.forEach((pt) => {
      const cx = xScale(pt.subdivisionComplexity);
      const cy = yScale(yMetric === 'failureRatePct' ? pt.failureRatePct : pt.unitTotalCostBrl);
      const isActive = pt.series === 'active-uv';
      const isPreset = pt.series === 'preset-cad-cae-cam';
      const fill = pt.failureRatePct > 0 && yMetric === 'failureRatePct'
        ? '#fb7185'
        : DOMAIN_COLORS[pt.domainTag];

      if (isActive) {
        dotsGroup
          .append('circle')
          .attr('cx', cx)
          .attr('cy', cy)
          .attr('r', 11)
          .attr('fill', 'rgba(56,189,248,0.16)')
          .attr('stroke', '#38bdf8')
          .attr('stroke-width', 1.5);
      }

      if (isPreset && pt.domainTag !== 'FINANCEIRO') {
        const size = 5.5;
        dotsGroup
          .append('rect')
          .attr('x', cx - size)
          .attr('y', cy - size)
          .attr('width', size * 2)
          .attr('height', size * 2)
          .attr('rx', 1.5)
          .attr('transform', `rotate(45 ${cx} ${cy})`)
          .attr('fill', fill)
          .attr('fill-opacity', 0.9)
          .attr('stroke', '#0b0e14')
          .attr('stroke-width', 1.5)
          .style('cursor', 'pointer')
          .on('mouseenter', () => setHoveredPoint(pt))
          .on('click', () => {
            setHoveredPoint(pt);
            onSelectPoint?.(pt);
          });
      } else {
        dotsGroup
          .append('circle')
          .attr('cx', cx)
          .attr('cy', cy)
          .attr('r', isActive ? 6.5 : pt.domainTag === 'FINANCEIRO' ? 5.5 : 4.5)
          .attr('fill', fill)
          .attr('fill-opacity', isActive ? 1 : 0.88)
          .attr('stroke', isActive ? '#ffffff' : '#0b0e14')
          .attr('stroke-width', isActive ? 2 : 1.25)
          .style('cursor', 'pointer')
          .on('mouseenter', () => setHoveredPoint(pt))
          .on('click', () => {
            setHoveredPoint(pt);
            onSelectPoint?.(pt);
          });
      }
    });
  }, [visiblePoints, correlation, yMetric, onSelectPoint]);

  return (
    <div className="p-4 rounded-xl bg-[#0b0e14] border border-sky-400/25 space-y-3">
      {/* Header + Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-sky-300 uppercase tracking-wider">
            <span>Dispersão D3.js · Subdivisões U×V × Taxa de Falha SCOOBIII</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {correlation.interpretation}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {(
            [
              { id: 'all', label: 'Todos (100%)' },
              { id: 'sweep', label: 'Varredura U×V' },
              { id: 'presets', label: 'Presets CAD/CAE/CAM' },
              { id: 'financial', label: 'Financeiro ERP' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilterMode(f.id)}
              className={`px-2 py-1 rounded text-[10px] font-medium border cursor-pointer ${
                filterMode === f.id
                  ? 'bg-sky-500/20 border-sky-400/60 text-sky-200'
                  : 'bg-[#121722] border-white/10 text-slate-400 hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() =>
              setYMetric((prev) =>
                prev === 'failureRatePct' ? 'unitTotalCostBrl' : 'failureRatePct'
              )
            }
            className="px-2 py-1 rounded text-[10px] font-mono-tabular font-semibold bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 cursor-pointer"
          >
            Eixo Y: {yMetric === 'failureRatePct' ? 'Falha %' : 'Custo R$'}
          </button>
        </div>
      </div>

      {/* Regression Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <div className="px-2.5 py-1.5 rounded-lg bg-[#121722] border border-white/8">
          <span className="text-slate-500 block text-[10px]">Correlação Pearson (r)</span>
          <span className="font-mono-tabular font-bold text-sky-300">
            {correlation.pearsonR.toFixed(4)}
          </span>
        </div>
        <div className="px-2.5 py-1.5 rounded-lg bg-[#121722] border border-white/8">
          <span className="text-slate-500 block text-[10px]">Determinação (R²)</span>
          <span className="font-mono-tabular font-bold text-emerald-300">
            {(correlation.rSquared * 100).toFixed(1)}%
          </span>
        </div>
        <div className="px-2.5 py-1.5 rounded-lg bg-[#121722] border border-white/8">
          <span className="text-slate-500 block text-[10px]">Inclinação Linear</span>
          <span className="font-mono-tabular font-bold text-amber-300">
            {correlation.slope.toFixed(4)} %/cél.
          </span>
        </div>
        <div className="px-2.5 py-1.5 rounded-lg bg-[#121722] border border-white/8">
          <span className="text-slate-500 block text-[10px]">Limiar Ótimo U×V</span>
          <span className="font-mono-tabular font-bold text-slate-100">
            {correlation.optimalMinSubdivisions} células
          </span>
        </div>
      </div>

      {/* D3 SVG Canvas */}
      <div className="w-full overflow-x-auto bg-[#080b10] border border-white/8 rounded-lg p-1.5">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="w-full h-auto min-w-[460px] select-none"
          role="img"
          aria-label="Gráfico de dispersão D3.js entre subdivisões paramétricas U por V e taxa de falha SCOOBIII"
        />
      </div>

      {/* Legend + Live Point Inspector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-white/8 text-[10px]">
        <div className="flex flex-wrap items-center gap-3 text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" /> CAD NURBS
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> CAE FEA
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400 inline-block" /> CAM Toolpath
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> Financeiro ERP
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" /> Falha / Regressão
          </span>
        </div>

        {inspectedPoint && (
          <div className="px-2.5 py-1.5 rounded bg-[#121722] border border-white/10 font-mono-tabular text-slate-200">
            <strong>{inspectedPoint.label}</strong> · {inspectedPoint.uDivisions}×
            {inspectedPoint.vDivisions} ({inspectedPoint.subdivisionComplexity} cél.) · Falha{' '}
            <span
              className={
                inspectedPoint.failureRatePct === 0 ? 'text-emerald-300' : 'text-rose-300'
              }
            >
              {inspectedPoint.failureRatePct}%
            </span>{' '}
            ({inspectedPoint.totalChecks - inspectedPoint.failedChecks}/{inspectedPoint.totalChecks}) ·
            e_chord={inspectedPoint.maxChordalErrorMm}mm · Custo R${' '}
            {inspectedPoint.unitTotalCostBrl.toFixed(2)} (Margem {inspectedPoint.grossMarginPct}%)
          </div>
        )}
      </div>
    </div>
  );
};
