/**
 * High-Fidelity Vector SVG Plotter for A2 Drawing Sheet
 *
 * Implements ISO 5457 drawing borders, ISO 7200 title blocks, ISO 5456-2 first-angle
 * projection symbols, and ISO 128 / BIS SP 46 line styles and weights.
 */

import type { PlacedSheetModel } from './types';
import type { DraftEntity, DimensionEntity, Point2D } from '../draft/types';

/** XML-escape string. */
function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Wrap plain text into lines of roughly maxChars length. */
function wrapText(text: string, maxChars = 75): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';

  for (const w of words) {
    if (!cur) {
      cur = w;
    } else if (cur.length + 1 + w.length <= maxChars) {
      cur += ` ${w}`;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Format SVG path or stroke attributes for a CAD line type. */
function getLineTypeAttrs(lineType: DraftEntity['lineType']): {
  stroke: string;
  strokeWidth: number;
  strokeDash?: string;
} {
  switch (lineType) {
    case 'continuous':
      return { stroke: '#000000', strokeWidth: 0.5 };
    case 'dashed':
      return { stroke: '#000000', strokeWidth: 0.35, strokeDash: '3,1.5' };
    case 'centre':
      return { stroke: '#dc2626', strokeWidth: 0.2, strokeDash: '10,1.5,2,1.5' };
    case 'thin':
      return { stroke: '#64748b', strokeWidth: 0.2 };
  }
}

/**
 * Export a placed sheet model to an exact A2 vector SVG string.
 */
export function exportSheetToSVG(model: PlacedSheetModel): string {
  const { sheetWidth, sheetHeight, border, titleBlock, statementBlock, metadata } = model;

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}mm" height="${sheetHeight}mm" viewBox="0 0 ${sheetWidth} ${sheetHeight}" font-family="ISOCPEUR, Arial, Helvetica, sans-serif">`,
  );

  // Background sheet canvas
  lines.push(`  <rect width="${sheetWidth}" height="${sheetHeight}" fill="#ffffff"/>`);

  // ── 1. Sheet Borders & Centering Marks ─────────────────────────────────
  lines.push('  <g id="sheet-border">');
  // Margin inner border line (0.7mm thick per ISO 5457)
  const bW = border.xMax - border.xMin;
  const bH = border.yMax - border.yMin;
  lines.push(
    `    <rect x="${border.xMin}" y="${border.yMin}" width="${bW}" height="${bH}" fill="none" stroke="#000000" stroke-width="0.7"/>`,
  );

  // ISO Centering Marks (5mm ticks extending into sheet margins at page midpoints)
  const midX = sheetWidth / 2;
  const midY = sheetHeight / 2;
  lines.push(
    `    <line x1="${midX}" y1="0" x2="${midX}" y2="${border.yMin}" stroke="#000000" stroke-width="0.5"/>`,
  );
  lines.push(
    `    <line x1="${midX}" y1="${border.yMax}" x2="${midX}" y2="${sheetHeight}" stroke="#000000" stroke-width="0.5"/>`,
  );
  lines.push(
    `    <line x1="0" y1="${midY}" x2="${border.xMin}" y2="${midY}" stroke="#000000" stroke-width="0.5"/>`,
  );
  lines.push(
    `    <line x1="${border.xMax}" y1="${midY}" x2="${sheetWidth}" y2="${midY}" stroke="#000000" stroke-width="0.5"/>`,
  );
  lines.push('  </g>');

  // ── 2. Problem Statement Box (Above Title Block) ──────────────────────
  if (statementBlock) {
    lines.push('  <g id="problem-statement">');
    lines.push(
      `    <rect x="${statementBlock.x}" y="${statementBlock.y}" width="${statementBlock.width}" height="${statementBlock.height}" fill="#f8fafc" stroke="#000000" stroke-width="0.35"/>`,
    );
    // Header banner
    lines.push(
      `    <rect x="${statementBlock.x}" y="${statementBlock.y}" width="${statementBlock.width}" height="7" fill="#e2e8f0" stroke="#000000" stroke-width="0.25"/>`,
    );
    lines.push(
      `    <text x="${statementBlock.x + 5}" y="${statementBlock.y + 4.8}" font-size="2.8" font-weight="bold" fill="#0f172a">PROBLEM STATEMENT</text>`,
    );

    // Multiline wrapped statement
    const statementLines = wrapText(statementBlock.text, 72);
    let curY = statementBlock.y + 12;
    for (const tline of statementLines) {
      lines.push(
        `    <text x="${statementBlock.x + 5}" y="${curY.toFixed(2)}" font-size="2.6" fill="#1e293b">${esc(tline)}</text>`,
      );
      curY += 4.2;
    }

    if (statementBlock.formattedParams) {
      lines.push(
        `    <text x="${statementBlock.x + 5}" y="${(statementBlock.y + statementBlock.height - 4).toFixed(2)}" font-size="2.4" font-weight="bold" fill="#0369a1">GIVEN: ${esc(statementBlock.formattedParams)}</text>`,
      );
    }
    lines.push('  </g>');
  }

  // ── 3. Title Block & First-Angle Symbol ───────────────────────────────
  lines.push('  <g id="title-block">');
  const tbX = titleBlock.x;
  const tbY = titleBlock.y;
  const tbW = titleBlock.width;
  const tbH = titleBlock.height;

  // Title block outer border
  lines.push(
    `    <rect x="${tbX}" y="${tbY}" width="${tbW}" height="${tbH}" fill="#ffffff" stroke="#000000" stroke-width="0.5"/>`,
  );

  // Row 1: Institution & Title (Y = tbY to tbY + 15)
  lines.push(
    `    <line x1="${tbX}" y1="${tbY + 15}" x2="${tbX + tbW}" y2="${tbY + 15}" stroke="#000000" stroke-width="0.25"/>`,
  );
  lines.push(
    `    <text x="${tbX + tbW / 2}" y="${tbY + 6.5}" font-size="3.2" font-weight="bold" text-anchor="middle" fill="#000000">${esc(metadata.institution)}</text>`,
  );
  lines.push(
    `    <text x="${tbX + tbW / 2}" y="${tbY + 11.5}" font-size="2.6" font-weight="bold" text-anchor="middle" fill="#334155">${esc(metadata.title)}</text>`,
  );

  // Row 2: Topic / Problem ID & First-Angle Projection Symbol (Y = tbY + 15 to tbY + 33)
  lines.push(
    `    <line x1="${tbX}" y1="${tbY + 33}" x2="${tbX + tbW}" y2="${tbY + 33}" stroke="#000000" stroke-width="0.25"/>`,
  );
  lines.push(
    `    <line x1="${tbX + 110}" y1="${tbY + 15}" x2="${tbX + 110}" y2="${tbY + 33}" stroke="#000000" stroke-width="0.25"/>`,
  );
  lines.push(
    `    <text x="${tbX + 5}" y="${tbY + 20.5}" font-size="2.2" font-weight="bold" fill="#64748b">PROBLEM ID / TOPIC:</text>`,
  );
  lines.push(
    `    <text x="${tbX + 5}" y="${tbY + 28}" font-size="3.2" font-weight="bold" fill="#0f172a">${esc(metadata.problemId)}</text>`,
  );

  // First-Angle Projection Symbol in Right Column (X: tbX + 110 to tbX + 180, Y: tbY + 15 to tbY + 33)
  lines.push('    <g id="first-angle-symbol">');
  lines.push(
    `      <text x="${tbX + 145}" y="${tbY + 19.5}" font-size="2.0" font-weight="bold" text-anchor="middle" fill="#64748b">FIRST ANGLE PROJECTION</text>`,
  );

  // Frustum elevation (left) and Concentric circles (right)
  const symCenterY = tbY + 25.5;
  const frustumLeftX = tbX + 120;
  const frustumRightX = tbX + 132;
  const frustumD = 9.0;
  const frustumd = 4.5;
  const circleCenterX = tbX + 155;

  // Frustum polygon: left end height frustumd, right end height frustumD
  const p1 = `${frustumLeftX},${symCenterY - frustumd / 2}`;
  const p2 = `${frustumRightX},${symCenterY - frustumD / 2}`;
  const p3 = `${frustumRightX},${symCenterY + frustumD / 2}`;
  const p4 = `${frustumLeftX},${symCenterY + frustumd / 2}`;
  lines.push(
    `      <polygon points="${p1} ${p2} ${p3} ${p4}" fill="none" stroke="#000000" stroke-width="0.35"/>`,
  );

  // Concentric circles (end elevation viewed from left)
  lines.push(
    `      <circle cx="${circleCenterX}" cy="${symCenterY}" r="${frustumd / 2}" fill="none" stroke="#000000" stroke-width="0.35"/>`,
  );
  lines.push(
    `      <circle cx="${circleCenterX}" cy="${symCenterY}" r="${frustumD / 2}" fill="none" stroke="#000000" stroke-width="0.35"/>`,
  );

  // Horizontal centerline extending through frustum and circle
  lines.push(
    `      <line x1="${frustumLeftX - 3}" y1="${symCenterY}" x2="${circleCenterX + 8}" y2="${symCenterY}" stroke="#dc2626" stroke-width="0.2" stroke-dasharray="8,1,1.5,1"/>`,
  );
  // Vertical centerline across concentric circles
  lines.push(
    `      <line x1="${circleCenterX}" y1="${symCenterY - 6}" x2="${circleCenterX}" y2="${symCenterY + 6}" stroke="#dc2626" stroke-width="0.2" stroke-dasharray="8,1,1.5,1"/>`,
  );
  lines.push('    </g>');

  // Row 3: Student Details & Scale (Y = tbY + 33 to tbY + 51)
  lines.push(
    `    <line x1="${tbX}" y1="${tbY + 51}" x2="${tbX + tbW}" y2="${tbY + 51}" stroke="#000000" stroke-width="0.25"/>`,
  );
  // Column dividers
  lines.push(
    `    <line x1="${tbX + 80}" y1="${tbY + 33}" x2="${tbX + 80}" y2="${tbY + 51}" stroke="#000000" stroke-width="0.25"/>`,
  );
  lines.push(
    `    <line x1="${tbX + 130}" y1="${tbY + 33}" x2="${tbX + 130}" y2="${tbY + 51}" stroke="#000000" stroke-width="0.25"/>`,
  );
  // Sub-row dividers
  lines.push(
    `    <line x1="${tbX}" y1="${tbY + 42}" x2="${tbX + tbW}" y2="${tbY + 42}" stroke="#000000" stroke-width="0.2"/>`,
  );

  // Col 1: Name & Roll No
  lines.push(
    `    <text x="${tbX + 4}" y="${tbY + 38}" font-size="2.2" font-weight="bold" fill="#64748b">NAME:</text>`,
  );
  lines.push(
    `    <text x="${tbX + 18}" y="${tbY + 38}" font-size="2.6" font-weight="bold" fill="#0f172a">${esc(metadata.name)}</text>`,
  );
  lines.push(
    `    <text x="${tbX + 4}" y="${tbY + 47.5}" font-size="2.2" font-weight="bold" fill="#64748b">ROLL NO:</text>`,
  );
  lines.push(
    `    <text x="${tbX + 22}" y="${tbY + 47.5}" font-size="2.6" font-weight="bold" fill="#0f172a">${esc(metadata.rollNo)}</text>`,
  );

  // Col 2: Section & Date
  lines.push(
    `    <text x="${tbX + 84}" y="${tbY + 38}" font-size="2.2" font-weight="bold" fill="#64748b">SEC:</text>`,
  );
  lines.push(
    `    <text x="${tbX + 96}" y="${tbY + 38}" font-size="2.6" font-weight="bold" fill="#0f172a">${esc(metadata.section)}</text>`,
  );
  lines.push(
    `    <text x="${tbX + 84}" y="${tbY + 47.5}" font-size="2.2" font-weight="bold" fill="#64748b">DATE:</text>`,
  );
  lines.push(
    `    <text x="${tbX + 98}" y="${tbY + 47.5}" font-size="2.6" font-weight="bold" fill="#0f172a">${esc(metadata.date)}</text>`,
  );

  // Col 3: Scale & Sheet No
  lines.push(
    `    <text x="${tbX + 134}" y="${tbY + 38}" font-size="2.2" font-weight="bold" fill="#64748b">SCALE: ${esc(metadata.scale)}</text>`,
  );
  lines.push(
    `    <text x="${tbX + 134}" y="${tbY + 47.5}" font-size="2.2" font-weight="bold" fill="#64748b">SHEET NO: ${esc(metadata.sheetNo)}</text>`,
  );

  // Row 4: Standards Notice & Evaluation Box (Y = tbY + 51 to tbY + 65)
  lines.push(
    `    <line x1="${tbX + 120}" y1="${tbY + 51}" x2="${tbX + 120}" y2="${tbY + 65}" stroke="#000000" stroke-width="0.25"/>`,
  );
  lines.push(
    `    <text x="${tbX + 60}" y="${tbY + 59}" font-size="2.4" font-weight="bold" text-anchor="middle" fill="#334155">ALL DIMENSIONS IN MM UNLESS SPECIFIED</text>`,
  );
  lines.push(
    `    <text x="${tbX + 150}" y="${tbY + 56.5}" font-size="2.0" font-weight="bold" text-anchor="middle" fill="#64748b">EVALUATOR SIGNATURE</text>`,
  );
  lines.push(
    `    <text x="${tbX + 150}" y="${tbY + 61.5}" font-size="2.4" font-weight="bold" text-anchor="middle" fill="#0f172a">STATUS: VERIFIED</text>`,
  );
  lines.push('  </g>');

  // ── 4. Drawing Entities (when not blank) ──────────────────────────────
  lines.push('  <g id="drawing-entities">');
  for (const ent of model.placedEntities) {
    const style = getLineTypeAttrs(ent.lineType);
    const dashAttr = style.strokeDash ? ` stroke-dasharray="${style.strokeDash}"` : '';

    switch (ent.type) {
      case 'line':
        lines.push(
          `    <line x1="${ent.p1.x.toFixed(2)}" y1="${ent.p1.y.toFixed(2)}" x2="${ent.p2.x.toFixed(2)}" y2="${ent.p2.y.toFixed(2)}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}"${dashAttr}/>`,
        );
        break;
      case 'circle':
        lines.push(
          `    <circle cx="${ent.center.x.toFixed(2)}" cy="${ent.center.y.toFixed(2)}" r="${ent.radius.toFixed(2)}" fill="none" stroke="${style.stroke}" stroke-width="${style.strokeWidth}"${dashAttr}/>`,
        );
        break;
      case 'arc': {
        // Compute SVG arc path (A rx ry x-axis-rotation large-arc-flag sweep-flag x y)
        const startX = ent.center.x + ent.radius * Math.cos(ent.startAngleRad);
        const startY = ent.center.y + ent.radius * Math.sin(ent.startAngleRad);
        const endX = ent.center.x + ent.radius * Math.cos(ent.endAngleRad);
        const endY = ent.center.y + ent.radius * Math.sin(ent.endAngleRad);

        let delta = ent.endAngleRad - ent.startAngleRad;
        if (delta < 0) delta += 2 * Math.PI;
        const largeArc = delta > Math.PI ? 1 : 0;
        const sweep = ent.counterClockwise ? 0 : 1;

        lines.push(
          `    <path d="M ${startX.toFixed(2)} ${startY.toFixed(2)} A ${ent.radius.toFixed(2)} ${ent.radius.toFixed(2)} 0 ${largeArc} ${sweep} ${endX.toFixed(2)} ${endY.toFixed(2)}" fill="none" stroke="${style.stroke}" stroke-width="${style.strokeWidth}"${dashAttr}/>`,
        );
        break;
      }
      case 'polyline':
        if (ent.points.length > 1) {
          const ptsStr = ent.points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
          if (ent.closed) {
            lines.push(
              `    <polygon points="${ptsStr}" fill="none" stroke="${style.stroke}" stroke-width="${style.strokeWidth}"${dashAttr}/>`,
            );
          } else {
            lines.push(
              `    <polyline points="${ptsStr}" fill="none" stroke="${style.stroke}" stroke-width="${style.strokeWidth}"${dashAttr}/>`,
            );
          }
        }
        break;
      case 'dimension':
        renderSVGDimension(lines, ent);
        break;
    }
  }
  lines.push('  </g>');

  lines.push('</svg>');
  return lines.join('\n');
}

