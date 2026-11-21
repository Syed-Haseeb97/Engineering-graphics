import { describe, expect, it } from 'vitest';
import { Plane, Point3 } from './types';
import {
  foldOutHP,
  layoutMultiview,
  projectSideView,
  projectToHP,
  projectToPP,
  projectToVP,
} from './projection';

describe('Orthographic Projection Maths', () => {
  describe('Principal Plane Projections', () => {
    it('defines standard reference planes enum', () => {
      expect(Plane.VP).toBe('VP');
      expect(Plane.HP).toBe('HP');
      expect(Plane.PP).toBe('PP');
    });

    it('projectToVP projects 3D point (X, Y, Z) onto VP as (X, Z)', () => {
      const p: Point3 = { x: 15, y: 30, z: 25 };
      const vp = projectToVP(p);
      expect(vp).toEqual({ x: 15, y: 25 });
    });

    it('projectToHP projects 3D point (X, Y, Z) onto HP as (X, Y)', () => {
      const p: Point3 = { x: 15, y: 30, z: 25 };
      const hp = projectToHP(p);
      expect(hp).toEqual({ x: 15, y: 30 });
    });

    it('projectToPP projects 3D point (X, Y, Z) onto PP as (Y, Z)', () => {
      const p: Point3 = { x: 15, y: 30, z: 25 };
      const pp = projectToPP(p);
      expect(pp).toEqual({ x: 30, y: 25 });
    });
  });

  describe('Horizontal Plane Fold-Out (foldOutHP)', () => {
    it('folds HP 90 degrees downwards about XY line placing top view at (X, -Y)', () => {
      // In first-angle projection, HP hinges downwards 90 degrees about reference line XY.
      // A point with distance Y in front of VP sits at (X, -Y) on the flat drawing sheet.
      const hpPt = { x: 40, y: 35 };
      const folded = foldOutHP(hpPt);
      expect(folded).toEqual({ x: 40, y: -35 });
    });

    it('folds points behind VP (Y < 0) upwards above XY line', () => {
      // In 2nd quadrant, point is behind VP (Y < 0).
      // Downward rotation of HP swings the rear portion upwards above XY: y_sheet = -(-|Y|) = +|Y|.
      const hpPt = { x: 20, y: -50 };
      const folded = foldOutHP(hpPt);
      expect(folded).toEqual({ x: 20, y: 50 });
    });
  });

  describe('Side View Mirroring & Placement Rules', () => {
    /**
     * DERIVATION OF FIRST-ANGLE SIDE VIEW PLACEMENT:
     *
     * 1. Left-Hand Side View (LHSV) in First-Angle Projection:
     *    - The observer stands to the left of the object (looking in the +X direction).
     *    - In First-Angle projection, the object lies between the observer and the plane of projection.
     *    - Therefore, the projection plane (Right Profile Plane, RPP) is located to the RIGHT of the object.
     *    - When the profile plane is hinged 90° about reference line X1Y1 to lay flat on the VP:
     *      - The X1Y1 reference line is drawn to the right of the front view at X = X0 (where X0 > max(X_front)).
     *      - From the left viewing direction:
     *        - The Vertical Plane (Y = 0) is at the back (closer to X1Y1).
     *        - Points further in front of VP (+Y) extend towards the viewer, which appears to the right of VP.
     *        - Therefore, distance Y in front of VP extends to the right from X1Y1: X_sheet = X0 + Y.
     *        - Vertical height is preserved from the front view: Y_sheet = Z.
     *      - Resulting LHSV coordinate on sheet: (X0 + Y, Z).
     *
     * 2. Right-Hand Side View (RHSV) in First-Angle Projection:
     *    - The observer stands to the right of the object (looking in the -X direction).
     *    - The projection plane (Left Profile Plane, LPP) is located to the LEFT of the object.
     *    - When hinged 90° about reference line X1Y1 at X = X0' (where X0' < min(X_front)):
     *      - The Vertical Plane (Y = 0) is at X0'.
     *      - Distance in front of VP (+Y) extends to the left from X1Y1: X_sheet = X0' - Y.
     *      - Vertical height is preserved: Y_sheet = Z.
     *      - Resulting RHSV coordinate on sheet: (X0' - Y, Z).
     *
     * 3. Third-Angle Toggle Option:
     *    - In Third-Angle, projection plane is between observer and object.
     *    - LHSV is viewed from left and placed on the LEFT: X_sheet = X0' - Y, Y_sheet = Z.
     *    - RHSV is viewed from right and placed on the RIGHT: X_sheet = X0 + Y, Y_sheet = Z.
     */

    // Test with 5 hand-verified points across different spatial configurations
    const testPoints: Point3[] = [
      { x: 10, y: 20, z: 30 },
      { x: 0, y: 0, z: 0 },
      { x: 45, y: 10, z: 5 },
      { x: 100, y: 60, z: 80 },
      { x: 25, y: 40, z: 15 },
    ];

    it('places LHSV to the right of X1Y1 at (X0 + Y, Z) in First-Angle projection (5 hand-verified points)', () => {
      const X0 = 150; // X1Y1 reference line position
      const expectedLHSV = [
        { x: 150 + 20, y: 30 }, // P1: (170, 30)
        { x: 150 + 0, y: 0 },   // P2: (150, 0)
        { x: 150 + 10, y: 5 },  // P3: (160, 5)
        { x: 150 + 60, y: 80 }, // P4: (210, 80)
        { x: 150 + 40, y: 15 }, // P5: (190, 15)
      ];

      testPoints.forEach((p, idx) => {
        const sidePt = projectSideView(p, {
          x1y1X: X0,
          side: 'LEFT',
          angle: 'FIRST_ANGLE',
        });
        expect(sidePt).toEqual(expectedLHSV[idx]);
      });
    });

    it('places RHSV to the left of X1Y1 at (X0 - Y, Z) in First-Angle projection (5 hand-verified points)', () => {
      const X0_left = -50;
      const expectedRHSV = [
        { x: -50 - 20, y: 30 }, // P1: (-70, 30)
        { x: -50 - 0, y: 0 },   // P2: (-50, 0)
        { x: -50 - 10, y: 5 },  // P3: (-60, 5)
        { x: -50 - 60, y: 80 }, // P4: (-110, 80)
        { x: -50 - 40, y: 15 }, // P5: (-90, 15)
      ];

      testPoints.forEach((p, idx) => {
        const sidePt = projectSideView(p, {
          x1y1X: X0_left,
          side: 'RIGHT',
          angle: 'FIRST_ANGLE',
        });
        expect(sidePt).toEqual(expectedRHSV[idx]);
      });
    });

    it('supports Third-Angle toggled projection (LHSV on left, RHSV on right)', () => {
      const p: Point3 = { x: 50, y: 25, z: 35 };

      // Third angle LHSV placed on left at X0 = 0 -> (0 - 25, 35) = (-25, 35)
      const thirdLHSV = projectSideView(p, {
        x1y1X: 0,
        side: 'LEFT',
        angle: 'THIRD_ANGLE',
      });
      expect(thirdLHSV).toEqual({ x: -25, y: 35 });

      // Third angle RHSV placed on right at X0 = 100 -> (100 + 25, 35) = (125, 35)
      const thirdRHSV = projectSideView(p, {
        x1y1X: 100,
        side: 'RIGHT',
        angle: 'THIRD_ANGLE',
      });
      expect(thirdRHSV).toEqual({ x: 125, y: 35 });
    });
  });

  describe('Full Multiview Sheet Layout (layoutMultiview)', () => {
    it('arranges front, top, and side views with XY line at y=0 and configurable gaps', () => {
      const points: Point3[] = [
        { x: 10, y: 20, z: 30 },
        { x: 40, y: 50, z: 60 },
      ];

      const layout = layoutMultiview(points, {
        angle: 'FIRST_ANGLE',
        sideView: 'LEFT',
        gapX: 25, // 25 mm gap between front view max X and X1Y1
        gapY: 0,
      });

      // Reference line XY is always y = 0
      expect(layout.xyLineY).toBe(0);

      // Front view max X is 40. Therefore X1Y1 line is at 40 + 25 = 65 mm.
      expect(layout.x1y1LineX).toBe(65);

      // Front view: (X, Z)
      expect(layout.frontView).toEqual([
        { x: 10, y: 30 },
        { x: 40, y: 60 },
      ]);

      // Top view in first-angle sits below XY line: (X, -Y)
      expect(layout.topView).toEqual([
        { x: 10, y: -20 },
        { x: 40, y: -50 },
      ]);

      // LHSV in first-angle sits to the right of X1Y1: (X1Y1 + Y, Z) = (65 + Y, Z)
      expect(layout.sideView).toEqual([
        { x: 65 + 20, y: 30 },
        { x: 65 + 50, y: 60 },
      ]);
    });
  });

  describe('Textbook Sanity Tests (Hand-Verified Worked Examples)', () => {
    /**
     * TEXTBOOK EXAMPLE 1:
     * Problem: A point P is 20 mm above HP and 30 mm in front of VP.
     * Hand Working:
     * - Elevation above HP: Z = +20 mm
     * - Distance in front of VP: Y = +30 mm
     * - Arbitrary horizontal position: X = 15 mm
     * - Front View (elevation on VP, p'):
     *     x_sheet = X = 15 mm
     *     y_sheet = Z = +20 mm (20 mm ABOVE XY line)
     * - Top View (plan on HP, p):
     *     x_sheet = X = 15 mm
     *     y_sheet = -Y = -30 mm (30 mm BELOW XY line after fold-out)
     * - Left-Hand Side View on right profile plane (at X1Y1 = 50 mm):
     *     x_sheet = X1Y1 + Y = 50 + 30 = 80 mm
     *     y_sheet = Z = +20 mm
     */
    it('Textbook Case 1: Point 20 mm above HP and 30 mm in front of VP', () => {
      const P: Point3 = { x: 15, y: 30, z: 20 };

      const fv = projectToVP(P);
      expect(fv).toEqual({ x: 15, y: 20 });
      expect(fv.y).toBe(20); // 20 mm above XY line

      const tv = foldOutHP(projectToHP(P));
      expect(tv).toEqual({ x: 15, y: -30 });
      expect(tv.y).toBe(-30); // 30 mm below XY line

      const sv = projectSideView(P, { x1y1X: 50, side: 'LEFT', angle: 'FIRST_ANGLE' });
      expect(sv).toEqual({ x: 80, y: 20 });
    });

    /**
     * TEXTBOOK EXAMPLE 2: 4 Quadrants Sign Table
     *
     * Reference geometry:
     * - 1st Quad: Above HP (Z > 0), In front of VP (Y > 0) -> FV above XY (+Z), TV below XY (-Y)
     * - 2nd Quad: Above HP (Z > 0), Behind VP (Y < 0)       -> FV above XY (+Z), TV above XY (-(-|Y|) = +|Y|)
     * - 3rd Quad: Below HP (Z < 0), Behind VP (Y < 0)       -> FV below XY (-|Z|), TV above XY (+|Y|)
     * - 4th Quad: Below HP (Z < 0), In front of VP (Y > 0)  -> FV below XY (-|Z|), TV below XY (-Y)
     */
    it('Textbook Case 2: Points across all 4 Quadrants adhere to the quadrant sign table', () => {
      const q1: Point3 = { x: 10, y: 30, z: 20 };
      const q2: Point3 = { x: 10, y: -30, z: 20 };
      const q3: Point3 = { x: 10, y: -30, z: -20 };
      const q4: Point3 = { x: 10, y: 30, z: -20 };

      // 1st Quadrant: FV > 0 (above XY), TV < 0 (below XY)
      expect(projectToVP(q1).y).toBe(20);
      expect(foldOutHP(projectToHP(q1)).y).toBe(-30);

      // 2nd Quadrant: FV > 0 (above XY), TV > 0 (above XY - both overlap above XY)
      expect(projectToVP(q2).y).toBe(20);
      expect(foldOutHP(projectToHP(q2)).y).toBe(30);

      // 3rd Quadrant: FV < 0 (below XY), TV > 0 (above XY)
      expect(projectToVP(q3).y).toBe(-20);
      expect(foldOutHP(projectToHP(q3)).y).toBe(30);

      // 4th Quadrant: FV < 0 (below XY), TV < 0 (below XY - both overlap below XY)
      expect(projectToVP(q4).y).toBe(-20);
      expect(foldOutHP(projectToHP(q4)).y).toBe(-30);
    });

    /**
     * TEXTBOOK EXAMPLE 3:
     * Problem: A straight line AB of true length L = 50 mm is inclined at:
     *   - θ = 30° to HP
     *   - φ = 45° to VP
     * End A is in HP (Z_A = 0) and 15 mm in front of VP (Y_A = 15 mm).
     *
     * 3D Trigonometric Solution (Hand Calculation):
     * Let A = (0, 15, 0).
     * ΔZ = L * sin(θ) = 50 * sin(30°) = 50 * 0.5 = 25.000 mm  => Z_B = 25.000 mm
     * ΔY = L * sin(φ) = 50 * sin(45°) = 50 * (√2 / 2) = 35.355339 mm => Y_B = 15 + 35.355339 = 50.355339 mm
     *
     * In 3D space: L^2 = ΔX^2 + ΔY^2 + ΔZ^2
     * ΔX^2 = 50^2 - (50 * sin(45°))^2 - (50 * sin(30°))^2
     * ΔX^2 = 2500 - 1250 - 625 = 625
     * ΔX = √625 = 25.000 mm (exact integer!) => X_B = 25.000 mm
     *
     * Point A = (0, 15, 0)
     * Point B = (25, 50.355339, 25)
     *
     * Projections:
     * 1. Front View (Elevation on VP):
     *    a' = (0, 0) (on reference line XY)
     *    b' = (25, 25)
     *    Apparent length in front view = √(25^2 + 25^2) = √1250 ≈ 35.355339 mm
     *    Apparent elevation angle α: tan(α) = 25/25 = 1 => α = 45°
     *
     * 2. Top View (Plan on HP after fold-out):
     *    a = (0, -15) (15 mm below XY)
     *    b = (25, -50.355339) (50.355 mm below XY)
     *    Apparent length in plan = √(25^2 + 35.355339^2) = √(625 + 1250) = √1875 ≈ 43.30127 mm
     *    Theoretical plan length = L * cos(θ) = 50 * cos(30°) = 50 * (√3 / 2) ≈ 43.30127 mm (Exact match!)
     */
    it('Textbook Case 3: Line 50 mm long, inclined 30 deg to HP and 45 deg to VP', () => {
      const L = 50;
      const thetaRad = (30 * Math.PI) / 180;
      const phiRad = (45 * Math.PI) / 180;

      const deltaZ = L * Math.sin(thetaRad); // 25 mm
      const deltaY = L * Math.sin(phiRad);   // 35.355339 mm
      const deltaX = Math.sqrt(L * L - deltaY * deltaY - deltaZ * deltaZ); // 25 mm

      expect(deltaZ).toBeCloseTo(25, 6);
      expect(deltaX).toBeCloseTo(25, 6);

      const A: Point3 = { x: 0, y: 15, z: 0 };
      const B: Point3 = { x: 25, y: 15 + deltaY, z: deltaZ };

      // 1. Front view assertions
      const fvA = projectToVP(A);
      const fvB = projectToVP(B);
      expect(fvA).toEqual({ x: 0, y: 0 }); // End A is on HP (on reference line XY)
      expect(fvB.x).toBeCloseTo(25, 6);
      expect(fvB.y).toBeCloseTo(25, 6);

      const fvApparentLength = Math.hypot(fvB.x - fvA.x, fvB.y - fvA.y);
      expect(fvApparentLength).toBeCloseTo(35.355339, 4);

      // 2. Top view assertions (after fold-out below XY)
      const tvA = foldOutHP(projectToHP(A));
      const tvB = foldOutHP(projectToHP(B));
      expect(tvA).toEqual({ x: 0, y: -15 });
      expect(tvB.x).toBeCloseTo(25, 6);
      expect(tvB.y).toBeCloseTo(-50.355339, 4);

      // Top view apparent length must equal L * cos(30°)
      const tvApparentLength = Math.hypot(tvB.x - tvA.x, tvB.y - tvA.y);
      const expectedPlanLength = L * Math.cos(thetaRad);
      expect(tvApparentLength).toBeCloseTo(expectedPlanLength, 6);
      expect(tvApparentLength).toBeCloseTo(43.30127, 4);
    });
  });

  describe('Property Tests (1000 Pseudo-Random Invariant Cases)', () => {
    // Seeded linear congruential generator (LCG) for deterministic, fast pseudo-random testing
    let seed = 42;
    function randRange(min: number, max: number): number {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return min + (seed / 4294967296) * (max - min);
    }

    it('(a) Front and top views share the exact same X coordinate for every point (1000 cases)', () => {
      for (let i = 0; i < 1000; i++) {
        const p: Point3 = {
          x: randRange(-500, 500),
          y: randRange(1, 500),
          z: randRange(1, 500),
        };
        const fv = projectToVP(p);
        const tv = foldOutHP(projectToHP(p));
        expect(fv.x).toBe(tv.x);
      }
    });

    it('(b) Front and side views share the exact same Z coordinate for every point (1000 cases)', () => {
      const X0 = 200;
      for (let i = 0; i < 1000; i++) {
        const p: Point3 = {
          x: randRange(-500, 500),
          y: randRange(1, 500),
          z: randRange(-500, 500),
        };
        const fv = projectToVP(p);
        const sv = projectSideView(p, { x1y1X: X0, side: 'LEFT', angle: 'FIRST_ANGLE' });
        expect(fv.y).toBe(sv.y);
      }
    });

    it('(c) Rigid translation moves views by the exact expected mathematical amounts (1000 cases)', () => {
      const X0 = 300;
      for (let i = 0; i < 1000; i++) {
        const p: Point3 = {
          x: randRange(-200, 200),
          y: randRange(10, 200),
          z: randRange(10, 200),
        };
        const dx = randRange(-50, 50);
        const dy = randRange(-50, 50);
        const dz = randRange(-50, 50);

        const pTranslated: Point3 = {
          x: p.x + dx,
          y: p.y + dy,
          z: p.z + dz,
        };

        // Front view shifts by (dx, dz)
        const fv1 = projectToVP(p);
        const fv2 = projectToVP(pTranslated);
        expect(fv2.x - fv1.x).toBeCloseTo(dx, 6);
        expect(fv2.y - fv1.y).toBeCloseTo(dz, 6);

        // Top view shifts by (dx, -dy) after fold-out
        const tv1 = foldOutHP(projectToHP(p));
        const tv2 = foldOutHP(projectToHP(pTranslated));
        expect(tv2.x - tv1.x).toBeCloseTo(dx, 6);
        expect(tv2.y - tv1.y).toBeCloseTo(-dy, 6);

        // Side view (LHSV, First-Angle) shifts by (dy, dz) relative to fixed X1Y1
        const sv1 = projectSideView(p, { x1y1X: X0, side: 'LEFT', angle: 'FIRST_ANGLE' });
        const sv2 = projectSideView(pTranslated, { x1y1X: X0, side: 'LEFT', angle: 'FIRST_ANGLE' });
        expect(sv2.x - sv1.x).toBeCloseTo(dy, 6);
        expect(sv2.y - sv1.y).toBeCloseTo(dz, 6);
      }
    });
  });
});
