import type { RegularPolygonSides, SolidType, TaggedSegment2, ValidationResult } from '../types';

export interface SolidConfig {
  type: SolidType;
  sides?: RegularPolygonSides;
  baseSize: number;
  topSize?: number;
  height: number;
}

export interface PlacementConfig {
  initialAxis?: 'PERPENDICULAR_TO_HP' | 'PERPENDICULAR_TO_VP';
  baseRotationDeg?: number;
  thetaDeg?: number;
  phiDeg?: number;
  distanceHP?: number;
  distanceVP?: number;
}

export interface WireframeMesh3D {
  /** Flat XYZ pairs for edge overlays: [x1, y1, z1, x2, y2, z2, ...]. */
  points: number[];
  /** Interleaved XYZ triangle vertices for shaded rendering. */
  positions?: number[];
  /** Interleaved XYZ vertex normals. */
  normals?: number[];
  /** Triangle indices into positions/normals. */
  indices?: number[];
}

export interface StageViewsResult {
  stage: 1 | 2 | 3;
  description: string;
  front: TaggedSegment2[];
  top: TaggedSegment2[];
  side: TaggedSegment2[];
  mesh3D: WireframeMesh3D;
  xyLineY: number;
  x1y1LineX: number;
}

export interface ComputeTimings {
  readonly wasmInitMs: number;
  readonly buildMs: number;
  readonly hlrMs: number;
  readonly totalMs: number;
}

export interface ComputeResult {
  validation: ValidationResult;
  stages: [StageViewsResult, StageViewsResult, StageViewsResult];
  timings?: ComputeTimings;
}

export type WorkerRequest =
  | { type: 'INIT' }
  | {
      type: 'COMPUTE';
      id: string;
      solid: SolidConfig;
      placement: PlacementConfig;
    };

export type WorkerResponse =
  | { type: 'INIT_OK' }
  | { type: 'COMPUTE_OK'; id: string; data: ComputeResult }
  | { type: 'ERROR'; id?: string; error: string };
