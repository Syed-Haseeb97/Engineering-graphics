import type { StageViewsResult } from '../../kernel/worker/types';

/**
 * Generate standard First-Angle Projection symbol (ISO 5456-2 / BIS SP 46):
 * Shows the elevation of a truncated cone (frustum) on the left,
 * and the side view (two concentric circles: base dia and top dia) on the right.
 */
export function generateFirstAngleSymbolSvg(x: number, y: number, scale = 1): string {
  // Canonical proportions: big dia D = 10, small dia d = 5, length L = 10
  const D = 10 * scale;
  const d = 5 * scale;
  const L = 10 * scale;
  const gap = 6 * scale;

  // Frustum elevation (trapezoid centered at y)
  const leftX = x;
  const rightX = x + L;
  const p1 = `${leftX},${y - D / 2}`;
  const p2 = `${rightX},${y - d / 2}`;
  const p3 = `${rightX},${y + d / 2}`;
  const p4 = `${leftX},${y + D / 2}`;

  // Centerline
  const clStart = x - 2 * scale;
  const clEnd = x + L + gap + D + 2 * scale;
  const centerline = `<line x1="${clStart}" y1="${y}" x2="${clEnd}" y2="${y}" stroke="#666" stroke-width="${0.25 * scale}" stroke-dasharray="${3 * scale},${1 * scale},${1 * scale},${1 * scale}" />`;

  // Concentric circles center
  const circleX = x + L + gap + D / 2;
  const outerCircle = `<circle cx="${circleX}" cy="${y}" r="${D / 2}" fill="none" stroke="#111" stroke-width="${0.5 * scale}" />`;
  const innerCircle = `<circle cx="${circleX}" cy="${y}" r="${d / 2}" fill="none" stroke="#111" stroke-width="${0.5 * scale}" />`;
  const verticalCL = `<line x1="${circleX}" y1="${y - D / 2 - 2 * scale}" x2="${circleX}" y2="${y + D / 2 + 2 * scale}" stroke="#666" stroke-width="${0.25 * scale}" stroke-dasharray="${3 * scale},${1 * scale},${1 * scale},${1 * scale}" />`;

  return `
    <g class="first-angle-symbol">
      ${centerline}
      ${verticalCL}
      <polygon points="${p1} ${p2} ${p3} ${p4}" fill="none" stroke="#111" stroke-width="${0.5 * scale}" />
      ${outerCircle}
      ${innerCircle}
    </g>
  `;
}

/**
 * Export current multiview stage result to standalone, high-fidelity SVG in mm units.
 */
