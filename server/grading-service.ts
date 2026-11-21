import { evaluateSubmission } from '../src/checker/checker';
import { generateHints, type GeneratedHint } from '../src/checker/hints';
import type { DraftEntity } from '../src/draft/types';
import { generateStudentProblem } from '../src/problems/generator';
import { TEMPLATES_BY_ID } from '../src/problems/templates';
import type { TaggedSegment2 } from '../src/kernel/types';
import type { ProblemTemplate, StudentProblemPayload } from '../src/problems/types';
import type { SupabaseJwtPayload } from './auth';
import { computeGroundTruth, withTimeout } from './ground-truth';
import { serverLogger } from './logger';
import { RateLimiter } from './rate-limiter';
import type { RlsDatabase } from './db/rls-engine';
import type {
  AssignmentRecord,
  AttemptRecord,
  GradeRecord,
  SubmissionRecord,
  UserRecord,
  UserRole,
} from './db/types';
import { executeDataRetentionPurge, type PurgeResult } from '../scripts/purge-retention';

export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export interface CreateAttemptResponse {
  readonly attemptId: string;
  readonly assignmentId: string;
  readonly problem: StudentProblemPayload;
}

export interface CheckPreviewResponse {
  readonly score: number;
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

export interface SubmitAttemptResponse {
  readonly alreadySubmitted?: boolean;
  readonly submissionId: string;
  readonly gradeId: string;
  readonly score: number;
  readonly breakdown: Record<string, number>;
  readonly feedback: string;
  readonly isLate: boolean;
}

export interface AttemptDetailsResponse {
  readonly attemptId: string;
  readonly assignmentId: string;
  readonly status: string;
  readonly startedAt: string;
  readonly problem: StudentProblemPayload;
  readonly submission?: {
    readonly id: string;
    readonly submittedAt: string;
  };
  readonly grade?: {
    readonly id: string;
    readonly score: number;
    readonly feedback: string;
    readonly reviewedBy: string | null;
  };
}

export interface LruTtlCacheOptions {
  readonly maxSize: number;
  readonly ttlMs: number;
}

interface CacheNode<V> {
  readonly value: V;
  readonly expiresAt: number;
}

/**
 * High-performance Least-Recently-Used (LRU) cache with Time-To-Live (TTL) expiration.
 * Backed by native JavaScript Map which maintains insertion / re-insertion order.
 */
export class LruTtlCache<K, V> {
  private readonly map = new Map<K, CacheNode<V>>();
  public readonly maxSize: number;
  public readonly ttlMs: number;

  constructor(options?: Partial<LruTtlCacheOptions>) {
    this.maxSize = options?.maxSize ?? 500;
    this.ttlMs = options?.ttlMs ?? 1800_000; // 30 minutes default
  }

  public get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;

    // Check TTL expiration
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }

    // Refresh LRU order by deleting and re-inserting at the end
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  public set(key: K, value: V, customTtlMs?: number): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      // Evict least recently used (first key in iteration order)
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }

    const expiresAt = Date.now() + (customTtlMs ?? this.ttlMs);
    this.map.set(key, { value, expiresAt });
  }

  public has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  public delete(key: K): boolean {
    return this.map.delete(key);
  }

  public clear(): void {
    this.map.clear();
  }

  public get size(): number {
    const now = Date.now();
    for (const [key, entry] of this.map.entries()) {
      if (now > entry.expiresAt) {
        this.map.delete(key);
      }
    }
    return this.map.size;
  }
}

export class GradingService {
  public readonly rateLimiter: RateLimiter;
  private readonly serverSecret: string;
  /** In-memory LRU+TTL cache for canonical ground truth per deterministic seed (server memory only). */
  private readonly groundTruthCache: LruTtlCache<string, readonly TaggedSegment2[]>;

