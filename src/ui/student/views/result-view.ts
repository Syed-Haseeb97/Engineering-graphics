import type { FinalGradeResult, ProblemState } from '../types';
import { Inspector3D } from '../../viewer/inspector3d';
import { OcctWorkerClient } from '../../../kernel/worker/client';
import type { ComputeResult, PlacementConfig, SolidConfig } from '../../../kernel/worker/types';

export interface ResultViewOptions {
  readonly grade: FinalGradeResult;
  readonly problemState: ProblemState;
  readonly onReturnToAssignments: () => void;
}

export function renderResultView(container: HTMLElement, options: ResultViewOptions): void {
  const { grade, problemState } = options;
  const mins = Math.floor(grade.timeSpentSec / 60);
  const secs = grade.timeSpentSec % 60;

  container.innerHTML = `
    <div class="result-wrapper">
      <header class="app-navbar">
        <div class="navbar-brand">
          <span class="navbar-logo">📐</span>
          <span class="navbar-title">Evaluation Scorecard</span>
        </div>
        <button id="btn-return-assignments" class="btn btn-outline btn-sm">
          ← Back to Assignments
        </button>
      </header>

      <main class="result-content">
        <!-- Left Column: Score Breakdown & Feedback -->
        <div class="result-card">
          <div class="result-header">
            <div class="score-display">
              <span class="final-score" id="result-final-score">${Math.round(grade.score)}</span>
              <span class="max-score">/ 100</span>
            </div>
            <div class="result-badge-row">
              <span class="badge badge-${grade.score >= 75 ? 'success' : 'warning'}">
                ${grade.score >= 75 ? 'PASSED' : 'NEEDS REVISION'}
              </span>
              ${grade.isLate ? `<span class="badge badge-danger">LATE SUBMISSION</span>` : `<span class="badge badge-success">ON TIME</span>`}
              ${grade.mode === 'local' ? `<span class="badge badge-neutral">LOCAL LAB REVIEW</span>` : ''}
            </div>
          </div>

          <div class="result-feedback-box">
            <h4 class="feedback-heading">${grade.mode === 'local' ? 'Local Lab Feedback' : 'Instructor & Automated Feedback'}</h4>
            <p class="feedback-text" id="result-feedback-text">${grade.feedback}</p>
          </div>

          <div class="rubric-breakdown-section">
            <h4 class="breakdown-heading">Grading Rubric Breakdown</h4>

            <div class="rubric-bar-item">
              <div class="bar-header">
                <span>Topology Recall (Edges & Outlines)</span>
                <span>${Math.round((grade.breakdown['recall'] ?? 1) * 100)}%</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" style="width: ${(grade.breakdown['recall'] ?? 1) * 100}%"></div>
              </div>
            </div>

            <div class="rubric-bar-item">
              <div class="bar-header">
                <span>Geometric Alignment & Precision</span>
                <span>${Math.round((grade.breakdown['precision'] ?? 1) * 100)}%</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" style="width: ${(grade.breakdown['precision'] ?? 1) * 100}%"></div>
              </div>
            </div>

            <div class="rubric-bar-item">
              <div class="bar-header">
                <span>Line Style Conventions (Visible vs Hidden)</span>
                <span>${Math.round((grade.breakdown['lineType'] ?? 1) * 100)}%</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" style="width: ${(grade.breakdown['lineType'] ?? 1) * 100}%"></div>
              </div>
            </div>

            <div class="session-meta-item">
              <span>Time Spent: ${mins}m ${secs}s</span>
              <span>Submission ID: ${grade.submissionId.substring(0, 12)}...</span>
            </div>
          </div>
        </div>

        <!-- Right Column: 3D Reference Model Viewer (Unlocked AFTER Submission) -->
        <div class="reference-3d-card">
          <div class="reference-3d-header">
            <div class="reference-title-group">
              <span class="badge badge-unlocked">🔓 3D Reference Model Unlocked</span>
              <h3 class="reference-title">${problemState.problem.topic.replace(/_/g, ' ')}</h3>
            </div>
            <p class="reference-desc">
              Inspect the canonical 3D orientation in Quadrant 1 and observe how HP and VP intersect.
            </p>
          </div>

          <div class="reference-3d-canvas-container" id="reference-3d-container">
            <!-- Three.js OrbitControls canvas inserted here -->
            <div id="result-3d-loading" class="viewer-loading-overlay">
              <div class="spinner-dot"></div>
              <span>Loading 3D Kernel & Reference Model...</span>
            </div>
          </div>

          <div class="reference-legend">
            <span class="legend-item"><span class="legend-color legend-hp"></span> HP (Z = 0)</span>
            <span class="legend-item"><span class="legend-color legend-vp"></span> VP (Y = 0)</span>
            <span class="legend-item"><span class="legend-color legend-pp"></span> PP (X = 0)</span>
          </div>
        </div>
      </main>
    </div>
  `;

  container.querySelector('#btn-return-assignments')?.addEventListener('click', options.onReturnToAssignments);

  // Initialize 3D Reference Viewer (Allowed only AFTER submission)
  const threeContainer = container.querySelector('#reference-3d-container') as HTMLElement | null;
  const loadingOverlay = container.querySelector('#result-3d-loading') as HTMLElement | null;
  if (threeContainer) {
    try {
      const inspector = new Inspector3D(threeContainer);
      const { problem } = problemState;
      if (problem.topic === 'PROJECTION_OF_SOLIDS') {
        const client = new OcctWorkerClient({ lazy: true });
        const params = problem.publicParams;
        const problemId = problem.problemId.toLowerCase();
        const solidType = problemId.includes('prism')
          ? 'PRISM'
          : problemId.includes('cone')
            ? 'CONE'
            : problemId.includes('pyramid')
              ? 'PYRAMID'
              : 'CYLINDER';
        const solid: SolidConfig = {
          type: solidType as SolidConfig['type'],
          baseSize: params['baseSide'] ?? params['baseDia'] ?? 30,
          height: params['height'] ?? 60,
          sides: (solidType === 'PRISM' ? 4 : solidType === 'PYRAMID' ? 5 : undefined) as SolidConfig['sides'],
        };
        const placement: PlacementConfig = {
          initialAxis: 'PERPENDICULAR_TO_HP',
          thetaDeg: params['theta'] ?? 45,
          phiDeg: params['phi'] ?? 30,
          distanceHP: params['distHP'] ?? 20,
          distanceVP: params['distVP'] ?? 25,
        };
        client
          .compute(solid, placement)
          .then((res: ComputeResult) => {
            const lastStage = res.stages[res.stages.length - 1];
            if (lastStage?.mesh3D) {
              inspector.updateSolid(lastStage.mesh3D);
            }
            if (loadingOverlay) loadingOverlay.style.display = 'none';
          })
          .catch((err: unknown) => {
            console.warn('[ResultView] 3D mesh solve notice:', err);
            if (loadingOverlay) loadingOverlay.style.display = 'none';
          });
      } else {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
      }
    } catch (err) {
      console.warn('[ResultView] WebGL 3D Inspector initialization notice:', err);
      if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
  }
}
