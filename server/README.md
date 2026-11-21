# Server Database & Security Architecture

Backend data layer, authentication, and multi-tenant Row Level Security (RLS) policies for the Engineering Graphics auto-grading platform built on **Supabase (PostgreSQL, GoTrue Auth, RLS)**.

---

## Architecture Overview

- **Plain SQL Migrations**: Database schemas, triggers, and security policies are stored strictly as versioned SQL migration files in `server/db/migrations/`. No manual clicking in dashboard UIs.
- **Strict Multi-Tenant Isolation**: RLS policies enforce student isolation, instructor section scoping, grade immutability, and complete zero-leak protection for canonical geometry.
- **Authentication**: Institutional college email domain enforcement with an invite-code onboarding mechanism for students and faculty.

---

## Database Tables

| Table | Primary Key | Key Columns & Foreign Keys | Purpose |
| :--- | :--- | :--- | :--- |
| `users` | `id` (UUID) | `roll_no` (UNIQUE), `email` (UNIQUE), `name`, `role` (`student` \| `instructor` \| `admin`), `section` | Registered students and faculty profiles. |
| `instructor_sections`| `(instructor_id, section)` | `instructor_id` $\to$ `users.id`, `section` | Maps instructors to the specific sections they teach. |
| `invite_codes` | `id` (UUID) | `code` (UNIQUE), `role`, `section`, `max_uses`, `uses_count`, `expires_at` | Pre-authorized invite tokens for onboarding cohorts. |
| `problem_templates` | `id` (TEXT) | `topic`, `shape`, `param_schema`, `rubric`, `statement`, `ground_truth`, `seeding_secret` | Parametric problem definitions. `ground_truth` and `seeding_secret` are private. |
| `assignments` | `id` (UUID) | `template_id` $\to$ `problem_templates.id`, `section`, `opens_at`, `due_at`, `max_marks` | Class homework and exam assignments scoped by section. |
| `attempts` | `id` (UUID) | `assignment_id` $\to$ `assignments.id`, `student_id` $\to$ `users.id`, `seed`, `status`, `command_log` | Student problem session instance with deterministic seed and drafting audit log. |
| `submissions` | `id` (UUID) | `attempt_id` $\to$ `attempts.id`, `drawing_json`, `submitted_at` | Final 2D CAD entity snapshot submitted for grading. |
| `grades` | `id` (UUID) | `submission_id` (UNIQUE) $\to$ `submissions.id`, `score`, `breakdown`, `feedback`, `reviewed_by` | Evaluation outcome. Read-only to students; editable only by server role and instructors. |
| `audit_log` | `id` (UUID) | `actor` $\to$ `users.id`, `action`, `target`, `at`, `metadata` | Tamper-proof security audit log. |

---

## Row Level Security (RLS) Policy Rules

1. **Student Isolation**:
   - Students can SELECT and INSERT only their own attempts (`student_id = auth.uid()`).
   - Students can SELECT and INSERT only submissions belonging to their active attempts.
   - Students can NEVER read other students' rows in `users`, `attempts`, or `submissions`.
2. **Instructor Section Scoping**:
   - Instructors can read student profiles, attempts, submissions, and grades **only for sections assigned to them** (or all sections if designated with section `'ALL'`).
3. **Zero Ground-Truth Leaks**:
   - Direct column access to `ground_truth` and `seeding_secret` on `problem_templates` is strictly revoked from the `authenticated` student role (`REVOKE SELECT (ground_truth, seeding_secret) ON problem_templates FROM authenticated;`).
   - Students query problem statements via the sanitized view `student_problem_templates`.
4. **Grade Protection**:
   - Students have read-only access to published grades for their own submissions.
   - Students are strictly barred from inserting or updating any grade.
   - Automated grading insertion is executed by `service_role`. Instructors may insert or update grade overrides only for students in their assigned sections.

---

## How to Run Local Supabase Stack on Windows

### 1. Prerequisites to Install on Windows

1. **Docker Desktop for Windows**:
   - Download and install [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/).
   - Ensure the **WSL 2 backend** is enabled in Docker Desktop settings:
     `Settings > General > Use the WSL 2 based engine`.
   - Start Docker Desktop before running Supabase commands.
2. **Supabase CLI**:
   - Option A (npm project-local, recommended):
     ```powershell
     npm install supabase --save-dev
     ```
   - Option B (via Scoop or Winget):
     ```powershell
     scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
     scoop install supabase
     # or
     winget install Supabase.CLI
     ```

### 2. Starting the Local Supabase Stack

Open PowerShell in the project directory (`D:\projects\engineering graphics`):

```powershell
# 1. Initialize Supabase configuration (if first time)
npx supabase init

# 2. Start the local containers (Postgres, GoTrue Auth, PostgREST, Studio UI, Inbucket)
npx supabase start
```

Upon startup, Supabase prints local service URLs:
- **API URL (Kong Gateway)**: `http://127.0.0.1:54321`
- **GraphQL URL**: `http://127.0.0.1:54321/graphql/v1`
- **DB URL (Direct PostgreSQL)**: `postgresql://postgres:<password>@127.0.0.1:54322/postgres`
- **Studio Web UI**: `http://127.0.0.1:54323`
- **Inbucket (Local Test Email Inbox)**: `http://127.0.0.1:54324`

### 3. Applying Migrations and Seeding Local Database

```powershell
# Apply all plain SQL migration files in server/db/migrations/ and seed data
npx supabase db reset
```

Or apply migrations directly against Postgres via `psql`:

```powershell
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f server/db/migrations/001_initial_schema.sql
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f server/db/migrations/002_rls_policies.sql
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f server/db/migrations/003_invite_code_auth.sql
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f server/db/seeds/001_dev_seed.sql
```

### 4. Running Database & RLS Tests

Run the multi-tenant RLS policy and invite-code tests with Vitest:

```powershell
npm test -- server/db/__tests__/
```