  constructor(
    private readonly db: RlsDatabase,
    options?: {
      rateLimiter?: RateLimiter;
      serverSecret?: string;
      cacheMaxSize?: number;
      cacheTtlMs?: number;
    },
  ) {
    this.rateLimiter = options?.rateLimiter ?? new RateLimiter({ maxRequests: 5, windowMs: 60_000 });
    this.serverSecret = options?.serverSecret ?? process.env['PROBLEM_SERVER_SECRET'] ?? 'default_grading_secret_xK9';
    this.groundTruthCache = new LruTtlCache<string, readonly TaggedSegment2[]>({
      maxSize: options?.cacheMaxSize ?? 500,
      ttlMs: options?.cacheTtlMs ?? 1800_000,
    });
  }

  /**
   * Return number of cached ground-truth models held in process memory.
   */
  public getGroundTruthCacheSize(): number {
    return this.groundTruthCache.size;
  }

  /**
   * Direct access to cache instance for unit testing eviction policies.
   */
  public getGroundTruthCache(): LruTtlCache<string, readonly TaggedSegment2[]> {
    return this.groundTruthCache;
  }

  /**
   * Retrieve cached ground truth or compute and cache deterministically from problem parameters.
   */
  public async getOrComputeGroundTruth(
    template: ProblemTemplate,
    rollNo: string,
    seed: string,
  ): Promise<readonly TaggedSegment2[]> {
    const cached = this.groundTruthCache.get(seed);
    if (cached) {
      return cached;
    }

    const groundTruth = await withTimeout(
      (async () => {
        const instance = generateStudentProblem(template, rollNo, 1, {
          serverSecret: this.serverSecret,
        });
        return await computeGroundTruth(template, instance.params);
      })(),
      5000,
      'Ground truth computation',
    );

    this.groundTruthCache.set(seed, groundTruth);
    return groundTruth;
  }

  /**
   * Helper to resolve authenticated user from database using JWT claims.
   */
  private resolveUser(jwt: SupabaseJwtPayload): UserRecord {
    const user = this.db.users.find((u) => u.id === jwt.sub);
    if (!user) {
      throw new ServiceError(`User with ID "${jwt.sub}" not found.`, 401, 'USER_NOT_FOUND');
    }
    return user;
  }

  /**
   * Helper to resolve assignment.
   */
  private resolveAssignment(assignmentId: string): AssignmentRecord {
    const assignment = this.db.assignments.find((a) => a.id === assignmentId);
    if (!assignment) {
      throw new ServiceError(`Assignment "${assignmentId}" not found.`, 404, 'ASSIGNMENT_NOT_FOUND');
    }
    return assignment;
  }

  /**
   * Helper to resolve attempt.
   */
  private resolveAttempt(attemptId: string): AttemptRecord {
    const attempt = this.db.attempts.find((a) => a.id === attemptId);
    if (!attempt) {
      throw new ServiceError(`Attempt "${attemptId}" not found.`, 404, 'ATTEMPT_NOT_FOUND');
    }
    return attempt;
  }

