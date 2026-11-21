import { OcctWorkerClient } from '../../kernel/worker/client';
import type { ComputeResult, PlacementConfig, SolidConfig } from '../../kernel/worker/types';
import { Inspector3D, type InspectorView } from './inspector3d';
import { ProjectionSheet2D } from './sheet2d';
import { exportStageToSvg } from './svg-export';
import './viewer.css';

export class TeachingViewerApp {
  private client: OcctWorkerClient;
  private inspector3D: Inspector3D | null = null;
  private sheet2D: ProjectionSheet2D | null = null;
  private computeResult: ComputeResult | null = null;
  private currentStageIndex = 0; // 0: Stage 1, 1: Stage 2, 2: Stage 3
  private isComputing = false;
  private pendingCompute = false;

  constructor() {
    this.client = new OcctWorkerClient({ lazy: true });
    this.initUI();
    this.initListeners();
    this.setLoading(true);
    // Initial compute scheduled after first paint
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(() => void this.triggerCompute(), { timeout: 1500 });
    } else {
      setTimeout(() => void this.triggerCompute(), 30);
    }
  }

  private initUI(): void {
    const sheetContainer = document.getElementById('sheet-container');
    if (sheetContainer) {
      this.sheet2D = new ProjectionSheet2D(sheetContainer);
    }

    const inspectorContainer = document.getElementById('inspector-container');
    if (inspectorContainer) {
      this.inspector3D = new Inspector3D(inspectorContainer);
    }

    this.updateFormFields();
  }

  private initListeners(): void {
    const form = document.getElementById('param-form') as HTMLFormElement | null;
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.triggerCompute();
    });

    // Solid type selector change (show/hide sides and topSize)
    const typeSelect = document.getElementById('solid-type') as HTMLSelectElement | null;
    typeSelect?.addEventListener('change', () => {
      this.updateFormFields();
    });

    // Auto-update on slider / number change
    const inputs = form?.querySelectorAll('input, select');
    inputs?.forEach((input) => {
      input.addEventListener('change', () => this.triggerCompute());
    });

    // Stage Stepper
    document.getElementById('btn-prev-stage')?.addEventListener('click', () => {
      if (this.currentStageIndex > 0) {
        this.setStage(this.currentStageIndex - 1);
      }
    });

    document.getElementById('btn-next-stage')?.addEventListener('click', () => {
      if (this.currentStageIndex < 2) {
        this.setStage(this.currentStageIndex + 1);
      }
    });

    document.querySelectorAll<HTMLElement>('.stage-pill').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset['stage']);
        if (Number.isInteger(index)) this.setStage(index);
      });
    });

    // 3D camera presets and reference plane visibility
    document.querySelectorAll<HTMLElement>('.view-toolbar [data-view]').forEach((button) => {
      button.addEventListener('click', () => {
        const view = button.dataset['view'] as InspectorView | undefined;
        if (!view) return;
        this.inspector3D?.setView(view);
        this.syncViewButtons(view);
      });
    });

    const planesButton = document.getElementById('btn-toggle-planes');
    planesButton?.addEventListener('click', () => {
      if (!this.inspector3D) return;
      const visible = !this.inspector3D.arePlanesVisible();
      this.inspector3D.setPlanesVisible(visible);
      planesButton.setAttribute('aria-pressed', String(visible));
      planesButton.classList.toggle('active', visible);
    });

    // SVG Export
    document.getElementById('btn-export-svg')?.addEventListener('click', () => {
      this.handleExportSvg();
    });
  }

  private syncViewButtons(view: InspectorView): void {
    document.querySelectorAll<HTMLElement>('.view-toolbar [data-view]').forEach((button) => {
      const isActive = button.dataset['view'] === view;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
  }

  private updateFormFields(): void {
    const typeSelect = document.getElementById('solid-type') as HTMLSelectElement | null;
    const val = typeSelect?.value ?? 'CONE';

    const sidesGroup = document.getElementById('group-sides');
    const topSizeGroup = document.getElementById('group-top-size');
    const baseLabel = document.getElementById('label-base-size');
    const isPolygon = val === 'PRISM' || val === 'PYRAMID' || val === 'FRUSTUM_PYRAMID';

    if (sidesGroup) {
      sidesGroup.style.display = isPolygon ? 'block' : 'none';
    }
    if (topSizeGroup) {
      topSizeGroup.style.display = val === 'FRUSTUM_CONE' || val === 'FRUSTUM_PYRAMID' ? 'block' : 'none';
    }
    if (baseLabel) {
      baseLabel.textContent = isPolygon ? 'Base side (mm)' : 'Base radius (mm)';
    }
  }

  private getFormData(): { solid: SolidConfig; placement: PlacementConfig } {
    const type = (document.getElementById('solid-type') as HTMLSelectElement).value as SolidConfig['type'];
    const baseSize = parseFloat((document.getElementById('input-base-size') as HTMLInputElement).value) || 20;
    const height = parseFloat((document.getElementById('input-height') as HTMLInputElement).value) || 60;
    const sides = parseInt((document.getElementById('input-sides') as HTMLInputElement).value, 10) as SolidConfig['sides'];
    const topSize = parseFloat((document.getElementById('input-top-size') as HTMLInputElement).value) || 10;

    const initialAxis = (document.getElementById('input-axis') as HTMLSelectElement).value as PlacementConfig['initialAxis'];
    const baseRotationDeg = parseFloat((document.getElementById('input-rot') as HTMLInputElement).value) || 0;
    const thetaDeg = parseFloat((document.getElementById('input-theta') as HTMLInputElement).value);
    const phiDeg = parseFloat((document.getElementById('input-phi') as HTMLInputElement).value);
    const distanceHP = parseFloat((document.getElementById('input-hp') as HTMLInputElement).value) || 0;
    const distanceVP = parseFloat((document.getElementById('input-vp') as HTMLInputElement).value) || 0;

    return {
      solid: { type, baseSize, height, sides, topSize },
      placement: {
        initialAxis,
        baseRotationDeg,
        thetaDeg: Number.isFinite(thetaDeg) ? thetaDeg : 90,
        phiDeg: Number.isFinite(phiDeg) ? phiDeg : 0,
        distanceHP,
        distanceVP,
      },
    };
  }

  private async triggerCompute(): Promise<void> {
    if (this.isComputing) {
      // Keep the most recent form state instead of silently dropping the edit.
      this.pendingCompute = true;
      return;
    }
    this.isComputing = true;
    this.setLoading(true);

    try {
      const { solid, placement } = this.getFormData();
      const result = await this.client.compute(solid, placement);
      this.computeResult = result;

      // Update validation banner
      this.updateValidationBanner(result.validation);

      // Render current stage
      this.setStage(this.currentStageIndex);
    } catch (err: unknown) {
      this.showErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      this.isComputing = false;
      this.setLoading(false);
      if (this.pendingCompute) {
        this.pendingCompute = false;
        void this.triggerCompute();
      }
    }
  }

  private updateValidationBanner(validation: ComputeResult['validation']): void {
    const banner = document.getElementById('validation-banner');
    if (!banner) return;

    if (validation.valid) {
      banner.className = 'status-banner valid';
      banner.innerHTML =
        '<strong>Valid first quadrant</strong> — all solid vertices lie above HP and in front of VP.';
    } else {
      banner.className = 'status-banner invalid';
      banner.innerHTML = `<strong>Rule violation</strong> — ${validation.message} (min Z: ${validation.minZ.toFixed(2)} mm, min Y: ${validation.minY.toFixed(2)} mm)`;
    }
  }

  private showErrorBanner(msg: string): void {
    const banner = document.getElementById('validation-banner');
    if (!banner) return;
    banner.className = 'status-banner invalid';
    banner.innerHTML = `<strong>Computation error</strong> — ${msg}`;
  }

  private setStage(stageIndex: number): void {
    if (!this.computeResult) return;
    this.currentStageIndex = Math.max(0, Math.min(2, stageIndex));
    const stageData = this.computeResult.stages[this.currentStageIndex]!;

    // 1. Update Stepper UI
    const stageLabel = document.getElementById('stage-indicator');
    if (stageLabel) {
      stageLabel.textContent = `Stage ${stageData.stage} of 3 — ${stageData.description}`;
    }

    document.querySelectorAll<HTMLElement>('.stage-pill').forEach((button) => {
      const isActive = Number(button.dataset['stage']) === this.currentStageIndex;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });

    const prevBtn = document.getElementById('btn-prev-stage') as HTMLButtonElement | null;
    const nextBtn = document.getElementById('btn-next-stage') as HTMLButtonElement | null;
    if (prevBtn) prevBtn.disabled = this.currentStageIndex === 0;
    if (nextBtn) nextBtn.disabled = this.currentStageIndex === 2;

    // 2. Update 2D Projection Sheet
    this.sheet2D?.updateViews(stageData);

    // 3. Update 3D Inspector
    this.inspector3D?.updateSolid(stageData.mesh3D);
  }

  private setLoading(isLoading: boolean): void {
    const spinner = document.getElementById('loading-indicator');
    if (spinner) {
      spinner.classList.toggle('visible', isLoading);
    }
  }

  private handleExportSvg(): void {
    if (!this.computeResult) return;
    const currentStage = this.computeResult.stages[this.currentStageIndex]!;
    const svgStr = exportStageToSvg(currentStage, 'Teaching Viewer');

    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `projection_stage_${currentStage.stage}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  public getComputeResult(): ComputeResult | null {
    return this.computeResult;
  }

  public getClient(): OcctWorkerClient {
    return this.client;
  }
}

declare global {
  interface Window {
    __teachingViewerApp?: TeachingViewerApp;
  }
}

// Bootstrap on DOM ready
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    window.__teachingViewerApp = new TeachingViewerApp();
  });
}
