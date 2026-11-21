import { parentPort } from 'node:worker_threads';
import { OcctKernel } from 'occt-wasm';
import { extractViewSegments } from '../src/kernel/hlr';
import { placeSolid } from '../src/kernel/placement';
import { buildCone, buildPrism, buildPyramid } from '../src/kernel/shapes';
import type { TaggedSegment2 } from '../src/kernel/types';
import type { ProblemTemplate } from '../src/problems/types';

let kernelInstance: OcctKernel | null = null;

async function getWorkerKernel(): Promise<OcctKernel> {
  if (!kernelInstance) {
    kernelInstance = await OcctKernel.init();
  }
  return kernelInstance;
}

export function computeGroundTruthDirect(
  kernel: OcctKernel,
  template: ProblemTemplate,
  params: Readonly<Record<string, number>>,
): readonly TaggedSegment2[] {
  switch (template.shape) {
    case 'LINE': {
      const len = params['trueLength'] ?? 75;
      const theta = params['theta'] ?? 30;
      const phi = params['phi'] ?? 30;
      const distHP = params['distHP'] ?? 20;
      const distVP = params['distVP'] ?? 25;

      const thetaRad = (theta * Math.PI) / 180;
      const phiRad = (phi * Math.PI) / 180;

      const apparentFront = len * Math.cos(phiRad);
      const apparentTop = len * Math.cos(thetaRad);
      const x0 = 30;

      return [
        {
          p1: { x: x0, y: distHP },
          p2: {
            x: x0 + apparentFront * Math.cos(thetaRad),
            y: distHP + len * Math.sin(thetaRad),
          },
          lineType: 'visible',
          edgeKind: 'sharp',
        },
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
        return [...frontSegs, ...topSegs];
      } finally {
        kernel.release(solid.handle);
        for (const st of placed.stages) {
          kernel.release(st.handle);
        }
      }
    }

    case 'CONE': {
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
        return [...frontSegs, ...topSegs];
      } finally {
        kernel.release(solid.handle);
        for (const st of placed.stages) {
          kernel.release(st.handle);
        }
      }
    }

    case 'PYRAMID': {
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
        return [...frontSegs, ...topSegs];
      } finally {
        kernel.release(solid.handle);
        for (const st of placed.stages) {
          kernel.release(st.handle);
        }
      }
    }

    default: {
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

if (parentPort) {
  parentPort.on('message', async (task: { id: string; template: ProblemTemplate; params: Record<string, number> }) => {
    try {
      const t0 = performance.now();
      const kernel = await getWorkerKernel();
      const segments = computeGroundTruthDirect(kernel, task.template, task.params);
      const durationMs = performance.now() - t0;
      parentPort?.postMessage({
        id: task.id,
        success: true,
        segments,
        durationMs,
      });
    } catch (err) {
      parentPort?.postMessage({
        id: task.id,
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // Pre-initialize kernel on worker startup
  void getWorkerKernel().then(() => {
    parentPort?.postMessage({ type: 'READY' });
  });
}
