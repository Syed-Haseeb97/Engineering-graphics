import type { DraftEntity, LineEntity, Point2D } from '../../draft/types';
import type { SimilarityFlag, StudentSubmissionRow } from './types';

/**
 * Geometric tolerance in millimetres for declaring two endpoints identical.
 */
const ENDPOINT_TOLERANCE_MM = 1.0;

/**
 * Minimum similarity percentage (0-100) required to flag a pair for instructor review.
 */
export const SIMILARITY_REVIEW_THRESHOLD = 85;

/**
 * Euclidean distance between two 2D points.
 */
function dist2D(p1: Point2D, p2: Point2D): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/**
 * Check if two line segments geometrically coincide within tolerance in either direction.
 */
function segmentsMatch(a: LineEntity, b: LineEntity, tol: number): boolean {
  if (a.lineType !== b.lineType) return false;

  // Direct direction
  const d11 = dist2D(a.p1, b.p1);
  const d22 = dist2D(a.p2, b.p2);
  if (d11 <= tol && d22 <= tol) return true;

  // Reverse direction
  const d12 = dist2D(a.p1, b.p2);
  const d21 = dist2D(a.p2, b.p1);
  return d12 <= tol && d21 <= tol;
}

/**
 * Extract line entities from a draft entity list.
 */
function extractLines(entities: readonly DraftEntity[]): LineEntity[] {
  return entities.filter((e) => e.type === 'line') as LineEntity[];
}

/**
 * Compute pairwise structural similarity between two sets of entities.
 * Returns a score between 0.0 and 1.0.
 */
export function computeEntitySimilarity(
  entitiesA: readonly DraftEntity[],
  entitiesB: readonly DraftEntity[],
  tolerance = ENDPOINT_TOLERANCE_MM,
): { score: number; matchedCount: number; totalCount: number } {
  const linesA = extractLines(entitiesA);
  const linesB = extractLines(entitiesB);

  const nA = linesA.length;
  const nB = linesB.length;

  if (nA === 0 || nB === 0) {
    return { score: 0, matchedCount: 0, totalCount: Math.max(nA, nB) };
  }

  // Count matched segments
  const matchedB = new Set<number>();
  let matchedCount = 0;

  for (const a of linesA) {
    for (let j = 0; j < linesB.length; j++) {
      if (matchedB.has(j)) continue;
      const b = linesB[j]!;

      if (segmentsMatch(a, b, tolerance)) {
        matchedB.add(j);
        matchedCount++;
        break;
      }
    }
  }

  if (matchedCount === 0) {
    return { score: 0, matchedCount: 0, totalCount: Math.max(nA, nB) };
  }

  const unionSize = nA + nB - matchedCount;
  const jaccard = unionSize > 0 ? matchedCount / unionSize : 0;
  const countRatio = 1 - Math.abs(nA - nB) / Math.max(nA, nB);

  // Weighted similarity index
  const score = Math.min(1.0, 0.8 * jaccard + 0.2 * countRatio);

  return {
    score,
    matchedCount,
    totalCount: Math.max(nA, nB),
  };
}

/**
 * Analyze an entire assignment cohort and identify submission pairs with high structural similarity.
 *
 * NOTE: As per SPEC.md & AGENTS.md, similarity is strictly presented as a "Review" alert
 * for manual instructor inspection, NEVER as an automatic grading penalty.
 */
export function computeCohortSimilarities(
  submissions: readonly StudentSubmissionRow[],
  threshold = SIMILARITY_REVIEW_THRESHOLD,
): Map<string, SimilarityFlag> {
  const flags = new Map<string, SimilarityFlag>();

  // Compare every distinct submitted pair
  for (let i = 0; i < submissions.length; i++) {
    const subA = submissions[i]!;
    if (subA.status !== 'submitted' && subA.status !== 'graded') continue;
    if (subA.entities.length < 2) continue;

    for (let j = i + 1; j < submissions.length; j++) {
      const subB = submissions[j]!;
      if (subB.status !== 'submitted' && subB.status !== 'graded') continue;
      if (subB.entities.length < 2) continue;

      const { score, matchedCount, totalCount } = computeEntitySimilarity(subA.entities, subB.entities);
      const scorePct = Math.round(score * 100);

      if (scorePct >= threshold) {
        // Flag student A
        const existingA = flags.get(subA.studentId);
        if (!existingA || existingA.similarityScore < scorePct) {
          flags.set(subA.studentId, {
            partnerStudentId: subB.studentId,
            partnerRollNo: subB.rollNo,
            partnerName: subB.name,
            similarityScore: scorePct,
            matchedCount,
            totalCount,
          });
        }

        // Flag student B
        const existingB = flags.get(subB.studentId);
        if (!existingB || existingB.similarityScore < scorePct) {
          flags.set(subB.studentId, {
            partnerStudentId: subA.studentId,
            partnerRollNo: subA.rollNo,
            partnerName: subA.name,
            similarityScore: scorePct,
            matchedCount,
            totalCount,
          });
        }
      }
    }
  }

  return flags;
}
