import type {
  AuditLogRecord,
  InviteCodeRecord,
  InstructorSectionRecord,
  UserRecord,
} from './types';

export interface InviteValidationResult {
  readonly valid: boolean;
  readonly reason?: 'INVALID_CODE' | 'EXPIRED_CODE' | 'EXHAUSTED_CODE';
  readonly message?: string;
  readonly role?: 'student' | 'instructor';
  readonly section?: string;
  readonly remainingUses?: number;
}

export interface ClaimInviteInput {
  readonly code: string;
  readonly userId: string;
  readonly email: string;
  readonly rollNo: string;
  readonly name: string;
}

export interface ClaimInviteResult {
  readonly success: boolean;
  readonly error?: string;
  readonly user?: UserRecord;
}

const DEFAULT_ALLOWED_DOMAINS = ['college.edu', 'university.ac.in', 'iit.ac.in', 'nit.ac.in'];

/**
 * Validate institutional college email domain.
 */
export function validateCollegeEmail(email: string, allowedDomains = DEFAULT_ALLOWED_DOMAINS): boolean {
  const parts = email.toLowerCase().trim().split('@');
  if (parts.length !== 2 || !parts[1]) return false;
  const domain = parts[1];

  return (
    allowedDomains.includes(domain) ||
    domain.endsWith('.edu') ||
    domain.endsWith('.ac.in')
  );
}

/**
 * Pure validation of an invite code state.
 */
export function validateInviteCode(
  code: string,
  inviteCodes: readonly InviteCodeRecord[],
  now = new Date(),
): InviteValidationResult {
  const trimmed = code.trim();
  const invite = inviteCodes.find((c) => c.code === trimmed);

  if (!invite) {
    return {
      valid: false,
      reason: 'INVALID_CODE',
      message: 'Invite code does not exist.',
    };
  }

  if (invite.expires_at && new Date(invite.expires_at) < now) {
    return {
      valid: false,
      reason: 'EXPIRED_CODE',
      message: 'Invite code has expired.',
    };
  }

  if (invite.uses_count >= invite.max_uses) {
    return {
      valid: false,
      reason: 'EXHAUSTED_CODE',
      message: 'Invite code has reached its maximum allowed uses.',
    };
  }

  return {
    valid: true,
    role: invite.role,
    section: invite.section,
    remainingUses: invite.max_uses - invite.uses_count,
  };
}

/**
 * State container for simulating or executing the invite-code redemption flow.
 */
export class InviteFlowService {
  constructor(
    private users: UserRecord[],
    private inviteCodes: InviteCodeRecord[],
    private instructorSections: InstructorSectionRecord[],
    private auditLogs: AuditLogRecord[],
  ) {}

  /**
   * Claim an invite code, validate criteria, increment usage, and create student/instructor profile.
   */
  public claimInvite(input: ClaimInviteInput, now = new Date()): ClaimInviteResult {
    const trimmedEmail = input.email.trim().toLowerCase();
    const trimmedRollNo = input.rollNo.trim().toUpperCase();
    const trimmedName = input.name.trim();

    // 1. Validate Institutional Email
    if (!validateCollegeEmail(trimmedEmail)) {
      return {
        success: false,
        error: `Email domain is not authorized. Must be an institutional college email.`,
      };
    }

    // 2. Validate Invite Code
    const inviteIndex = this.inviteCodes.findIndex((c) => c.code === input.code.trim());
    if (inviteIndex === -1) {
      return { success: false, error: 'INVITE_NOT_FOUND: Code is invalid.' };
    }

    const invite = this.inviteCodes[inviteIndex]!;
    if (invite.expires_at && new Date(invite.expires_at) < now) {
      return { success: false, error: 'INVITE_EXPIRED: Code has expired.' };
    }

    if (invite.uses_count >= invite.max_uses) {
      return { success: false, error: 'INVITE_EXHAUSTED: Code has been fully redeemed.' };
    }

    // 3. Validate Roll Number Uniqueness
    const existingUser = this.users.find(
      (u) => u.roll_no === trimmedRollNo && u.id !== input.userId,
    );
    if (existingUser) {
      return {
        success: false,
        error: `ROLL_NO_EXISTS: Roll number "${trimmedRollNo}" is already registered.`,
      };
    }

    // 4. Increment usage counter
    const updatedInvite: InviteCodeRecord = {
      ...invite,
      uses_count: invite.uses_count + 1,
    };
    this.inviteCodes[inviteIndex] = updatedInvite;

    // 5. Provision User Record
    const nowIso = now.toISOString();
    const userRecord: UserRecord = {
      id: input.userId,
      email: trimmedEmail,
      roll_no: trimmedRollNo,
      name: trimmedName,
      role: invite.role,
      section: invite.section,
      created_at: nowIso,
      updated_at: nowIso,
    };

    const userIdx = this.users.findIndex((u) => u.id === input.userId);
    if (userIdx >= 0) {
      this.users[userIdx] = userRecord;
    } else {
      this.users.push(userRecord);
    }

    // 6. Map Instructor Section if role is instructor
    if (invite.role === 'instructor') {
      const exists = this.instructorSections.some(
        (isec) => isec.instructor_id === userRecord.id && isec.section === invite.section,
      );
      if (!exists) {
        this.instructorSections.push({
          instructor_id: userRecord.id,
          section: invite.section,
        });
      }
    }

    // 7. Write Audit Log
    this.auditLogs.push({
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      actor: userRecord.id,
      action: 'INVITE_CLAIMED',
      target: userRecord.id,
      at: nowIso,
      metadata: {
        code: invite.code,
        role: userRecord.role,
        section: userRecord.section,
        roll_no: userRecord.roll_no,
      },
    });

    return {
      success: true,
      user: userRecord,
    };
  }
}
