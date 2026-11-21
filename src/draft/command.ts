import {
  circleFrom3Points,
  dist,
  offsetLineSegment,
  pointToEntityDistance,
  trimLineAtIntersections,
} from './geometry';
import type {
  ArcEntity,
  CircleEntity,
  DimensionEntity,
  DraftEntity,
  LineEntity,
  LineType,
  Point2D,
  PolylineEntity,
} from './types';

export type CommandStatus = 'idle' | 'active' | 'preview';

/** Standardized outcome returned by a command execution. */
export interface CommandResult {
  readonly commandName: string;
  readonly created?: readonly DraftEntity[];
  readonly deletedIds?: readonly string[];
  readonly updated?: readonly { id: string; entity: DraftEntity }[];
  readonly payload?: unknown;
}

/** Dynamic visual preview produced while hovering/moving. */
export interface CommandPreview {
  readonly entities: readonly DraftEntity[];
  readonly badgeText?: string;
  readonly badgePoint?: Point2D;
  readonly highlightEntityId?: string;
}

/** Common interface for all interactive drafting commands. */
export interface IDraftCommand {
  readonly name: string;
  readonly status: CommandStatus;
  readonly prompt: string;
  readonly lineType: LineType;
  setLineType(lt: LineType): void;
  start(): void;
  onClick(point: Point2D, allEntities: readonly DraftEntity[]): CommandResult | null;
  onPointerMove(
    point: Point2D,
    allEntities: readonly DraftEntity[],
    ortho?: boolean,
  ): CommandPreview | null;
  onTextInput(text: string, allEntities: readonly DraftEntity[]): CommandResult | null;
  onEnter(): CommandResult | null;
  onEscape(): void;
}

let entityIdCounter = 0;
export function generateEntityId(prefix = 'ent'): string {
  return `${prefix}_${Date.now().toString(36)}_${(++entityIdCounter).toString(36)}`;
}

export type LineCommandResult = LineEntity & CommandResult;
export type LineCommandPreview = LineEntity & CommandPreview;

// ============================================================================
// 1. Line Command
// ============================================================================
export class LineCommand implements IDraftCommand {
  public readonly name = 'LINE';
  private _status: CommandStatus = 'idle';
  private _prompt = 'Type LINE or select tool to begin.';
  private _lineType: LineType = 'continuous';
  private _firstPoint: Point2D | null = null;
  private _currentPreviewPoint: Point2D | null = null;
  private _lastMoveAngleRad = 0;

  constructor(lineType: LineType = 'continuous') {
    this._lineType = lineType;
  }

  public get status(): CommandStatus {
    return this._status;
  }

  public get prompt(): string {
    return this._prompt;
  }

  public get lineType(): LineType {
    return this._lineType;
  }

  public setLineType(lt: LineType): void {
    this._lineType = lt;
  }

  public start(): void {
    this._status = 'active';
    this._firstPoint = null;
    this._currentPreviewPoint = null;
    this._prompt = 'Specify first point:';
  }

  public onClick(point: Point2D): LineCommandResult | null {
    if (this._status === 'idle') {
      this.start();
    }

    if (this._status === 'active') {
      this._firstPoint = { ...point };
      this._currentPreviewPoint = { ...point };
      this._status = 'preview';
      this._prompt = 'Specify next point or [Enter to finish, Esc to cancel]:';
      return null;
    }

    if (this._status === 'preview' && this._firstPoint) {
      const p1 = this._firstPoint;
      const p2 = { ...point };

      if (dist(p1, p2) < 1e-4) {
        return null;
      }

      const id = generateEntityId('line');
      const lineEntity: LineEntity = {
        id,
        type: 'line',
        p1,
        p2,
        lineType: this._lineType,
      };
      const committed: LineCommandResult = {
        ...lineEntity,
        commandName: 'LINE',
        created: [lineEntity],
        payload: { p1, p2, lineType: this._lineType },
      };

      // Continuous line chaining
      this._firstPoint = { ...p2 };
      this._currentPreviewPoint = { ...p2 };
      this._prompt = 'Specify next point or [Enter to finish, Esc to cancel]:';

      return committed;
    }

    return null;
  }

