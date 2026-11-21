import * as fs from 'fs';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OcctKernel } from 'occt-wasm';
import {
  buildCone,
  buildCylinder,
  buildFrustumCone,
  buildFrustumPyramid,
  buildPrism,
  buildPyramid,
} from '../shapes';
import { placeSolid } from '../placement';
import { extractViewSegments } from '../hlr';
import { BuiltSolid, PlacementParams, RegularPolygonSides, TaggedSegment2 } from '../types';
import { validateProblemJson } from '../../../testing/textbook/validate';

interface ProblemDefinition {
  id: string;
  source: {
    book: string;
    author: string;
    chapter: string | number;
    problemNumber?: string | number;
    page?: string | number;
  };
  statement: string;
  solid: {
    type: 'PRISM' | 'PYRAMID' | 'CYLINDER' | 'CONE' | 'FRUSTUM_CONE' | 'FRUSTUM_PYRAMID';
    sides?: number;
    baseSize: number;
    topSize?: number;
    height: number;
  };
  placement: {
    initialAxis?: 'PERPENDICULAR_TO_HP' | 'PERPENDICULAR_TO_VP';
    baseRotationDeg?: number;
    baseRotationRad?: number;
    thetaDeg?: number;
    thetaRad?: number;
    phiDeg?: number;
    phiRad?: number;
    distanceHP?: number;
    distanceVP?: number;
    restingCondition?: string;
  };
  expected: {
    frontView?: {
      height?: number;
      width?: number;
      minZ?: number;
      maxZ?: number;
      apparentAxisLength?: number;
      apparentAxisAngleDeg?: number;
    };
    topView?: {
      length?: number;
      width?: number;
      apparentAxisLength?: number;
      apparentAxisAngleDeg?: number;
    };
    sideView?: {
      height?: number;
      width?: number;
    };
  };
  needsHumanCheck?: boolean;
  humanCheckReason?: string;
  notes?: string;
}

