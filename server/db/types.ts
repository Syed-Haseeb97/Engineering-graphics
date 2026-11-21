/**
 * Database Entity Types matching Supabase PostgreSQL Schema
 */

export type UserRole = 'student' | 'instructor' | 'admin';

export interface UserRecord {
  readonly id: string;
  readonly email: string;
  readonly roll_no: string;
  readonly name: string;
  readonly role: UserRole;
  readonly section: string; // e.g. 'A', 'B', 'C', or 'ALL'
  readonly created_at: string;
  readonly updated_at: string;
}

export interface InstructorSectionRecord {
  readonly instructor_id: string;
  readonly section: string;
}

export interface ProblemTemplateRecord {
  readonly id: string;
  readonly topic: string;
  readonly shape: string;
  readonly param_schema: Record<string, unknown>;
  readonly placement_rules: Record<string, unknown>;
  readonly views_required: readonly string[];
  readonly validity_predicates: Record<string, unknown>;
  readonly rubric: Record<string, number>;
  readonly statement: string;
  /** PRIVATE: Canonical B-Rep vertices & edges. Never exposed to student role. */
  readonly ground_truth?: Record<string, unknown>;
  /** PRIVATE: Cryptographic salt. Never exposed to student role. */
  readonly seeding_secret?: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface AssignmentRecord {
  readonly id: string;
  readonly template_id: string;
  readonly section: string;
  readonly opens_at: string;
  readonly due_at: string;
  readonly max_marks: number;
  readonly created_at: string;
}

export type AttemptStatus = 'in_progress' | 'submitted' | 'abandoned';

export interface AttemptRecord {
  readonly id: string;
  readonly assignment_id: string;
  readonly student_id: string;
  readonly seed: string;
  readonly started_at: string;
  readonly command_log: readonly unknown[];
  readonly status: AttemptStatus;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface SubmissionRecord {
  readonly id: string;
  readonly attempt_id: string;
  readonly drawing_json: Record<string, unknown>;
  readonly submitted_at: string;
}

export interface GradeRecord {
  readonly id: string;
  readonly submission_id: string;
  readonly score: number;
  readonly breakdown: Record<string, number>;
  readonly feedback: string;
  readonly reviewed_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface InviteCodeRecord {
  readonly id: string;
  readonly code: string;
  readonly role: 'student' | 'instructor';
  readonly section: string;
  readonly max_uses: number;
  readonly uses_count: number;
  readonly expires_at: string | null;
  readonly created_at: string;
}

export interface AuditLogRecord {
  readonly id: string;
  readonly actor: string | null;
  readonly action: string;
  readonly target: string;
  readonly at: string;
  readonly metadata: Record<string, unknown>;
}
