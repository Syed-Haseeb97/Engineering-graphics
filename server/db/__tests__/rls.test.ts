import { beforeEach, describe, expect, it } from 'vitest';
import { PermissionDeniedError, RlsDatabase } from '../rls-engine';
import type {
  AssignmentRecord,
  AttemptRecord,
  GradeRecord,
  ProblemTemplateRecord,
  SubmissionRecord,
  UserRecord,
} from '../types';

describe('Database Multi-Tenant RLS Security Suite', () => {
  let db: RlsDatabase;

  const STUDENT_A: UserRecord = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'aarav.p@college.edu',
    roll_no: '22BCE10001',
    name: 'Aarav Patel',
    role: 'student',
    section: 'A',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const STUDENT_B: UserRecord = {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'vikram.m@college.edu',
    roll_no: '22BME10001',
    name: 'Vikram Mehta',
    role: 'student',
    section: 'B',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const INSTRUCTOR_ALL: UserRecord = {
    id: '99999999-9999-9999-9999-999999999999',
    email: 'h.sharma@college.edu',
    roll_no: 'FAC_001',
    name: 'Prof. H. Sharma',
    role: 'instructor',
    section: 'ALL',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const INSTRUCTOR_SEC_A: UserRecord = {
    id: '88888888-8888-8888-8888-888888888888',
    email: 'r.verma@college.edu',
    roll_no: 'FAC_002',
    name: 'Prof. R. Verma',
    role: 'instructor',
    section: 'A',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const TEMPLATE_CONE: ProblemTemplateRecord = {
    id: 'cone_inclined_both',
    topic: 'PROJECTION_OF_SOLIDS',
    shape: 'CONE',
    param_schema: { baseDia: { min: 40, max: 50, step: 5, unit: 'mm' } },
    placement_rules: { restingPlane: 'HP' },
    views_required: ['FRONT_VIEW', 'TOP_VIEW'],
    validity_predicates: { requireFirstQuadrant: true },
    rubric: { recall: 0.35, precision: 0.3, lineType: 0.25, dimensions: 0.1 },
    statement: 'A cone of base {baseDia} mm diameter...',
    ground_truth: { vertices: [{ x: 30, y: 15 }, { x: 70, y: 65 }] },
    seeding_secret: 'hmac_sha256_super_secret_salt_998',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const ASSIGNMENT_A: AssignmentRecord = {
    id: 'aaaa1111-0000-0000-0000-000000000000',
    template_id: 'cone_inclined_both',
    section: 'A',
    opens_at: new Date(Date.now() - 3600000).toISOString(),
    due_at: new Date(Date.now() + 86400000).toISOString(),
    max_marks: 100,
    created_at: new Date().toISOString(),
  };

  const ATTEMPT_STUDENT_A: AttemptRecord = {
    id: 'att-1111',
    assignment_id: ASSIGNMENT_A.id,
    student_id: STUDENT_A.id,
    seed: 'seed_aarav_cone',
    started_at: new Date().toISOString(),
    command_log: [{ cmd: 'LINE', payload: [0, 0, 10, 10] }],
    status: 'in_progress',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const SUBMISSION_STUDENT_A: SubmissionRecord = {
    id: 'sub-1111',
    attempt_id: ATTEMPT_STUDENT_A.id,
    drawing_json: { lines: [{ x1: 0, y1: 0, x2: 50, y2: 50 }] },
    submitted_at: new Date().toISOString(),
  };

  const GRADE_STUDENT_A: GradeRecord = {
    id: 'grd-1111',
    submission_id: SUBMISSION_STUDENT_A.id,
    score: 92,
    breakdown: { recall: 0.35, precision: 0.27, lineType: 0.2, dimensions: 0.1 },
    feedback: 'Well aligned orthographic projection.',
    reviewed_by: INSTRUCTOR_ALL.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const ATTEMPT_STUDENT_B: AttemptRecord = {
    id: 'att-2222',
    assignment_id: ASSIGNMENT_A.id,
    student_id: STUDENT_B.id,
    seed: 'seed_vikram_cone',
    started_at: new Date().toISOString(),
    command_log: [],
    status: 'in_progress',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const SUBMISSION_STUDENT_B: SubmissionRecord = {
    id: 'sub-2222',
    attempt_id: ATTEMPT_STUDENT_B.id,
    drawing_json: { lines: [] },
    submitted_at: new Date().toISOString(),
  };

  beforeEach(() => {
    db = new RlsDatabase();
    db.users = [STUDENT_A, STUDENT_B, INSTRUCTOR_ALL, INSTRUCTOR_SEC_A];
    db.problemTemplates = [TEMPLATE_CONE];
    db.assignments = [ASSIGNMENT_A];
    db.attempts = [ATTEMPT_STUDENT_A, ATTEMPT_STUDENT_B];
    db.submissions = [SUBMISSION_STUDENT_A, SUBMISSION_STUDENT_B];
    db.grades = [GRADE_STUDENT_A];
    db.instructorSections = [{ instructor_id: INSTRUCTOR_SEC_A.id, section: 'A' }];
  });

  describe('1. Student Isolation Policies', () => {
    it('allows Student A to read only their own user profile and prevents reading other students', () => {
      const clientA = db.connectAs(STUDENT_A.id);
      const visibleUsers = clientA.selectUsers();

      expect(visibleUsers).toHaveLength(1);
      expect(visibleUsers[0]!.id).toBe(STUDENT_A.id);
      expect(visibleUsers[0]!.roll_no).toBe('22BCE10001');

      // Student B must be completely hidden
      expect(visibleUsers.some((u) => u.id === STUDENT_B.id)).toBe(false);
    });

    it('proves Student A can read and write their own attempts and submissions', () => {
      const clientA = db.connectAs(STUDENT_A.id);

      // Read own attempt
      const attempts = clientA.selectAttempts();
      expect(attempts).toHaveLength(1);
      expect(attempts[0]!.id).toBe(ATTEMPT_STUDENT_A.id);
      expect(attempts[0]!.student_id).toBe(STUDENT_A.id);

      // Read own submission
      const submissions = clientA.selectSubmissions();
      expect(submissions).toHaveLength(1);
      expect(submissions[0]!.id).toBe(SUBMISSION_STUDENT_A.id);

      // Insert new attempt for themselves
      const newAttempt = clientA.insertAttempt({
        id: 'att-1112',
        assignment_id: ASSIGNMENT_A.id,
        student_id: STUDENT_A.id,
        seed: 'seed_2',
        started_at: new Date().toISOString(),
        command_log: [],
        status: 'in_progress',
      });
      expect(newAttempt.student_id).toBe(STUDENT_A.id);
    });

    it("proves Student A CANNOT read Student B's rows (attempts or submissions)", () => {
      const clientA = db.connectAs(STUDENT_A.id);

      const attempts = clientA.selectAttempts();
      expect(attempts.some((a) => a.student_id === STUDENT_B.id)).toBe(false);
      expect(attempts.some((a) => a.id === ATTEMPT_STUDENT_B.id)).toBe(false);

      const submissions = clientA.selectSubmissions();
      expect(submissions.some((s) => s.id === SUBMISSION_STUDENT_B.id)).toBe(false);
    });

    it('proves Student A cannot insert attempts on behalf of Student B', () => {
      const clientA = db.connectAs(STUDENT_A.id);

      expect(() => {
        clientA.insertAttempt({
          id: 'spoofed_attempt',
          assignment_id: ASSIGNMENT_A.id,
          student_id: STUDENT_B.id,
          seed: 'spoofed_seed',
          started_at: new Date().toISOString(),
          command_log: [],
          status: 'in_progress',
        });
      }).toThrowError(PermissionDeniedError);
    });
  });

  describe('2. Grade Protection Policies', () => {
    it('proves students cannot insert or update any grade (read-only for own grade)', () => {
      const clientA = db.connectAs(STUDENT_A.id);

      // Student A can read their own published grade
      const grades = clientA.selectGrades();
      expect(grades).toHaveLength(1);
      expect(grades[0]!.submission_id).toBe(SUBMISSION_STUDENT_A.id);
      expect(grades[0]!.score).toBe(92);

      // Attempting to insert a grade must fail with PermissionDeniedError
      expect(() => {
        clientA.insertGrade({
          id: 'fake_grade',
          submission_id: SUBMISSION_STUDENT_A.id,
          score: 100,
          breakdown: { recall: 1.0 },
          feedback: 'Hacked perfect score',
          reviewed_by: STUDENT_A.id,
        });
      }).toThrowError(PermissionDeniedError);

      // Attempting to update a grade must fail with PermissionDeniedError
      expect(() => {
        clientA.updateGrade(GRADE_STUDENT_A.id, { score: 100 });
      }).toThrowError(PermissionDeniedError);
    });

    it('proves service role can insert grades (auto-checker grading)', () => {
      const serviceRole = db.connectAsServiceRole();

      const newGrade = serviceRole.insertGrade({
        id: 'auto-graded-sub-2',
        submission_id: SUBMISSION_STUDENT_B.id,
        score: 88,
        breakdown: { recall: 0.35, precision: 0.25, lineType: 0.18, dimensions: 0.1 },
        feedback: 'Auto-checker verified.',
        reviewed_by: null,
      });

      expect(newGrade.score).toBe(88);
      expect(db.grades).toHaveLength(2);
    });
  });

  describe('3. Zero Ground-Truth & Seeding Secret Leak Guarantee', () => {
    it("proves Student A CANNOT read templates' ground-truth or seeding secret fields", () => {
      const clientA = db.connectAs(STUDENT_A.id);
      const templates = clientA.selectProblemTemplates();

      expect(templates).toHaveLength(1);
      const studentView = templates[0]!;

      // Public statement and schema are accessible
      expect(studentView.id).toBe('cone_inclined_both');
      expect(studentView.statement).toContain('A cone of base');
      expect(studentView.param_schema).toBeDefined();

      // Ground truth and seeding secret must be strictly undefined/omitted
      expect(studentView.ground_truth).toBeUndefined();
      expect(studentView.seeding_secret).toBeUndefined();

      // Confirm raw stringification does not leak secret salt
      const json = JSON.stringify(studentView);
      expect(json).not.toContain('hmac_sha256_super_secret_salt_998');
      expect(json).not.toContain('ground_truth');
    });

    it('proves Instructor can read full templates with ground truth for verification', () => {
      const instructorClient = db.connectAs(INSTRUCTOR_ALL.id);
      const templates = instructorClient.selectProblemTemplates();

      expect(templates).toHaveLength(1);
      expect(templates[0]!.ground_truth).toBeDefined();
      expect(templates[0]!.seeding_secret).toBe('hmac_sha256_super_secret_salt_998');
    });
  });

  describe('4. Section-Based Instructor Visibility', () => {
    it('proves Instructor for Section A can read Section A students but cannot read Section B students', () => {
      const instructorA = db.connectAs(INSTRUCTOR_SEC_A.id);

      // Select users
      const users = instructorA.selectUsers();
      expect(users.some((u) => u.id === STUDENT_A.id)).toBe(true);
      expect(users.some((u) => u.id === STUDENT_B.id)).toBe(false); // Section B student invisible

      // Select attempts
      const attempts = instructorA.selectAttempts();
      expect(attempts.some((a) => a.student_id === STUDENT_A.id)).toBe(true);
      expect(attempts.some((a) => a.student_id === STUDENT_B.id)).toBe(false);

      // Section A instructor cannot override grade for Section B student
      expect(() => {
        instructorA.insertGrade({
          id: 'illegal_cross_sec_grade',
          submission_id: SUBMISSION_STUDENT_B.id,
          score: 80,
          breakdown: {},
          feedback: 'Cross section grading',
          reviewed_by: INSTRUCTOR_SEC_A.id,
        });
      }).toThrowError(PermissionDeniedError);
    });

    it('proves Head Instructor (ALL sections) can read and override grades across sections', () => {
      const headInstructor = db.connectAs(INSTRUCTOR_ALL.id);

      const users = headInstructor.selectUsers();
      expect(users.some((u) => u.id === STUDENT_A.id)).toBe(true);
      expect(users.some((u) => u.id === STUDENT_B.id)).toBe(true);

      const updatedGrade = headInstructor.updateGrade(GRADE_STUDENT_A.id, {
        score: 98,
        feedback: 'Instructor review: upgraded by +6 marks for exceptional presentation.',
      });

      expect(updatedGrade.score).toBe(98);
      expect(updatedGrade.feedback).toContain('upgraded by +6 marks');
    });
  });
});
