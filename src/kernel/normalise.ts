import { Point2 } from '../projection/types';
import {
  AnalyticArc2,
  EdgeKind,
  LineType,
  NormaliseOptions,
  NormaliseResult,
  TaggedSegment2,
} from './types';

/** Default spatial snapping and collinear tolerance in mm. */
export const DEFAULT_TOLERANCE_MM = 0.01;

/** Default chord tolerance for circular arc discretisation in mm. */
export const DEFAULT_CHORD_TOLERANCE_MM = 0.05;

/** Compute Euclidean distance between two 2D points. */
export function distance2D(a: Point2, b: Point2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Drop segments whose length is strictly less than tolerance. */
export function dropZeroLengthSegments(
  segments: readonly TaggedSegment2[],
  tolerance = DEFAULT_TOLERANCE_MM,
): TaggedSegment2[] {
  return segments.filter((s) => distance2D(s.p1, s.p2) >= tolerance);
}

/**
 * Snap endpoints within tolerance to common clustered coordinates.
 * Uses a greedy spatial clustering approach with deterministic centroid rounding.
 */
export function snapEndpoints(
  segments: readonly TaggedSegment2[],
  tolerance = DEFAULT_TOLERANCE_MM,
): TaggedSegment2[] {
  const points: Point2[] = [];
  for (const s of segments) {
    points.push(s.p1);
    points.push(s.p2);
  }

  // Canonical clusters
  const clusters: Point2[] = [];

  function getSnapped(pt: Point2): Point2 {
    for (const c of clusters) {
      if (distance2D(pt, c) <= tolerance) {
        return c;
      }
    }
    // New cluster center
    const newCluster = { x: pt.x, y: pt.y };
    clusters.push(newCluster);
    return newCluster;
  }

  return segments.map((s) => ({
    ...s,
    p1: getSnapped(s.p1),
    p2: getSnapped(s.p2),
  }));
}

/**
 * Split non-collinear segments at mutual interior intersection points.
 */
export function splitSegmentsAtIntersections(
  segments: readonly TaggedSegment2[],
  tolerance = DEFAULT_TOLERANCE_MM,
): TaggedSegment2[] {
  // Store split parameters t in [0, 1] for each segment index
  const splits: Map<number, number[]> = new Map();
  for (let i = 0; i < segments.length; i++) {
    splits.set(i, []);
  }

  const n = segments.length;
  for (let i = 0; i < n; i++) {
    const s1 = segments[i]!;
    const dx1 = s1.p2.x - s1.p1.x;
    const dy1 = s1.p2.y - s1.p1.y;
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    if (len1 < tolerance) continue;

    for (let j = i + 1; j < n; j++) {
      const s2 = segments[j]!;
      const dx2 = s2.p2.x - s2.p1.x;
      const dy2 = s2.p2.y - s2.p1.y;
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      if (len2 < tolerance) continue;

      // Check bounding box overlap with tolerance
      const minX1 = Math.min(s1.p1.x, s1.p2.x) - tolerance;
      const maxX1 = Math.max(s1.p1.x, s1.p2.x) + tolerance;
      const minY1 = Math.min(s1.p1.y, s1.p2.y) - tolerance;
      const maxY1 = Math.max(s1.p1.y, s1.p2.y) + tolerance;

      const minX2 = Math.min(s2.p1.x, s2.p2.x) - tolerance;
      const maxX2 = Math.max(s2.p1.x, s2.p2.x) + tolerance;
      const minY2 = Math.min(s2.p1.y, s2.p2.y) - tolerance;
      const maxY2 = Math.max(s2.p1.y, s2.p2.y) + tolerance;

      if (maxX1 < minX2 || minX1 > maxX2 || maxY1 < minY2 || minY1 > maxY2) {
        continue;
      }

      // 2D cross product: dx1 * dy2 - dy1 * dx2
      const denom = dx1 * dy2 - dy1 * dx2;
      const absDenom = Math.abs(denom);

      // Collinear or parallel
      if (absDenom < 1e-9) {
        continue;
      }

      const qx = s2.p1.x - s1.p1.x;
      const qy = s2.p1.y - s1.p1.y;

      const t = (qx * dy2 - qy * dx2) / denom;
      const u = (qx * dy1 - qy * dx1) / denom;

      const delta1 = tolerance / len1;
      const delta2 = tolerance / len2;

      // Only split if strictly interior (not within tolerance of endpoints)
      if (t > delta1 && t < 1 - delta1 && u > delta2 && u < 1 - delta2) {
        splits.get(i)!.push(t);
        splits.get(j)!.push(u);
      }
    }
  }

  // Subdivide each segment
  const result: TaggedSegment2[] = [];
  for (let i = 0; i < n; i++) {
    const s = segments[i]!;
    const segSplits = splits.get(i)!;
    if (segSplits.length === 0) {
      result.push(s);
      continue;
    }

    // Sort parameters
    segSplits.sort((a, b) => a - b);
    const distinctParams: number[] = [0];
    for (const t of segSplits) {
      const last = distinctParams[distinctParams.length - 1]!;
      if (t - last > tolerance / distance2D(s.p1, s.p2)) {
        distinctParams.push(t);
      }
    }
    distinctParams.push(1);

    for (let k = 0; k < distinctParams.length - 1; k++) {
      const tA = distinctParams[k]!;
      const tB = distinctParams[k + 1]!;
      const pA: Point2 = {
        x: s.p1.x + tA * (s.p2.x - s.p1.x),
        y: s.p1.y + tA * (s.p2.y - s.p1.y),
      };
      const pB: Point2 = {
        x: s.p1.x + tB * (s.p2.x - s.p1.x),
        y: s.p1.y + tB * (s.p2.y - s.p1.y),
      };
      if (distance2D(pA, pB) >= tolerance) {
        result.push({
          p1: pA,
          p2: pB,
          lineType: s.lineType,
          edgeKind: s.edgeKind,
        });
      }
    }
  }

  return result;
}

/** Check if point p is within tolerance of the infinite line passing through a and b. */
function distancePointToLine(p: Point2, a: Point2, b: Point2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-9) return distance2D(p, a);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

/** Priority helper for edge kinds: outline > sharp > smooth */
function higherEdgeKind(k1: EdgeKind, k2: EdgeKind): EdgeKind {
  if (k1 === 'outline' || k2 === 'outline') return 'outline';
  if (k1 === 'sharp' || k2 === 'sharp') return 'sharp';
  return 'smooth';
}

/**
 * Merge collinear overlapping and contiguous segments.
 * Coincident visible and hidden segments resolve to VISIBLE.
 */
export function mergeCollinearSegments(
  segments: readonly TaggedSegment2[],
  tolerance = DEFAULT_TOLERANCE_MM,
): TaggedSegment2[] {
  if (segments.length <= 1) return [...segments];

  // Group collinear segments
  interface LineGroup {
    origin: Point2;
    direction: Point2; // unit vector
    segments: TaggedSegment2[];
  }

  const groups: LineGroup[] = [];

  for (const seg of segments) {
    const dx = seg.p2.x - seg.p1.x;
    const dy = seg.p2.y - seg.p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < tolerance) continue;

    let ux = dx / len;
    let uy = dy / len;
    // Canonicalize direction: positive ux or (ux == 0 and positive uy)
    if (ux < -1e-9 || (Math.abs(ux) <= 1e-9 && uy < 0)) {
      ux = -ux;
      uy = -uy;
    }

    let placed = false;
    for (const group of groups) {
      // Check if directions are parallel: |cross(u, g.dir)| < tol
      const crossDir = Math.abs(ux * group.direction.y - uy * group.direction.x);
      if (crossDir <= 0.02) {
        // Check if endpoints of seg lie on the group line
        const d1 = distancePointToLine(seg.p1, group.origin, {
          x: group.origin.x + group.direction.x,
          y: group.origin.y + group.direction.y,
        });
        const d2 = distancePointToLine(seg.p2, group.origin, {
          x: group.origin.x + group.direction.x,
          y: group.origin.y + group.direction.y,
        });
        if (d1 <= tolerance && d2 <= tolerance) {
          group.segments.push(seg);
          placed = true;
          break;
        }
      }
    }

    if (!placed) {
      groups.push({
        origin: seg.p1,
        direction: { x: ux, y: uy },
        segments: [seg],
      });
    }
  }

  const result: TaggedSegment2[] = [];

  for (const group of groups) {
    if (group.segments.length === 1) {
      result.push(group.segments[0]!);
      continue;
    }

    // Project each segment into 1D interval along line direction
    interface Interval1D {
      sMin: number;
      sMax: number;
      lineType: LineType;
      edgeKind: EdgeKind;
    }

    const intervals: Interval1D[] = [];
    const criticalCoords: number[] = [];

    for (const seg of group.segments) {
      const s1 =
        (seg.p1.x - group.origin.x) * group.direction.x +
        (seg.p1.y - group.origin.y) * group.direction.y;
      const s2 =
        (seg.p2.x - group.origin.x) * group.direction.x +
        (seg.p2.y - group.origin.y) * group.direction.y;

      const sMin = Math.min(s1, s2);
      const sMax = Math.max(s1, s2);
      intervals.push({
        sMin,
        sMax,
        lineType: seg.lineType,
        edgeKind: seg.edgeKind,
      });
      criticalCoords.push(sMin, sMax);
    }

    // Sort critical coordinates and deduplicate within tolerance
    criticalCoords.sort((a, b) => a - b);
    const uniqueCoords: number[] = [];
    for (const c of criticalCoords) {
      const prev = uniqueCoords[uniqueCoords.length - 1];
      if (prev === undefined || c - prev > tolerance) {
        uniqueCoords.push(c);
      }
    }

    // Partition into elementary sub-intervals
    interface MergedSubInterval {
      sStart: number;
      sEnd: number;
      lineType: LineType;
      edgeKind: EdgeKind;
    }
    const subIntervals: MergedSubInterval[] = [];

    for (let i = 0; i < uniqueCoords.length - 1; i++) {
      const sA = uniqueCoords[i]!;
      const sB = uniqueCoords[i + 1]!;
      if (sB - sA < tolerance) continue;

      const sMid = (sA + sB) / 2;
      const covering = intervals.filter((iv) => iv.sMin <= sMid && sMid <= iv.sMax);
      if (covering.length === 0) continue;

      // RULE: where a visible and a hidden segment coincide, keep visible
      const hasVisible = covering.some((iv) => iv.lineType === 'visible');
      const lineType: LineType = hasVisible ? 'visible' : 'hidden';

      let edgeKind: EdgeKind = 'smooth';
      for (const iv of covering) {
        edgeKind = higherEdgeKind(edgeKind, iv.edgeKind);
      }

      subIntervals.push({
        sStart: sA,
        sEnd: sB,
        lineType,
        edgeKind,
      });
    }

    // Merge adjacent sub-intervals with the same lineType and edgeKind
    const mergedIntervals: MergedSubInterval[] = [];
    for (const current of subIntervals) {
      const prev = mergedIntervals[mergedIntervals.length - 1];
      if (
        prev &&
        prev.lineType === current.lineType &&
        prev.edgeKind === current.edgeKind &&
        Math.abs(prev.sEnd - current.sStart) <= tolerance
      ) {
        prev.sEnd = current.sEnd;
      } else {
        mergedIntervals.push({ ...current });
      }
    }

    // Convert merged 1D intervals back to 2D segments
    for (const m of mergedIntervals) {
      const p1: Point2 = {
        x: group.origin.x + m.sStart * group.direction.x,
        y: group.origin.y + m.sStart * group.direction.y,
      };
      const p2: Point2 = {
        x: group.origin.x + m.sEnd * group.direction.x,
        y: group.origin.y + m.sEnd * group.direction.y,
      };

      if (distance2D(p1, p2) >= tolerance) {
        result.push({
          p1,
          p2,
          lineType: m.lineType,
          edgeKind: m.edgeKind,
        });
      }
    }
  }

  return result;
}