  public onPointerMove(
    rawPoint: Point2D,
    orthoOrEntities: boolean | readonly DraftEntity[] = false,
    ortho = false,
  ): LineCommandPreview | null {
    if (this._status !== 'preview' || !this._firstPoint) {
      return null;
    }

    const isOrtho = typeof orthoOrEntities === 'boolean' ? orthoOrEntities : ortho;

    let targetX = rawPoint.x;
    let targetY = rawPoint.y;

    const dx = targetX - this._firstPoint.x;
    const dy = targetY - this._firstPoint.y;

    if (isOrtho) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        targetY = this._firstPoint.y;
      } else {
        targetX = this._firstPoint.x;
      }
    }

    const finalTarget: Point2D = { x: targetX, y: targetY };
    this._currentPreviewPoint = finalTarget;

    const len = dist(this._firstPoint, finalTarget);
    if (len > 1e-4) {
      this._lastMoveAngleRad = Math.atan2(targetY - this._firstPoint.y, targetX - this._firstPoint.x);
    }

    const angleDeg = (this._lastMoveAngleRad * 180) / Math.PI;
    const badgeText = `${len.toFixed(1)} mm < ${angleDeg.toFixed(1)}°`;

    const previewLine: LineCommandPreview = {
      id: 'preview_line',
      type: 'line',
      p1: { ...this._firstPoint },
      p2: finalTarget,
      lineType: this._lineType,
      entities: [],
      badgeText,
      badgePoint: {
        x: (this._firstPoint.x + finalTarget.x) / 2,
        y: (this._firstPoint.y + finalTarget.y) / 2,
      },
    };
    (previewLine as unknown as { entities: LineEntity[] }).entities = [previewLine];

    return previewLine;
  }

  public onTextInput(text: string): LineCommandResult | null {
    const trimmed = text.trim();
    if (!trimmed) return null;

    if (trimmed.includes('<')) {
      const parts = trimmed.split('<');
      const length = parseFloat(parts[0]!);
      const angleDeg = parseFloat(parts[1]!);
      if (Number.isFinite(length) && Number.isFinite(angleDeg)) {
        const angleRad = (angleDeg * Math.PI) / 180;
        const origin = this._firstPoint ?? { x: 0, y: 0 };
        const target: Point2D = {
          x: origin.x + length * Math.cos(angleRad),
          y: origin.y + length * Math.sin(angleRad),
        };
        return this.onClick(target);
      }
    }

    if (trimmed.includes(',')) {
      const parts = trimmed.split(',');
      const x = parseFloat(parts[0]!);
      const y = parseFloat(parts[1]!);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        return this.onClick({ x, y });
      }
    }

    const lengthOnly = parseFloat(trimmed);
    if (Number.isFinite(lengthOnly) && lengthOnly > 0 && this._firstPoint) {
      const target: Point2D = {
        x: this._firstPoint.x + lengthOnly * Math.cos(this._lastMoveAngleRad),
        y: this._firstPoint.y + lengthOnly * Math.sin(this._lastMoveAngleRad),
      };
      return this.onClick(target);
    }

    return null;
  }

  public onEnter(): CommandResult | null {
    this._status = 'idle';
    this._firstPoint = null;
    this._currentPreviewPoint = null;
    this._prompt = 'Command completed. Select tool to begin.';
    return null;
  }

  public onEscape(): void {
    this._status = 'idle';
    this._firstPoint = null;
    this._currentPreviewPoint = null;
    this._prompt = 'Command cancelled.';
  }
}

// ============================================================================
// 2. Circle Command (Centre-Radius & 2-Point)
// ============================================================================
export type CircleMode = 'center-radius' | '2-point';

export class CircleCommand implements IDraftCommand {
  public readonly name = 'CIRCLE';
  private _status: CommandStatus = 'idle';
  private _mode: CircleMode = 'center-radius';
  private _prompt = 'Specify center point of circle:';
  private _lineType: LineType = 'continuous';
  private _p1: Point2D | null = null;

  constructor(mode: CircleMode = 'center-radius', lineType: LineType = 'continuous') {
    this._mode = mode;
    this._lineType = lineType;
  }

  public get status(): CommandStatus {
    return this._status;
  }

  public get prompt(): string {
    return this._prompt;
  }

  public get lineType(): LineType {
    return this._lineType;
  }

  public setLineType(lt: LineType): void {
    this._lineType = lt;
  }

  public setMode(mode: CircleMode): void {
    this._mode = mode;
    this.start();
  }

  public start(): void {
    this._status = 'active';
    this._p1 = null;
    this._prompt =
      this._mode === 'center-radius'
        ? 'Specify center point of circle:'
        : 'Specify first diameter point:';
  }

  public onClick(point: Point2D): CommandResult | null {
    if (this._status === 'idle') {
      this.start();
    }

    if (this._status === 'active') {
      this._p1 = { ...point };
      this._status = 'preview';
      this._prompt =
        this._mode === 'center-radius'
          ? 'Specify radius point or enter radius:'
          : 'Specify second diameter point:';
      return null;
    }

    if (this._status === 'preview' && this._p1) {
      let center: Point2D;
      let radius: number;

      if (this._mode === 'center-radius') {
        center = { ...this._p1 };
        radius = dist(this._p1, point);
      } else {
        center = { x: (this._p1.x + point.x) / 2, y: (this._p1.y + point.y) / 2 };
        radius = dist(this._p1, point) / 2;
      }

      if (radius < 1e-4) return null;

      const circle: CircleEntity = {
        id: generateEntityId('circle'),
        type: 'circle',
        center,
        radius,
        lineType: this._lineType,
      };

      this._status = 'active';
      this._p1 = null;
      this._prompt =
        this._mode === 'center-radius'
          ? 'Specify center point of circle:'
          : 'Specify first diameter point:';

      return {
        commandName: 'CIRCLE',
        created: [circle],
        payload: { mode: this._mode, center, radius },
      };
    }

    return null;
  }

  public onPointerMove(point: Point2D): CommandPreview | null {
    if (this._status !== 'preview' || !this._p1) return null;

    let center: Point2D;
    let radius: number;
    let badgeText: string;

    if (this._mode === 'center-radius') {
      center = { ...this._p1 };
      radius = dist(this._p1, point);
      badgeText = `R: ${radius.toFixed(1)} mm`;
    } else {
      center = { x: (this._p1.x + point.x) / 2, y: (this._p1.y + point.y) / 2 };
      radius = dist(this._p1, point) / 2;
      badgeText = `Dia: ${(radius * 2).toFixed(1)} mm`;
    }

    if (radius < 1e-4) return null;

    const previewCircle: CircleEntity = {
      id: 'preview_circle',
      type: 'circle',
      center,
      radius,
      lineType: this._lineType,
    };

    return {
      entities: [previewCircle],
      badgeText,
      badgePoint: { x: center.x, y: center.y + radius },
    };
  }

