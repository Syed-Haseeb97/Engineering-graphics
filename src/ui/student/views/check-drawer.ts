import type { CheckFeedback } from '../types';

export interface CheckDrawerOptions {
  readonly feedback: CheckFeedback;
  readonly onClose: () => void;
}

export function renderCheckDrawer(container: HTMLElement, options: CheckDrawerOptions): void {
  const { feedback } = options;

  container.innerHTML = `
    <div class="drawer-overlay" id="drawer-overlay" aria-hidden="true"></div>
    <div class="drawer-panel" id="drawer-panel" role="complementary" aria-label="Inspection preview and pedagogical feedback drawer">
      <div class="drawer-header">
        <div class="drawer-title-row">
          <span class="drawer-badge" role="text">Inspection Preview</span>
          <button class="drawer-close-btn" id="btn-close-drawer" aria-label="Close feedback panel (Escape)">&times;</button>
        </div>
        <div class="score-summary-card">
          <div class="score-circle">
            <span class="score-value" id="preview-score-value">${Math.round(feedback.score)}%</span>
            <span class="score-label">Preview Score</span>
          </div>
          <div class="metrics-grid">
            <div class="metric-item">
              <span class="metric-title">Recall (Edges)</span>
              <span class="metric-num">${Math.round(feedback.metrics.recall * 100)}%</span>
            </div>
            <div class="metric-item">
              <span class="metric-title">Precision</span>
              <span class="metric-num">${Math.round(feedback.metrics.precision * 100)}%</span>
            </div>
            <div class="metric-item">
              <span class="metric-title">Line Styles</span>
              <span class="metric-num">${Math.round(feedback.metrics.lineType * 100)}%</span>
            </div>
          </div>
        </div>
      </div>

      <div class="drawer-body">
        ${feedback.mode === 'local' ? `
          <div class="local-mode-note">
            <strong>Offline lab mode.</strong> The classroom server is not connected, so this
            is a structural completeness review — not the official geometric grade.
          </div>
        ` : ''}
        <h4 class="section-title">Pedagogical Feedback & Guidance</h4>
        <p class="section-desc">Hints are graduated from general pointers to specific technical drawing rules.</p>

        <div class="hints-list" id="hints-list">
          ${feedback.hints.length === 0
            ? `<div class="empty-hints">✨ Excellent work! No drawing defects detected.</div>`
            : feedback.hints
                .map((hint, index) => {
                  return `
                    <div class="hint-card" id="hint-card-${index}" data-hint-id="${hint.id}">
                      <div class="hint-card-header">
                        <span class="badge badge-hint-view">${hint.view} VIEW</span>
                        ${hint.count > 1 ? `<span class="badge badge-count">${hint.count} instances</span>` : ''}
                      </div>

                      <div class="hint-levels">
                        <div class="hint-level level-1 active" id="hint-l1-${index}">
                          <span class="level-indicator">Level 1 (Where)</span>
                          <p class="hint-text">${hint.level1}</p>
                        </div>
                        <div class="hint-level level-2" id="hint-l2-${index}" style="display: none;">
                          <span class="level-indicator">Level 2 (What)</span>
                          <p class="hint-text">${hint.level2}</p>
                        </div>
                        <div class="hint-level level-3" id="hint-l3-${index}" style="display: none;">
                          <span class="level-indicator">Level 3 (Standard Concept)</span>
                          <p class="hint-text">${hint.level3}</p>
                        </div>
                      </div>

                      <div class="hint-actions">
                        <button class="btn btn-sm btn-outline btn-unlock-hint" data-index="${index}" id="btn-unlock-${index}">
                          Unlock Next Hint Level
                        </button>
                      </div>
                    </div>
                  `;
                })
                .join('')}
        </div>
      </div>
    </div>
  `;

  // Close bindings & Keyboard Escape handling
  const closeBtn = container.querySelector<HTMLButtonElement>('#btn-close-drawer');

  const cleanupAndClose = (): void => {
    window.removeEventListener('keydown', onKeyDown);
    options.onClose();
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cleanupAndClose();
    }
  };

  window.addEventListener('keydown', onKeyDown);
  closeBtn?.addEventListener('click', cleanupAndClose);
  container.querySelector('#drawer-overlay')?.addEventListener('click', cleanupAndClose);

  // Set focus to drawer close button for immediate keyboard accessibility
  setTimeout(() => closeBtn?.focus(), 50);

  // Progressive Hint Unlocking
  const unlockButtons = container.querySelectorAll('.btn-unlock-hint');
  unlockButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = btn.getAttribute('data-index');
      if (idx === null) return;
      const l2 = container.querySelector(`#hint-l2-${idx}`) as HTMLElement;
      const l3 = container.querySelector(`#hint-l3-${idx}`) as HTMLElement;

      if (l2 && l2.style.display === 'none') {
        l2.style.display = 'block';
        btn.textContent = 'Unlock Conceptual Rule (Level 3)';
      } else if (l3 && l3.style.display === 'none') {
        l3.style.display = 'block';
        (btn as HTMLButtonElement).disabled = true;
        btn.textContent = 'All Hint Levels Unlocked';
      }
    });
  });
}
