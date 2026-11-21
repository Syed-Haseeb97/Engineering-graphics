import { OcctKernel } from 'occt-wasm';
import { extractViewSegments } from '../src/kernel/hlr';
import { placeSolid } from '../src/kernel/placement';
import { buildCone, buildPrism, buildPyramid } from '../src/kernel/shapes';
import type { TaggedSegment2 } from '../src/kernel/types';
import type { ProblemTemplate } from '../src/problems/types';
import { getGlobalOcctThreadPool } from './occt-thread-pool';

let cachedKernel: OcctKernel | null = null;

export interface OcctExecutionMetrics {
  callCount: number;
  totalDurationMs: number;
  callDurations: number[];
}

export const occtExecutionMetrics: OcctExecutionMetrics = {
  callCount: 0,
  totalDurationMs: 0,
  callDurations: [],
};

export function resetOcctExecutionMetrics(): void {
  occtExecutionMetrics.callCount = 0;
  occtExecutionMetrics.totalDurationMs = 0;
  occtExecutionMetrics.callDurations = [];
  getGlobalOcctThreadPool().resetMetrics();
}

/**
 * Initialize or reuse the shared OCCT WebAssembly kernel in the server process.
 */
export async function getServerOcctKernel(): Promise<OcctKernel> {
  if (!cachedKernel) {
    cachedKernel = await OcctKernel.init();
  }
  return cachedKernel;
}

/**
 * Enforce a strict time limit on asynchronous operations.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName = 'Operation',
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`TIMEOUT: ${operationName} exceeded time limit of ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Compute the canonical 2D ground truth segments directly from the deterministic problem parameters.
 *
 * Guaranteed Properties:
 * 1. Computed strictly on-the-fly in server memory.
 * 2. Never persisted to student-accessible database tables.
 * 3. Never serialized in client HTTP response payloads.
 */