  public onTextInput(text: string): CommandResult | null {
    const val = parseFloat(text.trim());
    if (Number.isFinite(val) && val > 0 && this._p1 && this._status === 'preview') {
      const radius = this._mode === 'center-radius' ? val : val / 2;
      const center = { ...this._p1 };
      const circle: CircleEntity = {
        id: generateEntityId('circle'),
        type: 'circle',
        center,
        radius,
        lineType: this._lineType,
      };

      this._status = 'active';
      this._p1 = null;
      return {
        commandName: 'CIRCLE',
        created: [circle],
        payload: { mode: this._mode, center, radius },
      };
    }
    return null;
  }

  public onEnter(): CommandResult | null {
    this._status = 'idle';
    this._p1 = null;
    return null;
  }

  public onEscape(): void {
    this._status = 'idle';
    this._p1 = null;
    this._prompt = 'Command cancelled.';
  }
}

// ============================================================================
// 3. Arc Command (3-Point & Centre-Start-End)
// ============================================================================
export type ArcMode = '3-point' | 'center-start-end';

export class ArcCommand implements IDraftCommand {
  public readonly name = 'ARC';
  private _status: CommandStatus = 'idle';
  private _mode: ArcMode = '3-point';
  private _prompt = 'Specify start point of arc:';
  private _lineType: LineType = 'continuous';
  private _p1: Point2D | null = null;
  private _p2: Point2D | null = null;

  constructor(mode: ArcMode = '3-point', lineType: LineType = 'continuous') {
    this._mode = mode;
    this._lineType = lineType;
  }

  public get status(): CommandStatus {
    return this._status;
  }

  public get prompt(): string {
    return this._prompt;
  }

  public get lineType(): LineType {
    return this._lineType;
  }

  public setLineType(lt: LineType): void {
    this._lineType = lt;
  }

  public setMode(mode: ArcMode): void {
    this._mode = mode;
    this.start();
  }

  public start(): void {
    this._status = 'active';
    this._p1 = null;
    this._p2 = null;
    this._prompt =
      this._mode === '3-point' ? 'Specify start point of arc:' : 'Specify center point of arc:';
  }

  public onClick(point: Point2D): CommandResult | null {
    if (this._status === 'idle') this.start();

    if (this._status === 'active' && !this._p1) {
      this._p1 = { ...point };
      this._prompt =
        this._mode === '3-point' ? 'Specify second point on arc:' : 'Specify start point of arc:';
      return null;
    }

    if (this._status === 'active' && this._p1 && !this._p2) {
      if (dist(this._p1, point) < 1e-4) return null;
      this._p2 = { ...point };
      this._status = 'preview';
      this._prompt = 'Specify end point of arc:';
      return null;
    }

    if (this._status === 'preview' && this._p1 && this._p2) {
      if (dist(this._p2, point) < 1e-4) return null;

      let arcEntity: ArcEntity;

      if (this._mode === '3-point') {
        const res = circleFrom3Points(this._p1, this._p2, point);
        if (!res) return null;
        arcEntity = {
          id: generateEntityId('arc'),
          type: 'arc',
          center: res.center,
          radius: res.radius,
          startAngleRad: res.startAngleRad,
          endAngleRad: res.endAngleRad,
          counterClockwise: res.counterClockwise,
          lineType: this._lineType,
        };
      } else {
        // center-start-end
        const center = this._p1;
        const startPt = this._p2;
        const radius = dist(center, startPt);
        const startAngleRad = Math.atan2(startPt.y - center.y, startPt.x - center.x);
        const endAngleRad = Math.atan2(point.y - center.y, point.x - center.x);
        arcEntity = {
          id: generateEntityId('arc'),
          type: 'arc',
          center,
          radius,
          startAngleRad,
          endAngleRad,
          counterClockwise: true,
          lineType: this._lineType,
        };
      }

      this._status = 'active';
      this._p1 = null;
      this._p2 = null;
      this._prompt =
        this._mode === '3-point' ? 'Specify start point of arc:' : 'Specify center point of arc:';

      return {
        commandName: 'ARC',
        created: [arcEntity],
        payload: { mode: this._mode, arc: arcEntity },
      };
    }

    return null;
  }

  public onPointerMove(point: Point2D): CommandPreview | null {
    if (this._status !== 'preview' || !this._p1 || !this._p2) return null;

    if (this._mode === '3-point') {
      const res = circleFrom3Points(this._p1, this._p2, point);
      if (!res) return null;

      const previewArc: ArcEntity = {
        id: 'preview_arc',
        type: 'arc',
        center: res.center,
        radius: res.radius,
        startAngleRad: res.startAngleRad,
        endAngleRad: res.endAngleRad,
        counterClockwise: res.counterClockwise,
        lineType: this._lineType,
      };

      return {
        entities: [previewArc],
        badgeText: `R: ${res.radius.toFixed(1)} mm`,
        badgePoint: { ...point },
      };
    } else {
      const center = this._p1;
      const startPt = this._p2;
      const radius = dist(center, startPt);
      const startAngleRad = Math.atan2(startPt.y - center.y, startPt.x - center.x);
      const endAngleRad = Math.atan2(point.y - center.y, point.x - center.x);

      const previewArc: ArcEntity = {
        id: 'preview_arc',
        type: 'arc',
        center,
        radius,
        startAngleRad,
        endAngleRad,
        counterClockwise: true,
        lineType: this._lineType,
      };

      return {
        entities: [previewArc],
        badgeText: `R: ${radius.toFixed(1)} mm`,
        badgePoint: { ...point },
      };
    }
  }

  public onTextInput(): CommandResult | null {
    return null;
  }

  public onEnter(): CommandResult | null {
    this._status = 'idle';
    this._p1 = null;
    this._p2 = null;
    return null;
  }

  public onEscape(): void {
    this._status = 'idle';
    this._p1 = null;
    this._p2 = null;
    this._prompt = 'Command cancelled.';
  }
}

