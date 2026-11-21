import type { DraftEntity, LineEntity } from '../../src/draft/types';
import type { TaggedSegment2 } from '../../src/kernel/types';

export interface CorpusCase {
  readonly templateId: string;
  readonly caseType:
    | 'exact'
    | 'jitter_0.2mm'
    | 'missing_hidden'
    | 'extra_line'
    | 'swap_line_type'
    | 'shifted'
    | 'badly_wrong';
  readonly description: string;
  readonly groundTruth: readonly TaggedSegment2[];
  readonly studentEntities: readonly DraftEntity[];
  readonly expectedScoreRange: {
    readonly min: number;
    readonly max: number;
  };
}

// ----------------------------------------------------------------------------
// Template 1: Straight Line Inclined to Both Planes (2 major segments)
// ----------------------------------------------------------------------------
const GT_LINE: readonly TaggedSegment2[] = [
  // Front View (Elevation)
  { p1: { x: 20, y: 15 }, p2: { x: 70, y: 45 }, lineType: 'visible', edgeKind: 'sharp' },
  // Top View (Plan)
  { p1: { x: 20, y: -20 }, p2: { x: 70, y: -50 }, lineType: 'visible', edgeKind: 'sharp' },
];

// ----------------------------------------------------------------------------
// Template 2: Square Prism with Axis Inclined to HP (10 segments)
// ----------------------------------------------------------------------------
const GT_PRISM: readonly TaggedSegment2[] = [
  // Front View: 4 outer edges + 1 hidden interior edge
  { p1: { x: 30, y: 10 }, p2: { x: 75, y: 10 }, lineType: 'visible', edgeKind: 'sharp' },
  { p1: { x: 75, y: 10 }, p2: { x: 90, y: 60 }, lineType: 'visible', edgeKind: 'sharp' },
  { p1: { x: 90, y: 60 }, p2: { x: 45, y: 60 }, lineType: 'visible', edgeKind: 'sharp' },
  { p1: { x: 45, y: 60 }, p2: { x: 30, y: 10 }, lineType: 'visible', edgeKind: 'sharp' },
  { p1: { x: 45, y: 10 }, p2: { x: 60, y: 60 }, lineType: 'hidden', edgeKind: 'sharp' }, // hidden edge

  // Top View: 4 outer edges + 1 hidden edge
  { p1: { x: 30, y: -15 }, p2: { x: 75, y: -15 }, lineType: 'visible', edgeKind: 'sharp' },
  { p1: { x: 75, y: -15 }, p2: { x: 75, y: -50 }, lineType: 'visible', edgeKind: 'sharp' },
  { p1: { x: 75, y: -50 }, p2: { x: 30, y: -50 }, lineType: 'visible', edgeKind: 'sharp' },
  { p1: { x: 30, y: -50 }, p2: { x: 30, y: -15 }, lineType: 'visible', edgeKind: 'sharp' },
  { p1: { x: 50, y: -15 }, p2: { x: 50, y: -50 }, lineType: 'hidden', edgeKind: 'sharp' },
];

// ----------------------------------------------------------------------------
// Template 3: Cone with Axis Inclined to Both Planes (12 segments)
// ----------------------------------------------------------------------------
const GT_CONE: readonly TaggedSegment2[] = [
  // Front View: Triangular generators + elliptical base arc + hidden rear arc
  { p1: { x: 30, y: 15 }, p2: { x: 70, y: 65 }, lineType: 'visible', edgeKind: 'outline' },
  { p1: { x: 70, y: 65 }, p2: { x: 90, y: 25 }, lineType: 'visible', edgeKind: 'outline' },
  { p1: { x: 30, y: 15 }, p2: { x: 60, y: 10 }, lineType: 'visible', edgeKind: 'outline' },
  { p1: { x: 60, y: 10 }, p2: { x: 90, y: 25 }, lineType: 'visible', edgeKind: 'outline' },
  { p1: { x: 30, y: 15 }, p2: { x: 60, y: 28 }, lineType: 'hidden', edgeKind: 'sharp' }, // rear hidden base curve
  { p1: { x: 60, y: 28 }, p2: { x: 90, y: 25 }, lineType: 'hidden', edgeKind: 'sharp' },

  // Top View
  { p1: { x: 25, y: -20 }, p2: { x: 75, y: -20 }, lineType: 'visible', edgeKind: 'outline' },
  { p1: { x: 75, y: -20 }, p2: { x: 75, y: -55 }, lineType: 'visible', edgeKind: 'outline' },
  { p1: { x: 75, y: -55 }, p2: { x: 25, y: -55 }, lineType: 'visible', edgeKind: 'outline' },
  { p1: { x: 25, y: -55 }, p2: { x: 25, y: -20 }, lineType: 'visible', edgeKind: 'outline' },
  { p1: { x: 25, y: -20 }, p2: { x: 65, y: -38 }, lineType: 'visible', edgeKind: 'sharp' },
  { p1: { x: 75, y: -55 }, p2: { x: 65, y: -38 }, lineType: 'hidden', edgeKind: 'sharp' },
];

function createXYLine(y = 0, x1 = 0, x2 = 120): LineEntity {
  return {
    id: 'student_xy_ref_line',
    type: 'line',
    p1: { x: x1, y },
    p2: { x: x2, y },
    lineType: 'thin',
  };
}

function segmentsToStudentLines(
  segs: readonly TaggedSegment2[],
  prefix = 'line',
): LineEntity[] {
  return segs.map((s, idx) => ({
    id: `${prefix}_${idx + 1}`,
    type: 'line',
    p1: { ...s.p1 },
    p2: { ...s.p2 },
    lineType: s.lineType === 'hidden' ? 'dashed' : 'continuous',
  }));
}

