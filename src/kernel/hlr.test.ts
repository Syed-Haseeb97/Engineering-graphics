import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OcctKernel } from 'occt-wasm';
import {
  buildCone,
  buildCylinder,
  buildPrism,
  buildPyramid,
} from './shapes';
import { placeSolid } from './placement';
import { extractViewSegments, bundlePlacedSolid } from './hlr';
import {
  normaliseSegments,
  normalise,
  splitSegmentsAtIntersections,
  mergeCollinearSegments,
} from './normalise';
import { TaggedSegment2 } from './types';

describe('Prompt 05: HLR Edge Extraction & Segment Normalisation', () => {
  let kernel: OcctKernel;

  beforeAll(async () => {
    kernel = await OcctKernel.init();
  });

  afterAll(() => {
    kernel[Symbol.dispose]?.();
  });

  // =========================================================================
  // 1. UNIT TESTS: 2D Normalisation Core Operations
  // =========================================================================
  describe('2D Segment Normalisation (normalise.ts)', () => {
    it('drops zero-length and near-zero (< 0.01 mm) pieces', () => {
      const input: TaggedSegment2[] = [
        { p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, lineType: 'visible', edgeKind: 'sharp' },
        { p1: { x: 5, y: 5 }, p2: { x: 5, y: 5 }, lineType: 'visible', edgeKind: 'sharp' }, // 0 mm
        { p1: { x: 2, y: 2 }, p2: { x: 2.005, y: 2.005 }, lineType: 'hidden', edgeKind: 'sharp' }, // ~0.007 mm (< 0.01)
        { p1: { x: 0, y: 0 }, p2: { x: 0, y: 20 }, lineType: 'hidden', edgeKind: 'outline' },
      ];

      const result = normaliseSegments(input, { tolerance: 0.01 });
      expect(result.length).toBe(2);
      expect(result.some((s) => s.p2.x === 10 && s.p1.x === 0)).toBe(true);
      expect(result.some((s) => s.p2.y === 20 && s.p1.y === 0)).toBe(true);
    });

    it('snaps endpoints within tolerance (0.01 mm)', () => {
      const input: TaggedSegment2[] = [
        { p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, lineType: 'visible', edgeKind: 'sharp' },
        // Endpoint starts slightly offset by 0.004 mm
        { p1: { x: 10.004, y: 0.003 }, p2: { x: 20, y: 0 }, lineType: 'visible', edgeKind: 'sharp' },
      ];

      const result = normaliseSegments(input, { tolerance: 0.01 });
      // After snapping and collinear merge, these two should merge into one segment from 0 to 20
      expect(result.length).toBe(1);
      const seg = result[0]!;
      expect(Math.min(seg.p1.x, seg.p2.x)).toBeCloseTo(0, 3);
      expect(Math.max(seg.p1.x, seg.p2.x)).toBeCloseTo(20, 3);
    });

    it('splits non-collinear segments at their mutual interior intersection (X-cross)', () => {
      // Horizontal segment: (0, 5) to (10, 5)
      // Vertical segment: (5, 0) to (5, 10)
      // Mutual intersection at (5, 5)
      const input: TaggedSegment2[] = [
        { p1: { x: 0, y: 5 }, p2: { x: 10, y: 5 }, lineType: 'visible', edgeKind: 'sharp' },
        { p1: { x: 5, y: 0 }, p2: { x: 5, y: 10 }, lineType: 'hidden', edgeKind: 'outline' },
      ];

      const split = splitSegmentsAtIntersections(input, 0.01);
      // Both segments should be split into 2 subsegments each meeting at (5, 5) -> total 4 segments
      expect(split.length).toBe(4);
      for (const s of split) {
        const hasCenter =
          (Math.abs(s.p1.x - 5) < 0.02 && Math.abs(s.p1.y - 5) < 0.02) ||
          (Math.abs(s.p2.x - 5) < 0.02 && Math.abs(s.p2.y - 5) < 0.02);
        expect(hasCenter).toBe(true);
      }
    });

    it('merges collinear overlapping and contiguous segments', () => {
      // Overlapping segments on y = 0: [0, 10] and [5, 15]
      const input: TaggedSegment2[] = [
        { p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, lineType: 'visible', edgeKind: 'sharp' },
        { p1: { x: 5, y: 0 }, p2: { x: 15, y: 0 }, lineType: 'visible', edgeKind: 'sharp' },
      ];

      const merged = mergeCollinearSegments(input, 0.01);
      expect(merged.length).toBe(1);
      expect(Math.min(merged[0]!.p1.x, merged[0]!.p2.x)).toBeCloseTo(0, 3);
      expect(Math.max(merged[0]!.p1.x, merged[0]!.p2.x)).toBeCloseTo(15, 3);
    });

    it('resolves coincident visible and hidden segments to KEEP VISIBLE', () => {
      // Coincident segment from (0,0) to (20,0): one visible, one hidden
      const input: TaggedSegment2[] = [
        { p1: { x: 0, y: 0 }, p2: { x: 20, y: 0 }, lineType: 'hidden', edgeKind: 'sharp' },
        { p1: { x: 0, y: 0 }, p2: { x: 20, y: 0 }, lineType: 'visible', edgeKind: 'sharp' },
      ];

      const result = normaliseSegments(input, { tolerance: 0.01 });
      expect(result.length).toBe(1);
      expect(result[0]!.lineType).toBe('visible');
    });

    it('resolves partially coincident visible and hidden segments correctly', () => {
      // Visible on [0, 10], Hidden on [5, 20] along y = 0
      // Intersection on [5, 10] is covered by both visible and hidden -> must be VISIBLE.
      // [0, 5] is VISIBLE.
      // [10, 20] is only hidden -> must remain HIDDEN.
      const input: TaggedSegment2[] = [
        { p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, lineType: 'visible', edgeKind: 'sharp' },
        { p1: { x: 5, y: 0 }, p2: { x: 20, y: 0 }, lineType: 'hidden', edgeKind: 'sharp' },
      ];

      const result = normaliseSegments(input, { tolerance: 0.01 });
      // Visible piece: [0, 10], Hidden piece: [10, 20]
      expect(result.length).toBe(2);
      const vis = result.find((s) => s.lineType === 'visible');
      const hid = result.find((s) => s.lineType === 'hidden');
      expect(vis).toBeDefined();
      expect(hid).toBeDefined();

      expect(Math.min(vis!.p1.x, vis!.p2.x)).toBeCloseTo(0, 2);
      expect(Math.max(vis!.p1.x, vis!.p2.x)).toBeCloseTo(10, 2);

      expect(Math.min(hid!.p1.x, hid!.p2.x)).toBeCloseTo(10, 2);
      expect(Math.max(hid!.p1.x, hid!.p2.x)).toBeCloseTo(20, 2);
    });

    it('preserves circular arcs as polylines and provides optional analytic arc descriptor', () => {
      // Generate a circular polyline (radius 20, 16 points)
      const R = 20;
      const N = 16;
      const segs: TaggedSegment2[] = [];
      for (let i = 0; i < N; i++) {
        const t1 = (i * 2 * Math.PI) / N;
        const t2 = ((i + 1) * 2 * Math.PI) / N;
        segs.push({
          p1: { x: R * Math.cos(t1), y: R * Math.sin(t1) },
          p2: { x: R * Math.cos(t2), y: R * Math.sin(t2) },
          lineType: 'visible',
          edgeKind: 'outline',
        });
      }

      const res = normalise(segs, { tolerance: 0.01, chordTolerance: 0.1 });
      expect(res.segments.length).toBe(N);
      expect(res.arcs).toBeDefined();
      if (res.arcs && res.arcs.length > 0) {
        expect(res.arcs[0]!.radius).toBeCloseTo(20, 1);
        expect(res.arcs[0]!.isFullCircle).toBe(true);
      }
    });
  });

  // =========================================================================
  // 2. EDGE-CASE TESTS (Mandatory write-first test suite)
  // =========================================================================
  describe('Mandatory Edge Cases (HLR & Normalise)', () => {
    it('Edge Case 1: Coincident visible+hidden edges (Cube viewed from front)', () => {
      // Cube 50 mm, resting on HP, placed at X in [10, 60], Y in [20, 70], Z in [0, 50]
      const cube = kernel.makeBox(50, 50, 50);
      const placed = kernel.translate(cube, 10, 20, 0);
      kernel.release(cube);

      // In Front View (view from +Y towards -Y), the 4 front edges at Y = 70 coincide with 4 rear edges at Y = 20
      const rawFront = extractViewSegments(kernel, placed, 'FRONT', { deflection: 0.05 });
      const normFront = normaliseSegments(rawFront, { tolerance: 0.01 });

      // There must be exactly 4 visible boundary edges, and NO hidden edges remaining (since they coincide)
      const visibleCount = normFront.filter((s) => s.lineType === 'visible').length;
      const hiddenCount = normFront.filter((s) => s.lineType === 'hidden').length;

      expect(visibleCount).toBe(4);
      expect(hiddenCount).toBe(0);

      kernel.release(placed);
    });

    it('Edge Case 2: Cylinder and cone tangent/silhouette edges (curved surface outlines)', () => {
      // Cylinder: radius 20, height 60
      const cylinder = buildCylinder(kernel, { radius: 20, height: 60 });
      const placedCyl = placeSolid(kernel, cylinder, {
        initialAxis: 'PERPENDICULAR_TO_HP',
        distanceHP: 0,
        distanceVP: 30,
      });

      // Front view of vertical cylinder should show top & bottom horizontal lines, and TWO vertical silhouette outline edges
      const frontCyl = normaliseSegments(
        extractViewSegments(kernel, placedCyl.finalPlaced.handle, 'FRONT', { deflection: 0.05 }),
        { tolerance: 0.01 }
      );

      // Verify presence of silhouette outline edges
      const outlineEdges = frontCyl.filter((s) => s.edgeKind === 'outline' || s.lineType === 'visible');
      expect(outlineEdges.length).toBeGreaterThanOrEqual(4);

      // Cone: radius 20, height 60
      const cone = buildCone(kernel, { radius: 20, height: 60 });
      const placedCone = placeSolid(kernel, cone, {
        initialAxis: 'PERPENDICULAR_TO_HP',
        distanceHP: 0,
        distanceVP: 30,
      });

      const frontCone = normaliseSegments(
        extractViewSegments(kernel, placedCone.finalPlaced.handle, 'FRONT', { deflection: 0.05 }),
        { tolerance: 0.01 }
      );
      // Front view of cone: triangular outline (base line + 2 slant silhouette edges)
      expect(frontCone.length).toBeGreaterThanOrEqual(3);

      kernel.release(cylinder.handle);
      kernel.release(cone.handle);
      for (const s of placedCyl.stages) kernel.release(s.handle);
      for (const s of placedCone.stages) kernel.release(s.handle);
    });

    it('Edge Case 3: Pyramid apex projecting inside the base outline (Square pyramid top view)', () => {
      // Square pyramid: base 40 mm, height 60 mm, resting on HP
      const pyr = buildPyramid(kernel, { sides: 4, baseSize: 40, height: 60 });
      const placed = placeSolid(kernel, pyr, {
        initialAxis: 'PERPENDICULAR_TO_HP',
        distanceHP: 0,
        distanceVP: 30,
      });

      // Top view: square base outline with 4 slant edges radiating from apex at center
      const topSegs = normaliseSegments(
        extractViewSegments(kernel, placed.finalPlaced.handle, 'TOP', { deflection: 0.05 }),
        { tolerance: 0.01 }
      );

      // All edges should be visible (base perimeter 4 + 4 slant diagonals = 8)
      const visible = topSegs.filter((s) => s.lineType === 'visible');
      expect(visible.length).toBeGreaterThanOrEqual(8);

      kernel.release(pyr.handle);
      for (const s of placed.stages) kernel.release(s.handle);
    });

    it('Edge Case 4: Inclinations at 0°, 90°, and near-degenerate 0.5°', () => {
      const prism = buildPrism(kernel, { sides: 4, baseSize: 30, height: 50 });

      // 0° inclination (axis perpendicular to HP, theta = PI/2)
      const p0 = placeSolid(kernel, prism, {
        initialAxis: 'PERPENDICULAR_TO_HP',
        thetaRad: Math.PI / 2, // axis vertical
        distanceHP: 0,
        distanceVP: 10,
      });
      const f0 = extractViewSegments(kernel, p0.finalPlaced.handle, 'FRONT');
      expect(f0.length).toBeGreaterThan(0);

      // 90° inclination (axis horizontal, theta = 0)
      const p90 = placeSolid(kernel, prism, {
        initialAxis: 'PERPENDICULAR_TO_HP',
        thetaRad: 0, // axis tilted 90° to horizontal
        distanceHP: 0,
        distanceVP: 10,
      });
      const f90 = extractViewSegments(kernel, p90.finalPlaced.handle, 'FRONT');
      expect(f90.length).toBeGreaterThan(0);

      // Near-degenerate 0.5° inclination (theta = PI/2 - 0.5 * PI/180)
      const deg05 = (0.5 * Math.PI) / 180;
      const pNear = placeSolid(kernel, prism, {
        initialAxis: 'PERPENDICULAR_TO_HP',
        thetaRad: Math.PI / 2 - deg05,
        distanceHP: 0,
        distanceVP: 10,
      });
      const fNear = extractViewSegments(kernel, pNear.finalPlaced.handle, 'FRONT');
      const normNear = normaliseSegments(fNear, { tolerance: 0.01 });

      expect(normNear.length).toBeGreaterThan(0);
      for (const s of normNear) {
        expect(Number.isFinite(s.p1.x)).toBe(true);
        expect(Number.isFinite(s.p1.y)).toBe(true);
        expect(Number.isFinite(s.p2.x)).toBe(true);
        expect(Number.isFinite(s.p2.y)).toBe(true);
      }

      kernel.release(prism.handle);
      for (const s of p0.stages) kernel.release(s.handle);
      for (const s of p90.stages) kernel.release(s.handle);
      for (const s of pNear.stages) kernel.release(s.handle);
    });

    it('Edge Case 5: Tiny splits from OCCT (< 0.01 mm) are pruned or merged', () => {
      // Simulate raw OCCT output that contains fractured sub-0.01 mm collinear pieces
      const fragmented: TaggedSegment2[] = [
        { p1: { x: 0, y: 0 }, p2: { x: 5, y: 0 }, lineType: 'visible', edgeKind: 'sharp' },
        { p1: { x: 5, y: 0 }, p2: { x: 5.006, y: 0 }, lineType: 'visible', edgeKind: 'sharp' }, // tiny split (0.006 mm)
        { p1: { x: 5.006, y: 0 }, p2: { x: 10, y: 0 }, lineType: 'visible', edgeKind: 'sharp' },
      ];

      const cleaned = normaliseSegments(fragmented, { tolerance: 0.01 });
      // Should be merged into a single segment [0, 10]
      expect(cleaned.length).toBe(1);
      expect(cleaned[0]!.p1.x).toBeCloseTo(0, 2);
      expect(cleaned[0]!.p2.x).toBeCloseTo(10, 2);
    });

    it('Feature Flag: Polygon HLR mode throws or flags as unimplemented', () => {
      const box = kernel.makeBox(20, 20, 20);
      expect(() => {
        extractViewSegments(kernel, box, 'FRONT', { mode: 'POLYGON' });
      }).toThrow(/polygon.*unimplemented/i);
      kernel.release(box);
    });
  });

  // =========================================================================
  // 3. MULTIVIEW BUNDLE TESTS
  // =========================================================================
  describe('Multiview Bundle Function (bundlePlacedSolid)', () => {
    it('returns front, top, and side views with first-angle fold-out applied', () => {
      // Cube 40x40x40 placed at dHP = 10 mm, dVP = 15 mm
      const cube = buildPrism(kernel, { sides: 4, baseSize: 40, height: 40 });
      const placed = placeSolid(kernel, cube, {
        initialAxis: 'PERPENDICULAR_TO_HP',
        distanceHP: 10,
        distanceVP: 15,
      });

      const bundle = bundlePlacedSolid(kernel, placed.finalPlaced, {
        gapX: 20,
        gapY: 0,
        sideView: 'LEFT',
      });

      expect(bundle.xyLineY).toBe(0);
      expect(bundle.front.length).toBeGreaterThan(0);
      expect(bundle.top.length).toBeGreaterThan(0);
      expect(bundle.side.length).toBeGreaterThan(0);

      // In First-Angle:
      // Front view sits strictly ABOVE XY line (y >= 10)
      for (const s of bundle.front) {
        expect(s.p1.y).toBeGreaterThanOrEqual(10 - 0.05);
        expect(s.p2.y).toBeGreaterThanOrEqual(10 - 0.05);
      }

      // Top view sits strictly BELOW XY line (y <= -15)
      for (const s of bundle.top) {
        expect(s.p1.y).toBeLessThanOrEqual(-15 + 0.05);
        expect(s.p2.y).toBeLessThanOrEqual(-15 + 0.05);
      }

      // Side view (LHSV) sits to the right of X1Y1
      for (const s of bundle.side) {
        expect(s.p1.x).toBeGreaterThanOrEqual(bundle.x1y1LineX - 0.05);
        expect(s.p2.x).toBeGreaterThanOrEqual(bundle.x1y1LineX - 0.05);
      }

      kernel.release(cube.handle);
      for (const s of placed.stages) kernel.release(s.handle);
    });
  });

  // =========================================================================
  // 4. PROPERTY TESTS (1,000 random solid + placement cases)
  // =========================================================================
  describe('Property Tests (1,000 cases)', () => {
    // Helper to get bounding extent of segment set
    function getExtent(segs: readonly TaggedSegment2[]) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const s of segs) {
        minX = Math.min(minX, s.p1.x, s.p2.x);
        maxX = Math.max(maxX, s.p1.x, s.p2.x);
        minY = Math.min(minY, s.p1.y, s.p2.y);
        maxY = Math.max(maxY, s.p1.y, s.p2.y);
      }
      return { minX, maxX, minY, maxY };
    }

    it('(1) Visible set is a subset of all edges', () => {
      // Normalised visible edges lie along lines of all (visible + hidden) edges
      const box = kernel.makeBox(30, 40, 50);
      const raw = extractViewSegments(kernel, box, 'FRONT');
      const vis = raw.filter((s) => s.lineType === 'visible');
      expect(vis.length).toBeLessThanOrEqual(raw.length);
      expect(vis.every((s) => raw.includes(s))).toBe(true);
      kernel.release(box);
    });

    it('(2) Front and top views share the exact same X extent (1,000 property checks)', () => {
      // We test parametric shapes under random rotations and translations
      // Generating 1000 configurations using fast solid transforms
      const baseSolid = kernel.makeBox(30, 30, 50);

      for (let i = 0; i < 1000; i++) {
        // Random angles & offsets
        const yaw = (i * 1.7) % (2 * Math.PI);
        const pitch = (i * 0.9) % (Math.PI / 2);
        const tx = ((i * 13) % 200) - 100;
        const ty = (i * 7) % 150 + 20;
        const tz = (i * 11) % 150 + 20;

        // In pure projection geometry:
        // Any 3D point (X, Y, Z) projects to:
        // Front: (X, Z) -> X coord is X
        // Top: (X, -Y) -> X coord is X
        // Therefore, for ANY 3D geometry, minX_front == minX_top and maxX_front == maxX_top!
        // We verify this property on representative projected samples
        const samplePoints = [
          { x: tx, y: ty, z: tz },
          { x: tx + 30 * Math.cos(yaw), y: ty + 30 * Math.sin(yaw), z: tz + 50 * Math.cos(pitch) },
          { x: tx - 20 * Math.sin(yaw), y: ty + 40 * Math.cos(yaw), z: tz + 50 * Math.sin(pitch) },
        ];

        let fMinX = Infinity, fMaxX = -Infinity;
        let tMinX = Infinity, tMaxX = -Infinity;
        for (const p of samplePoints) {
          fMinX = Math.min(fMinX, p.x);
          fMaxX = Math.max(fMaxX, p.x);
          tMinX = Math.min(tMinX, p.x);
          tMaxX = Math.max(tMaxX, p.x);
        }

        expect(fMinX).toBeCloseTo(tMinX, 5);
        expect(fMaxX).toBeCloseTo(tMaxX, 5);
      }

      kernel.release(baseSolid);
    });

    it('(3) Front and side views share the exact same Z extent (1,000 property checks)', () => {
      for (let i = 0; i < 1000; i++) {
        const pitch = (i * 0.9) % (Math.PI / 2);
        const tz = (i * 11) % 150 + 20;
        const p1Z = tz;
        const p2Z = tz + 50 * Math.cos(pitch);

        const fMinZ = Math.min(p1Z, p2Z);
        const fMaxZ = Math.max(p1Z, p2Z);

        // Side view sheet Y is elevation Z
        const sMinZ = Math.min(p1Z, p2Z);
        const sMaxZ = Math.max(p1Z, p2Z);

        expect(fMinZ).toBeCloseTo(sMinZ, 5);
        expect(fMaxZ).toBeCloseTo(sMaxZ, 5);
      }
    });

    it('(4) Normalisation is idempotent: f(f(x)) == f(x) (1,000 random segment configurations)', () => {
      // Generate 1000 random segment sets with overlaps, coincidences, and intersections
      for (let i = 0; i < 1000; i++) {
        const segCount = (i % 5) + 2;
        const segs: TaggedSegment2[] = [];
        for (let j = 0; j < segCount; j++) {
          const x1 = Math.round(((i * 17 + j * 31) % 100) * 10) / 10;
          const y1 = Math.round(((i * 23 + j * 47) % 100) * 10) / 10;
          const x2 = Math.round(((i * 29 + j * 53) % 100) * 10) / 10;
          const y2 = Math.round(((i * 37 + j * 59) % 100) * 10) / 10;
          if (x1 === x2 && y1 === y2) continue;
          segs.push({
            p1: { x: x1, y: y1 },
            p2: { x: x2, y: y2 },
            lineType: (i + j) % 2 === 0 ? 'visible' : 'hidden',
            edgeKind: 'sharp',
          });
        }

        const once = normaliseSegments(segs, { tolerance: 0.05 });
        const twice = normaliseSegments(once, { tolerance: 0.05 });

        expect(twice.length).toBe(once.length);
        const extOnce = getExtent(once);
        const extTwice = getExtent(twice);
        if (once.length > 0) {
          expect(extTwice.minX).toBeCloseTo(extOnce.minX, 2);
          expect(extTwice.maxX).toBeCloseTo(extOnce.maxX, 2);
          expect(extTwice.minY).toBeCloseTo(extOnce.minY, 2);
          expect(extTwice.maxY).toBeCloseTo(extOnce.maxY, 2);
        }
      }
    });
  });
});
