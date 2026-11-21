/**
 * Pure-TypeScript Vector PDF-1.4 Plotter for ISO A2 Drawing Sheet
 *
 * Emits exact 1:1 print scale vector PDF without external dependencies.
 * Uses native PDF vector path operators and standard Type 1 fonts (/Helvetica, /Helvetica-Bold).
 */

import type { PlacedSheetModel } from './types';
import type { DimensionEntity, Point2D } from '../draft/types';

const MM_TO_PT = 72 / 25.4; // 2.83464567 pt per mm
const KAPPA = 0.5522847498; // Cubic Bézier circle constant

/** Convert sheet millimeter X coordinate to PDF points. */
function toPdfX(xMm: number): number {
  return xMm * MM_TO_PT;
}

/** Convert sheet millimeter Y coordinate (from top) to PDF points (from bottom). */
function toPdfY(yMm: number, sheetHeightMm = 420): number {
  return (sheetHeightMm - yMm) * MM_TO_PT;
}

/** Format PDF number with 2 decimal precision. */
function f(n: number): string {
  return n.toFixed(2);
}

/** Escape plain string for PDF string literal `(...)`. */
function escapePdfText(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Wrap plain text into lines of maxChars. */
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

/**
 * Export a placed sheet model to an exact A2 vector PDF-1.4 binary buffer.
 */
export function exportSheetToPDF(model: PlacedSheetModel): Uint8Array {
  const { sheetWidth, sheetHeight, border, titleBlock, statementBlock, metadata } = model;

  const streamLines: string[] = [];

  // Helper stream emitters
  const setLineWidthMm = (mm: number) => streamLines.push(`${f(mm * MM_TO_PT)} w`);
  const setStrokeColor = (r: number, g: number, b: number) =>
    streamLines.push(`${f(r)} ${f(g)} ${f(b)} RG`);
  const setFillColor = (r: number, g: number, b: number) =>
    streamLines.push(`${f(r)} ${f(g)} ${f(b)} rg`);
  const setDash = (pattern: number[], phase = 0) => {
    if (pattern.length === 0) {
      streamLines.push('[] 0 d');
    } else {
      const pts = pattern.map((p) => f(p * MM_TO_PT)).join(' ');
      streamLines.push(`[${pts}] ${f(phase * MM_TO_PT)} d`);
    }
  };

  const drawLine = (x1: number, y1: number, x2: number, y2: number) => {
    streamLines.push(`${f(toPdfX(x1))} ${f(toPdfY(y1))} m`);
    streamLines.push(`${f(toPdfX(x2))} ${f(toPdfY(y2))} l`);
    streamLines.push('S');
  };

  const drawRect = (
    x: number,
    y: number,
    w: number,
    h: number,
    mode: 'S' | 'f' | 'B' = 'S',
  ) => {
    // In PDF, rect x y w h has y at bottom-left
    const px = toPdfX(x);
    const py = toPdfY(y + h);
    const pw = w * MM_TO_PT;
    const ph = h * MM_TO_PT;
    streamLines.push(`${f(px)} ${f(py)} ${f(pw)} ${f(ph)} re ${mode}`);
  };

  const drawCircle = (cx: number, cy: number, r: number, mode: 'S' | 'f' = 'S') => {
    const px = toPdfX(cx);
    const py = toPdfY(cy);
    const pr = r * MM_TO_PT;
    const offset = pr * KAPPA;

    streamLines.push(`${f(px + pr)} ${f(py)} m`);
    streamLines.push(
      `${f(px + pr)} ${f(py + offset)} ${f(px + offset)} ${f(py + pr)} ${f(px)} ${f(py + pr)} c`,
    );
    streamLines.push(
      `${f(px - offset)} ${f(py + pr)} ${f(px - pr)} ${f(py + offset)} ${f(px - pr)} ${f(py)} c`,
    );
    streamLines.push(
      `${f(px - pr)} ${f(py - offset)} ${f(px - offset)} ${f(py - pr)} ${f(px)} ${f(py - pr)} c`,
    );
    streamLines.push(
      `${f(px + offset)} ${f(py - pr)} ${f(px + pr)} ${f(py - offset)} ${f(px + pr)} ${f(py)} c`,
    );
    streamLines.push(`h ${mode}`);
  };

  const drawText = (
    text: string,
    x: number,
    y: number,
    sizePt: number,
    bold = false,
    color = [0, 0, 0] as [number, number, number],
  ) => {
    setFillColor(color[0], color[1], color[2]);
    streamLines.push('BT');
    streamLines.push(`/${bold ? 'F2' : 'F1'} ${f(sizePt)} Tf`);
    streamLines.push(`${f(toPdfX(x))} ${f(toPdfY(y))} Td`);
    streamLines.push(`(${escapePdfText(text)}) Tj`);
    streamLines.push('ET');
  };

  // ── 1. Sheet Border & Centering Marks ─────────────────────────────────
  setDash([]);
  setStrokeColor(0, 0, 0);
  setLineWidthMm(0.7); // 0.70mm border
  drawRect(
    border.xMin,
    border.yMin,
    border.xMax - border.xMin,
    border.yMax - border.yMin,
    'S',
  );

  // ISO Centering Marks (5mm ticks extending into margins)
  setLineWidthMm(0.5);
  const midX = sheetWidth / 2;
  const midY = sheetHeight / 2;
  drawLine(midX, 0, midX, border.yMin);
  drawLine(midX, border.yMax, midX, sheetHeight);
  drawLine(0, midY, border.xMin, midY);
  drawLine(border.xMax, midY, sheetWidth, midY);

  // ── 2. Problem Statement Block ────────────────────────────────────────
  if (statementBlock) {
    setLineWidthMm(0.35);
    setStrokeColor(0, 0, 0);
    setFillColor(0.97, 0.98, 0.99); // #f8fafc
    drawRect(statementBlock.x, statementBlock.y, statementBlock.width, statementBlock.height, 'B');

    // Header bar
    setFillColor(0.89, 0.91, 0.94); // #e2e8f0
    drawRect(statementBlock.x, statementBlock.y, statementBlock.width, 7, 'B');
    drawText('PROBLEM STATEMENT', statementBlock.x + 5, statementBlock.y + 5, 8, true, [0.06, 0.09, 0.16]);

    // Body lines
    const textLines = wrapText(statementBlock.text, 72);
    let curY = statementBlock.y + 12;
    for (const tline of textLines) {
      drawText(tline, statementBlock.x + 5, curY, 7.5, false, [0.12, 0.16, 0.23]);
      curY += 4.2;
    }

    if (statementBlock.formattedParams) {
      drawText(
        `GIVEN: ${statementBlock.formattedParams}`,
        statementBlock.x + 5,
        statementBlock.y + statementBlock.height - 4,
        7.0,
        true,
        [0.01, 0.41, 0.63],
      );
    }
  }

  // ── 3. Title Block & Projection Symbol ────────────────────────────────
  const tbX = titleBlock.x;
  const tbY = titleBlock.y;
  const tbW = titleBlock.width;
  const tbH = titleBlock.height;

  // Title block outer border
  setLineWidthMm(0.5);
  setStrokeColor(0, 0, 0);
  setFillColor(1, 1, 1);
  drawRect(tbX, tbY, tbW, tbH, 'B');

  // Internal grid lines
  setLineWidthMm(0.25);
  drawLine(tbX, tbY + 15, tbX + tbW, tbY + 15);
  drawLine(tbX, tbY + 33, tbX + tbW, tbY + 33);
  drawLine(tbX + 110, tbY + 15, tbX + 110, tbY + 33);
  drawLine(tbX, tbY + 51, tbX + tbW, tbY + 51);
  drawLine(tbX + 80, tbY + 33, tbX + 80, tbY + 51);
  drawLine(tbX + 130, tbY + 33, tbX + 130, tbY + 51);
  drawLine(tbX, tbY + 42, tbX + tbW, tbY + 42);
  drawLine(tbX + 120, tbY + 51, tbX + 120, tbY + 65);

  // Row 1: Institution & Title
  drawText(metadata.institution, tbX + 12, tbY + 6.5, 9, true, [0, 0, 0]);
  drawText(metadata.title, tbX + 12, tbY + 11.5, 7.5, true, [0.2, 0.25, 0.33]);

  // Row 2: Problem ID & Symbol
  drawText('PROBLEM ID / TOPIC:', tbX + 5, tbY + 20.5, 6.5, true, [0.39, 0.45, 0.55]);
  drawText(metadata.problemId, tbX + 5, tbY + 28, 9, true, [0.06, 0.09, 0.16]);

  // First-Angle Symbol
  drawText('FIRST ANGLE PROJECTION', tbX + 116, tbY + 19.5, 6.0, true, [0.39, 0.45, 0.55]);

  const symCenterY = tbY + 25.5;
  const frustumLeftX = tbX + 120;
  const frustumRightX = tbX + 132;
  const frustumD = 9.0;
  const frustumd = 4.5;
  const circleCenterX = tbX + 155;

  setLineWidthMm(0.35);
  setStrokeColor(0, 0, 0);
  // Frustum
  const p1x = toPdfX(frustumLeftX);
  const p1y = toPdfY(symCenterY - frustumd / 2);
  const p2x = toPdfX(frustumRightX);
  const p2y = toPdfY(symCenterY - frustumD / 2);
  const p3x = toPdfX(frustumRightX);
  const p3y = toPdfY(symCenterY + frustumD / 2);
  const p4x = toPdfX(frustumLeftX);
  const p4y = toPdfY(symCenterY + frustumd / 2);
  streamLines.push(
    `${f(p1x)} ${f(p1y)} m ${f(p2x)} ${f(p2y)} l ${f(p3x)} ${f(p3y)} l ${f(p4x)} ${f(p4y)} l h S`,
  );

  // Concentric circles
  drawCircle(circleCenterX, symCenterY, frustumd / 2, 'S');
  drawCircle(circleCenterX, symCenterY, frustumD / 2, 'S');

  // Centerlines
  setLineWidthMm(0.2);
  setStrokeColor(0.86, 0.15, 0.15); // Red centerline
  setDash([8, 1, 1.5, 1]);
  drawLine(frustumLeftX - 3, symCenterY, circleCenterX + 8, symCenterY);
  drawLine(circleCenterX, symCenterY - 6, circleCenterX, symCenterY + 6);
  setDash([]);
  setStrokeColor(0, 0, 0);

  // Row 3: Student Details
  drawText('NAME:', tbX + 4, tbY + 38, 6.5, true, [0.39, 0.45, 0.55]);
  drawText(metadata.name, tbX + 18, tbY + 38, 7.5, true, [0.06, 0.09, 0.16]);
  drawText('ROLL NO:', tbX + 4, tbY + 47.5, 6.5, true, [0.39, 0.45, 0.55]);
  drawText(metadata.rollNo, tbX + 22, tbY + 47.5, 7.5, true, [0.06, 0.09, 0.16]);

  drawText('SEC:', tbX + 84, tbY + 38, 6.5, true, [0.39, 0.45, 0.55]);
  drawText(metadata.section, tbX + 96, tbY + 38, 7.5, true, [0.06, 0.09, 0.16]);
  drawText('DATE:', tbX + 84, tbY + 47.5, 6.5, true, [0.39, 0.45, 0.55]);
  drawText(metadata.date, tbX + 98, tbY + 47.5, 7.5, true, [0.06, 0.09, 0.16]);

  drawText(`SCALE: ${metadata.scale}`, tbX + 134, tbY + 38, 6.5, true, [0.39, 0.45, 0.55]);
  drawText(`SHEET NO: ${metadata.sheetNo}`, tbX + 134, tbY + 47.5, 6.5, true, [0.39, 0.45, 0.55]);

  // Row 4: Notice & Evaluation
  drawText('ALL DIMENSIONS IN MM UNLESS SPECIFIED', tbX + 12, tbY + 59, 7.0, true, [0.2, 0.25, 0.33]);
  drawText('EVALUATOR SIGNATURE', tbX + 128, tbY + 56.5, 6.0, true, [0.39, 0.45, 0.55]);
  drawText('STATUS: VERIFIED', tbX + 134, tbY + 61.5, 7.0, true, [0.06, 0.09, 0.16]);

  // ── 4. Drawing Entities (Vector CAD Geometry) ──────────────────────────
  for (const ent of model.placedEntities) {
    switch (ent.lineType) {
      case 'continuous':
        setLineWidthMm(0.5);
        setStrokeColor(0, 0, 0);
        setDash([]);
        break;
      case 'dashed':
        setLineWidthMm(0.35);
        setStrokeColor(0.2, 0.2, 0.2);
        setDash([3, 1.5]);
        break;
      case 'centre':
        setLineWidthMm(0.2);
        setStrokeColor(0.86, 0.15, 0.15); // #dc2626
        setDash([10, 1.5, 2, 1.5]);
        break;
      case 'thin':
        setLineWidthMm(0.2);
        setStrokeColor(0.39, 0.45, 0.55); // #64748b
        setDash([]);
        break;
    }

    switch (ent.type) {
      case 'line':
        drawLine(ent.p1.x, ent.p1.y, ent.p2.x, ent.p2.y);
        break;
      case 'circle':
        drawCircle(ent.center.x, ent.center.y, ent.radius, 'S');
        break;
      case 'arc': {
        // Approximate arc with circular Bézier segments (up to 4 quadrants)
        const cx = ent.center.x;
        const cy = ent.center.y;
        const r = ent.radius;

        let delta = ent.endAngleRad - ent.startAngleRad;
        if (delta < 0) delta += 2 * Math.PI;

        const numSteps = Math.max(1, Math.ceil(delta / (Math.PI / 2)));
        const step = delta / numSteps;
        let curAngle = ent.startAngleRad;

        const startX = toPdfX(cx + r * Math.cos(curAngle));
        const startY = toPdfY(cy + r * Math.sin(curAngle));
        streamLines.push(`${f(startX)} ${f(startY)} m`);

        for (let i = 0; i < numSteps; i++) {
          const nextAngle = curAngle + step;
          const halfStep = step / 2;
          const k = (4 / 3) * Math.tan(halfStep / 2) * r;

          const p0x = cx + r * Math.cos(curAngle);
          const p0y = cy + r * Math.sin(curAngle);
          const p3x = cx + r * Math.cos(nextAngle);
          const p3y = cy + r * Math.sin(nextAngle);

          const c1x = toPdfX(p0x - k * Math.sin(curAngle));
          const c1y = toPdfY(p0y + k * Math.cos(curAngle));
          const c2x = toPdfX(p3x + k * Math.sin(nextAngle));
          const c2y = toPdfY(p3y - k * Math.cos(nextAngle));

          streamLines.push(
            `${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(toPdfX(p3x))} ${f(toPdfY(p3y))} c`,
          );
          curAngle = nextAngle;
        }
        streamLines.push('S');
        break;
      }
      case 'polyline':
        if (ent.points.length > 1) {
          const first = ent.points[0]!;
          streamLines.push(`${f(toPdfX(first.x))} ${f(toPdfY(first.y))} m`);
          for (let i = 1; i < ent.points.length; i++) {
            const pt = ent.points[i]!;
            streamLines.push(`${f(toPdfX(pt.x))} ${f(toPdfY(pt.y))} l`);
          }
          if (ent.closed) streamLines.push('h');
          streamLines.push('S');
        }
        break;
      case 'dimension':
        renderPDFDimension(streamLines, ent);
        break;
    }
  }

  // ── 5. Assemble PDF Document Objects ──────────────────────────────────
  const contentStream = streamLines.join('\n') + '\n';
  const contentStreamBytes = Buffer.from(contentStream, 'latin1');

  const pw = (sheetWidth * MM_TO_PT).toFixed(2);
  const ph = (sheetHeight * MM_TO_PT).toFixed(2);

  const objects: string[] = [];

  // Obj 1: Catalog
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Obj 2: Pages
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  // Obj 3: Page (MediaBox A2)
  objects.push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> /ProcSet [/PDF /Text] >> >>\nendobj\n`,
  );

  // Obj 4: Content Stream
  objects.push(
    `4 0 obj\n<< /Length ${contentStreamBytes.length} >>\nstream\n${contentStream}endstream\nendobj\n`,
  );

  // Obj 5: Font F1 (Helvetica)
  objects.push(
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n',
  );

  // Obj 6: Font F2 (Helvetica-Bold)
  objects.push(
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n',
  );

  // Calculate byte offsets
  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  let curOffset = Buffer.byteLength(header, 'latin1');
  const offsets: number[] = [];

  for (const obj of objects) {
    offsets.push(curOffset);
    curOffset += Buffer.byteLength(obj, 'latin1');
  }

  const startXref = curOffset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${off.toString().padStart(10, '0')} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;

  const finalPdfStr = header + objects.join('') + xref + trailer;
  return new Uint8Array(Buffer.from(finalPdfStr, 'latin1'));
}

/** Render ISO dimension entity into PDF stream. */
function renderPDFDimension(stream: string[], dim: DimensionEntity): void {
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

  stream.push(`${f(0.2 * MM_TO_PT)} w`);
  stream.push(`${f(0.01)} ${f(0.52)} ${f(0.78)} RG`); // #0284c7
  stream.push('[] 0 d');

  // Extension lines
  stream.push(
    `${f(toPdfX(p1.x))} ${f(toPdfY(p1.y))} m ${f(toPdfX(d1.x))} ${f(toPdfY(d1.y))} l S`,
  );
  stream.push(
    `${f(toPdfX(p2.x))} ${f(toPdfY(p2.y))} m ${f(toPdfX(d2.x))} ${f(toPdfY(d2.y))} l S`,
  );

  // Dimension line
  stream.push(
    `${f(toPdfX(d1.x))} ${f(toPdfY(d1.y))} m ${f(toPdfX(d2.x))} ${f(toPdfY(d2.y))} l S`,
  );

  // Arrowheads
  const angle = Math.atan2(d2.y - d1.y, d2.x - d1.x);
  renderPDFArrowhead(stream, d1, angle);
  renderPDFArrowhead(stream, d2, angle + Math.PI);

  // Text
  const text = dim.text ?? `${(dim.value ?? len).toFixed(1)}`;
  const midX = (d1.x + d2.x) / 2;
  const midY = (d1.y + d2.y) / 2;

  // Background white box
  stream.push('1 1 1 rg');
  const tw = (text.length * 2.0 + 3) * MM_TO_PT;
  const th = 4.5 * MM_TO_PT;
  stream.push(
    `${f(toPdfX(midX) - tw / 2)} ${f(toPdfY(midY) - th / 2)} ${f(tw)} ${f(th)} re f`,
  );

  stream.push(`${f(0.01)} ${f(0.41)} ${f(0.63)} rg`);
  stream.push('BT');
  stream.push(`/F2 7.0 Tf`);
  stream.push(`${f(toPdfX(midX) - (text.length * 2.0) / 2)} ${f(toPdfY(midY) - 2)} Td`);
  stream.push(`(${escapePdfText(text)}) Tj`);
  stream.push('ET');
}

/** Render filled ISO triangular arrowhead into PDF stream. */
function renderPDFArrowhead(stream: string[], tip: Point2D, dirRad: number, size = 3.5): void {
  const wingAngle = 0.28;
  const l1x = tip.x + Math.cos(dirRad + wingAngle) * size;
  const l1y = tip.y + Math.sin(dirRad + wingAngle) * size;
  const l2x = tip.x + Math.cos(dirRad - wingAngle) * size;
  const l2y = tip.y + Math.sin(dirRad - wingAngle) * size;

  stream.push(`${f(0.01)} ${f(0.52)} ${f(0.78)} rg`);
  stream.push(
    `${f(toPdfX(tip.x))} ${f(toPdfY(tip.y))} m ${f(toPdfX(l1x))} ${f(toPdfY(l1y))} l ${f(toPdfX(l2x))} ${f(toPdfY(l2y))} l h f`,
  );
}
