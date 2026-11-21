import type { OcctKernel, ShapeHandle, Vec3 } from 'occt-wasm';
import {
  BuiltSolid,
  PlacementParams,
  PlacementResult,
  PlacementStageResult,
  ValidationResult,
} from './types';

/**
 * 3D vector rotation around an arbitrary unit axis using Rodrigues' formula.
 */
function rotateAboutAxis(v: Vec3, axis: Vec3, angleRad: number): Vec3 {
  const len = Math.hypot(axis.x, axis.y, axis.z) || 1;
  const kx = axis.x / len;
  const ky = axis.y / len;
  const kz = axis.z / len;
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const dot = kx * v.x + ky * v.y + kz * v.z;
  const crossX = ky * v.z - kz * v.y;
  const crossY = kz * v.x - kx * v.z;
  const crossZ = kx * v.y - ky * v.x;

  return {
    x: v.x * c + crossX * s + kx * dot * (1 - c),
    y: v.y * c + crossY * s + ky * dot * (1 - c),
    z: v.z * c + crossZ * s + kz * dot * (1 - c),
  };
}

/** Mutable working state for one placement stage. */
interface WorkingStage {
  handle: ShapeHandle;
  axis: Vec3;
  baseCentre: Vec3;
  apex?: Vec3;
  namedPoints: Record<string, Vec3>;
}

/** Release a working handle after moving it into a snapshot. */
function snapshotStage(
  kernel: OcctKernel,
  stage: WorkingStage,
  stageNumber: 1 | 2 | 3,
  description: string,
): PlacementStageResult {
  return {
    stage: stageNumber,
    description,
    handle: kernel.copy(stage.handle),
    transformedAxis: { ...stage.axis },
    transformedBaseCentre: { ...stage.baseCentre },
    transformedApex: stage.apex ? { ...stage.apex } : undefined,
    transformedNamedPoints: { ...stage.namedPoints },
  };
}

/**
 * Move a stage so that its lowest point sits `distanceHP` above HP and its
 * nearest point sits `distanceVP` in front of VP.
 *
 * Every stage is translated independently; the textbook sequence therefore
 * stays physically valid (resting on HP) instead of drifting behind VP while
 * the axes are rotated about the origin.
 */
function translateStageIntoQuadrant(
  kernel: OcctKernel,
  stage: WorkingStage,
  distanceHP: number,
  distanceVP: number,
): void {
  const bbox = kernel.getBoundingBox(stage.handle, { precise: true });
  const deltaY = distanceVP - bbox.ymin;
  const deltaZ = distanceHP - bbox.zmin;

  if (Math.abs(deltaY) < 1e-9 && Math.abs(deltaZ) < 1e-9) return;

  const moved = kernel.translate(stage.handle, 0, deltaY, deltaZ);
  kernel.release(stage.handle);
  stage.handle = moved;
  stage.baseCentre = translateVec(stage.baseCentre, 0, deltaY, deltaZ);
  if (stage.apex) stage.apex = translateVec(stage.apex, 0, deltaY, deltaZ);
  stage.namedPoints = transformPointsMap(stage.namedPoints, (p) =>
    translateVec(p, 0, deltaY, deltaZ),
  );
}

/**
 * 3D vector translation.
 */
function translateVec(v: Vec3, dx: number, dy: number, dz: number): Vec3 {
  return {
    x: v.x + dx,
    y: v.y + dy,
    z: v.z + dz,
  };
}

/**
 * Transform all named key points by a mapping function.
 */
function transformPointsMap(
  pts: Readonly<Record<string, Vec3>>,
  fn: (v: Vec3) => Vec3,
): Record<string, Vec3> {
  const res: Record<string, Vec3> = {};
  for (const [k, v] of Object.entries(pts)) {
    res[k] = fn(v);
  }
  return res;
}

