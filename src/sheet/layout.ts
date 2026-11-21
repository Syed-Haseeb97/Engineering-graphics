/**
 * Sheet Layout & Auto-Fit Engine
 *
 * Implements ISO 5457 sheet composition, bounding box analysis, and
 * standard ISO 5455 scale selection.
 */

import type {
  DraftEntity,
  Point2D,
} from '../draft/types';
import {
  SHEET_WIDTH_MM,
  SHEET_HEIGHT_MM,
  BORDER_X_MIN,
  BORDER_Y_MIN,
  BORDER_X_MAX,
  BORDER_Y_MAX,
  TITLE_BLOCK_WIDTH,
  TITLE_BLOCK_HEIGHT,
  STATEMENT_BLOCK_HEIGHT,
  STANDARD_SCALES,
  type ScaleRatio,
  type SheetLayoutOptions,
  type TitleBlockData,
  type PlacedSheetModel,
  type StatementBlockLayout,
} from './types';

export interface BoundingBox2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Compute axis-aligned bounding box of 2D drafting entities. */
export function computeEntityBounds(entities: readonly DraftEntity[]): BoundingBox2D | null {
  if (entities.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const expandPoint = (p: Point2D) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };

  for (const ent of entities) {
    switch (ent.type) {
      case 'line':
        expandPoint(ent.p1);
        expandPoint(ent.p2);
        break;
      case 'circle':
        expandPoint({ x: ent.center.x - ent.radius, y: ent.center.y - ent.radius });
        expandPoint({ x: ent.center.x + ent.radius, y: ent.center.y + ent.radius });
        break;
      case 'arc':
        expandPoint({ x: ent.center.x - ent.radius, y: ent.center.y - ent.radius });
        expandPoint({ x: ent.center.x + ent.radius, y: ent.center.y + ent.radius });
        break;
      case 'polyline':
        for (const pt of ent.points) {
          expandPoint(pt);
        }
        break;
      case 'dimension':
        expandPoint(ent.p1);
        expandPoint(ent.p2);
        if (ent.p3) expandPoint(ent.p3);
        if (ent.offset) {
          const dx = ent.p2.x - ent.p1.x;
          const dy = ent.p2.y - ent.p1.y;
          const len = Math.hypot(dx, dy);
          if (len > 1e-4) {
            const nx = -dy / len;
            const ny = dx / len;
            expandPoint({ x: ent.p1.x + nx * ent.offset, y: ent.p1.y + ny * ent.offset });
            expandPoint({ x: ent.p2.x + nx * ent.offset, y: ent.p2.y + ny * ent.offset });
          }
        }
        break;
    }
  }

  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/** Format parameters map into concise engineering string (e.g. "Ø40 x L60 | θ=45° | φ=30°"). */
function formatParameters(params?: Record<string, string | number>): string | undefined {
  if (!params || Object.keys(params).length === 0) return undefined;
  return Object.entries(params)
    .map(([key, val]) => `${key}=${val}`)
    .join(', ');
}

/** Determine the best standard ISO scale that fits the given dimensions. */
export function selectStandardScale(
  widthMm: number,
  heightMm: number,
  availWidthMm: number,
  availHeightMm: number,
): ScaleRatio {
  // If comfortably fits at 1:1, use 1:1
  if (widthMm <= availWidthMm && heightMm <= availHeightMm) {
    return { ratio: 1.0, label: '1:1' };
  }

  // Iterate over standard reduction scales
  for (const scale of STANDARD_SCALES) {
    if (scale.ratio <= 1.0) {
      if (widthMm * scale.ratio <= availWidthMm && heightMm * scale.ratio <= availHeightMm) {
        return scale;
      }
    }
  }

  // Fallback for massive drawings
  const autoRatio = Math.min(availWidthMm / widthMm, availHeightMm / heightMm) * 0.9;
  return { ratio: autoRatio, label: `1:${Math.round(1 / autoRatio)}` };
}

/**
 * Layout a set of 2D CAD entities onto an ISO A2 sheet model.
 */
export function layoutSheet(
  entities: readonly DraftEntity[],
  options: SheetLayoutOptions = {},
): PlacedSheetModel {
  const isBlank = Boolean(options.blank);

  const border = {
    xMin: BORDER_X_MIN,
    yMin: BORDER_Y_MIN,
    xMax: BORDER_X_MAX,
    yMax: BORDER_Y_MAX,
  };

  const titleBlock = {
    x: BORDER_X_MAX - TITLE_BLOCK_WIDTH,
    y: BORDER_Y_MAX - TITLE_BLOCK_HEIGHT,
    width: TITLE_BLOCK_WIDTH,
    height: TITLE_BLOCK_HEIGHT,
  };

  const includeStatement =
    options.includeStatement !== false && Boolean(options.statementText || isBlank);

  let statementBlock: StatementBlockLayout | undefined = undefined;
  if (includeStatement && options.statementText) {
    statementBlock = {
      x: titleBlock.x,
      y: titleBlock.y - STATEMENT_BLOCK_HEIGHT,
      width: TITLE_BLOCK_WIDTH,
      height: STATEMENT_BLOCK_HEIGHT,
      text: options.statementText,
      formattedParams: formatParameters(options.parameters),
    };
  }

  // Available drawing area (primary zone left of title block)
  // Left border = 20, right border = 584. Title block starts at x=404.
  // Primary drawing width = 404 - 20 - 20 (padding) = 364 mm.
  // Available height = 410 - 10 - 20 (padding) = 380 mm.
  const targetCenterX = 210;
  const targetCenterY = 210;
  const availWidth = 360;
  const availHeight = 360;

  let scale: ScaleRatio = { ratio: 1.0, label: '1:1' };
  let placedEntities: DraftEntity[] = [];

  if (!isBlank && entities.length > 0) {
    const bounds = computeEntityBounds(entities);
    if (bounds) {
      const worldW = Math.max(1, bounds.maxX - bounds.minX);
      const worldH = Math.max(1, bounds.maxY - bounds.minY);

      if (options.fitMode === 'manual' && options.targetScale) {
        const ratio = options.targetScale;
        const matching = STANDARD_SCALES.find((s) => Math.abs(s.ratio - ratio) < 1e-4);
        scale = matching ?? {
          ratio,
          label: ratio < 1 ? `1:${Math.round(1 / ratio)}` : `${Math.round(ratio)}:1`,
        };
      } else if (options.fitMode === '1:1') {
        scale = { ratio: 1.0, label: '1:1' };
      } else {
        scale = selectStandardScale(worldW, worldH, availWidth, availHeight);
      }

      const worldCenterX = (bounds.minX + bounds.maxX) / 2;
      const worldCenterY = (bounds.minY + bounds.maxY) / 2;

      // Transform world (X, Y) to sheet (x, y). Note vertical flip: CAD +Y (up) -> Sheet -y (up)
      const toSheetX = (x: number) => targetCenterX + (x - worldCenterX) * scale.ratio;
      const toSheetY = (y: number) => targetCenterY - (y - worldCenterY) * scale.ratio;

      placedEntities = entities.map((e): DraftEntity => {
        switch (e.type) {
          case 'line':
            return {
              ...e,
              p1: { x: toSheetX(e.p1.x), y: toSheetY(e.p1.y) },
              p2: { x: toSheetX(e.p2.x), y: toSheetY(e.p2.y) },
            };
          case 'circle':
            return {
              ...e,
              center: { x: toSheetX(e.center.x), y: toSheetY(e.center.y) },
              radius: e.radius * scale.ratio,
            };
          case 'arc':
            return {
              ...e,
              center: { x: toSheetX(e.center.x), y: toSheetY(e.center.y) },
              radius: e.radius * scale.ratio,
              // Invert angle for vertical reflection
              startAngleRad: -e.endAngleRad,
              endAngleRad: -e.startAngleRad,
              counterClockwise: !e.counterClockwise,
            };
          case 'polyline':
            return {
              ...e,
              points: e.points.map((p) => ({ x: toSheetX(p.x), y: toSheetY(p.y) })),
            };
          case 'dimension': {
            const p1 = { x: toSheetX(e.p1.x), y: toSheetY(e.p1.y) };
            const p2 = { x: toSheetX(e.p2.x), y: toSheetY(e.p2.y) };
            const p3 = e.p3 ? { x: toSheetX(e.p3.x), y: toSheetY(e.p3.y) } : undefined;
            return {
              ...e,
              p1,
              p2,
              p3,
              offset: (e.offset ?? 10) * scale.ratio,
            };
          }
        }
      });
    }
  }

  const rawMeta = options.metadata ?? {};
  const effectiveScaleLabel =
    options.fitMode === 'manual' && rawMeta.scale ? rawMeta.scale : scale.label;

  const metadata: Required<TitleBlockData> = {
    name: rawMeta.name ?? 'STUDENT NAME',
    rollNo: rawMeta.rollNo ?? 'ROLL NUMBER',
    section: rawMeta.section ?? 'SECTION',
    sheetNo: rawMeta.sheetNo ?? 'SHEET 01',
    problemId: rawMeta.problemId ?? 'PROBLEM_01',
    date: rawMeta.date ?? new Date().toISOString().split('T')[0]!,
    scale: effectiveScaleLabel,
    title: rawMeta.title ?? 'ENGINEERING GRAPHICS - FIRST ANGLE PROJECTION',
    institution: rawMeta.institution ?? 'DEPARTMENT OF MECHANICAL ENGINEERING',
  };

  return {
    sheetWidth: SHEET_WIDTH_MM,
    sheetHeight: SHEET_HEIGHT_MM,
    border,
    titleBlock,
    statementBlock,
    scale,
    offset: { x: targetCenterX, y: targetCenterY },
    placedEntities,
    metadata,
    firstAngleSymbol: true,
    blank: isBlank,
  };
}

/** Helper to generate a blank hybrid assessment sheet model. */
export function createHybridAssessmentSheet(
  metadata: Partial<TitleBlockData>,
  statementText: string,
  parameters?: Record<string, string | number>,
): PlacedSheetModel {
  return layoutSheet([], {
    metadata: { ...metadata, scale: '1:1' },
    statementText,
    parameters,
    includeStatement: true,
    blank: true,
    fitMode: '1:1',
  });
}
