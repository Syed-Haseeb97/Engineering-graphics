export interface SubmitModalOptions {
  readonly entityCount: number;
  readonly timeSpentSec: number;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function renderSubmitModal(container: HTMLElement, options: SubmitModalOptions): void {
  const mins = Math.floor(options.timeSpentSec / 60);
  const secs = options.timeSpentSec % 60;
  const timeStr = `${mins}m ${secs}s`;

  container.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop" aria-hidden="true"></div>
    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-alert-text">
      <div class="modal-header">
        <div class="modal-icon-warning" aria-hidden="true">⚠️</div>
        <h3 class="modal-title" id="modal-title">Confirm Final Submission</h3>
      </div>
      <div class="modal-body">
        <p class="modal-alert-text" id="modal-alert-text">
          Are you sure you want to finalize and submit your drawing?
        </p>
        <p class="modal-subtext">
          Once submitted, your attempt will be locked and sent directly to the automated grading engine.
          You will receive your graded scorecard immediately.
        </p>

        <div class="modal-stats-box" role="region" aria-label="Submission summary statistics">
          <div class="stat-item">
            <span class="stat-label">Total Drafted Entities:</span>
            <span class="stat-value" id="modal-entity-count">${options.entityCount}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Session Drafting Time:</span>
            <span class="stat-value" id="modal-time-spent">${timeStr}</span>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-outline" id="btn-cancel-submit" aria-label="Cancel submission and keep working">Keep Working</button>
        <button type="button" class="btn btn-danger" id="btn-confirm-submit" aria-label="Confirm submission and finalize grade">Confirm & Final Submit</button>
      </div>
    </div>
  `;

  const cancelBtn = container.querySelector<HTMLButtonElement>('#btn-cancel-submit');
  const confirmBtn = container.querySelector<HTMLButtonElement>('#btn-confirm-submit');

  const cleanupAndCancel = (): void => {
    window.removeEventListener('keydown', onKeyDown);
    options.onCancel();
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cleanupAndCancel();
    } else if (e.key === 'Tab') {
      // Focus trap between cancel and confirm buttons
      if (e.shiftKey && document.activeElement === cancelBtn) {
        e.preventDefault();
        confirmBtn?.focus();
      } else if (!e.shiftKey && document.activeElement === confirmBtn) {
        e.preventDefault();
        cancelBtn?.focus();
      }
    }
  };

  window.addEventListener('keydown', onKeyDown);

  cancelBtn?.addEventListener('click', cleanupAndCancel);
  container.querySelector('#modal-backdrop')?.addEventListener('click', cleanupAndCancel);
  confirmBtn?.addEventListener('click', () => {
    window.removeEventListener('keydown', onKeyDown);
    options.onConfirm();
  });

  // Shift focus to cancel button for safe keyboard accessibility
  setTimeout(() => cancelBtn?.focus(), 50);
}
