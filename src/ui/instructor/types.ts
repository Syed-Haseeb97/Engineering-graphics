import type { EvaluatedEdge } from '../../checker/types';
import type { DraftEntity } from '../../draft/types';
import type {
  ParameterDefinition,
  PlacementRules,
  RubricWeights,
  ShapeType,
  TopicType,
  ValidityPredicates,
  ViewRequirement,
} from '../../problems/types';

export type InstructorTab = 'dashboard' | 'authoring';

export interface InstructorProfile {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: 'instructor' | 'admin';
  readonly sections: readonly string[];
  readonly token: string;
}

export interface AssignmentSummary {
  readonly id: string;
  readonly templateId: string;
  readonly title: string;
  readonly section: string;
  readonly opensAt: string;
  readonly dueAt: string;
  readonly maxMarks: number;
  readonly totalStudents: number;
  readonly submittedCount: number;
  readonly gradedCount: number;
  readonly averageScore: number | null;
}

export type SubmissionStatus = 'not_started' | 'in_progress' | 'submitted' | 'graded';

export interface SimilarityFlag {
  readonly partnerStudentId: string;
  readonly partnerRollNo: string;
  readonly partnerName: string;
  readonly similarityScore: number; // 0 to 100
  readonly matchedCount: number;
  readonly totalCount: number;
}

export interface StudentSubmissionRow {
  readonly studentId: string;
  readonly rollNo: string;
  readonly name: string;
  readonly section: string;
  readonly attemptId: string | null;
  readonly status: SubmissionStatus;
  readonly score: number | null; // 0 to 100
  readonly breakdown?: {
    readonly recall: number;
    readonly precision: number;
    readonly lineType: number;
    readonly dimensions: number;
  };
  readonly hintsUsed: number;
  readonly unlockedHintLevels: readonly string[];
  readonly timeSpentSec: number;
  readonly isLate: boolean;
  readonly similarityFlag?: SimilarityFlag;
  readonly submissionId?: string;
  readonly gradeId?: string;
  readonly feedback?: string;
  readonly reviewedBy?: string | null;
  readonly submittedAt?: string;
  readonly entities: readonly DraftEntity[];
}

export interface AuditLogEntry {
  readonly id: string;
  readonly actor: string;
  readonly action: string;
  readonly target: string;
  readonly at: string;
  readonly metadata?: {
    readonly oldScore?: number;
    readonly newScore?: number;
    readonly studentId?: string;
    readonly rollNo?: string;
    readonly reason?: string;
  };
}

export interface SubmissionReviewDetails {
  readonly studentRow: StudentSubmissionRow;
  readonly problemStatement: string;
  readonly publicParams: Record<string, number>;
  readonly viewsRequired: readonly ViewRequirement[];
  readonly entities: readonly DraftEntity[];
  readonly evaluatedEdges: readonly EvaluatedEdge[];
  readonly auditLog: readonly AuditLogEntry[];
}

export interface TemplateAuthoringFormState {
  id: string;
  topic: TopicType;
  shape: ShapeType;
  param_schema: Record<string, ParameterDefinition>;
  placement_rules: PlacementRules;
  views_required: ViewRequirement[];
  validity_predicates: ValidityPredicates;
  rubric: RubricWeights;
  statement: string;
}

export interface SeededPreviewSample {
  readonly index: number;
  readonly rollNo: string;
  readonly params: Record<string, number>;
  readonly renderedStatement: string;
  readonly isValid: boolean;
  readonly validationErrors: readonly string[];
}

export interface AssignmentCreatePayload {
  readonly templateId: string;
  readonly section: string;
  readonly dueAt: string;
  readonly maxMarks: number;
}
