import { describe, expect, it } from 'vitest';
import {
  ArcCommand,
  CircleCommand,
  CopyCommand,
  DimensionCommand,
  EraseCommand,
  MoveCommand,
  OffsetCommand,
  PolylineCommand,
  ProjectorCommand,
  TrimCommand,
} from '../command';
import { clearDraftState, loadDraftState, saveDraftState } from '../storage';
import type { CircleEntity, DraftEntity, DraftState, LineEntity } from '../types';

describe('Drafting Commands Suite', () => {
  describe('Circle Command', () => {
    it('creates circle via center-radius mode', () => {
      const cmd = new CircleCommand('center-radius', 'continuous');
      cmd.start();
      expect(cmd.status).toBe('active');

      // Click center at (50, 50)
      const res1 = cmd.onClick({ x: 50, y: 50 });
      expect(res1).toBeNull();
      expect(cmd.status).toBe('preview');

      // Preview at radius point (80, 50) -> radius = 30
      const preview = cmd.onPointerMove({ x: 80, y: 50 });
      expect(preview).toBeDefined();
      expect(preview?.badgeText).toBe('R: 30.0 mm');
      const circlePreview = preview?.entities[0] as CircleEntity;
      expect(circlePreview.radius).toBeCloseTo(30, 4);

      // Click to commit
      const res2 = cmd.onClick({ x: 80, y: 50 });
      expect(res2).toBeDefined();
      expect(res2?.commandName).toBe('CIRCLE');
      expect(res2?.created).toHaveLength(1);
      const circle = res2?.created?.[0] as CircleEntity;
      expect(circle.type).toBe('circle');
      expect(circle.center).toEqual({ x: 50, y: 50 });
      expect(circle.radius).toBeCloseTo(30, 4);
      expect(circle.lineType).toBe('continuous');
    });

    it('creates circle via 2-point diameter mode', () => {
      const cmd = new CircleCommand('2-point', 'dashed');
      cmd.start();

      // Point 1: (10, 20)
      cmd.onClick({ x: 10, y: 20 });
      expect(cmd.status).toBe('preview');

      // Point 2: (50, 20) -> Diameter = 40, Center = (30, 20), Radius = 20
      const res = cmd.onClick({ x: 50, y: 20 });
      expect(res).toBeDefined();
      const circle = res?.created?.[0] as CircleEntity;
      expect(circle.center.x).toBeCloseTo(30, 4);
      expect(circle.center.y).toBeCloseTo(20, 4);
      expect(circle.radius).toBeCloseTo(20, 4);
      expect(circle.lineType).toBe('dashed');
    });

    it('supports direct typed radius in center-radius mode', () => {
      const cmd = new CircleCommand('center-radius');
      cmd.start();
      cmd.onClick({ x: 100, y: 100 });
      const res = cmd.onTextInput('45.5');
      expect(res).toBeDefined();
      const circle = res?.created?.[0] as CircleEntity;
      expect(circle.center).toEqual({ x: 100, y: 100 });
      expect(circle.radius).toBeCloseTo(45.5, 4);
    });
  });

  describe('Arc Command', () => {
    it('creates arc passing through 3 non-collinear points', () => {
      const cmd = new ArcCommand('3-point', 'continuous');
      cmd.start();

      // Point 1: (0, 0), Point 2: (10, 10), Point 3: (20, 0)
      cmd.onClick({ x: 0, y: 0 });
      cmd.onClick({ x: 10, y: 10 });
      const res = cmd.onClick({ x: 20, y: 0 });

      expect(res).toBeDefined();
      expect(res?.commandName).toBe('ARC');
      const arc = res?.created?.[0];
      expect(arc?.type).toBe('arc');
      if (arc?.type === 'arc') {
        expect(arc.center.x).toBeCloseTo(10, 4);
        expect(arc.center.y).toBeCloseTo(0, 4);
        expect(arc.radius).toBeCloseTo(10, 4);
      }
    });

    it('creates arc via center-start-end mode', () => {
      const cmd = new ArcCommand('center-start-end', 'centre');
      cmd.start();

      // Center: (50, 50), Start: (80, 50) -> radius = 30, End: (50, 80)
      cmd.onClick({ x: 50, y: 50 });
      cmd.onClick({ x: 80, y: 50 });
      const res = cmd.onClick({ x: 50, y: 80 });

      expect(res).toBeDefined();
      const arc = res?.created?.[0];
      if (arc?.type === 'arc') {
        expect(arc.center).toEqual({ x: 50, y: 50 });
        expect(arc.radius).toBeCloseTo(30, 4);
        expect(arc.startAngleRad).toBeCloseTo(0, 4);
        expect(arc.endAngleRad).toBeCloseTo(Math.PI / 2, 4);
        expect(arc.lineType).toBe('centre');
      }
    });
  });

  describe('Polyline Command', () => {
    it('commits open polyline on Enter', () => {
      const cmd = new PolylineCommand('continuous');
      cmd.start();

      cmd.onClick({ x: 0, y: 0 });
      cmd.onClick({ x: 50, y: 0 });
      cmd.onClick({ x: 50, y: 50 });
      const res = cmd.onEnter();

      expect(res).toBeDefined();
      expect(res?.commandName).toBe('POLYLINE');
      const poly = res?.created?.[0];
      if (poly?.type === 'polyline') {
        expect(poly.points).toHaveLength(3);
        expect(poly.closed).toBe(false);
      }
    });

    it('closes polyline when user types C', () => {
      const cmd = new PolylineCommand('continuous');
      cmd.start();

      cmd.onClick({ x: 0, y: 0 });
      cmd.onClick({ x: 40, y: 0 });
      cmd.onClick({ x: 40, y: 30 });
      const res = cmd.onTextInput('c');

      expect(res).toBeDefined();
      const poly = res?.created?.[0];
      if (poly?.type === 'polyline') {
        expect(poly.points).toHaveLength(3);
        expect(poly.closed).toBe(true);
      }
    });
  });

  describe('Erase Command', () => {
    it('deletes target entity under cursor', () => {
      const cmd = new EraseCommand();
      cmd.start();

      const line1: LineEntity = {
        id: 'line_target',
        type: 'line',
        p1: { x: 10, y: 10 },
        p2: { x: 50, y: 10 },
        lineType: 'continuous',
      };
      const line2: LineEntity = {
        id: 'line_other',
        type: 'line',
        p1: { x: 10, y: 80 },
        p2: { x: 50, y: 80 },
        lineType: 'continuous',
      };

      // Click near line1 at (30, 11)
      const res = cmd.onClick({ x: 30, y: 11 }, [line1, line2]);
      expect(res).toBeDefined();
      expect(res?.commandName).toBe('ERASE');
      expect(res?.deletedIds).toContain('line_target');
      expect(res?.deletedIds).not.toContain('line_other');
    });
  });

  describe('Move & Copy Commands', () => {
    const originalLine: LineEntity = {
      id: 'target_line',
      type: 'line',
      p1: { x: 0, y: 0 },
      p2: { x: 50, y: 0 },
      lineType: 'continuous',
    };

    it('moves entity by displacement vector', () => {
      const cmd = new MoveCommand();
      cmd.start();

      // Step 1: select entity near (25, 0)
      cmd.onClick({ x: 25, y: 0 }, [originalLine]);
      // Step 2: base point at (0, 0)
      cmd.onClick({ x: 0, y: 0 }, [originalLine]);
      // Step 3: destination at (20, 30)
      const res = cmd.onClick({ x: 20, y: 30 }, [originalLine]);

      expect(res).toBeDefined();
      expect(res?.commandName).toBe('MOVE');
      const updated = res?.updated?.[0]?.entity as LineEntity;
      expect(updated.id).toBe('target_line');
      expect(updated.p1).toEqual({ x: 20, y: 30 });
      expect(updated.p2).toEqual({ x: 70, y: 30 });
    });

    it('copies entity to new location preserving original', () => {
      const cmd = new CopyCommand();
      cmd.start();

      cmd.onClick({ x: 25, y: 0 }, [originalLine]);
      cmd.onClick({ x: 0, y: 0 }, [originalLine]);
      const res = cmd.onClick({ x: 15, y: 40 }, [originalLine]);

      expect(res).toBeDefined();
      expect(res?.commandName).toBe('COPY');
      const copied = res?.created?.[0] as LineEntity;
      expect(copied.id).not.toBe('target_line');
      expect(copied.p1).toEqual({ x: 15, y: 40 });
      expect(copied.p2).toEqual({ x: 65, y: 40 });
    });
  });

  describe('Trim Command', () => {
    it('trims line back to its intersection with a cutting line', () => {
      // Line A: horizontal from (0, 20) to (100, 20)
      const lineA: LineEntity = {
        id: 'line_a',
        type: 'line',
        p1: { x: 0, y: 20 },
        p2: { x: 100, y: 20 },
        lineType: 'continuous',
      };
      // Line B: vertical cutting line from (40, 0) to (40, 50)
      const lineB: LineEntity = {
        id: 'line_b',
        type: 'line',
        p1: { x: 40, y: 0 },
        p2: { x: 40, y: 50 },
        lineType: 'continuous',
      };

      const cmd = new TrimCommand();
      cmd.start();

      // Click on the right segment of line A at (80, 20) -> should trim away (40, 20) to (100, 20)
      const res = cmd.onClick({ x: 80, y: 20 }, [lineA, lineB]);
      expect(res).toBeDefined();
      expect(res?.commandName).toBe('TRIM');
      expect(res?.deletedIds).toContain('line_a');
      expect(res?.created).toHaveLength(1);

      const kept = res?.created?.[0] as LineEntity;
      expect(kept.p1.x).toBeCloseTo(0, 4);
      expect(kept.p1.y).toBeCloseTo(20, 4);
      expect(kept.p2.x).toBeCloseTo(40, 4);
      expect(kept.p2.y).toBeCloseTo(20, 4);
    });
  });

  describe('Offset Command', () => {
    it('offsets a horizontal line by given distance', () => {
      const line: LineEntity = {
        id: 'base_line',
        type: 'line',
        p1: { x: 10, y: 10 },
        p2: { x: 60, y: 10 },
        lineType: 'continuous',
      };

      const cmd = new OffsetCommand(15, 'thin');
      cmd.start();

      // Select line
      cmd.onClick({ x: 30, y: 10 }, [line]);
      // Click above line at (30, 25)
      const res = cmd.onClick({ x: 30, y: 25 }, [line]);

      expect(res).toBeDefined();
      expect(res?.commandName).toBe('OFFSET');
      const off = res?.created?.[0] as LineEntity;
      expect(off.lineType).toBe('thin');
      expect(off.p1.x).toBeCloseTo(10, 4);
      expect(off.p1.y).toBeCloseTo(25, 4);
      expect(off.p2.x).toBeCloseTo(60, 4);
      expect(off.p2.y).toBeCloseTo(25, 4);
    });

    it('offsets a circle concentrically', () => {
      const circle: CircleEntity = {
        id: 'base_circle',
        type: 'circle',
        center: { x: 50, y: 50 },
        radius: 20,
        lineType: 'continuous',
      };

      const cmd = new OffsetCommand(10);
      cmd.start();

      cmd.onClick({ x: 70, y: 50 }, [circle]);
      // Click outside at (85, 50) -> new radius = 30
      const res = cmd.onClick({ x: 85, y: 50 }, [circle]);

      expect(res).toBeDefined();
      const off = res?.created?.[0] as CircleEntity;
      expect(off.center).toEqual({ x: 50, y: 50 });
      expect(off.radius).toBeCloseTo(30, 4);
    });
  });

  describe('Projector Helper Command', () => {
    it('casts a thin vertical projector through a reference point', () => {
      const cmd = new ProjectorCommand('vertical');
      cmd.start();

      // Click reference point at (45, 60)
      cmd.onClick({ x: 45, y: 60 });
      // Click to confirm direction
      const res = cmd.onClick({ x: 45, y: 100 });

      expect(res).toBeDefined();
      expect(res?.commandName).toBe('PROJECTOR');
      const proj = res?.created?.[0] as LineEntity;
      expect(proj.lineType).toBe('thin');
      expect(proj.p1.x).toBe(45);
      expect(proj.p2.x).toBe(45);
      expect(proj.p2.y - proj.p1.y).toBeGreaterThan(500); // Spans views
    });

    it('casts a thin horizontal projector through a reference point', () => {
      const cmd = new ProjectorCommand('horizontal');
      cmd.start();

      cmd.onClick({ x: 45, y: 60 });
      const res = cmd.onClick({ x: 100, y: 60 });

      expect(res).toBeDefined();
      const proj = res?.created?.[0] as LineEntity;
      expect(proj.lineType).toBe('thin');
      expect(proj.p1.y).toBe(60);
      expect(proj.p2.y).toBe(60);
      expect(proj.p2.x - proj.p1.x).toBeGreaterThan(500);
    });
  });

  describe('Dimension Command', () => {
    it('creates linear dimension with witness lines and custom text', () => {
      const cmd = new DimensionCommand('linear');
      cmd.start();

      // Origin 1 at (20, 30)
      cmd.onClick({ x: 20, y: 30 }, []);
      // Origin 2 at (70, 30) -> length = 50
      cmd.onClick({ x: 70, y: 30 }, []);
      // Set custom text
      cmd.onTextInput('50.0 ±0.1');
      // Dimension position at (45, 45) -> offset = 15
      const res = cmd.onClick({ x: 45, y: 45 }, []);

      expect(res).toBeDefined();
      expect(res?.commandName).toBe('DIMENSION');
      const dim = res?.created?.[0];
      if (dim?.type === 'dimension') {
        expect(dim.dimType).toBe('linear');
        expect(dim.value).toBeCloseTo(50, 4);
        expect(dim.text).toBe('50.0 ±0.1');
        expect(dim.lineType).toBe('thin');
      }
    });

    it('creates radius dimension on circle', () => {
      const circle: CircleEntity = {
        id: 'c1',
        type: 'circle',
        center: { x: 100, y: 100 },
        radius: 25,
        lineType: 'continuous',
      };

      const cmd = new DimensionCommand('radius');
      cmd.start();

      // Click circle at (125, 100)
      const res = cmd.onClick({ x: 125, y: 100 }, [circle]);
      expect(res).toBeDefined();
      const dim = res?.created?.[0];
      if (dim?.type === 'dimension') {
        expect(dim.dimType).toBe('radius');
        expect(dim.value).toBeCloseTo(25, 4);
        expect(dim.text).toBe('R25.0');
      }
    });
  });

  describe('IndexedDB Autosave & Persistence', () => {
    it('persists and restores draft entities and command log', async () => {
      await clearDraftState();

      const sampleEntities: DraftEntity[] = [
        {
          id: 'line_save_1',
          type: 'line',
          p1: { x: 10, y: 10 },
          p2: { x: 60, y: 10 },
          lineType: 'continuous',
        },
      ];

      const sampleState: DraftState = {
        version: 1,
        timestamp: Date.now(),
        entities: sampleEntities,
        commandLog: [
          {
            id: 'log_1',
            timestamp: Date.now(),
            command: 'LINE',
            entityIds: ['line_save_1'],
          },
        ],
      };

      await saveDraftState(sampleState);

      const restored = await loadDraftState();
      expect(restored).not.toBeNull();
      expect(restored?.entities).toHaveLength(1);
      expect(restored?.entities[0]?.id).toBe('line_save_1');
      expect(restored?.commandLog).toHaveLength(1);
      expect(restored?.commandLog[0]?.command).toBe('LINE');
    });
  });
});
