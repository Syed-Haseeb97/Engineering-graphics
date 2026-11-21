import type { DraftEntity, Point2D } from '../../draft/types';
import type { StudentProblemPayload } from '../../problems/types';
import { generateStudentProblem } from '../../problems/generator';
import { TEMPLATES_BY_ID } from '../../problems/templates';
import type { CheckFeedback, FinalGradeResult } from './types';

const LOCAL_SECRET = 'engineering-graphics-classroom-demo';

const ASSIGNMENT_TEMPLATES: Readonly<Record<string, string>> = {
  '10000000-0000-0000-0000-000000000001': 'cone_inclined_both',
  '10000000-0000-0000-0000-000000000002': 'prism_inclined_hp',
  '10000000-0000-0000-0000-000000000003': 'line_inclined_both',
};

function pointsOf(entity: DraftEntity): Point2D[] {
  switch (entity.type) {
    case 'line':
      return [entity.p1, entity.p2];
    case 'circle':
    case 'arc':
      return [
        { x: entity.center.x - entity.radius, y: entity.center.y - entity.radius },
        { x: entity.center.x + entity.radius, y: entity.center.y + entity.radius },
      ];
    case 'polyline':
      return [...entity.points];
    case 'dimension':
      return [entity.p1, entity.p2, ...(entity.p3 ? [entity.p3] : [])];
    default:
      return [];
  }
}

function isReferenceLine(entity: DraftEntity): boolean {
  if (entity.type !== 'line') return false;
  const horizontal = Math.abs(entity.p1.y - entity.p2.y) < 0.5;
  const long = Math.abs(entity.p2.x - entity.p1.x) > 80;
  return horizontal && long && Math.abs(entity.p1.y) < 1;
}

/**
 * Create a deterministic, offline problem instance for lab machines that are not
 * connected to the classroom grading server. Only the public problem payload is
 * generated; no canonical solution leaves the server boundary.
 */
export function createLocalAttempt(
  assignmentId: string,
  rollNo = 'LAB',
): { attemptId: string; problem: StudentProblemPayload } {
  const templateId = ASSIGNMENT_TEMPLATES[assignmentId] ?? 'cone_inclined_both';
  const template = TEMPLATES_BY_ID[templateId];

  if (!template) {
    throw new Error(`No local problem template is registered for "${templateId}".`);
  }

  const instance = generateStudentProblem(template, rollNo || 'LAB', 1, {
    serverSecret: LOCAL_SECRET,
  });

  return {
    attemptId: `local-${assignmentId}-${(rollNo || 'LAB').replace(/[^a-z0-9]/gi, '').slice(0, 12)}`,
    problem: instance.clientPayload,
  };
}

const LOCAL_HINTS = {
  front: {
    id: 'local_missing_front',
    templateKey: 'missing_view',
    view: 'FRONT' as const,
    count: 1,
    level1: 'No front view was detected above the XY line.',
    level2: 'The elevation must be drawn above XY using continuous thick outlines.',
    level3:
      'In first-angle projection the front view sits above XY. Start with the principal outline, then add hidden edges as dashed lines.',
  },
  top: {
    id: 'local_missing_top',
    templateKey: 'missing_view',
    view: 'TOP' as const,
    count: 1,
    level1: 'No top view was detected below the XY line.',
    level2: 'The plan must be projected below XY, aligned vertically with the front view.',
    level3:
      'Project every significant point down from the elevation with thin projectors, then connect the plan outlines.',
  },
  dimensions: {
    id: 'local_missing_dimensions',
    templateKey: 'missing_dimensions',
    view: 'OVERALL' as const,
    count: 1,
    level1: 'No dimensions were found on the sheet.',
    level2: 'Add at least the overall length, height and the inclination angles.',
    level3:
      'Use thin dimension and extension lines with standard arrowheads. Place dimensions outside the view outlines.',
  },
  lineTypes: {
    id: 'local_line_styles',
    templateKey: 'line_style',
    view: 'OVERALL' as const,
    count: 1,
    level1: 'Line styles could be improved.',
    level2: 'Use continuous thick lines for visible edges, dashed lines for hidden edges and thin lines for projectors.',
    level3:
      'ISO 128 line conventions: visible outlines are continuous thick, hidden edges are dashed, and centre lines are long-dash-dot.',
  },
};

/**
 * Offline structural preview. This intentionally does not pretend to be the
 * official geometric grader: it reviews completeness, view placement and line
 * conventions, and says so in the feedback panel.
 */
export function localCheckPreview(entities: readonly DraftEntity[]): CheckFeedback {
  const drawing = entities.filter((entity) => !isReferenceLine(entity));
  const outlines = drawing.filter(
    (entity) => entity.type !== 'dimension' && entity.lineType !== 'thin' && entity.lineType !== 'centre',
  );

  let hasFront = false;
  let hasTop = false;
  for (const entity of outlines) {
    for (const point of pointsOf(entity)) {
      if (point.y > 2) hasFront = true;
      if (point.y < -2) hasTop = true;
    }
  }

  const visible = outlines.filter((entity) => entity.lineType === 'continuous').length;
  const hidden = drawing.filter((entity) => entity.lineType === 'dashed').length;
  const centre = drawing.filter((entity) => entity.lineType === 'centre').length;
  const dimensions = drawing.filter((entity) => entity.type === 'dimension').length;

  let score = 0;
  if (hasFront) score += 30;
  if (hasTop) score += 30;
  if (hasFront && hasTop) score += 10;
  if (visible >= 4) score += 15;
  else if (visible > 0) score += 7;
  if (dimensions > 0) score += 10;
  if (hidden > 0 || centre > 0) score += 5;
  score = Math.min(100, score);

  const hints = [];
  if (!hasFront) hints.push(LOCAL_HINTS.front);
  if (!hasTop) hints.push(LOCAL_HINTS.top);
  if (dimensions === 0) hints.push(LOCAL_HINTS.dimensions);
  if (hidden === 0 && centre === 0) hints.push(LOCAL_HINTS.lineTypes);

  return {
    score,
    mode: 'local',
    metrics: {
      recall: (Number(hasFront) + Number(hasTop) + Number(visible >= 4)) / 3,
      precision: 1,
      lineType: hidden > 0 || centre > 0 ? 1 : 0.55,
      dimensions: dimensions > 0 ? 1 : 0,
    },
    hints,
    summary: {
      totalExpectedEdges: Math.max(outlines.length, 1),
      matchedEdges: visible,
      missingEdges: hasFront && hasTop ? 0 : 2,
      extraEdges: 0,
      wrongTypeEdges: 0,
    },
  };
}

/** Local fallback used by the submit flow when the grading server is unreachable. */
export function createLocalGrade(
  entities: readonly DraftEntity[],
  timeSpentSec: number,
): FinalGradeResult {
  const preview = localCheckPreview(entities);

  return {
    submissionId: `local-${Date.now()}`,
    gradeId: `local-grade-${Date.now()}`,
    score: preview.score,
    breakdown: {
      recall: preview.metrics.recall,
      precision: preview.metrics.precision,
      lineType: preview.metrics.lineType,
      dimensions: preview.metrics.dimensions,
    },
    feedback:
      'Saved and assessed in local lab mode. This is a structural completeness review, not the official geometric grade. Connect the classroom grading server to receive validated marks.',
    isLate: false,
    timeSpentSec,
    mode: 'local',
  };
}