  /**
   * 0. POST /auth/login - Record login event and write to audit log.
   */
  public async recordLogin(
    jwt: SupabaseJwtPayload,
    metadata?: Record<string, unknown>,
  ): Promise<{ success: boolean }> {
    const user = this.resolveUser(jwt);
    const nowIso = new Date().toISOString();

    this.db.auditLog.push({
      id: `audit_login_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      actor: user.id,
      action: 'LOGIN',
      target: user.id,
      at: nowIso,
      metadata: {
        email: user.email,
        rollNo: user.roll_no,
        role: user.role,
        section: user.section,
        ...metadata,
      },
    });

    serverLogger.info('USER_LOGIN', { userId: user.id, role: user.role, email: user.email });
    return { success: true };
  }

  /**
   * 1. POST /attempts - Create attempt, compute seed, return statement & parameters only.
   */
  public async createAttempt(jwt: SupabaseJwtPayload, assignmentId: string): Promise<CreateAttemptResponse> {
    const student = this.resolveUser(jwt);
    if (student.role !== 'student') {
      throw new ServiceError('Only enrolled students can initiate assignment attempts.', 403, 'FORBIDDEN_ROLE');
    }

    const assignment = this.resolveAssignment(assignmentId);

    // Section matching rule: student must belong to the assignment's section
    if (assignment.section !== student.section && assignment.section !== 'ALL') {
      throw new ServiceError(
        `Assignment is designated for Section "${assignment.section}". Student is enrolled in Section "${student.section}".`,
        403,
        'SECTION_MISMATCH',
      );
    }

    // Check assignment open window
    const now = new Date();
    if (now < new Date(assignment.opens_at)) {
      throw new ServiceError('This assignment is not yet open for attempts.', 403, 'ASSIGNMENT_NOT_OPEN');
    }

    const template = TEMPLATES_BY_ID[assignment.template_id];
    if (!template) {
      throw new ServiceError(`Problem template "${assignment.template_id}" not found.`, 500, 'TEMPLATE_NOT_FOUND');
    }

    // Determine student's attempt number for this assignment
    const priorAttempts = this.db.attempts.filter(
      (a) => a.assignment_id === assignmentId && a.student_id === student.id,
    );
    const attemptNo = priorAttempts.length + 1;

    // Generate deterministic problem instance
    const instance = generateStudentProblem(template, student.roll_no, attemptNo, {
      serverSecret: this.serverSecret,
    });

    // Precompute ground truth and cache it into groundTruthCache using the worker_threads pool
    try {
      const gt = await computeGroundTruth(template, instance.params);
      this.groundTruthCache.set(instance.seed, gt);
    } catch (err) {
      serverLogger.warn('GROUND_TRUTH_PRECOMPUTE_DEFERRED', {
        seed: instance.seed,
        error: (err as Error).message,
      });
    }

    // Create attempt record
    const attemptId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const nowIso = now.toISOString();

    const attemptRecord: AttemptRecord = {
      id: attemptId,
      assignment_id: assignmentId,
      student_id: student.id,
      seed: instance.seed,
      started_at: nowIso,
      command_log: [],
      status: 'in_progress',
      created_at: nowIso,
      updated_at: nowIso,
    };

    this.db.attempts.push(attemptRecord);

    // Audit log
    this.db.auditLog.push({
      id: `audit_att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      actor: student.id,
      action: 'ATTEMPT_CREATE',
      target: attemptId,
      at: nowIso,
      metadata: {
        assignmentId,
        studentId: student.id,
        rollNo: student.roll_no,
        seed: instance.seed,
      },
    });

    serverLogger.info('ATTEMPT_CREATED', {
      attemptId,
      studentId: student.id,
      assignmentId,
      attemptNo,
    });

    return {
      attemptId,
      assignmentId,
      problem: instance.clientPayload,
    };
  }