/** Render ISO dimension entity into SVG. */
function renderSVGDimension(out: string[], dim: DimensionEntity): void {
  const p1 = dim.p1;
  const p2 = dim.p2;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return;

  const offset = dim.offset ?? 10;
  const nx = -dy / len;
  const ny = dx / len;

  const d1 = { x: p1.x + nx * offset, y: p1.y + ny * offset };
  const d2 = { x: p2.x + nx * offset, y: p2.y + ny * offset };

  // Extension / Witness lines
  out.push(
    `    <line x1="${p1.x.toFixed(2)}" y1="${p1.y.toFixed(2)}" x2="${d1.x.toFixed(2)}" y2="${d1.y.toFixed(2)}" stroke="#0284c7" stroke-width="0.2"/>`,
  );
  out.push(
    `    <line x1="${p2.x.toFixed(2)}" y1="${p2.y.toFixed(2)}" x2="${d2.x.toFixed(2)}" y2="${d2.y.toFixed(2)}" stroke="#0284c7" stroke-width="0.2"/>`,
  );

  // Dimension line
  out.push(
    `    <line x1="${d1.x.toFixed(2)}" y1="${d1.y.toFixed(2)}" x2="${d2.x.toFixed(2)}" y2="${d2.y.toFixed(2)}" stroke="#0284c7" stroke-width="0.2"/>`,
  );

  // Arrowheads at d1 and d2
  const angle = Math.atan2(d2.y - d1.y, d2.x - d1.x);
  renderSVGArrowhead(out, d1, angle);
  renderSVGArrowhead(out, d2, angle + Math.PI);

  // Dimension Text with background pill
  const text = dim.text ?? `${(dim.value ?? len).toFixed(1)}`;
  const midX = (d1.x + d2.x) / 2;
  const midY = (d1.y + d2.y) / 2;
  const approxTextWidth = text.length * 2.0 + 3;

  out.push(
    `    <rect x="${(midX - approxTextWidth / 2).toFixed(2)}" y="${(midY - 2.5).toFixed(2)}" width="${approxTextWidth.toFixed(2)}" height="5" fill="#ffffff"/>`,
  );
  out.push(
    `    <text x="${midX.toFixed(2)}" y="${(midY + 1.2).toFixed(2)}" font-size="2.4" font-weight="bold" text-anchor="middle" fill="#0369a1">${esc(text)}</text>`,
  );
}

/** Render filled ISO triangular arrowhead into SVG. */
function renderSVGArrowhead(out: string[], tip: Point2D, dirRad: number, size = 3.5): void {
  const wingAngle = 0.28; // ~16 degrees
  const l1x = tip.x + Math.cos(dirRad + wingAngle) * size;
  const l1y = tip.y + Math.sin(dirRad + wingAngle) * size;
  const l2x = tip.x + Math.cos(dirRad - wingAngle) * size;
  const l2y = tip.y + Math.sin(dirRad - wingAngle) * size;

  out.push(
    `    <polygon points="${tip.x.toFixed(2)},${tip.y.toFixed(2)} ${l1x.toFixed(2)},${l1y.toFixed(2)} ${l2x.toFixed(2)},${l2y.toFixed(2)}" fill="#0284c7"/>`,
  );
}
