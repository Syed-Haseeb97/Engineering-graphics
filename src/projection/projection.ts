import {
  MultiviewLayout,
  MultiviewLayoutOptions,
  Point2,
  Point3,
  ProfileSide,
  ProjectionAngle,
} from './types';

/**
 * Project a 3D point (X, Y, Z) onto the Vertical Plane (VP: Y = 0).
 *
 * Elevation / Front View coordinates: (X, Z).
 *
 * @param p 3D point in millimetres.
 * @returns 2D coordinate on VP.
 */
export function projectToVP(p: Point3): Point2 {
  return { x: p.x, y: p.z };
}

/**
 * Project a 3D point (X, Y, Z) onto the Horizontal Plane (HP: Z = 0).
 *
 * Plan / Top View coordinates before fold-out: (X, Y).
 *
 * @param p 3D point in millimetres.
 * @returns 2D coordinate on HP.
 */
export function projectToHP(p: Point3): Point2 {
  return { x: p.x, y: p.y };
}

/**
 * Project a 3D point (X, Y, Z) onto the Profile Plane (PP: X = 0).
 *
 * Side / End Elevation coordinates: (Y, Z).
 *
 * @param p 3D point in millimetres.
 * @returns 2D coordinate on PP.
 */
export function projectToPP(p: Point3): Point2 {
  return { x: p.y, y: p.z };
}

/**
 * Fold-out the Horizontal Plane (HP) downwards by 90° about reference line XY.
 *
 * Standard First-Angle Orthographic Rule:
 * The Horizontal Plane rotates 90° clockwise/downward about the XY line so that
 * the portion in front of VP (+Y) sits below the XY line at (X, -Y).
 * Any portion behind VP (Y < 0, 2nd & 3rd quadrants) rotates upwards above the XY line at (X, -Y) = (X, +|Y|).
 *
 * @param p2 Top view coordinate (X, Y) on HP.
 * @returns 2D coordinate on the flat drawing sheet.
 */
export function foldOutHP(p2: Point2): Point2 {
  return { x: p2.x, y: -p2.y };
}

/** Options for side view placement. */
export interface SideViewOptions {
  /** X coordinate of profile reference line X1Y1 on the drawing sheet. Default: 0. */
  readonly x1y1X?: number;
  /** Viewing direction: 'LEFT' for Left-Hand Side View, 'RIGHT' for Right-Hand Side View. Default: 'LEFT'. */
  readonly side?: ProfileSide;
  /** Projection standard: 'FIRST_ANGLE' (default) or 'THIRD_ANGLE'. */
  readonly angle?: ProjectionAngle;
}

/**
 * Project a 3D point into a side view on the drawing sheet relative to reference line X1Y1.
 *
 * Mathematical Derivation:
 * - In First-Angle Projection (object situated between observer and projection plane):
 *   1. Left-Hand Side View (LHSV, viewing from +X direction):
 *      - Projection plane (Right Profile Plane, RPP) is placed to the RIGHT of the front view at X = X1Y1.
 *      - Distance Y in front of VP extends to the right from X1Y1: X_sheet = X1Y1 + Y.
 *      - Elevation Z matches front view height: Y_sheet = Z.
 *   2. Right-Hand Side View (RHSV, viewing from -X direction):
 *      - Projection plane (Left Profile Plane, LPP) is placed to the LEFT of the front view at X = X1Y1.
 *      - Distance Y in front of VP extends to the left from X1Y1: X_sheet = X1Y1 - Y.
 *      - Elevation Z matches front view height: Y_sheet = Z.
 *
 * - In Third-Angle Projection (projection plane situated between observer and object):
 *   1. LHSV is placed on the LEFT of the front view at X1Y1: X_sheet = X1Y1 - Y, Y_sheet = Z.
 *   2. RHSV is placed on the RIGHT of the front view at X1Y1: X_sheet = X1Y1 + Y, Y_sheet = Z.
 *
 * @param p 3D point in millimetres.
 * @param options Placement options.
 * @returns 2D coordinate on the drawing sheet.
 */
export function projectSideView(p: Point3, options?: SideViewOptions): Point2 {
  const x1y1X = options?.x1y1X ?? 0;
  const side = options?.side ?? 'LEFT';
  const angle = options?.angle ?? 'FIRST_ANGLE';

  const isFirstAngle = angle === 'FIRST_ANGLE';
  const placedOnRight = isFirstAngle ? side === 'LEFT' : side === 'RIGHT';

  const sheetX = placedOnRight ? x1y1X + p.y : x1y1X - p.y;
  const sheetY = p.z;

  return { x: sheetX, y: sheetY };
}

/**
 * Arrange front, top, and side views for a collection of 3D points on a single drawing sheet.
 *
 * Reference line XY is established at y = 0.
 *
 * @param points Array of 3D points.
 * @param options Layout options (projection angle, side view selection, gapX, gapY).
 * @returns Complete multiview sheet layout.
 */
export function layoutMultiview(
  points: readonly Point3[],
  options?: MultiviewLayoutOptions,
): MultiviewLayout {
  const angle: ProjectionAngle = options?.angle ?? 'FIRST_ANGLE';
  const sideViewSide: ProfileSide = options?.sideView ?? 'LEFT';
  const gapX = options?.gapX ?? 20;
  const gapY = options?.gapY ?? 0;

  if (points.length === 0) {
    return {
      xyLineY: 0,
      x1y1LineX: 0,
      frontView: [],
      topView: [],
      sideView: [],
    };
  }

  // Compute front view X extents
  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
  }

  // Determine placement of reference line X1Y1
  const isFirstAngle = angle === 'FIRST_ANGLE';
  const sideOnRight = isFirstAngle ? sideViewSide === 'LEFT' : sideViewSide === 'RIGHT';
  const x1y1LineX = sideOnRight ? maxX + gapX : minX - gapX;

  // Front View: (X, Z) on VP
  const frontView: Point2[] = points.map((p) => projectToVP(p));

  // Top View:
  // First-Angle: sits below XY line at (X, -Y - gapY)
  // Third-Angle: sits above XY line at (X, Y + gapY)
  const topView: Point2[] = points.map((p) => {
    if (isFirstAngle) {
      return { x: p.x, y: -p.y - gapY };
    } else {
      return { x: p.x, y: p.y + gapY };
    }
  });

  // Side View:
  const sideView: Point2[] = points.map((p) =>
    projectSideView(p, {
      x1y1X: x1y1LineX,
      side: sideViewSide,
      angle,
    }),
  );

  return {
    xyLineY: 0,
    x1y1LineX,
    frontView,
    topView,
    sideView,
  };
}
