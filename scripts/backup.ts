/**
 * PostgreSQL Database Backup & Restore Engine
 *
 * Implements SQL dump generation, pg_dump wrapper, and in-memory disaster recovery verification.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import type { RlsDatabase } from '../server/db/rls-engine';
import type {
  AssignmentRecord,
  AttemptRecord,
  AuditLogRecord,
  GradeRecord,
  InstructorSectionRecord,
  ProblemTemplateRecord,
  SubmissionRecord,
  UserRecord,
} from '../server/db/types';

/** Escape string for SQL literal. */
function sqlEsc(val: string | null | undefined): string {
  if (val === null || val === undefined) return 'NULL';
  return `'${val.replace(/'/g, "''")}'`;
}

/** Escape JSON object for SQL JSONB literal. */
function sqlJson(obj: unknown): string {
  if (obj === null || obj === undefined) return "'{}'::jsonb";
  return `'${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb`;
}

/**
 * Generate a complete, self-contained SQL dump from an active database instance.
 */
export function generateDatabaseDump(db: RlsDatabase): string {
  const lines: string[] = [];
  const nowIso = new Date().toISOString();

  lines.push('-- ==============================================================================');
  lines.push('-- Engineering Graphics Platform Database Dump');
  lines.push(`-- Generated At: ${nowIso}`);
  lines.push('-- Format: PostgreSQL Plain-Text SQL');
  lines.push('-- ==============================================================================');
  lines.push('BEGIN;\n');

  // 1. Users
  if (db.users.length > 0) {
    lines.push('-- Table: users');
    for (const u of db.users) {
      lines.push(
        `INSERT INTO users (id, email, roll_no, name, role, section, created_at, updated_at) VALUES (${sqlEsc(u.id)}, ${sqlEsc(u.email)}, ${sqlEsc(u.roll_no)}, ${sqlEsc(u.name)}, ${sqlEsc(u.role)}, ${sqlEsc(u.section)}, ${sqlEsc(u.created_at)}, ${sqlEsc(u.updated_at)}) ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at;`,
      );
    }
    lines.push('');
  }

  // 2. Instructor Sections
  if (db.instructorSections.length > 0) {
    lines.push('-- Table: instructor_sections');
    for (const isec of db.instructorSections) {
      lines.push(
        `INSERT INTO instructor_sections (instructor_id, section) VALUES (${sqlEsc(isec.instructor_id)}, ${sqlEsc(isec.section)}) ON CONFLICT DO NOTHING;`,
      );
    }
    lines.push('');
  }

  // 3. Problem Templates
  if (db.problemTemplates.length > 0) {
    lines.push('-- Table: problem_templates');
    for (const t of db.problemTemplates) {
      lines.push(
        `INSERT INTO problem_templates (id, topic, shape, param_schema, placement_rules, views_required, validity_predicates, rubric, statement, seeding_secret, created_at, updated_at) VALUES (${sqlEsc(t.id)}, ${sqlEsc(t.topic)}, ${sqlEsc(t.shape)}, ${sqlJson(t.param_schema)}, ${sqlJson(t.placement_rules)}, ${sqlJson(t.views_required)}, ${sqlJson(t.validity_predicates)}, ${sqlJson(t.rubric)}, ${sqlEsc(t.statement)}, ${sqlEsc(t.seeding_secret)}, ${sqlEsc(t.created_at)}, ${sqlEsc(t.updated_at)}) ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at;`,
      );
    }
    lines.push('');
  }

  // 4. Assignments
  if (db.assignments.length > 0) {
    lines.push('-- Table: assignments');
    for (const a of db.assignments) {
      lines.push(
        `INSERT INTO assignments (id, template_id, section, opens_at, due_at, max_marks, created_at) VALUES (${sqlEsc(a.id)}, ${sqlEsc(a.template_id)}, ${sqlEsc(a.section)}, ${sqlEsc(a.opens_at)}, ${sqlEsc(a.due_at)}, ${a.max_marks}, ${sqlEsc(a.created_at)}) ON CONFLICT (id) DO NOTHING;`,
      );
    }
    lines.push('');
  }

  // 5. Attempts
  if (db.attempts.length > 0) {
    lines.push('-- Table: attempts');
    for (const at of db.attempts) {
      lines.push(
        `INSERT INTO attempts (id, assignment_id, student_id, seed, started_at, command_log, status, created_at, updated_at) VALUES (${sqlEsc(at.id)}, ${sqlEsc(at.assignment_id)}, ${sqlEsc(at.student_id)}, ${sqlEsc(at.seed)}, ${sqlEsc(at.started_at)}, ${sqlJson(at.command_log)}, ${sqlEsc(at.status)}, ${sqlEsc(at.created_at)}, ${sqlEsc(at.updated_at)}) ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at;`,
      );
    }
    lines.push('');
  }

  // 6. Submissions
  if (db.submissions.length > 0) {
    lines.push('-- Table: submissions');
    for (const s of db.submissions) {
      lines.push(
        `INSERT INTO submissions (id, attempt_id, drawing_json, submitted_at) VALUES (${sqlEsc(s.id)}, ${sqlEsc(s.attempt_id)}, ${sqlJson(s.drawing_json)}, ${sqlEsc(s.submitted_at)}) ON CONFLICT (id) DO NOTHING;`,
      );
    }
    lines.push('');
  }

  // 7. Grades
  if (db.grades.length > 0) {
    lines.push('-- Table: grades');
    for (const g of db.grades) {
      lines.push(
        `INSERT INTO grades (id, submission_id, score, breakdown, feedback, reviewed_by, created_at, updated_at) VALUES (${sqlEsc(g.id)}, ${sqlEsc(g.submission_id)}, ${g.score}, ${sqlJson(g.breakdown)}, ${sqlEsc(g.feedback)}, ${sqlEsc(g.reviewed_by)}, ${sqlEsc(g.created_at)}, ${sqlEsc(g.updated_at)}) ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at;`,
      );
    }
    lines.push('');
  }

  // 8. Audit Log
  if (db.auditLog.length > 0) {
    lines.push('-- Table: audit_log');
    for (const log of db.auditLog) {
      lines.push(
        `INSERT INTO audit_log (id, actor, action, target, at, metadata) VALUES (${sqlEsc(log.id)}, ${sqlEsc(log.actor)}, ${sqlEsc(log.action)}, ${sqlEsc(log.target)}, ${sqlEsc(log.at)}, ${sqlJson(log.metadata)});`,
      );
    }
    lines.push('');
  }

  lines.push('COMMIT;\n');
  return lines.join('\n');
}