export function exportStageToSvg(stage: StageViewsResult, title = 'First-Angle Orthographic Projection'): string {
  // Collect bounding box across all views
  const allSegs = [...stage.front, ...stage.top, ...stage.side];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const s of allSegs) {
    minX = Math.min(minX, s.p1.x, s.p2.x);
    maxX = Math.max(maxX, s.p1.x, s.p2.x);
    minY = Math.min(minY, s.p1.y, s.p2.y);
    maxY = Math.max(maxY, s.p1.y, s.p2.y);
  }

  if (!Number.isFinite(minX)) {
    minX = -50;
    maxX = 150;
    minY = -100;
    maxY = 100;
  }

  // Include reference lines in bounding box
  minX = Math.min(minX, -20);
  maxX = Math.max(maxX, stage.x1y1LineX + 20);
  minY = Math.min(minY, -20);
  maxY = Math.max(maxY, 20);

  const padding = 25; // mm
  const svgMinX = minX - padding;
  const svgMinY = minY - padding;
  const widthMm = maxX - minX + padding * 2;
  const heightMm = maxY - minY + padding * 2;

  // SVG coordinate system: y increases downward.
  // In our projection math:
  // Front view has y > 0 (above XY). In SVG we map Y_svg = -Y_math.
  const mapY = (mathY: number) => -mathY;

  const renderSegment = (
    s: { p1: { x: number; y: number }; p2: { x: number; y: number }; lineType: string; edgeKind: string },
    color: string,
  ) => {
    const isHidden = s.lineType === 'hidden';
    const stroke = isHidden ? '#888888' : color;
    const strokeWidth = isHidden ? 0.35 : 0.6;
    const dash = isHidden ? 'stroke-dasharray="2.5, 1.5"' : '';
    return `<line x1="${s.p1.x.toFixed(2)}" y1="${mapY(s.p1.y).toFixed(2)}" x2="${s.p2.x.toFixed(2)}" y2="${mapY(s.p2.y).toFixed(2)}" stroke="${stroke}" stroke-width="${strokeWidth}" ${dash} />`;
  };

  const frontLines = stage.front.map((s) => renderSegment(s, '#111111')).join('\n      ');
  const topLines = stage.top.map((s) => renderSegment(s, '#111111')).join('\n      ');
  const sideLines = stage.side.map((s) => renderSegment(s, '#111111')).join('\n      ');

  // Reference line XY
  const xyLeft = svgMinX + 10;
  const xyRight = svgMinX + widthMm - 10;
  const xyLine = `<line x1="${xyLeft.toFixed(2)}" y1="0" x2="${xyRight.toFixed(2)}" y2="0" stroke="#0055aa" stroke-width="0.5" />
    <text x="${(xyLeft + 2).toFixed(2)}" y="-2" fill="#0055aa" font-size="4" font-family="sans-serif" font-weight="bold">X</text>
    <text x="${(xyRight - 5).toFixed(2)}" y="-2" fill="#0055aa" font-size="4" font-family="sans-serif" font-weight="bold">Y</text>`;

  // Reference line X1Y1
  const x1y1Top = mapY(maxY + 10);
  const x1y1Bottom = mapY(minY - 10);
  const x1y1X = stage.x1y1LineX;
  const x1y1Line = `<line x1="${x1y1X.toFixed(2)}" y1="${x1y1Top.toFixed(2)}" x2="${x1y1X.toFixed(2)}" y2="${x1y1Bottom.toFixed(2)}" stroke="#aa5500" stroke-width="0.5" stroke-dasharray="4, 2" />
    <text x="${(x1y1X + 2).toFixed(2)}" y="${(x1y1Top + 5).toFixed(2)}" fill="#aa5500" font-size="3.5" font-family="sans-serif" font-weight="bold">X₁</text>
    <text x="${(x1y1X + 2).toFixed(2)}" y="${(x1y1Bottom - 2).toFixed(2)}" fill="#aa5500" font-size="3.5" font-family="sans-serif" font-weight="bold">Y₁</text>`;

  // View Labels
  const labels = `
    <text x="${(minX + 5).toFixed(2)}" y="${mapY(maxY + 5).toFixed(2)}" fill="#333333" font-size="4" font-family="sans-serif" font-weight="bold">FRONT VIEW (ELEVATION)</text>
    <text x="${(minX + 5).toFixed(2)}" y="${mapY(minY - 8).toFixed(2)}" fill="#333333" font-size="4" font-family="sans-serif" font-weight="bold">TOP VIEW (PLAN)</text>
    <text x="${(x1y1X + 5).toFixed(2)}" y="${mapY(maxY + 5).toFixed(2)}" fill="#333333" font-size="4" font-family="sans-serif" font-weight="bold">SIDE VIEW (L.H.S.V.)</text>
  `;

  // First-Angle symbol placed in bottom-right corner
  const symbolX = svgMinX + widthMm - 45;
  const symbolY = svgMinY + heightMm - 15;
  const firstAngleSymbol = generateFirstAngleSymbolSvg(symbolX, symbolY, 0.7);

  // Title block header
  const titleText = `<text x="${(svgMinX + 15).toFixed(2)}" y="${(svgMinY + 12).toFixed(2)}" fill="#111" font-size="5" font-family="sans-serif" font-weight="bold">${title} - ${stage.description}</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="${svgMinX.toFixed(2)} ${svgMinY.toFixed(2)} ${widthMm.toFixed(2)} ${heightMm.toFixed(2)}"
     width="${widthMm.toFixed(1)}mm" height="${heightMm.toFixed(1)}mm">
  <style>
    line { stroke-linecap: round; stroke-linejoin: round; }
    text { user-select: none; }
  </style>
  <rect x="${svgMinX.toFixed(2)}" y="${svgMinY.toFixed(2)}" width="${widthMm.toFixed(2)}" height="${heightMm.toFixed(2)}" fill="#ffffff" stroke="#cccccc" stroke-width="0.5" />
  ${titleText}
  ${xyLine}
  ${x1y1Line}
  ${labels}
  <g id="front-view">
    ${frontLines}
  </g>
  <g id="top-view">
    ${topLines}
  </g>
  <g id="side-view">
    ${sideLines}
  </g>
  ${firstAngleSymbol}
</svg>`;
}
