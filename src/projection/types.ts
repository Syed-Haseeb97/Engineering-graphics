/**
 * First-Angle & Multiview Orthographic Projection Types.
 *
 * All coordinates and dimensions are in millimetres (mm) according to SPEC.md and AGENTS.md.
 */

/** 3D spatial coordinate in the world coordinate system (mm). */
export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** 2D coordinate on a projection plane or folded drawing sheet (mm). */
export interface Point2 {
  readonly x: number;
  readonly y: number;
}

/** 2D directed line segment on a drawing sheet (mm). */
export interface Segment2 {
  readonly p1: Point2;
  readonly p2: Point2;
}

/** Principal reference projection planes. */
export enum Plane {
  /** Vertical Plane (VP) - reference plane Y = 0 */
  VP = 'VP',
  /** Horizontal Plane (HP) - reference plane Z = 0 */
  HP = 'HP',
  /** Profile Plane (PP) - reference plane perpendicular to both HP and VP */
  PP = 'PP',
}

/** Orthographic projection standard convention. */
export type ProjectionAngle = 'FIRST_ANGLE' | 'THIRD_ANGLE';

/** Profile side view direction. */
export type ProfileSide = 'LEFT' | 'RIGHT';

/** View classification on the unfolded engineering drawing sheet. */
export type ViewType = 'FRONT' | 'TOP' | 'SIDE_LEFT' | 'SIDE_RIGHT';

/** Projection coordinates of a single point mapped across multiview drawing sheet views. */
export interface MultiviewSheetPoint {
  readonly front: Point2;
  readonly top: Point2;
  readonly side: Point2;
}

/** Options for arranging multiple views on a single drawing sheet. */
export interface MultiviewLayoutOptions {
  /** Projection standard (default: 'FIRST_ANGLE'). */
  readonly angle?: ProjectionAngle;
  /** Side view to include (default: 'LEFT'). */
  readonly sideView?: ProfileSide;
  /** Horizontal gap in mm between front view extent and profile reference line X1Y1 (default: 20 mm). */
  readonly gapX?: number;
  /** Additional vertical separation in mm for top view beyond natural fold-out (default: 0 mm). */
  readonly gapY?: number;
}

/** Full multiview sheet layout for a collection of points. */
export interface MultiviewLayout {
  /** Reference line XY coordinate (always y = 0). */
  readonly xyLineY: number;
  /** Reference line X1Y1 coordinate (vertical line x = x1y1X). */
  readonly x1y1LineX: number;
  /** Front View (Elevation) points on sheet. */
  readonly frontView: readonly Point2[];
  /** Top View (Plan) points on sheet (placed below XY in First-Angle). */
  readonly topView: readonly Point2[];
  /** Side View (End Elevation) points on sheet. */
  readonly sideView: readonly Point2[];
}
