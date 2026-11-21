import { describe, expect, it } from 'vitest';
import {
  findSnapPoint,
  snapToEndpoint,
  snapToMidpoint,
  snapToCenter,
  snapToIntersection,
  snapToPerpendicular,
  snapToNearest,
  snapToGrid,
  SNAP_PRIORITIES,
} from './snap';
import { LineCommand } from './command';
import { shouldIgnoreDraftHotkey } from './events';
import { DraftEntity, LineEntity, ViewportTransform } from './types';

describe('2D Drafting Core (src/draft)', () => {
  // Standard test viewport: 1 mm = 2 px, origin (0, 0) at center of screen (400, 300)
  const viewport: ViewportTransform = {
    scale: 2, // 2 px/mm
    panX: 400,
    panY: 300,
  };

  // =========================================================================
  // 1. SNAP ENGINE TESTS
  // =========================================================================
  describe('Snap Engine Pure Functions', () => {
    const line1: LineEntity = {
      id: 'L1',
      type: 'line',
      p1: { x: 0, y: 0 },
      p2: { x: 50, y: 0 },
      lineType: 'continuous',
    };

    const line2: LineEntity = {
      id: 'L2',
      type: 'line',
      p1: { x: 25, y: -20 },
      p2: { x: 25, y: 20 },
      lineType: 'continuous',
    };

    const entities: DraftEntity[] = [line1, line2];

    it('snaps to endpoints within tolerance', () => {
      // Cursor in world coords at (0.5, 0.5) mm -> 0.707 mm distance to (0,0) -> 1.41 px (well within 12 px tolerance)
      const snap = snapToEndpoint({ x: 0.5, y: 0.5 }, [line1], viewport, 12);
      expect(snap).toBeDefined();
      expect(snap?.type).toBe('endpoint');
      expect(snap?.point.x).toBeCloseTo(0, 4);
      expect(snap?.point.y).toBeCloseTo(0, 4);
      expect(snap?.entityId).toBe('L1');

      // Far away point -> no snap
      const noSnap = snapToEndpoint({ x: 10, y: 10 }, [line1], viewport, 12);
      expect(noSnap).toBeNull();
    });

    it('snaps to midpoint of line segment', () => {
      // Midpoint of line1 (0 to 50) is (25, 0)
      const snap = snapToMidpoint({ x: 25.2, y: 0.3 }, [line1], viewport, 12);
      expect(snap).toBeDefined();
      expect(snap?.type).toBe('midpoint');
      expect(snap?.point.x).toBeCloseTo(25, 4);
      expect(snap?.point.y).toBeCloseTo(0, 4);
    });

    it('snaps to circle and arc center', () => {
      const circle: DraftEntity = {
        id: 'C1',
        type: 'circle',
        center: { x: 40, y: 40 },
        radius: 15,
        lineType: 'continuous',
      };

      const snap = snapToCenter({ x: 40.5, y: 39.8 }, [circle], viewport, 12);
      expect(snap).toBeDefined();
      expect(snap?.type).toBe('centre');
      expect(snap?.point.x).toBeCloseTo(40, 4);
      expect(snap?.point.y).toBeCloseTo(40, 4);
    });

    it('snaps to intersection between entities', () => {
      // Intersection of line1 (y = 0) and line2 (x = 25) is at (25, 0)
      const snap = snapToIntersection({ x: 25.3, y: 0.2 }, entities, viewport, 12);
      expect(snap).toBeDefined();
      expect(snap?.type).toBe('intersection');
      expect(snap?.point.x).toBeCloseTo(25, 4);
      expect(snap?.point.y).toBeCloseTo(0, 4);
    });

    it('snaps to perpendicular projection from basePoint', () => {
      // Line along y = 0 from 0 to 50. Base point at (30, 20).
      // Perpendicular drop to line1 is (30, 0)
      const basePoint = { x: 30, y: 20 };
      const snap = snapToPerpendicular({ x: 30.4, y: 0.2 }, [line1], basePoint, viewport, 12);
      expect(snap).toBeDefined();
      expect(snap?.type).toBe('perpendicular');
      expect(snap?.point.x).toBeCloseTo(30, 4);
      expect(snap?.point.y).toBeCloseTo(0, 4);
    });

    it('snaps to nearest point along segment', () => {
      // Point near line at x = 17, y = 0.4
      const snap = snapToNearest({ x: 17, y: 0.4 }, [line1], viewport, 12);
      expect(snap).toBeDefined();
      expect(snap?.type).toBe('nearest');
      expect(snap?.point.x).toBeCloseTo(17, 4);
      expect(snap?.point.y).toBeCloseTo(0, 4);
    });

    it('snaps to grid points when enabled', () => {
      // Grid spacing 10 mm. Cursor near (20.3, 10.2)
      const snap = snapToGrid({ x: 20.3, y: 10.2 }, 10, viewport, 12);
      expect(snap).toBeDefined();
      expect(snap?.type).toBe('grid');
      expect(snap?.point.x).toBeCloseTo(20, 4);
      expect(snap?.point.y).toBeCloseTo(10, 4);
    });

    it('respects snap priority when multiple snap candidates match', () => {
      // At (25, 0), line1 and line2 intersect, and (25, 0) is ALSO the midpoint of line1!
      // Intersection has higher priority than midpoint
      expect(SNAP_PRIORITIES.intersection).toBeGreaterThan(SNAP_PRIORITIES.midpoint);
      expect(SNAP_PRIORITIES.endpoint).toBeGreaterThan(SNAP_PRIORITIES.midpoint);
      expect(SNAP_PRIORITIES.midpoint).toBeGreaterThan(SNAP_PRIORITIES.nearest);
      expect(SNAP_PRIORITIES.nearest).toBeGreaterThan(SNAP_PRIORITIES.grid);

      const bestSnap = findSnapPoint({ x: 25.1, y: 0.1 }, entities, viewport, {
        tolerancePx: 12,
        gridSpacingMm: 10,
      });

      expect(bestSnap).toBeDefined();
      expect(bestSnap?.type).toBe('intersection');
    });
  });

  // =========================================================================
  // 2. LINE COMMAND STATE MACHINE TESTS
  // =========================================================================
  describe('Line Command State Machine (End-to-End)', () => {
    it('manages idle -> active -> preview -> commit transitions via clicks', () => {
      const cmd = new LineCommand('continuous');
      expect(cmd.status).toBe('idle');

      // 1. Activate command
      cmd.start();
      expect(cmd.status).toBe('active');
      expect(cmd.prompt).toContain('first point');

      // 2. Click first point at (10, 20)
      cmd.onClick({ x: 10, y: 20 });
      expect(cmd.status).toBe('preview');
      expect(cmd.prompt).toContain('next point');

      // 3. Move cursor to preview rubber band
      const preview = cmd.onPointerMove({ x: 40, y: 20 }, false);
      expect(preview).toBeDefined();
      expect(preview?.type).toBe('line');
      expect(preview?.p1).toEqual({ x: 10, y: 20 });
      expect(preview?.p2).toEqual({ x: 40, y: 20 });

      // 4. Click second point at (40, 20) -> commits line entity
      const committed = cmd.onClick({ x: 40, y: 20 });
      expect(committed).toBeDefined();
      expect(committed?.type).toBe('line');
      expect(committed?.p1).toEqual({ x: 10, y: 20 });
      expect(committed?.p2).toEqual({ x: 40, y: 20 });
      expect(committed?.lineType).toBe('continuous');

      // Next segment automatically chains from (40, 20)
      expect(cmd.status).toBe('preview');
      const nextPreview = cmd.onPointerMove({ x: 40, y: 60 }, false);
      expect(nextPreview?.p1).toEqual({ x: 40, y: 20 });
      expect(nextPreview?.p2).toEqual({ x: 40, y: 60 });

      // 5. Enter key commits and returns to idle
      cmd.onEnter();
      expect(cmd.status).toBe('idle');
    });

    it('enforces ortho mode (locks angles to 0°, 90°, 180°, 270°)', () => {
      const cmd = new LineCommand('continuous');
      cmd.start();
      cmd.onClick({ x: 0, y: 0 });

      // Move cursor to (30, 10) with ortho = true
      // Angle is ~18° -> locks to horizontal (30, 0)
      const previewH = cmd.onPointerMove({ x: 30, y: 10 }, true);
      expect(previewH?.p2.x).toBeCloseTo(30, 4);
      expect(previewH?.p2.y).toBeCloseTo(0, 4);

      // Move cursor to (10, 40) with ortho = true
      // Angle is ~76° -> locks to vertical (0, 40)
      const previewV = cmd.onPointerMove({ x: 10, y: 40 }, true);
      expect(previewV?.p2.x).toBeCloseTo(0, 4);
      expect(previewV?.p2.y).toBeCloseTo(40, 4);
    });

    it('supports typed input for length, polar coords, and cartesian coords', () => {
      const cmd = new LineCommand('dashed');
      cmd.start();

      // Absolute cartesian coordinate input: "15,25"
      const res1 = cmd.onTextInput('15,25');
      expect(cmd.status).toBe('preview');
      expect(res1).toBeNull(); // First point sets anchor

      // Typed polar input: "50<45" (length 50 at 45°)
      // p1 = (15, 25), dx = 50 * cos(45°) ≈ 35.355, dy = 50 * sin(45°) ≈ 35.355
      const committedPolar = cmd.onTextInput('50<45');
      expect(committedPolar).toBeDefined();
      expect(committedPolar?.p1.x).toBeCloseTo(15, 2);
      expect(committedPolar?.p1.y).toBeCloseTo(25, 2);
      expect(committedPolar?.p2.x).toBeCloseTo(15 + 35.355, 2);
      expect(committedPolar?.p2.y).toBeCloseTo(25 + 35.355, 2);
      expect(committedPolar?.lineType).toBe('dashed');

      // Typed length along cursor direction:
      // Set cursor angle along +X
      cmd.onPointerMove({ x: 100, y: committedPolar!.p2.y }, false);
      const committedLen = cmd.onTextInput('40');
      expect(committedLen).toBeDefined();
      expect(committedLen?.p1).toEqual(committedPolar!.p2);
      expect(committedLen?.p2.x).toBeCloseTo(committedPolar!.p2.x + 40, 2);
      expect(committedLen?.p2.y).toBeCloseTo(committedPolar!.p2.y, 2);
    });

    it('cancels preview and active command on Escape', () => {
      const cmd = new LineCommand('continuous');
      cmd.start();
      cmd.onClick({ x: 10, y: 10 });
      expect(cmd.status).toBe('preview');

      // Escape once cancels rubber band, returns to idle
      cmd.onEscape();
      expect(cmd.status).toBe('idle');
      expect(cmd.onPointerMove({ x: 20, y: 20 }, false)).toBeNull();
    });

    it('keeps a typed first point if Enter is not forwarded from a command field', () => {
      const cmd = new LineCommand('continuous');
      cmd.start();
      expect(cmd.onTextInput('20,10')).toBeNull();
      expect(cmd.status).toBe('preview');

      // Global Enter must not run onEnter while the command bar is focused.
      // If it did, the first point would be discarded before the second coordinate.
      const committed = cmd.onTextInput('70,10');
      expect(committed).toBeDefined();
      expect(committed?.p1).toEqual({ x: 20, y: 10 });
      expect(committed?.p2).toEqual({ x: 70, y: 10 });
    });
  });

  describe('Draft hotkey routing', () => {
    it('ignores canvas hotkeys when the event target is a text field', () => {
      expect(shouldIgnoreDraftHotkey({ tagName: 'INPUT' })).toBe(true);
      expect(shouldIgnoreDraftHotkey({ tagName: 'TEXTAREA' })).toBe(true);
      expect(shouldIgnoreDraftHotkey({ tagName: 'SELECT' })).toBe(true);
      expect(shouldIgnoreDraftHotkey({ tagName: 'CANVAS' })).toBe(false);
      expect(shouldIgnoreDraftHotkey({ tagName: 'DIV', isContentEditable: true })).toBe(true);
      expect(shouldIgnoreDraftHotkey(null)).toBe(false);
    });
  });
});
