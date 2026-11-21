import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DraftEntity } from '../../src/draft/types';
import { createTestJwt } from '../auth';
import { RlsDatabase } from '../db/rls-engine';
import type {
  AssignmentRecord,
  ProblemTemplateRecord,
  UserRecord,
} from '../db/types';
import { GradingService } from '../grading-service';
import { serverLogger } from '../logger';
import { createGradingServer } from '../server';

describe('Grading API Integration & Security Suite', () => {
  let server: Server;
  let baseUrl: string;
  let db: RlsDatabase;
  let service: GradingService;

  const JWT_SECRET = 'supabase_test_jwt_secret_key_antigravity_2026_xyz';
  const SERVER_SEED_SECRET = 'grading_server_secret_key_448833';

  // Test Entities
  const STUDENT_A: UserRecord = {
    id: '00000000-0000-0000-0001-000000000001',
    email: 'aarav.p@college.edu',
    roll_no: '22BCE10001',
    name: 'Aarav Patel',
    role: 'student',
    section: 'A',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const STUDENT_B: UserRecord = {
    id: '00000000-0000-0000-0001-000000000002',
    email: 'priya.s@college.edu',
    roll_no: '22BCE10002',
    name: 'Priya Sharma',
    role: 'student',
    section: 'B', // Different section!
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const INSTRUCTOR_SEC_A: UserRecord = {
    id: '00000000-0000-0000-0002-000000000001',
    email: 'prof.sharma@college.edu',
    roll_no: 'FAC_001',
    name: 'Prof. Sharma',
    role: 'instructor',
    section: 'A',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const TEMPLATE_LINE: ProblemTemplateRecord = {
    id: 'line_inclined_both',
    topic: 'PROJECTION_OF_LINES',
    shape: 'LINE',
    param_schema: {
      trueLength: { min: 60, max: 85, step: 5, unit: 'mm' },
      theta: { min: 25, max: 40, step: 5, unit: 'deg' },
      phi: { min: 20, max: 35, step: 5, unit: 'deg' },
      distHP: { min: 15, max: 30, step: 5, unit: 'mm' },
      distVP: { min: 20, max: 35, step: 5, unit: 'mm' },
    },
    placement_rules: { restingPlane: 'HP' },
    views_required: ['FRONT_VIEW', 'TOP_VIEW'],
    validity_predicates: { requireFirstQuadrant: true },
    rubric: { recall: 0.35, precision: 0.3, lineType: 0.25, dimensions: 0.1 },
    statement: 'A straight line AB, {trueLength} mm long...',
    ground_truth: { privateData: 'must_never_leak' },
    seeding_secret: 'salt_super_secret',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const ASSIGNMENT_SEC_A: AssignmentRecord = {
    id: 'asg-sec-a-001',
    template_id: 'line_inclined_both',
    section: 'A',
    opens_at: new Date(Date.now() - 3600_000).toISOString(),
    due_at: new Date(Date.now() + 86400_000).toISOString(), // Closes tomorrow
    max_marks: 100,
    created_at: new Date().toISOString(),
  };

  const ASSIGNMENT_OVERDUE: AssignmentRecord = {
    id: 'asg-overdue-001',
    template_id: 'line_inclined_both',
    section: 'A',
    opens_at: new Date(Date.now() - 86400_000 * 5).toISOString(),
    due_at: new Date(Date.now() - 3600_000).toISOString(), // Due 1 hour ago
    max_marks: 100,
    created_at: new Date().toISOString(),
  };

  // JWTs for testing
  let tokenStudentA: string;
  let tokenStudentB: string;
  let tokenInstructor: string;

  beforeAll(async () => {
    db = new RlsDatabase();
    db.users = [STUDENT_A, STUDENT_B, INSTRUCTOR_SEC_A];
    db.problemTemplates = [TEMPLATE_LINE];
    db.assignments = [ASSIGNMENT_SEC_A, ASSIGNMENT_OVERDUE];
    db.instructorSections = [{ instructor_id: INSTRUCTOR_SEC_A.id, section: 'A' }];

    service = new GradingService(db, {
      serverSecret: SERVER_SEED_SECRET,
    });

    server = createGradingServer(service, {
      jwtSecret: JWT_SECRET,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    tokenStudentA = createTestJwt({ sub: STUDENT_A.id, email: STUDENT_A.email }, JWT_SECRET);
    tokenStudentB = createTestJwt({ sub: STUDENT_B.id, email: STUDENT_B.email }, JWT_SECRET);
    tokenInstructor = createTestJwt({ sub: INSTRUCTOR_SEC_A.id, email: INSTRUCTOR_SEC_A.email }, JWT_SECRET);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('1. Full Lifecycle: Create Attempt -> Draw -> Check -> Submit', () => {
    let createdAttemptId: string;

    it('creates an attempt as Student A and returns rendered statement and parameters ONLY', async () => {
      const res = await fetch(`${baseUrl}/attempts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({ assignment_id: ASSIGNMENT_SEC_A.id }),
      });

      expect(res.status).toBe(201);
      const data = (await res.json()) as {
        attemptId: string;
        assignmentId: string;
        problem: {
          statement: string;
          publicParams: Record<string, number>;
          viewsRequired: string[];
          problemId: string;
        };
      };

      expect(data.attemptId).toBeDefined();
      expect(data.assignmentId).toBe(ASSIGNMENT_SEC_A.id);
      expect(data.problem.statement).toContain('A straight line AB');
      expect(data.problem.publicParams).toBeDefined();
      expect(data.problem.viewsRequired).toEqual(['FRONT_VIEW', 'TOP_VIEW']);

      // SECURITY AUDIT: Verify no ground truth, secret, or seed in response
      const rawJson = JSON.stringify(data);
      expect(rawJson).not.toContain('seed');
      expect(rawJson).not.toContain('salt_super_secret');
      expect(rawJson).not.toContain('ground_truth');
      expect(rawJson).not.toContain('must_never_leak');

      createdAttemptId = data.attemptId;
    });

    it('previews check on the created attempt with plain-language hints', async () => {
      // Drawing with horizontal reference line and two projection lines
      const drawingFixture: { entities: DraftEntity[] } = {
        entities: [
          {
            id: 'xy_line',
            type: 'line',
            p1: { x: 0, y: 0 },
            p2: { x: 120, y: 0 },
            lineType: 'thin',
          },
          {
            id: 'front_line',
            type: 'line',
            p1: { x: 30, y: 15 },
            p2: { x: 80, y: 45 },
            lineType: 'continuous',
          },
          {
            id: 'top_line',
            type: 'line',
            p1: { x: 30, y: -20 },
            p2: { x: 80, y: -50 },
            lineType: 'continuous',
          },
        ],
      };

      const res = await fetch(`${baseUrl}/attempts/${createdAttemptId}/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({ drawing_json: drawingFixture }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        score: number;
        metrics: Record<string, number>;
        hints: { level1: string; level2: string; level3: string }[];
      };

      expect(data.score).toBeGreaterThan(0);
      expect(data.metrics).toBeDefined();
      expect(data.hints).toBeDefined();
      expect(data.hints.length).toBeGreaterThanOrEqual(1);

      // Verify hint texts never leak coordinates
      for (const h of data.hints) {
        expect(h.level1).not.toMatch(/\d+/);
        expect(h.level2).not.toMatch(/\d+/);
        expect(h.level3).not.toMatch(/\d+/);
      }

      // Verify attempt is NOT finalized by /check
      const attemptInDb = db.attempts.find((a) => a.id === createdAttemptId);
      expect(attemptInDb!.status).toBe('in_progress');
      expect(db.submissions.some((s) => s.attempt_id === createdAttemptId)).toBe(false);
    });

    it('submits final attempt, evaluates grade, and marks attempt as submitted', async () => {
      const drawingFixture = {
        entities: [
          { id: 'xy', type: 'line', p1: { x: 0, y: 0 }, p2: { x: 120, y: 0 }, lineType: 'thin' },
          { id: 'f1', type: 'line', p1: { x: 30, y: 15 }, p2: { x: 80, y: 45 }, lineType: 'continuous' },
          { id: 't1', type: 'line', p1: { x: 30, y: -20 }, p2: { x: 80, y: -50 }, lineType: 'continuous' },
        ],
      };

      const res = await fetch(`${baseUrl}/attempts/${createdAttemptId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({ drawing_json: drawingFixture }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        submissionId: string;
        gradeId: string;
        score: number;
        isLate: boolean;
      };

      expect(data.submissionId).toBeDefined();
      expect(data.gradeId).toBeDefined();
      expect(data.score).toBeGreaterThan(0);
      expect(data.isLate).toBe(false);

      // Verify database state updated
      const attemptInDb = db.attempts.find((a) => a.id === createdAttemptId);
      expect(attemptInDb!.status).toBe('submitted');
      expect(db.grades.some((g) => g.id === data.gradeId)).toBe(true);
    });

    it('is strictly idempotent on duplicate submission attempts', async () => {
      const res = await fetch(`${baseUrl}/attempts/${createdAttemptId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({ drawing_json: { entities: [] } }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        alreadySubmitted: boolean;
        submissionId: string;
        score: number;
      };

      expect(data.alreadySubmitted).toBe(true);
      expect(data.submissionId).toBeDefined();
    });

    it('allows Student A to GET their own submitted attempt details', async () => {
      const res = await fetch(`${baseUrl}/attempts/${createdAttemptId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tokenStudentA}`,
        },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        attemptId: string;
        status: string;
        submission?: { id: string };
        grade?: { score: number };
      };

      expect(data.attemptId).toBe(createdAttemptId);
      expect(data.status).toBe('submitted');
      expect(data.submission).toBeDefined();
      expect(data.grade).toBeDefined();
    });
  });

  describe('2. Security & Unauthorized Access Enforcement', () => {
    it('rejects unauthenticated requests missing JWT with 401', async () => {
      const res = await fetch(`${baseUrl}/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_id: ASSIGNMENT_SEC_A.id }),
      });

      expect(res.status).toBe(401);
      const data = (await res.json()) as { error: string };
      expect(data.error).toContain('Missing Authorization header');
    });

    it('rejects student attempting an assignment designated for another section', async () => {
      // Student B is enrolled in Section B, but assignment is for Section A
      const res = await fetch(`${baseUrl}/attempts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentB}`,
        },
        body: JSON.stringify({ assignment_id: ASSIGNMENT_SEC_A.id }),
      });

      expect(res.status).toBe(403);
      const data = (await res.json()) as { code: string };
      expect(data.code).toBe('SECTION_MISMATCH');
    });

    it("prevents Student B from accessing Student A's attempt data (GET /attempts/:id)", async () => {
      const studentAAttempt = db.attempts.find((a) => a.student_id === STUDENT_A.id)!;

      const res = await fetch(`${baseUrl}/attempts/${studentAAttempt.id}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tokenStudentB}`,
        },
      });

      expect(res.status).toBe(403);
      const data = (await res.json()) as { code: string };
      expect(data.code).toBe('FORBIDDEN_ATTEMPT');
    });

    it("prevents Student B from submitting drawings to Student A's attempt", async () => {
      const studentAAttempt = db.attempts.find((a) => a.student_id === STUDENT_A.id)!;

      const res = await fetch(`${baseUrl}/attempts/${studentAAttempt.id}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentB}`,
        },
        body: JSON.stringify({ drawing_json: { entities: [] } }),
      });

      expect(res.status).toBe(403);
      const data = (await res.json()) as { code: string };
      expect(data.code).toBe('FORBIDDEN_ATTEMPT');
    });

    it('derives identity purely from JWT and ignores spoofed student_id in body', async () => {
      // Student A tries to spoof student_id as Student B in attempt creation
      const res = await fetch(`${baseUrl}/attempts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({
          assignment_id: ASSIGNMENT_SEC_A.id,
          student_id: STUDENT_B.id, // Malicious spoof
        }),
      });

      expect(res.status).toBe(201);
      const data = (await res.json()) as { attemptId: string };
      const attemptInDb = db.attempts.find((a) => a.id === data.attemptId);

      // Identity MUST be Student A, never Student B
      expect(attemptInDb!.student_id).toBe(STUDENT_A.id);
      expect(attemptInDb!.student_id).not.toBe(STUDENT_B.id);
    });
  });

  describe('3. Rate Limiting, Request Size, and Deadlines', () => {
    it('rejects oversized drawing payloads exceeding size limits with 413', async () => {
      // Create a fresh attempt for testing
      const newAttempt = await service.createAttempt(
        { sub: STUDENT_A.id, email: STUDENT_A.email, exp: 9999999999, iat: 1 },
        ASSIGNMENT_SEC_A.id,
      );

      // Fabricate 501 entities (limit is 500)
      const hugeEntities: DraftEntity[] = Array.from({ length: 501 }, (_, i) => ({
        id: `e_${i}`,
        type: 'line',
        p1: { x: i, y: 0 },
        p2: { x: i + 1, y: 0 },
        lineType: 'continuous',
      }));

      const res = await fetch(`${baseUrl}/attempts/${newAttempt.attemptId}/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({ drawing_json: { entities: hugeEntities } }),
      });

      expect(res.status).toBe(413);
      const data = (await res.json()) as { code: string };
      expect(data.code).toBe('DRAWING_TOO_LARGE');
    });

    it('enforces rate limits on /check when calls exceed quota (max 5 per min)', async () => {
      const newAttempt = await service.createAttempt(
        { sub: STUDENT_A.id, email: STUDENT_A.email, exp: 9999999999, iat: 1 },
        ASSIGNMENT_SEC_A.id,
      );

      service.rateLimiter.reset(STUDENT_A.id);

      // Consume 5 allowed requests
      for (let i = 0; i < 5; i++) {
        const res = await fetch(`${baseUrl}/attempts/${newAttempt.attemptId}/check`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenStudentA}`,
          },
          body: JSON.stringify({ drawing_json: { entities: [] } }),
        });
        expect(res.status).toBe(200);
      }

      // 6th request must trigger rate limit 429
      const rateLimitedRes = await fetch(`${baseUrl}/attempts/${newAttempt.attemptId}/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({ drawing_json: { entities: [] } }),
      });

      expect(rateLimitedRes.status).toBe(429);
      const data = (await rateLimitedRes.json()) as { code: string; error: string };
      expect(data.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(data.error).toContain('Rate limit exceeded');
    });

    it('flags late submissions when submitted after assignment due_at', async () => {
      // Overdue assignment
      const lateAttempt = await service.createAttempt(
        { sub: STUDENT_A.id, email: STUDENT_A.email, exp: 9999999999, iat: 1 },
        ASSIGNMENT_OVERDUE.id,
      );

      const res = await fetch(`${baseUrl}/attempts/${lateAttempt.attemptId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({ drawing_json: { entities: [] } }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { isLate: boolean; feedback: string };
      expect(data.isLate).toBe(true);
      expect(data.feedback).toContain('late flag applied');
    });
  });

  describe('4. Faculty Override Endpoint & Audit Logging', () => {
    it('allows Instructor to override a grade and writes to audit_log', async () => {
      const studentGrade = db.grades[0]!;
      const oldScore = studentGrade.score;

      const res = await fetch(`${baseUrl}/grades/${studentGrade.id}/override`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenInstructor}`,
        },
        body: JSON.stringify({
          score: 99,
          feedback: 'Faculty bonus: exceptional accuracy on line inclination.',
        }),
      });

      expect(res.status).toBe(200);
      const updated = (await res.json()) as { score: number; reviewed_by: string };
      expect(updated.score).toBe(99);
      expect(updated.reviewed_by).toBe(INSTRUCTOR_SEC_A.id);

      // Verify audit log entry
      const audit = db.auditLog.find((a) => a.action === 'GRADE_OVERRIDE' && a.target === studentGrade.id);
      expect(audit).toBeDefined();
      expect(audit!.actor).toBe(INSTRUCTOR_SEC_A.id);
      expect((audit!.metadata as { oldScore: number }).oldScore).toBe(oldScore);
      expect((audit!.metadata as { newScore: number }).newScore).toBe(99);
    });

    it('strictly forbids students from invoking faculty override endpoint', async () => {
      const studentGrade = db.grades[0]!;

      const res = await fetch(`${baseUrl}/grades/${studentGrade.id}/override`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStudentA}`,
        },
        body: JSON.stringify({ score: 100 }),
      });

      expect(res.status).toBe(403);
      const data = (await res.json()) as { code: string };
      expect(data.code).toBe('FORBIDDEN_ROLE');
    });
  });

  describe('5. Structured Logging & Secret Leak Verification', () => {
    it('proves structured logs never log raw seeds, secrets, or full drawings', () => {
      serverLogger.clear();

      serverLogger.info('TEST_EVENT', {
        serverSecret: 'ultra_secret_123',
        seed: 'hmac_sha256_seed_456',
        drawing_json: {
          entities: [
            { id: '1', p1: { x: 10, y: 20 }, p2: { x: 30, y: 40 } },
            { id: '2', p1: { x: 30, y: 40 }, p2: { x: 50, y: 60 } },
          ],
        },
      });

      const logged = serverLogger.logs[0]!;
      expect(logged.serverSecret).toBe('[REDACTED]');
      expect(logged.seed).toBe('[REDACTED]');
      expect(logged.drawing_json).toEqual({
        _type: 'drawing_json_summary',
        entityCount: 2,
      });

      // Assert JSON stringification contains zero leaked secrets
      const json = JSON.stringify(logged);
      expect(json).not.toContain('ultra_secret_123');
      expect(json).not.toContain('hmac_sha256_seed_456');
    });
  });
});
