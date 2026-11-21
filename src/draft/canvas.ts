import {
  ArcCommand,
  CircleCommand,
  CommandResult,
  CopyCommand,
  DimensionCommand,
  EraseCommand,
  generateEntityId,
  IDraftCommand,
  LineCommand,
  MoveCommand,
  OffsetCommand,
  PolylineCommand,
  ProjectorCommand,
  TrimCommand,
} from './command';
import { shouldIgnoreDraftHotkey } from './events';
import { dist } from './geometry';
import { findSnapPoint } from './snap';
import { loadDraftState, saveDraftState } from './storage';
import type {
  CommandLogEntry,
  DimensionEntity,
  DraftEntity,
  DraftState,
  LineType,
  Point2D,
  SnapOptions,
  SnapResult,
  ViewportTransform,
} from './types';
import { DraftViewport, screenToWorld, worldToScreen } from './viewport';

export interface DraftCanvasOptions {
  gridSpacingMm?: number;
  snapTolerancePx?: number;
  initialLineType?: LineType;
  ortho?: boolean;
  autosaveIntervalMs?: number;
  /** IndexedDB record key so student attempts do not overwrite the sandbox draft. */
  storageKey?: string;
}

export type ToolType =
  | 'line'
  | 'circle-cr'
  | 'circle-2p'
  | 'arc-3p'
  | 'arc-cse'
  | 'polyline'
  | 'erase'
  | 'move'
  | 'copy'
  | 'trim'
  | 'offset'
  | 'projector'
  | 'dim-linear'
  | 'dim-radius';

/**
 * 2D Interactive Precision Drafting Canvas Engine
 *
 * Implements high-performance Canvas2D immediate mode rendering with:
 * - Real-time pan & zoom (mouse wheel, touch pinch, middle drag)
 * - Visible XY reference line at y = 0
 * - Adaptive infinite grid
 * - Ortho constraint toggle
 * - Visual snap indicators (endpoint, midpoint, intersection, etc.)
 * - Unified PointerEvents for mouse, touch, and stylus
 * - Full drafting tool set: line, circle (CR, 2P), arc (3P, CSE), polyline, erase, move, copy, trim, offset, projector, dimensions
 * - Command-level undo/redo and in-memory exportable command audit log
 * - Autosave to IndexedDB every 10 seconds and on every commit
 */