// ============================================================================
// 4. Polyline Command
// ============================================================================
export class PolylineCommand implements IDraftCommand {
  public readonly name = 'POLYLINE';
  private _status: CommandStatus = 'idle';
  private _prompt = 'Specify start point of polyline:';
  private _lineType: LineType = 'continuous';
  private _points: Point2D[] = [];

  constructor(lineType: LineType = 'continuous') {
    this._lineType = lineType;
  }

  public get status(): CommandStatus {
    return this._status;
  }

  public get prompt(): string {
    return this._prompt;
  }

  public get lineType(): LineType {
    return this._lineType;
  }

  public setLineType(lt: LineType): void {
    this._lineType = lt;
  }

  public start(): void {
    this._status = 'active';
    this._points = [];
    this._prompt = 'Specify start point of polyline:';
  }

  public onClick(point: Point2D): CommandResult | null {
    if (this._status === 'idle') this.start();

    if (this._points.length > 0) {
      const last = this._points[this._points.length - 1]!;
      if (dist(last, point) < 1e-4) return null;
    }

    this._points.push({ ...point });
    this._status = 'preview';
    this._prompt = `Specify next point or [Enter to finish, C to close] (${this._points.length} pts):`;
    return null;
  }

  public onPointerMove(point: Point2D): CommandPreview | null {
    if (this._status !== 'preview' || this._points.length === 0) return null;

    const previewPts = [...this._points, { ...point }];
    const previewPoly: PolylineEntity = {
      id: 'preview_polyline',
      type: 'polyline',
      points: previewPts,
      lineType: this._lineType,
    };

    return {
      entities: [previewPoly],
      badgeText: `${this._points.length} vertices`,
      badgePoint: { ...point },
    };
  }

  public onTextInput(text: string): CommandResult | null {
    const trimmed = text.trim().toUpperCase();
    if (trimmed === 'C' || trimmed === 'CLOSE') {
      return this.commitPolyline(true);
    }
    return null;
  }

  public onEnter(): CommandResult | null {
    return this.commitPolyline(false);
  }

  private commitPolyline(closed: boolean): CommandResult | null {
    if (this._points.length < 2) {
      this.onEscape();
      return null;
    }

    const poly: PolylineEntity = {
      id: generateEntityId('polyline'),
      type: 'polyline',
      points: [...this._points],
      closed,
      lineType: this._lineType,
    };

    this._status = 'idle';
    this._points = [];
    this._prompt = 'Polyline completed.';

    return {
      commandName: 'POLYLINE',
      created: [poly],
      payload: { vertexCount: poly.points.length, closed },
    };
  }

  public onEscape(): void {
    this._status = 'idle';
    this._points = [];
    this._prompt = 'Command cancelled.';
  }
}

// ============================================================================
// 5. Erase Command
// ============================================================================
export class EraseCommand implements IDraftCommand {
  public readonly name = 'ERASE';
  private _status: CommandStatus = 'idle';
  private _prompt = 'Select entity to erase or [Esc to finish]:';
  private _lineType: LineType = 'continuous';
  private _hoverId: string | null = null;

  public get status(): CommandStatus {
    return this._status;
  }

  public get prompt(): string {
    return this._prompt;
  }

  public get lineType(): LineType {
    return this._lineType;
  }

  public setLineType(lt: LineType): void {
    this._lineType = lt;
  }

  public start(): void {
    this._status = 'active';
    this._hoverId = null;
    this._prompt = 'Select entity to erase or [Esc to finish]:';
  }

  public onClick(point: Point2D, allEntities: readonly DraftEntity[]): CommandResult | null {
    let closestEntity: DraftEntity | null = null;
    let minDist = 8.0; // 8 mm world tolerance

    for (const ent of allEntities) {
      const d = pointToEntityDistance(point, ent);
      if (d < minDist) {
        minDist = d;
        closestEntity = ent;
      }
    }

    if (!closestEntity) return null;

    return {
      commandName: 'ERASE',
      deletedIds: [closestEntity.id],
      payload: { deleted: closestEntity },
    };
  }

  public onPointerMove(
    point: Point2D,
    allEntities: readonly DraftEntity[],
  ): CommandPreview | null {
    let closestEntity: DraftEntity | null = null;
    let minDist = 8.0;

    for (const ent of allEntities) {
      const d = pointToEntityDistance(point, ent);
      if (d < minDist) {
        minDist = d;
        closestEntity = ent;
      }
    }

    this._hoverId = closestEntity ? closestEntity.id : null;
    if (!closestEntity) return null;

    return {
      entities: [],
      highlightEntityId: closestEntity.id,
      badgeText: `Erase ${closestEntity.type}`,
      badgePoint: { ...point },
    };
  }

  public onTextInput(): CommandResult | null {
    return null;
  }

  public onEnter(): CommandResult | null {
    this._status = 'idle';
    return null;
  }

  public onEscape(): void {
    this._status = 'idle';
    this._hoverId = null;
    this._prompt = 'Erase completed.';
  }
}

// ============================================================================
// 6. Move Command
// ============================================================================
export class MoveCommand implements IDraftCommand {
  public readonly name = 'MOVE';
  private _status: CommandStatus = 'idle';
  private _prompt = 'Select entity to move:';
  private _lineType: LineType = 'continuous';
  private _selectedEntity: DraftEntity | null = null;
  private _basePoint: Point2D | null = null;

  public get status(): CommandStatus {
    return this._status;
  }

  public get prompt(): string {
    return this._prompt;
  }

  public get lineType(): LineType {
    return this._lineType;
  }

