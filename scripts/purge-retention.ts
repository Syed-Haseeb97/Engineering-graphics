/**
 * Data Retention & Automated Purge Engine
 *
 * Implements privacy-compliant data retention policies.
 * Note: The only personal data collected by this platform are student 'name' and 'roll_no'.
 */

import type { RlsDatabase } from '../server/db/rls-engine';

export interface PurgeResult {
  readonly cutoffDate: string;
  readonly retentionDays: number;
  readonly purgedAttempts: number;
  readonly purgedSubmissions: number;
  readonly purgedAuditLogs: number;
}

/**
 * Purge expired student attempts and audit logs older than the configurable retention window.
 */
export function executeDataRetentionPurge(
  db: RlsDatabase,
  retentionDays = 180,
  actorId?: string,
): PurgeResult {
  const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const cutoffDate = new Date(cutoffTime).toISOString();

  // Find expired attempts
  const expiredAttemptIds = new Set<string>();
  const keptAttempts = db.attempts.filter((a) => {
    const isExpired = new Date(a.created_at).getTime() < cutoffTime;
    if (isExpired) {
      expiredAttemptIds.add(a.id);
      return false;
    }
    return true;
  });

  const purgedAttempts = db.attempts.length - keptAttempts.length;
  db.attempts = keptAttempts;

  // Purge submissions linked to expired attempts
  const keptSubmissions = db.submissions.filter((s) => !expiredAttemptIds.has(s.attempt_id));
  const purgedSubmissions = db.submissions.length - keptSubmissions.length;
  db.submissions = keptSubmissions;

  // Purge audit log records older than retention cutoff (excluding PURGE records themselves)
  const keptAudit = db.auditLog.filter((log) => {
    return new Date(log.at).getTime() >= cutoffTime || log.action === 'PURGE_EXPIRED_DATA';
  });
  const purgedAuditLogs = db.auditLog.length - keptAudit.length;
  db.auditLog = keptAudit;

  // Record purge operation in audit log
  const nowIso = new Date().toISOString();
  db.auditLog.push({
    id: `audit_purge_${Date.now()}`,
    actor: actorId ?? null,
    action: 'PURGE_EXPIRED_DATA',
    target: 'RETENTION_POLICY',
    at: nowIso,
    metadata: {
      retentionDays,
      cutoffDate,
      purgedAttempts,
      purgedSubmissions,
      purgedAuditLogs,
    },
  });

  return {
    cutoffDate,
    retentionDays,
    purgedAttempts,
    purgedSubmissions,
    purgedAuditLogs,
  };
}

// CLI runner
if (process.argv[1] && process.argv[1].endsWith('purge-retention.ts')) {
  const envDays = process.env['DATA_RETENTION_DAYS'];
  const retentionDays = envDays ? parseInt(envDays, 10) : 180;
  console.log(`[Data Retention] Running retention purge for records older than ${retentionDays} days...`);
}
