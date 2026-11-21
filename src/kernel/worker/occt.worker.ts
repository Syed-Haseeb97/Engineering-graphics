import { OcctKernel, ShapeHandle } from 'occt-wasm';
import {
  buildCone,
  buildCylinder,
  buildFrustumCone,
  buildFrustumPyramid,
  buildPrism,
  buildPyramid,
} from '../shapes';
import { placeSolid, validateFirstQuadrant } from '../placement';
import { bundlePlacedSolid } from '../hlr';
import { BuiltSolid, PlacementParams, RegularPolygonSides } from '../types';
import type {
  ComputeResult,
  StageViewsResult,
  WireframeMesh3D,
  WorkerRequest,
  WorkerResponse,
} from './types';

let kernelPromise: Promise<OcctKernel> | null = null;
let wasmInitDurationMs = 0;

async function getKernel(): Promise<OcctKernel> {
  if (!kernelPromise) {
    const t0 = performance.now();
    kernelPromise = OcctKernel.init().then((k) => {
      wasmInitDurationMs = performance.now() - t0;
      return k;
    });
  }
  return kernelPromise;
}

function extractMesh3D(kernel: OcctKernel, shape: ShapeHandle): WireframeMesh3D {
  if (Number(shape) === 0) return { points: [] };

  // Tessellate first so the edge overlay can share vertices with the shaded mesh.
  const tessellation = kernel.tessellate(shape, {
    linearDeflection: 0.35,
    angularDeflection: 0.3,
  });
  const { points, edgeGroups } = kernel.wireframe(shape, {
    source: 'triangulation',
    deflection: 0.15,
  });
  const linePoints: number[] = [];

  for (let g = 0; g < edgeGroups.length; g += 3) {
    const start = edgeGroups[g]!;
    const count = edgeGroups[g + 1]!;
    if (count < 6) continue;

    for (let i = 0; i < count - 3; i += 3) {
      // Point 1 (x, y, z)
      linePoints.push(points[start + i]!, points[start + i + 1]!, points[start + i + 2]!);
      // Point 2 (x, y, z)
      linePoints.push(points[start + i + 3]!, points[start + i + 4]!, points[start + i + 5]!);
    }
  }

  return {
    points: linePoints,
    positions: Array.from(tessellation.positions),
    normals: Array.from(tessellation.normals),
    indices: Array.from(tessellation.indices),
  };
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;

  try {
    const kernel = await getKernel();

    if (req.type === 'INIT') {
      const res: WorkerResponse = { type: 'INIT_OK' };
      self.postMessage(res);
      return;
    }

    if (req.type === 'COMPUTE') {
      const { id, solid: sConf, placement: pConf } = req;
      const tComputeStart = performance.now();

      // 1. Build solid
      const tBuildStart = performance.now();
      let solid: BuiltSolid;
      switch (sConf.type) {
        case 'PRISM':
          solid = buildPrism(kernel, {
            sides: (sConf.sides ?? 4) as RegularPolygonSides,
            baseSize: sConf.baseSize,
            height: sConf.height,
          });
          break;
        case 'PYRAMID':
          solid = buildPyramid(kernel, {
            sides: (sConf.sides ?? 4) as RegularPolygonSides,
            baseSize: sConf.baseSize,
            height: sConf.height,
          });
          break;
        case 'CYLINDER':
          solid = buildCylinder(kernel, { radius: sConf.baseSize, height: sConf.height });
          break;
        case 'CONE':
          solid = buildCone(kernel, { radius: sConf.baseSize, height: sConf.height });
          break;
        case 'FRUSTUM_CONE':
          solid = buildFrustumCone(kernel, {
            bottomRadius: sConf.baseSize,
            topRadius: sConf.topSize ?? sConf.baseSize / 2,
            height: sConf.height,
          });
          break;
        case 'FRUSTUM_PYRAMID':
          solid = buildFrustumPyramid(kernel, {
            sides: (sConf.sides ?? 4) as RegularPolygonSides,
            bottomSize: sConf.baseSize,
            topSize: sConf.topSize ?? sConf.baseSize / 2,
            height: sConf.height,
          });
          break;
        default:
          throw new Error(`Unsupported solid type: ${(sConf as { type: string }).type}`);
      }

      const buildMs = performance.now() - tBuildStart;

      // 2. Prepare placement params
      const pParams: PlacementParams = {
        initialAxis: pConf.initialAxis,
        baseRotationRad:
          pConf.baseRotationDeg !== undefined ? (pConf.baseRotationDeg * Math.PI) / 180 : 0,
        thetaRad: pConf.thetaDeg !== undefined ? (pConf.thetaDeg * Math.PI) / 180 : undefined,
        phiRad: pConf.phiDeg !== undefined ? (pConf.phiDeg * Math.PI) / 180 : undefined,
        distanceHP: pConf.distanceHP ?? 0,
        distanceVP: pConf.distanceVP ?? 0,
      };

      // 3. Place solid through 3 stages
      const placement = placeSolid(kernel, solid, pParams);

      // 4. Validate final placed solid in quadrant 1
      const validation = validateFirstQuadrant(kernel, placement.finalPlaced.handle);

      // 5. Generate views and 3D wireframe for all 3 stages (3-view HLR: Front, Top, Side)
      const tHlrStart = performance.now();
      const stagesResults: StageViewsResult[] = [];

      for (let i = 0; i < placement.stages.length; i++) {
        const stageRes = placement.stages[i]!;
        const bundle = bundlePlacedSolid(kernel, stageRes.handle, {
          gapX: 20,
          gapY: 0,
          sideView: 'LEFT',
        });
        const mesh3D = extractMesh3D(kernel, stageRes.handle);

        stagesResults.push({
          stage: stageRes.stage,
          description: stageRes.description,
          front: [...bundle.front],
          top: [...bundle.top],
          side: [...bundle.side],
          mesh3D,
          xyLineY: bundle.xyLineY,
          x1y1LineX: bundle.x1y1LineX,
        });
      }
      const hlrMs = performance.now() - tHlrStart;
      const totalMs = performance.now() - tComputeStart;

      // Cleanup OCCT handles
      kernel.release(solid.handle);
      for (const stg of placement.stages) {
        kernel.release(stg.handle);
      }
      kernel.release(placement.finalPlaced.handle);

      const computeRes: ComputeResult = {
        validation,
        stages: [stagesResults[0]!, stagesResults[1]!, stagesResults[2]!],
        timings: {
          wasmInitMs: wasmInitDurationMs,
          buildMs,
          hlrMs,
          totalMs,
        },
      };

      const res: WorkerResponse = {
        type: 'COMPUTE_OK',
        id,
        data: computeRes,
      };
      self.postMessage(res);
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const res: WorkerResponse = {
      type: 'ERROR',
      id: req && 'id' in req ? req.id : undefined,
      error: errorMsg,
    };
    self.postMessage(res);
  }
};
