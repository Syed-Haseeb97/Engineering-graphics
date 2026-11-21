import type {
  CheckFeedback,
  FinalGradeResult,
  ProblemState,
  ScreenType,
  StudentProfile,
} from './types';

const STORAGE_KEY_PROFILE = 'eg_student_profile';
const STORAGE_KEY_PROBLEM = 'eg_student_problem';

/**
 * Lab machines are shared and must not present a login wall. A local profile is
 * created automatically; the student can personalise it from the assignments
 * screen so submissions still carry a name and roll number.
 */
export function createLabProfile(): StudentProfile {
  return {
    id: 'lab-local',
    email: 'lab@local',
    rollNo: 'LAB',
    name: 'Lab Student',
    section: 'A',
    token: 'lab-demo',
  };
}

export class StudentStateManager {
  public student: StudentProfile | null = null;
  public screen: ScreenType = 'assignments';
  public problemState: ProblemState | null = null;
  public checkFeedback: CheckFeedback | null = null;
  public finalGrade: FinalGradeResult | null = null;
  public isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  public timeSpentSec = 0;
  private timerInterval: number | null = null;

  private listeners: Array<() => void> = [];

  constructor() {
    this.restoreSession();
    this.bindNetworkEvents();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private bindNetworkEvents(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.notify();
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.notify();
      });
    }
  }

  private restoreSession(): void {
    if (typeof window === 'undefined') {
      this.student = createLabProfile();
      this.screen = 'assignments';
      return;
    }

    try {
      const savedProfile = localStorage.getItem(STORAGE_KEY_PROFILE);
      if (savedProfile) {
        this.student = JSON.parse(savedProfile) as StudentProfile;
      }

      const savedProblem = localStorage.getItem(STORAGE_KEY_PROBLEM);
      if (savedProblem) {
        this.problemState = JSON.parse(savedProblem) as ProblemState;
      }
    } catch {
      // Fall through to a fresh local profile if localStorage is corrupt.
    }

    // First visit on a shared lab machine: enter immediately, no credentials.
    if (!this.student) {
      this.student = createLabProfile();
      localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(this.student));
    }

    if (this.problemState) {
      // Resume the drawing that was open when the browser/tab was closed.
      this.screen = 'problem';
      const elapsed = Math.max(0, Math.floor((Date.now() - this.problemState.startedAt) / 1000));
      this.startTimer(elapsed);
    } else {
      this.screen = 'assignments';
    }
  }

  /** Update the local lab profile without any authentication step. */
  public updateStudent(profile: StudentProfile): void {
    this.student = profile;
    this.screen = 'assignments';
    this.problemState = null;
    this.checkFeedback = null;
    this.finalGrade = null;
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(profile));
      localStorage.removeItem(STORAGE_KEY_PROBLEM);
    }
    this.stopTimer();
    this.notify();
  }

  public setStudent(profile: StudentProfile | null): void {
    if (profile) {
      this.updateStudent(profile);
      return;
    }

    this.student = null;
    this.problemState = null;
    this.screen = 'login';
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY_PROFILE);
      localStorage.removeItem(STORAGE_KEY_PROBLEM);
    }
    this.notify();
  }

  public setScreen(screen: ScreenType): void {
    this.screen = screen;
    this.notify();
  }

  public setProblemState(problem: ProblemState | null): void {
    this.problemState = problem;
    if (typeof window !== 'undefined') {
      if (problem) {
        localStorage.setItem(STORAGE_KEY_PROBLEM, JSON.stringify(problem));
        this.startTimer();
      } else {
        localStorage.removeItem(STORAGE_KEY_PROBLEM);
        this.stopTimer();
      }
    }
    this.notify();
  }

  public setCheckFeedback(feedback: CheckFeedback | null): void {
    this.checkFeedback = feedback;
    this.notify();
  }

  public setFinalGrade(grade: FinalGradeResult | null): void {
    this.finalGrade = grade;
    this.stopTimer();
    this.notify();
  }

  public startTimer(initialSeconds = 0): void {
    this.stopTimer();
    this.timeSpentSec = Math.max(0, Math.floor(initialSeconds));
    if (typeof window !== 'undefined') {
      this.timerInterval = window.setInterval(() => {
        this.timeSpentSec++;
        this.notify();
      }, 1000);
    }
  }

  public stopTimer(): void {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }
}