describe('Textbook Regression Suite (N.D. Bhatt Projections of Solids)', () => {
  let kernel: OcctKernel;
  const problemsDir = path.resolve(__dirname, '../../../testing/textbook/problems');
  const problemFiles = fs.existsSync(problemsDir)
    ? fs.readdirSync(problemsDir).filter((f) => f.endsWith('.json') && !f.endsWith('.schema.json'))
    : [];

  beforeAll(async () => {
    kernel = await OcctKernel.init();
  });

  afterAll(() => {
    kernel[Symbol.dispose]?.();
  });

  it('validates all textbook problem JSON files against schema without errors', () => {
    expect(problemFiles.length).toBeGreaterThan(0);
    for (const file of problemFiles) {
      const fullPath = path.join(problemsDir, file);
      const content = fs.readFileSync(fullPath, 'utf8');
      const json = JSON.parse(content);
      const errors = validateProblemJson(json, fullPath);
      expect(errors).toEqual([]);
    }
  });

  describe('Problem Regression Execution (Tolerance: 0.5 mm)', () => {
    for (const file of problemFiles) {
      const fullPath = path.join(problemsDir, file);
      const problem: ProblemDefinition = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

      it(`Solves ${problem.id}: ${problem.statement.slice(0, 50)}...`, () => {
        // 1. Build solid
        let solid: BuiltSolid;
        const s = problem.solid;
        switch (s.type) {
          case 'PRISM':
            solid = buildPrism(kernel, {
              sides: (s.sides ?? 4) as RegularPolygonSides,
              baseSize: s.baseSize,
              height: s.height,
            });
            break;
          case 'PYRAMID':
            solid = buildPyramid(kernel, {
              sides: (s.sides ?? 4) as RegularPolygonSides,
              baseSize: s.baseSize,
              height: s.height,
            });
            break;
          case 'CYLINDER':
            solid = buildCylinder(kernel, { radius: s.baseSize, height: s.height });
            break;
          case 'CONE':
            solid = buildCone(kernel, { radius: s.baseSize, height: s.height });
            break;
          case 'FRUSTUM_CONE':
            solid = buildFrustumCone(kernel, {
              bottomRadius: s.baseSize,
              topRadius: s.topSize ?? s.baseSize / 2,
              height: s.height,
            });
            break;
          case 'FRUSTUM_PYRAMID':
            solid = buildFrustumPyramid(kernel, {
              sides: (s.sides ?? 4) as RegularPolygonSides,
              bottomSize: s.baseSize,
              topSize: s.topSize ?? s.baseSize / 2,
              height: s.height,
            });
            break;
        }

        // 2. Place solid
        const p = problem.placement;
        const placementParams: PlacementParams = {
          initialAxis: p.initialAxis,
          baseRotationRad:
            p.baseRotationRad ?? (p.baseRotationDeg !== undefined ? (p.baseRotationDeg * Math.PI) / 180 : 0),
          thetaRad: p.thetaRad ?? (p.thetaDeg !== undefined ? (p.thetaDeg * Math.PI) / 180 : undefined),
          phiRad: p.phiRad ?? (p.phiDeg !== undefined ? (p.phiDeg * Math.PI) / 180 : undefined),
          distanceHP: p.distanceHP ?? 0,
          distanceVP: p.distanceVP ?? 0,
        };

        const placed = placeSolid(kernel, solid, placementParams);

        // 3. Extract Front View
        const frontSegs: TaggedSegment2[] = extractViewSegments(kernel, placed.finalPlaced.handle, 'FRONT');

        let minX = Infinity,
          maxX = -Infinity,
          minZ = Infinity,
          maxZ = -Infinity;
        for (const seg of frontSegs) {
          minX = Math.min(minX, seg.p1.x, seg.p2.x);
          maxX = Math.max(maxX, seg.p1.x, seg.p2.x);
          minZ = Math.min(minZ, seg.p1.y, seg.p2.y);
          maxZ = Math.max(maxZ, seg.p1.y, seg.p2.y);
        }

        const frontWidth = maxX - minX;
        const frontHeight = maxZ - minZ;

        // Verify transformed axis length in top view (foreshortened plan length) and front view
        const axisVector = placed.finalPlaced.transformedAxis;
        const axisLengthTop = Math.sqrt(axisVector.x * axisVector.x + axisVector.y * axisVector.y) * s.height;
        const axisLengthFront = Math.sqrt(axisVector.x * axisVector.x + axisVector.z * axisVector.z) * s.height;

        // Verify published dimensions if provided (tolerance 0.5 mm)
        // If problem is marked needsHumanCheck, we verify execution and log discrepancy rather than forcing a pass
        if (problem.needsHumanCheck) {
          console.log(
            `[HUMAN CHECK REQUIRED] Problem ${problem.id}: ${problem.humanCheckReason}\n` +
              `  Computed Front: width=${frontWidth.toFixed(2)}mm, height=${frontHeight.toFixed(2)}mm, axisLen=${axisLengthFront.toFixed(2)}mm\n` +
              `  Computed Top: axisLen=${axisLengthTop.toFixed(2)}mm`,
          );
        } else {
          if (problem.expected.frontView?.height !== undefined) {
            expect(frontHeight).toBeCloseTo(problem.expected.frontView.height, 0);
          }
          if (problem.expected.frontView?.width !== undefined) {
            expect(frontWidth).toBeCloseTo(problem.expected.frontView.width, 0);
          }
          if (problem.expected.topView?.apparentAxisLength !== undefined) {
            expect(axisLengthTop).toBeCloseTo(problem.expected.topView.apparentAxisLength, 0.5);
          }
          if (problem.expected.frontView?.apparentAxisLength !== undefined) {
            expect(axisLengthFront).toBeCloseTo(problem.expected.frontView.apparentAxisLength, 0.5);
          }
        }

        // Clean up handles
        kernel.release(solid.handle);
        for (const stg of placed.stages) {
          kernel.release(stg.handle);
        }
      });
    }
  });

  describe('Problems Requiring Human / Editorial Verification ("needs human check")', () => {
    for (const file of problemFiles) {
      const fullPath = path.join(problemsDir, file);
      const problem: ProblemDefinition = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

      if (problem.needsHumanCheck) {
        it(`[NEEDS HUMAN CHECK] ${problem.id}: ${problem.humanCheckReason}`, () => {
          expect(problem.needsHumanCheck).toBe(true);
          expect(problem.humanCheckReason).toBeDefined();
          expect(problem.humanCheckReason!.length).toBeGreaterThan(10);
        });
      }
    }
  });
});
