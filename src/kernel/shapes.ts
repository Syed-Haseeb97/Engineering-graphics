import type { OcctKernel, ShapeHandle, Vec3 } from 'occt-wasm';
import { BuiltSolid, RegularPolygonSides, SolidMetadata } from './types';

/** Compute regular polygon vertices centered at (0, 0, z) with n sides and side length s. */
export function computeRegularPolygonVertices(
  sides: RegularPolygonSides,
  sideLength: number,
  z = 0,
): Vec3[] {
  // Circumradius R = s / (2 * sin(π / n))
  const angleStep = (2 * Math.PI) / sides;
  const radius = sideLength / (2 * Math.sin(Math.PI / sides));

  const vertices: Vec3[] = [];
  for (let i = 0; i < sides; i++) {
    const theta = i * angleStep;
    vertices.push({
      x: radius * Math.cos(theta),
      y: radius * Math.sin(theta),
      z,
    });
  }
  return vertices;
}

/** Options for building a regular prism. */
export interface PrismOptions {
  readonly sides: RegularPolygonSides;
  readonly baseSize: number; // Side length of regular polygon base in mm
  readonly height: number; // Height along axis in mm
}

/**
 * Build a parametric regular prism (triangular, square, pentagonal, hexagonal).
 * Base rests on Z = 0 centered at (0, 0, 0), extruded along +Z.
 */
export function buildPrism(kernel: OcctKernel, options: PrismOptions): BuiltSolid {
  const { sides, baseSize, height } = options;
  const baseCorners = computeRegularPolygonVertices(sides, baseSize, 0);

  const edges: ShapeHandle[] = [];
  for (let i = 0; i < sides; i++) {
    const p1 = baseCorners[i]!;
    const p2 = baseCorners[(i + 1) % sides]!;
    edges.push(kernel.makeLineEdge(p1, p2));
  }
  const wire = kernel.makeWire(edges);
  const face = kernel.makeFace(wire);
  const handle = kernel.extrude(face, 0, 0, height);

  // Clean up intermediate wire and face handles
  edges.forEach((e) => kernel.release(e));
  kernel.release(wire);
  kernel.release(face);

  const topCorners: Vec3[] = baseCorners.map((p) => ({ x: p.x, y: p.y, z: height }));

  const namedPoints: Record<string, Vec3> = {
    baseCentre: { x: 0, y: 0, z: 0 },
    topCentre: { x: 0, y: 0, z: height },
  };
  baseCorners.forEach((p, idx) => {
    namedPoints[`baseCorner${idx}`] = p;
  });
  topCorners.forEach((p, idx) => {
    namedPoints[`topCorner${idx}`] = p;
  });

  const metadata: SolidMetadata = {
    solidType: 'PRISM',
    polygonSides: sides,
    baseSize,
    height,
    axisVector: { x: 0, y: 0, z: 1 },
    baseCentre: { x: 0, y: 0, z: 0 },
    topCentre: { x: 0, y: 0, z: height },
    baseCorners,
    topCorners,
    namedPoints,
  };

  return { handle, metadata };
}

/** Options for building a regular pyramid. */
export interface PyramidOptions {
  readonly sides: RegularPolygonSides;
  readonly baseSize: number; // Side length of regular polygon base in mm
  readonly height: number; // Height along axis in mm
}

/**
 * Build a parametric regular pyramid (triangular, square, pentagonal, hexagonal).
 * Base rests on Z = 0 centered at (0, 0, 0), apex at (0, 0, height).
 */
