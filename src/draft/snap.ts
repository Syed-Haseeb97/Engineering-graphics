import type {
  DraftEntity,
  Point2D,
  SnapOptions,
  SnapResult,
  SnapType,
  ViewportTransform,
} from './types';

/** Snap priority ranking (higher value = higher precedence when competing within tolerance). */
export const SNAP_PRIORITIES: Readonly<Record<SnapType, number>> = {
  intersection: 70,
  endpoint: 60,
  centre: 50,
  midpoint: 40,
  perpendicular: 30,
  nearest: 20,
  grid: 10,
};

/** Compute Euclidean distance between two world points in mm. */
export function dist(a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Convert distance in world mm to screen pixels. */
export function mmToPixels(distMm: number, vp: ViewportTransform): number {
  return distMm * vp.scale;
}

/** Check if world distance is within pixel tolerance. */
export function isWithinTol(a: Point2D, b: Point2D, vp: ViewportTransform, tolPx: number): boolean {
  return dist(a, b) * vp.scale <= tolPx;
}

/** Snap to endpoints of lines, arcs, and polylines. */
export function snapToEndpoint(
  cursor: Point2D,
  entities: readonly DraftEntity[],
  vp: ViewportTransform,
  tolPx = 12,
): SnapResult | null {
  let best: SnapResult | null = null;
  let minScreenDist = tolPx;

  for (const entity of entities) {
    const checkPt = (pt: Point2D) => {
      const screenDist = dist(cursor, pt) * vp.scale;
      if (screenDist <= minScreenDist) {
        minScreenDist = screenDist;
        best = {
          point: { x: pt.x, y: pt.y },
          type: 'endpoint',
          entityId: entity.id,
          distancePx: screenDist,
        };
      }
    };

    if (entity.type === 'line' || entity.type === 'dimension') {
      checkPt(entity.p1);
      checkPt(entity.p2);
    } else if (entity.type === 'polyline') {
      for (const p of entity.points) {
        checkPt(p);
      }
    } else if (entity.type === 'arc') {
      const p1: Point2D = {
        x: entity.center.x + entity.radius * Math.cos(entity.startAngleRad),
        y: entity.center.y + entity.radius * Math.sin(entity.startAngleRad),
      };
      const p2: Point2D = {
        x: entity.center.x + entity.radius * Math.cos(entity.endAngleRad),
        y: entity.center.y + entity.radius * Math.sin(entity.endAngleRad),
      };
      checkPt(p1);
      checkPt(p2);
    }
  }

  return best;
}

/** Snap to midpoint of lines, arc segments, and polyline edges. */
export function snapToMidpoint(
  cursor: Point2D,
  entities: readonly DraftEntity[],
  vp: ViewportTransform,
  tolPx = 12,
): SnapResult | null {
  let best: SnapResult | null = null;
  let minScreenDist = tolPx;

  const testMid = (p1: Point2D, p2: Point2D, id: string) => {
    const mid: Point2D = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const screenDist = dist(cursor, mid) * vp.scale;
    if (screenDist <= minScreenDist) {
      minScreenDist = screenDist;
      best = {
        point: mid,
        type: 'midpoint',
        entityId: id,
        distancePx: screenDist,
      };
    }
  };

  for (const entity of entities) {
    if (entity.type === 'line' || entity.type === 'dimension') {
      testMid(entity.p1, entity.p2, entity.id);
    } else if (entity.type === 'polyline') {
      const pts = entity.points;
      for (let i = 0; i < pts.length - 1; i++) {
        testMid(pts[i]!, pts[i + 1]!, entity.id);
      }
      if (entity.closed && pts.length > 2) {
        testMid(pts[pts.length - 1]!, pts[0]!, entity.id);
      }
    } else if (entity.type === 'arc') {
      // Angular bisector midpoint
      let sweep = entity.endAngleRad - entity.startAngleRad;
      if (entity.counterClockwise && sweep < 0) sweep += 2 * Math.PI;
      if (!entity.counterClockwise && sweep < 0) sweep += 2 * Math.PI;
      const midAngle = entity.startAngleRad + sweep / 2;
      const mid: Point2D = {
        x: entity.center.x + entity.radius * Math.cos(midAngle),
        y: entity.center.y + entity.radius * Math.sin(midAngle),
      };
      const screenDist = dist(cursor, mid) * vp.scale;
      if (screenDist <= minScreenDist) {
        minScreenDist = screenDist;
        best = {
          point: mid,
          type: 'midpoint',
          entityId: entity.id,
          distancePx: screenDist,
        };
      }
    }
  }

  return best;
}

/** Snap to center of circles and arcs. */
export function snapToCenter(
  cursor: Point2D,
  entities: readonly DraftEntity[],
  vp: ViewportTransform,
  tolPx = 12,
): SnapResult | null {
  let best: SnapResult | null = null;
  let minScreenDist = tolPx;

  for (const entity of entities) {
    if (entity.type === 'circle' || entity.type === 'arc') {
      const screenDist = dist(cursor, entity.center) * vp.scale;
      if (screenDist <= minScreenDist) {
        minScreenDist = screenDist;
        best = {
          point: { ...entity.center },
          type: 'centre',
          entityId: entity.id,
          distancePx: screenDist,
        };
      }
    }
  }

  return best;
}

/** Helper: Line segment intersection in 2D. */
function intersectSegments(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  p4: Point2D,
): Point2D | null {
  const dx1 = p2.x - p1.x;
  const dy1 = p2.y - p1.y;
  const dx2 = p4.x - p3.x;
  const dy2 = p4.y - p3.y;

  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-9) return null; // Parallel or collinear

  const qx = p3.x - p1.x;
  const qy = p3.y - p1.y;

  const t = (qx * dy2 - qy * dx2) / denom;
  const u = (qx * dy1 - qy * dx1) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      x: p1.x + t * dx1,
      y: p1.y + t * dy1,
    };
  }

  return null;
}