/**
 * Canonicalize segment endpoints such that:
 * p1.x < p2.x or (p1.x == p2.x and p1.y <= p2.y).
 * Round coordinates to 4 decimal places for stable idempotence.
 */
export function canonicalizeSegments(
  segments: readonly TaggedSegment2[],
): TaggedSegment2[] {
  const roundCoord = (val: number) => Math.round(val * 10000) / 10000;

  return segments.map((s) => {
    const p1: Point2 = { x: roundCoord(s.p1.x), y: roundCoord(s.p1.y) };
    const p2: Point2 = { x: roundCoord(s.p2.x), y: roundCoord(s.p2.y) };

    const shouldSwap =
      p1.x > p2.x || (Math.abs(p1.x - p2.x) < 1e-6 && p1.y > p2.y);

    return {
      p1: shouldSwap ? p2 : p1,
      p2: shouldSwap ? p1 : p2,
      lineType: s.lineType,
      edgeKind: s.edgeKind,
    };
  });
}

/**
 * Attempt to fit circular arcs or complete circles from a chain of polyline segments.
 */
export function detectAnalyticArcs(
  segments: readonly TaggedSegment2[],
  chordTolerance = DEFAULT_CHORD_TOLERANCE_MM,
): AnalyticArc2[] {
  const arcs: AnalyticArc2[] = [];
  if (segments.length < 6) return arcs;

  // Extract all unique vertices by clustering endpoints within chordTolerance
  const uniqueVertices: Point2[] = [];
  for (const s of segments) {
    for (const pt of [s.p1, s.p2]) {
      const alreadyPresent = uniqueVertices.some((v) => distance2D(v, pt) <= chordTolerance);
      if (!alreadyPresent) {
        uniqueVertices.push(pt);
      }
    }
  }

  if (uniqueVertices.length < 6) return arcs;

  // Compute centroid of unique vertices
  let sumX = 0;
  let sumY = 0;
  for (const v of uniqueVertices) {
    sumX += v.x;
    sumY += v.y;
  }
  const center: Point2 = {
    x: sumX / uniqueVertices.length,
    y: sumY / uniqueVertices.length,
  };

  const radii = uniqueVertices.map((v) => distance2D(v, center));
  const minR = Math.min(...radii);
  const maxR = Math.max(...radii);
  const avgR = radii.reduce((a, b) => a + b, 0) / radii.length;

  if (avgR > 1 && maxR - minR <= Math.max(chordTolerance * 2, avgR * 0.05)) {
    // Fits a circular loop
    const first = segments[0]!;
    arcs.push({
      center,
      radius: avgR,
      startAngleRad: 0,
      endAngleRad: 2 * Math.PI,
      isFullCircle: true,
      lineType: first.lineType,
      edgeKind: first.edgeKind,
    });
  }

  return arcs;
}

