import type {
  ParameterDefinition,
  ProblemTemplate,
  ShapeType,
  TopicType,
  ViewRequirement,
} from '../../../problems/types';
import { validateProblemParameters } from '../../../problems/validator';
import type { SeededPreviewSample, TemplateAuthoringFormState } from '../types';
import { Inspector3D } from '../../viewer/inspector3d';
import { OcctWorkerClient } from '../../../kernel/worker/client';
import type { PlacementConfig, SolidConfig } from '../../../kernel/worker/types';

export interface AuthoringViewOptions {
  readonly onSaveTemplate: (template: ProblemTemplate) => Promise<void>;
  readonly onCreateAssignment: (templateId: string, section: string, dueAt: string, maxMarks: number) => Promise<void>;
}

/**
 * Shape presets for rapid authoring without manual typing of standard parameters.
 */
const SHAPE_PRESETS: Record<
  ShapeType,
  {
    topic: TopicType;
    params: Record<string, ParameterDefinition>;
    views: ViewRequirement[];
    statement: string;
  }
> = {
  CONE: {
    topic: 'PROJECTION_OF_SOLIDS',
    params: {
      baseDia: { min: 40, max: 50, step: 5, unit: 'mm', description: 'Base diameter' },
      height: { min: 55, max: 70, step: 5, unit: 'mm', description: 'Axis height' },
      theta: { min: 30, max: 45, step: 5, unit: 'deg', description: 'Axis tilt to HP' },
      phi: { min: 20, max: 35, step: 5, unit: 'deg', description: 'Axis tilt to VP' },
      distVP: { min: 20, max: 35, step: 5, unit: 'mm', description: 'Apex distance from VP' },
    },
    views: ['FRONT_VIEW', 'TOP_VIEW'],
    statement:
      'A cone of base {baseDia} mm diameter and axis {height} mm long rests on the HP on a point of its base circumference. Its axis is inclined at {theta}° to the HP and {phi}° to the VP, with its apex situated {distVP} mm in front of the VP. Draw its front and top views.',
  },
  CYLINDER: {
    topic: 'PROJECTION_OF_SOLIDS',
    params: {
      baseDia: { min: 40, max: 50, step: 5, unit: 'mm', description: 'Base diameter' },
      height: { min: 55, max: 75, step: 5, unit: 'mm', description: 'Axis height' },
      theta: { min: 30, max: 50, step: 5, unit: 'deg', description: 'Axis tilt to HP' },
      distHP: { min: 15, max: 30, step: 5, unit: 'mm', description: 'Base center above HP' },
    },
    views: ['FRONT_VIEW', 'TOP_VIEW'],
    statement:
      'A cylinder of base {baseDia} mm diameter and axis {height} mm long rests on one of its base rim points on the HP. Its axis is inclined at {theta}° to the HP and parallel to the VP, with its lowest base center {distHP} mm above the HP. Draw its projections.',
  },
  PRISM: {
    topic: 'PROJECTION_OF_SOLIDS',
    params: {
      baseSide: { min: 25, max: 40, step: 5, unit: 'mm', description: 'Base side length' },
      height: { min: 50, max: 75, step: 5, unit: 'mm', description: 'Axis height' },
      theta: { min: 30, max: 50, step: 5, unit: 'deg', description: 'Axis tilt to HP' },
      distVP: { min: 20, max: 35, step: 5, unit: 'mm', description: 'Distance in front of VP' },
    },
    views: ['FRONT_VIEW', 'TOP_VIEW'],
    statement:
      'A square prism, base {baseSide} mm side and axis {height} mm long, rests with an edge of its base on the HP. The axis is inclined at {theta}° to the HP and parallel to the VP, with the nearest corner {distVP} mm in front of the VP. Draw its projections.',
  },
  PYRAMID: {
    topic: 'PROJECTION_OF_SOLIDS',
    params: {
      baseSide: { min: 25, max: 35, step: 5, unit: 'mm', description: 'Base side length' },
      height: { min: 50, max: 70, step: 5, unit: 'mm', description: 'Axis height' },
      phi: { min: 30, max: 45, step: 5, unit: 'deg', description: 'Axis tilt to VP' },
      distHP: { min: 20, max: 35, step: 5, unit: 'mm', description: 'Base edge above HP' },
    },
    views: ['FRONT_VIEW', 'TOP_VIEW'],
    statement:
      'A pentagonal pyramid, base {baseSide} mm side and axis {height} mm long, has an edge of its base in the VP. The axis is inclined at {phi}° to the VP and parallel to the HP, with the base edge {distHP} mm above the HP. Draw its projections.',
  },
  LINE: {
    topic: 'PROJECTION_OF_LINES',
    params: {
      trueLength: { min: 60, max: 85, step: 5, unit: 'mm', description: 'True length of line' },
      theta: { min: 25, max: 40, step: 5, unit: 'deg', description: 'Inclination to HP' },
      phi: { min: 20, max: 35, step: 5, unit: 'deg', description: 'Inclination to VP' },
      distHP: { min: 15, max: 30, step: 5, unit: 'mm', description: 'End A above HP' },
      distVP: { min: 20, max: 35, step: 5, unit: 'mm', description: 'End A in front of VP' },
    },
    views: ['FRONT_VIEW', 'TOP_VIEW'],
    statement:
      'A straight line AB, {trueLength} mm long, has end A {distHP} mm above the HP and {distVP} mm in front of the VP. The line is inclined at {theta}° to the HP and {phi}° to the VP. Draw its projections and determine its apparent lengths.',
  },
  POINT: {
    topic: 'PROJECTION_OF_POINTS',
    params: {
      distHP: { min: 20, max: 50, step: 5, unit: 'mm', description: 'Distance from HP' },
      distVP: { min: 20, max: 50, step: 5, unit: 'mm', description: 'Distance from VP' },
    },
    views: ['FRONT_VIEW', 'TOP_VIEW'],
    statement:
      'Point P is situated {distHP} mm above the HP and {distVP} mm in front of the VP. Draw its orthographic projections and state its quadrant.',
  },
  TRIANGLE: {
    topic: 'PROJECTION_OF_PLANES',
    params: {
      side: { min: 30, max: 50, step: 5, unit: 'mm', description: 'Side of equilateral triangle' },
      theta: { min: 30, max: 45, step: 5, unit: 'deg', description: 'Surface inclination to HP' },
      distHP: { min: 15, max: 30, step: 5, unit: 'mm', description: 'Corner above HP' },
    },
    views: ['FRONT_VIEW', 'TOP_VIEW'],
    statement:
      'An equilateral triangular lamina of {side} mm side rests with one of its corners on the HP. The surface is inclined at {theta}° to the HP, with the resting corner {distHP} mm above the HP. Draw its projections.',
  },
  RECTANGLE: {
    topic: 'PROJECTION_OF_PLANES',
    params: {
      length: { min: 40, max: 60, step: 5, unit: 'mm', description: 'Longer side' },
      width: { min: 25, max: 40, step: 5, unit: 'mm', description: 'Shorter side' },
      theta: { min: 30, max: 45, step: 5, unit: 'deg', description: 'Surface tilt to HP' },
    },
    views: ['FRONT_VIEW', 'TOP_VIEW'],
    statement:
      'A rectangular plate of {length} mm × {width} mm rests with one of its shorter edges on the HP. Its surface is inclined at {theta}° to the HP. Draw its front and top views.',
  },
  CIRCLE_LAMINAE: {
    topic: 'PROJECTION_OF_PLANES',
    params: {
      diameter: { min: 40, max: 60, step: 5, unit: 'mm', description: 'Diameter of circular plate' },
      theta: { min: 30, max: 45, step: 5, unit: 'deg', description: 'Surface inclination to HP' },
      distHP: { min: 15, max: 30, step: 5, unit: 'mm', description: 'Lowest point above HP' },
    },
    views: ['FRONT_VIEW', 'TOP_VIEW'],
    statement:
      'A circular plate of {diameter} mm diameter rests on the HP on a point of its circumference. Its surface is inclined at {theta}° to the HP, with its lowest point {distHP} mm above the HP. Draw its projections.',
  },
};

