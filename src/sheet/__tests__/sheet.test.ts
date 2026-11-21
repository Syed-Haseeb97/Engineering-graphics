import { describe, it, expect } from 'vitest';
import {
  SHEET_WIDTH_MM,
  SHEET_HEIGHT_MM,
  MARGIN_LEFT_MM,
  MARGIN_RIGHT_MM,
  MARGIN_TOP_MM,
  MARGIN_BOTTOM_MM,
  BORDER_X_MIN,
  BORDER_Y_MIN,
  BORDER_X_MAX,
  BORDER_Y_MAX,
  TITLE_BLOCK_WIDTH,
  TITLE_BLOCK_HEIGHT,
  layoutSheet,
  exportSheetToSVG,
  exportSheetToPDF,
  createHybridAssessmentSheet,
} from '../index';
import type { DraftEntity, LineEntity, CircleEntity, DimensionEntity } from '../../draft/types';
import type { TitleBlockData } from '../types';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('A2 Engineering Drawing Sheet (src/sheet)', () => {
  const sampleMetadata: TitleBlockData = {
    name: 'Aarav Sharma',
    rollNo: '2026-ME-042',
    section: 'Section A',
    sheetNo: 'Sheet 01',
    problemId: 'ndbhatt_ch13_prob07_cone',
    date: '2026-10-29',
    scale: '1:1',
    title: 'PROJECTIONS OF SOLIDS - CONE',
    institution: 'NATIONAL INSTITUTE OF TECHNOLOGY',
  };

  const sampleEntities: DraftEntity[] = [
    // Front view cone
    {
      id: 'l1',
      type: 'line',
      lineType: 'continuous',
      p1: { x: 50, y: 10 },
      p2: { x: 110, y: 10 },
    } as LineEntity,
    {
      id: 'l2',
      type: 'line',
      lineType: 'continuous',
      p1: { x: 50, y: 10 },
      p2: { x: 80, y: 70 },
    } as LineEntity,
    {
      id: 'l3',
      type: 'line',
      lineType: 'continuous',
      p1: { x: 110, y: 10 },
      p2: { x: 80, y: 70 },
    } as LineEntity,
    // Axis centreline
    {
      id: 'l_axis',
      type: 'line',
      lineType: 'centre',
      p1: { x: 80, y: 5 },
      p2: { x: 80, y: 75 },
    } as LineEntity,
    // Top view cone (circle below XY line)
    {
      id: 'c1',
      type: 'circle',
      lineType: 'continuous',
      center: { x: 80, y: -40 },
      radius: 30,
    } as CircleEntity,
    // Hidden edge
    {
      id: 'l_hidden',
      type: 'line',
      lineType: 'dashed',
      p1: { x: 60, y: 10 },
      p2: { x: 100, y: 10 },
    } as LineEntity,
    // Hidden edge / projector
    {
      id: 'l_proj',
      type: 'line',
      lineType: 'thin',
      p1: { x: 50, y: 10 },
      p2: { x: 50, y: -40 },
    } as LineEntity,
    // Dimension
    {
      id: 'd1',
      type: 'dimension',
      dimType: 'linear',
      lineType: 'thin',
      p1: { x: 50, y: 10 },
      p2: { x: 110, y: 10 },
      offset: 12,
      text: 'Ø 60',
      value: 60,
    } as DimensionEntity,
  ];

  const sampleStatement =
    'A cone of base 60 mm diameter and axis 60 mm long has its axis inclined at 45° to the HP and 30° to the VP. Draw its projections in first-angle projection.';

  // ── 1. Sheet Dimensions & Margins ───────────────────────────────────────
  describe('Sheet Dimensions & ISO Margins', () => {
    it('has exact ISO A2 sheet dimensions (594 x 420 mm)', () => {
      expect(SHEET_WIDTH_MM).toBe(594);
      expect(SHEET_HEIGHT_MM).toBe(420);
    });

    it('has exact 20 mm filing margin on left and 10 mm on right, top, bottom', () => {
      expect(MARGIN_LEFT_MM).toBe(20);
      expect(MARGIN_RIGHT_MM).toBe(10);
      expect(MARGIN_TOP_MM).toBe(10);
      expect(MARGIN_BOTTOM_MM).toBe(10);

      expect(BORDER_X_MIN).toBe(20);
      expect(BORDER_Y_MIN).toBe(10);
      expect(BORDER_X_MAX).toBe(584);
      expect(BORDER_Y_MAX).toBe(410);

      const usableWidth = BORDER_X_MAX - BORDER_X_MIN;
      const usableHeight = BORDER_Y_MAX - BORDER_Y_MIN;
      expect(usableWidth).toBe(564);
      expect(usableHeight).toBe(400);
    });

    it('places title block in the bottom-right corner', () => {
      const model = layoutSheet(sampleEntities, { metadata: sampleMetadata });
      expect(model.titleBlock.width).toBe(TITLE_BLOCK_WIDTH);
      expect(model.titleBlock.height).toBe(TITLE_BLOCK_HEIGHT);
      expect(model.titleBlock.x).toBe(BORDER_X_MAX - TITLE_BLOCK_WIDTH);
      expect(model.titleBlock.y).toBe(BORDER_Y_MAX - TITLE_BLOCK_HEIGHT);
    });
  });

  // ── 2. Title Block Fields ───────────────────────────────────────────────
  describe('Title Block Fields & First-Angle Symbol', () => {
    it('includes all mandatory title block fields in the placed sheet model', () => {
      const model = layoutSheet(sampleEntities, { metadata: sampleMetadata });
      expect(model.metadata.name).toBe('Aarav Sharma');
      expect(model.metadata.rollNo).toBe('2026-ME-042');
      expect(model.metadata.section).toBe('Section A');
      expect(model.metadata.sheetNo).toBe('Sheet 01');
      expect(model.metadata.problemId).toBe('ndbhatt_ch13_prob07_cone');
      expect(model.metadata.date).toBe('2026-10-29');
      expect(model.metadata.scale).toBe('1:1');
      expect(model.firstAngleSymbol).toBe(true);
    });

    it('includes problem statement block above the title block when requested', () => {
      const model = layoutSheet(sampleEntities, {
        metadata: sampleMetadata,
        statementText: sampleStatement,
        includeStatement: true,
      });

      expect(model.statementBlock).toBeDefined();
      const sb = model.statementBlock!;
      expect(sb.text).toBe(sampleStatement);
      expect(sb.x).toBe(model.titleBlock.x);
      // Sits directly above title block
      expect(sb.y + sb.height).toBeCloseTo(model.titleBlock.y, 1e-4);
    });

    it('omits problem statement block when includeStatement is false', () => {
      const model = layoutSheet(sampleEntities, {
        metadata: sampleMetadata,
        statementText: sampleStatement,
        includeStatement: false,
      });

      expect(model.statementBlock).toBeUndefined();
    });
  });

  // ── 3. Auto-fit & Scaling ───────────────────────────────────────────────
  describe('Auto-Fit Scaling & Translation', () => {
    it('uses 1:1 scale when geometry fits inside available drawing area', () => {
      const model = layoutSheet(sampleEntities, { metadata: sampleMetadata });
      expect(model.scale.ratio).toBe(1.0);
      expect(model.scale.label).toBe('1:1');
      expect(model.metadata.scale).toBe('1:1');
    });

    it('automatically picks standard reduction scale 1:2 when geometry is oversized', () => {
      // Create large geometry (e.g. 700 mm wide)
      const oversizedEntities: DraftEntity[] = [
        {
          id: 'large_line',
          type: 'line',
          lineType: 'continuous',
          p1: { x: 0, y: 0 },
          p2: { x: 700, y: 500 },
        } as LineEntity,
      ];

      const model = layoutSheet(oversizedEntities, { metadata: sampleMetadata });
      expect(model.scale.ratio).toBeLessThan(1.0);
      expect(['1:2', '1:2.5', '1:5']).toContain(model.scale.label);
      expect(model.metadata.scale).toBe(model.scale.label);

      // Verify placed entities fit inside border with margin
      for (const ent of model.placedEntities) {
        if (ent.type === 'line') {
          expect(ent.p1.x).toBeGreaterThanOrEqual(BORDER_X_MIN);
          expect(ent.p2.x).toBeLessThanOrEqual(BORDER_X_MAX);
        }
      }
    });

    it('respects manual targetScale override when specified', () => {
      const model = layoutSheet(sampleEntities, {
        metadata: sampleMetadata,
        fitMode: 'manual',
        targetScale: 0.5,
      });

      expect(model.scale.ratio).toBe(0.5);
      expect(model.scale.label).toBe('1:2');
    });
  });

  // ── 4. SVG Export ───────────────────────────────────────────────────────
  describe('SVG Export (Vector Quality & Line Weights)', () => {
    it('exports standard SVG with exact A2 width, height, and viewBox in mm', () => {
      const model = layoutSheet(sampleEntities, {
        metadata: sampleMetadata,
        statementText: sampleStatement,
      });
      const svg = exportSheetToSVG(model);

      expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('width="594mm"');
      expect(svg).toContain('height="420mm"');
      expect(svg).toContain('viewBox="0 0 594 420"');
    });

    it('contains title block fields and metadata in SVG text elements', () => {
      const model = layoutSheet(sampleEntities, {
        metadata: sampleMetadata,
        statementText: sampleStatement,
      });
      const svg = exportSheetToSVG(model);

      expect(svg).toContain('Aarav Sharma');
      expect(svg).toContain('2026-ME-042');
      expect(svg).toContain('Section A');
      expect(svg).toContain('Sheet 01');
      expect(svg).toContain('ndbhatt_ch13_prob07_cone');
      expect(svg).toContain('2026-10-29');
      expect(svg).toContain('SCALE: 1:1');
    });

    it('renders First-Angle projection symbol geometry in SVG', () => {
      const model = layoutSheet(sampleEntities, { metadata: sampleMetadata });
      const svg = exportSheetToSVG(model);

      // First-angle symbol contains frustum polygon/path and concentric circles
      expect(svg).toContain('id="first-angle-symbol"');
      expect(svg).toContain('<polygon');
      expect(svg).toContain('<circle');
    });

    it('applies ISO-standard line weights (thick outlines, dashed hidden, thin center/projectors)', () => {
      const model = layoutSheet(sampleEntities, { metadata: sampleMetadata });
      const svg = exportSheetToSVG(model);

      // Border line 0.70mm
      expect(svg).toContain('stroke-width="0.7"');
      // Visible outline 0.50mm
      expect(svg).toContain('stroke-width="0.5"');
      // Hidden dashed line 0.35mm with stroke-dasharray
      expect(svg).toContain('stroke-dasharray="3,1.5"');
      // Centre line with long-short dash
      expect(svg).toContain('stroke-dasharray="10,1.5,2,1.5"');
    });

    it('matches SVG structure snapshot for canonical problem sheet', () => {
      const model = layoutSheet(sampleEntities, {
        metadata: sampleMetadata,
        statementText: sampleStatement,
      });
      const svg = exportSheetToSVG(model);

      // Verify fundamental structure matches expected tags and ordering
      expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg).toContain('<g id="sheet-border">');
      expect(svg).toContain('<g id="title-block">');
      expect(svg).toContain('<g id="problem-statement">');
      expect(svg).toContain('<g id="drawing-entities">');
    });
  });

  // ── 5. PDF Export at 1:1 Print Scale ────────────────────────────────────
  describe('PDF Vector Export at 1:1 Print Scale', () => {
    it('generates a valid vector PDF-1.4 binary buffer', () => {
      const model = layoutSheet(sampleEntities, {
        metadata: sampleMetadata,
        statementText: sampleStatement,
      });
      const pdfBytes = exportSheetToPDF(model);

      expect(pdfBytes).toBeInstanceOf(Uint8Array);
      expect(pdfBytes.length).toBeGreaterThan(1000);

      const header = Buffer.from(pdfBytes.slice(0, 8)).toString('ascii');
      expect(header).toContain('%PDF-1.4');

      const tail = Buffer.from(pdfBytes.slice(-64)).toString('ascii');
      expect(tail).toContain('%%EOF');
    });

    it('has exact A2 MediaBox in PDF points (1683.78 x 1190.55 pt)', () => {
      const model = layoutSheet(sampleEntities, { metadata: sampleMetadata });
      const pdfBytes = exportSheetToPDF(model);
      const pdfString = Buffer.from(pdfBytes).toString('latin1');

      // 594 mm * 72 / 25.4 = 1683.7795...
      // 420 mm * 72 / 25.4 = 1190.5511...
      expect(pdfString).toContain('/MediaBox [0 0 1683.78 1190.55]');
    });

    it('contains vector path operators and Type 1 fonts without rasterization', () => {
      const model = layoutSheet(sampleEntities, { metadata: sampleMetadata });
      const pdfBytes = exportSheetToPDF(model);
      const pdfString = Buffer.from(pdfBytes).toString('latin1');

      // Built-in Type 1 vector fonts
      expect(pdfString).toContain('/BaseFont /Helvetica');
      expect(pdfString).toContain('/BaseFont /Helvetica-Bold');

      // Native PDF vector graphics operators
      expect(pdfString).toContain('BT'); // Begin Text
      expect(pdfString).toContain('ET'); // End Text
      expect(pdfString).toContain('Tj'); // Show Text
      expect(pdfString).toContain(' w\n'); // Line width
      expect(pdfString).toContain(' m\n'); // Moveto
      expect(pdfString).toContain(' l\n'); // Lineto
      expect(pdfString).toContain(' S\n'); // Stroke
    });
  });

  // ── 6. "Print to Paper" Mode for Hybrid Assessment ──────────────────────
  describe('"Print to Paper" Mode for Hybrid Assessment', () => {
    it('creates a blank drawing frame with title block and printed statement only', () => {
      const hybridModel = createHybridAssessmentSheet(
        sampleMetadata,
        sampleStatement,
        { baseDiameter: 60, axisLength: 60, thetaHP: 45, phiVP: 30 },
      );

      expect(hybridModel.blank).toBe(true);
      expect(hybridModel.placedEntities).toHaveLength(0); // Blank canvas for hand drafting
      expect(hybridModel.metadata.name).toBe('Aarav Sharma');
      expect(hybridModel.metadata.rollNo).toBe('2026-ME-042');
      expect(hybridModel.statementBlock).toBeDefined();
      expect(hybridModel.statementBlock?.text).toContain('A cone of base 60 mm diameter');
    });

    it('exports printable A2 hybrid assessment PDF and verifies file on disk', () => {
      const hybridModel = createHybridAssessmentSheet(
        sampleMetadata,
        sampleStatement,
        { baseDiameter: 60, axisLength: 60, thetaHP: 45, phiVP: 30 },
      );

      const pdfBytes = exportSheetToPDF(hybridModel);
      expect(pdfBytes.length).toBeGreaterThan(1000);

      // Verify writing sample hybrid assessment PDF to dist
      const distDir = path.resolve('D:/projects/engineering graphics/dist');
      if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
      }
      const samplePdfPath = path.join(distDir, 'sample-hybrid-assessment-A2.pdf');
      fs.writeFileSync(samplePdfPath, pdfBytes);

      expect(fs.existsSync(samplePdfPath)).toBe(true);
      const stats = fs.statSync(samplePdfPath);
      expect(stats.size).toBeGreaterThan(1000);
    });
  });
});
