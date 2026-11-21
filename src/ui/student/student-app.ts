import type { DraftEntity } from '../../draft/types';
import { StudentApiClient } from './api-client';
import { StudentStateManager, createLabProfile } from './state';
import type { ScreenType, StudentProfile } from './types';
import { renderAssignmentsView } from './views/assignments-view';
import { renderLoginView } from './views/login-view';
import { ProblemView } from './views/problem-view';

export interface StudentAppOptions {
  readonly apiClient?: StudentApiClient;
  readonly state?: StudentStateManager;
}

export class StudentApp {
  private container: HTMLElement;
  private state: StudentStateManager;
  private apiClient: StudentApiClient;
  private currentScreen: ScreenType | null = null;
  private problemView: ProblemView | null = null;

  constructor(container: HTMLElement, options: StudentAppOptions = {}) {
    this.container = container;
    this.state = options.state ?? new StudentStateManager();
    this.apiClient = options.apiClient ?? new StudentApiClient();

    if (this.state.student?.token) {
      this.apiClient.setToken(this.state.student.token);
    }
    if (this.state.student?.rollNo) {
      this.apiClient.setRollNo(this.state.student.rollNo);
    }

    this.state.subscribe(() => {
      this.handleStateChange();
    });

    void this.render();
  }

  public getState(): StudentStateManager {
    return this.state;
  }

  public getApiClient(): StudentApiClient {
    return this.apiClient;
  }

  private handleStateChange(): void {
    if (this.state.screen !== this.currentScreen) {
      void this.render();
    } else if (this.currentScreen === 'problem' && this.problemView) {
      this.problemView.updateTime(this.state.timeSpentSec);
      this.problemView.updateOnlineStatus(this.state.isOnline);
    }
  }

  public async render(): Promise<void> {
    const screen = this.state.screen;

    // Dispose problem view if leaving problem screen
    if (this.currentScreen === 'problem' && screen !== 'problem') {
      this.problemView?.dispose();
      this.problemView = null;
    }

    this.currentScreen = screen;

    switch (screen) {
      case 'login':
        this.renderLogin();
        break;

      case 'assignments':
        await this.renderAssignments();
        break;

      case 'problem':
        this.renderProblem();
        break;

      case 'result':
        this.renderResult();
        break;
    }
  }

  private renderLogin(): void {
    renderLoginView(this.container, {
      onLogin: (profile: StudentProfile) => {
        this.apiClient.setToken(profile.token);
        this.state.setStudent(profile);
      },
    });
  }

  private async renderAssignments(): Promise<void> {
    if (!this.state.student) {
      // Shared lab machine: enter with a local profile instead of a login wall.
      this.state.updateStudent(createLabProfile());
      return;
    }

    this.container.innerHTML = `
      <div class="loading-container">
        <div class="spinner"></div>
        <p>Loading course assignments...</p>
      </div>
    `;

    try {
      const assignments = await this.apiClient.getAssignments(this.state.student);

      renderAssignmentsView(this.container, {
        student: this.state.student,
        assignments,
        onOpenAssignment: async (assignmentId: string) => {
          try {
            const { attemptId, problem } = await this.apiClient.createAttempt(assignmentId);
            this.state.setProblemState({
              attemptId,
              assignmentId,
              problem,
              startedAt: Date.now(),
            });
            this.state.setScreen('problem');
          } catch (err) {
            alert(`Error creating attempt: ${(err as Error).message}`);
          }
        },
        onEditStudent: (profile: StudentProfile) => {
          this.apiClient.setToken(profile.token);
          this.apiClient.setRollNo(profile.rollNo);
          this.state.updateStudent(profile);
          // The screen stays 'assignments', so force a render to refresh the header.
          void this.render();
        },
      });
    } catch (err) {
      this.container.innerHTML = `
        <div class="error-container">
          <p>Failed to load assignments: ${(err as Error).message}</p>
          <button id="btn-retry-assignments" class="btn btn-primary">Retry</button>
        </div>
      `;
      this.container.querySelector('#btn-retry-assignments')?.addEventListener('click', () => {
        void this.renderAssignments();
      });
    }
  }

  private renderProblem(): void {
    if (!this.state.student || !this.state.problemState) {
      this.state.setScreen('assignments');
      return;
    }

    this.problemView = new ProblemView(this.container, {
      student: this.state.student,
      problemState: this.state.problemState,
      isOnline: this.state.isOnline,
      timeSpentSec: this.state.timeSpentSec,
      checkFeedback: this.state.checkFeedback,
      onBackToAssignments: () => {
        this.state.setScreen('assignments');
      },
      onCheck: async (entities: readonly DraftEntity[]) => {
        try {
          const feedback = await this.apiClient.checkDrawing(
            this.state.problemState!.attemptId,
            entities,
          );
          this.state.setCheckFeedback(feedback);
          this.problemView?.setCheckFeedback(feedback);
        } catch (err) {
          alert(`Check error: ${(err as Error).message}`);
        }
      },
      onSubmit: async (
        entities: readonly DraftEntity[],
        commandLog: readonly unknown[],
        timeSpentSec: number,
      ) => {
        try {
          const grade = await this.apiClient.submitDrawing(
            this.state.problemState!.attemptId,
            entities,
            commandLog,
            timeSpentSec,
          );
          this.state.setFinalGrade(grade);
          this.state.setScreen('result');
        } catch (err) {
          alert(`Submission error: ${(err as Error).message}`);
        }
      },
    });
  }

  private async renderResult(): Promise<void> {
    if (!this.state.finalGrade || !this.state.problemState) {
      this.state.setScreen('assignments');
      return;
    }

    const { renderResultView } = await import('./views/result-view');
    renderResultView(this.container, {
      grade: this.state.finalGrade,
      problemState: this.state.problemState,
      onReturnToAssignments: () => {
        this.state.setFinalGrade(null);
        this.state.setProblemState(null);
        this.state.setCheckFeedback(null);
        this.state.setScreen('assignments');
      },
    });
  }
}
