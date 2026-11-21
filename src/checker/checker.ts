import type { DraftEntity } from '../draft/types';
import { normaliseSegments } from '../kernel/normalise';
import type { TaggedSegment2 } from '../kernel/types';
import { alignDrawing } from './align';
import { matchAndScore } from './match';
import { entitiesToTaggedSegments } from './normalise-entities';
import type { CheckerOptions, EvaluationReport } from './types';

/**
 * Headless Auto-Grading Evaluation Engine for Engineering Graphics.
 *
 * Full Server-Side Pipeline:
 * 1. Alignment: Detects student's XY line and translates entities so placement on sheet is not penalised.
 *    If XY line is missing or tilted, returns typed pedagogical error.
 * 2. Normalisation: Converts student DraftEntity primitives (lines, polylines, circles, arcs) into 2D segments
 *    and normalises both student and ground truth via the kernel normaliser (coincident segment merging, intersection splitting).
 * 3. Point-Sampling Matcher: Samples points along every canonical edge and checks coverage by student segments within tolerance.
 * 4. Multi-Criteria Scoring: Computes recall, precision, line-type classification, and produces per-edge diagnostics.
 *
 * @param studentEntities Entities submitted by the student from the drafting canvas.
 * @param groundTruth Canonical 2D segments generated server-side for the problem seed.
 * @param options Evaluation parameters (tolerance, sampling density, rubric weights).
 * @returns EvaluationReport with score (0..100) and granular edge diagnostics.
 */
export function evaluateSubmission(
  studentEntities: readonly DraftEntity[],
  groundTruth: readonly TaggedSegment2[],
  options?: CheckerOptions,
): EvaluationReport {
  // 2. Align student drawing using student's XY line and fixed origin x = 0
  const alignment = alignDrawing(studentEntities, 0);
  if (!alignment.success) {
    return {
      success: false,
      error: alignment.error,
      hint: alignment.hint,
      overallScore: 0,
      metrics: {
        recall: 0,
        precision: 0,
        lineType: 0,
        dimensions: 0,
      },
      edges: [],
      summary: {
        totalExpectedEdges: groundTruth.length,
        matchedEdges: 0,
        missingEdges: groundTruth.length,
        extraEdges: 0,
        wrongTypeEdges: 0,
      },
    };
  }

  // 3. Convert and normalise student entities
  const studentSegments = entitiesToTaggedSegments(alignment.alignedEntities);

  // 4. Normalise canonical ground truth
  const normalisedGt = normaliseSegments(groundTruth, { tolerance: 0.01 });

  // 5. Match and compute rubric score
  return matchAndScore(normalisedGt, studentSegments, options);
}
