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
import { createGradingServer } from '../server';
import { scanForSecrets } from '../../scripts/check-secrets';
import { generateDatabaseDump, restoreDatabaseDump } from '../../scripts/backup';

describe('Operational Safety & Audit Suite', () => {
  let server: Server;
  let baseUrl: string;
  let db: RlsDatabase;
  let service: GradingService;

  const JWT_SECRET = 'supabase_test_jwt_secret_ops_safety_2026';
  const SERVER_SEED_SECRET = 'grading_server_secret_key_ops_safety_8899';

  const ADMIN_USER: UserRecord = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'admin.dean@college.edu',
    roll_no: 'ADMIN_01',
    name: 'Dean Academic',
    role: 'admin',
    section: 'ALL',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const INSTRUCTOR_A: UserRecord = {
    id: '00000000-0000-0000-0002-000000000001',
    email: 'prof.gupta@college.edu',
    roll_no: 'FAC_001',
    name: 'Prof. Gupta',
    role: 'instructor',
    section: 'A',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const STUDENT_A: UserRecord = {
    id: '00000000-0000-0000-0001-000000000001',
    email: 'rohit.k@college.edu',
    roll_no: '22BCE10042',
    name: 'Rohit Kumar',
    role: 'student',
    section: 'A',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const TEMPLATE_LINE: ProblemTemplateRecord = {
    id: 'line_inclined_both',
    topic: 'PROJECTION_OF_LINES',
    shape: 'LINE',
    param_schema: { trueLength: { min: 60, max: 100, step: 5, unit: 'mm' } },
    placement_rules: {},
    views_required: ['FRONT', 'TOP'],
    validity_predicates: {},
    rubric: { recall: 0.5, precision: 0.3, lineType: 0.2, dimensions: 0.0 },
    statement: 'A straight line AB {trueLength} mm long...',
    seeding_secret: SERVER_SEED_SECRET,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const ASSIGNMENT_A: AssignmentRecord = {
    id: '00000000-0000-0000-0003-000000000001',
    template_id: 'line_inclined_both',
    section: 'A',
    opens_at: new Date(Date.now() - 3600000).toISOString(),
    due_at: new Date(Date.now() + 86400000).toISOString(),
    max_marks: 100,
    created_at: new Date().toISOString(),
  };

  beforeAll(async () => {
    db = new RlsDatabase();
    db.users.push(ADMIN_USER, INSTRUCTOR_A, STUDENT_A);
    db.problemTemplates.push(TEMPLATE_LINE);
    db.assignments.push(ASSIGNMENT_A);

    service = new GradingService(db, {
      serverSecret: SERVER_SEED_SECRET,
    });

    server = createGradingServer(service, {
      jwtSecret: JWT_SECRET,
      maxPayloadBytes: 256 * 1024,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // Helper HTTP request
  async function makeRequest(
    pathname: string,
    options: {
      method?: string;
      jwt?: string;
      body?: unknown;
    } = {},
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (options.jwt) {
      headers['Authorization'] = `Bearer ${options.jwt}`;
    }

    const res = await fetch(`${baseUrl}${pathname}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, body };
  }

  // ── 1. Audit Log Writes Verification ────────────────────────────────────
  describe('Audit Log Writes (7 Mandatory Event Types)', () => {
    let attemptId: string;
    let submissionId: string;
    let gradeId: string;

    it('1. writes audit log on LOGIN', async () => {
      const studentJwt = createTestJwt(
        { sub: STUDENT_A.id, email: STUDENT_A.email, role: 'authenticated' },
        JWT_SECRET,
      );

      const res = await makeRequest('/auth/login', {
        method: 'POST',
        jwt: studentJwt,
        body: { userAgent: 'Mozilla/5.0 TestBrowser', ip: '127.0.0.1' },
      });

      expect(res.status).toBe(200);

      const loginLog = db.auditLog.find(
        (log) => log.action === 'LOGIN' && log.actor === STUDENT_A.id,
      );
      expect(loginLog).toBeDefined();
      expect(loginLog?.target).toBe(STUDENT_A.id);
      expect(loginLog?.metadata['email']).toBe(STUDENT_A.email);
    });

    it('2. writes audit log on ATTEMPT_CREATE', async () => {
      const studentJwt = createTestJwt(
        { sub: STUDENT_A.id, email: STUDENT_A.email, role: 'authenticated' },
        JWT_SECRET,
      );

      const res = await makeRequest('/attempts', {
        method: 'POST',
        jwt: studentJwt,
        body: { assignment_id: ASSIGNMENT_A.id },
      });

      expect(res.status).toBe(201);
      attemptId = res.body['attemptId'] as string;

      const attemptLog = db.auditLog.find(
        (log) => log.action === 'ATTEMPT_CREATE' && log.actor === STUDENT_A.id,
      );
      expect(attemptLog).toBeDefined();
      expect(attemptLog?.target).toBe(attemptId);
      expect(attemptLog?.metadata['assignmentId']).toBe(ASSIGNMENT_A.id);
      expect(attemptLog?.metadata['rollNo']).toBe(STUDENT_A.roll_no);
    });

    it('3. writes audit log on CHECK', async () => {
      const studentJwt = createTestJwt(
        { sub: STUDENT_A.id, email: STUDENT_A.email, role: 'authenticated' },
        JWT_SECRET,
      );

      const sampleDrawing: { entities: DraftEntity[] } = {
        entities: [
          {
            id: 'l1',
            type: 'line',
            lineType: 'continuous',
            p1: { x: 20, y: 30 },
            p2: { x: 100, y: 30 },
          },
        ],
      };

      const res = await makeRequest(`/attempts/${attemptId}/check`, {
        method: 'POST',
        jwt: studentJwt,
        body: { drawing_json: sampleDrawing },
      });

      expect(res.status).toBe(200);

      const checkLog = db.auditLog.find(
        (log) => log.action === 'CHECK' && log.actor === STUDENT_A.id,
      );
      expect(checkLog).toBeDefined();
      expect(checkLog?.target).toBe(attemptId);
      expect(checkLog?.metadata['attemptId']).toBe(attemptId);
    });

    it('4. writes audit log on SUBMIT', async () => {
      const studentJwt = createTestJwt(
        { sub: STUDENT_A.id, email: STUDENT_A.email, role: 'authenticated' },
        JWT_SECRET,
      );

      const sampleDrawing: { entities: DraftEntity[] } = {
        entities: [
          {
            id: 'l1',
            type: 'line',
            lineType: 'continuous',
            p1: { x: 20, y: 30 },
            p2: { x: 100, y: 30 },
          },
        ],
      };

      const res = await makeRequest(`/attempts/${attemptId}/submit`, {
        method: 'POST',
        jwt: studentJwt,
        body: { drawing_json: sampleDrawing },
      });

      expect(res.status).toBe(200);
      submissionId = res.body['submissionId'] as string;
      gradeId = res.body['gradeId'] as string;

      const submitLog = db.auditLog.find(
        (log) => log.action === 'SUBMIT' && log.actor === STUDENT_A.id,
      );
      expect(submitLog).toBeDefined();
      expect(submitLog?.target).toBe(submissionId);
      expect(submitLog?.metadata['gradeId']).toBe(gradeId);
    });

    it('5. writes audit log on GRADE_OVERRIDE', async () => {
      const instructorJwt = createTestJwt(
        { sub: INSTRUCTOR_A.id, email: INSTRUCTOR_A.email, role: 'authenticated' },
        JWT_SECRET,
      );

      const res = await makeRequest(`/grades/${gradeId}/override`, {
        method: 'POST',
        jwt: instructorJwt,
        body: { score: 95.0, feedback: 'Excellent projection alignment on recheck.' },
      });

      expect(res.status).toBe(200);

      const overrideLog = db.auditLog.find(
        (log) => log.action === 'GRADE_OVERRIDE' && log.actor === INSTRUCTOR_A.id,
      );
      expect(overrideLog).toBeDefined();
      expect(overrideLog?.target).toBe(gradeId);
      expect(overrideLog?.metadata['newScore']).toBe(95.0);
      expect(overrideLog?.metadata['studentId']).toBe(STUDENT_A.id);
    });

    it('6. writes audit log on ROLE_CHANGE (Admin only)', async () => {
      const adminJwt = createTestJwt(
        { sub: ADMIN_USER.id, email: ADMIN_USER.email, role: 'authenticated' },
        JWT_SECRET,
      );
      const studentJwt = createTestJwt(
        { sub: STUDENT_A.id, email: STUDENT_A.email, role: 'authenticated' },
        JWT_SECRET,
      );

      // Student attempting role change must receive 403
      const unauthorizedRes = await makeRequest(`/users/${STUDENT_A.id}/role`, {
        method: 'POST',
        jwt: studentJwt,
        body: { role: 'instructor' },
      });
      expect(unauthorizedRes.status).toBe(403);

      // Admin performing role change succeeds
      const res = await makeRequest(`/users/${STUDENT_A.id}/role`, {
        method: 'POST',
        jwt: adminJwt,
        body: { role: 'instructor' },
      });
      expect(res.status).toBe(200);

      const roleLog = db.auditLog.find(
        (log) => log.action === 'ROLE_CHANGE' && log.actor === ADMIN_USER.id,
      );
      expect(roleLog).toBeDefined();
      expect(roleLog?.target).toBe(STUDENT_A.id);
      expect(roleLog?.metadata['oldRole']).toBe('student');
      expect(roleLog?.metadata['newRole']).toBe('instructor');

      // Revert role for subsequent tests
      await makeRequest(`/users/${STUDENT_A.id}/role`, {
        method: 'POST',
        jwt: adminJwt,
        body: { role: 'student' },
      });
    });

    it('7. writes audit log on EXPORT (Admin export everything)', async () => {
      const adminJwt = createTestJwt(
        { sub: ADMIN_USER.id, email: ADMIN_USER.email, role: 'authenticated' },
        JWT_SECRET,
      );

      const res = await makeRequest('/admin/export-everything', {
        method: 'GET',
        jwt: adminJwt,
      });

      expect(res.status).toBe(200);

      const exportLog = db.auditLog.find(
        (log) => log.action === 'EXPORT' && log.actor === ADMIN_USER.id,
      );
      expect(exportLog).toBeDefined();
      expect(exportLog?.target).toBe('FULL_SYSTEM_EXPORT');
      expect(exportLog?.metadata['format']).toBe('json+csv');
    });
  });

  // ── 2. Admin-only "Export Everything" ────────────────────────────────────
  describe('Admin-Only "Export Everything" (Zero Vendor Lock-In)', () => {
    it('blocks non-admin users from calling export-everything', async () => {
      const studentJwt = createTestJwt(
        { sub: STUDENT_A.id, email: STUDENT_A.email, role: 'authenticated' },
        JWT_SECRET,
      );
      const instructorJwt = createTestJwt(
        { sub: INSTRUCTOR_A.id, email: INSTRUCTOR_A.email, role: 'authenticated' },
        JWT_SECRET,
      );

      const studentRes = await makeRequest('/admin/export-everything', {
        method: 'GET',
        jwt: studentJwt,
      });
      expect(studentRes.status).toBe(403);
      expect(studentRes.body['code']).toBe('FORBIDDEN_ADMIN_ONLY');

      const instructorRes = await makeRequest('/admin/export-everything', {
        method: 'GET',
        jwt: instructorJwt,
      });
      expect(instructorRes.status).toBe(403);
      expect(instructorRes.body['code']).toBe('FORBIDDEN_ADMIN_ONLY');
    });

    it('produces a comprehensive JSON bundle and RFC-4180 CSV grade sheet for admin', async () => {
      const adminJwt = createTestJwt(
        { sub: ADMIN_USER.id, email: ADMIN_USER.email, role: 'authenticated' },
        JWT_SECRET,
      );

      const res = await makeRequest('/admin/export-everything', {
        method: 'GET',
        jwt: adminJwt,
      });

      expect(res.status).toBe(200);
      expect(res.body['jsonBundle']).toBeDefined();
      expect(res.body['csv']).toBeDefined();

      const jsonBundle = res.body['jsonBundle'] as Record<string, unknown>;
      expect(jsonBundle['version']).toBe('1.0');
      expect(jsonBundle['exportedAt']).toBeDefined();
      expect(Array.isArray(jsonBundle['users'])).toBe(true);
      expect(Array.isArray(jsonBundle['assignments'])).toBe(true);
      expect(Array.isArray(jsonBundle['grades'])).toBe(true);

      const csv = res.body['csv'] as string;
      expect(csv).toContain('roll_no,name,section,assignment_id,template_id,score');
      expect(csv).toContain('22BCE10042');
      expect(csv).toContain('Rohit Kumar');
      expect(csv).toContain('95');
    });
  });

  // ── 3. Data Retention Setting & Purge Script ─────────────────────────────
  describe('Data Retention Policy & Purge Engine', () => {
    it('purges records older than configurable retention days while preserving recent records', async () => {
      const now = Date.now();
      const DAY_MS = 24 * 60 * 60 * 1000;

      // Create an old expired attempt (120 days old)
      const oldDateIso = new Date(now - 120 * DAY_MS).toISOString();
      const oldAttemptId = 'old-attempt-120-days';
      db.attempts.push({
        id: oldAttemptId,
        assignment_id: ASSIGNMENT_A.id,
        student_id: STUDENT_A.id,
        seed: 'old_seed_123',
        started_at: oldDateIso,
        command_log: [],
        status: 'in_progress',
        created_at: oldDateIso,
        updated_at: oldDateIso,
      });

      // Create an old audit log (120 days old)
      db.auditLog.push({
        id: 'old-audit-120-days',
        actor: STUDENT_A.id,
        action: 'LOGIN',
        target: STUDENT_A.id,
        at: oldDateIso,
        metadata: { ip: '127.0.0.1' },
      });

      // Call purge with 90 days retention
      const adminJwt = createTestJwt(
        { sub: ADMIN_USER.id, email: ADMIN_USER.email, role: 'authenticated' },
        JWT_SECRET,
      );

      const res = await makeRequest('/admin/purge-data', {
        method: 'POST',
        jwt: adminJwt,
        body: { retentionDays: 90 },
      });

      expect(res.status).toBe(200);
      expect(res.body['purgedAttempts']).toBeGreaterThanOrEqual(1);

      // Verify old attempt and old audit log are purged
      const foundOldAttempt = db.attempts.find((a) => a.id === oldAttemptId);
      expect(foundOldAttempt).toBeUndefined();

      const foundOldAudit = db.auditLog.find((l) => l.id === 'old-audit-120-days');
      expect(foundOldAudit).toBeUndefined();

      // Verify purge action itself was logged in audit_log
      const purgeLog = db.auditLog.find((l) => l.action === 'PURGE_EXPIRED_DATA');
      expect(purgeLog).toBeDefined();
      expect(purgeLog?.metadata['retentionDays']).toBe(90);
    });
  });

  // ── 4. Backup & Restore on Scratch Database ──────────────────────────────
  describe('PostgreSQL Backup & Restore Simulation', () => {
    it('creates a complete SQL dump of the database and restores into a scratch database', () => {
      // 1. Generate SQL dump from active database
      const sqlDump = generateDatabaseDump(db);
      expect(sqlDump).toContain('-- Engineering Graphics Platform Database Dump');
      expect(sqlDump).toContain('INSERT INTO users');
      expect(sqlDump).toContain('INSERT INTO audit_log');

      // 2. Initialize fresh, empty scratch database
      const scratchDb = new RlsDatabase();
      expect(scratchDb.users.length).toBe(0);
      expect(scratchDb.grades.length).toBe(0);

      // 3. Restore dump into scratch database
      const restoreResult = restoreDatabaseDump(sqlDump, scratchDb);
      expect(restoreResult.success).toBe(true);
      expect(restoreResult.restoredTables).toContain('users');
      expect(restoreResult.restoredTables).toContain('audit_log');

      // 4. Verify scratch database has identical core records
      expect(scratchDb.users.length).toBe(db.users.length);
      expect(scratchDb.auditLog.length).toBe(db.auditLog.length);

      const restoredAdmin = scratchDb.users.find((u) => u.id === ADMIN_USER.id);
      expect(restoredAdmin?.name).toBe('Dean Academic');
      expect(restoredAdmin?.role).toBe('admin');
    });
  });

  // ── 5. Secrets Check & Pre-Commit Hook ──────────────────────────────────
  describe('Secrets Scanning Engine', () => {
    it('scans the codebase and confirms zero committed private keys or salts', async () => {
      const scanResult = await scanForSecrets({
        rootDir: 'D:/projects/engineering graphics',
      });

      expect(scanResult.leaksFound).toBe(0);
      expect(scanResult.filesScanned).toBeGreaterThan(10);
    });

    it('detects sample committed private keys and high-entropy secrets', () => {
      const fakeVulnerableSource = `
        const supabaseServiceRole = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake_service_role_secret_key_1234567890";
        const awsKey = "AKIAIOSFODNN7EXAMPLE";
      `;

      const leaks = scanForSecrets({
        syntheticContent: fakeVulnerableSource,
      });

      expect(leaks.leaksFound).toBeGreaterThanOrEqual(1);
      expect(leaks.findings.length).toBeGreaterThanOrEqual(1);
      expect(leaks.findings[0]?.type).toMatch(/SECRET|KEY/);
    });
  });
});
