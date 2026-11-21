import type { AssignmentItem, StudentProfile } from '../types';

export interface AssignmentsViewOptions {
  readonly student: StudentProfile;
  readonly assignments: readonly AssignmentItem[];
  readonly onOpenAssignment: (assignmentId: string) => void;
  readonly onEditStudent: (profile: StudentProfile) => void;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char] ?? char,
  );
}

export function renderAssignmentsView(
  container: HTMLElement,
  options: AssignmentsViewOptions,
): void {
  const { student, assignments } = options;
  const safeName = escapeHtml(student.name);
  const safeRoll = escapeHtml(student.rollNo);
  const safeSection = escapeHtml(student.section);

  container.innerHTML = `
    <div class="assignments-wrapper">
      <header class="app-navbar">
        <div class="navbar-brand">
          <span class="navbar-logo">📐</span>
          <span class="navbar-title">Engineering Graphics</span>
        </div>
        <div class="navbar-user">
          <div class="user-meta">
            <span class="user-name" id="user-display-name">${safeName}</span>
            <span class="badge badge-section">Section ${safeSection}</span>
            <span class="user-roll">${safeRoll}</span>
            <span class="badge badge-neutral" title="No sign-in required on this computer">Lab mode</span>
          </div>
          <button id="btn-edit-student" class="btn btn-outline btn-sm">Student details</button>
        </div>
      </header>

      <main class="assignments-content">
        <div class="assignments-header">
          <div>
            <h1 class="page-title">Course Assignments</h1>
            <p class="page-subtitle">Select an assigned problem to begin or resume your drafting session.</p>
          </div>
          <div class="assignments-filter-tabs">
            <button class="tab-btn active" data-filter="all">All (${assignments.length})</button>
            <button class="tab-btn" data-filter="open">Open</button>
            <button class="tab-btn" data-filter="due">Due Soon</button>
          </div>
        </div>

        <div class="assignments-grid" id="assignments-grid">
          ${assignments
            .map((asg) => {
              const dueStr = new Date(asg.dueAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });
              const isOverdue = new Date() > new Date(asg.dueAt);

              return `
                <div class="assignment-card" data-status="${asg.status}">
                  <div class="card-header">
                    <span class="badge badge-${asg.status === 'open' ? 'success' : 'warning'}">
                      ${asg.status.toUpperCase()}
                    </span>
                    <span class="card-marks">Max Marks: ${asg.maxMarks}</span>
                  </div>
                  <h2 class="card-title">${asg.title}</h2>
                  <div class="card-meta">
                    <div class="meta-row">
                      <span class="meta-label">Section:</span>
                      <span class="meta-value">${asg.section}</span>
                    </div>
                    <div class="meta-row">
                      <span class="meta-label">Due Date:</span>
                      <span class="meta-value ${isOverdue ? 'text-danger' : ''}">${dueStr}</span>
                    </div>
                  </div>
                  <div class="card-actions">
                    <button
                      class="btn btn-primary btn-block btn-start-assignment"
                      data-id="${asg.id}"
                      id="btn-start-${asg.id}"
                    >
                      Start / Resume Assignment
                    </button>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </main>

      <div id="student-details-modal" style="display: none">
        <div class="modal-backdrop" data-close-student-modal></div>
        <div
          class="modal-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="student-details-title"
        >
          <div class="modal-header">
            <span class="modal-icon-warning">👤</span>
            <h2 class="modal-title" id="student-details-title">Student details</h2>
          </div>
          <p class="modal-subtext">
            This computer is in lab mode, so no sign-in is needed. Your name and roll
            number are only used to label the work you submit.
          </p>
          <form id="student-details-form">
            <div class="form-group">
              <label class="form-label" for="student-name-input">Full name</label>
              <input
                class="form-control"
                id="student-name-input"
                name="name"
                type="text"
                value="${safeName}"
                autocomplete="name"
                required
              />
            </div>
            <div class="form-group">
              <label class="form-label" for="student-roll-input">Roll number</label>
              <input
                class="form-control"
                id="student-roll-input"
                name="rollNo"
                type="text"
                value="${safeRoll}"
                autocomplete="off"
                required
              />
            </div>
            <div class="form-group">
              <label class="form-label" for="student-section-input">Section</label>
              <input
                class="form-control"
                id="student-section-input"
                name="section"
                type="text"
                value="${safeSection}"
                autocomplete="off"
                required
              />
            </div>
            <div class="modal-footer">
              <button type="button" id="btn-cancel-student" class="btn btn-outline">Cancel</button>
              <button type="submit" class="btn btn-primary">Save details</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  const modal = container.querySelector<HTMLElement>('#student-details-modal');
  const form = container.querySelector<HTMLFormElement>('#student-details-form');

  const closeModal = (): void => {
    if (modal) modal.style.display = 'none';
  };

  container.querySelector('#btn-edit-student')?.addEventListener('click', () => {
    if (modal) modal.style.display = 'block';
    container.querySelector<HTMLInputElement>('#student-name-input')?.focus();
  });

  container.querySelector('#btn-cancel-student')?.addEventListener('click', closeModal);
  container.querySelector('[data-close-student-modal]')?.addEventListener('click', closeModal);

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const name = String(formData.get('name') ?? '').trim();
    const rollNo = String(formData.get('rollNo') ?? '').trim();
    const section = String(formData.get('section') ?? '').trim();

    if (!name || !rollNo || !section) return;

    options.onEditStudent({
      ...student,
      name,
      rollNo,
      section,
    });
    closeModal();
  });

  // Keyboard: Escape closes the modal.
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && modal?.style.display === 'block') {
      closeModal();
    }
  };
  container.ownerDocument.addEventListener('keydown', onKeyDown);

  // Bind Start Problem buttons
  const startButtons = container.querySelectorAll('.btn-start-assignment');
  startButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      if (id) {
        options.onOpenAssignment(id);
      }
    });
  });

  // Filter Tabs
  const tabs = container.querySelectorAll('.tab-btn');
  const cards = container.querySelectorAll('.assignment-card');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const filter = tab.getAttribute('data-filter');

      cards.forEach((card) => {
        const cardStatus = card.getAttribute('data-status');
        if (filter === 'all' || cardStatus === filter) {
          (card as HTMLElement).style.display = 'flex';
        } else {
          (card as HTMLElement).style.display = 'none';
        }
      });
    });
  });
}
