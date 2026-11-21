import type { ShapeHandle, Vec3 } from 'occt-wasm';
import type { Point2, ProfileSide, Segment2 } from '../projection/types';

export type { ShapeHandle, Vec3 };

/** Visibility classification of a projected 2D edge. */
export type LineType = 'visible' | 'hidden';

/** Geometric classification of a projected 2D edge. */
export type EdgeKind = 'sharp' | 'outline' | 'smooth';

/** 2D segment tagged with line visibility and edge kind. */
export interface TaggedSegment2 extends Segment2 {
  readonly lineType: LineType;
  readonly edgeKind: EdgeKind;
}

/** HLR computation algorithm mode (feature flag). */
export type HlrMode = 'EXACT' | 'POLYGON';

/** Orthographic projection view type for HLR extraction. */
export type HlrView = 'FRONT' | 'TOP' | 'SIDE' | 'SIDE_LEFT' | 'SIDE_RIGHT' | 'front' | 'top' | 'side';

/** Options for HLR 2D edge extraction. */
export interface HlrOptions {
  /**
   * Discretisation deflection (tolerance) in model units (mm).
   * Defines maximum chordal deviation when discretising curved edges into polylines.
   * Default: 0.05 mm.
   */
  readonly deflection?: number;
  /**
   * HLR algorithm mode. Default: 'EXACT' (topological HLRBRep).
   * Note: 'POLYGON' is a reserved feature flag for future polygon-based HLR fallback.
   */
  readonly mode?: HlrMode;
}

/** Analytic 2D circular arc descriptor. */
export interface AnalyticArc2 {
  readonly center: Point2;
  readonly radius: number;
  readonly startAngleRad: number;
  readonly endAngleRad: number;
  readonly isFullCircle: boolean;
  readonly lineType: LineType;
  readonly edgeKind: EdgeKind;
}

/** Options for 2D segment normalisation. */
export interface NormaliseOptions {
  /**
   * Spatial tolerance in mm for snapping endpoints, detecting collinearity, and dropping near-zero pieces.
   * Default: 0.01 mm.
   */
  readonly tolerance?: number;
  /**
   * Chord tolerance in mm for circular arc detection and polyline representation.
   * Default: 0.05 mm.
   */
  readonly chordTolerance?: number;
}

/** Result of 2D segment normalisation including segments and optional detected analytic arcs. */
export interface NormaliseResult {
  readonly segments: readonly TaggedSegment2[];
  readonly arcs?: readonly AnalyticArc2[];
}

/** Options for generating a multiview bundle from a placed solid. */
export interface MultiviewBundleOptions extends HlrOptions {
  /** Profile side view to construct: 'LEFT' (default for First-Angle) or 'RIGHT'. */
  readonly sideView?: ProfileSide;
  /** Horizontal gap in mm between front view max X and X1Y1 reference line (default: 20 mm). */
  readonly gapX?: number;
  /** Vertical gap in mm below XY line for top view beyond natural fold-out (default: 0 mm). */
  readonly gapY?: number;
  /** Normalisation tolerance in mm (default: 0.01 mm). */
  readonly normaliseTolerance?: number;
}

/** Complete 3-view 2D orthographic projection bundle with first-angle fold-out applied. */
export interface MultiviewBundle {
  /** Front View (Elevation) on VP above XY line. */
  readonly front: readonly TaggedSegment2[];
  /** Top View (Plan) on HP folded out below XY line. */
  readonly top: readonly TaggedSegment2[];
  /** Side View (End Elevation) on PP positioned relative to X1Y1. */
  readonly side: readonly TaggedSegment2[];
  /** XY reference line Y coordinate on sheet (y = 0). */
  readonly xyLineY: number;
  /** X1Y1 reference line X coordinate on sheet. */
  readonly x1y1LineX: number;
}

/** Supported regular polygon bases for prisms and pyramids. */
export type RegularPolygonSides = 3 | 4 | 5 | 6;

/** Solid category classification. */
export type SolidType =
  | 'PRISM'
  | 'PYRAMID'
  | 'CYLINDER'
  | 'CONE'
  | 'FRUSTUM_CONE'
  | 'FRUSTUM_PYRAMID';

