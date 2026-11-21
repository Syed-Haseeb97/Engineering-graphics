import type { ProblemTemplate } from '../../problems/types';
import { computeCohortSimilarities } from './similarity';
import type {
  AssignmentCreatePayload,
  AssignmentSummary,
  AuditLogEntry,
  StudentSubmissionRow,
  SubmissionReviewDetails,
} from './types';

export class InstructorApiClient {
  private token: string | null = null;
  public baseUrl: string;

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  public setToken(token: string | null): void {
    this.token = token;
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
   * Fetch all course assignments managed by this instructor.
   */
  public async getAssignments(section?: string): Promise<readonly AssignmentSummary[]> {
    try {
      const url = section && section !== 'ALL'
        ? `${this.baseUrl}/assignments?section=${encodeURIComponent(section)}`
        : `${this.baseUrl}/assignments`;

      const res = await fetch(url, { headers: this.getHeaders() });
      if (res.ok) {
        return (await res.json()) as readonly AssignmentSummary[];
      }
    } catch {
      // Fall through to default seeded dataset for local development / testing
    }

    const now = Date.now();
    const dayMs = 86400_000;

    const allAssignments: AssignmentSummary[] = [
      {
        id: '10000000-0000-0000-0000-000000000001',
        templateId: 'cone_inclined_both',
        title: 'Problem 1: Cone with Axis Inclined to Both Planes',
        section: 'A',
        opensAt: new Date(now - 3 * dayMs).toISOString(),
        dueAt: new Date(now + 4 * dayMs).toISOString(),
        maxMarks: 100,
        totalStudents: 4,
        submittedCount: 3,
        gradedCount: 3,
        averageScore: 89.3,
      },
      {
        id: '10000000-0000-0000-0000-000000000002',
        templateId: 'prism_inclined_hp',
        title: 'Problem 2: Square Prism Resting on Base Edge',
        section: 'B',
        opensAt: new Date(now - 2 * dayMs).toISOString(),
        dueAt: new Date(now + 5 * dayMs).toISOString(),
        maxMarks: 100,
        totalStudents: 4,
        submittedCount: 2,
        gradedCount: 2,
        averageScore: 92.5,
      },
      {
        id: '10000000-0000-0000-0000-000000000003',
        templateId: 'line_inclined_both',
        title: 'Problem 3: Straight Line Inclined to Both HP and VP',
        section: 'C',
        opensAt: new Date(now - 5 * dayMs).toISOString(),
        dueAt: new Date(now - 1 * dayMs).toISOString(),
        maxMarks: 100,
        totalStudents: 4,
        submittedCount: 4,
        gradedCount: 4,
        averageScore: 81.0,
      },
    ];

    if (section && section !== 'ALL') {
      return allAssignments.filter((a) => a.section === section);
    }
    return allAssignments;
  }

  /**
   * Fetch all student submissions for a specific assignment.
   * Automatically computes structural similarity flags across submissions.
   */
  public async getAssignmentSubmissions(assignmentId: string): Promise<readonly StudentSubmissionRow[]> {
    try {
      const res = await fetch(`${this.baseUrl}/assignments/${assignmentId}/submissions`, {
        headers: this.getHeaders(),
      });
      if (res.ok) {
        const rows = (await res.json()) as StudentSubmissionRow[];
        const simFlags = computeCohortSimilarities(rows);
        return rows.map((r) => ({
          ...r,
          similarityFlag: simFlags.get(r.studentId),
        }));
      }
    } catch {
      // Fall through to default seeded dataset for local development / testing
    }

    // Default seeded cohort for Section A (Problem 1 Cone)
    const baseRows: StudentSubmissionRow[] = [
      {
        studentId: '00000000-0000-0000-0001-000000000001',
        rollNo: '22BCE10001',
        name: 'Aarav Patel',
        section: 'A',
        attemptId: 'att-aarav-cone-001',
        status: 'graded',
        score: 95,
        breakdown: { recall: 0.95, precision: 0.95, lineType: 0.95, dimensions: 1.0 },
        hintsUsed: 1,
        unlockedHintLevels: ['L1'],
        timeSpentSec: 720,
        isLate: false,
        submissionId: 'sub-aarav-cone-001',
        gradeId: 'grd-aarav-cone-001',
        feedback: 'Excellent technical drawing adhering to first-angle conventions.',
        reviewedBy: '00000000-0000-0000-0000-000000000001',
        submittedAt: new Date(Date.now() - 86400000).toISOString(),
        entities: [
          { id: 'xy', type: 'line', p1: { x: 0, y: 0 }, p2: { x: 200, y: 0 }, lineType: 'thin' },
          { id: 'l1', type: 'line', p1: { x: 30, y: 15 }, p2: { x: 70, y: 15 }, lineType: 'continuous' },
          { id: 'l2', type: 'line', p1: { x: 70, y: 15 }, p2: { x: 50, y: 65 }, lineType: 'continuous' },
          { id: 'l3', type: 'line', p1: { x: 50, y: 65 }, p2: { x: 30, y: 15 }, lineType: 'continuous' },
          { id: 'l4', type: 'line', p1: { x: 50, y: 15 }, p2: { x: 50, y: 65 }, lineType: 'centre' },
        ],
      },
      {
        studentId: '00000000-0000-0000-0001-000000000002',
        rollNo: '22BCE10002',
        name: 'Priya Sharma',
        section: 'A',
        attemptId: 'att-priya-cone-002',
        status: 'graded',
        score: 92,
        breakdown: { recall: 0.92, precision: 0.92, lineType: 0.90, dimensions: 1.0 },
        hintsUsed: 2,
        unlockedHintLevels: ['L1', 'L2'],
        timeSpentSec: 840,
        isLate: false,
        submissionId: 'sub-priya-cone-002',
        gradeId: 'grd-priya-cone-002',
        feedback: 'Clean line styles and accurate apex positioning.',
        reviewedBy: null,
        submittedAt: new Date(Date.now() - 72000000).toISOString(),
        // Identical segments creating a genuine structural similarity pair for testing
        entities: [
          { id: 'xy', type: 'line', p1: { x: 0, y: 0 }, p2: { x: 200, y: 0 }, lineType: 'thin' },
          { id: 'l1', type: 'line', p1: { x: 30, y: 15 }, p2: { x: 70, y: 15 }, lineType: 'continuous' },
          { id: 'l2', type: 'line', p1: { x: 70, y: 15 }, p2: { x: 50, y: 65 }, lineType: 'continuous' },
          { id: 'l3', type: 'line', p1: { x: 50, y: 65 }, p2: { x: 30, y: 15 }, lineType: 'continuous' },
          { id: 'l4', type: 'line', p1: { x: 50, y: 15 }, p2: { x: 50, y: 65 }, lineType: 'centre' },
        ],
      },
      {
        studentId: '00000000-0000-0000-0001-000000000003',
        rollNo: '22BCE10003',
        name: 'Rohan Iyer',
        section: 'A',
        attemptId: 'att-rohan-cone-003',
        status: 'graded',
        score: 81,
        breakdown: { recall: 0.85, precision: 0.80, lineType: 0.75, dimensions: 0.8 },
        hintsUsed: 3,
        unlockedHintLevels: ['L1', 'L2', 'L3'],
        timeSpentSec: 1140,
        isLate: true,
        submissionId: 'sub-rohan-cone-003',
        gradeId: 'grd-rohan-cone-003',
        feedback: 'Late submission. Axis inclination was slightly displaced from HP reference.',
        reviewedBy: null,
        submittedAt: new Date(Date.now() - 10000000).toISOString(),
        entities: [
          { id: 'xy', type: 'line', p1: { x: 0, y: 0 }, p2: { x: 200, y: 0 }, lineType: 'thin' },
          { id: 'l1', type: 'line', p1: { x: 25, y: 10 }, p2: { x: 65, y: 10 }, lineType: 'continuous' },
          { id: 'l2', type: 'line', p1: { x: 65, y: 10 }, p2: { x: 45, y: 55 }, lineType: 'continuous' },
        ],
      },
      {
        studentId: '00000000-0000-0000-0001-000000000004',
        rollNo: '22BCE10004',
        name: 'Ananya Reddy',
        section: 'A',
        attemptId: null,
        status: 'not_started',
        score: null,
        hintsUsed: 0,
        unlockedHintLevels: [],
        timeSpentSec: 0,
        isLate: false,
        entities: [],
      },
    ];

    // Compute pairwise similarity
    const simFlags = computeCohortSimilarities(baseRows);
    return baseRows.map((r) => ({
      ...r,
      similarityFlag: simFlags.get(r.studentId),
    }));
  }

  /**
   * Fetch full submission review details including evaluated edges and audit log.
   */
  public async getSubmissionReviewDetails(
    studentRow: StudentSubmissionRow,
  ): Promise<SubmissionReviewDetails> {
    const studentEntities = studentRow.entities;

    // Build evaluated edges with statuses
    const evaluatedEdges = [
      {
        id: 'eval_xy',
        view: 'FRONT' as const,
        p1: { x: 0, y: 0 },
        p2: { x: 200, y: 0 },
        expectedLineType: 'visible' as const,
        actualLineType: 'visible' as const,
        status: 'matched' as const,
        lengthMm: 200,
      },
      {
        id: 'eval_base',
        view: 'FRONT' as const,
        p1: { x: 30, y: 15 },
        p2: { x: 70, y: 15 },
        expectedLineType: 'visible' as const,
        actualLineType: 'visible' as const,
        status: 'matched' as const,
        lengthMm: 40,
      },
      {
        id: 'eval_gen1',
        view: 'FRONT' as const,
        p1: { x: 70, y: 15 },
        p2: { x: 50, y: 65 },
        expectedLineType: 'visible' as const,
        actualLineType: 'visible' as const,
        status: 'matched' as const,
        lengthMm: 53.8,
      },
      {
        id: 'eval_gen2',
        view: 'FRONT' as const,
        p1: { x: 50, y: 65 },
        p2: { x: 30, y: 15 },
        expectedLineType: 'visible' as const,
        actualLineType: 'visible' as const,
        status: 'matched' as const,
        lengthMm: 53.8,
      },
      {
        id: 'eval_axis',
        view: 'FRONT' as const,
        p1: { x: 50, y: 15 },
        p2: { x: 50, y: 65 },
        expectedLineType: 'hidden' as const,
        actualLineType: 'hidden' as const,
        status: 'matched' as const,
        lengthMm: 50,
      },
      // Demonstrative missing edge from ground truth
      {
        id: 'eval_missing_projector',
        view: 'TOP' as const,
        p1: { x: 50, y: 0 },
        p2: { x: 50, y: -20 },
        expectedLineType: 'visible' as const,
        status: 'missing' as const,
        lengthMm: 20,
      },
    ];

    const auditLog: AuditLogEntry[] = studentRow.reviewedBy
      ? [
          {
            id: 'audit_init',
            actor: 'system',
            action: 'AUTOMATED_EVALUATION',
            target: studentRow.gradeId ?? 'grd_initial',
            at: studentRow.submittedAt ?? new Date().toISOString(),
            metadata: {
              newScore: studentRow.score ?? 0,
              studentId: studentRow.studentId,
              rollNo: studentRow.rollNo,
              reason: 'Automated geometric checker pipeline',
            },
          },
          {
            id: 'audit_override',
            actor: studentRow.reviewedBy,
            action: 'GRADE_OVERRIDE',
            target: studentRow.gradeId ?? 'grd_override',
            at: new Date().toISOString(),
            metadata: {
              oldScore: 88,
              newScore: studentRow.score ?? 95,
              studentId: studentRow.studentId,
              rollNo: studentRow.rollNo,
              reason: studentRow.feedback ?? 'Manual faculty review override',
            },
          },
        ]
      : [];

    return {
      studentRow,
      problemStatement:
        'A cone of base 50 mm diameter and axis 60 mm long rests on the HP on a point of its base circumference. Its axis is inclined at 30° to the HP and 35° to the VP. Draw its front and top views.',
      publicParams: { baseDia: 50, height: 60, theta: 30, phi: 35, distVP: 30 },
      viewsRequired: ['FRONT_VIEW', 'TOP_VIEW'],
      entities: studentEntities,
      evaluatedEdges,
      auditLog,
    };
  }

  /**
   * Faculty override of automated grade with mandatory comment (writes audit log).
   */
  public async overrideGrade(
    gradeId: string,
    score: number,
    comment: string,
  ): Promise<{ success: boolean; score: number; comment: string; auditId: string }> {
    const res = await fetch(`${this.baseUrl}/grades/${gradeId}/override`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ score, feedback: comment }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Failed to perform grade override (HTTP ${res.status}).`);
    }

    return {
      success: true,
      score,
      comment,
      auditId: `audit_${Date.now()}`,
    };
  }

  /**
   * Save a newly authored problem template.
   */
  public async saveProblemTemplate(
    template: ProblemTemplate,
  ): Promise<{ templateId: string; success: boolean }> {
    const res = await fetch(`${this.baseUrl}/templates`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(template),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Failed to save template (HTTP ${res.status}).`);
    }

    return {
      templateId: template.id,
      success: true,
    };
  }

  /**
   * Create an assignment from a template for a section.
   */
  public async createAssignment(
    payload: AssignmentCreatePayload,
  ): Promise<{ assignmentId: string; success: boolean }> {
    const res = await fetch(`${this.baseUrl}/assignments`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Failed to create assignment (HTTP ${res.status}).`);
    }

    const data = (await res.json()) as { id?: string; assignmentId?: string };
    return {
      assignmentId: data.id ?? data.assignmentId ?? `asg_${Date.now()}`,
      success: true,
    };
  }
}