  public setLineType(lt: LineType): void {
    this._lineType = lt;
  }

  public start(): void {
    this._status = 'active';
    this._selectedEntity = null;
    this._basePoint = null;
    this._prompt = 'Select entity to move:';
  }

  public onClick(point: Point2D, allEntities: readonly DraftEntity[]): CommandResult | null {
    if (this._status === 'idle') this.start();

    // Step 1: Select entity
    if (!this._selectedEntity) {
      let closest: DraftEntity | null = null;
      let minDist = 8.0;
      for (const ent of allEntities) {
        const d = pointToEntityDistance(point, ent);
        if (d < minDist) {
          minDist = d;
          closest = ent;
        }
      }
      if (closest) {
        this._selectedEntity = closest;
        this._prompt = 'Specify base point:';
      }
      return null;
    }

    // Step 2: Set base point
    if (!this._basePoint) {
      this._basePoint = { ...point };
      this._status = 'preview';
      this._prompt = 'Specify destination point:';
      return null;
    }

    // Step 3: Destination point
    const dx = point.x - this._basePoint.x;
    const dy = point.y - this._basePoint.y;
    const moved = translateEntity(this._selectedEntity, dx, dy);

    this._status = 'idle';
    this._selectedEntity = null;
    this._basePoint = null;
    this._prompt = 'Move completed.';

    return {
      commandName: 'MOVE',
      updated: [{ id: moved.id, entity: moved }],
      payload: { dx, dy },
    };
  }

  public onPointerMove(point: Point2D): CommandPreview | null {
    if (this._status !== 'preview' || !this._selectedEntity || !this._basePoint) return null;

    const dx = point.x - this._basePoint.x;
    const dy = point.y - this._basePoint.y;
    const preview = translateEntity(this._selectedEntity, dx, dy);

    return {
      entities: [preview],
      badgeText: `Δx: ${dx.toFixed(1)}, Δy: ${dy.toFixed(1)}`,
      badgePoint: { ...point },
    };
  }

  public onTextInput(): CommandResult | null {
    return null;
  }

  public onEnter(): CommandResult | null {
    this.onEscape();
    return null;
  }

  public onEscape(): void {
    this._status = 'idle';
    this._selectedEntity = null;
    this._basePoint = null;
    this._prompt = 'Move cancelled.';
  }
}

// ============================================================================
// 7. Copy Command
// ============================================================================
export class CopyCommand implements IDraftCommand {
  public readonly name = 'COPY';
  private _status: CommandStatus = 'idle';
  private _prompt = 'Select entity to copy:';
  private _lineType: LineType = 'continuous';
  private _selectedEntity: DraftEntity | null = null;
  private _basePoint: Point2D | null = null;

  public get status(): CommandStatus {
    return this._status;
  }

  public get prompt(): string {
    return this._prompt;
  }

  public get lineType(): LineType {
    return this._lineType;
  }

  public setLineType(lt: LineType): void {
    this._lineType = lt;
  }

  public start(): void {
    this._status = 'active';
    this._selectedEntity = null;
    this._basePoint = null;
    this._prompt = 'Select entity to copy:';
  }

  public onClick(point: Point2D, allEntities: readonly DraftEntity[]): CommandResult | null {
    if (this._status === 'idle') this.start();

    if (!this._selectedEntity) {
      let closest: DraftEntity | null = null;
      let minDist = 8.0;
      for (const ent of allEntities) {
        const d = pointToEntityDistance(point, ent);
        if (d < minDist) {
          minDist = d;
          closest = ent;
        }
      }
      if (closest) {
        this._selectedEntity = closest;
        this._prompt = 'Specify base point:';
      }
      return null;
    }

    if (!this._basePoint) {
      this._basePoint = { ...point };
      this._status = 'preview';
      this._prompt = 'Specify destination point:';
      return null;
    }

    const dx = point.x - this._basePoint.x;
    const dy = point.y - this._basePoint.y;
    const copied = translateEntity(this._selectedEntity, dx, dy, generateEntityId('copy'));

    this._status = 'idle';
    this._selectedEntity = null;
    this._basePoint = null;
    this._prompt = 'Copy completed.';

    return {
      commandName: 'COPY',
      created: [copied],
      payload: { sourceId: copied.id, dx, dy },
    };
  }

  public onPointerMove(point: Point2D): CommandPreview | null {
    if (this._status !== 'preview' || !this._selectedEntity || !this._basePoint) return null;

    const dx = point.x - this._basePoint.x;
    const dy = point.y - this._basePoint.y;
    const preview = translateEntity(this._selectedEntity, dx, dy);

    return {
      entities: [preview],
      badgeText: `Copy Δ: ${Math.hypot(dx, dy).toFixed(1)} mm`,
      badgePoint: { ...point },
    };
  }

  public onTextInput(): CommandResult | null {
    return null;
  }

  public onEnter(): CommandResult | null {
    this.onEscape();
    return null;
  }

  public onEscape(): void {
    this._status = 'idle';
    this._selectedEntity = null;
    this._basePoint = null;
    this._prompt = 'Copy cancelled.';
  }
}

// ============================================================================
// 8. Trim Command
// ============================================================================
export class TrimCommand implements IDraftCommand {
  public readonly name = 'TRIM';
  private _status: CommandStatus = 'idle';
  private _prompt = 'Select segment to trim back to intersection:';
  private _lineType: LineType = 'continuous';

  public get status(): CommandStatus {
    return this._status;
  }

  public get prompt(): string {
    return this._prompt;
  }

  public get lineType(): LineType {
    return this._lineType;
  }

  public setLineType(lt: LineType): void {
    this._lineType = lt;
  }

