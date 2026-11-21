/**
 * Parametric Problem Generator Types & Schemas
 *
 * All spatial coordinates, tolerances, and dimensions are strictly in millimetres (mm)
 * or degrees as mandated by SPEC.md & AGENTS.md.
 */

export type TopicType =
  | 'PROJECTION_OF_POINTS'
  | 'PROJECTION_OF_LINES'
  | 'PROJECTION_OF_PLANES'
  | 'PROJECTION_OF_SOLIDS';

export type ShapeType =
  | 'POINT'
  | 'LINE'
  | 'TRIANGLE'
  | 'RECTANGLE'
  | 'CIRCLE_LAMINAE'
  | 'PRISM'
  | 'PYRAMID'
  | 'CYLINDER'
  | 'CONE';

export type ViewRequirement = 'FRONT_VIEW' | 'TOP_VIEW' | 'LEFT_SIDE_VIEW' | 'RIGHT_SIDE_VIEW';

/** Parameter numerical definition on a discrete step grid. */
export interface ParameterDefinition {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit: 'mm' | 'deg';
  readonly description?: string;
}

/** Scoring rubric weights for automated evaluation (summing to 1.0). */
export interface RubricWeights {
  /** Topology/entity recall: drawing the required views and edges. */
  readonly recall: number;
  /** Sub-millimetre geometric vertex/segment precision. */
  readonly precision: number;
  /** Classification of continuous (visible) vs dashed (hidden) vs centre lines. */
  readonly lineType: number;
  /** Proper dimension witness lines, leader lines, and annotation values. */
  readonly dimensions: number;
}

/** Geometric and physical validity rules to prevent degenerate/impossible problems. */
export interface ValidityPredicates {
  /** Maximum allowable bounding width across all projected views in mm. Default: 450 mm. */
  readonly maxSheetWidthMm?: number;
  /** Maximum allowable bounding height across all projected views in mm. Default: 300 mm. */
  readonly maxSheetHeightMm?: number;
  /** Minimum distance between any adjacent/parallel edges in mm. Default: 3 mm. */
  readonly minFeatureSizeMm?: number;
  /** Minimum foreshortened apparent length of axis or line in mm. Default: 15 mm. */
  readonly minApparentLengthMm?: number;
  /** Maximum combined tilt angle for true dual inclinations (theta + phi). Default: 80 deg. */
  readonly maxCombinedTiltDeg?: number;
  /** Enforce that all placed coordinates lie strictly in First Quadrant (z >= 0, y >= 0). Default: true. */
  readonly requireFirstQuadrant?: boolean;
}

/** Placement and orientation rules. */
export interface PlacementRules {
  readonly restingPlane?: 'HP' | 'VP';
  readonly restingFeature?: 'corner' | 'edge' | 'generator' | 'face' | 'point';
  readonly axisAlignmentStage1?: 'PERPENDICULAR_TO_HP' | 'PERPENDICULAR_TO_VP';
  readonly tiltStage2?: 'TILT_TO_HP' | 'TILT_TO_VP';
  readonly tiltStage3?: 'TILT_TO_VP' | 'TILT_TO_HP';
}

/**
 * Complete Parametric Problem Template
 */
export interface ProblemTemplate {
  readonly id: string;
  readonly topic: TopicType;
  readonly shape: ShapeType;
  readonly param_schema: Readonly<Record<string, ParameterDefinition>>;
  readonly placement_rules: PlacementRules;
  readonly views_required: readonly ViewRequirement[];
  readonly validity_predicates: ValidityPredicates;
  readonly rubric: RubricWeights;
  readonly statement: string;
}

/**
 * Client-facing Student Problem Payload (ZERO Ground-Truth data).
 * Ground truth coordinates, seed, and server secret NEVER ship to the browser.
 */
export interface StudentProblemPayload {
  readonly problemId: string;
  readonly topic: TopicType;
  readonly statement: string;
  readonly publicParams: Readonly<Record<string, number>>;
  readonly viewsRequired: readonly ViewRequirement[];
  readonly attemptNo: number;
}

/**
 * Internal Server-Held Problem Instance (includes secret seed & canonical parameters).
 */
export interface ServerProblemInstance {
  readonly templateId: string;
  readonly rollNo: string;
  readonly attemptNo: number;
  readonly seed: string;
  readonly reRollCount: number;
  readonly params: Readonly<Record<string, number>>;
  readonly clientPayload: StudentProblemPayload;
}

/** Result of validating generated problem parameters against predicates. */
export interface ValidationOutcome {
  readonly valid: boolean;
  readonly reasons: readonly string[];
}