export class AuthoringView {
  private container: HTMLElement;
  private options: AuthoringViewOptions;
  private state: TemplateAuthoringFormState;
  private inspector3d: Inspector3D | null = null;
  private workerClient: OcctWorkerClient | null = null;

  constructor(container: HTMLElement, options: AuthoringViewOptions) {
    this.container = container;
    this.options = options;

    const preset = SHAPE_PRESETS.CONE;
    this.state = {
      id: 'custom_cone_problem',
      topic: preset?.topic ?? 'PROJECTION_OF_SOLIDS',
      shape: 'CONE',
      param_schema: preset?.params ? { ...preset.params } : {},
      placement_rules: { restingPlane: 'HP', restingFeature: 'point' },
      views_required: preset?.views ? [...preset.views] : ['FRONT_VIEW', 'TOP_VIEW'],
      validity_predicates: {
        requireFirstQuadrant: true,
        minFeatureSizeMm: 3,
        minApparentLengthMm: 15,
        maxSheetWidthMm: 450,
        maxSheetHeightMm: 300,
        maxCombinedTiltDeg: 75,
      },
      rubric: { recall: 0.35, precision: 0.3, lineType: 0.25, dimensions: 0.1 },
      statement: preset?.statement ?? '',
    };

    this.render();
  }