  public start(): void {
    this._status = 'active';
    this._prompt = 'Select segment to trim back to intersection:';
  }

  public onClick(point: Point2D, allEntities: readonly DraftEntity[]): CommandResult | null {
    // Find closest line
    let closestLine: LineEntity | null = null;
    let minDist = 8.0;

    for (const ent of allEntities) {
      if (ent.type === 'line') {
        const d = pointToEntityDistance(point, ent);
        if (d < minDist) {
          minDist = d;
          closestLine = ent;
        }
      }
    }

    if (!closestLine) return null;

    const res = trimLineAtIntersections(
      closestLine,
      allEntities,
      point,
      () => generateEntityId('trim'),
    );

    if (!res) {
      this._prompt = 'No cutting intersection found for this segment.';
      return null;
    }

    this._prompt = 'Segment trimmed. Select another or [Esc to finish]:';

    return {
      commandName: 'TRIM',
      deletedIds: [res.deletedId],
      created: res.created,
      payload: { originalId: res.deletedId, remainingCount: res.created.length },
    };
  }

  public onPointerMove(
    point: Point2D,
    allEntities: readonly DraftEntity[],
  ): CommandPreview | null {
    let closestLine: LineEntity | null = null;
    let minDist = 8.0;

    for (const ent of allEntities) {
      if (ent.type === 'line') {
        const d = pointToEntityDistance(point, ent);
        if (d < minDist) {
          minDist = d;
          closestLine = ent;
        }
      }
    }

    if (!closestLine) return null;

    return {
      entities: [],
      highlightEntityId: closestLine.id,
      badgeText: 'Trim segment',
      badgePoint: { ...point },
    };
  }

  public onTextInput(): CommandResult | null {
    return null;
  }

  public onEnter(): CommandResult | null {
    this.onEscape();
    return null;
  }

  public onEscape(): void {
    this._status = 'idle';
    this._prompt = 'Trim completed.';
  }
}

// ============================================================================
// 9. Offset Command
// ============================================================================
export class OffsetCommand implements IDraftCommand {
  public readonly name = 'OFFSET';
  private _status: CommandStatus = 'idle';
  private _offsetDistance = 10;
  private _prompt = 'Specify offset distance or select entity <10 mm>:';
  private _lineType: LineType = 'continuous';
  private _selectedEntity: DraftEntity | null = null;

  constructor(distance = 10, lineType: LineType = 'continuous') {
    this._offsetDistance = distance;
    this._lineType = lineType;
  }

  public get status(): CommandStatus {
    return this._status;
  }

  public get prompt(): string {
    return this._prompt;
  }

  public get lineType(): LineType {
    return this._lineType;
  }

  public setLineType(lt: LineType): void {
    this._lineType = lt;
  }

  public setDistance(distMm: number): void {
    if (distMm > 0) this._offsetDistance = distMm;
  }

  public start(): void {
    this._status = 'active';
    this._selectedEntity = null;
    this._prompt = `Specify offset distance or select entity <${this._offsetDistance} mm>:`;
  }

  public onClick(point: Point2D, allEntities: readonly DraftEntity[]): CommandResult | null {
    if (this._status === 'idle') this.start();

    // Step 1: Select entity
    if (!this._selectedEntity) {
      let closest: DraftEntity | null = null;
      let minDist = 8.0;
      for (const ent of allEntities) {
        if (ent.type === 'line' || ent.type === 'circle') {
          const d = pointToEntityDistance(point, ent);
          if (d < minDist) {
            minDist = d;
            closest = ent;
          }
        }
      }
      if (closest) {
        this._selectedEntity = closest;
        this._status = 'preview';
        this._prompt = 'Specify point on side to offset:';
      }
      return null;
    }

    // Step 2: Commit offset on clicked side
    const created = this.computeOffsetEntity(this._selectedEntity, point);
    if (!created) return null;

    this._status = 'active';
    this._selectedEntity = null;
    this._prompt = `Offset committed. Select next entity or enter distance <${this._offsetDistance} mm>:`;

    return {
      commandName: 'OFFSET',
      created: [created],
      payload: { distance: this._offsetDistance },
    };
  }

  public onPointerMove(point: Point2D): CommandPreview | null {
    if (this._status !== 'preview' || !this._selectedEntity) return null;

    const preview = this.computeOffsetEntity(this._selectedEntity, point);
    if (!preview) return null;

    return {
      entities: [preview],
      badgeText: `Offset ${this._offsetDistance} mm`,
      badgePoint: { ...point },
    };
  }

  private computeOffsetEntity(entity: DraftEntity, sidePoint: Point2D): DraftEntity | null {
    if (entity.type === 'line') {
      const [p1Off, p2Off] = offsetLineSegment(
        entity.p1,
        entity.p2,
        this._offsetDistance,
        sidePoint,
      );
      const offLine: LineEntity = {
        id: generateEntityId('offset_line'),
        type: 'line',
        p1: p1Off,
        p2: p2Off,
        lineType: this._lineType,
      };
      return offLine;
    }

    if (entity.type === 'circle') {
      const d = dist(sidePoint, entity.center);
      const newRadius =
        d >= entity.radius
          ? entity.radius + this._offsetDistance
          : Math.max(1, entity.radius - this._offsetDistance);

      const offCircle: CircleEntity = {
        id: generateEntityId('offset_circle'),
        type: 'circle',
        center: { ...entity.center },
        radius: newRadius,
        lineType: this._lineType,
      };
      return offCircle;
    }

    return null;
  }

  public onTextInput(text: string): CommandResult | null {
    const val = parseFloat(text.trim());
    if (Number.isFinite(val) && val > 0) {
      this._offsetDistance = val;
      this._prompt = `Offset distance set to ${val} mm. Select entity to offset:`;
    }
    return null;
  }