/**
 * Executes the textbook 3-stage placement pipeline on a parametric solid.
 *
 * PLACEMENT ORDER & STAGE JUSTIFICATION:
 * In technical drawing (e.g. N.D. Bhatt Chapter 13 "Projections of Solids"), solids inclined to both
 * reference planes cannot be drawn directly in a single step. They must follow a strict sequential order:
 *
 * - Stage 1 (Simple Position):
 *   The solid is assumed to rest with its base on HP (or VP), with its axis perpendicular to the reference plane.
 *   Here the true shape of the base is visible. An initial base rotation (baseRotationRad) is applied to satisfy
 *   the resting condition (e.g., a base edge parallel or perpendicular to VP, or resting on a corner).
 *
 * - Stage 2 (First Tilt - Inclination to HP):
 *   The solid is tilted by tilting its axis to true angle θ with HP. This pitch rotation occurs about an axis
 *   parallel to VP (around X), establishing the true inclination with HP while keeping the elevation view simple.
 *
 * - Stage 3 (Second Tilt - Inclination to VP):
 *   The solid is rotated about the vertical Z-axis so that the axis makes true angle φ with VP.
 *   Because 3D rotations do not commute (Rz * Rx ≠ Rx * Rz), tilting to HP first then yawing to VP preserves
 *   the true elevation angle θ while orienting the axis to true angle φ.
 *
 * - Final Stage (Nearest Point Translation):
 *   The solid is translated along Y and Z so that its nearest corner/edge satisfies:
 *   min(Z) = distanceHP (distance from HP) and min(Y) = distanceVP (distance in front of VP).
 *
 * @param kernel Active OcctKernel instance.
 * @param solid The built solid to place.
 * @param params Placement parameters (initialAxis, baseRotationRad, thetaRad, phiRad, distanceHP, distanceVP).
 * @returns Complete PlacementResult with inspectable intermediate stages.
 */
