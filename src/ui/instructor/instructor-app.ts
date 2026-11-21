import type { ProblemTemplate } from '../../problems/types';
import { InstructorApiClient } from './api-client';
import { InstructorStateManager } from './state';
import type { AssignmentCreatePayload, InstructorTab, StudentSubmissionRow } from './types';
import { renderDashboardView } from './views/dashboard-view';
import { renderReviewModal } from './views/review-modal';

export interface InstructorAppOptions {
  readonly apiClient?: InstructorApiClient;
  readonly state?: InstructorStateManager;
}

export class InstructorApp {
  private container: HTMLElement;
  private state: InstructorStateManager;
  private apiClient: InstructorApiClient;
  private modalContainer: HTMLElement | null = null;
  private contentContainer: HTMLElement | null = null;

  constructor(container: HTMLElement, options: InstructorAppOptions = {}) {
    this.container = container;
    this.state = options.state ?? new InstructorStateManager();
    this.apiClient = options.apiClient ?? new InstructorApiClient();

    if (this.state.instructor.token) {
      this.apiClient.setToken(this.state.instructor.token);
    }

    this.state.subscribe(() => {
      void this.renderContent();
    });

    this.initShell();
    void this.loadInitialData();
  }

  public getState(): InstructorStateManager {
    return this.state;
  }

  public getApiClient(): InstructorApiClient {
    return this.apiClient;
  }

  private initShell(): void {
    this.container.innerHTML = `
      <div class="instructor-app-wrapper">
        <header class="app-navbar">
          <div class="navbar-brand">
            <span class="navbar-logo">📐</span>
            <h1 class="navbar-title">Instructor Assessment & Authoring Studio</h1>
          </div>

          <div class="navbar-center-tabs">
            <button class="nav-tab active" id="tab-btn-dashboard" data-tab="dashboard">
              📊 Cohort Dashboard & Review
            </button>
            <button class="nav-tab" id="tab-btn-authoring" data-tab="authoring">
              ✏️ Problem Authoring
            </button>
          </div>

          <div class="navbar-user">
            <span class="badge badge-section">Faculty Mode</span>
            <span class="user-name" id="user-display-name">${this.state.instructor.name}</span>
          </div>
        </header>

        <main class="instructor-main-content" id="instructor-main-content">
          <div class="loading-container">
            <div class="spinner"></div>
            <p>Loading course dashboard and student submissions...</p>
          </div>
        </main>

        <div id="review-modal-container"></div>
      </div>
    `;

    this.contentContainer = this.container.querySelector('#instructor-main-content');
    this.modalContainer = this.container.querySelector('#review-modal-container');

    // Tab buttons
    this.container.querySelectorAll('.nav-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab') as InstructorTab;
        if (tab) {
          this.container.querySelectorAll('.nav-tab').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          this.state.setTab(tab);
        }
      });
    });
  }

  private async loadInitialData(): Promise<void> {
    try {
      const assignments = await this.apiClient.getAssignments(this.state.selectedSection);
      this.state.setAssignments(assignments);

      if (this.state.selectedAssignmentId) {
        const submissions = await this.apiClient.getAssignmentSubmissions(this.state.selectedAssignmentId);
        this.state.setSubmissions(submissions);
      }
    } catch (err) {
      console.warn('[InstructorApp] Initial data loading note:', err);
    }

    void this.renderContent();
  }

  private async renderContent(): Promise<void> {
    if (!this.contentContainer) return;

    if (this.state.activeTab === 'authoring') {
      const { AuthoringView } = await import('./views/authoring-view');
      new AuthoringView(this.contentContainer, {
        onSaveTemplate: async (template: ProblemTemplate) => {
          await this.apiClient.saveProblemTemplate(template);
        },
        onCreateAssignment: async (templateId: string, section: string, dueAt: string, maxMarks: number) => {
          const payload: AssignmentCreatePayload = { templateId, section, dueAt, maxMarks };
          await this.apiClient.createAssignment(payload);
          await this.loadInitialData();
          this.state.setTab('dashboard');
        },
      });
      return;
    }

    // Dashboard Tab
    const selectedAssignment = this.state.assignments.find((a) => a.id === this.state.selectedAssignmentId) ?? null;
    const visibleSubmissions = this.state.getVisibleSubmissions();

    renderDashboardView(this.contentContainer, {
      sections: this.state.instructor.sections,
      selectedSection: this.state.selectedSection,
      assignments: this.state.assignments,
      selectedAssignment,
      submissions: visibleSubmissions,
      searchQuery: this.state.searchQuery,
      statusFilter: this.state.statusFilter,
      sortBy: this.state.sortBy,
      sortDirection: this.state.sortDirection,
      onSelectSection: async (section: string) => {
        this.state.setSection(section);
        const asgs = await this.apiClient.getAssignments(section);
        this.state.setAssignments(asgs);
        if (this.state.selectedAssignmentId) {
          const subs = await this.apiClient.getAssignmentSubmissions(this.state.selectedAssignmentId);
          this.state.setSubmissions(subs);
        }
      },
      onSelectAssignment: async (assignmentId: string) => {
        this.state.selectAssignment(assignmentId);
        const subs = await this.apiClient.getAssignmentSubmissions(assignmentId);
        this.state.setSubmissions(subs);
      },
      onSearch: (q: string) => {
        this.state.setSearchQuery(q);
      },
      onFilterStatus: (filter) => {
        this.state.setStatusFilter(filter);
      },
      onSort: (field) => {
        this.state.setSorting(field);
      },
      onReviewSubmission: async (studentRow: StudentSubmissionRow) => {
        const details = await this.apiClient.getSubmissionReviewDetails(studentRow);
        this.state.openReview(details);
        this.openReviewModal();
      },
    });

    if (this.state.activeReviewDetails) {
      this.openReviewModal();
    }
  }

  private openReviewModal(): void {
    if (!this.modalContainer || !this.state.activeReviewDetails) return;

    renderReviewModal(this.modalContainer, {
      details: this.state.activeReviewDetails,
      onClose: () => {
        this.state.closeReview();
        if (this.modalContainer) this.modalContainer.innerHTML = '';
      },
      onSaveOverride: async (score: number, comment: string) => {
        const gradeId = this.state.activeReviewDetails?.studentRow.gradeId ?? 'grd_override';
        await this.apiClient.overrideGrade(gradeId, score, comment);
        this.state.updateGradeInState(gradeId, score, comment, this.state.instructor.id);
      },
    });
  }
}
