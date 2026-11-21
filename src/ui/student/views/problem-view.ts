import { DraftCanvas, type ToolType } from '../../../draft/canvas';
import type { DraftEntity, LineType } from '../../../draft/types';
import type { CheckFeedback, ProblemState, StudentProfile } from '../types';
import { renderCheckDrawer } from './check-drawer';
import { renderSubmitModal } from './submit-modal';

export interface ProblemViewOptions {
  readonly student: StudentProfile;
  readonly problemState: ProblemState;
  readonly isOnline: boolean;
  readonly timeSpentSec: number;
  readonly checkFeedback: CheckFeedback | null;
  readonly onBackToAssignments: () => void;
  readonly onCheck: (entities: readonly DraftEntity[]) => Promise<void>;
  readonly onSubmit: (entities: readonly DraftEntity[], commandLog: readonly unknown[], timeSpentSec: number) => Promise<void>;
}

export class ProblemView {
  private container: HTMLElement;
  private options: ProblemViewOptions;
  private canvasEngine: DraftCanvas | null = null;
  private drawerContainer: HTMLElement | null = null;
  private modalContainer: HTMLElement | null = null;
  private keyListener: ((e: KeyboardEvent) => void) | null = null;

  constructor(container: HTMLElement, options: ProblemViewOptions) {
    this.container = container;
    this.options = options;
    this.render();
  }