export function buildCorpus(): CorpusCase[] {
  const templates = [
    { id: 'line_inclined_both', gt: GT_LINE, edgeCount: 2 },
    { id: 'prism_inclined_hp', gt: GT_PRISM, edgeCount: 10 },
    { id: 'cone_inclined_both', gt: GT_CONE, edgeCount: 12 },
  ];

  const corpus: CorpusCase[] = [];

  for (const { id, gt, edgeCount } of templates) {
    const baseLines = segmentsToStudentLines(gt, `${id}_std`);

    // (a) Exact
    corpus.push({
      templateId: id,
      caseType: 'exact',
      description: 'Exact ground truth redrawn by student',
      groundTruth: gt,
      studentEntities: [createXYLine(0), ...baseLines],
      expectedScoreRange: { min: 95, max: 100 },
    });

    // (b) 0.2 mm Jitter (well within 0.5 mm tolerance)
    const jittered = baseLines.map((l) => ({
      ...l,
      p1: { x: l.p1.x + 0.15, y: l.p1.y - 0.18 },
      p2: { x: l.p2.x - 0.18, y: l.p2.y + 0.15 },
    }));
    corpus.push({
      templateId: id,
      caseType: 'jitter_0.2mm',
      description: 'Vertices jittered by ~0.2 mm (within 0.5 mm tolerance)',
      groundTruth: gt,
      studentEntities: [createXYLine(0), ...jittered],
      expectedScoreRange: { min: 90, max: 100 },
    });

    // (c) Missing one hidden edge
    // Note: in a 2-edge line, 1 missing edge = 50% loss. In 10/12-edge solids, 1 missing edge is ~3-5% of total length.
    const hasHidden = baseLines.some((l) => l.lineType === 'dashed');
    const missingHidden = hasHidden
      ? baseLines.filter((l, i) => i !== baseLines.findIndex((x) => x.lineType === 'dashed'))
      : baseLines.slice(0, baseLines.length - 1);
    corpus.push({
      templateId: id,
      caseType: 'missing_hidden',
      description: 'One hidden/dashed edge missing from submission',
      groundTruth: gt,
      studentEntities: [createXYLine(0), ...missingHidden],
      expectedScoreRange:
        edgeCount === 2
          ? { min: 75, max: 88 }
          : edgeCount === 10
            ? { min: 92, max: 98 }
            : { min: 94, max: 99 },
    });

    // (d) Extra line (spurious extra edge)
    // In a 2-edge line, 30mm extra line represents ~21% of total student length.
    // In a 10/12-edge solid (450mm total), a 30mm extra line represents only ~6% of total length.
    const extraLine: LineEntity = {
      id: `${id}_extra_stray`,
      type: 'line',
      p1: { x: 10, y: 55 },
      p2: { x: 30, y: 80 },
      lineType: 'continuous',
    };
    corpus.push({
      templateId: id,
      caseType: 'extra_line',
      description: 'One spurious/extra line drawn that does not match ground truth',
      groundTruth: gt,
      studentEntities: [createXYLine(0), ...baseLines, extraLine],
      expectedScoreRange:
        edgeCount === 2
          ? { min: 88, max: 96 }
          : edgeCount === 10
            ? { min: 94, max: 99 }
            : { min: 94, max: 99 },
    });

    // (e) Swap visible and hidden on one edge
    const swapped = baseLines.map((l, i) => {
      if (i === 0) {
        return {
          ...l,
          lineType: (l.lineType === 'continuous' ? 'dashed' : 'continuous') as 'continuous' | 'dashed',
        };
      }
      return l;
    });
    corpus.push({
      templateId: id,
      caseType: 'swap_line_type',
      description: 'Line type swapped (continuous drawn as hidden or vice-versa) on one edge',
      groundTruth: gt,
      studentEntities: [createXYLine(0), ...swapped],
      expectedScoreRange:
        edgeCount === 2
          ? { min: 75, max: 85 }
          : edgeCount === 10
            ? { min: 92, max: 98 }
            : { min: 92, max: 98 },
    });

    // (f) Shifted on the sheet (+45 mm X, +30 mm Y)
    const shifted = baseLines.map((l) => ({
      ...l,
      p1: { x: l.p1.x + 45, y: l.p1.y + 30 },
      p2: { x: l.p2.x + 45, y: l.p2.y + 30 },
    }));
    corpus.push({
      templateId: id,
      caseType: 'shifted',
      description: 'Drawing shifted on sheet (+45mm X, +30mm Y) along with XY line',
      groundTruth: gt,
      studentEntities: [createXYLine(30, 45, 165), ...shifted],
      expectedScoreRange: { min: 95, max: 100 },
    });

    // (g) Badly wrong (severely distorted geometry in wrong place)
    const badlyWrong: LineEntity[] = [
      { id: 'bw_1', type: 'line', p1: { x: 5, y: 5 }, p2: { x: 15, y: 15 }, lineType: 'continuous' },
      { id: 'bw_2', type: 'line', p1: { x: 15, y: 15 }, p2: { x: 25, y: 5 }, lineType: 'continuous' },
    ];
    corpus.push({
      templateId: id,
      caseType: 'badly_wrong',
      description: 'Badly wrong submission with tiny incorrect geometry',
      groundTruth: gt,
      studentEntities: [createXYLine(0), ...badlyWrong],
      expectedScoreRange: { min: 0, max: 40 },
    });
  }

  return corpus;
}