  /**
   * 2. POST /attempts/:id/check - Preview check with hints, rate limited, does not final grade.
   */
  public async previewCheck(
    jwt: SupabaseJwtPayload,
    attemptId: string,
    drawingJson: { entities?: readonly DraftEntity[] },
  ): Promise<CheckPreviewResponse> {
    const student = this.resolveUser(jwt);
    const attempt = this.resolveAttempt(attemptId);

    // Verify ownership
    if (attempt.student_id !== student.id) {
      throw new ServiceError('Access denied: You can only check your own attempt.', 403, 'FORBIDDEN_ATTEMPT');
    }

    if (attempt.status !== 'in_progress') {
      throw new ServiceError('This attempt has already been submitted or finalized.', 400, 'ATTEMPT_CLOSED');
    }

    // 1. Rate Limit Check
    const rateStatus = this.rateLimiter.consume(student.id);
    if (!rateStatus.allowed) {
      const waitSec = Math.ceil(rateStatus.resetAfterMs / 1000);
      throw new ServiceError(
        `Rate limit exceeded: Please wait ${waitSec} seconds before checking your drawing again.`,
        429,
        'RATE_LIMIT_EXCEEDED',
      );
    }

    // 2. Size Limit Check
    const entities = drawingJson?.entities ?? [];
    if (entities.length > 500) {
      throw new ServiceError(
        `Drawing exceeds maximum allowed complexity (500 entities). Received ${entities.length}.`,
        413,
        'DRAWING_TOO_LARGE',
      );
    }

    const assignment = this.resolveAssignment(attempt.assignment_id);
    const template = TEMPLATES_BY_ID[assignment.template_id]!;

    // 3. Compute Ground Truth (or retrieve from in-memory cache) with timeout protection
    const groundTruth = await this.getOrComputeGroundTruth(template, student.roll_no, attempt.seed);

    // 4. Run Checker
    const report = evaluateSubmission(entities, groundTruth, {
      rubric: template.rubric,
    });

    // 5. Generate Plain-Language Hints
    const hints = generateHints(report, {
      studentEntities: entities,
      groundTruth,
    });

    // Audit log
    this.db.auditLog.push({
      id: `audit_chk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      actor: student.id,
      action: 'CHECK',
      target: attemptId,
      at: new Date().toISOString(),
      metadata: {
        attemptId,
        score: report.overallScore,
        hintsCount: hints.length,
        entityCount: entities.length,
      },
    });

    serverLogger.info('PREVIEW_CHECK_EXECUTED', {
      attemptId,
      studentId: student.id,
      score: report.overallScore,
      hintsCount: hints.length,
      drawing: { entities },
    });

    return {
      score: report.overallScore,
      metrics: report.metrics,
      hints,
      summary: report.summary,
    };
  }

  /**
   * 3. POST /attempts/:id/submit - Final grade, stores submission and grade (idempotent).
   */
  public async submitAttempt(
    jwt: SupabaseJwtPayload,
    attemptId: string,
    drawingJson: { entities?: readonly DraftEntity[] },
  ): Promise<SubmitAttemptResponse> {
    const student = this.resolveUser(jwt);
    const attempt = this.resolveAttempt(attemptId);

    if (attempt.student_id !== student.id) {
      throw new ServiceError('Access denied: You can only submit your own attempt.', 403, 'FORBIDDEN_ATTEMPT');
    }

    // Idempotent Submit Check
    if (attempt.status === 'submitted') {
      const existingSub = this.db.submissions.find((s) => s.attempt_id === attemptId);
      const existingGrade = existingSub ? this.db.grades.find((g) => g.submission_id === existingSub.id) : null;

      if (existingSub && existingGrade) {
        return {
          alreadySubmitted: true,
          submissionId: existingSub.id,
          gradeId: existingGrade.id,
          score: existingGrade.score,
          breakdown: existingGrade.breakdown,
          feedback: existingGrade.feedback,
          isLate: false,
        };
      }
    }

    // Size Limit Check
    const entities = drawingJson?.entities ?? [];
    if (entities.length > 500) {
      throw new ServiceError(
        `Drawing exceeds maximum allowed complexity (500 entities). Received ${entities.length}.`,
        413,
        'DRAWING_TOO_LARGE',
      );
    }

    const assignment = this.resolveAssignment(attempt.assignment_id);
    const template = TEMPLATES_BY_ID[assignment.template_id]!;

    // Compute Ground Truth (or retrieve from in-memory cache) with timeout protection
    const groundTruth = await this.getOrComputeGroundTruth(template, student.roll_no, attempt.seed);

    // Evaluate
    const report = evaluateSubmission(entities, groundTruth, {
      rubric: template.rubric,
    });

    // Check late submission
    const now = new Date();
    const isLate = now > new Date(assignment.due_at);
    const nowIso = now.toISOString();

    // Store submission
    const submissionId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const submissionRecord: SubmissionRecord = {
      id: submissionId,
      attempt_id: attemptId,
      drawing_json: drawingJson as Record<string, unknown>,
      submitted_at: nowIso,
    };
    this.db.submissions.push(submissionRecord);

    // Store final grade
    const gradeId = `grd_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const feedback = isLate
      ? 'Submitted after assignment deadline. Automatic late flag applied.'
      : 'Evaluated by automated grading engine.';

    const gradeRecord: GradeRecord = {
      id: gradeId,
      submission_id: submissionId,
      score: report.overallScore,
      breakdown: report.metrics,
      feedback,
      reviewed_by: null,
      created_at: nowIso,
      updated_at: nowIso,
    };
    this.db.grades.push(gradeRecord);

    // Update attempt status to submitted
    const attemptIdx = this.db.attempts.findIndex((a) => a.id === attemptId);
    if (attemptIdx >= 0) {
      this.db.attempts[attemptIdx] = {
        ...attempt,
        status: 'submitted',
        updated_at: nowIso,
      };
    }

    // Audit log
    this.db.auditLog.push({
      id: `audit_sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      actor: student.id,
      action: 'SUBMIT',
      target: submissionId,
      at: nowIso,
      metadata: {
        attemptId,
        submissionId,
        gradeId,
        score: report.overallScore,
        isLate,
      },
    });

    serverLogger.info('ATTEMPT_SUBMITTED', {
      attemptId,
      submissionId,
      gradeId,
      score: report.overallScore,
      isLate,
      drawing: { entities },
    });

    return {
      submissionId,
      gradeId,
      score: report.overallScore,
      breakdown: report.metrics,
      feedback,
      isLate,
    };
  }

  /**
   * 4. GET /attempts/:id - Own data only (or instructor of student's section).
   */
  public async getAttempt(jwt: SupabaseJwtPayload, attemptId: string): Promise<AttemptDetailsResponse> {
    const user = this.resolveUser(jwt);
    const attempt = this.resolveAttempt(attemptId);

    // Check authorization: must be owner OR instructor managing the student's section
    if (user.role === 'student' && attempt.student_id !== user.id) {
      throw new ServiceError('Access denied: You can only view your own attempt.', 403, 'FORBIDDEN_ATTEMPT');
    }

    if (user.role === 'instructor') {
      const student = this.db.users.find((u) => u.id === attempt.student_id);
      if (!student || !this.db.instructorManagesSection(user.id, student.section)) {
        throw new ServiceError('Access denied: You do not manage the section for this attempt.', 403, 'FORBIDDEN_SECTION');
      }
    }

    const assignment = this.resolveAssignment(attempt.assignment_id);
    const template = TEMPLATES_BY_ID[assignment.template_id]!;
    const studentUser = this.db.users.find((u) => u.id === attempt.student_id)!;

    const instance = generateStudentProblem(template, studentUser.roll_no, 1, {
      serverSecret: this.serverSecret,
    });

    const submission = this.db.submissions.find((s) => s.attempt_id === attemptId);
    const grade = submission ? this.db.grades.find((g) => g.submission_id === submission.id) : null;

    return {
      attemptId: attempt.id,
      assignmentId: attempt.assignment_id,
      status: attempt.status,
      startedAt: attempt.started_at,
      problem: instance.clientPayload,
      submission: submission ? { id: submission.id, submittedAt: submission.submitted_at } : undefined,
      grade: grade
        ? {
            id: grade.id,
            score: grade.score,
            feedback: grade.feedback,
            reviewedBy: grade.reviewed_by,
          }
        : undefined,
    };
  }

  /**
   * 5. POST /grades/:id/override - Faculty override endpoint (instructor role only) writing to audit_log.
   */
  public async facultyOverride(
    jwt: SupabaseJwtPayload,
    gradeId: string,
    override: { score: number; feedback?: string },
  ): Promise<GradeRecord> {
    const instructor = this.resolveUser(jwt);
    if (instructor.role !== 'instructor' && instructor.role !== 'admin') {
      throw new ServiceError('Access denied: Only faculty can perform grade overrides.', 403, 'FORBIDDEN_ROLE');
    }

    const gradeIdx = this.db.grades.findIndex((g) => g.id === gradeId);
    if (gradeIdx === -1) {
      throw new ServiceError(`Grade "${gradeId}" not found.`, 404, 'GRADE_NOT_FOUND');
    }

    const grade = this.db.grades[gradeIdx]!;
    const submission = this.db.submissions.find((s) => s.id === grade.submission_id);
    if (!submission) throw new ServiceError('Associated submission not found.', 500, 'SUBMISSION_NOT_FOUND');
    const attempt = this.db.attempts.find((a) => a.id === submission.attempt_id);
    if (!attempt) throw new ServiceError('Associated attempt not found.', 500, 'ATTEMPT_NOT_FOUND');
    const student = this.db.users.find((u) => u.id === attempt.student_id);
    if (!student) throw new ServiceError('Student record not found.', 500, 'STUDENT_NOT_FOUND');

    // Section check for instructor
    if (!this.db.instructorManagesSection(instructor.id, student.section)) {
      throw new ServiceError(
        `Instructor does not have permission to grade Section "${student.section}".`,
        403,
        'FORBIDDEN_SECTION',
      );
    }

    const oldScore = grade.score;
    const nowIso = new Date().toISOString();

    const updatedGrade: GradeRecord = {
      ...grade,
      score: override.score,
      feedback: override.feedback ?? grade.feedback,
      reviewed_by: instructor.id,
      updated_at: nowIso,
    };

    this.db.grades[gradeIdx] = updatedGrade;

    // Write to audit log
    this.db.auditLog.push({
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      actor: instructor.id,
      action: 'GRADE_OVERRIDE',
      target: grade.id,
      at: nowIso,
      metadata: {
        oldScore,
        newScore: override.score,
        studentId: student.id,
        rollNo: student.roll_no,
        reason: override.feedback ?? 'Manual faculty review override',
      },
    });

    serverLogger.info('FACULTY_GRADE_OVERRIDE', {
      gradeId,
      instructorId: instructor.id,
      studentId: student.id,
      oldScore,
      newScore: override.score,
    });

    return updatedGrade;
  }

  /**
   * 6. GET /admin/export-everything - Admin-only export producing full JSON bundle & RFC-4180 CSV.
   */
  public async exportEverything(
    jwt: SupabaseJwtPayload,
  ): Promise<{ jsonBundle: Record<string, unknown>; csv: string }> {
    const user = this.resolveUser(jwt);
    if (user.role !== 'admin') {
      throw new ServiceError(
        'Admin permission required to export complete institutional data.',
        403,
        'FORBIDDEN_ADMIN_ONLY',
      );
    }

    const nowIso = new Date().toISOString();
    const users = this.db.users.map((u) => ({
      id: u.id,
      roll_no: u.roll_no,
      name: u.name,
      email: u.email,
      role: u.role,
      section: u.section,
    }));

    const assignments = this.db.assignments.map((a) => ({
      id: a.id,
      template_id: a.template_id,
      section: a.section,
      opens_at: a.opens_at,
      due_at: a.due_at,
      max_marks: a.max_marks,
    }));

    const grades = this.db.grades.map((g) => {
      const sub = this.db.submissions.find((s) => s.id === g.submission_id);
      const att = sub ? this.db.attempts.find((a) => a.id === sub.attempt_id) : null;
      const stu = att ? this.db.users.find((u) => u.id === att.student_id) : null;
      const asgn = att ? this.db.assignments.find((a) => a.id === att.assignment_id) : null;

      return {
        gradeId: g.id,
        submissionId: g.submission_id,
        attemptId: att?.id,
        assignmentId: asgn?.id,
        templateId: asgn?.template_id,
        studentId: stu?.id,
        rollNo: stu?.roll_no ?? 'UNKNOWN',
        name: stu?.name ?? 'UNKNOWN',
        section: stu?.section ?? 'UNKNOWN',
        score: g.score,
        maxMarks: asgn?.max_marks ?? 100,
        feedback: g.feedback,
        reviewedBy: g.reviewed_by,
        submittedAt: sub?.submitted_at,
      };
    });

    const jsonBundle = {
      version: '1.0',
      exportedAt: nowIso,
      institution: 'Engineering Graphics Education Platform',
      summary: {
        totalUsers: users.length,
        totalAssignments: assignments.length,
        totalGrades: grades.length,
      },
      users,
      assignments,
      grades,
    };

    // Build RFC-4180 CSV
    const csvRows: string[] = [];
    csvRows.push(
      'roll_no,name,section,assignment_id,template_id,score,max_marks,percentage,feedback,reviewed_by,submitted_at',
    );
    for (const g of grades) {
      const pct = ((g.score / g.maxMarks) * 100).toFixed(1);
      csvRows.push(
        [
          `"${g.rollNo}"`,
          `"${g.name.replace(/"/g, '""')}"`,
          `"${g.section}"`,
          `"${g.assignmentId ?? ''}"`,
          `"${g.templateId ?? ''}"`,
          g.score,
          g.maxMarks,
          pct,
          `"${(g.feedback ?? '').replace(/"/g, '""')}"`,
          `"${g.reviewedBy ?? ''}"`,
          `"${g.submittedAt ?? ''}"`,
        ].join(','),
      );
    }
    const csv = csvRows.join('\r\n');