export async function computeGroundTruth(
  template: ProblemTemplate,
  params: Readonly<Record<string, number>>,
): Promise<readonly TaggedSegment2[]> {
  try {
    const pool = getGlobalOcctThreadPool();
    if (pool.getPoolSize() > 0) {
      const segs = await pool.compute(template, params);
      occtExecutionMetrics.callCount = pool.metrics.callCount;
      occtExecutionMetrics.totalDurationMs = pool.metrics.totalDurationMs;
      occtExecutionMetrics.callDurations = pool.metrics.callDurations;
      return segs;
    }
  } catch {
    // Fall back to direct execution if pool is unavailable
  }

  switch (template.shape) {
    case 'LINE': {
      const len = params['trueLength'] ?? 75;
      const theta = params['theta'] ?? 30;
      const phi = params['phi'] ?? 30;
      const distHP = params['distHP'] ?? 20;
      const distVP = params['distVP'] ?? 25;

      const thetaRad = (theta * Math.PI) / 180;
      const phiRad = (phi * Math.PI) / 180;

      // Front view apparent length L * cos(phi)
      const apparentFront = len * Math.cos(phiRad);
      // Top view apparent length L * cos(theta)
      const apparentTop = len * Math.cos(thetaRad);

      const x0 = 30;

      return [
        // Front View (Elevation on VP, y > 0)
        {
          p1: { x: x0, y: distHP },
          p2: {
            x: x0 + apparentFront * Math.cos(thetaRad),
            y: distHP + len * Math.sin(thetaRad),
          },
          lineType: 'visible',
          edgeKind: 'sharp',
        },
        // Top View (Plan on HP folded down, y < 0)
        {
          p1: { x: x0, y: -distVP },
          p2: {
            x: x0 + apparentTop * Math.cos(phiRad),
            y: -distVP - len * Math.sin(phiRad),
          },
          lineType: 'visible',
          edgeKind: 'sharp',
        },
      ];
    }

    case 'POINT': {
      const distHP = params['distHP'] ?? 25;
      const distVP = params['distVP'] ?? 30;
      const x0 = 50;

      return [
        {
          p1: { x: x0, y: distHP },
          p2: { x: x0, y: distHP },
          lineType: 'visible',
          edgeKind: 'sharp',
        },
        {
          p1: { x: x0, y: -distVP },
          p2: { x: x0, y: -distVP },
          lineType: 'visible',
          edgeKind: 'sharp',
        },
      ];
    }

    case 'PRISM': {
      const t0 = performance.now();
      const kernel = await getServerOcctKernel();
      const baseSide = params['baseSide'] ?? 30;
      const height = params['height'] ?? 65;
      const theta = params['theta'] ?? 40;
      const distVP = params['distVP'] ?? 20;

      const solid = buildPrism(kernel, { sides: 4, baseSize: baseSide, height });
      const placed = placeSolid(kernel, solid, {
        initialAxis: 'PERPENDICULAR_TO_HP',
        thetaRad: (theta * Math.PI) / 180,
        distanceVP: distVP,
      });

      try {
        const frontSegs = extractViewSegments(kernel, placed.finalPlaced.handle, 'FRONT');
        const topSegs = extractViewSegments(kernel, placed.finalPlaced.handle, 'TOP');
        const duration = performance.now() - t0;
        occtExecutionMetrics.callCount++;
        occtExecutionMetrics.totalDurationMs += duration;
        occtExecutionMetrics.callDurations.push(duration);
        return [...frontSegs, ...topSegs];
      } finally {
        kernel.release(solid.handle);
        for (const st of placed.stages) {
          kernel.release(st.handle);
        }
      }
    }

    case 'CONE': {
      const t0 = performance.now();
      const kernel = await getServerOcctKernel();
      const baseDia = params['baseDia'] ?? 45;
      const height = params['height'] ?? 60;
      const theta = params['theta'] ?? 35;
      const phi = params['phi'] ?? 30;
      const distVP = params['distVP'] ?? 25;

      const solid = buildCone(kernel, { radius: baseDia / 2, height });
      const placed = placeSolid(kernel, solid, {
        initialAxis: 'PERPENDICULAR_TO_HP',
        thetaRad: (theta * Math.PI) / 180,
        phiRad: (phi * Math.PI) / 180,
        distanceVP: distVP,
      });

      try {
        const frontSegs = extractViewSegments(kernel, placed.finalPlaced.handle, 'FRONT');
        const topSegs = extractViewSegments(kernel, placed.finalPlaced.handle, 'TOP');
        const duration = performance.now() - t0;
        occtExecutionMetrics.callCount++;
        occtExecutionMetrics.totalDurationMs += duration;
        occtExecutionMetrics.callDurations.push(duration);
        return [...frontSegs, ...topSegs];
      } finally {
        kernel.release(solid.handle);
        for (const st of placed.stages) {
          kernel.release(st.handle);
        }
      }
    }

    case 'PYRAMID': {
      const t0 = performance.now();
      const kernel = await getServerOcctKernel();
      const baseSide = params['baseSide'] ?? 30;
      const height = params['height'] ?? 60;
      const phi = params['phi'] ?? 35;
      const distHP = params['distHP'] ?? 25;

      const solid = buildPyramid(kernel, { sides: 5, baseSize: baseSide, height });
      const placed = placeSolid(kernel, solid, {
        initialAxis: 'PERPENDICULAR_TO_VP',
        phiRad: (phi * Math.PI) / 180,
        distanceHP: distHP,
      });

      try {
        const frontSegs = extractViewSegments(kernel, placed.finalPlaced.handle, 'FRONT');
        const topSegs = extractViewSegments(kernel, placed.finalPlaced.handle, 'TOP');
        const duration = performance.now() - t0;
        occtExecutionMetrics.callCount++;
        occtExecutionMetrics.totalDurationMs += duration;
        occtExecutionMetrics.callDurations.push(duration);
        return [...frontSegs, ...topSegs];
      } finally {
        kernel.release(solid.handle);
        for (const st of placed.stages) {
          kernel.release(st.handle);
        }
      }
    }

    default: {
      // Default fallback synthetic ground truth for 2D plane laminae
      const size = params['sideA'] ?? 40;
      const len = params['sideB'] ?? 60;
      const x0 = 30;
      const y0 = params['distVP'] ?? 20;

      return [
        { p1: { x: x0, y: 15 }, p2: { x: x0 + size, y: 15 }, lineType: 'visible', edgeKind: 'sharp' },
        { p1: { x: x0 + size, y: 15 }, p2: { x: x0 + size, y: 15 + len }, lineType: 'visible', edgeKind: 'sharp' },
        { p1: { x: x0, y: -y0 }, p2: { x: x0 + size, y: -y0 }, lineType: 'visible', edgeKind: 'sharp' },
      ];
    }
  }
}