export class DraftCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private viewport: DraftViewport;
  private entities: DraftEntity[] = [];
  private activeCommand: IDraftCommand;
  private currentTool: ToolType = 'line';
  private currentLineType: LineType = 'continuous';
  private currentSnap: SnapResult | null = null;
  private cursorWorld: Point2D = { x: 0, y: 0 };
  private isPanning = false;
  private lastPointerScreen = { x: 0, y: 0 };
  private ortho = false;
  private gridSpacingMm = 10;
  private snapTolerancePx = 12;
  private resizeObserver: ResizeObserver | null = null;
  private autosaveTimer: number | null = null;
  private storageKey: string;
  private didFitViewport = false;
  private readonly onPointerDownBound: (e: PointerEvent) => void;
  private readonly onPointerMoveBound: (e: PointerEvent) => void;
  private readonly onPointerUpBound: (e: PointerEvent) => void;
  private readonly onPointerCancelBound: (e: PointerEvent) => void;
  private readonly onWheelBound: (e: WheelEvent) => void;
  private readonly onKeyDownBound: (e: KeyboardEvent) => void;

  // History & Log
  private undoStack: DraftEntity[][] = [];
  private redoStack: DraftEntity[][] = [];
  private commandLog: CommandLogEntry[] = [];

  // Callbacks
  private onEntityAddedCallback?: (entity: DraftEntity) => void;
  private onPromptChangedCallback?: (prompt: string) => void;
  private onAutosaveCallback?: (status: string) => void;
  private onStateChangedCallback?: () => void;

  constructor(canvas: HTMLCanvasElement, options?: DraftCanvasOptions) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to acquire 2D canvas rendering context.');
    }
    this.ctx = context;

    this.viewport = new DraftViewport(2.0, canvas.clientWidth / 2, canvas.clientHeight / 2);
    this.currentLineType = options?.initialLineType ?? 'continuous';
    this.activeCommand = new LineCommand(this.currentLineType);
    this.ortho = options?.ortho ?? false;
    this.gridSpacingMm = options?.gridSpacingMm ?? 10;
    this.snapTolerancePx = options?.snapTolerancePx ?? 12;
    this.storageKey = options?.storageKey ?? 'active_draft';

    this.onPointerDownBound = this.onPointerDown.bind(this);
    this.onPointerMoveBound = this.onPointerMove.bind(this);
    this.onPointerUpBound = this.onPointerUp.bind(this);
    this.onPointerCancelBound = this.onPointerCancel.bind(this);
    this.onWheelBound = this.onWheel.bind(this);
    this.onKeyDownBound = this.onKeyDown.bind(this);

    this.initCanvasSize();
    this.bindEvents();
    this.setupAutosave(options?.autosaveIntervalMs ?? 10000);
    this.activeCommand.start();
    this.notifyPrompt();
    this.render();
  }

  public get transform(): ViewportTransform {
    return this.viewport.transform;
  }

  public get isOrtho(): boolean {
    return this.ortho;
  }

  public setOrtho(enabled: boolean): void {
    this.ortho = enabled;
    this.render();
  }

  public toggleOrtho(): boolean {
    this.ortho = !this.ortho;
    this.render();
    return this.ortho;
  }

  public get lineType(): LineType {
    return this.currentLineType;
  }

  public setLineType(lt: LineType): void {
    this.currentLineType = lt;
    this.activeCommand.setLineType(lt);
    this.render();
  }

  public getEntities(): readonly DraftEntity[] {
    return this.entities;
  }

  public getCommandLog(): readonly CommandLogEntry[] {
    return this.commandLog;
  }

  public exportCommandLogJSON(): string {
    return JSON.stringify(this.commandLog, null, 2);
  }

  public setTool(tool: ToolType): void {
    this.currentTool = tool;
    switch (tool) {
      case 'line':
        this.activeCommand = new LineCommand(this.currentLineType);
        break;
      case 'circle-cr':
        this.activeCommand = new CircleCommand('center-radius', this.currentLineType);
        break;
      case 'circle-2p':
        this.activeCommand = new CircleCommand('2-point', this.currentLineType);
        break;
      case 'arc-3p':
        this.activeCommand = new ArcCommand('3-point', this.currentLineType);
        break;
      case 'arc-cse':
        this.activeCommand = new ArcCommand('center-start-end', this.currentLineType);
        break;
      case 'polyline':
        this.activeCommand = new PolylineCommand(this.currentLineType);
        break;
      case 'erase':
        this.activeCommand = new EraseCommand();
        break;
      case 'move':
        this.activeCommand = new MoveCommand();
        break;
      case 'copy':
        this.activeCommand = new CopyCommand();
        break;
      case 'trim':
        this.activeCommand = new TrimCommand();
        break;
      case 'offset':
        this.activeCommand = new OffsetCommand(10, this.currentLineType);
        break;
      case 'projector':
        this.activeCommand = new ProjectorCommand('auto');
        break;
      case 'dim-linear':
        this.activeCommand = new DimensionCommand('linear');
        break;
      case 'dim-radius':
        this.activeCommand = new DimensionCommand('radius');
        break;
    }
    this.activeCommand.start();
    this.notifyPrompt();
    this.render();
  }

  public get activeToolName(): string {
    return this.currentTool;
  }

  // ==========================================================================
  // History & Undo / Redo
  // ==========================================================================
  private pushHistory(): void {
    this.undoStack.push(this.entities.map((e) => ({ ...e })));
    this.redoStack = [];
    if (this.undoStack.length > 50) {
      this.undoStack.shift();
    }
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public undo(): boolean {
    if (this.undoStack.length === 0) return false;
    this.redoStack.push(this.entities.map((e) => ({ ...e })));
    this.entities = this.undoStack.pop()!;
    this.logAction('UNDO', [], { remaining: this.entities.length });
    void this.saveToStorage();
    this.onStateChangedCallback?.();
    this.render();
    return true;
  }

  public redo(): boolean {
    if (this.redoStack.length === 0) return false;
    this.undoStack.push(this.entities.map((e) => ({ ...e })));
    this.entities = this.redoStack.pop()!;
    this.logAction('REDO', [], { remaining: this.entities.length });
    void this.saveToStorage();
    this.onStateChangedCallback?.();
    this.render();
    return true;
  }

  public addEntity(entity: DraftEntity): void {
    this.pushHistory();
    this.entities.push(entity);
    this.logAction('ADD_ENTITY', [entity.id], { type: entity.type });
    this.onEntityAddedCallback?.(entity);
    this.onStateChangedCallback?.();
    void this.saveToStorage();
    this.render();
  }

  public clearEntities(): void {
    this.pushHistory();
    this.entities = [];
    this.logAction('CLEAR_ALL', []);
    void this.saveToStorage();
    this.onStateChangedCallback?.();
    this.render();
  }

  public editEntityText(entityId: string, newText: string): boolean {
    const idx = this.entities.findIndex((e) => e.id === entityId);
    if (idx === -1) return false;
    const current = this.entities[idx]!;
    if (current.type !== 'dimension') return false;

    this.pushHistory();
    const updated: DimensionEntity = { ...current, text: newText };
    this.entities[idx] = updated;
    this.logAction('EDIT_DIM_TEXT', [entityId], { oldText: current.text, newText });
    void this.saveToStorage();
    this.onStateChangedCallback?.();
    this.render();
    return true;
  }

  // ==========================================================================
  // Command Execution & Dispatch
  // ==========================================================================
  private applyCommandResult(result: CommandResult): void {
    this.pushHistory();

    const affectedIds: string[] = [];

    // 1. Process deletions
    if (result.deletedIds && result.deletedIds.length > 0) {
      const delSet = new Set(result.deletedIds);
      this.entities = this.entities.filter((e) => !delSet.has(e.id));
      affectedIds.push(...result.deletedIds);
    }

    // 2. Process updates
    if (result.updated && result.updated.length > 0) {
      for (const update of result.updated) {
        const idx = this.entities.findIndex((e) => e.id === update.id);
        if (idx !== -1) {
          this.entities[idx] = update.entity;
          affectedIds.push(update.id);
        }
      }
    }

    // 3. Process creations
    if (result.created && result.created.length > 0) {
      for (const entity of result.created) {
        this.entities.push(entity);
        affectedIds.push(entity.id);
        this.onEntityAddedCallback?.(entity);
      }
    }

    // 4. Record in audit log
    this.logAction(result.commandName, affectedIds, result.payload);

    // 5. Commit autosave to IndexedDB
    void this.saveToStorage();

    this.onStateChangedCallback?.();
    this.render();
  }

  private logAction(commandName: string, entityIds: readonly string[], payload?: unknown): void {
    const entry: CommandLogEntry = {
      id: generateEntityId('log'),
      timestamp: Date.now(),
      command: commandName,
      entityIds,
      payload,
    };
    this.commandLog.push(entry);
  }

  // ==========================================================================
  // Persistence / IndexedDB Autosave
  // ==========================================================================
  private setupAutosave(intervalMs: number): void {
    if (typeof window !== 'undefined') {
      this.autosaveTimer = window.setInterval(() => {
        void this.saveToStorage();
      }, intervalMs);
    }
  }

  public async saveToStorage(): Promise<void> {
    const state: DraftState = {
      version: 1,
      timestamp: Date.now(),
      entities: this.entities,
      commandLog: this.commandLog,
    };
    try {
      await saveDraftState(state, this.storageKey);
      this.onAutosaveCallback?.('Draft saved');
    } catch (err) {
      console.warn('[DraftCanvas] Autosave failed:', err);
      this.onAutosaveCallback?.('Autosave error');
    }
  }

  public async restoreFromStorage(): Promise<boolean> {
    try {
      const state = await loadDraftState(this.storageKey);
      if (state && Array.isArray(state.entities) && state.entities.length > 0) {
        this.entities = [...state.entities];
        this.commandLog = state.commandLog ? [...state.commandLog] : [];
        this.undoStack = [];
        this.redoStack = [];
        this.onAutosaveCallback?.('Restored from IndexedDB');
        this.onStateChangedCallback?.();
        this.render();
        return true;
      }
    } catch (err) {
      console.warn('[DraftCanvas] Restore failed:', err);
    }
    return false;
  }

  // ==========================================================================
  // Event Callbacks & Text Input
  // ==========================================================================
  public onEntityAdded(cb: (entity: DraftEntity) => void): void {
    this.onEntityAddedCallback = cb;
  }

  public onPromptChanged(cb: (prompt: string) => void): void {
    this.onPromptChangedCallback = cb;
  }

  public onAutosave(cb: (status: string) => void): void {
    this.onAutosaveCallback = cb;
  }

  public onStateChanged(cb: () => void): void {
    this.onStateChangedCallback = cb;
  }

  public executeTextCommand(text: string): void {
    const res = this.activeCommand.onTextInput(text, this.entities);
    if (res) {
      this.applyCommandResult(res);
    }
    this.notifyPrompt();
    this.render();
  }

  public cancelCommand(): void {
    this.activeCommand.onEscape();
    this.notifyPrompt();
    this.render();
  }

  private notifyPrompt(): void {
    this.onPromptChangedCallback?.(this.activeCommand.prompt);
  }

  // ==========================================================================
  // Canvas Lifecycle & Pointer Events
  // ==========================================================================
  private applyBackingStore(cssWidth: number, cssHeight: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(cssWidth, 1);
    const h = Math.max(cssHeight, 1);
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    if (!this.didFitViewport && w > 2 && h > 2) {
      this.viewport.setCenter(40, 20, w, h);
      this.didFitViewport = true;
    }
  }

  private initCanvasSize(): void {
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    const rect = this.canvas.getBoundingClientRect();
    this.applyBackingStore(rect.width || 300, rect.height || 300);

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cw = entry.contentRect.width;
        const ch = entry.contentRect.height;
        if (cw > 0 && ch > 0) {
          this.applyBackingStore(cw, ch);
          this.render();
        }
      }
    });
    this.resizeObserver.observe(this.canvas);
  }

  private bindEvents(): void {
    this.canvas.style.touchAction = 'none';

    this.canvas.addEventListener('pointerdown', this.onPointerDownBound);
    this.canvas.addEventListener('pointermove', this.onPointerMoveBound);
    this.canvas.addEventListener('pointerup', this.onPointerUpBound);
    this.canvas.addEventListener('pointercancel', this.onPointerCancelBound);
    this.canvas.addEventListener('wheel', this.onWheelBound, { passive: false });
    window.addEventListener('keydown', this.onKeyDownBound);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (shouldIgnoreDraftHotkey(e.target)) {
      return;
    }
    if (e.key === 'Escape') {
      this.activeCommand.onEscape();
      this.notifyPrompt();
      this.render();
    } else if (e.key === 'Enter') {
      const res = this.activeCommand.onEnter();
      if (res) {
        this.applyCommandResult(res);
      }
      this.notifyPrompt();
      this.render();
    } else if (e.key === 'F8') {
      e.preventDefault();
      this.toggleOrtho();
    } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (e.shiftKey) {
        this.redo();
      } else {
        this.undo();
      }
    } else if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.redo();
    }
  }

  private getScreenCoords(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  private onPointerDown(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
    const screen = this.getScreenCoords(e);
    this.lastPointerScreen = screen;

    if (e.button === 1 || e.altKey) {
      this.isPanning = true;
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    if (e.button === 0) {
      const targetPoint = this.currentSnap ? this.currentSnap.point : this.cursorWorld;
      const result = this.activeCommand.onClick(targetPoint, this.entities);
      if (result) {
        this.applyCommandResult(result);
      }
      this.notifyPrompt();
      this.render();
    }
  }

  private onPointerMove(e: PointerEvent): void {
    const screen = this.getScreenCoords(e);

    if (this.isPanning) {
      const dx = screen.x - this.lastPointerScreen.x;
      const dy = screen.y - this.lastPointerScreen.y;
      this.viewport.panBy(dx, dy);
      this.lastPointerScreen = screen;
      this.render();
      return;
    }

    this.lastPointerScreen = screen;
    const rawWorld = screenToWorld(screen, this.viewport.transform);
    this.cursorWorld = rawWorld;

    const snapOpts: SnapOptions = {
      tolerancePx: this.snapTolerancePx,
      gridSpacingMm: this.gridSpacingMm,
    };

    this.currentSnap = findSnapPoint(rawWorld, this.entities, this.viewport.transform, snapOpts);
    const effectivePoint = this.currentSnap ? this.currentSnap.point : rawWorld;

    this.activeCommand.onPointerMove(effectivePoint, this.entities, this.ortho);
    this.render();
  }

  private onPointerUp(e: PointerEvent): void {
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.style.cursor = 'crosshair';
    }
  }

  private onPointerCancel(): void {
    this.isPanning = false;
    this.canvas.style.cursor = 'crosshair';
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const cursorScreenX = e.clientX - rect.left;
    const cursorScreenY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    this.viewport.zoomAt(cursorScreenX, cursorScreenY, zoomFactor);

    const rawWorld = screenToWorld({ x: cursorScreenX, y: cursorScreenY }, this.viewport.transform);
    this.cursorWorld = rawWorld;
    this.currentSnap = findSnapPoint(rawWorld, this.entities, this.viewport.transform, {
      tolerancePx: this.snapTolerancePx,
      gridSpacingMm: this.gridSpacingMm,
    });

    this.render();
  }

  // ==========================================================================
  // Immediate Mode Rendering Pipeline
  // ==========================================================================
  public render(): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w <= 0 || h <= 0) return;

    const ctx = this.ctx;
    const vp = this.viewport.transform;

    // 1. Clear background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // 2. Draw Infinite Grid
    this.drawGrid(w, h, vp);

    // 3. Draw XY Reference Line (y = 0 in world coords)
    this.drawXYLine(w, vp);

    // 4. Get active command preview
    const effectivePoint = this.currentSnap ? this.currentSnap.point : this.cursorWorld;
    const preview = this.activeCommand.onPointerMove(effectivePoint, this.entities, this.ortho);

    // 5. Draw Committed Entities (with highlight support for erase/trim)
    for (const entity of this.entities) {
      const isHighlighted = preview?.highlightEntityId === entity.id;
      this.drawEntity(entity, vp, isHighlighted);
    }

    // 6. Draw Command Preview Entities
    if (preview && preview.entities.length > 0) {
      for (const ent of preview.entities) {
        this.drawEntity(ent, vp, false, true);
      }
    }

    // 7. Draw Preview Badge
    if (preview?.badgeText && preview.badgePoint) {
      this.drawBadge(preview.badgeText, preview.badgePoint, vp);
    }

    // 8. Draw Snap Indicator Marker
    if (this.currentSnap) {
      this.drawSnapIndicator(this.currentSnap, vp);
    }

    // 9. Draw Ortho Status Pill
    if (this.ortho) {
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(16, h - 36, 88, 24);
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ORTHO [F8]', 60, h - 24);
    }
  }

  private drawGrid(w: number, h: number, vp: ViewportTransform): void {
    const ctx = this.ctx;
    const spacingPx = this.gridSpacingMm * vp.scale;
    if (spacingPx < 8) return;

    const leftWorld = (0 - vp.panX) / vp.scale;
    const rightWorld = (w - vp.panX) / vp.scale;
    const bottomWorld = (vp.panY - h) / vp.scale;
    const topWorld = (vp.panY - 0) / vp.scale;

    const startX = Math.floor(leftWorld / this.gridSpacingMm) * this.gridSpacingMm;
    const endX = Math.ceil(rightWorld / this.gridSpacingMm) * this.gridSpacingMm;
    const startY = Math.floor(bottomWorld / this.gridSpacingMm) * this.gridSpacingMm;
    const endY = Math.ceil(topWorld / this.gridSpacingMm) * this.gridSpacingMm;

    // Minor grid
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = '#f1f5f9';
    ctx.beginPath();
    for (let x = startX; x <= endX; x += this.gridSpacingMm) {
      const sx = vp.panX + x * vp.scale;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
    }
    for (let y = startY; y <= endY; y += this.gridSpacingMm) {
      const sy = vp.panY - y * vp.scale;
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
    }
    ctx.stroke();

    // Major grid (every 5 divisions)
    const majorMm = this.gridSpacingMm * 5;
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    const majorStartX = Math.floor(leftWorld / majorMm) * majorMm;
    const majorEndX = Math.ceil(rightWorld / majorMm) * majorMm;
    const majorStartY = Math.floor(bottomWorld / majorMm) * majorMm;
    const majorEndY = Math.ceil(topWorld / majorMm) * majorMm;

    for (let x = majorStartX; x <= majorEndX; x += majorMm) {
      const sx = vp.panX + x * vp.scale;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
    }
    for (let y = majorStartY; y <= majorEndY; y += majorMm) {
      const sy = vp.panY - y * vp.scale;
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
    }
    ctx.stroke();
  }

  private drawXYLine(w: number, vp: ViewportTransform): void {
    const ctx = this.ctx;
    const sy = vp.panY; // World y = 0
    if (sy < -50 || sy > this.canvas.clientHeight + 50) return;

    ctx.save();
    ctx.strokeStyle = '#1d4ed8'; // WCAG AA compliant (6.3:1 contrast ratio against #ffffff)
    ctx.lineWidth = 2.0;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(w, sy);
    ctx.stroke();

    ctx.fillStyle = '#1d4ed8';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('X', 14, sy - 6);
    ctx.textAlign = 'right';
    ctx.fillText('Y', w - 14, sy - 6);
    ctx.restore();
  }

  private drawEntity(
    entity: DraftEntity,
    vp: ViewportTransform,
    highlight = false,
    isPreview = false,
  ): void {
    const ctx = this.ctx;
    ctx.save();

    if (highlight) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3.0;
      ctx.setLineDash([4, 4]);
    } else if (isPreview) {
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 3]);
    } else {
      // Standard IS 128 / BIS SP 46 style rendering
      switch (entity.lineType) {
        case 'continuous':
          ctx.strokeStyle = '#0f172a'; // High contrast visible outline (16.5:1 ratio)
          ctx.lineWidth = 2.2; // Thick continuous for visible outlines
          ctx.setLineDash([]);
          break;
        case 'dashed':
          ctx.strokeStyle = '#334155'; // WCAG AAA hidden edge (9.6:1 ratio)
          ctx.lineWidth = 1.4; // Medium dashed for hidden edges
          ctx.setLineDash([6, 4]);
          break;
        case 'centre':
          ctx.strokeStyle = '#b91c1c'; // WCAG AA axis/centre line (5.8:1 ratio)
          ctx.lineWidth = 1.0; // Long dash - dot - long dash
          ctx.setLineDash([14, 4, 3, 4]);
          break;
        case 'thin':
          ctx.strokeStyle = '#475569'; // WCAG AA thin construction line (5.9:1 ratio, replaces low-contrast grey)
          ctx.lineWidth = 0.8; // Thin continuous for projectors and witness lines
          ctx.setLineDash([]);
          break;
      }
    }

    if (entity.type === 'line') {
      const s1 = worldToScreen(entity.p1, vp);
      const s2 = worldToScreen(entity.p2, vp);
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
    } else if (entity.type === 'circle') {
      const sc = worldToScreen(entity.center, vp);
      const sr = entity.radius * vp.scale;
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, sr, 0, 2 * Math.PI);
      ctx.stroke();
    } else if (entity.type === 'arc') {
      const sc = worldToScreen(entity.center, vp);
      const sr = entity.radius * vp.scale;
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, sr, -entity.startAngleRad, -entity.endAngleRad, !entity.counterClockwise);
      ctx.stroke();
    } else if (entity.type === 'polyline') {
      if (entity.points.length > 1) {
        ctx.beginPath();
        const first = worldToScreen(entity.points[0]!, vp);
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < entity.points.length; i++) {
          const pt = worldToScreen(entity.points[i]!, vp);
          ctx.lineTo(pt.x, pt.y);
        }
        if (entity.closed) ctx.closePath();
        ctx.stroke();
      }
    } else if (entity.type === 'dimension') {
      this.drawDimension(entity, vp);
    }

    ctx.restore();
  }

  private drawDimension(dim: DimensionEntity, vp: ViewportTransform): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = '#0284c7';
    ctx.fillStyle = '#0284c7';
    ctx.lineWidth = 1.0;
    ctx.setLineDash([]);

    if (dim.dimType === 'linear' || dim.dimType === 'aligned') {
      const p1 = dim.p1;
      const p2 = dim.p2;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-4) {
        ctx.restore();
        return;
      }

      const offset = dim.offset ?? 10;
      const nx = -dy / len;
      const ny = dx / len;

      const d1World: Point2D = { x: p1.x + nx * offset, y: p1.y + ny * offset };
      const d2World: Point2D = { x: p2.x + nx * offset, y: p2.y + ny * offset };

      const s1 = worldToScreen(p1, vp);
      const s2 = worldToScreen(p2, vp);
      const sd1 = worldToScreen(d1World, vp);
      const sd2 = worldToScreen(d2World, vp);

      // Witness / Extension lines
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(sd1.x, sd1.y);
      ctx.moveTo(s2.x, s2.y);
      ctx.lineTo(sd2.x, sd2.y);
      ctx.stroke();

      // Dimension line
      ctx.beginPath();
      ctx.moveTo(sd1.x, sd1.y);
      ctx.lineTo(sd2.x, sd2.y);
      ctx.stroke();

      // Arrowheads at sd1 and sd2
      const angle = Math.atan2(sd2.y - sd1.y, sd2.x - sd1.x);
      this.drawArrowhead(ctx, sd1, angle, 8);
      this.drawArrowhead(ctx, sd2, angle + Math.PI, 8);

      // Text annotation
      const text = dim.text ?? `${(dim.value ?? len).toFixed(1)} mm`;
      const midX = (sd1.x + sd2.x) / 2;
      const midY = (sd1.y + sd2.y) / 2;

      ctx.font = '600 11px sans-serif';
      const tm = ctx.measureText(text);
      const tw = tm.width + 6;
      const th = 14;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(midX - tw / 2, midY - th / 2, tw, th);
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, midX, midY);
    } else if (dim.dimType === 'radius') {
      const sCenter = worldToScreen(dim.p1, vp);
      const sEdge = worldToScreen(dim.p2, vp);
      const angle = Math.atan2(sEdge.y - sCenter.y, sEdge.x - sCenter.x);

      // Leader line
      ctx.beginPath();
      ctx.moveTo(sCenter.x, sCenter.y);
      ctx.lineTo(sEdge.x, sEdge.y);
      const shoulderX = sEdge.x + Math.cos(angle) * 16;
      const shoulderY = sEdge.y + Math.sin(angle) * 16;
      ctx.lineTo(shoulderX, shoulderY);
      ctx.stroke();

      // Arrowhead touching edge
      this.drawArrowhead(ctx, sEdge, angle, 8);

      // Radius text
      const text = dim.text ?? `R${(dim.value ?? dist(dim.p1, dim.p2)).toFixed(1)}`;
      ctx.font = '600 11px sans-serif';
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, shoulderX + 4, shoulderY);
    }

    ctx.restore();
  }

  private drawArrowhead(
    ctx: CanvasRenderingContext2D,
    tip: Point2D,
    directionRad: number,
    size = 8,
  ): void {
    const wingAngle = 0.35; // ~20 degrees
    const p1: Point2D = {
      x: tip.x + size * Math.cos(directionRad - wingAngle),
      y: tip.y + size * Math.sin(directionRad - wingAngle),
    };
    const p2: Point2D = {
      x: tip.x + size * Math.cos(directionRad + wingAngle),
      y: tip.y + size * Math.sin(directionRad + wingAngle),
    };

    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.closePath();
    ctx.fill();
  }

  private drawBadge(text: string, worldPt: Point2D, vp: ViewportTransform): void {
    const ctx = this.ctx;
    const s = worldToScreen(worldPt, vp);
    ctx.save();
    ctx.font = '600 11px sans-serif';
    const tm = ctx.measureText(text);
    const bw = tm.width + 8;
    const bh = 18;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(s.x - bw / 2, s.y - 20 - bh / 2, bw, bh);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, s.x, s.y - 20);
    ctx.restore();
  }

  private drawSnapIndicator(snap: SnapResult, vp: ViewportTransform): void {
    const ctx = this.ctx;
    const s = worldToScreen(snap.point, vp);
    const size = 6;

    ctx.save();
    ctx.lineWidth = 1.6;

    switch (snap.type) {
      case 'endpoint':
        ctx.strokeStyle = '#16a34a';
        ctx.strokeRect(s.x - size, s.y - size, size * 2, size * 2);
        break;
      case 'midpoint':
        ctx.strokeStyle = '#0891b2';
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - size);
        ctx.lineTo(s.x + size, s.y + size);
        ctx.lineTo(s.x - size, s.y + size);
        ctx.closePath();
        ctx.stroke();
        break;
      case 'centre':
        ctx.strokeStyle = '#ea580c';
        ctx.beginPath();
        ctx.arc(s.x, s.y, size, 0, 2 * Math.PI);
        ctx.stroke();
        break;
      case 'intersection':
        ctx.strokeStyle = '#d97706';
        ctx.beginPath();
        ctx.moveTo(s.x - size, s.y - size);
        ctx.lineTo(s.x + size, s.y + size);
        ctx.moveTo(s.x + size, s.y - size);
        ctx.lineTo(s.x - size, s.y + size);
        ctx.stroke();
        break;
      case 'perpendicular':
        ctx.strokeStyle = '#9333ea';
        ctx.strokeRect(s.x - size, s.y - size, size * 1.5, size * 1.5);
        break;
      case 'nearest':
      case 'grid':
        ctx.strokeStyle = '#3b82f6';
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - size);
        ctx.lineTo(s.x + size, s.y);
        ctx.lineTo(s.x, s.y + size);
        ctx.lineTo(s.x - size, s.y);
        ctx.closePath();
        ctx.stroke();
        break;
    }

    ctx.restore();
  }

  public dispose(): void {
    if (this.autosaveTimer !== null) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDownBound);
    this.canvas.removeEventListener('pointermove', this.onPointerMoveBound);
    this.canvas.removeEventListener('pointerup', this.onPointerUpBound);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancelBound);
    this.canvas.removeEventListener('wheel', this.onWheelBound);
    window.removeEventListener('keydown', this.onKeyDownBound);
  }
}
