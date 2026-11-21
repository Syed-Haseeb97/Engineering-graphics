# Operational Safety, Security & Disaster Recovery Runbook

This document defines the operational safety architecture, audit logging, disaster recovery runbooks, data retention policies, and credential security mechanisms for the Engineering Graphics platform.

---

## 1. Audit Logging Architecture (7 Mandatory Event Types)

To guarantee institutional integrity, pedagogical accountability, and compliance with academic examination standards, all sensitive state transitions write immutable records to the `audit_log` table.

### Monitored Event Types

| Action | Trigger & Source | Actor | Target | Recorded Metadata |
|---|---|---|---|---|
| **`LOGIN`** | Student, Instructor, or Admin session authentication | User UUID | User UUID | `email`, `roll_no`, `role`, `section`, `userAgent`, `ip` |
| **`ATTEMPT_CREATE`** | Student starts an assignment attempt (`POST /attempts`) | Student UUID | Attempt ID | `assignmentId`, `studentId`, `rollNo`, deterministic `seed` |
| **`CHECK`** | Student requests real-time tolerance check with hints (`POST /attempts/:id/check`) | Student UUID | Attempt ID | `attemptId`, intermediate `score`, `hintsCount`, `entityCount` |
| **`SUBMIT`** | Student commits final drawing (`POST /attempts/:id/submit`) | Student UUID | Submission ID | `attemptId`, `submissionId`, `gradeId`, final `score`, `isLate` flag |
| **`GRADE_OVERRIDE`** | Instructor manually overrides auto-score with mandatory comment (`POST /grades/:id/override`) | Instructor UUID | Grade ID | `oldScore`, `newScore`, `studentId`, `rollNo`, `reason` |
| **`EXPORT`** | Admin or Faculty exports institutional grades (`GET /admin/export-everything` or cohort CSV) | Admin / Instructor UUID | Target Identifier (`FULL_SYSTEM_EXPORT` / `grades_export`) | `recordCount`, `userCount`, export format (`json+csv`) |
| **`ROLE_CHANGE`** | Admin elevates or changes user role (`POST /users/:id/role`) | Admin UUID | Target User UUID | `targetUserId`, `targetRollNo`, `oldRole`, `newRole` |
| **`PURGE_EXPIRED_DATA`** | Scheduled or manual execution of retention policy (`POST /admin/purge-data`) | Admin UUID | `RETENTION_POLICY` | `retentionDays`, `cutoffDate`, `purgedAttempts`, `purgedSubmissions`, `purgedAuditLogs` |

### Database Schema (`audit_log`)
```sql
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log (actor, at);
```

---

## 2. Admin-Only "Export Everything" (Zero Vendor Lock-In)

Universities and technical colleges must retain absolute sovereignty over student grading data. Faculty can leave or migrate off the platform at any time without data loss.

### Endpoint
```http
GET /admin/export-everything
Authorization: Bearer <ADMIN_JWT>
```

### Access Control
- Strictly restricted to `admin` role.
- Students and instructors receive `HTTP 403 Forbidden` (`FORBIDDEN_ADMIN_ONLY`).
- Every export execution is logged to `audit_log` with actor identity and timestamp.

### Payload Structure
Returns both a structured JSON archive and an RFC-4180 compliant CSV grade roster:
1. **`jsonBundle`**:
   - `metadata`: Export timestamp, schema version (`1.0`), summary metrics (user count, assignment count, total grades, overall cohort average).
   - `users`: Full student and instructor rosters (`id`, `name`, `roll_no`, `email`, `role`, `section`).
   - `assignments`: All assignments, required templates, open/due timestamps, and max marks.
   - `grades`: Comprehensive grade book with individual edge match percentages, qualitative feedback, review status, and late submission flags.
2. **`csv`**:
   Standard RFC-4180 comma-separated format compatible with Excel, Google Sheets, Canvas LMS, and Moodle:
   ```csv
   roll_no,name,section,assignment_id,template_id,score,max_marks,percentage,feedback,reviewed_by,submitted_at
   "22BCE10042","Rohit Kumar","A","00000000-...","line_inclined_both",95,100,95.0,"Excellent alignment","FAC_001","2026-10-29T..."
   ```

---

## 3. Database Backup & Disaster Recovery Runbook

### Backup Architecture
- **Engine**: PostgreSQL 15+ / Supabase Managed Postgres.
- **Tool**: `scripts/backup.ts` wrapping `pg_dump` with idempotent transaction boundaries.
- **RPO (Recovery Point Objective)**: $\le 1\text{ hour}$ via automated cron dumps; point-in-time recovery via WAL archiving.
- **RTO (Recovery Time Objective)**: $\le 10\text{ minutes}$ for full database restoration.