  public onEnter(): CommandResult | null {
    this.onEscape();
    return null;
  }

  public onEscape(): void {
    this._status = 'idle';
    this._selectedEntity = null;
    this._prompt = 'Offset cancelled.';
  }
}

// ============================================================================
// 10. Projector Command (Vertical & Horizontal Construction Lines)
// ============================================================================
export type ProjectorOrientation = 'auto' | 'vertical' | 'horizontal';

export class ProjectorCommand implements IDraftCommand {
  public readonly name = 'PROJECTOR';
  private _status: CommandStatus = 'idle';
  private _orientation: ProjectorOrientation = 'auto';
  private _prompt = 'Click point to draw projection ray [H: Horiz, V: Vert]:';
  private _lineType: LineType = 'thin';
  private _anchor: Point2D | null = null;

  constructor(orientation: ProjectorOrientation = 'auto') {
    this._orientation = orientation;
    this._lineType = 'thin'; // Standard ISO thin continuous construction line
  }

  public get status(): CommandStatus {
    return this._status;
  }

  public get prompt(): string {
    return this._prompt;
  }

  public get lineType(): LineType {
    return this._lineType;
  }

  public setLineType(lt: LineType): void {
    this._lineType = lt;
  }

  public setOrientation(orient: ProjectorOrientation): void {
    this._orientation = orient;
  }

  public start(): void {
    this._status = 'active';
    this._anchor = null;
    this._prompt = 'Click reference point to cast projector [H: Horiz, V: Vert]:';
  }

  public onClick(point: Point2D): CommandResult | null {
    if (this._status === 'idle') this.start();

    if (!this._anchor) {
      this._anchor = { ...point };
      this._status = 'preview';
      this._prompt = 'Move cursor to define projection direction, then click to commit:';
      return null;
    }

    // Determine direction
    const isVert =
      this._orientation === 'vertical' ||
      (this._orientation === 'auto' && Math.abs(point.y - this._anchor.y) > Math.abs(point.x - this._anchor.x));

    const line = this.buildProjectorLine(this._anchor, isVert);

    this._status = 'active';
    this._anchor = null;
    this._prompt = 'Projector placed. Click another point or [Esc to finish]:';

    return {
      commandName: 'PROJECTOR',
      created: [line],
      payload: { anchor: point, isVertical: isVert },
    };
  }

  public onPointerMove(point: Point2D): CommandPreview | null {
    if (this._status !== 'preview' || !this._anchor) return null;

    const isVert =
      this._orientation === 'vertical' ||
      (this._orientation === 'auto' && Math.abs(point.y - this._anchor.y) > Math.abs(point.x - this._anchor.x));

    const line = this.buildProjectorLine(this._anchor, isVert);

    return {
      entities: [line],
      badgeText: isVert ? 'Vertical Projector' : 'Horizontal Projector',
      badgePoint: { ...point },
    };
  }

  private buildProjectorLine(anchor: Point2D, isVertical: boolean): LineEntity {
    // Spans +/- 600 mm across standard A2 sheet bounds
    const SPAN = 600;
    return {
      id: generateEntityId('projector'),
      type: 'line',
      p1: isVertical ? { x: anchor.x, y: anchor.y - SPAN } : { x: anchor.x - SPAN, y: anchor.y },
      p2: isVertical ? { x: anchor.x, y: anchor.y + SPAN } : { x: anchor.x + SPAN, y: anchor.y },
      lineType: 'thin',
    };
  }

  public onTextInput(text: string): CommandResult | null {
    const t = text.trim().toUpperCase();
    if (t === 'H') {
      this._orientation = 'horizontal';
      this._prompt = 'Orientation set to HORIZONTAL. Click point:';
      return null;
    } else if (t === 'V') {
      this._orientation = 'vertical';
      this._prompt = 'Orientation set to VERTICAL. Click point:';
      return null;
    }

    if (t.includes(',')) {
      const parts = t.split(',');
      const x = parseFloat(parts[0]!);
      const y = parseFloat(parts[1]!);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        return this.onClick({ x, y });
      }
    }
    return null;
  }

  public onEnter(): CommandResult | null {
    this.onEscape();
    return null;
  }

  public onEscape(): void {
    this._status = 'idle';
    this._anchor = null;
    this._prompt = 'Projector completed.';
  }
}

// ============================================================================
// 11. Dimension Command (Linear, Radius, Angular)
// ============================================================================
export type DimensionMode = 'linear' | 'radius' | 'angular';

export class DimensionCommand implements IDraftCommand {
  public readonly name = 'DIMENSION';
  private _status: CommandStatus = 'idle';
  private _mode: DimensionMode = 'linear';
  private _prompt = 'Specify first extension origin:';
  private _lineType: LineType = 'thin';
  private _p1: Point2D | null = null;
  private _p2: Point2D | null = null;
  private _customText: string | undefined = undefined;

  constructor(mode: DimensionMode = 'linear') {
    this._mode = mode;
    this._lineType = 'thin';
  }

  public get status(): CommandStatus {
    return this._status;
  }

  public get prompt(): string {
    return this._prompt;
  }

  public get lineType(): LineType {
    return this._lineType;
  }

  public setLineType(lt: LineType): void {
    this._lineType = lt;
  }

  public setMode(mode: DimensionMode): void {
    this._mode = mode;
    this.start();
  }