export function placeSolid(
  kernel: OcctKernel,
  solid: BuiltSolid,
  params?: PlacementParams,
): PlacementResult {
  const initialAxis = params?.initialAxis ?? 'PERPENDICULAR_TO_HP';
  const baseRotation = params?.baseRotationRad ?? 0;
  const thetaRad = params?.thetaRad ?? Math.PI / 2; // Default 90° (perpendicular to HP)
  const phiRad = params?.phiRad ?? 0; // Default 0° (parallel to VP)
  const distanceHP = params?.distanceHP ?? 0;
  const distanceVP = params?.distanceVP ?? 0;

  // --- STAGE 1: Simple Position ---
  const stage1State: WorkingStage = {
    handle: kernel.copy(solid.handle),
    axis: { ...solid.metadata.axisVector },
    baseCentre: { ...solid.metadata.baseCentre },
    apex: solid.metadata.apex ? { ...solid.metadata.apex } : undefined,
    namedPoints: { ...solid.metadata.namedPoints },
  };

  if (initialAxis === 'PERPENDICULAR_TO_VP') {
    // Rotate -90° around X axis to point the axis along +Y (perpendicular to VP)
    const axisX: Vec3 = { x: 1, y: 0, z: 0 };
    const angle = -Math.PI / 2;
    const rotated = kernel.rotate(
      stage1State.handle,
      { point: { x: 0, y: 0, z: 0 }, direction: axisX },
      angle,
    );
    kernel.release(stage1State.handle);
    stage1State.handle = rotated;
    stage1State.axis = rotateAboutAxis(stage1State.axis, axisX, angle);
    stage1State.baseCentre = rotateAboutAxis(stage1State.baseCentre, axisX, angle);
    if (stage1State.apex) {
      stage1State.apex = rotateAboutAxis(stage1State.apex, axisX, angle);
    }
    stage1State.namedPoints = transformPointsMap(stage1State.namedPoints, (p) =>
      rotateAboutAxis(p, axisX, angle),
    );
  }

  if (Math.abs(baseRotation) > 1e-6) {
    // Rotate the base about the solid's own axis (Z for HP, Y for VP).
    const rotated = kernel.rotate(
      stage1State.handle,
      { point: { x: 0, y: 0, z: 0 }, direction: stage1State.axis },
      baseRotation,
    );
    kernel.release(stage1State.handle);
    stage1State.handle = rotated;
    stage1State.axis = rotateAboutAxis(stage1State.axis, stage1State.axis, baseRotation);
    stage1State.baseCentre = rotateAboutAxis(
      stage1State.baseCentre,
      stage1State.axis,
      baseRotation,
    );
    if (stage1State.apex) {
      stage1State.apex = rotateAboutAxis(stage1State.apex, stage1State.axis, baseRotation);
    }
    stage1State.namedPoints = transformPointsMap(stage1State.namedPoints, (p) =>
      rotateAboutAxis(p, stage1State.axis, baseRotation),
    );
  }

  translateStageIntoQuadrant(kernel, stage1State, distanceHP, distanceVP);

  const stage1 = snapshotStage(
    kernel,
    stage1State,
    1,
    `Simple position: axis perpendicular to ${initialAxis === 'PERPENDICULAR_TO_VP' ? 'VP' : 'HP'}`,
  );

  // --- STAGE 2: Tilt the axis to the true angle θ with HP ---
  const stage2State: WorkingStage = {
    handle: kernel.copy(stage1State.handle),
    axis: { ...stage1State.axis },
    baseCentre: { ...stage1State.baseCentre },
    apex: stage1State.apex ? { ...stage1State.apex } : undefined,
    namedPoints: { ...stage1State.namedPoints },
  };

  // HP-perpendicular solids start at 90° to HP and pitch about X-parallel Y.
  // VP-perpendicular solids start at 0° to HP and pitch about X.
  const tiltAxis: Vec3 =
    initialAxis === 'PERPENDICULAR_TO_VP' ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const pitchAngle =
    initialAxis === 'PERPENDICULAR_TO_VP' ? thetaRad : Math.PI / 2 - thetaRad;

  if (Math.abs(pitchAngle) > 1e-6) {
    const rotated = kernel.rotate(
      stage2State.handle,
      { point: { x: 0, y: 0, z: 0 }, direction: tiltAxis },
      pitchAngle,
    );
    kernel.release(stage2State.handle);
    stage2State.handle = rotated;
    stage2State.axis = rotateAboutAxis(stage2State.axis, tiltAxis, pitchAngle);
    stage2State.baseCentre = rotateAboutAxis(stage2State.baseCentre, tiltAxis, pitchAngle);
    if (stage2State.apex) {
      stage2State.apex = rotateAboutAxis(stage2State.apex, tiltAxis, pitchAngle);
    }
    stage2State.namedPoints = transformPointsMap(stage2State.namedPoints, (p) =>
      rotateAboutAxis(p, tiltAxis, pitchAngle),
    );
  }

  translateStageIntoQuadrant(kernel, stage2State, distanceHP, distanceVP);

  const stage2 = snapshotStage(
    kernel,
    stage2State,
    2,
    `Axis tilted to ${((thetaRad * 180) / Math.PI).toFixed(1)}° with HP`,
  );

  // --- STAGE 3: Turn the axis to the true angle φ with VP ---
  // With axis (cosθ, 0, sinθ), rotating about Z by γ gives
  // (cosθ·cosγ, cosθ·sinγ, sinθ). The angle with VP satisfies
  // sinφ = |y| = cosθ·sinγ, hence γ = asin(sinφ / cosθ).
  const stage3State: WorkingStage = {
    handle: kernel.copy(stage2State.handle),
    axis: { ...stage2State.axis },
    baseCentre: { ...stage2State.baseCentre },
    apex: stage2State.apex ? { ...stage2State.apex } : undefined,
    namedPoints: { ...stage2State.namedPoints },
  };

  if (phiRad > 1e-6) {
    const cosTheta = Math.cos(thetaRad);
    const sinPhi = Math.sin(phiRad);
    if (sinPhi > cosTheta + 1e-6) {
      throw new Error(
        `Geometrically impossible angles: sin(phi) [${sinPhi.toFixed(4)}] cannot exceed cos(theta) [${cosTheta.toFixed(4)}]. ` +
          `Sum of squares sin^2(theta) + sin^2(phi) must be <= 1 in 3D space.`,
      );
    }
    const ratio = Math.min(1, Math.max(-1, sinPhi / (cosTheta || 1e-6)));
    const yawAngle = Math.asin(ratio);
    const zAxis: Vec3 = { x: 0, y: 0, z: 1 };

    const rotated = kernel.rotate(
      stage3State.handle,
      { point: { x: 0, y: 0, z: 0 }, direction: zAxis },
      yawAngle,
    );
    kernel.release(stage3State.handle);
    stage3State.handle = rotated;
    stage3State.axis = rotateAboutAxis(stage3State.axis, zAxis, yawAngle);
    stage3State.baseCentre = rotateAboutAxis(stage3State.baseCentre, zAxis, yawAngle);
    if (stage3State.apex) {
      stage3State.apex = rotateAboutAxis(stage3State.apex, zAxis, yawAngle);
    }
    stage3State.namedPoints = transformPointsMap(stage3State.namedPoints, (p) =>
      rotateAboutAxis(p, zAxis, yawAngle),
    );
  }

  translateStageIntoQuadrant(kernel, stage3State, distanceHP, distanceVP);

  const stage3 = snapshotStage(
    kernel,
    stage3State,
    3,
    `Axis oriented to ${((phiRad * 180) / Math.PI).toFixed(1)}° with VP`,
  );

  // Stage 3 is already at its final position. Keep a separate handle for the
  // canonical final placement so callers can release it independently.
  const finalPlaced: PlacementStageResult = {
    stage: 3,
    description: `Final position: ${distanceHP} mm above HP, ${distanceVP} mm in front of VP`,
    handle: kernel.copy(stage3State.handle),
    transformedAxis: { ...stage3State.axis },
    transformedBaseCentre: { ...stage3State.baseCentre },
    transformedApex: stage3State.apex ? { ...stage3State.apex } : undefined,
    transformedNamedPoints: { ...stage3State.namedPoints },
  };

  // Release the three intermediate working handles (snapshots own copies).
  kernel.release(stage1State.handle);
  kernel.release(stage2State.handle);
  kernel.release(stage3State.handle);

  return {
    stages: [stage1, stage2, stage3],
    finalPlaced,
  };
}