/** Metadata associated with a built parametric solid. */
export interface SolidMetadata {
  readonly solidType: SolidType;
  /** Number of polygon sides (3 for triangle, 4 for square, 5 for pentagon, 6 for hexagon). */
  readonly polygonSides?: RegularPolygonSides;
  /** Primary base dimension (side length for polygon bases, radius for cylinder/cone) in mm. */
  readonly baseSize: number;
  /** Top dimension for frustums (top side length or top radius) in mm. */
  readonly topSize?: number;
  /** Total height of solid along axis in mm. */
  readonly height: number;
  /** Axis direction unit vector in local coordinates. */
  readonly axisVector: Vec3;
  /** Center of base in local coordinates. */
  readonly baseCentre: Vec3;
  /** Center of top face (for prisms, cylinders, frustums) in mm. */
  readonly topCentre?: Vec3;
  /** Apex point for pyramids and cones in mm. */
  readonly apex?: Vec3;
  /** Base perimeter vertices / key corners in mm. */
  readonly baseCorners: readonly Vec3[];
  /** Top perimeter vertices / key corners in mm. */
  readonly topCorners?: readonly Vec3[];
  /** Dictionary of named geometric landmark points (e.g. apex, baseCorner0, topCorner0). */
  readonly namedPoints: Readonly<Record<string, Vec3>>;
}

/** Built solid consisting of an OCCT ShapeHandle and immutable metadata. */
export interface BuiltSolid {
  readonly handle: ShapeHandle;
  readonly metadata: SolidMetadata;
}

/** Stage 1 alignment of solid axis in the simple position. */
export type InitialAxisOrientation =
  | 'PERPENDICULAR_TO_HP' // Axis along +Z
  | 'PERPENDICULAR_TO_VP'; // Axis along +Y

/** Option for how the base rests in Stage 1. */
export interface BaseRestingCondition {
  /** Initial rotation around the axis in radians (e.g. to orient a base edge parallel or perpendicular to VP). */
  readonly baseRotationRad?: number;
}

/** Parameters for textbook 3-stage placement pipeline. */
export interface PlacementParams {
  /** Initial orientation in Stage 1 (default: 'PERPENDICULAR_TO_HP'). */
  readonly initialAxis?: InitialAxisOrientation;
  /** Initial rotation around the axis (in radians) to align base edge or corner. */
  readonly baseRotationRad?: number;
  /** Stage 2 tilt angle θ of axis with respect to HP (in radians). */
  readonly thetaRad?: number;
  /** Stage 3 tilt angle φ of axis with respect to VP (in radians). */
  readonly phiRad?: number;
  /** Distance of nearest point of solid above HP (Z = 0) in mm. Default: 0. */
  readonly distanceHP?: number;
  /** Distance of nearest point of solid in front of VP (Y = 0) in mm. Default: 0. */
  readonly distanceVP?: number;
}

/** A single stage result in the placement pipeline. */
export interface PlacementStageResult {
  readonly stage: 1 | 2 | 3;
  readonly description: string;
  readonly handle: ShapeHandle;
  readonly transformedAxis: Vec3;
  readonly transformedBaseCentre: Vec3;
  readonly transformedApex?: Vec3;
  readonly transformedNamedPoints: Readonly<Record<string, Vec3>>;
}

/** Complete inspection sequence returned by the placement pipeline. */
export interface PlacementResult {
  /** Intermediate stages: [stage1, stage2, stage3]. */
  readonly stages: readonly [PlacementStageResult, PlacementStageResult, PlacementStageResult];
  /** Final placed solid (matches stage 3 with final translation applied). */
  readonly finalPlaced: PlacementStageResult;
}

/** First-quadrant geometric validation outcome. */
export type ValidationResult =
  | { readonly valid: true }
  | {
      readonly valid: false;
      readonly error: 'BELOW_HORIZONTAL_PLANE' | 'BEHIND_VERTICAL_PLANE' | 'BELOW_AND_BEHIND';
      readonly minZ: number;
      readonly minY: number;
      readonly message: string;
    };
