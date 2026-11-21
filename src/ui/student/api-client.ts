import type { DraftEntity } from '../../draft/types';
import type { StudentProblemPayload } from '../../problems/types';
import {
  createLocalAttempt,
  createLocalGrade,
  localCheckPreview,
} from './local-demo';
import type {
  AssignmentItem,
  CheckFeedback,
  FinalGradeResult,
  StudentProfile,
} from './types';

function sanitizeEntity(e: DraftEntity): DraftEntity {
  const copy = { ...e } as Record<string, unknown>;
  delete copy['created'];
  delete copy['commandName'];
  delete copy['payload'];
  delete copy['deletedIds'];
  delete copy['updated'];
  return copy as unknown as DraftEntity;
}

export class StudentApiClient {
  private token: string | null = null;
  private rollNo = 'LAB';
  public baseUrl: string;

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  public setToken(token: string | null): void {
    this.token = token;
  }

  /** Roll number used to derive deterministic offline demo problems. */
  public setRollNo(rollNo: string): void {
    this.rollNo = rollNo.trim() || 'LAB';
  }

  public getToken(): string | null {
    return this.token;
  }

  private getHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  /**
   * Create attempt for an assignment.
   */
  public async createAttempt(
    assignmentId: string,
  ): Promise<{ attemptId: string; problem: StudentProblemPayload }> {
    try {
      const res = await fetch(`${this.baseUrl}/attempts`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ assignment_id: assignmentId }),
      });

      if (res.ok) {
        return (await res.json()) as { attemptId: string; problem: StudentProblemPayload };
      }
    } catch {
      // Local classroom demo when the grading API is not running.
    }
    return createLocalAttempt(assignmentId, this.rollNo);
  }

  /**
   * Preview check drawing with plain-language hints (Rate limited, does not final grade).
   */
  public async checkDrawing(
    attemptId: string,
    entities: readonly DraftEntity[],
  ): Promise<CheckFeedback> {
    const sanitized = entities.map(sanitizeEntity);
    try {
      const res = await fetch(`${this.baseUrl}/attempts/${attemptId}/check`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ drawing_json: { entities: sanitized } }),
      });

      if (res.ok) {
        return (await res.json()) as CheckFeedback;
      }
    } catch {
      // Fall through to local completeness preview (no ground-truth).
    }
    return localCheckPreview(sanitized);
  }

  /**
   * Submit drawing for final automated grading.
   */
  public async submitDrawing(
    attemptId: string,
    entities: readonly DraftEntity[],
    commandLog: readonly unknown[] = [],
    timeSpentSec = 0,
  ): Promise<FinalGradeResult> {
    const sanitized = entities.map(sanitizeEntity);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/attempts/${attemptId}/submit`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          drawing_json: {
            entities: sanitized,
            commandLog,
            timeSpentSec,
          },
        }),
      });
    } catch {
      // No classroom server on this lab machine — keep the student's work and
      // give the structural local review instead of failing the submission.
      return createLocalGrade(sanitized, timeSpentSec);
    }

    if (!res.ok) {
      if (res.status >= 500 || res.status === 404) {
        return createLocalGrade(sanitized, timeSpentSec);
      }
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Submit failed (HTTP ${res.status}).`);
    }

    const data = (await res.json()) as {
      submissionId: string;
      gradeId: string;
      score: number;
      breakdown: Record<string, number>;
      feedback: string;
      isLate: boolean;
    };

    return {
      submissionId: data.submissionId,
      gradeId: data.gradeId,
      score: data.score,
      breakdown: data.breakdown,
      feedback: data.feedback,
      isLate: data.isLate,
      timeSpentSec,
      mode: 'server',
    };
  }

  /**
   * Fetch details for an existing attempt.
   */
  public async getAttempt(attemptId: string): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/attempts/${attemptId}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Failed to fetch attempt (HTTP ${res.status}).`);
    }

    return await res.json();
  }

  /**
   * Query student assignments list.
   */
  public async getAssignments(student: StudentProfile): Promise<readonly AssignmentItem[]> {
    // In local dev / E2E, fallback to seeded demo assignments matching student's section
    const now = Date.now();
    const dayMs = 86400_000;

    return [
      {
        id: '10000000-0000-0000-0000-000000000001',
        templateId: 'cone_inclined_both',
        title: 'Problem 1: Cone with Axis Inclined to Both Planes',
        section: student.section,
        opensAt: new Date(now - 2 * dayMs).toISOString(),
        dueAt: new Date(now + 3 * dayMs).toISOString(),
        maxMarks: 100,
        status: 'open',
      },
      {
        id: '10000000-0000-0000-0000-000000000002',
        templateId: 'prism_inclined_hp',
        title: 'Problem 2: Square Prism Resting on Base Edge',
        section: student.section,
        opensAt: new Date(now - 1 * dayMs).toISOString(),
        dueAt: new Date(now + 4 * dayMs).toISOString(),
        maxMarks: 100,
        status: 'open',
      },
      {
        id: '10000000-0000-0000-0000-000000000003',
        templateId: 'line_inclined_both',
        title: 'Problem 3: Straight Line Inclined to Both HP and VP',
        section: student.section,
        opensAt: new Date(now - 5 * dayMs).toISOString(),
        dueAt: new Date(now - 1 * dayMs).toISOString(),
        maxMarks: 100,
        status: 'due',
      },
    ];
  }
}