  public updateTime(timeSpentSec: number): void {
    const el = this.container.querySelector('#timer-display');
    if (el) {
      const mins = Math.floor(timeSpentSec / 60);
      const secs = timeSpentSec % 60;
      el.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
  }

  public updateOnlineStatus(isOnline: boolean): void {
    const el = this.container.querySelector('#status-connection');
    if (el) {
      el.className = `badge badge-${isOnline ? 'success' : 'danger'}`;
      el.textContent = isOnline ? 'Online' : 'Offline (Draft Saved Locally)';
    }
  }

  public setCheckFeedback(feedback: CheckFeedback | null): void {
    if (feedback && this.drawerContainer) {
      renderCheckDrawer(this.drawerContainer, {
        feedback,
        onClose: () => {
          if (this.drawerContainer) this.drawerContainer.innerHTML = '';
        },
      });
    }
  }

  private render(): void {
    const { problemState, isOnline, timeSpentSec } = this.options;
    const problem = problemState.problem;
    const mins = Math.floor(timeSpentSec / 60);
    const secs = timeSpentSec % 60;
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    this.container.innerHTML = `
      <div class="problem-workspace">
        <!-- Top Navigation / Problem Statement Bar -->
        <header class="problem-topbar" role="banner">
          <div class="topbar-left">
            <button id="btn-back-assignments" class="btn btn-outline btn-sm" aria-label="Back to assignments list">
              ← Assignments
            </button>
            <div class="problem-title-group">
              <h1 class="badge badge-topic" style="margin: 0; font-size: 0.8125rem;">${problem.topic.replace(/_/g, ' ')}</h1>
              <span class="attempt-badge" role="text">Attempt #${problem.attemptNo}</span>
            </div>
          </div>

          <div class="topbar-center" role="region" aria-label="Problem statement and required views">
            <div class="problem-statement-text" id="problem-statement" tabindex="0">
              ${problem.statement}
            </div>
            <div class="param-chips" id="param-chips" aria-label="Problem parameters">
              ${Object.entries(problem.publicParams)
                .map(([k, v]) => `<span class="param-chip" role="text"><strong>${k}:</strong> ${v}</span>`)
                .join('')}
              ${problem.viewsRequired.map((v) => `<span class="view-chip" role="text">${v.replace(/_/g, ' ')}</span>`).join('')}
            </div>
          </div>

          <div class="topbar-right">
            <div class="session-status-cluster" role="status" aria-label="Session telemetry">
              <span id="status-connection" class="badge badge-${isOnline ? 'success' : 'danger'}" aria-label="Network status">
                ${isOnline ? 'Online' : 'Offline'}
              </span>
              <span id="status-autosave" class="badge badge-neutral" aria-label="Autosave status">Autosaving to IndexedDB</span>
              <span id="timer-display" class="timer-box" aria-label="Elapsed session timer">${timeStr}</span>
            </div>
            <div class="action-buttons-group" role="toolbar" aria-label="Grading actions">
              <button id="btn-check-work" class="btn btn-secondary" aria-label="Check My Work — request pedagogical hints">
                🔍 Check My Work
              </button>
              <button id="btn-submit-drawing" class="btn btn-primary" aria-label="Submit Drawing for final evaluation">
                ✓ Submit Drawing
              </button>
            </div>
          </div>
        </header>

        <!-- Main Workspace: Tool Palette + Canvas -->
        <div class="problem-body">
          <!-- Left Tool Palette -->
          <aside class="tool-palette" id="tool-palette" role="region" aria-label="Drafting tool palette">
            <div class="palette-section-title" id="heading-tools">Drafting Tools</div>
            <div class="tool-buttons-grid" role="toolbar" aria-labelledby="heading-tools">
              <button class="tool-btn active" id="tool-line" title="Straight Line (L)" aria-label="Straight Line tool (Shortcut: L)" aria-keyshortcuts="L" aria-pressed="true">Straight Line</button>
              <button class="tool-btn" id="tool-circle-cr" title="Circle Center-Radius (C)" aria-label="Circle Center-Radius tool (Shortcut: C)" aria-keyshortcuts="C" aria-pressed="false">Circle (C-R)</button>
              <button class="tool-btn" id="tool-circle-2p" title="Circle 2-Point" aria-label="Circle 2-Point tool" aria-pressed="false">Circle (2-Pt)</button>
              <button class="tool-btn" id="tool-arc-3p" title="Arc 3-Point (A)" aria-label="Arc 3-Point tool (Shortcut: A)" aria-keyshortcuts="A" aria-pressed="false">Arc (3-Pt)</button>
              <button class="tool-btn" id="tool-arc-cse" title="Arc Center-Start-End" aria-label="Arc Center-Start-End tool" aria-pressed="false">Arc (C-S-E)</button>
              <button class="tool-btn" id="tool-polyline" title="Polyline" aria-label="Polyline tool" aria-pressed="false">Polyline</button>
              <button class="tool-btn" id="tool-projector" title="Vertical Projector (P)" aria-label="Projector Line (Vertical Projector P)" aria-keyshortcuts="P" aria-pressed="false">Projector Line</button>
              <button class="tool-btn" id="tool-dim-linear" title="Linear Dimension (D)" aria-label="Linear Dimension tool (Shortcut: D)" aria-keyshortcuts="D" aria-pressed="false">Dimension</button>
              <button class="tool-btn" id="tool-trim" title="Trim" aria-label="Trim Line tool" aria-pressed="false">Trim Line</button>
              <button class="tool-btn" id="tool-offset" title="Offset" aria-label="Offset Line tool" aria-pressed="false">Offset Line</button>
              <button class="tool-btn" id="tool-erase" title="Erase (E)" aria-label="Erase tool (Shortcut: E)" aria-keyshortcuts="E" aria-pressed="false">Erase</button>
            </div>

            <div class="palette-section-title" id="heading-styles">Line Style</div>
            <div class="line-style-picker" role="toolbar" aria-labelledby="heading-styles">
              <button class="style-btn active" id="btn-style-continuous" data-style="continuous" aria-label="Line style: Visible Outline Continuous" aria-pressed="true">
                <span class="line-preview preview-continuous" aria-hidden="true"></span>
                <span>Visible Outline</span>
              </button>
              <button class="style-btn" id="btn-style-dashed" data-style="dashed" aria-label="Line style: Hidden Edge Dashed" aria-pressed="false">
                <span class="line-preview preview-dashed" aria-hidden="true"></span>
                <span>Hidden Edge</span>
              </button>
              <button class="style-btn" id="btn-style-center" data-style="centre" aria-label="Axis / Centre line style" aria-pressed="false">
                <span class="line-preview preview-center" aria-hidden="true"></span>
                <span>Axis / Centre</span>
              </button>
              <button class="style-btn" id="btn-style-thin" data-style="thin" aria-label="Construction Line thin style" aria-pressed="false">
                <span class="line-preview preview-thin" aria-hidden="true"></span>
                <span>Construction Line</span>
              </button>
            </div>

            <div class="palette-section-title" id="heading-constraints">Constraints & Actions</div>
            <div class="controls-grid" role="toolbar" aria-labelledby="heading-constraints">
              <button class="ctrl-btn" id="btn-ortho-toggle" title="Toggle Ortho Constraint (F8)" aria-keyshortcuts="F8" aria-pressed="false">
                Ortho: <strong id="ortho-status">OFF</strong>
              </button>
              <button class="ctrl-btn" id="btn-undo" title="Undo (Ctrl+Z)" aria-label="Undo previous action (Shortcut: Ctrl+Z)" aria-keyshortcuts="Control+Z">↶ Undo</button>
              <button class="ctrl-btn" id="btn-redo" title="Redo (Ctrl+Y)" aria-label="Redo previous action (Shortcut: Ctrl+Y)" aria-keyshortcuts="Control+Y">↷ Redo</button>
              <button class="ctrl-btn" id="btn-clear-canvas" title="Clear Canvas" aria-label="Clear all canvas drawing entities">🗑 Clear</button>
            </div>
          </aside>

          <!-- Central Canvas Viewport with Sheet Border -->
          <main class="canvas-container" id="canvas-container" role="main" aria-label="Drafting canvas area">
            <div class="sheet-frame-indicator" role="status">
              <span>Standard A2 Projection Sheet · Reference Line XY at Y = 0</span>
              <span id="canvas-entity-count" aria-live="polite">Entities: 0</span>
            </div>
            <canvas id="student-draft-canvas" class="draft-canvas" role="application" aria-label="Orthographic drawing sheet canvas" tabindex="0"></canvas>
            <div class="status-bar-bottom" role="region" aria-label="Command bar status">
              <span id="command-prompt" class="command-prompt-text" role="status" aria-live="polite">Click to specify start point</span>
              <input
                type="text"
                id="command-input-bar"
                class="command-input-bar"
                aria-label="CAD Command and Coordinate input prompt"
                placeholder="Type coordinate or command (e.g. 50,40 or Enter) and press Enter"
              />
            </div>
          </main>
        </div>

        <!-- Check Feedback Drawer Container -->
        <div id="drawer-container"></div>
        <!-- Submit Confirmation Modal Container -->
        <div id="modal-container"></div>
      </div>
    `;

    this.drawerContainer = this.container.querySelector('#drawer-container');
    this.modalContainer = this.container.querySelector('#modal-container');

    this.initCanvasEngine();
    this.bindEvents();
  }

  private initCanvasEngine(): void {
    const canvasEl = this.container.querySelector('#student-draft-canvas') as HTMLCanvasElement;
    if (!canvasEl) return;

    this.canvasEngine = new DraftCanvas(canvasEl, {
      initialLineType: 'continuous',
      gridSpacingMm: 10,
      snapTolerancePx: 12,
      ortho: false,
    });

    const countEl = this.container.querySelector('#canvas-entity-count');
    const promptEl = this.container.querySelector('#command-prompt');
    const autosaveEl = this.container.querySelector('#status-autosave');

    this.canvasEngine.onStateChanged(() => {
      if (countEl) {
        countEl.textContent = `Entities: ${this.canvasEngine?.getEntities().length ?? 0}`;
      }
    });

    this.canvasEngine.onPromptChanged((p: string) => {
      if (promptEl) promptEl.textContent = p;
    });

    this.canvasEngine.onAutosave((status: string) => {
      if (autosaveEl) autosaveEl.textContent = status;
    });

    // Provide initial default XY reference line so student has immediate reference line
    const existingEntities = this.canvasEngine.getEntities();
    if (existingEntities.length === 0) {
      this.canvasEngine.addEntity({
        id: 'xy_reference_line',
        type: 'line',
        p1: { x: 0, y: 0 },
        p2: { x: 200, y: 0 },
        lineType: 'thin',
      });
    }

    if (countEl) {
      countEl.textContent = `Entities: ${this.canvasEngine.getEntities().length}`;
    }
  }

  private bindEvents(): void {
    this.container.querySelector('#btn-back-assignments')?.addEventListener('click', this.options.onBackToAssignments);

    // Tools
    const tools: Array<{ id: string; tool: ToolType }> = [
      { id: 'tool-line', tool: 'line' },
      { id: 'tool-circle-cr', tool: 'circle-cr' },
      { id: 'tool-circle-2p', tool: 'circle-2p' },
      { id: 'tool-arc-3p', tool: 'arc-3p' },
      { id: 'tool-arc-cse', tool: 'arc-cse' },
      { id: 'tool-polyline', tool: 'polyline' },
      { id: 'tool-projector', tool: 'projector' },
      { id: 'tool-dim-linear', tool: 'dim-linear' },
      { id: 'tool-trim', tool: 'trim' },
      { id: 'tool-offset', tool: 'offset' },
      { id: 'tool-erase', tool: 'erase' },
    ];

    tools.forEach(({ id, tool }) => {
      const btn = this.container.querySelector(`#${id}`);
      btn?.addEventListener('click', () => {
        this.container.querySelectorAll('.tool-btn').forEach((b) => {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        this.canvasEngine?.setTool(tool);
      });
    });

    // Line Styles
    const styles: Array<{ id: string; style: LineType }> = [
      { id: 'btn-style-continuous', style: 'continuous' },
      { id: 'btn-style-dashed', style: 'dashed' },
      { id: 'btn-style-center', style: 'centre' },
      { id: 'btn-style-thin', style: 'thin' },
    ];

    styles.forEach(({ id, style }) => {
      const btn = this.container.querySelector(`#${id}`);
      btn?.addEventListener('click', () => {
        this.container.querySelectorAll('.style-btn').forEach((b) => {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        this.canvasEngine?.setLineType(style);
      });
    });

    // Ortho Toggle
    const orthoBtn = this.container.querySelector('#btn-ortho-toggle');
    const orthoStatus = this.container.querySelector('#ortho-status');
    orthoBtn?.addEventListener('click', () => {
      const state = this.canvasEngine?.toggleOrtho() ?? false;
      if (orthoStatus) orthoStatus.textContent = state ? 'ON' : 'OFF';
      orthoBtn.setAttribute('aria-pressed', state ? 'true' : 'false');
    });

    // Undo / Redo
    this.container.querySelector('#btn-undo')?.addEventListener('click', () => this.canvasEngine?.undo());
    this.container.querySelector('#btn-redo')?.addEventListener('click', () => this.canvasEngine?.redo());
    this.container.querySelector('#btn-clear-canvas')?.addEventListener('click', () => this.canvasEngine?.clearEntities());

    // Command Bar Input
    const commandInput = this.container.querySelector('#command-input-bar') as HTMLInputElement | null;
    commandInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const text = commandInput.value.trim();
        if (text) {
          this.canvasEngine?.executeTextCommand(text);
          commandInput.value = '';
        }
      }
    });

    // Check My Work
    this.container.querySelector('#btn-check-work')?.addEventListener('click', async () => {
      if (!this.canvasEngine) return;
      const entities = this.canvasEngine.getEntities();
      await this.options.onCheck(entities);
    });

    // Submit Drawing with Modal
    this.container.querySelector('#btn-submit-drawing')?.addEventListener('click', () => {
      if (!this.canvasEngine || !this.modalContainer) return;
      const entities = this.canvasEngine.getEntities();
      const commandLog = this.canvasEngine.getCommandLog();

      renderSubmitModal(this.modalContainer, {
        entityCount: entities.length,
        timeSpentSec: this.options.timeSpentSec,
        onCancel: () => {
          if (this.modalContainer) this.modalContainer.innerHTML = '';
        },
        onConfirm: async () => {
          if (this.modalContainer) this.modalContainer.innerHTML = '';
          await this.options.onSubmit(entities, commandLog, this.options.timeSpentSec);
        },
      });
    });
    // Accessible keyboard shortcuts
    const onKeyDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toUpperCase();
      let toolId: string | null = null;
      if (key === 'L') toolId = 'tool-line';
      else if (key === 'C') toolId = 'tool-circle-cr';
      else if (key === 'A') toolId = 'tool-arc-3p';
      else if (key === 'P') toolId = 'tool-projector';
      else if (key === 'D') toolId = 'tool-dim-linear';
      else if (key === 'E') toolId = 'tool-erase';

      if (toolId) {
        const btn = this.container.querySelector<HTMLButtonElement>(`#${toolId}`);
        btn?.click();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    this.keyListener = onKeyDown;
  }

  public getEntities(): readonly DraftEntity[] {
    return this.canvasEngine?.getEntities() ?? [];
  }

  public dispose(): void {
    if (this.keyListener) {
      window.removeEventListener('keydown', this.keyListener);
      this.keyListener = null;
    }
    this.canvasEngine?.dispose();
  }
}
