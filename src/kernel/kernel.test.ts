import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OcctKernel } from 'occt-wasm';
import {
  buildCone,
  buildCylinder,
  buildFrustumCone,
  buildFrustumPyramid,
  buildPrism,
  buildPyramid,
} from './shapes';
import { placeSolid, validateFirstQuadrant } from './placement';

describe('Parametric OCCT Solid Builders & Placement Pipeline', () => {
  let kernel: OcctKernel;

  beforeAll(async () => {
    kernel = await OcctKernel.init();
  });

  afterAll(() => {
    // Clean up WASM instance
    kernel[Symbol.dispose]?.();
  });

  describe('Shape Builders: Exact Volume, BBox & Metadata', () => {
    it('builds triangular prism with exact volume and key points', () => {
      // Equilateral triangle side s = 30 mm, height h = 50 mm
      // Base Area = (sqrt(3)/4) * 30^2 ≈ 389.7114317 mm^2
      // Expected Volume = 389.7114317 * 50 ≈ 19485.571586 mm^3
      const solid = buildPrism(kernel, { sides: 3, baseSize: 30, height: 50 });
      const vol = kernel.getVolume(solid.handle);
      const bbox = kernel.getBoundingBox(solid.handle, { precise: true });

      expect(vol).toBeCloseTo(19485.57, 1);
      expect(bbox.zmin).toBeCloseTo(0, 4);
      expect(bbox.zmax).toBeCloseTo(50, 4);
      expect(solid.metadata.baseCorners.length).toBe(3);
      expect(solid.metadata.topCorners?.length).toBe(3);
      expect(solid.metadata.namedPoints['baseCorner0']).toBeDefined();
      expect(solid.metadata.namedPoints['topCorner0']).toBeDefined();

      kernel.release(solid.handle);
    });

    it('builds square prism with exact volume and key points', () => {
      // Square side s = 30 mm, height h = 50 mm
      // Expected Volume = 30^2 * 50 = 45000 mm^3
      const solid = buildPrism(kernel, { sides: 4, baseSize: 30, height: 50 });
      const vol = kernel.getVolume(solid.handle);
      const bbox = kernel.getBoundingBox(solid.handle, { precise: true });

      expect(vol).toBeCloseTo(45000, 2);
      expect(bbox.zmin).toBeCloseTo(0, 4);
      expect(bbox.zmax).toBeCloseTo(50, 4);
      expect(solid.metadata.baseCorners.length).toBe(4);

      kernel.release(solid.handle);
    });

    it('builds pentagonal prism with exact volume', () => {
      // Pentagon side s = 30 mm, h = 50 mm
      // Base Area = (5 * 30^2) / (4 * tan(36°)) ≈ 1548.42966 mm^2
      // Expected Volume = 1548.42966 * 50 ≈ 77421.48 mm^3
      const solid = buildPrism(kernel, { sides: 5, baseSize: 30, height: 50 });
      const vol = kernel.getVolume(solid.handle);

      expect(vol).toBeCloseTo(77421.48, 0);
      kernel.release(solid.handle);
    });

    it('builds hexagonal prism with exact volume', () => {
      // Hexagon side s = 30 mm, h = 50 mm
      // Base Area = (3*sqrt(3)/2) * 30^2 ≈ 2338.2686 mm^2
      // Expected Volume = 2338.2686 * 50 ≈ 116913.43 mm^3
      const solid = buildPrism(kernel, { sides: 6, baseSize: 30, height: 50 });
      const vol = kernel.getVolume(solid.handle);

      expect(vol).toBeCloseTo(116913.43, 0);
      kernel.release(solid.handle);
    });

    it('builds square pyramid with exact volume and apex', () => {
      // Square base s = 30 mm, height h = 50 mm
      // Expected Volume = (1/3) * 30^2 * 50 = 15000 mm^3
      const solid = buildPyramid(kernel, { sides: 4, baseSize: 30, height: 50 });
      const vol = kernel.getVolume(solid.handle);
      const bbox = kernel.getBoundingBox(solid.handle, { precise: true });

      expect(vol).toBeCloseTo(15000, 1);
      expect(bbox.zmin).toBeCloseTo(0, 4);
      expect(bbox.zmax).toBeCloseTo(50, 4);
      expect(solid.metadata.apex).toBeDefined();
      expect(solid.metadata.namedPoints['apex']).toEqual({ x: 0, y: 0, z: 50 });

      kernel.release(solid.handle);
    });

    it('builds hexagonal pyramid with exact volume', () => {
      // Hexagon base s = 30 mm, height h = 50 mm
      // Expected Volume = (1/3) * 116913.43 ≈ 38971.14 mm^3
      const solid = buildPyramid(kernel, { sides: 6, baseSize: 30, height: 50 });
      const vol = kernel.getVolume(solid.handle);

      expect(vol).toBeCloseTo(38971.14, 0);
      kernel.release(solid.handle);
    });

    it('builds cylinder with exact volume', () => {
      // Radius r = 20 mm, height h = 60 mm
      // Expected Volume = pi * 20^2 * 60 = 24000 * pi ≈ 75398.22 mm^3
      const solid = buildCylinder(kernel, { radius: 20, height: 60 });
      const vol = kernel.getVolume(solid.handle);
      const bbox = kernel.getBoundingBox(solid.handle, { precise: true });

      expect(vol).toBeCloseTo(75398.22, 1);
      expect(bbox.zmin).toBeCloseTo(0, 4);
      expect(bbox.zmax).toBeCloseTo(60, 4);

      kernel.release(solid.handle);
    });

    it('builds cone with exact volume and apex', () => {
      // Radius r = 20 mm, height h = 60 mm
      // Expected Volume = (1/3) * pi * 20^2 * 60 = 8000 * pi ≈ 25132.74 mm^3
      const solid = buildCone(kernel, { radius: 20, height: 60 });
      const vol = kernel.getVolume(solid.handle);
      const bbox = kernel.getBoundingBox(solid.handle, { precise: true });

      expect(vol).toBeCloseTo(25132.74, 1);
      expect(bbox.zmin).toBeCloseTo(0, 4);
      expect(bbox.zmax).toBeCloseTo(60, 4);
      expect(solid.metadata.apex).toEqual({ x: 0, y: 0, z: 60 });

      kernel.release(solid.handle);
    });

    it('builds frustum of cone with exact volume', () => {
      // r1 = 20 mm, r2 = 10 mm, h = 40 mm
      // Expected Volume = (1/3) * pi * h * (r1^2 + r1*r2 + r2^2) = (1/3)*pi*40*(400+200+100) = 28000/3 * pi ≈ 29321.53 mm^3
      const solid = buildFrustumCone(kernel, { bottomRadius: 20, topRadius: 10, height: 40 });
      const vol = kernel.getVolume(solid.handle);
      const bbox = kernel.getBoundingBox(solid.handle, { precise: true });

      expect(vol).toBeCloseTo(29321.53, 1);
      expect(bbox.zmin).toBeCloseTo(0, 4);
      expect(bbox.zmax).toBeCloseTo(40, 4);

      kernel.release(solid.handle);
    });

    it('builds frustum of square pyramid with exact volume', () => {
      // Square base s1 = 20 mm, top s2 = 10 mm, h = 30 mm
      // Expected Volume = (1/3) * h * (A1 + A2 + sqrt(A1*A2)) = (1/3)*30*(400 + 100 + 200) = 10 * 700 = 7000 mm^3
      const solid = buildFrustumPyramid(kernel, {
        sides: 4,
        bottomSize: 20,
        topSize: 10,
        height: 30,
      });
      const vol = kernel.getVolume(solid.handle);
      const bbox = kernel.getBoundingBox(solid.handle, { precise: true });

      expect(vol).toBeCloseTo(7000, 1);
      expect(bbox.zmin).toBeCloseTo(0, 4);
      expect(bbox.zmax).toBeCloseTo(30, 4);

      kernel.release(solid.handle);
    });
  });

  describe('Placement Pipeline & True Angle Invariance', () => {
    it('executes 3-stage placement pipeline and returns inspectable stages', () => {
      const solid = buildCone(kernel, { radius: 20, height: 60 });
      const thetaRad = (30 * Math.PI) / 180; // 30 deg to HP
      const phiRad = (45 * Math.PI) / 180;   // 45 deg to VP

      const placement = placeSolid(kernel, solid, {
        initialAxis: 'PERPENDICULAR_TO_HP',
        baseRotationRad: 0,
        thetaRad,
        phiRad,
        distanceHP: 15,
        distanceVP: 25,
      });

      expect(placement.stages.length).toBe(3);
      expect(placement.stages[0].stage).toBe(1);
      expect(placement.stages[1].stage).toBe(2);
      expect(placement.stages[2].stage).toBe(3);

      // Verify Stage 1: Axis is vertical [0, 0, 1]
      expect(placement.stages[0].transformedAxis.z).toBeCloseTo(1, 4);

      // Verify independent mathematical angle calculation on final axis:
      // True angle with HP (Z = 0): sin(θ) = |axis.z| / ||axis||
      // True angle with VP (Y = 0): sin(φ) = |axis.y| / ||axis||
      const finalAxis = placement.finalPlaced.transformedAxis;
      const axisLen = Math.hypot(finalAxis.x, finalAxis.y, finalAxis.z);
      const computedTheta = Math.asin(Math.abs(finalAxis.z) / axisLen);
      const computedPhi = Math.asin(Math.abs(finalAxis.y) / axisLen);

      expect(computedTheta).toBeCloseTo(thetaRad, 3);
      expect(computedPhi).toBeCloseTo(phiRad, 3);

      // Verify nearest point distances from HP and VP
      const finalBBox = kernel.getBoundingBox(placement.finalPlaced.handle, { precise: true });
      expect(finalBBox.zmin).toBeCloseTo(15, 3); // 15 mm from HP
      expect(finalBBox.ymin).toBeCloseTo(25, 3); // 25 mm from VP
      expect(finalBBox.zmin).toBeGreaterThanOrEqual(14.99); // Nothing below HP

      // Cleanup
      kernel.release(solid.handle);
      placement.stages.forEach((s) => kernel.release(s.handle));
      kernel.release(placement.finalPlaced.handle);
    });

    it('keeps every stage inside the first quadrant at the requested clearances', () => {
      const solid = buildCone(kernel, { radius: 20, height: 60 });
      const placement = placeSolid(kernel, solid, {
        initialAxis: 'PERPENDICULAR_TO_HP',
        thetaRad: (35 * Math.PI) / 180,
        phiRad: (25 * Math.PI) / 180,
        distanceHP: 10,
        distanceVP: 32,
      });

      // Each textbook stage must be a valid, physically placed solid: students
      // see stages 1-3, not only the final position.
      for (const stage of placement.stages) {
        const bbox = kernel.getBoundingBox(stage.handle, { precise: true });
        expect(bbox.zmin).toBeCloseTo(10, 3);
        expect(bbox.ymin).toBeCloseTo(32, 3);
      }

      const stage3Box = kernel.getBoundingBox(placement.stages[2]!.handle, { precise: true });
      const finalBox = kernel.getBoundingBox(placement.finalPlaced.handle, { precise: true });
      expect(finalBox.xmin).toBeCloseTo(stage3Box.xmin, 3);
      expect(finalBox.xmax).toBeCloseTo(stage3Box.xmax, 3);
      expect(finalBox.ymin).toBeCloseTo(stage3Box.ymin, 3);
      expect(finalBox.ymax).toBeCloseTo(stage3Box.ymax, 3);
      expect(finalBox.zmin).toBeCloseTo(stage3Box.zmin, 3);
      expect(finalBox.zmax).toBeCloseTo(stage3Box.zmax, 3);

      kernel.release(solid.handle);
      placement.stages.forEach((s) => kernel.release(s.handle));
      kernel.release(placement.finalPlaced.handle);
    });

    it('rotates the base about its own axis when the axis is perpendicular to VP', () => {
      const solid = buildPrism(kernel, { sides: 4, baseSize: 20, height: 40 });
      const placement = placeSolid(kernel, solid, {
        initialAxis: 'PERPENDICULAR_TO_VP',
        baseRotationRad: Math.PI / 4,
        thetaRad: 0,
        phiRad: 0,
        distanceHP: 5,
        distanceVP: 12,
      });

      const axis = placement.finalPlaced.transformedAxis;
      expect(axis.x).toBeCloseTo(0, 4);
      expect(axis.y).toBeCloseTo(1, 4);
      expect(axis.z).toBeCloseTo(0, 4);

      const bbox = kernel.getBoundingBox(placement.finalPlaced.handle, { precise: true });
      expect(bbox.ymin).toBeCloseTo(12, 3);
      expect(bbox.zmin).toBeCloseTo(5, 3);

      kernel.release(solid.handle);
      placement.stages.forEach((s) => kernel.release(s.handle));
      kernel.release(placement.finalPlaced.handle);
    });

    it('tilts an initially VP-perpendicular axis to the requested angle with HP', () => {
      const solid = buildCylinder(kernel, { radius: 15, height: 50 });
      const thetaRad = Math.PI / 4;
      const placement = placeSolid(kernel, solid, {
        initialAxis: 'PERPENDICULAR_TO_VP',
        thetaRad,
        phiRad: 0,
        distanceHP: 0,
        distanceVP: 20,
      });

      const axis = placement.finalPlaced.transformedAxis;
      expect(Math.asin(Math.abs(axis.z))).toBeCloseTo(thetaRad, 4);
      expect(Math.asin(Math.abs(axis.x))).toBeCloseTo(0, 4);

      kernel.release(solid.handle);
      placement.stages.forEach((s) => kernel.release(s.handle));
      kernel.release(placement.finalPlaced.handle);
    });
  });

  describe('First-Quadrant Validator', () => {
    it('accepts solid entirely in first quadrant', () => {
      // Cone base radius 20, height 60: initial Y is [-20, 20], Z is [0, 60]
      const solid = buildCone(kernel, { radius: 20, height: 60 });
      // Translate by dy = 25, dz = 10 -> Y in [5, 45], Z in [10, 70] (entirely in Q1)
      const moved = kernel.translate(solid.handle, 0, 25, 10);

      const res = validateFirstQuadrant(kernel, moved);
      expect(res.valid).toBe(true);

      kernel.release(solid.handle);
      kernel.release(moved);
    });

    it('rejects solid extending below HP with typed error BELOW_HORIZONTAL_PLANE', () => {
      const solid = buildCone(kernel, { radius: 20, height: 60 });
      // Translate by dy = 25 (in front of VP), dz = -5 (extends below HP)
      const moved = kernel.translate(solid.handle, 0, 25, -5);

      const res = validateFirstQuadrant(kernel, moved);
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.error).toBe('BELOW_HORIZONTAL_PLANE');
        expect(res.minZ).toBeLessThan(0);
      }

      kernel.release(solid.handle);
      kernel.release(moved);
    });

    it('rejects solid extending behind VP with typed error BEHIND_VERTICAL_PLANE', () => {
      const solid = buildCone(kernel, { radius: 20, height: 60 });
      // Translate to Z = 10, Y = -15
      const moved = kernel.translate(solid.handle, 0, -15, 10);

      const res = validateFirstQuadrant(kernel, moved);
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.error).toBe('BEHIND_VERTICAL_PLANE');
        expect(res.minY).toBeLessThan(0);
      }

      kernel.release(solid.handle);
      kernel.release(moved);
    });

    it('rejects solid below HP and behind VP with typed error BELOW_AND_BEHIND', () => {
      const solid = buildCone(kernel, { radius: 20, height: 60 });
      const moved = kernel.translate(solid.handle, 0, -10, -10);

      const res = validateFirstQuadrant(kernel, moved);
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.error).toBe('BELOW_AND_BEHIND');
      }

      kernel.release(solid.handle);
      kernel.release(moved);
    });
  });
});