export function buildPyramid(kernel: OcctKernel, options: PyramidOptions): BuiltSolid {
  const { sides, baseSize, height } = options;
  const baseCorners = computeRegularPolygonVertices(sides, baseSize, 0);
  const apex: Vec3 = { x: 0, y: 0, z: height };

  // Bottom face: ordered clockwise viewed from +Z so the normal faces outward (-Z)
  const bottomEdges: ShapeHandle[] = [];
  for (let i = sides - 1; i >= 0; i--) {
    const p1 = baseCorners[i]!;
    const p2 = baseCorners[(i - 1 + sides) % sides]!;
    bottomEdges.push(kernel.makeLineEdge(p1, p2));
  }
  const bottomWire = kernel.makeWire(bottomEdges);
  const bottomFace = kernel.makeFace(bottomWire);

  // Triangular lateral faces
  const lateralFaces: ShapeHandle[] = [];
  for (let i = 0; i < sides; i++) {
    const p1 = baseCorners[i]!;
    const p2 = baseCorners[(i + 1) % sides]!;
    lateralFaces.push(kernel.buildTriFace(p1, p2, apex));
  }

  let handle = kernel.buildSolidFromFaces([bottomFace, ...lateralFaces], 1e-3);
  if (kernel.getVolume(handle) < 0) {
    const corrected = kernel.reverseShape(handle);
    kernel.release(handle);
    handle = corrected;
  }

  // Clean up construction entities
  bottomEdges.forEach((e) => kernel.release(e));
  kernel.release(bottomWire);
  kernel.release(bottomFace);
  lateralFaces.forEach((f) => kernel.release(f));

  const namedPoints: Record<string, Vec3> = {
    baseCentre: { x: 0, y: 0, z: 0 },
    apex,
  };
  baseCorners.forEach((p, idx) => {
    namedPoints[`baseCorner${idx}`] = p;
  });

  const metadata: SolidMetadata = {
    solidType: 'PYRAMID',
    polygonSides: sides,
    baseSize,
    height,
    axisVector: { x: 0, y: 0, z: 1 },
    baseCentre: { x: 0, y: 0, z: 0 },
    apex,
    baseCorners,
    namedPoints,
  };

  return { handle, metadata };
}

/** Options for building a cylinder. */
export interface CylinderOptions {
  readonly radius: number;
  readonly height: number;
}

/**
 * Build a parametric cylinder.
 * Base rests on Z = 0 centered at (0, 0, 0), axis along +Z.
 */
export function buildCylinder(kernel: OcctKernel, options: CylinderOptions): BuiltSolid {
  const { radius, height } = options;
  const handle = kernel.makeCylinder(radius, height);

  // Sample 8 perimeter points for bounding and snapping
  const baseCorners: Vec3[] = [];
  const topCorners: Vec3[] = [];
  for (let i = 0; i < 8; i++) {
    const theta = (i * 2 * Math.PI) / 8;
    baseCorners.push({ x: radius * Math.cos(theta), y: radius * Math.sin(theta), z: 0 });
    topCorners.push({ x: radius * Math.cos(theta), y: radius * Math.sin(theta), z: height });
  }

  const namedPoints: Record<string, Vec3> = {
    baseCentre: { x: 0, y: 0, z: 0 },
    topCentre: { x: 0, y: 0, z: height },
  };

  const metadata: SolidMetadata = {
    solidType: 'CYLINDER',
    baseSize: radius,
    height,
    axisVector: { x: 0, y: 0, z: 1 },
    baseCentre: { x: 0, y: 0, z: 0 },
    topCentre: { x: 0, y: 0, z: height },
    baseCorners,
    topCorners,
    namedPoints,
  };

  return { handle, metadata };
}

/** Options for building a cone. */
export interface ConeOptions {
  readonly radius: number;
  readonly height: number;
}

/**
 * Build a parametric cone with sharp apex.
 * Base rests on Z = 0 centered at (0, 0, 0), apex at (0, 0, height).
 */
export function buildCone(kernel: OcctKernel, options: ConeOptions): BuiltSolid {
  const { radius, height } = options;
  const handle = kernel.makeCone(radius, 0, height);

  const baseCorners: Vec3[] = [];
  for (let i = 0; i < 8; i++) {
    const theta = (i * 2 * Math.PI) / 8;
    baseCorners.push({ x: radius * Math.cos(theta), y: radius * Math.sin(theta), z: 0 });
  }

  const apex: Vec3 = { x: 0, y: 0, z: height };
  const namedPoints: Record<string, Vec3> = {
    baseCentre: { x: 0, y: 0, z: 0 },
    apex,
  };

  const metadata: SolidMetadata = {
    solidType: 'CONE',
    baseSize: radius,
    height,
    axisVector: { x: 0, y: 0, z: 1 },
    baseCentre: { x: 0, y: 0, z: 0 },
    apex,
    baseCorners,
    namedPoints,
  };

  return { handle, metadata };
}

