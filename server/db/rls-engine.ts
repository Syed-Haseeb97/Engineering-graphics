import type {
  AssignmentRecord,
  AttemptRecord,
  AuditLogRecord,
  GradeRecord,
  InstructorSectionRecord,
  ProblemTemplateRecord,
  SubmissionRecord,
  UserRecord,
  UserRole,
} from './types';

export class PermissionDeniedError extends Error {
  constructor(message: string) {
    super(`RLS_VIOLATION: ${message}`);
    this.name = 'PermissionDeniedError';
  }
}

export interface ClientContext {
  readonly userId?: string;
  readonly isServiceRole?: boolean;
}

/**
 * In-Memory Database State Container for RLS Policy Verification.
 * Strictly implements policies from server/db/migrations/002_rls_policies.sql.
 */
export class RlsDatabase {
  public users: UserRecord[] = [];
  public instructorSections: InstructorSectionRecord[] = [];
  public problemTemplates: ProblemTemplateRecord[] = [];
  public assignments: AssignmentRecord[] = [];
  public attempts: AttemptRecord[] = [];
  public submissions: SubmissionRecord[] = [];
  public grades: GradeRecord[] = [];
  public auditLog: AuditLogRecord[] = [];

  /**
   * Helper to determine if an instructor user manages a given section.
   */
  public instructorManagesSection(instructorId: string, section: string): boolean {
    const user = this.users.find((u) => u.id === instructorId);
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.role !== 'instructor') return false;

    if (user.section === 'ALL' || user.section === section) {
      return true;
    }

    return this.instructorSections.some(
      (isec) => isec.instructor_id === instructorId && isec.section === section,
    );
  }

  /**
   * Connect as a specific authenticated user.
   */
  public connectAs(userId: string): RlsClient {
    const user = this.users.find((u) => u.id === userId);
    if (!user) {
      throw new Error(`User with ID "${userId}" not found in database.`);
    }
    return new RlsClient(this, { userId, isServiceRole: false }, user.role);
  }

  /**
   * Connect as backend service_role (headless auto-checker engine).
   */
  public connectAsServiceRole(): RlsClient {
    return new RlsClient(this, { isServiceRole: true }, 'admin');
  }
}

/**
 * Client connection executing queries with Row Level Security (RLS) enforcement.
 */
export class RlsClient {
  constructor(
    private readonly db: RlsDatabase,
    private readonly context: ClientContext,
    public readonly role: UserRole,
  ) {}

  public get currentUserId(): string | undefined {
    return this.context.userId;
  }

  // ----------------------------------------------------------------------------
  // 1. Users Queries
  // ----------------------------------------------------------------------------
  public selectUsers(): readonly UserRecord[] {
    if (this.context.isServiceRole || this.role === 'admin') {
      return [...this.db.users];
    }

    if (this.role === 'student') {
      // Students can read ONLY their own user record
      return this.db.users.filter((u) => u.id === this.context.userId);
    }

    if (this.role === 'instructor') {
      // Instructors can read their own row plus students in their managed sections
      return this.db.users.filter(
        (u) =>
          u.id === this.context.userId ||
          (u.role === 'student' &&
            this.db.instructorManagesSection(this.context.userId!, u.section)),
      );
    }

    return [];
  }