/** Decompose an entity into straight 2D line segments for intersection queries. */
function getEntitySegments(e: DraftEntity): Array<[Point2D, Point2D]> {
  if (e.type === 'line' || e.type === 'dimension') {
    return [[e.p1, e.p2]];
  }
  if (e.type === 'polyline') {
    const segs: Array<[Point2D, Point2D]> = [];
    const pts = e.points;
    for (let i = 0; i < pts.length - 1; i++) {
      segs.push([pts[i]!, pts[i + 1]!]);
    }
    if (e.closed && pts.length > 2) {
      segs.push([pts[pts.length - 1]!, pts[0]!]);
    }
    return segs;
  }
  return [];
}

/** Snap to pairwise intersections between entities. */
export function snapToIntersection(
  cursor: Point2D,
  entities: readonly DraftEntity[],
  vp: ViewportTransform,
  tolPx = 12,
): SnapResult | null {
  let best: SnapResult | null = null;
  let minScreenDist = tolPx;

  for (let i = 0; i < entities.length; i++) {
    const segs1 = getEntitySegments(entities[i]!);
    for (let j = i + 1; j < entities.length; j++) {
      const segs2 = getEntitySegments(entities[j]!);
      for (const [a1, a2] of segs1) {
        for (const [b1, b2] of segs2) {
          const pt = intersectSegments(a1, a2, b1, b2);
          if (pt) {
            const screenDist = dist(cursor, pt) * vp.scale;
            if (screenDist <= minScreenDist) {
              minScreenDist = screenDist;
              best = {
                point: pt,
                type: 'intersection',
                distancePx: screenDist,
              };
            }
          }
        }
      }
    }
  }

  return best;
}

/** Snap to orthogonal projection from active base point onto an entity segment. */
export function snapToPerpendicular(
  cursor: Point2D,
  entities: readonly DraftEntity[],
  basePoint: Point2D | undefined,
  vp: ViewportTransform,
  tolPx = 12,
): SnapResult | null {
  if (!basePoint) return null;

  let best: SnapResult | null = null;
  let minScreenDist = tolPx;

  for (const entity of entities) {
    const segs = getEntitySegments(entity);
    for (const [p1, p2] of segs) {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 1e-9) continue;

      // Project basePoint onto segment
      const t = ((basePoint.x - p1.x) * dx + (basePoint.y - p1.y) * dy) / lenSq;
      if (t >= 0 && t <= 1) {
        const proj: Point2D = { x: p1.x + t * dx, y: p1.y + t * dy };
        const screenDist = dist(cursor, proj) * vp.scale;
        if (screenDist <= minScreenDist) {
          minScreenDist = screenDist;
          best = {
            point: proj,
            type: 'perpendicular',
            entityId: entity.id,
            distancePx: screenDist,
          };
        }
      }
    }
  }

  return best;
}

