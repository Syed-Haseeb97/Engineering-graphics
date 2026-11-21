import type { TaggedSegment2 } from '../kernel/types';
import type { CheckerOptions, EdgeEvaluationStatus, EvaluatedEdge, EvaluationReport } from './types';

function distance2D(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.hypot(dx, dy);
}

/** Point-to-segment distance and projection test. */
function pointDistanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { distance: number; onSegment: boolean } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq < 1e-8) {
    return { distance: distance2D(px, py, x1, y1), onSegment: true };
  }

  const t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  if (t < -0.02 || t > 1.02) {
    // Falls outside segment bounds
    return {
      distance: Math.min(distance2D(px, py, x1, y1), distance2D(px, py, x2, y2)),
      onSegment: false,
    };
  }

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return { distance: distance2D(px, py, projX, projY), onSegment: true };
}

/** Classify view according to first-angle fold-out standard. */
function classifyView(midY: number): 'FRONT' | 'TOP' | 'UNKNOWN' {
  if (midY > 0.1) return 'FRONT';
  if (midY < -0.1) return 'TOP';
  return 'UNKNOWN';
}

/**
 * Match normalized student segments against canonical ground-truth segments.
 */
export function matchAndScore(
  groundTruth: readonly TaggedSegment2[],
  studentSegments: readonly TaggedSegment2[],
  options?: CheckerOptions,
): EvaluationReport {
  const tol = options?.toleranceMm ?? 0.5;
  const sampleStep = options?.sampleStepMm ?? 1.0;
  const coverageThreshold = options?.coverageThreshold ?? 0.75;
  const rubric = options?.rubric ?? {
    recall: 0.35,
    precision: 0.3,
    lineType: 0.25,
    dimensions: 0.1,
  };

  const evaluatedEdges: EvaluatedEdge[] = [];

  let matchedLength = 0;
  let wrongTypeLength = 0;
  let totalGtLength = 0;

  let edgeCounter = 0;

  // 1. Evaluate Ground Truth segments (Recall & Line Type)
  for (const gt of groundTruth) {
    const len = distance2D(gt.p1.x, gt.p1.y, gt.p2.x, gt.p2.y);
    if (len < 1e-4) continue;
    totalGtLength += len;

    const sampleCount = Math.max(3, Math.ceil(len / sampleStep));
    let matchedSamples = 0;
    let wrongTypeSamples = 0;

    for (let i = 0; i < sampleCount; i++) {
      const t = i / (sampleCount - 1);
      const sx = gt.p1.x + t * (gt.p2.x - gt.p1.x);
      const sy = gt.p1.y + t * (gt.p2.y - gt.p1.y);

      // Search student segments
      let sampleMatched = false;
      let sampleWrongType = false;

      for (const st of studentSegments) {
        const { distance, onSegment } = pointDistanceToSegment(
          sx,
          sy,
          st.p1.x,
          st.p1.y,
          st.p2.x,
          st.p2.y,
        );
        if (onSegment && distance <= tol) {
          if (st.lineType === gt.lineType) {
            sampleMatched = true;
            break;
          } else {
            sampleWrongType = true;
          }
        }
      }

      if (sampleMatched) {
        matchedSamples++;
      } else if (sampleWrongType) {
        wrongTypeSamples++;
      }
    }

    const matchedFrac = matchedSamples / sampleCount;
    const coveredFrac = (matchedSamples + wrongTypeSamples) / sampleCount;

    let status: EdgeEvaluationStatus;
    let actualType: 'visible' | 'hidden' | undefined;

    if (coveredFrac >= coverageThreshold) {
      if (matchedFrac >= wrongTypeSamples / sampleCount) {
        status = 'matched';
        actualType = gt.lineType;
        matchedLength += len;
      } else {
        status = 'wrongType';
        actualType = gt.lineType === 'visible' ? 'hidden' : 'visible';
        wrongTypeLength += len;
      }
    } else {
      status = 'missing';
    }

    const midY = (gt.p1.y + gt.p2.y) / 2;
    evaluatedEdges.push({
      id: `gt_edge_${++edgeCounter}`,
      view: classifyView(midY),
      p1: { x: gt.p1.x, y: gt.p1.y },
      p2: { x: gt.p2.x, y: gt.p2.y },
      expectedLineType: gt.lineType,
      actualLineType: actualType,
      status,
      lengthMm: len,
    });
  }

  // 2. Evaluate Student segments for Extra / Unmatched Edges (Precision)
  let totalStudentLength = 0;
  let extraLength = 0;

  for (const st of studentSegments) {
    const len = distance2D(st.p1.x, st.p1.y, st.p2.x, st.p2.y);
    if (len < 1e-4) continue;
    totalStudentLength += len;

    const sampleCount = Math.max(3, Math.ceil(len / sampleStep));
    let coveredSamples = 0;

    for (let i = 0; i < sampleCount; i++) {
      const t = i / (sampleCount - 1);
      const sx = st.p1.x + t * (st.p2.x - st.p1.x);
      const sy = st.p1.y + t * (st.p2.y - st.p1.y);

      for (const gt of groundTruth) {
        const { distance, onSegment } = pointDistanceToSegment(
          sx,
          sy,
          gt.p1.x,
          gt.p1.y,
          gt.p2.x,
          gt.p2.y,
        );
        if (onSegment && distance <= tol) {
          coveredSamples++;
          break;
        }
      }
    }

    const coverageFrac = coveredSamples / sampleCount;
    if (coverageFrac < 0.25) {
      // Less than 25% coincides with any ground-truth edge -> Extra edge
      extraLength += len;
      const midY = (st.p1.y + st.p2.y) / 2;
      evaluatedEdges.push({
        id: `extra_edge_${++edgeCounter}`,
        view: classifyView(midY),
        p1: { x: st.p1.x, y: st.p1.y },
        p2: { x: st.p2.x, y: st.p2.y },
        actualLineType: st.lineType,
        status: 'extra',
        lengthMm: len,
      });
    }
  }

  // 3. Compute Metrics
  // Recall: Fraction of expected edges present (wrongType earns 50% partial credit)
  const recall =
    totalGtLength > 0 ? (matchedLength + 0.5 * wrongTypeLength) / totalGtLength : 1.0;

  // Precision: Fraction of student edges that were legitimate
  const precision =
    totalStudentLength > 0 ? Math.max(0, 1.0 - extraLength / totalStudentLength) : 1.0;

  // Line Type: Fraction of drawn covered edges having the correct visibility
  const coveredLength = matchedLength + wrongTypeLength;
  const lineTypeScore = coveredLength > 0 ? matchedLength / coveredLength : 0.0;

  const dimensionsScore = 1.0; // Reserved for dimension checker

  // Overall Weighted Score (0..100)
  const rawScore =
    (rubric.recall * recall +
      rubric.precision * precision +
      rubric.lineType * lineTypeScore +
      rubric.dimensions * dimensionsScore) *
    100;

  const overallScore = Math.min(100, Math.max(0, Number(rawScore.toFixed(1))));

  const matchedCount = evaluatedEdges.filter((e) => e.status === 'matched').length;
  const missingCount = evaluatedEdges.filter((e) => e.status === 'missing').length;
  const extraCount = evaluatedEdges.filter((e) => e.status === 'extra').length;
  const wrongTypeCount = evaluatedEdges.filter((e) => e.status === 'wrongType').length;

  return {
    success: true,
    overallScore,
    metrics: {
      recall: Number(recall.toFixed(3)),
      precision: Number(precision.toFixed(3)),
      lineType: Number(lineTypeScore.toFixed(3)),
      dimensions: Number(dimensionsScore.toFixed(3)),
    },
    edges: evaluatedEdges,
    summary: {
      totalExpectedEdges: groundTruth.length,
      matchedEdges: matchedCount,
      missingEdges: missingCount,
      extraEdges: extraCount,
      wrongTypeEdges: wrongTypeCount,
    },
  };
}