  // ----------------------------------------------------------------------------
  // 2. Problem Templates Queries (Zero Ground-Truth Leaks)
  // ----------------------------------------------------------------------------
  public selectProblemTemplates(): readonly ProblemTemplateRecord[] {
    if (this.context.isServiceRole || this.role === 'admin' || this.role === 'instructor') {
      // Instructors and Service Role can read complete templates including ground_truth
      return [...this.db.problemTemplates];
    }

    // Students can read public templates, but ground_truth and seeding_secret are stripped
    return this.db.problemTemplates.map((t) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { ground_truth, seeding_secret, ...publicFields } = t;
      return publicFields as ProblemTemplateRecord;
    });
  }

  // ----------------------------------------------------------------------------
  // 3. Attempts Queries
  // ----------------------------------------------------------------------------
  public selectAttempts(): readonly AttemptRecord[] {
    if (this.context.isServiceRole || this.role === 'admin') {
      return [...this.db.attempts];
    }

    if (this.role === 'student') {
      // Students read ONLY their own attempts
      return this.db.attempts.filter((a) => a.student_id === this.context.userId);
    }

    if (this.role === 'instructor') {
      // Instructors read attempts of students in their managed sections
      return this.db.attempts.filter((a) => {
        const student = this.db.users.find((u) => u.id === a.student_id);
        return student && this.db.instructorManagesSection(this.context.userId!, student.section);
      });
    }

    return [];
  }

  public insertAttempt(attempt: Omit<AttemptRecord, 'created_at' | 'updated_at'>): AttemptRecord {
    if (!this.context.isServiceRole && this.role === 'student') {
      if (attempt.student_id !== this.context.userId) {
        throw new PermissionDeniedError('Students can only insert attempts for themselves.');
      }
    }

    const nowIso = new Date().toISOString();
    const newRecord: AttemptRecord = {
      ...attempt,
      created_at: nowIso,
      updated_at: nowIso,
    };
    this.db.attempts.push(newRecord);
    return newRecord;
  }

  // ----------------------------------------------------------------------------
  // 4. Submissions Queries
  // ----------------------------------------------------------------------------
  public selectSubmissions(): readonly SubmissionRecord[] {
    if (this.context.isServiceRole || this.role === 'admin') {
      return [...this.db.submissions];
    }

    if (this.role === 'student') {
      // Students read ONLY submissions belonging to their own attempts
      const myAttemptIds = new Set(
        this.db.attempts
          .filter((a) => a.student_id === this.context.userId)
          .map((a) => a.id),
      );
      return this.db.submissions.filter((s) => myAttemptIds.has(s.attempt_id));
    }

    if (this.role === 'instructor') {
      // Instructors read submissions from students in their sections
      return this.db.submissions.filter((s) => {
        const attempt = this.db.attempts.find((a) => a.id === s.attempt_id);
        if (!attempt) return false;
        const student = this.db.users.find((u) => u.id === attempt.student_id);
        return student && this.db.instructorManagesSection(this.context.userId!, student.section);
      });
    }

    return [];
  }

  public insertSubmission(submission: Omit<SubmissionRecord, 'submitted_at'>): SubmissionRecord {
    const attempt = this.db.attempts.find((a) => a.id === submission.attempt_id);
    if (!attempt) {
      throw new Error(`Attempt "${submission.attempt_id}" not found.`);
    }

    if (!this.context.isServiceRole && this.role === 'student') {
      if (attempt.student_id !== this.context.userId) {
        throw new PermissionDeniedError('Students can only submit drawings for their own attempts.');
      }
      if (attempt.status !== 'in_progress') {
        throw new PermissionDeniedError('Cannot submit drawing for an attempt that is not in_progress.');
      }
    }

    const newRecord: SubmissionRecord = {
      ...submission,
      submitted_at: new Date().toISOString(),
    };
    this.db.submissions.push(newRecord);
    return newRecord;
  }

  // ----------------------------------------------------------------------------
  // 5. Grades Queries (Insertable only by server role and instructors for override)
  // ----------------------------------------------------------------------------
  public selectGrades(): readonly GradeRecord[] {
    if (this.context.isServiceRole || this.role === 'admin') {
      return [...this.db.grades];
    }

    if (this.role === 'student') {
      // Students read grades ONLY for their own submissions
      const myAttemptIds = new Set(
        this.db.attempts
          .filter((a) => a.student_id === this.context.userId)
          .map((a) => a.id),
      );
      const mySubmissionIds = new Set(
        this.db.submissions
          .filter((s) => myAttemptIds.has(s.attempt_id))
          .map((s) => s.id),
      );
      return this.db.grades.filter((g) => mySubmissionIds.has(g.submission_id));
    }

    if (this.role === 'instructor') {
      // Instructors read grades for submissions belonging to their sections
      return this.db.grades.filter((g) => {
        const sub = this.db.submissions.find((s) => s.id === g.submission_id);
        if (!sub) return false;
        const attempt = this.db.attempts.find((a) => a.id === sub.attempt_id);
        if (!attempt) return false;
        const student = this.db.users.find((u) => u.id === attempt.student_id);
        return student && this.db.instructorManagesSection(this.context.userId!, student.section);
      });
    }

    return [];
  }

  public insertGrade(grade: Omit<GradeRecord, 'created_at' | 'updated_at'>): GradeRecord {
    // RULE: Grades are insertable ONLY by server role and instructors for override
    if (this.role === 'student') {
      throw new PermissionDeniedError('Students are strictly forbidden from creating grades.');
    }

    if (this.role === 'instructor') {
      // Verify that submission belongs to a student in the instructor's section
      const sub = this.db.submissions.find((s) => s.id === grade.submission_id);
      if (!sub) throw new Error(`Submission "${grade.submission_id}" not found.`);
      const attempt = this.db.attempts.find((a) => a.id === sub.attempt_id);
      if (!attempt) throw new Error(`Attempt "${sub.attempt_id}" not found.`);
      const student = this.db.users.find((u) => u.id === attempt.student_id);
      if (!student || !this.db.instructorManagesSection(this.context.userId!, student.section)) {
        throw new PermissionDeniedError('Instructors can only grade submissions from their assigned sections.');
      }
    }

    const nowIso = new Date().toISOString();
    const newRecord: GradeRecord = {
      ...grade,
      created_at: nowIso,
      updated_at: nowIso,
    };
    this.db.grades.push(newRecord);
    return newRecord;
  }

  public updateGrade(gradeId: string, updates: Partial<Pick<GradeRecord, 'score' | 'feedback' | 'reviewed_by'>>): GradeRecord {
    // RULE: Students cannot update grades
    if (this.role === 'student') {
      throw new PermissionDeniedError('Students are strictly forbidden from updating grades.');
    }

    const gradeIdx = this.db.grades.findIndex((g) => g.id === gradeId);
    if (gradeIdx === -1) {
      throw new Error(`Grade "${gradeId}" not found.`);
    }

    const existing = this.db.grades[gradeIdx]!;

    if (this.role === 'instructor') {
      const sub = this.db.submissions.find((s) => s.id === existing.submission_id);
      if (!sub) throw new Error(`Submission "${existing.submission_id}" not found.`);
      const attempt = this.db.attempts.find((a) => a.id === sub.attempt_id);
      if (!attempt) throw new Error(`Attempt "${sub.attempt_id}" not found.`);
      const student = this.db.users.find((u) => u.id === attempt.student_id);
      if (!student || !this.db.instructorManagesSection(this.context.userId!, student.section)) {
        throw new PermissionDeniedError('Instructors can only override grades for their assigned sections.');
      }
    }

    const updated: GradeRecord = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.db.grades[gradeIdx] = updated;
    return updated;
  }
}
