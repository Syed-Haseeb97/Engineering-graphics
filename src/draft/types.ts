/**
 * 2D Drafting Entity Model & Types
 *
 * All coordinates, lengths, and dimensions are strictly in millimetres (mm) as mandated by SPEC.md & AGENTS.md.
 * Pure TypeScript, layer-free, fully serialisable to/from JSON.
 */

/** 2D point coordinate in world millimetres. */
export interface Point2D {
  readonly x: number;
  readonly y: number;
}

/**
 * Standard engineering line classification (ISO 128 / BIS SP 46):
 * - continuous: Visible outlines, sharp edges, dimension lines, title blocks (thick 0.5-0.7mm or medium 0.35mm).
 * - dashed: Hidden outlines and hidden edges (medium 0.35mm).
 * - centre: Center lines, axes of symmetry, pitch circles (long dash - dot - long dash, thin 0.25mm).
 * - thin: Construction rays, projection projectors, extension lines, hatching (thin continuous 0.25mm).
 */
export type LineType = 'continuous' | 'dashed' | 'centre' | 'thin';

/** Common base interface for all serialisable 2D drafting entities. */
export interface BaseEntity {
  readonly id: string;
  readonly lineType: LineType;
}

/** 2D Line entity from p1 to p2. */
export interface LineEntity extends BaseEntity {
  readonly type: 'line';
  readonly p1: Point2D;
  readonly p2: Point2D;
}

/** 2D Circle entity defined by center and radius. */
export interface CircleEntity extends BaseEntity {
  readonly type: 'circle';
  readonly center: Point2D;
  readonly radius: number;
}

/** 2D Circular Arc entity defined by center, radius, start angle, and end angle (in radians). */
export interface ArcEntity extends BaseEntity {
  readonly type: 'arc';
  readonly center: Point2D;
  readonly radius: number;
  readonly startAngleRad: number;
  readonly endAngleRad: number;
  readonly counterClockwise?: boolean;
}

/** 2D Polyline entity consisting of an ordered sequence of vertices. */
export interface PolylineEntity extends BaseEntity {
  readonly type: 'polyline';
  readonly points: readonly Point2D[];
  readonly closed?: boolean;
}

/** 2D Dimension annotation entity (linear, aligned, angular, radius, diameter). */
export interface DimensionEntity extends BaseEntity {
  readonly type: 'dimension';
  readonly dimType: 'linear' | 'aligned' | 'angular' | 'radius' | 'diameter';
  readonly p1: Point2D;
  readonly p2: Point2D;
  readonly p3?: Point2D;
  readonly offset?: number;
  readonly text?: string;
  readonly value?: number;
}

/** Discriminated union of all 2D drafting entities. */
export type DraftEntity =
  | LineEntity
  | CircleEntity
  | ArcEntity
  | PolylineEntity
  | DimensionEntity;

/** In-memory audit log entry recorded on every command commit. */
export interface CommandLogEntry {
  readonly id: string;
  readonly timestamp: number;
  readonly command: string;
  readonly entityIds: readonly string[];
  readonly payload?: unknown;
}

/** Persistent drafting state serialised to/from IndexedDB. */
export interface DraftState {
  readonly version: number;
  readonly timestamp: number;
  readonly entities: readonly DraftEntity[];
  readonly commandLog: readonly CommandLogEntry[];
}

/** Supported geometric snap modes. */
export type SnapType =
  | 'intersection'
  | 'endpoint'
  | 'centre'
  | 'midpoint'
  | 'perpendicular'
  | 'nearest'
  | 'grid';

/** Result of a geometric snap calculation. */
export interface SnapResult {
  readonly point: Point2D;
  readonly type: SnapType;
  readonly entityId?: string;
  readonly distancePx: number;
}

/** Configuration options for the snap engine. */
export interface SnapOptions {
  /** Enabled snap types. Defaults to all enabled. */
  readonly enabledTypes?: ReadonlySet<SnapType>;
  /** Cursor snap tolerance in screen pixels. Default: 12 px. */
  readonly tolerancePx?: number;
  /** World grid spacing in millimetres. Default: 10 mm. */
  readonly gridSpacingMm?: number;
  /** Active reference point for perpendicular snap (e.g. start of rubber-band line). */
  readonly basePoint?: Point2D;
}

/** Viewport camera and pan/zoom state for mapping world mm <-> screen pixels. */
export interface ViewportTransform {
  /** Screen pixels per world millimetre (zoom scale). */
  readonly scale: number;
  /** Pan offset X in screen pixels. */
  readonly panX: number;
  /** Pan offset Y in screen pixels. */
  readonly panY: number;
}