/**
 * Restore an SQL dump into a target RlsDatabase container.
 */
export function restoreDatabaseDump(sql: string, targetDb: RlsDatabase): {
  success: boolean;
  restoredTables: string[];
} {
  const restoredTables = new Set<string>();
  const lines = sql.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('INSERT INTO ')) continue;

    const match = trimmed.match(/^INSERT INTO ([a-z_]+)\s*\(([^)]+)\)\s*VALUES\s*\((.+)\)/i);
    if (!match) continue;

    const table = match[1]!;
    const columns = match[2]!.split(',').map((c) => c.trim());
    // Parse values list
    const rawValuesStr = match[3]!;
    const values = parseSqlValues(rawValuesStr);

    const row: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i]!;
      row[col] = values[i];
    }

    switch (table) {
      case 'users':
        targetDb.users.push(row as unknown as UserRecord);
        restoredTables.add('users');
        break;
      case 'instructor_sections':
        targetDb.instructorSections.push(row as unknown as InstructorSectionRecord);
        restoredTables.add('instructor_sections');
        break;
      case 'problem_templates':
        targetDb.problemTemplates.push(row as unknown as ProblemTemplateRecord);
        restoredTables.add('problem_templates');
        break;
      case 'assignments':
        targetDb.assignments.push(row as unknown as AssignmentRecord);
        restoredTables.add('assignments');
        break;
      case 'attempts':
        targetDb.attempts.push(row as unknown as AttemptRecord);
        restoredTables.add('attempts');
        break;
      case 'submissions':
        targetDb.submissions.push(row as unknown as SubmissionRecord);
        restoredTables.add('submissions');
        break;
      case 'grades':
        targetDb.grades.push(row as unknown as GradeRecord);
        restoredTables.add('grades');
        break;
      case 'audit_log':
        targetDb.auditLog.push(row as unknown as AuditLogRecord);
        restoredTables.add('audit_log');
        break;
    }
  }

  return {
    success: true,
    restoredTables: Array.from(restoredTables),
  };
}

/** Simple SQL value list parser for quoted strings, JSON, numbers, and NULL. */
function parseSqlValues(raw: string): unknown[] {
  const result: unknown[] = [];
  let cur = '';
  let inQuote = false;

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "'") {
      if (inQuote && raw[i + 1] === "'") {
        cur += "'";
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (c === ',' && !inQuote) {
      result.push(cleanSqlValue(cur.trim()));
      cur = '';
    } else {
      cur += c;
    }
  }
  if (cur.trim()) {
    result.push(cleanSqlValue(cur.trim()));
  }
  return result;
}

function cleanSqlValue(val: string): unknown {
  if (val === 'NULL') return null;
  if (val.endsWith('::jsonb')) {
    val = val.substring(0, val.length - 7).trim();
  }
  if (val.startsWith("'") && val.endsWith("'")) {
    const inner = val.substring(1, val.length - 1);
    try {
      if ((inner.startsWith('{') && inner.endsWith('}')) || (inner.startsWith('[') && inner.endsWith(']'))) {
        return JSON.parse(inner);
      }
    } catch {
      // Return plain string
    }
    return inner;
  }
  const num = Number(val);
  if (!isNaN(num)) return num;
  return val;
}

/**
 * Shell pg_dump execution wrapper when running in production PostgreSQL environment.
 */
export function runPgDump(outputFilePath: string): void {
  const dbUrl = process.env['DATABASE_URL'];
  const pghost = process.env['PGHOST'] ?? 'localhost';
  const pgport = process.env['PGPORT'] ?? '5432';
  const pguser = process.env['PGUSER'] ?? 'postgres';
  const pgdatabase = process.env['PGDATABASE'] ?? 'engineering_graphics';

  const cmd = dbUrl
    ? `pg_dump --clean --if-exists --no-owner --no-acl "${dbUrl}" > "${outputFilePath}"`
    : `pg_dump -h ${pghost} -p ${pgport} -U ${pguser} --clean --if-exists --no-owner --no-acl ${pgdatabase} > "${outputFilePath}"`;

  console.log(`[Backup] Executing pg_dump: ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

// CLI runner
if (process.argv[1] && path.resolve(process.argv[1]).endsWith('backup.ts')) {
  const backupsDir = path.resolve('D:/projects/engineering graphics/backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupsDir, `backup_${timestamp}.sql`);

  try {
    runPgDump(backupPath);
    console.log(`\x1b[32m✓ PostgreSQL backup completed: ${backupPath}\x1b[0m`);
  } catch {
    console.warn(`[Backup] pg_dump tool not found or database offline. Note: Follow docs/ops.md for local setup.`);
  }
}