/**
 * Normalise a set of 2D tagged segments:
 * 1. Drops zero-length and near-zero (< tolerance) pieces.
 * 2. Snaps endpoints within tolerance.
 * 3. Merges collinear overlapping segments and resolves coincident visible/hidden to VISIBLE.
 * 4. Splits segments at mutual interior intersections.
 * 5. Snaps endpoints post-split and prunes zero-length pieces.
 * 6. Re-merges collinear contiguous pieces if any.
 * 7. Canonicalizes segment direction and coordinates for deterministic idempotence.
 *
 * @param segments Raw tagged 2D segments.
 * @param options Snapping, collinear, and chord tolerances.
 * @returns Clean, planarised, normalized segments.
 */
export function normaliseSegments(
  segments: readonly TaggedSegment2[],
  options?: NormaliseOptions,
): TaggedSegment2[] {
  const tolerance = options?.tolerance ?? DEFAULT_TOLERANCE_MM;

  // 1. Drop zero/near-zero pieces
  let current = dropZeroLengthSegments(segments, tolerance);

  // 2. Snap endpoints within tolerance
  current = snapEndpoints(current, tolerance);
  current = dropZeroLengthSegments(current, tolerance);

  // 3. Merge collinear overlapping and contiguous segments (visible overrides hidden)
  current = mergeCollinearSegments(current, tolerance);

  // 4. Split non-collinear segments at mutual intersections
  current = splitSegmentsAtIntersections(current, tolerance);

  // 5. Snap endpoints after splitting
  current = snapEndpoints(current, tolerance);
  current = dropZeroLengthSegments(current, tolerance);

  // 6. Canonicalize endpoint ordering and coordinates
  current = canonicalizeSegments(current);

  return current;
}

/**
 * Full normalisation returning both normalized segments and optional detected analytic arcs.
 */
export function normalise(
  segments: readonly TaggedSegment2[],
  options?: NormaliseOptions,
): NormaliseResult {
  const normSegs = normaliseSegments(segments, options);
  const chordTol = options?.chordTolerance ?? DEFAULT_CHORD_TOLERANCE_MM;
  const arcs = detectAnalyticArcs(normSegs, chordTol);

  return {
    segments: normSegs,
    ...(arcs.length > 0 ? { arcs } : {}),
  };
}
