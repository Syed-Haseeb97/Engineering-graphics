import type { GeneratedHint } from '../../checker/hints';
import type { StudentProblemPayload } from '../../problems/types';

export type ScreenType = 'login' | 'assignments' | 'problem' | 'result';

export interface StudentProfile {
  readonly id: string;
  readonly email: string;
  readonly rollNo: string;
  readonly name: string;
  readonly section: string;
  readonly token: string;
}

export type AssignmentStatus = 'open' | 'due' | 'submitted' | 'graded';

export interface AssignmentItem {
  readonly id: string;
  readonly templateId: string;
  readonly title: string;
  readonly section: string;
  readonly opensAt: string;
  readonly dueAt: string;
  readonly maxMarks: number;
  readonly status: AssignmentStatus;
  readonly attemptId?: string;
  readonly score?: number;
}

export interface ProblemState {
  readonly attemptId: string;
  readonly assignmentId: string;
  readonly problem: StudentProblemPayload;
  readonly startedAt: number; // Client timestamp in ms
}

export interface CheckFeedback {
  readonly score: number;
  /** Present when the preview came from the offline structural checker. */
  readonly mode?: 'server' | 'local';
  readonly metrics: {
    readonly recall: number;
    readonly precision: number;
    readonly lineType: number;
    readonly dimensions: number;
  };
  readonly hints: readonly GeneratedHint[];
  readonly summary: {
    readonly totalExpectedEdges: number;
    readonly matchedEdges: number;
    readonly missingEdges: number;
    readonly extraEdges: number;
    readonly wrongTypeEdges: number;
  };
}

export interface FinalGradeResult {
  readonly submissionId: string;
  readonly gradeId: string;
  readonly score: number;
  readonly breakdown: Record<string, number>;
  readonly feedback: string;
  readonly isLate: boolean;
  readonly timeSpentSec: number;
  /** Present when the result was produced offline by the local lab fallback. */
  readonly mode?: 'server' | 'local';
}
