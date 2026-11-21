import type { DraftEntity } from '../draft/types';
import { normaliseSegments } from '../kernel/normalise';
import type { TaggedSegment2 } from '../kernel/types';

/** Default chord deflection for circular arc discretisation in mm. */
export const DEFAULT_CHORD_DEFLECTION_MM = 0.05;

/**
 * Convert student DraftEntity objects into 2D TaggedSegment2 segments,
 * discretising circles and arcs identically to kernel HLR discretisation.
 */
export function entitiesToTaggedSegments(
  entities: readonly DraftEntity[],
  chordDeflection = DEFAULT_CHORD_DEFLECTION_MM,
): TaggedSegment2[] {
  const segments: TaggedSegment2[] = [];

  for (const ent of entities) {
    const isHidden = ent.lineType === 'dashed';
    const lineType: 'visible' | 'hidden' = isHidden ? 'hidden' : 'visible';

    // Ignore reference XY lines, thin construction projectors, and dimensions during shape matching
    if (
      ent.lineType === 'thin' ||
      ent.type === 'dimension' ||
      ent.id.toLowerCase().includes('xy') ||
      ent.id.toLowerCase().includes('ref')
    ) {
      continue;
    }

    if (ent.type === 'line') {
      segments.push({
        p1: { x: ent.p1.x, y: ent.p1.y },
        p2: { x: ent.p2.x, y: ent.p2.y },
        lineType,
        edgeKind: 'sharp',
      });
    } else if (ent.type === 'polyline') {
      const pts = ent.points;
      for (let i = 0; i < pts.length - 1; i++) {
        segments.push({
          p1: { x: pts[i]!.x, y: pts[i]!.y },
          p2: { x: pts[i + 1]!.x, y: pts[i + 1]!.y },
          lineType,
          edgeKind: 'sharp',
        });
      }
      if (ent.closed && pts.length > 2) {
        segments.push({
          p1: { x: pts[pts.length - 1]!.x, y: pts[pts.length - 1]!.y },
          p2: { x: pts[0]!.x, y: pts[0]!.y },
          lineType,
          edgeKind: 'sharp',
        });
      }
    } else if (ent.type === 'circle') {
      // Discretise full circle
      const r = ent.radius;
      if (r < 1e-4) continue;
      // Formula for chord count: angle per step deltaTheta = 2 * arccos(1 - delta / r)
      const maxAngleStep = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - chordDeflection / r)));
      const steps = Math.max(24, Math.ceil((2 * Math.PI) / (maxAngleStep || 0.1)));

      for (let i = 0; i < steps; i++) {
        const a1 = (2 * Math.PI * i) / steps;
        const a2 = (2 * Math.PI * (i + 1)) / steps;
        segments.push({
          p1: { x: ent.center.x + r * Math.cos(a1), y: ent.center.y + r * Math.sin(a1) },
          p2: { x: ent.center.x + r * Math.cos(a2), y: ent.center.y + r * Math.sin(a2) },
          lineType,
          edgeKind: 'outline',
        });
      }
    } else if (ent.type === 'arc') {
      const r = ent.radius;
      if (r < 1e-4) continue;

      let sweep = ent.endAngleRad - ent.startAngleRad;
      if (ent.counterClockwise && sweep < 0) sweep += 2 * Math.PI;
      if (!ent.counterClockwise && sweep > 0) sweep -= 2 * Math.PI;
      const absSweep = Math.abs(sweep);

      const maxAngleStep = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - chordDeflection / r)));
      const steps = Math.max(6, Math.ceil(absSweep / (maxAngleStep || 0.1)));

      for (let i = 0; i < steps; i++) {
        const a1 = ent.startAngleRad + (sweep * i) / steps;
        const a2 = ent.startAngleRad + (sweep * (i + 1)) / steps;
        segments.push({
          p1: { x: ent.center.x + r * Math.cos(a1), y: ent.center.y + r * Math.sin(a1) },
          p2: { x: ent.center.x + r * Math.cos(a2), y: ent.center.y + r * Math.sin(a2) },
          lineType,
          edgeKind: 'outline',
        });
      }
    }
  }

  // Normalise with kernel normaliser
  return normaliseSegments(segments, { tolerance: 0.01 });
}