### 1. Generating a Backup
To create a timestamped SQL dump:
```bash
npm run backup
```
Or directly using PostgreSQL command-line tools:
```bash
pg_dump -h $PGHOST -p $PGPORT -U $PGUSER --clean --if-exists --no-owner --no-acl $PGDATABASE > backups/backup_$(date +%Y%m%d_%H%M%S).sql
```

The backup dump is wrapped in a single atomic transaction:
```sql
BEGIN;
INSERT INTO users (...) VALUES (...) ON CONFLICT (id) DO UPDATE ...;
INSERT INTO problem_templates (...) VALUES (...);
INSERT INTO assignments (...) VALUES (...);
INSERT INTO attempts (...) VALUES (...);
INSERT INTO submissions (...) VALUES (...);
INSERT INTO grades (...) VALUES (...);
INSERT INTO audit_log (...) VALUES (...);
COMMIT;
```

### 2. Restoring from a Backup (Disaster Recovery)
In the event of database corruption, server migration, or disaster recovery:
1. Provision a clean PostgreSQL database:
   ```bash
   createdb -h $PGHOST -U $PGUSER engineering_graphics_recovery
   ```
2. Apply initial DDL migrations:
   ```bash
   psql -h $PGHOST -U $PGUSER -d engineering_graphics_recovery -f server/db/migrations/001_initial_schema.sql
   psql -h $PGHOST -U $PGUSER -d engineering_graphics_recovery -f server/db/migrations/002_rls_policies.sql
   ```
3. Restore the SQL backup dump:
   ```bash
   psql -h $PGHOST -U $PGUSER -d engineering_graphics_recovery -f backups/backup_<TIMESTAMP>.sql
   ```
4. Verify table row counts:
   ```sql
   SELECT 'users' AS tbl, count(*) FROM users
   UNION ALL
   SELECT 'attempts', count(*) FROM attempts
   UNION ALL
   SELECT 'grades', count(*) FROM grades
   UNION ALL
   SELECT 'audit_log', count(*) FROM audit_log;
   ```

### 3. Automated Restore Verification on Scratch Database
A complete backup & restore cycle is tested automatically in CI via `server/__tests__/audit-ops.test.ts`:
- Exports the active database state into standard SQL.
- Spins up an empty scratch database.
- Restores the SQL dump into the scratch container and verifies 100% record match.

---

## 4. Data Retention Policy & Automated Purge

### Personal Data Minimisation Principle
To strictly comply with privacy regulations (GDPR, FERPA, and Indian Digital Personal Data Protection Act 2023), the platform practices strict personal data minimisation:
- **Personal Data Held**: **Only two fields**:
  1. Student Name (`name`)
  2. Student Roll Number (`roll_no`)
  (plus institutional email for authentication).
- **Explicit Non-Collection**:
  - No biometric data.
  - No financial or payment information.
  - No personal phone numbers or physical home addresses.
  - No demographic tracking or third-party behavioral telemetry cookies.

### Retention Policy & Schedule
- **Active Semester**: Attempts, submissions, and command logs are retained for the duration of the academic semester.
- **Configurable Cutoff Window**: Controlled by `DATA_RETENTION_DAYS` (default `180` days / 6 months; configurable to 90, 180, or 365 days).
- **Expired Data Handling**:
  - Completed submissions older than the retention window are purged or anonymised.
  - Abandoned draft attempts and ephemeral check logs are deleted.
  - Aggregate grade metrics and course learning outcomes are preserved.
  - Audit log records of the purge operation are permanently retained.

### Executing Retention Purge
Via CLI:
```bash
npm run purge:retention
# or with custom days
DATA_RETENTION_DAYS=90 npx tsx scripts/purge-retention.ts
```
Via API (Admin role only):
```http
POST /admin/purge-data
Authorization: Bearer <ADMIN_JWT>
Content-Type: application/json

{
  "retentionDays": 90
}
```

---

## 5. Secrets Scanning & Git Pre-Commit Hook

Committed secrets, salts, and database credentials are a critical security risk. The platform enforces automated static scanning across the codebase.

### Monitored Secret Signatures
The scanner (`scripts/check-secrets.ts`) detects:
- Private RSA / OpenSSH / EC keys (standard PEM header blocks).
- AWS access keys (`AKIA...`).
- GitHub personal access tokens (`ghp_...`).
- Supabase service-role JWTs and platform tokens (`sbp_...`).
- Hardcoded PostgreSQL URLs with plain-text passwords.
- Generic API keys and high-entropy secret assignments.

### Running Secrets Scanner
```bash
npm run check:secrets
```

### Git Pre-Commit Hook
A pre-commit hook is provided in `.githooks/pre-commit`.
To activate the hook locally in your clone:
```bash
git config core.hooksPath .githooks
```
If a developer attempts to commit a file containing a leaked private key or hardcoded password, the hook aborts the commit immediately with an error log indicating the file and line number.