/**
 * Validate that an OCCT solid is situated entirely in the first quadrant.
 *
 * Quadrant 1 requires:
 * - Height above HP: z >= 0
 * - Distance in front of VP: y >= 0
 *
 * @param kernel Active OcctKernel instance.
 * @param shape Shape handle to validate.
 * @param tolerance Allowable negative boundary tolerance in mm (default: 1e-4 mm).
 * @returns ValidationResult with typed error discrimination.
 */
export function validateFirstQuadrant(
  kernel: OcctKernel,
  shape: ShapeHandle,
  tolerance = 1e-4,
): ValidationResult {
  const bbox = kernel.getBoundingBox(shape, { precise: true });

  const belowHP = bbox.zmin < -tolerance;
  const behindVP = bbox.ymin < -tolerance;

  if (belowHP && behindVP) {
    return {
      valid: false,
      error: 'BELOW_AND_BEHIND',
      minZ: bbox.zmin,
      minY: bbox.ymin,
      message: `Solid violates First Quadrant rules: extends below HP (min Z: ${bbox.zmin.toFixed(3)} mm) and behind VP (min Y: ${bbox.ymin.toFixed(3)} mm).`,
    };
  }

  if (belowHP) {
    return {
      valid: false,
      error: 'BELOW_HORIZONTAL_PLANE',
      minZ: bbox.zmin,
      minY: bbox.ymin,
      message: `Solid violates First Quadrant rules: extends below HP (min Z: ${bbox.zmin.toFixed(3)} mm).`,
    };
  }

  if (behindVP) {
    return {
      valid: false,
      error: 'BEHIND_VERTICAL_PLANE',
      minZ: bbox.zmin,
      minY: bbox.ymin,
      message: `Solid violates First Quadrant rules: extends behind VP (min Y: ${bbox.ymin.toFixed(3)} mm).`,
    };
  }

  return { valid: true };
}