/** Options for building a frustum of cone. */
export interface FrustumConeOptions {
  readonly bottomRadius: number;
  readonly topRadius: number;
  readonly height: number;
}

/**
 * Build a frustum of cone (truncated cone).
 * Bottom base rests on Z = 0, top base at Z = height.
 */
export function buildFrustumCone(kernel: OcctKernel, options: FrustumConeOptions): BuiltSolid {
  const { bottomRadius, topRadius, height } = options;
  const handle = kernel.makeCone(bottomRadius, topRadius, height);

  const baseCorners: Vec3[] = [];
  const topCorners: Vec3[] = [];
  for (let i = 0; i < 8; i++) {
    const theta = (i * 2 * Math.PI) / 8;
    baseCorners.push({ x: bottomRadius * Math.cos(theta), y: bottomRadius * Math.sin(theta), z: 0 });
    topCorners.push({ x: topRadius * Math.cos(theta), y: topRadius * Math.sin(theta), z: height });
  }

  const namedPoints: Record<string, Vec3> = {
    baseCentre: { x: 0, y: 0, z: 0 },
    topCentre: { x: 0, y: 0, z: height },
  };

  const metadata: SolidMetadata = {
    solidType: 'FRUSTUM_CONE',
    baseSize: bottomRadius,
    topSize: topRadius,
    height,
    axisVector: { x: 0, y: 0, z: 1 },
    baseCentre: { x: 0, y: 0, z: 0 },
    topCentre: { x: 0, y: 0, z: height },
    baseCorners,
    topCorners,
    namedPoints,
  };

  return { handle, metadata };
}

/** Options for building a frustum of pyramid. */
export interface FrustumPyramidOptions {
  readonly sides: RegularPolygonSides;
  readonly bottomSize: number;
  readonly topSize: number;
  readonly height: number;
}

/**
 * Build a frustum of pyramid (truncated regular pyramid).
 * Bottom base rests on Z = 0, top base at Z = height.
 */
export function buildFrustumPyramid(
  kernel: OcctKernel,
  options: FrustumPyramidOptions,
): BuiltSolid {
  const { sides, bottomSize, topSize, height } = options;
  const baseCorners = computeRegularPolygonVertices(sides, bottomSize, 0);
  const topCorners = computeRegularPolygonVertices(sides, topSize, height);

  const bottomEdges: ShapeHandle[] = [];
  const topEdges: ShapeHandle[] = [];
  for (let i = 0; i < sides; i++) {
    bottomEdges.push(kernel.makeLineEdge(baseCorners[i]!, baseCorners[(i + 1) % sides]!));
    topEdges.push(kernel.makeLineEdge(topCorners[i]!, topCorners[(i + 1) % sides]!));
  }

  const bWire = kernel.makeWire(bottomEdges);
  const tWire = kernel.makeWire(topEdges);

  // Ruled solid loft between matching regular polygon wires
  const handle = kernel.loft([bWire, tWire], true, true);

  // Cleanup construction wires
  bottomEdges.forEach((e) => kernel.release(e));
  topEdges.forEach((e) => kernel.release(e));
  kernel.release(bWire);
  kernel.release(tWire);

  const namedPoints: Record<string, Vec3> = {
    baseCentre: { x: 0, y: 0, z: 0 },
    topCentre: { x: 0, y: 0, z: height },
  };
  baseCorners.forEach((p, idx) => {
    namedPoints[`baseCorner${idx}`] = p;
  });
  topCorners.forEach((p, idx) => {
    namedPoints[`topCorner${idx}`] = p;
  });

  const metadata: SolidMetadata = {
    solidType: 'FRUSTUM_PYRAMID',
    polygonSides: sides,
    baseSize: bottomSize,
    topSize,
    height,
    axisVector: { x: 0, y: 0, z: 1 },
    baseCentre: { x: 0, y: 0, z: 0 },
    topCentre: { x: 0, y: 0, z: height },
    baseCorners,
    topCorners,
    namedPoints,
  };

  return { handle, metadata };
}
