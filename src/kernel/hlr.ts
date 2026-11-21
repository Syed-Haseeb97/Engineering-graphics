import type { OcctKernel, ProjectionData, ShapeHandle, Vec3 } from 'occt-wasm';
import { Point2 } from '../projection/types';
import { normaliseSegments } from './normalise';
import {
  BuiltSolid,
  EdgeKind,
  HlrOptions,
  HlrView,
  LineType,
  MultiviewBundle,
  MultiviewBundleOptions,
  PlacementStageResult,
  TaggedSegment2,
} from './types';

/** Default deflection for exact HLR curve wireframe extraction (in mm). */
export const DEFAULT_DEFLECTION_MM = 0.05;

interface ViewBasisConfig {
  viewDirection: Vec3;
  xAxis: Vec3;
  mapCoords: (u: number, v: number) => Point2;
}

/** Compute view direction, in-plane X axis, and 2D coordinate mapping for a given projection view. */
function getViewBasisConfig(view: HlrView): ViewBasisConfig {
  const normView = view.toUpperCase();

  switch (normView) {
    case 'FRONT':
      // Observer at +Y looking toward -Y onto VP (Y = 0)
      // Camera is on +Y side: viewDirection = (0, 1, 0)
      // xAxis = (1, 0, 0) -> in-plane X is +X
      // in-plane Y = (0, 1, 0) x (1, 0, 0) = (0, 0, -1) = -Z
      // Elevation coordinate on VP: x = X, y = -v = +Z
      return {
        viewDirection: { x: 0, y: 1, z: 0 },
        xAxis: { x: 1, y: 0, z: 0 },
        mapCoords: (u, v) => ({ x: u, y: -v }),
      };

    case 'TOP':
      // Observer at +Z looking downward along -Z onto HP (Z = 0)
      // Camera is on +Z side: viewDirection = (0, 0, 1)
      // xAxis = (1, 0, 0) -> in-plane X is +X
      // in-plane Y = (0, 0, 1) x (1, 0, 0) = (0, 1, 0) = +Y
      // Plan coordinate on HP before fold-out: x = X, y = +Y
      return {
        viewDirection: { x: 0, y: 0, z: 1 },
        xAxis: { x: 1, y: 0, z: 0 },
        mapCoords: (u, v) => ({ x: u, y: v }),
      };

    case 'SIDE':
    case 'SIDE_LEFT':
      // Left-Hand Side View (LHSV) in First-Angle:
      // Observer stands to the left (-X) looking in +X direction onto Right Profile Plane
      // Camera is on -X side: viewDirection = (-1, 0, 0)
      // xAxis = (0, 1, 0) -> in-plane X is +Y
      // in-plane Y = (-1, 0, 0) x (0, 1, 0) = (0, 0, -1) = -Z
      // Coordinate on profile plane: x = Y, y = -v = +Z
      return {
        viewDirection: { x: -1, y: 0, z: 0 },
        xAxis: { x: 0, y: 1, z: 0 },
        mapCoords: (u, v) => ({ x: u, y: -v }),
      };

    case 'SIDE_RIGHT':
      // Right-Hand Side View (RHSV) in First-Angle:
      // Observer stands to the right (+X) looking in -X direction onto Left Profile Plane
      // Camera is on +X side: viewDirection = (1, 0, 0)
      // xAxis = (0, -1, 0) -> in-plane X is -Y
      // in-plane Y = (1, 0, 0) x (0, -1, 0) = (0, 0, -1) = -Z
      // Coordinate on profile plane: x = -Y, y = -v = +Z
      return {
        viewDirection: { x: 1, y: 0, z: 0 },
        xAxis: { x: 0, y: -1, z: 0 },
        mapCoords: (u, v) => ({ x: u, y: -v }),
      };

    default:
      throw new Error(`Unsupported HlrView: ${view}`);
  }
}

/**
 * Extract 2D line segments from an OCCT compound handle via wireframe sampling.
 */
function extractWireframeSegments(
  kernel: OcctKernel,
  shapeHandle: ShapeHandle,
  deflection: number,
  lineType: LineType,
  edgeKind: EdgeKind,
  mapCoords: (u: number, v: number) => Point2,
): TaggedSegment2[] {
  if (Number(shapeHandle) === 0) return [];

  const { points, edgeGroups } = kernel.wireframe(shapeHandle, deflection);
  const segments: TaggedSegment2[] = [];

  for (let g = 0; g < edgeGroups.length; g += 3) {
    const start = edgeGroups[g]!;
    const count = edgeGroups[g + 1]!;
    if (count < 6) continue; // At least 2 points (6 floats) required for a segment

    for (let i = 0; i < count - 3; i += 3) {
      const u1 = points[start + i]!;
      const v1 = points[start + i + 1]!;
      const u2 = points[start + i + 3]!;
      const v2 = points[start + i + 4]!;

      const p1 = mapCoords(u1, v1);
      const p2 = mapCoords(u2, v2);

      segments.push({
        p1,
        p2,
        lineType,
        edgeKind,
      });
    }
  }

  return segments;
}

/**
 * Perform exact Hidden Line Removal (HLR) on a 3D OCCT shape for a given view.
 *
 * @param kernel Initialized OcctKernel.
 * @param shape ShapeHandle of 3D solid.
 * @param view View direction ('FRONT' | 'TOP' | 'SIDE' | 'SIDE_LEFT' | 'SIDE_RIGHT').
 * @param options Deflection tolerance and algorithm mode flag.
 * @returns Array of 2D segments tagged with lineType ('visible' | 'hidden') and edgeKind ('sharp' | 'outline' | 'smooth').
 */
