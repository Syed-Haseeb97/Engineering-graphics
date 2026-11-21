import { generateGradesCsv, generateGradesJson, triggerDownload } from '../export';
import type { AssignmentSummary, StudentSubmissionRow } from '../types';

export interface DashboardViewOptions {
  readonly sections: readonly string[];
  readonly selectedSection: string;
  readonly assignments: readonly AssignmentSummary[];
  readonly selectedAssignment: AssignmentSummary | null;
  readonly submissions: readonly StudentSubmissionRow[];
  readonly searchQuery: string;
  readonly statusFilter: 'all' | 'submitted' | 'flagged';
  readonly sortBy: 'rollNo' | 'name' | 'score' | 'timeSpent';
  readonly sortDirection: 'asc' | 'desc';
  readonly onSelectSection: (section: string) => void;
  readonly onSelectAssignment: (assignmentId: string) => void;
  readonly onSearch: (query: string) => void;
  readonly onFilterStatus: (filter: 'all' | 'submitted' | 'flagged') => void;
  readonly onSort: (field: 'rollNo' | 'name' | 'score' | 'timeSpent') => void;
  readonly onReviewSubmission: (studentRow: StudentSubmissionRow) => void;
}

export function renderDashboardView(container: HTMLElement, options: DashboardViewOptions): void {
  const {
    sections,
    selectedSection,
    assignments,
    selectedAssignment,
    submissions,
    searchQuery,
    statusFilter,
    sortBy,
    sortDirection,
    onSelectSection,
    onSelectAssignment,
    onSearch,
    onFilterStatus,
    onSort,
    onReviewSubmission,
  } = options;

  const totalCount = submissions.length;
  const submittedCount = submissions.filter((s) => s.status === 'submitted' || s.status === 'graded').length;
  const gradedCount = submissions.filter((s) => s.status === 'graded').length;
  const flaggedCount = submissions.filter((s) => Boolean(s.similarityFlag) || s.isLate).length;

  const scoresList = submissions.filter((s) => s.score !== null).map((s) => s.score!);
  const avgScore = scoresList.length > 0
    ? (scoresList.reduce((a, b) => a + b, 0) / scoresList.length).toFixed(1)
    : 'N/A';

  const sortArrow = (field: string): string => {
    if (sortBy !== field) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  container.innerHTML = `
    <div class="dashboard-wrapper">
      <!-- Controls Topbar: Section Picker, Assignment Picker & Exports -->
      <section class="dashboard-controls-card">
        <div class="controls-left">
          <div class="control-unit">
            <label for="select-section" class="control-label">Class Section</label>
            <select id="select-section" class="form-control select-section">
              <option value="ALL" ${selectedSection === 'ALL' ? 'selected' : ''}>All Assigned Sections</option>
              ${sections
                .map((sec) => `<option value="${sec}" ${selectedSection === sec ? 'selected' : ''}>Section ${sec}</option>`)
                .join('')}
            </select>
          </div>

          <div class="control-unit">
            <label for="select-assignment" class="control-label">Active Problem Assignment</label>
            <select id="select-assignment" class="form-control select-assignment">
              ${assignments
                .map((asg) => `
                  <option value="${asg.id}" ${selectedAssignment?.id === asg.id ? 'selected' : ''}>
                    ${asg.title} (Sec ${asg.section})
                  </option>
                `)
                .join('')}
            </select>
          </div>
        </div>

        <div class="controls-right" role="toolbar" aria-label="Export options">
          <button id="btn-export-csv" class="btn btn-outline" title="Export grades to RFC-4180 CSV" aria-label="Export CSV (RFC-4180 file)">
            <span aria-hidden="true">📥</span> Export CSV
          </button>
          <button id="btn-export-json" class="btn btn-outline" title="Export grades to structured JSON" aria-label="Export JSON (structured file)">
            <span aria-hidden="true">📥</span> Export JSON
          </button>
        </div>
      </section>

      <!-- Cohort Summary Metric Cards -->
      <section class="metrics-summary-grid" role="region" aria-label="Cohort performance metrics">
        <div class="summary-card">
          <span class="card-num">${totalCount}</span>
          <span class="card-caption">Total Enrolled</span>
        </div>
        <div class="summary-card">
          <span class="card-num">${submittedCount}</span>
          <span class="card-caption">Submissions</span>
        </div>
        <div class="summary-card">
          <span class="card-num">${gradedCount}</span>
          <span class="card-caption">Graded</span>
        </div>
        <div class="summary-card highlight-card">
          <span class="card-num">${avgScore}${avgScore !== 'N/A' ? '%' : ''}</span>
          <span class="card-caption">Class Average Score</span>
        </div>
        <div class="summary-card ${flaggedCount > 0 ? 'warning-card' : ''}">
          <span class="card-num">${flaggedCount}</span>
          <span class="card-caption">Flags for Review</span>
        </div>
      </section>

      <!-- Table Filters & Search Bar -->
      <section class="table-actions-bar" role="search" aria-label="Student search and filter toolbar">
        <div class="search-box">
          <input
            type="text"
            id="input-search-student"
            class="form-control input-search"
            aria-label="Search students by name or roll number"
            placeholder="Search by student name or roll number..."
            value="${searchQuery}"
          />
        </div>

        <div class="filter-tabs-group" role="tablist" aria-label="Submission status filter tabs">
          <button class="tab-btn ${statusFilter === 'all' ? 'active' : ''}" role="tab" aria-selected="${statusFilter === 'all'}" data-filter="all">
            All Students (${totalCount})
          </button>
          <button class="tab-btn ${statusFilter === 'submitted' ? 'active' : ''}" role="tab" aria-selected="${statusFilter === 'submitted'}" data-filter="submitted">
            Submitted (${submittedCount})
          </button>
          <button class="tab-btn ${statusFilter === 'flagged' ? 'active' : ''}" role="tab" aria-selected="${statusFilter === 'flagged'}" data-filter="flagged">
            Review Flags (${flaggedCount})
          </button>
        </div>
      </section>

      <!-- Per-Assignment Student Submissions Table -->
      <section class="table-card">
        <div class="table-responsive">
          <table class="submissions-table" id="table-submissions">
            <thead>
              <tr>
                <th class="sortable-th" data-sort="rollNo">Roll No ${sortArrow('rollNo')}</th>
                <th class="sortable-th" data-sort="name">Student Name ${sortArrow('name')}</th>
                <th>Section</th>
                <th>Status</th>
                <th class="sortable-th" data-sort="score">Score ${sortArrow('score')}</th>
                <th>Hint Usage</th>
                <th class="sortable-th" data-sort="timeSpent">Time Spent ${sortArrow('timeSpent')}</th>
                <th>Flags / Alerts</th>
                <th class="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              ${submissions.length === 0
                ? `<tr><td colspan="9" class="empty-table-cell">No student records match the selected filter.</td></tr>`
                : submissions
                    .map((sub) => {
                      const mins = Math.floor(sub.timeSpentSec / 60);
                      const secs = sub.timeSpentSec % 60;
                      const timeStr = sub.timeSpentSec > 0 ? `${mins}m ${secs}s` : '—';
                      const scoreStr = sub.score !== null ? `${Math.round(sub.score)}%` : '—';

                      return `
                        <tr class="student-row" id="row-${sub.rollNo}" data-student-id="${sub.studentId}">
                          <td class="font-mono">${sub.rollNo}</td>
                          <td class="font-medium">${sub.name}</td>
                          <td><span class="badge badge-section">Sec ${sub.section}</span></td>
                          <td>
                            <span class="badge badge-status-${sub.status}">
                              ${sub.status.replace(/_/g, ' ').toUpperCase()}
                            </span>
                          </td>
                          <td class="font-bold score-cell">${scoreStr}</td>
                          <td>
                            ${sub.hintsUsed > 0
                              ? `<span class="badge badge-hint">${sub.hintsUsed} hint(s)</span>`
                              : '<span class="text-muted">0</span>'}
                          </td>
                          <td class="font-mono text-sm">${timeStr}</td>
                          <td class="flags-cell">
                            ${sub.isLate ? `<span class="badge badge-danger">LATE</span>` : ''}
                            ${sub.similarityFlag
                              ? `
                                <span
                                  class="badge badge-warning similarity-flag-pill"
                                  title="Flagged for manual review. ${sub.similarityFlag.similarityScore}% geometric similarity with ${sub.similarityFlag.partnerName}"
                                >
                                  ⚠️ Review (${sub.similarityFlag.similarityScore}% match with ${sub.similarityFlag.partnerRollNo})
                                </span>
                              `
                              : ''}
                            ${!sub.isLate && !sub.similarityFlag ? '<span class="text-muted">—</span>' : ''}
                          </td>
                          <td class="text-right">
                            ${sub.status === 'submitted' || sub.status === 'graded'
                              ? `
                                <button
                                  class="btn btn-sm btn-outline btn-review-sub"
                                  data-student-id="${sub.studentId}"
                                  id="btn-review-${sub.rollNo}"
                                >
                                  Review Drawing
                                </button>
                              `
                              : `<span class="text-muted text-sm">Not Submitted</span>`}
                          </td>
                        </tr>
                      `;
                    })
                    .join('')}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;

  // Section Selector Change
  container.querySelector('#select-section')?.addEventListener('change', (e) => {
    const val = (e.target as HTMLSelectElement).value;
    onSelectSection(val);
  });

  // Assignment Selector Change
  container.querySelector('#select-assignment')?.addEventListener('change', (e) => {
    const val = (e.target as HTMLSelectElement).value;
    onSelectAssignment(val);
  });

  // Search Input
  const searchInput = container.querySelector('#input-search-student') as HTMLInputElement | null;
  searchInput?.addEventListener('input', () => {
    onSearch(searchInput.value);
  });

  // Status Filter Tabs
  container.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const filter = btn.getAttribute('data-filter') as 'all' | 'submitted' | 'flagged';
      if (filter) onFilterStatus(filter);
    });
  });

  // Sortable Table Headers
  container.querySelectorAll('.sortable-th').forEach((th) => {
    th.addEventListener('click', () => {
      const field = th.getAttribute('data-sort') as 'rollNo' | 'name' | 'score' | 'timeSpent';
      if (field) onSort(field);
    });
  });

  // Review Buttons
  container.querySelectorAll('.btn-review-sub').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-student-id');
      const studentRow = submissions.find((s) => s.studentId === id);
      if (studentRow) onReviewSubmission(studentRow);
    });
  });

  // Export CSV Action
  container.querySelector('#btn-export-csv')?.addEventListener('click', () => {
    if (!selectedAssignment) return;
    const csv = generateGradesCsv(selectedAssignment, submissions);
    triggerDownload(csv, `grades_${selectedAssignment.templateId}_sec${selectedAssignment.section}.csv`, 'text/csv');
  });

  // Export JSON Action
  container.querySelector('#btn-export-json')?.addEventListener('click', () => {
    if (!selectedAssignment) return;
    const json = generateGradesJson(selectedAssignment, submissions);
    triggerDownload(
      json,
      `grades_${selectedAssignment.templateId}_sec${selectedAssignment.section}.json`,
      'application/json',
    );
  });
}
