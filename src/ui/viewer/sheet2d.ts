import type { StageViewsResult } from '../../kernel/worker/types';
import type { TaggedSegment2 } from '../../kernel/types';

interface Bounds2 {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function boundsOf(segments: readonly TaggedSegment2[]): Bounds2 | null {
  if (segments.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const s of segments) {
    minX = Math.min(minX, s.p1.x, s.p2.x);
    maxX = Math.max(maxX, s.p1.x, s.p2.x);
    minY = Math.min(minY, s.p1.y, s.p2.y);
    maxY = Math.max(maxY, s.p1.y, s.p2.y);
  }

  return { minX, maxX, minY, maxY };
}

function unionBounds(list: Array<Bounds2 | null>): Bounds2 {
  const present = list.filter((b): b is Bounds2 => b !== null);
  if (present.length === 0) return { minX: -20, maxX: 120, minY: -80, maxY: 80 };

  return present.reduce<Bounds2>(
    (acc, b) => ({
      minX: Math.min(acc.minX, b.minX),
      maxX: Math.max(acc.maxX, b.maxX),
      minY: Math.min(acc.minY, b.minY),
      maxY: Math.max(acc.maxY, b.maxY),
    }),
    { ...present[0]! },
  );
}

export class ProjectionSheet2D {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public updateViews(stage: StageViewsResult): void {
    const front = boundsOf(stage.front);
    const top = boundsOf(stage.top);
    const side = boundsOf(stage.side);
    const all = unionBounds([front, top, side]);

    const mapY = (mathY: number) => -mathY;

    const renderSeg = (s: TaggedSegment2): string => {
      const isHidden = s.lineType === 'hidden';
      const stroke = isHidden ? '#64748b' : '#0f172a';
      const width = isHidden ? 0.7 : 0.95;
      const dash = isHidden ? 'stroke-dasharray="3.5, 2"' : '';
      return `<line x1="${s.p1.x.toFixed(2)}" y1="${mapY(s.p1.y).toFixed(2)}" x2="${s.p2.x.toFixed(2)}" y2="${mapY(s.p2.y).toFixed(2)}" stroke="${stroke}" stroke-width="${width}" ${dash} />`;
    };

    const frontSvg = stage.front.map(renderSeg).join('');
    const topSvg = stage.top.map(renderSeg).join('');
    const sideSvg = stage.side.map(renderSeg).join('');

    // Keep the reference line and all three views inside a generous drawing area.
    let minX = Math.min(all.minX, -15);
    const maxX = Math.max(all.maxX, stage.x1y1LineX + 25);
    const minY = Math.min(all.minY, -15);
    const maxY = Math.max(all.maxY, 20);
    const pad = 22;

    // View labels are centred over (or under) their own view and scaled to the
    // view width so neighbouring labels can never collide across the views.
    const labelFor = (
      label: string,
      b: Bounds2 | null,
      position: 'above' | 'below',
    ): string => {
      if (!b) return '';
      const width = Math.max(b.maxX - b.minX, 8);
      const fontSize = Math.min(5.6, Math.max(3.2, (width - 2) / (label.length * 0.58)));
      const centerX = (b.minX + b.maxX) / 2;
      const y =
        position === 'above'
          ? mapY(Math.max(b.maxY, all.maxY) + 7)
          : mapY(Math.min(b.minY, all.minY) - 7);
      return `<text x="${centerX.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle" fill="#334155" font-size="${fontSize.toFixed(2)}" font-family="sans-serif" font-weight="700" letter-spacing="0.45">${label}</text>`;
    };

    const labels = [
      labelFor('FRONT VIEW', front, 'above'),
      labelFor('SIDE VIEW', side, 'above'),
      labelFor('TOP VIEW', top, 'below'),
    ].join('');

    const labelWidth = 40;
    minX = Math.min(minX, all.minX - labelWidth / 2);

    const vbX = minX - pad;
    const vbY = -maxY - pad - 12;
    const vbW = maxX - minX + pad * 2 + labelWidth;
    const vbH = maxY - minY + pad * 2 + 22;

    // Reference Line XY (y = 0)
    const xyLine = `<line x1="${(vbX + 5).toFixed(2)}" y1="0" x2="${(vbX + vbW - 5).toFixed(2)}" y2="0" stroke="#0369a1" stroke-width="0.9" />
      <text x="${(vbX + 8).toFixed(2)}" y="-2.4" fill="#0369a1" font-size="5.6" font-family="sans-serif" font-weight="700">X</text>
      <text x="${(vbX + vbW - 13).toFixed(2)}" y="-2.4" fill="#0369a1" font-size="5.6" font-family="sans-serif" font-weight="700">Y</text>`;

    // Reference Line X1Y1
    const x1 = stage.x1y1LineX;
    const x1y1Line = `<line x1="${x1.toFixed(2)}" y1="${mapY(maxY + 12).toFixed(2)}" x2="${x1.toFixed(2)}" y2="${mapY(minY - 12).toFixed(2)}" stroke="#b45309" stroke-width="0.7" stroke-dasharray="5, 3" />
      <text x="${(x1 + 2.5).toFixed(2)}" y="${mapY(maxY + 8).toFixed(2)}" fill="#b45309" font-size="5" font-family="sans-serif" font-weight="700">X₁</text>
      <text x="${(x1 + 2.5).toFixed(2)}" y="${mapY(minY - 7).toFixed(2)}" fill="#b45309" font-size="5" font-family="sans-serif" font-weight="700">Y₁</text>`;

    this.container.innerHTML = `
      <svg viewBox="${vbX.toFixed(2)} ${vbY.toFixed(2)} ${vbW.toFixed(2)} ${vbH.toFixed(2)}"
           preserveAspectRatio="xMidYMid meet"
           role="img"
           aria-label="First-angle projection sheet showing front, top and side views"
           style="width: 100%; height: 100%; display: block; background: #ffffff;"
           xmlns="http://www.w3.org/2000/svg">
        <style>
          line { stroke-linecap: round; stroke-linejoin: round; }
          text { user-select: none; }
        </style>
        ${xyLine}
        ${x1y1Line}
        ${labels}
        <g id="front" role="group" aria-label="Front view">${frontSvg}</g>
        <g id="top" role="group" aria-label="Top view">${topSvg}</g>
        <g id="side" role="group" aria-label="Side view">${sideSvg}</g>
      </svg>
    `;
  }
}