/** Snap to closest point along any entity boundary. */
export function snapToNearest(
  cursor: Point2D,
  entities: readonly DraftEntity[],
  vp: ViewportTransform,
  tolPx = 12,
): SnapResult | null {
  let best: SnapResult | null = null;
  let minScreenDist = tolPx;

  for (const entity of entities) {
    if (entity.type === 'circle') {
      const d = dist(cursor, entity.center);
      if (d > 1e-9) {
        const factor = entity.radius / d;
        const ptOnCircle: Point2D = {
          x: entity.center.x + (cursor.x - entity.center.x) * factor,
          y: entity.center.y + (cursor.y - entity.center.y) * factor,
        };
        const screenDist = dist(cursor, ptOnCircle) * vp.scale;
        if (screenDist <= minScreenDist) {
          minScreenDist = screenDist;
          best = {
            point: ptOnCircle,
            type: 'nearest',
            entityId: entity.id,
            distancePx: screenDist,
          };
        }
      }
    } else {
      const segs = getEntitySegments(entity);
      for (const [p1, p2] of segs) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 1e-9) continue;

        const t = Math.max(0, Math.min(1, ((cursor.x - p1.x) * dx + (cursor.y - p1.y) * dy) / lenSq));
        const nearestPt: Point2D = { x: p1.x + t * dx, y: p1.y + t * dy };
        const screenDist = dist(cursor, nearestPt) * vp.scale;
        if (screenDist <= minScreenDist) {
          minScreenDist = screenDist;
          best = {
            point: nearestPt,
            type: 'nearest',
            entityId: entity.id,
            distancePx: screenDist,
          };
        }
      }
    }
  }

  return best;
}

/** Snap to nearest world grid intersection. */
export function snapToGrid(
  cursor: Point2D,
  gridSpacingMm = 10,
  vp: ViewportTransform,
  tolPx = 12,
): SnapResult | null {
  if (gridSpacingMm <= 0) return null;

  const snappedX = Math.round(cursor.x / gridSpacingMm) * gridSpacingMm;
  const snappedY = Math.round(cursor.y / gridSpacingMm) * gridSpacingMm;
  const gridPt: Point2D = { x: snappedX, y: snappedY };

  const screenDist = dist(cursor, gridPt) * vp.scale;
  if (screenDist <= tolPx) {
    return {
      point: gridPt,
      type: 'grid',
      distancePx: screenDist,
    };
  }

  return null;
}

/**
 * Master snap resolver:
 * Runs all enabled snap algorithms and returns the candidate with the highest priority,
 * breaking ties by shortest distance to cursor.
 */
export function findSnapPoint(
  cursor: Point2D,
  entities: readonly DraftEntity[],
  vp: ViewportTransform,
  options?: SnapOptions,
): SnapResult | null {
  const tol = options?.tolerancePx ?? 12;
  const gridSpacing = options?.gridSpacingMm ?? 10;
  const enabled = options?.enabledTypes;

  const isEnabled = (type: SnapType) => !enabled || enabled.has(type);

  const candidates: SnapResult[] = [];

  if (isEnabled('intersection')) {
    const s = snapToIntersection(cursor, entities, vp, tol);
    if (s) candidates.push(s);
  }

  if (isEnabled('endpoint')) {
    const s = snapToEndpoint(cursor, entities, vp, tol);
    if (s) candidates.push(s);
  }

  if (isEnabled('centre')) {
    const s = snapToCenter(cursor, entities, vp, tol);
    if (s) candidates.push(s);
  }

  if (isEnabled('midpoint')) {
    const s = snapToMidpoint(cursor, entities, vp, tol);
    if (s) candidates.push(s);
  }

  if (isEnabled('perpendicular') && options?.basePoint) {
    const s = snapToPerpendicular(cursor, entities, options.basePoint, vp, tol);
    if (s) candidates.push(s);
  }

  if (isEnabled('nearest')) {
    const s = snapToNearest(cursor, entities, vp, tol);
    if (s) candidates.push(s);
  }

  if (isEnabled('grid')) {
    const s = snapToGrid(cursor, gridSpacing, vp, tol);
    if (s) candidates.push(s);
  }

  if (candidates.length === 0) return null;

  // Sort by (priority DESC, distancePx ASC)
  candidates.sort((a, b) => {
    const pA = SNAP_PRIORITIES[a.type];
    const pB = SNAP_PRIORITIES[b.type];
    if (pA !== pB) return pB - pA;
    return a.distancePx - b.distancePx;
  });

  return candidates[0] ?? null;
}
