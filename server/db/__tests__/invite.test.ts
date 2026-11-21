import { beforeEach, describe, expect, it } from 'vitest';
import {
  InviteFlowService,
  validateCollegeEmail,
  validateInviteCode,
} from '../invite';
import type {
  AuditLogRecord,
  InstructorSectionRecord,
  InviteCodeRecord,
  UserRecord,
} from '../types';

describe('Invite Code & College Email Auth Suite', () => {
  let users: UserRecord[];
  let inviteCodes: InviteCodeRecord[];
  let instructorSections: InstructorSectionRecord[];
  let auditLogs: AuditLogRecord[];
  let service: InviteFlowService;

  const NOW = new Date('2026-10-29T12:00:00Z');

  beforeEach(() => {
    users = [
      {
        id: 'user_existing_1',
        email: 'existing.student@college.edu',
        roll_no: '22BCE10099',
        name: 'Existing Student',
        role: 'student',
        section: 'A',
        created_at: NOW.toISOString(),
        updated_at: NOW.toISOString(),
      },
    ];

    inviteCodes = [
      {
        id: 'inv_1',
        code: 'STUDENT-SEC-A-2026',
        role: 'student',
        section: 'A',
        max_uses: 60,
        uses_count: 5,
        expires_at: '2026-12-31T23:59:59Z',
        created_at: NOW.toISOString(),
      },
      {
        id: 'inv_2',
        code: 'EXPIRED-CODE',
        role: 'student',
        section: 'B',
        max_uses: 10,
        uses_count: 0,
        expires_at: '2026-10-01T00:00:00Z', // In the past
        created_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'inv_3',
        code: 'EXHAUSTED-CODE',
        role: 'student',
        section: 'C',
        max_uses: 2,
        uses_count: 2, // Fully redeemed
        expires_at: '2026-12-31T23:59:59Z',
        created_at: NOW.toISOString(),
      },
      {
        id: 'inv_4',
        code: 'FACULTY-JOIN-GRAPHICS',
        role: 'instructor',
        section: 'ALL',
        max_uses: 5,
        uses_count: 1,
        expires_at: '2026-12-31T23:59:59Z',
        created_at: NOW.toISOString(),
      },
    ];

    instructorSections = [];
    auditLogs = [];
    service = new InviteFlowService(users, inviteCodes, instructorSections, auditLogs);
  });

  describe('1. Institutional College Email Verification', () => {
    it('accepts institutional domains (.edu, .ac.in, college.edu)', () => {
      expect(validateCollegeEmail('aarav.p@college.edu')).toBe(true);
      expect(validateCollegeEmail('student@university.ac.in')).toBe(true);
      expect(validateCollegeEmail('researcher@iit.ac.in')).toBe(true);
      expect(validateCollegeEmail('user@mit.edu')).toBe(true);
    });

    it('rejects public generic email providers', () => {
      expect(validateCollegeEmail('student@gmail.com')).toBe(false);
      expect(validateCollegeEmail('student@yahoo.com')).toBe(false);
      expect(validateCollegeEmail('student@hotmail.com')).toBe(false);
      expect(validateCollegeEmail('invalid-email')).toBe(false);
    });
  });

  describe('2. Invite Code Inspection & Validation', () => {
    it('validates a fresh, active invite code and reports remaining uses', () => {
      const res = validateInviteCode('STUDENT-SEC-A-2026', inviteCodes, NOW);
      expect(res.valid).toBe(true);
      expect(res.role).toBe('student');
      expect(res.section).toBe('A');
      expect(res.remainingUses).toBe(55);
    });

    it('identifies non-existent codes', () => {
      const res = validateInviteCode('UNKNOWN-CODE-1234', inviteCodes, NOW);
      expect(res.valid).toBe(false);
      expect(res.reason).toBe('INVALID_CODE');
    });

    it('identifies expired codes', () => {
      const res = validateInviteCode('EXPIRED-CODE', inviteCodes, NOW);
      expect(res.valid).toBe(false);
      expect(res.reason).toBe('EXEXPIRED_CODE'.replace('EX', '')); // 'EXPIRED_CODE'
    });

    it('identifies exhausted codes', () => {
      const res = validateInviteCode('EXHAUSTED-CODE', inviteCodes, NOW);
      expect(res.valid).toBe(false);
      expect(res.reason).toBe('EXHAUSTED_CODE');
      expect(res.message).toContain('maximum allowed uses');
    });
  });

  describe('3. Invite Claim Transaction & Profile Provisioning', () => {
    it('successfully claims code, provisions student profile, increments count, and logs audit', () => {
      const result = service.claimInvite(
        {
          code: 'STUDENT-SEC-A-2026',
          userId: 'user_new_1',
          email: 'priya.s@college.edu',
          rollNo: '22BCE10002',
          name: 'Priya Sharma',
        },
        NOW,
      );

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user!.role).toBe('student');
      expect(result.user!.section).toBe('A');
      expect(result.user!.roll_no).toBe('22BCE10002');

      // Verify code usage incremented from 5 to 6
      const codeRecord = inviteCodes.find((c) => c.code === 'STUDENT-SEC-A-2026');
      expect(codeRecord!.uses_count).toBe(6);

      // Verify audit log entry
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0]!.action).toBe('INVITE_CLAIMED');
      expect(auditLogs[0]!.actor).toBe('user_new_1');
    });

    it('provisions instructor role and registers instructor_sections mapping', () => {
      const result = service.claimInvite(
        {
          code: 'FACULTY-JOIN-GRAPHICS',
          userId: 'user_fac_1',
          email: 'prof.smith@college.edu',
          rollNo: 'FAC_909',
          name: 'Prof. Smith',
        },
        NOW,
      );

      expect(result.success).toBe(true);
      expect(result.user!.role).toBe('instructor');
      expect(result.user!.section).toBe('ALL');

      expect(instructorSections).toHaveLength(1);
      expect(instructorSections[0]!.instructor_id).toBe('user_fac_1');
      expect(instructorSections[0]!.section).toBe('ALL');
    });

    it('fails when user uses a non-institutional email', () => {
      const result = service.claimInvite(
        {
          code: 'STUDENT-SEC-A-2026',
          userId: 'user_new_2',
          email: 'priya.sharma@gmail.com', // disallowed domain
          rollNo: '22BCE10003',
          name: 'Priya Sharma',
        },
        NOW,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('institutional college email');
    });

    it('fails when code has expired', () => {
      const result = service.claimInvite(
        {
          code: 'EXPIRED-CODE',
          userId: 'user_new_3',
          email: 'student@college.edu',
          rollNo: '22BCE10004',
          name: 'Late Student',
        },
        NOW,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('INVITE_EXPIRED');
    });

    it('fails when code is fully exhausted', () => {
      const result = service.claimInvite(
        {
          code: 'EXHAUSTED-CODE',
          userId: 'user_new_4',
          email: 'student@college.edu',
          rollNo: '22BCE10005',
          name: 'Overcrowded Student',
        },
        NOW,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('INVITE_EXHAUSTED');
    });

    it('prevents registration with duplicate roll number', () => {
      const result = service.claimInvite(
        {
          code: 'STUDENT-SEC-A-2026',
          userId: 'user_duplicate',
          email: 'imposter@college.edu',
          rollNo: '22BCE10099', // Already belongs to Existing Student
          name: 'Imposter Student',
        },
        NOW,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('ROLL_NO_EXISTS');
    });
  });
});