  public render(): void {
    const rubricSum = Number(
      (this.state.rubric.recall + this.state.rubric.precision + this.state.rubric.lineType + this.state.rubric.dimensions).toFixed(3),
    );
    const isRubricValid = Math.abs(rubricSum - 1.0) < 0.001;

    // Generate 5 live seeded preview samples
    const previewSamples = this.generateLivePreviewSamples(5);

    this.container.innerHTML = `
      <div class="authoring-layout">
        <!-- Left: Form Builder Column -->
        <div class="authoring-form-column">
          <header class="authoring-header">
            <h2 class="page-title">Problem Authoring Studio</h2>
            <p class="page-subtitle">Design parametric technical drawing problems with live validation and zero-code templates.</p>
          </header>

          <form id="form-problem-authoring" class="authoring-form">
            <!-- 1. General Metadata -->
            <div class="form-section-card">
              <h3 class="section-heading">1. Problem Metadata & Geometric Category</h3>

              <div class="form-grid-2">
                <div class="form-group">
                  <label for="input-template-id" class="form-label">Template Unique ID</label>
                  <input
                    type="text"
                    id="input-template-id"
                    class="form-control"
                    value="${this.state.id}"
                    placeholder="e.g. cylinder_inclined_hp"
                    required
                  />
                </div>

                <div class="form-group">
                  <label for="select-shape" class="form-label">Geometric Shape & Preset</label>
                  <select id="select-shape" class="form-control">
                    ${(['CONE', 'CYLINDER', 'PRISM', 'PYRAMID', 'LINE', 'POINT', 'TRIANGLE', 'RECTANGLE', 'CIRCLE_LAMINAE'] as ShapeType[])
                      .map((s) => `<option value="${s}" ${this.state.shape === s ? 'selected' : ''}>${s.replace(/_/g, ' ')}</option>`)
                      .join('')}
                  </select>
                </div>
              </div>

              <div class="form-group">
                <label for="select-topic" class="form-label">Course Topic</label>
                <select id="select-topic" class="form-control">
                  <option value="PROJECTION_OF_SOLIDS" ${this.state.topic === 'PROJECTION_OF_SOLIDS' ? 'selected' : ''}>Projection of Solids</option>
                  <option value="PROJECTION_OF_LINES" ${this.state.topic === 'PROJECTION_OF_LINES' ? 'selected' : ''}>Projection of Lines</option>
                  <option value="PROJECTION_OF_PLANES" ${this.state.topic === 'PROJECTION_OF_PLANES' ? 'selected' : ''}>Projection of Planes</option>
                  <option value="PROJECTION_OF_POINTS" ${this.state.topic === 'PROJECTION_OF_POINTS' ? 'selected' : ''}>Projection of Points</option>
                </select>
              </div>
            </div>

            <!-- 2. Parametric Step Grids -->
            <div class="form-section-card">
              <div class="section-title-row">
                <h3 class="section-heading">2. Parametric Step Grids & Numerical Bounds</h3>
                <button type="button" id="btn-add-param" class="btn btn-outline btn-sm">+ Add Parameter</button>
              </div>

              <div class="param-table-wrapper">
                <table class="params-table">
                  <thead>
                    <tr>
                      <th>Token Key</th>
                      <th>Min</th>
                      <th>Max</th>
                      <th>Step</th>
                      <th>Unit</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody id="params-table-body">
                    ${Object.entries(this.state.param_schema)
                      .map(([key, def]) => `
                        <tr class="param-row" data-key="${key}">
                          <td><input type="text" class="form-control form-control-sm p-key" value="${key}" /></td>
                          <td><input type="number" class="form-control form-control-sm p-min" value="${def.min}" step="any" /></td>
                          <td><input type="number" class="form-control form-control-sm p-max" value="${def.max}" step="any" /></td>
                          <td><input type="number" class="form-control form-control-sm p-step" value="${def.step}" step="any" /></td>
                          <td>
                            <select class="form-control form-control-sm p-unit">
                              <option value="mm" ${def.unit === 'mm' ? 'selected' : ''}>mm</option>
                              <option value="deg" ${def.unit === 'deg' ? 'selected' : ''}>deg</option>
                            </select>
                          </td>
                          <td>
                            <button type="button" class="btn btn-sm btn-outline text-danger btn-del-param" data-key="${key}">&times;</button>
                          </td>
                        </tr>
                      `)
                      .join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- 3. Views Required & Rubric Weights -->
            <div class="form-section-card">
              <h3 class="section-heading">3. Views Required & Rubric Weights</h3>

              <div class="form-group">
                <label class="form-label">Required Views</label>
                <div class="checkbox-group">
                  ${(['FRONT_VIEW', 'TOP_VIEW', 'LEFT_SIDE_VIEW', 'RIGHT_SIDE_VIEW'] as ViewRequirement[])
                    .map((v) => `
                      <label class="checkbox-label">
                        <input
                          type="checkbox"
                          class="view-checkbox"
                          value="${v}"
                          ${this.state.views_required.includes(v) ? 'checked' : ''}
                        />
                        ${v.replace(/_/g, ' ')}
                      </label>
                    `)
                    .join('')}
                </div>
              </div>

              <div class="form-group">
                <div class="rubric-header-line">
                  <label class="form-label">Automated Rubric Weights (Must sum to 1.0)</label>
                  <span class="badge ${isRubricValid ? 'badge-success' : 'badge-danger'}" id="rubric-sum-badge">
                    Sum: ${(rubricSum * 100).toFixed(0)}%
                  </span>
                </div>
                <div class="rubric-weights-grid">
                  <div>
                    <span class="rubric-lbl">Recall (Edges):</span>
                    <input type="number" id="rubric-recall" class="form-control form-control-sm" min="0" max="1" step="0.05" value="${this.state.rubric.recall}" />
                  </div>
                  <div>
                    <span class="rubric-lbl">Precision:</span>
                    <input type="number" id="rubric-precision" class="form-control form-control-sm" min="0" max="1" step="0.05" value="${this.state.rubric.precision}" />
                  </div>
                  <div>
                    <span class="rubric-lbl">Line Style:</span>
                    <input type="number" id="rubric-line-type" class="form-control form-control-sm" min="0" max="1" step="0.05" value="${this.state.rubric.lineType}" />
                  </div>
                  <div>
                    <span class="rubric-lbl">Dimensions:</span>
                    <input type="number" id="rubric-dimensions" class="form-control form-control-sm" min="0" max="1" step="0.05" value="${this.state.rubric.dimensions}" />
                  </div>
                </div>
              </div>
            </div>

            <!-- 4. Problem Statement Template -->
            <div class="form-section-card">
              <h3 class="section-heading">4. Problem Statement Text (with Tokens)</h3>
              <p class="form-desc">Embed tokens inside braces like <code>{baseDia}</code> or <code>{theta}</code>. They will be deterministically populated per student.</p>

              <div class="form-group">
                <textarea id="input-statement" class="form-control" rows="4" required>${this.state.statement}</textarea>
              </div>

              <div class="token-helper-chips">
                <span class="token-helper-title">Available Tokens:</span>
                ${Object.keys(this.state.param_schema)
                  .map((k) => `<span class="token-chip">{${k}}</span>`)
                  .join(' ')}
              </div>
            </div>

            <!-- 5. Validity Predicates -->
            <div class="form-section-card">
              <h3 class="section-heading">5. Geometric Validity Rules & Guardrails</h3>

              <div class="form-grid-3">
                <div class="form-group">
                  <label for="val-max-tilt" class="form-label">Max Combined Tilt (°)</label>
                  <input type="number" id="val-max-tilt" class="form-control" value="${this.state.validity_predicates.maxCombinedTiltDeg ?? 75}" />
                </div>
                <div class="form-group">
                  <label for="val-min-feature" class="form-label">Min Feature Size (mm)</label>
                  <input type="number" id="val-min-feature" class="form-control" value="${this.state.validity_predicates.minFeatureSizeMm ?? 3}" />
                </div>
                <div class="form-group">
                  <label for="val-max-width" class="form-label">Max Sheet Width (mm)</label>
                  <input type="number" id="val-max-width" class="form-control" value="${this.state.validity_predicates.maxSheetWidthMm ?? 450}" />
                </div>
              </div>

              <label class="checkbox-label mt-2">
                <input type="checkbox" id="val-quadrant" ${this.state.validity_predicates.requireFirstQuadrant ? 'checked' : ''} />
                Enforce Strict First Quadrant Rule ($Z \\ge 0$, $Y \\ge 0$)
              </label>
            </div>

            <div class="authoring-actions">
              <button type="submit" id="btn-save-template" class="btn btn-primary">
                💾 Save Problem Template JSON
              </button>
            </div>
            <div id="save-status-msg" class="save-status-msg" style="display: none;"></div>
          </form>
        </div>

        <!-- Right: Live Preview Column (5 Seeded Problem Samples) -->
        <div class="authoring-preview-column">
          <div class="preview-header-bar">
            <div>
              <h3 class="preview-title">Live Deterministic Seed Preview</h3>
              <p class="preview-sub">5 sample student problems generated from your active parameter step grid.</p>
            </div>
            <span class="badge badge-neutral">Instant Verification</span>
          </div>

          <!-- 3D Solid Preview with Loading State -->
          <div class="preview-3d-card" id="authoring-3d-card">
            <div class="sample-card-header" style="padding: 8px 12px; background: #f8fafc; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.8rem; font-weight: 600;">3D Solid Template Preview</span>
              <button type="button" class="btn btn-outline btn-sm" id="btn-load-3d-preview" style="padding: 2px 8px; font-size: 0.75rem;">
                👁 Preview 3D Solid
              </button>
            </div>
            <div class="preview-3d-canvas" id="authoring-3d-container">
              <div id="authoring-3d-loading" class="viewer-loading-overlay hidden">
                <div class="spinner-dot"></div>
                <span>Loading OCCT Worker & 3D Geometry...</span>
              </div>
            </div>
          </div>

          <div class="preview-samples-list" id="preview-samples-list">
            ${previewSamples
              .map((sample) => `
                <div class="preview-sample-card ${sample.isValid ? 'card-valid' : 'card-invalid'}" id="preview-sample-${sample.index}">
                  <div class="sample-card-header">
                    <span class="sample-roll">Student Roll: <strong>${sample.rollNo}</strong></span>
                    <span class="badge ${sample.isValid ? 'badge-success' : 'badge-danger'}">
                      ${sample.isValid ? '✓ Valid Candidate' : '⚠️ Invalid Predicates'}
                    </span>
                  </div>

                  <div class="sample-statement-box">
                    <p class="sample-statement-text">${sample.renderedStatement}</p>
                  </div>

                  <div class="sample-params-row">
                    ${Object.entries(sample.params)
                      .map(([k, v]) => `<span class="sample-param-chip"><strong>${k}:</strong> ${v}</span>`)
                      .join('')}
                  </div>

                  ${sample.validationErrors.length > 0
                    ? `
                      <div class="sample-errors-box">
                        ${sample.validationErrors.map((err) => `<div class="error-line">• ${err}</div>`).join('')}
                      </div>
                    `
                    : ''}
                </div>
              `)
              .join('')}
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private generateLivePreviewSamples(count: number): SeededPreviewSample[] {
    const rollNumbers = ['22BCE10001', '22BCE10002', '22BME10001', '22BEE10001', '22BEE10002'];
    const samples: SeededPreviewSample[] = [];

    const template: ProblemTemplate = {
      id: this.state.id,
      topic: this.state.topic,
      shape: this.state.shape,
      param_schema: this.state.param_schema,
      placement_rules: this.state.placement_rules,
      views_required: this.state.views_required,
      validity_predicates: this.state.validity_predicates,
      rubric: this.state.rubric,
      statement: this.state.statement,
    };

    for (let i = 0; i < count; i++) {
      const roll = rollNumbers[i] ?? `22BCE100${String(i + 1).padStart(2, '0')}`;
      const params: Record<string, number> = {};

      // Deterministic discrete sampling for preview
      for (const [key, def] of Object.entries(this.state.param_schema)) {
        const stepsCount = Math.max(1, Math.round((def.max - def.min) / (def.step || 1)));
        const stepIdx = (roll.charCodeAt(roll.length - 1)! + i * 3) % (stepsCount + 1);
        params[key] = def.min + stepIdx * def.step;
      }

      // Validate
      const validation = validateProblemParameters(template, params);

      // Render statement
      let statementText = this.state.statement;
      for (const [k, v] of Object.entries(params)) {
        statementText = statementText.replace(new RegExp(`\\{${k}\\}`, 'g'), v.toString());
      }

      samples.push({
        index: i,
        rollNo: roll,
        params,
        renderedStatement: statementText,
        isValid: validation.valid,
        validationErrors: validation.reasons,
      });
    }

    return samples;
  }

  private bindEvents(): void {
    // Shape change -> populate preset
    this.container.querySelector('#select-shape')?.addEventListener('change', (e) => {
      const shape = (e.target as HTMLSelectElement).value as ShapeType;
      const preset = SHAPE_PRESETS[shape] ?? SHAPE_PRESETS.CONE;
      this.state.shape = shape;
      this.state.topic = preset?.topic ?? 'PROJECTION_OF_SOLIDS';
      this.state.param_schema = preset?.params ? { ...preset.params } : {};
      this.state.views_required = preset?.views ? [...preset.views] : ['FRONT_VIEW', 'TOP_VIEW'];
      this.state.statement = preset?.statement ?? '';
      this.render();
    });

    // Topic change
    this.container.querySelector('#select-topic')?.addEventListener('change', (e) => {
      this.state.topic = (e.target as HTMLSelectElement).value as TopicType;
    });

    // Template ID
    this.container.querySelector('#input-template-id')?.addEventListener('input', (e) => {
      this.state.id = (e.target as HTMLInputElement).value;
    });

    // Statement change -> re-render preview
    this.container.querySelector('#input-statement')?.addEventListener('input', (e) => {
      this.state.statement = (e.target as HTMLTextAreaElement).value;
      this.updateLivePreview();
    });

    // Rubric inputs
    const bindRubric = (id: string, key: keyof typeof this.state.rubric) => {
      this.container.querySelector(id)?.addEventListener('input', (e) => {
        const val = parseFloat((e.target as HTMLInputElement).value) || 0;
        this.state.rubric = { ...this.state.rubric, [key]: val };
        this.updateRubricSum();
      });
    };
    bindRubric('#rubric-recall', 'recall');
    bindRubric('#rubric-precision', 'precision');
    bindRubric('#rubric-line-type', 'lineType');
    bindRubric('#rubric-dimensions', 'dimensions');

    // Add Parameter
    this.container.querySelector('#btn-add-param')?.addEventListener('click', () => {
      const newKey = `param_${Object.keys(this.state.param_schema).length + 1}`;
      this.state.param_schema[newKey] = { min: 20, max: 50, step: 5, unit: 'mm' };
      this.render();
    });

    // Delete Parameter
    this.container.querySelectorAll('.btn-del-param').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-key');
        if (key && this.state.param_schema[key]) {
          const schemaCopy = { ...this.state.param_schema };
          delete schemaCopy[key];
          this.state.param_schema = schemaCopy;
          this.render();
        }
      });
    });

    // Save Form
    this.container.querySelector('#btn-load-3d-preview')?.addEventListener('click', () => {
      void this.render3DPreview();
    });

    this.container.querySelector('#form-problem-authoring')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const statusMsg = this.container.querySelector('#save-status-msg') as HTMLElement | null;

      const template: ProblemTemplate = {
        id: this.state.id,
        topic: this.state.topic,
        shape: this.state.shape,
        param_schema: this.state.param_schema,
        placement_rules: this.state.placement_rules,
        views_required: this.state.views_required,
        validity_predicates: this.state.validity_predicates,
        rubric: this.state.rubric,
        statement: this.state.statement,
      };

      try {
        await this.options.onSaveTemplate(template);
        if (statusMsg) {
          statusMsg.className = 'save-status-msg alert-success';
          statusMsg.innerHTML = `✓ Template <strong>${template.id}</strong> successfully saved to problem bank!`;
          statusMsg.style.display = 'block';
        }
      } catch (err) {
        if (statusMsg) {
          statusMsg.className = 'save-status-msg alert-danger';
          statusMsg.textContent = (err as Error).message;
          statusMsg.style.display = 'block';
        }
      }
    });
  }

  private updateRubricSum(): void {
    const rubricSum = Number(
      (this.state.rubric.recall + this.state.rubric.precision + this.state.rubric.lineType + this.state.rubric.dimensions).toFixed(3),
    );
    const badge = this.container.querySelector('#rubric-sum-badge');
    if (badge) {
      const isValid = Math.abs(rubricSum - 1.0) < 0.001;
      badge.className = `badge ${isValid ? 'badge-success' : 'badge-danger'}`;
      badge.textContent = `Sum: ${(rubricSum * 100).toFixed(0)}%`;
    }
  }

  private updateLivePreview(): void {
    const samples = this.generateLivePreviewSamples(5);
    const list = this.container.querySelector('#preview-samples-list');
    if (list) {
      list.innerHTML = samples
        .map((sample) => `
          <div class="preview-sample-card ${sample.isValid ? 'card-valid' : 'card-invalid'}" id="preview-sample-${sample.index}">
            <div class="sample-card-header">
              <span class="sample-roll">Student Roll: <strong>${sample.rollNo}</strong></span>
              <span class="badge ${sample.isValid ? 'badge-success' : 'badge-danger'}">
                ${sample.isValid ? '✓ Valid Candidate' : '⚠️ Invalid Predicates'}
              </span>
            </div>
            <div class="sample-statement-box">
              <p class="sample-statement-text">${sample.renderedStatement}</p>
            </div>
            <div class="sample-params-row">
              ${Object.entries(sample.params)
                .map(([k, v]) => `<span class="sample-param-chip"><strong>${k}:</strong> ${v}</span>`)
                .join('')}
            </div>
            ${sample.validationErrors.length > 0
              ? `<div class="sample-errors-box">${sample.validationErrors.map((err) => `<div class="error-line">• ${err}</div>`).join('')}</div>`
              : ''}
          </div>
        `)
        .join('');
    }
  }

  private async render3DPreview(): Promise<void> {
    const container = this.container.querySelector('#authoring-3d-container') as HTMLElement | null;
    const loading = this.container.querySelector('#authoring-3d-loading') as HTMLElement | null;
    if (!container) return;

    if (loading) loading.classList.remove('hidden');

    try {
      if (!this.inspector3d) {
        this.inspector3d = new Inspector3D(container);
      }
      if (!this.workerClient) {
        this.workerClient = new OcctWorkerClient({ lazy: true });
      }

      const shape = this.state.shape;
      const params = this.state.param_schema;
      const solid: SolidConfig = {
        type: shape === 'CONE' ? 'CONE' : shape === 'PRISM' ? 'PRISM' : shape === 'PYRAMID' ? 'PYRAMID' : 'CYLINDER',
        baseSize: params['baseDia']?.min ?? params['baseSide']?.min ?? 30,
        height: params['height']?.min ?? 60,
        sides: (shape === 'PRISM' ? 4 : shape === 'PYRAMID' ? 5 : undefined) as SolidConfig['sides'],
      };
      const placement: PlacementConfig = {
        initialAxis: 'PERPENDICULAR_TO_HP',
        thetaDeg: params['theta']?.min ?? 45,
        phiDeg: params['phi']?.min ?? 30,
        distanceHP: params['distHP']?.min ?? 20,
        distanceVP: params['distVP']?.min ?? 25,
      };

      const result = await this.workerClient.compute(solid, placement);
      const lastStage = result.stages[result.stages.length - 1];
      if (lastStage?.mesh3D) {
        this.inspector3d.updateSolid(lastStage.mesh3D);
      }
    } catch (err) {
      console.warn('[AuthoringView] 3D preview notice:', err);
    } finally {
      if (loading) loading.classList.add('hidden');
    }
  }
}