  public start(): void {
    this._status = 'active';
    this._p1 = null;
    this._p2 = null;
    this._customText = undefined;
    if (this._mode === 'linear') {
      this._prompt = 'Specify first extension line origin:';
    } else if (this._mode === 'radius') {
      this._prompt = 'Select circle or arc to dimension radius:';
    } else {
      this._prompt = 'Specify angle vertex:';
    }
  }

  public onClick(point: Point2D, allEntities: readonly DraftEntity[]): CommandResult | null {
    if (this._status === 'idle') this.start();

    if (this._mode === 'radius') {
      // Find circle or arc
      let target: CircleEntity | ArcEntity | null = null;
      let minDist = 8.0;
      for (const ent of allEntities) {
        if (ent.type === 'circle' || ent.type === 'arc') {
          const d = pointToEntityDistance(point, ent);
          if (d < minDist) {
            minDist = d;
            target = ent;
          }
        }
      }
      if (!target) return null;

      const angle = Math.atan2(point.y - target.center.y, point.x - target.center.x);
      const edgePt: Point2D = {
        x: target.center.x + target.radius * Math.cos(angle),
        y: target.center.y + target.radius * Math.sin(angle),
      };

      const dim: DimensionEntity = {
        id: generateEntityId('dim_rad'),
        type: 'dimension',
        dimType: 'radius',
        p1: target.center,
        p2: edgePt,
        value: target.radius,
        text: this._customText ?? `R${target.radius.toFixed(1)}`,
        lineType: 'thin',
      };

      this._status = 'idle';
      this._prompt = 'Radius dimension committed.';

      return {
        commandName: 'DIMENSION',
        created: [dim],
        payload: { dimType: 'radius', value: target.radius },
      };
    }

    if (this._mode === 'linear') {
      if (!this._p1) {
        this._p1 = { ...point };
        this._prompt = 'Specify second extension line origin:';
        return null;
      }

      if (!this._p2) {
        if (dist(this._p1, point) < 1e-4) return null;
        this._p2 = { ...point };
        this._status = 'preview';
        this._prompt = 'Specify dimension line position:';
        return null;
      }

      // 3rd click: offset position
      const p1 = this._p1;
      const p2 = this._p2;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);

      // Normal distance from line p1-p2 to clicked point
      const nx = -dy / len;
      const ny = dx / len;
      const offset = (point.x - p1.x) * nx + (point.y - p1.y) * ny;

      const dim: DimensionEntity = {
        id: generateEntityId('dim_lin'),
        type: 'dimension',
        dimType: 'linear',
        p1,
        p2,
        offset,
        value: len,
        text: this._customText ?? `${len.toFixed(1)} mm`,
        lineType: 'thin',
      };

      this._status = 'idle';
      this._p1 = null;
      this._p2 = null;
      this._prompt = 'Dimension placed.';

      return {
        commandName: 'DIMENSION',
        created: [dim],
        payload: { dimType: 'linear', value: len, offset },
      };
    }

    return null;
  }

  public onPointerMove(point: Point2D): CommandPreview | null {
    if (this._status !== 'preview' || !this._p1 || !this._p2) return null;

    if (this._mode === 'linear') {
      const p1 = this._p1;
      const p2 = this._p2;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-4) return null;

      const nx = -dy / len;
      const ny = dx / len;
      const offset = (point.x - p1.x) * nx + (point.y - p1.y) * ny;

      const previewDim: DimensionEntity = {
        id: 'preview_dim',
        type: 'dimension',
        dimType: 'linear',
        p1,
        p2,
        offset,
        value: len,
        text: this._customText ?? `${len.toFixed(1)} mm`,
        lineType: 'thin',
      };

      return {
        entities: [previewDim],
        badgeText: previewDim.text,
        badgePoint: { ...point },
      };
    }

    return null;
  }

  public onTextInput(text: string, allEntities: readonly DraftEntity[] = []): CommandResult | null {
    const trimmed = text.trim();
    if (trimmed.includes(',')) {
      const parts = trimmed.split(',');
      const x = parseFloat(parts[0]!);
      const y = parseFloat(parts[1]!);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        return this.onClick({ x, y }, allEntities);
      }
    }
    if (trimmed) {
      this._customText = trimmed;
      this._prompt = `Custom text set to "${trimmed}". Place dimension:`;
    }
    return null;
  }

  public onEnter(): CommandResult | null {
    this.onEscape();
    return null;
  }

  public onEscape(): void {
    this._status = 'idle';
    this._p1 = null;
    this._p2 = null;
    this._prompt = 'Dimension cancelled.';
  }
}

// ============================================================================
// Helpers
// ============================================================================
function translateEntity<T extends DraftEntity>(
  entity: T,
  dx: number,
  dy: number,
  newId?: string,
): T {
  const id = newId ?? entity.id;
  switch (entity.type) {
    case 'line':
      return {
        ...entity,
        id,
        p1: { x: entity.p1.x + dx, y: entity.p1.y + dy },
        p2: { x: entity.p2.x + dx, y: entity.p2.y + dy },
      } as T;

    case 'circle':
      return {
        ...entity,
        id,
        center: { x: entity.center.x + dx, y: entity.center.y + dy },
      } as T;

    case 'arc':
      return {
        ...entity,
        id,
        center: { x: entity.center.x + dx, y: entity.center.y + dy },
      } as T;

    case 'polyline':
      return {
        ...entity,
        id,
        points: entity.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })),
      } as T;

    case 'dimension':
      return {
        ...entity,
        id,
        p1: { x: entity.p1.x + dx, y: entity.p1.y + dy },
        p2: { x: entity.p2.x + dx, y: entity.p2.y + dy },
        p3: entity.p3 ? { x: entity.p3.x + dx, y: entity.p3.y + dy } : undefined,
      } as T;
  }
}
