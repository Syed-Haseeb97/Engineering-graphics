import { DraftCanvas, ToolType } from '../../draft/canvas';
import type { LineType } from '../../draft/types';

export class DraftApp {
  private canvasEngine: DraftCanvas;
  private canvasEl: HTMLCanvasElement;
  private promptEl: HTMLElement | null;
  private autosaveEl: HTMLElement | null;
  private entityCountEl: HTMLElement | null;
  private commandInputEl: HTMLInputElement | null;

  constructor() {
    const canvas = document.getElementById('draft-canvas') as HTMLCanvasElement | null;
    if (!canvas) {
      throw new Error('Canvas element #draft-canvas not found in DOM.');
    }
    this.canvasEl = canvas;

    this.promptEl = document.getElementById('status-prompt');
    this.autosaveEl = document.getElementById('status-autosave');
    this.entityCountEl = document.getElementById('status-entities');
    this.commandInputEl = document.getElementById('input-command-bar') as HTMLInputElement | null;

    this.canvasEngine = new DraftCanvas(this.canvasEl, {
      initialLineType: 'continuous',
      gridSpacingMm: 10,
      snapTolerancePx: 12,
      ortho: false,
    });

    this.bindUI();
    this.initAsync();
  }

  private async initAsync(): Promise<void> {
    const restored = await this.canvasEngine.restoreFromStorage();
    if (restored) {
      this.updateEntityCount();
      if (this.autosaveEl) {
        this.autosaveEl.textContent = 'Restored from IndexedDB';
      }
    }
  }

  private bindUI(): void {
    // 1. Tool selection buttons
    const toolButtons: Array<{ id: string; tool: ToolType }> = [
      { id: 'tool-line', tool: 'line' },
      { id: 'tool-circle-cr', tool: 'circle-cr' },
      { id: 'tool-circle-2p', tool: 'circle-2p' },
      { id: 'tool-arc-3p', tool: 'arc-3p' },
      { id: 'tool-arc-cse', tool: 'arc-cse' },
      { id: 'tool-polyline', tool: 'polyline' },
      { id: 'tool-projector', tool: 'projector' },
      { id: 'tool-dim-linear', tool: 'dim-linear' },
      { id: 'tool-dim-radius', tool: 'dim-radius' },
      { id: 'tool-move', tool: 'move' },
      { id: 'tool-copy', tool: 'copy' },
      { id: 'tool-trim', tool: 'trim' },
      { id: 'tool-offset', tool: 'offset' },
      { id: 'tool-erase', tool: 'erase' },
    ];

    for (const { id, tool } of toolButtons) {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', () => {
          this.setActiveToolButton(id);
          this.canvasEngine.setTool(tool);
        });
      }
    }

    // 2. Line type picker
    const lineTypeSelect = document.getElementById('select-line-type') as HTMLSelectElement | null;
    if (lineTypeSelect) {
      lineTypeSelect.addEventListener('change', () => {
        const val = lineTypeSelect.value as LineType;
        this.canvasEngine.setLineType(val);
      });
    }

    // 3. Ortho toggle
    const btnOrtho = document.getElementById('btn-ortho');
    if (btnOrtho) {
      btnOrtho.addEventListener('click', () => {
        const isOrtho = this.canvasEngine.toggleOrtho();
        btnOrtho.classList.toggle('active', isOrtho);
      });
    }

    // 4. Undo / Redo
    const btnUndo = document.getElementById('btn-undo');
    if (btnUndo) {
      btnUndo.addEventListener('click', () => {
        this.canvasEngine.undo();
        this.updateEntityCount();
      });
    }

    const btnRedo = document.getElementById('btn-redo');
    if (btnRedo) {
      btnRedo.addEventListener('click', () => {
        this.canvasEngine.redo();
        this.updateEntityCount();
      });
    }

    // 5. Clear Canvas
    const btnClear = document.getElementById('btn-clear');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if (confirm('Clear entire drafting sheet?')) {
          this.canvasEngine.clearEntities();
          this.updateEntityCount();
        }
      });
    }

    // 6. Export Command Log JSON
    const btnExportLog = document.getElementById('btn-export-log');
    if (btnExportLog) {
      btnExportLog.addEventListener('click', () => {
        const json = this.canvasEngine.exportCommandLogJSON();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `draft_session_log_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    // 7. Command text bar input
    const commandForm = document.getElementById('form-command') as HTMLFormElement | null;
    if (commandForm && this.commandInputEl) {
      commandForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = this.commandInputEl?.value ?? '';
        if (text) {
          this.canvasEngine.executeTextCommand(text);
          this.commandInputEl!.value = '';
          this.updateEntityCount();
        }
      });
    }

    // Engine callbacks
    this.canvasEngine.onPromptChanged((prompt) => {
      if (this.promptEl) {
        this.promptEl.textContent = prompt;
      }
    });

    this.canvasEngine.onAutosave((status) => {
      if (this.autosaveEl) {
        this.autosaveEl.textContent = `${status} (${new Date().toLocaleTimeString()})`;
      }
    });

    this.canvasEngine.onStateChanged(() => {
      this.updateEntityCount();
    });

    this.canvasEngine.onEntityAdded(() => {
      this.updateEntityCount();
    });
  }

  private setActiveToolButton(activeId: string): void {
    const buttons = document.querySelectorAll('.tool-btn');
    buttons.forEach((b) => b.classList.remove('active'));
    document.getElementById(activeId)?.classList.add('active');
  }

  private updateEntityCount(): void {
    if (this.entityCountEl) {
      const count = this.canvasEngine.getEntities().length;
      this.entityCountEl.textContent = `${count} entities`;
    }
  }

  public get engine(): DraftCanvas {
    return this.canvasEngine;
  }
}

// Auto-instantiate on page load
function mountDraftApp() {
  const target = window as unknown as { __draftApp?: DraftApp };
  if (!target.__draftApp) {
    target.__draftApp = new DraftApp();
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', mountDraftApp);
  } else {
    mountDraftApp();
  }
}
