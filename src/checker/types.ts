import type { DraftEntity, Point2D } from '../draft/types';

export type EdgeEvaluationStatus = 'matched' | 'missing' | 'extra' | 'wrongType';

/** Evaluation of an individual 2D edge segment for pedagogical visualization. */
export interface EvaluatedEdge {
  readonly id: string;
  readonly view: 'FRONT' | 'TOP' | 'SIDE' | 'UNKNOWN';
  readonly p1: Point2D;
  readonly p2: Point2D;
  readonly expectedLineType?: 'visible' | 'hidden';
  readonly actualLineType?: 'visible' | 'hidden';
  readonly status: EdgeEvaluationStatus;
  readonly lengthMm: number;
}

/** Error payload if drawing alignment or reference line cannot be established. */
export interface AlignmentFailure {
  readonly success: false;
  readonly error: 'MISSING_XY_LINE' | 'NON_HORIZONTAL_XY_LINE';
  readonly hint: string;
}

export interface AlignmentSuccess {
  readonly success: true;
  readonly translation: Point2D;
  readonly alignedEntities: readonly DraftEntity[];
}

export type AlignmentResult = AlignmentSuccess | AlignmentFailure;

/** Configurable grading options. */
export interface CheckerOptions {
  /** Positional tolerance in millimetres for point-segment coincidence. Default: 0.5 mm. */
  readonly toleranceMm?: number;
  /** Sampling density along segments in millimetres. Default: 1.0 mm. */
  readonly sampleStepMm?: number;
  /** Minimum length fraction (0..1) required to declare an edge matched. Default: 0.75 (75%). */
  readonly coverageThreshold?: number;
  /** Weighting rubric for scoring components (summing to 1.0). */
  readonly rubric?: {
    readonly recall: number;
    readonly precision: number;
    readonly lineType: number;
    readonly dimensions: number;
  };
}

/** Comprehensive grading report returned to the auto-grading backend. */
export interface EvaluationReport {
  readonly success: boolean;
  readonly error?: string;
  readonly hint?: string;
  readonly overallScore: number; // 0 to 100
  readonly metrics: {
    readonly recall: number;    // 0 to 1
    readonly precision: number; // 0 to 1
    readonly lineType: number;  // 0 to 1
    readonly dimensions: number; // 0 to 1
  };
  readonly edges: readonly EvaluatedEdge[];
  readonly summary: {
    readonly totalExpectedEdges: number;
    readonly matchedEdges: number;
    readonly missingEdges: number;
    readonly extraEdges: number;
    readonly wrongTypeEdges: number;
  };
}
