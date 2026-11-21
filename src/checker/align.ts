import type { DraftEntity, LineEntity, Point2D } from '../draft/types';
import type { AlignmentResult } from './types';

/** Angular tolerance in radians for classifying a line as horizontal (approx 2.5 degrees). */
const HORIZONTAL_SLOPE_TOLERANCE = Math.sin((2.5 * Math.PI) / 180);

/**
 * Detect the student's XY reference line and translate entities to the canonical origin.
 *
 * Alignment rules:
 * 1. Find the XY reference line among student entities:
 *    - Looks for an entity tagged with 'xy' or 'ref', OR
 *    - Looks for a thin line spanning horizontally, OR
 *    - Looks for a horizontal line that actually separates front view features from top view features.
 * 2. If no candidate exists, return typed error 'MISSING_XY_LINE'.
 * 3. If a candidate line is tilted by more than 2.5 degrees, return 'NON_HORIZONTAL_XY_LINE'.
 * 4. Translate Y so that the XY line lies at y = 0.
 * 5. Translate X using the XY line's start/fixed origin so sheet placement is never penalised.
 *
 * @param studentEntities Array of entities submitted by the student.
 * @param fixedOriginX Canonical ground-truth origin X for the XY line start (default: 0).
 * @returns AlignmentResult containing aligned entities or typed error with pedagogical hint.
 */
export function alignDrawing(
  studentEntities: readonly DraftEntity[],
  fixedOriginX = 0,
): AlignmentResult {
  if (studentEntities.length === 0) {
    return {
      success: false,
      error: 'MISSING_XY_LINE',
      hint: 'The drawing sheet is empty. Draw the reference line XY and the required projections.',
    };
  }

  const lines = studentEntities.filter((e): e is LineEntity => e.type === 'line');
  if (lines.length === 0) {
    return {
      success: false,
      error: 'MISSING_XY_LINE',
      hint: 'No straight lines found. Draw the horizontal reference line XY.',
    };
  }

  // 1. Search for explicitly tagged reference line
  let xyLine = lines.find(
    (l) => l.id.toLowerCase().includes('xy') || l.id.toLowerCase().includes('ref'),
  );

  // 2. Search for thin horizontal lines (standard ISO convention for reference line XY)
  if (!xyLine) {
    const thinCandidates = lines.filter((l) => {
      const len = Math.hypot(l.p2.x - l.p1.x, l.p2.y - l.p1.y);
      return l.lineType === 'thin' && len >= 30;
    });
    if (thinCandidates.length > 0) {
      thinCandidates.sort((a, b) => {
        const midYa = Math.abs((a.p1.y + a.p2.y) / 2);
        const midYb = Math.abs((b.p1.y + b.p2.y) / 2);
        return midYa - midYb;
      });
      xyLine = thinCandidates[0];
    }
  }

  // 3. Search for horizontal lines that separate features above and below
  if (!xyLine) {
    const separatingCandidates = lines.filter((candidate) => {
      const len = Math.hypot(candidate.p2.x - candidate.p1.x, candidate.p2.y - candidate.p1.y);
      if (len < 30) return false;
      const midY = (candidate.p1.y + candidate.p2.y) / 2;
      const hasAbove = lines.some((l) => l !== candidate && (l.p1.y > midY + 1 || l.p2.y > midY + 1));
      const hasBelow = lines.some((l) => l !== candidate && (l.p1.y < midY - 1 || l.p2.y < midY - 1));
      return hasAbove && hasBelow;
    });

    if (separatingCandidates.length > 0) {
      separatingCandidates.sort((a, b) => {
        const midYa = Math.abs((a.p1.y + a.p2.y) / 2);
        const midYb = Math.abs((b.p1.y + b.p2.y) / 2);
        return midYa - midYb;
      });
      xyLine = separatingCandidates[0];
    }
  }

  if (!xyLine) {
    return {
      success: false,
      error: 'MISSING_XY_LINE',
      hint: 'Reference line XY is missing. Draw a horizontal reference line separating elevation and plan.',
    };
  }

  // 4. Validate horizontal slope
  const dx = Math.abs(xyLine.p2.x - xyLine.p1.x);
  const dy = Math.abs(xyLine.p2.y - xyLine.p1.y);
  const len = Math.hypot(dx, dy);

  if (len > 1e-4 && dy / len > HORIZONTAL_SLOPE_TOLERANCE) {
    return {
      success: false,
      error: 'NON_HORIZONTAL_XY_LINE',
      hint: 'The reference line XY must be drawn strictly horizontal (parallel to the sheet baseline).',
    };
  }

  // 5. Compute Translation: Align XY line to y = 0, and align reference start to fixedOriginX
  const studentY = (xyLine.p1.y + xyLine.p2.y) / 2;
  const deltaY = -studentY;

  const minStudentX = Math.min(xyLine.p1.x, xyLine.p2.x);
  const deltaX = fixedOriginX - minStudentX;

  const translation: Point2D = { x: deltaX, y: deltaY };

  // 6. Translate student entities
  const alignedEntities = studentEntities.map((ent) => translateEntity(ent, deltaX, deltaY));

  return {
    success: true,
    translation,
    alignedEntities,
  };
}

function translateEntity(entity: DraftEntity, dx: number, dy: number): DraftEntity {
  switch (entity.type) {
    case 'line':
      return {
        ...entity,
        p1: { x: entity.p1.x + dx, y: entity.p1.y + dy },
        p2: { x: entity.p2.x + dx, y: entity.p2.y + dy },
      };
    case 'circle':
      return {
        ...entity,
        center: { x: entity.center.x + dx, y: entity.center.y + dy },
      };
    case 'arc':
      return {
        ...entity,
        center: { x: entity.center.x + dx, y: entity.center.y + dy },
      };
    case 'polyline':
      return {
        ...entity,
        points: entity.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      };
    case 'dimension':
      return {
        ...entity,
        p1: { x: entity.p1.x + dx, y: entity.p1.y + dy },
        p2: { x: entity.p2.x + dx, y: entity.p2.y + dy },
        p3: entity.p3 ? { x: entity.p3.x + dx, y: entity.p3.y + dy } : undefined,
      };
  }
}
