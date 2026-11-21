import type { EvaluatedEdge } from '../../../checker/types';
import type { DraftEntity, LineEntity, Point2D } from '../../../draft/types';
import type { SubmissionReviewDetails } from '../types';

export interface ReviewModalOptions {
  readonly details: SubmissionReviewDetails;
  readonly onClose: () => void;
  readonly onSaveOverride: (score: number, comment: string) => Promise<void>;
}

export function renderReviewModal(container: HTMLElement, options: ReviewModalOptions): void {
  const { details, onClose, onSaveOverride } = options;
  const sub = details.studentRow;

  const currentScore = sub.score !== null ? Math.round(sub.score) : 0;
  const recallPct = sub.breakdown ? Math.round(sub.breakdown.recall * 100) : 100;
  const precisionPct = sub.breakdown ? Math.round(sub.breakdown.precision * 100) : 100;
  const lineTypePct = sub.breakdown ? Math.round(sub.breakdown.lineType * 100) : 100;

  const simBanner = sub.similarityFlag
    ? `
      <div class="similarity-alert-banner">
        <span class="alert-icon">⚠️</span>
        <div class="alert-text">
          <strong>Structural Similarity Flag (${sub.similarityFlag.similarityScore}% Overlap):</strong>
          Matches submission of <em>${sub.similarityFlag.partnerName} (${sub.similarityFlag.partnerRollNo})</em>.
          <span class="alert-note">Flagged for manual review only — no automated penalty applied.</span>
        </div>
      </div>
    `
    : '';

  container.innerHTML = `
    <div class="modal-backdrop" id="review-modal-backdrop"></div>
    <div class="modal-dialog modal-xl" role="dialog" aria-modal="true" aria-labelledby="review-title">
      <div class="modal-header">
        <div class="header-left">
          <span class="badge badge-topic">Submission Review</span>
          <h2 class="modal-title" id="review-title">${sub.name} (${sub.rollNo})</h2>
          <span class="badge badge-section">Section ${sub.section}</span>
        </div>
        <button class="modal-close-btn" id="btn-close-modal" aria-label="Close modal">&times;</button>
      </div>

      <div class="modal-body review-modal-grid">
        <!-- Left: Canvas Overlay of Student Drawing with Checker Breakdown -->
        <div class="review-canvas-column">
          <div class="canvas-header-bar">
            <span class="canvas-title">Automated Geometric Inspection Overlay</span>
            <span class="canvas-sub">XY Reference Line at Y = 0 (mm)</span>
          </div>

          <div class="canvas-wrapper">
            <canvas id="review-canvas" width="560" height="380" class="review-canvas"></canvas>
          </div>

          <div class="overlay-legend-bar">
            <div class="legend-item"><span class="legend-chip chip-matched"></span> Matched Correctly</div>
            <div class="legend-item"><span class="legend-chip chip-missing"></span> Missing Required Edge</div>
            <div class="legend-item"><span class="legend-chip chip-extra"></span> Extra / Spurious Line</div>
            <div class="legend-item"><span class="legend-chip chip-wrong-type"></span> Wrong Line Style</div>
          </div>

          ${simBanner}
        </div>

        <!-- Right: Scorecard, Rubric Metrics & Faculty Override Form -->
        <div class="review-sidebar-column">
          <div class="metrics-card">
            <div class="score-row">
              <div class="score-block">
                <span class="score-label">Graded Score</span>
                <span class="score-val" id="review-current-score">${currentScore}</span>
                <span class="score-max">/ 100</span>
              </div>
              <div class="status-block">
                <span class="badge badge-${sub.isLate ? 'danger' : 'success'}">
                  ${sub.isLate ? 'LATE SUBMISSION' : 'ON TIME'}
                </span>
                <span class="session-time">Time: ${Math.floor(sub.timeSpentSec / 60)}m ${sub.timeSpentSec % 60}s</span>
              </div>
            </div>

            <div class="rubric-bars">
              <div class="bar-unit">
                <div class="bar-label"><span>Recall (Required Edges)</span><span>${recallPct}%</span></div>
                <div class="bar-track"><div class="bar-fill" style="width: ${recallPct}%"></div></div>
              </div>
              <div class="bar-unit">
                <div class="bar-label"><span>Precision (Geometry Accuracy)</span><span>${precisionPct}%</span></div>
                <div class="bar-track"><div class="bar-fill" style="width: ${precisionPct}%"></div></div>
              </div>
              <div class="bar-unit">
                <div class="bar-label"><span>Line Types (Visible vs Hidden)</span><span>${lineTypePct}%</span></div>
                <div class="bar-track"><div class="bar-fill" style="width: ${lineTypePct}%"></div></div>
              </div>
            </div>

            <div class="hints-summary-box">
              <span class="hints-title">Hint Telemetry:</span>
              <span class="hints-count">${sub.hintsUsed} hint(s) unlocked</span>
              ${sub.unlockedHintLevels.map((lvl) => `<span class="badge badge-hint">${lvl}</span>`).join(' ')}
            </div>
          </div>

          <!-- Faculty Override Form -->
          <form id="form-faculty-override" class="faculty-override-form">
            <h4 class="form-heading">Faculty Grade Override</h4>
            <p class="form-desc">Overrides require an explicit pedagogical review comment and are permanently recorded in the audit log.</p>

            <div class="form-group">
              <label for="input-override-score" class="form-label">New Score (0 - 100)</label>
              <input
                type="number"
                id="input-override-score"
                class="form-control"
                min="0"
                max="100"
                step="1"
                value="${currentScore}"
                required
              />
            </div>

            <div class="form-group">
              <label for="input-override-comment" class="form-label">
                Mandatory Faculty Comment / Review Reason <span class="text-danger">*</span>
              </label>
              <textarea
                id="input-override-comment"
                class="form-control"
                rows="3"
                placeholder="State reason for manual adjustment (e.g. 'Projector alignment verified manually; slight vertex rounding acceptable.')"
                required
              >${sub.feedback ?? ''}</textarea>
              <div id="override-error-msg" class="form-error" style="display: none;"></div>
            </div>

            <button type="submit" id="btn-save-override" class="btn btn-primary btn-block">
              Save Grade Override & Log Audit
            </button>
          </form>

          <!-- Audit Log Section -->
          <div class="audit-log-section">
            <h5 class="audit-heading">Review & Audit Trail</h5>
            <div class="audit-items-list" id="audit-log-items">
              ${details.auditLog.length === 0
                ? `<div class="empty-audit">No overrides recorded yet. Graded by automated engine.</div>`
                : details.auditLog
                    .map((item) => `
                      <div class="audit-item">
                        <div class="audit-top">
                          <span class="audit-action">${item.action}</span>
                          <span class="audit-time">${new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div class="audit-details">
                          ${item.metadata?.oldScore !== undefined ? `Score: ${item.metadata.oldScore} → ${item.metadata.newScore}` : ''}
                        </div>
                        <div class="audit-reason">${item.metadata?.reason ?? 'No comment'}</div>
                      </div>
                    `)
                    .join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Draw Overlay on Canvas
  const canvas = container.querySelector('#review-canvas') as HTMLCanvasElement | null;
  if (canvas) {
    drawReviewOverlay(canvas, details.entities, details.evaluatedEdges);
  }

  // Event Handlers & Keyboard Escape handling
  const closeBtn = container.querySelector<HTMLButtonElement>('#btn-close-modal');

  const cleanupAndClose = (): void => {
    window.removeEventListener('keydown', onKeyDown);
    onClose();
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cleanupAndClose();
    }
  };

  window.addEventListener('keydown', onKeyDown);
  closeBtn?.addEventListener('click', cleanupAndClose);
  container.querySelector('#review-modal-backdrop')?.addEventListener('click', cleanupAndClose);

  // Set focus to close button for keyboard accessibility
  setTimeout(() => closeBtn?.focus(), 50);

  const form = container.querySelector('#form-faculty-override') as HTMLFormElement | null;
  const scoreInput = container.querySelector('#input-override-score') as HTMLInputElement | null;
  const commentInput = container.querySelector('#input-override-comment') as HTMLTextAreaElement | null;
  const errorMsg = container.querySelector('#override-error-msg') as HTMLElement | null;

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!scoreInput || !commentInput) return;

    const newScore = parseFloat(scoreInput.value);
    const comment = commentInput.value.trim();

    if (isNaN(newScore) || newScore < 0 || newScore > 100) {
      if (errorMsg) {
        errorMsg.textContent = 'Score must be a valid number between 0 and 100.';
        errorMsg.style.display = 'block';
      }
      return;
    }

    if (!comment) {
      if (errorMsg) {
        errorMsg.textContent = 'A mandatory comment is required for faculty grade overrides.';
        errorMsg.style.display = 'block';
      }
      return;
    }

    if (errorMsg) errorMsg.style.display = 'none';

    try {
      await onSaveOverride(newScore, comment);
    } catch (err) {
      if (errorMsg) {
        errorMsg.textContent = (err as Error).message;
        errorMsg.style.display = 'block';
      }
    }
  });
}

/**
 * Render the student's submission overlaid with the auto-checker breakdown on Canvas2D.
 */
function drawReviewOverlay(
  canvas: HTMLCanvasElement,
  entities: readonly DraftEntity[],
  evaluatedEdges: readonly EvaluatedEdge[],
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  // Clear background
  ctx.fillStyle = '#0f172a'; // High-contrast engineering slate dark mode
  ctx.fillRect(0, 0, width, height);

  // Compute bounding box
  let minX = -10;
  let maxX = 210;
  let minY = -60;
  let maxY = 80;

  for (const ent of entities) {
    if (ent.type === 'line') {
      const line = ent as LineEntity;
      minX = Math.min(minX, line.p1.x, line.p2.x);
      maxX = Math.max(maxX, line.p1.x, line.p2.x);
      minY = Math.min(minY, line.p1.y, line.p2.y);
      maxY = Math.max(maxY, line.p1.y, line.p2.y);
    }
  }

  for (const edge of evaluatedEdges) {
    minX = Math.min(minX, edge.p1.x, edge.p2.x);
    maxX = Math.max(maxX, edge.p1.x, edge.p2.x);
    minY = Math.min(minY, edge.p1.y, edge.p2.y);
    maxY = Math.max(maxY, edge.p1.y, edge.p2.y);
  }

  const padX = 40;
  const padY = 40;
  const spanX = Math.max(maxX - minX, 50);
  const spanY = Math.max(maxY - minY, 50);
  const scale = Math.min((width - 2 * padX) / spanX, (height - 2 * padY) / spanY);

  function toScreen(p: Point2D): { x: number; y: number } {
    return {
      x: padX + (p.x - minX) * scale,
      y: height - (padY + (p.y - minY) * scale), // Invert Y
    };
  }

  // Draw Grid lines
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  for (let gx = Math.floor(minX / 20) * 20; gx <= maxX; gx += 20) {
    const s1 = toScreen({ x: gx, y: minY });
    const s2 = toScreen({ x: gx, y: maxY });
    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.stroke();
  }
  for (let gy = Math.floor(minY / 20) * 20; gy <= maxY; gy += 20) {
    const s1 = toScreen({ x: minX, y: gy });
    const s2 = toScreen({ x: maxX, y: gy });
    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.stroke();
  }

  // Draw Reference Line XY at Y = 0
  const xyLeft = toScreen({ x: minX - 10, y: 0 });
  const xyRight = toScreen({ x: maxX + 10, y: 0 });
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(xyLeft.x, xyLeft.y);
  ctx.lineTo(xyRight.x, xyRight.y);
  ctx.stroke();

  // XY Labels
  ctx.font = '12px monospace';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('X', xyLeft.x + 4, xyLeft.y - 6);
  ctx.fillText('Y', xyRight.x - 14, xyRight.y - 6);

  // Draw Evaluated Edges (Overlaid Breakdown)
  for (const edge of evaluatedEdges) {
    const s1 = toScreen(edge.p1);
    const s2 = toScreen(edge.p2);

    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x, s2.y);

    switch (edge.status) {
      case 'matched':
        ctx.strokeStyle = '#22c55e'; // Bright Green
        ctx.lineWidth = 2.5;
        if (edge.expectedLineType === 'hidden') {
          ctx.setLineDash([6, 4]);
        } else {
          ctx.setLineDash([]);
        }
        break;

      case 'missing':
        ctx.strokeStyle = '#ef4444'; // Bright Red
        ctx.lineWidth = 2.5;
        ctx.setLineDash([5, 5]);
        break;

      case 'extra':
        ctx.strokeStyle = '#f59e0b'; // Amber / Orange
        ctx.lineWidth = 2.0;
        ctx.setLineDash([]);
        break;

      case 'wrongType':
        ctx.strokeStyle = '#a855f7'; // Purple
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 3, 2, 3]);
        break;
    }

    ctx.stroke();
  }

  ctx.setLineDash([]);
}