    // Audit log
    this.db.auditLog.push({
      id: `audit_exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      actor: user.id,
      action: 'EXPORT',
      target: 'FULL_SYSTEM_EXPORT',
      at: nowIso,
      metadata: {
        recordCount: grades.length,
        userCount: users.length,
        format: 'json+csv',
      },
    });

    serverLogger.info('SYSTEM_EXPORT_COMPLETED', {
      adminId: user.id,
      gradesCount: grades.length,
    });

    return { jsonBundle, csv };
  }

  /**
   * 7. POST /users/:id/role - Admin-only user role modification.
   */
  public async changeUserRole(
    jwt: SupabaseJwtPayload,
    targetUserId: string,
    newRole: UserRole,
  ): Promise<UserRecord> {
    const caller = this.resolveUser(jwt);
    if (caller.role !== 'admin') {
      throw new ServiceError(
        'Admin permission required to change user roles.',
        403,
        'FORBIDDEN_ADMIN_ONLY',
      );
    }

    const userIdx = this.db.users.findIndex((u) => u.id === targetUserId);
    if (userIdx < 0) {
      throw new ServiceError(`Target user "${targetUserId}" not found.`, 404, 'USER_NOT_FOUND');
    }

    const targetUser = this.db.users[userIdx]!;
    const oldRole = targetUser.role;
    const nowIso = new Date().toISOString();

    const updatedUser: UserRecord = {
      ...targetUser,
      role: newRole,
      updated_at: nowIso,
    };
    this.db.users[userIdx] = updatedUser;

    // Audit log
    this.db.auditLog.push({
      id: `audit_role_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      actor: caller.id,
      action: 'ROLE_CHANGE',
      target: targetUser.id,
      at: nowIso,
      metadata: {
        targetUserId,
        targetRollNo: targetUser.roll_no,
        oldRole,
        newRole,
      },
    });

    serverLogger.info('USER_ROLE_CHANGED', {
      adminId: caller.id,
      targetUserId,
      oldRole,
      newRole,
    });

    return updatedUser;
  }

  /**
   * 8. POST /admin/purge-data - Admin-only data retention enforcement.
   */
  public async purgeExpiredData(
    jwt: SupabaseJwtPayload,
    retentionDays = 180,
  ): Promise<PurgeResult> {
    const caller = this.resolveUser(jwt);
    if (caller.role !== 'admin') {
      throw new ServiceError(
        'Admin permission required to execute data retention purges.',
        403,
        'FORBIDDEN_ADMIN_ONLY',
      );
    }

    return executeDataRetentionPurge(this.db, retentionDays, caller.id);
  }
}