export function extractViewSegments(
  kernel: OcctKernel,
  shape: ShapeHandle,
  view: HlrView,
  options?: HlrOptions,
): TaggedSegment2[] {
  // Check feature flag
  if (options?.mode === 'POLYGON') {
    throw new Error('Polygon-based HLR mode is currently unimplemented. Use mode: "EXACT".');
  }

  const deflection = options?.deflection ?? DEFAULT_DEFLECTION_MM;
  const config = getViewBasisConfig(view);

  // Exact HLR projection via OCCT HLRBRep
  const proj: ProjectionData = kernel.projectEdges(
    shape,
    { x: 0, y: 0, z: 0 },
    config.viewDirection,
    config.xAxis,
  );

  try {
    const segments: TaggedSegment2[] = [];

    // Visible edges
    segments.push(
      ...extractWireframeSegments(kernel, proj.visibleSharp, deflection, 'visible', 'sharp', config.mapCoords),
      ...extractWireframeSegments(kernel, proj.visibleOutline, deflection, 'visible', 'outline', config.mapCoords),
      ...extractWireframeSegments(kernel, proj.visibleSmooth, deflection, 'visible', 'smooth', config.mapCoords),
    );

    // Hidden edges
    segments.push(
      ...extractWireframeSegments(kernel, proj.hiddenSharp, deflection, 'hidden', 'sharp', config.mapCoords),
      ...extractWireframeSegments(kernel, proj.hiddenOutline, deflection, 'hidden', 'outline', config.mapCoords),
      ...extractWireframeSegments(kernel, proj.hiddenSmooth, deflection, 'hidden', 'smooth', config.mapCoords),
    );

    return segments;
  } finally {
    // Release all temporary projection handles
    kernel.release(proj.visibleSharp);
    kernel.release(proj.visibleOutline);
    kernel.release(proj.visibleSmooth);
    kernel.release(proj.hiddenSharp);
    kernel.release(proj.hiddenOutline);
    kernel.release(proj.hiddenSmooth);
  }
}

/**
 * Generate a complete 3-view multiview bundle (Front, Top, Side) from a placed 3D solid
 * with First-Angle fold-out applied.
 *
 * Front View: Elevation (X, Z) on VP, placed above reference line XY (y > 0).
 * Top View: Plan (X, Y) on HP, folded down below reference line XY at (X, -Y - gapY).
 * Side View: Profile (LHSV) placed to the right of front view at (X1Y1 + Y, Z).
 *
 * @param kernel Initialized OcctKernel.
 * @param solid Placed solid, stage result, or shape handle.
 * @param options Multiview layout and normalisation options.
 * @returns Complete normalized MultiviewBundle.
 */
export function bundlePlacedSolid(
  kernel: OcctKernel,
  solid: BuiltSolid | PlacementStageResult | ShapeHandle,
  options?: MultiviewBundleOptions,
): MultiviewBundle {
  const handle: ShapeHandle =
    typeof solid === 'number'
      ? solid
      : 'handle' in solid
        ? solid.handle
        : (solid as ShapeHandle);

  const gapX = options?.gapX ?? 20;
  const gapY = options?.gapY ?? 0;
  const side = options?.sideView ?? 'LEFT';
  const normTol = options?.normaliseTolerance ?? 0.01;

  // 1. Front View: (X, Z)
  const rawFront = extractViewSegments(kernel, handle, 'FRONT', options);
  const normFront = normaliseSegments(rawFront, { tolerance: normTol });

  // Compute maximum X extent of front view to position X1Y1 reference line
  let maxFrontX = 0;
  for (const s of normFront) {
    if (s.p1.x > maxFrontX) maxFrontX = s.p1.x;
    if (s.p2.x > maxFrontX) maxFrontX = s.p2.x;
  }
  const x1y1LineX = maxFrontX + gapX;

  // 2. Top View: (X, Y) -> Fold-out to (X, -Y - gapY)
  const rawTop = extractViewSegments(kernel, handle, 'TOP', options);
  const foldedTop: TaggedSegment2[] = rawTop.map((s) => ({
    ...s,
    p1: { x: s.p1.x, y: -s.p1.y - gapY },
    p2: { x: s.p2.x, y: -s.p2.y - gapY },
  }));
  const normTop = normaliseSegments(foldedTop, { tolerance: normTol });

  // 3. Side View (Profile): (Y, Z) -> Sheet: (x1y1LineX + Y, Z)
  const sideViewKind: HlrView = side === 'LEFT' ? 'SIDE_LEFT' : 'SIDE_RIGHT';
  const rawSide = extractViewSegments(kernel, handle, sideViewKind, options);
  const placedSide: TaggedSegment2[] = rawSide.map((s) => ({
    ...s,
    p1: { x: x1y1LineX + s.p1.x, y: s.p1.y },
    p2: { x: x1y1LineX + s.p2.x, y: s.p2.y },
  }));
  const normSide = normaliseSegments(placedSide, { tolerance: normTol });

  return {
    front: normFront,
    top: normTop,
    side: normSide,
    xyLineY: 0,
    x1y1LineX,
  };
}
