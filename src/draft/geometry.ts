export { dist } from './snap';
import { dist } from './snap';
import type {
  DraftEntity,
  LineEntity,
  Point2D,
} from './types';

/** Distance squared. */
export function distSq(a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

/** Vector dot product. */
export function dot(a: Point2D, b: Point2D): number {
  return a.x * b.x + a.y * b.y;
}

/** 2D cross product (determinant) of vector a and vector b. */
export function cross(a: Point2D, b: Point2D): number {
  return a.x * b.y - a.y * b.x;
}

/** Intersection of two line segments in 2D. */
export function intersectSegments(
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

/** Compute distance from a point to a line segment and the projection point. */
export function pointToSegment(
  pt: Point2D,
  p1: Point2D,
  p2: Point2D,
): { distance: number; projection: Point2D; t: number } {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq < 1e-9) {
    return { distance: dist(pt, p1), projection: { ...p1 }, t: 0 };
  }

  const rawT = ((pt.x - p1.x) * dx + (pt.y - p1.y) * dy) / lenSq;
  const t = Math.max(0, Math.min(1, rawT));
  const proj: Point2D = { x: p1.x + t * dx, y: p1.y + t * dy };

  return { distance: dist(pt, proj), projection: proj, t: rawT };
}

/** Compute circumcenter circle passing through 3 non-collinear points. */
export function circleFrom3Points(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
): {
  center: Point2D;
  radius: number;
  startAngleRad: number;
  endAngleRad: number;
  counterClockwise: boolean;
} | null {
  const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
  if (Math.abs(d) < 1e-7) {
    return null; // Collinear
  }

  const p1Sq = p1.x * p1.x + p1.y * p1.y;
  const p2Sq = p2.x * p2.x + p2.y * p2.y;
  const p3Sq = p3.x * p3.x + p3.y * p3.y;

  const ux = (p1Sq * (p2.y - p3.y) + p2Sq * (p3.y - p1.y) + p3Sq * (p1.y - p2.y)) / d;
  const uy = (p1Sq * (p3.x - p2.x) + p2Sq * (p1.x - p3.x) + p3Sq * (p2.x - p1.x)) / d;
  const center: Point2D = { x: ux, y: uy };
  const radius = dist(p1, center);

  const startAngleRad = Math.atan2(p1.y - uy, p1.x - ux);
  const endAngleRad = Math.atan2(p3.y - uy, p3.x - ux);

  // Check sweep direction from p1 through p2 to p3
  const cp = (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
  const counterClockwise = cp > 0;

  return {
    center,
    radius,
    startAngleRad,
    endAngleRad,
    counterClockwise,
  };
}

/** Hit-test distance from a point to any draft entity in world mm. */
export function pointToEntityDistance(pt: Point2D, entity: DraftEntity): number {
  switch (entity.type) {
    case 'line':
      return pointToSegment(pt, entity.p1, entity.p2).distance;

    case 'circle': {
      const d = dist(pt, entity.center);
      return Math.abs(d - entity.radius);
    }

    case 'arc': {
      const d = dist(pt, entity.center);
      const angle = Math.atan2(pt.y - entity.center.y, pt.x - entity.center.x);
      // Normalize angle relative to startAngleRad
      let sweep = entity.endAngleRad - entity.startAngleRad;
      if (entity.counterClockwise && sweep < 0) sweep += 2 * Math.PI;
      if (!entity.counterClockwise && sweep > 0) sweep -= 2 * Math.PI;

      let ptDiff = angle - entity.startAngleRad;
      while (ptDiff < 0) ptDiff += 2 * Math.PI;
      while (ptDiff >= 2 * Math.PI) ptDiff -= 2 * Math.PI;

      let normSweep = sweep;
      while (normSweep < 0) normSweep += 2 * Math.PI;

      if (ptDiff <= normSweep) {
        return Math.abs(d - entity.radius);
      }
      // Distance to endpoints
      const pStart: Point2D = {
        x: entity.center.x + entity.radius * Math.cos(entity.startAngleRad),
        y: entity.center.y + entity.radius * Math.sin(entity.startAngleRad),
      };
      const pEnd: Point2D = {
        x: entity.center.x + entity.radius * Math.cos(entity.endAngleRad),
        y: entity.center.y + entity.radius * Math.sin(entity.endAngleRad),
      };
      return Math.min(dist(pt, pStart), dist(pt, pEnd));
    }

    case 'polyline': {
      let minDist = Infinity;
      const pts = entity.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const segDist = pointToSegment(pt, pts[i]!, pts[i + 1]!).distance;
        if (segDist < minDist) minDist = segDist;
      }
      if (entity.closed && pts.length > 2) {
        const segDist = pointToSegment(pt, pts[pts.length - 1]!, pts[0]!).distance;
        if (segDist < minDist) minDist = segDist;
      }
      return minDist;
    }

    case 'dimension':
      return pointToSegment(pt, entity.p1, entity.p2).distance;
  }
}

/** Offset a line segment by distance towards sidePoint. */
export function offsetLineSegment(
  p1: Point2D,
  p2: Point2D,
  distance: number,
  sidePoint: Point2D,
): [Point2D, Point2D] {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return [{ ...p1 }, { ...p2 }];

  // Normal vector: (-dy/len, dx/len)
  const nx = -dy / len;
  const ny = dx / len;

  // Determine side
  const toSideX = sidePoint.x - p1.x;
  const toSideY = sidePoint.y - p1.y;
  const sideDot = toSideX * nx + toSideY * ny;
  const sign = sideDot >= 0 ? 1 : -1;

  const offX = nx * sign * distance;
  const offY = ny * sign * distance;

  return [
    { x: p1.x + offX, y: p1.y + offY },
    { x: p2.x + offX, y: p2.y + offY },
  ];
}

/** Trim a line entity at its intersections with other entities. */
export function trimLineAtIntersections(
  targetLine: LineEntity,
  allEntities: readonly DraftEntity[],
  clickPoint: Point2D,
  idGenerator: () => string,
): { deletedId: string; created: LineEntity[] } | null {
  const p1 = targetLine.p1;
  const p2 = targetLine.p2;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-8) return null;

  // Collect all intersection parameters t on targetLine
  const tSet: number[] = [0, 1];

  for (const entity of allEntities) {
    if (entity.id === targetLine.id) continue;

    if (entity.type === 'line' || entity.type === 'dimension') {
      const inter = intersectSegments(p1, p2, entity.p1, entity.p2);
      if (inter) {
        const t = ((inter.x - p1.x) * dx + (inter.y - p1.y) * dy) / lenSq;
        if (t > 0.001 && t < 0.999) tSet.push(t);
      }
    } else if (entity.type === 'polyline') {
      const pts = entity.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const inter = intersectSegments(p1, p2, pts[i]!, pts[i + 1]!);
        if (inter) {
          const t = ((inter.x - p1.x) * dx + (inter.y - p1.y) * dy) / lenSq;
          if (t > 0.001 && t < 0.999) tSet.push(t);
        }
      }
      if (entity.closed && pts.length > 2) {
        const inter = intersectSegments(p1, p2, pts[pts.length - 1]!, pts[0]!);
        if (inter) {
          const t = ((inter.x - p1.x) * dx + (inter.y - p1.y) * dy) / lenSq;
          if (t > 0.001 && t < 0.999) tSet.push(t);
        }
      }
    }
  }

  // If no interior intersections, line cannot be trimmed
  if (tSet.length <= 2) {
    return null;
  }

  tSet.sort((a, b) => a - b);
  // Deduplicate
  const cleanT: number[] = [];
  for (const t of tSet) {
    if (cleanT.length === 0 || Math.abs(t - cleanT[cleanT.length - 1]!) > 1e-4) {
      cleanT.push(t);
    }
  }

  if (cleanT.length < 3) return null;

  // Find click parameter t
  const rawClickT = ((clickPoint.x - p1.x) * dx + (clickPoint.y - p1.y) * dy) / lenSq;

  // Determine interval containing or closest to click
  let trimIntervalIdx = 0;
  let minDiff = Infinity;
  for (let i = 0; i < cleanT.length - 1; i++) {
    const midT = (cleanT[i]! + cleanT[i + 1]!) / 2;
    const diff = Math.abs(rawClickT - midT);
    if (diff < minDiff) {
      minDiff = diff;
      trimIntervalIdx = i;
    }
  }

  // Build remaining intervals
  const created: LineEntity[] = [];
  for (let i = 0; i < cleanT.length - 1; i++) {
    if (i === trimIntervalIdx) continue; // Exclude trimmed partition
    const tStart = cleanT[i]!;
    const tEnd = cleanT[i + 1]!;
    created.push({
      id: idGenerator(),
      type: 'line',
      p1: { x: p1.x + tStart * dx, y: p1.y + tStart * dy },
      p2: { x: p1.x + tEnd * dx, y: p1.y + tEnd * dy },
      lineType: targetLine.lineType,
    });
  }

  return {
    deletedId: targetLine.id,
    created,
  };
}
