-- ==============================================================================
-- Migration: 001_initial_schema.sql
-- Description: Core tables for Engineering Graphics platform
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. Users Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    roll_no TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('student', 'instructor', 'admin')),
    section TEXT NOT NULL, -- e.g. 'A', 'B', 'C', or 'ALL'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_role_section ON users (role, section);
CREATE INDEX IF NOT EXISTS idx_users_roll_no ON users (roll_no);

-- Junction table for instructors managing multiple sections
CREATE TABLE IF NOT EXISTS instructor_sections (
    instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    section TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (instructor_id, section)
);

CREATE INDEX IF NOT EXISTS idx_instructor_sections_sec ON instructor_sections (section);

-- ------------------------------------------------------------------------------
-- 2. Invite Codes Table (for Student & Faculty Onboarding)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invite_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('student', 'instructor')),
    section TEXT NOT NULL,
    max_uses INT NOT NULL DEFAULT 1,
    uses_count INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_lookup ON invite_codes (code);

-- ------------------------------------------------------------------------------
-- 3. Problem Templates Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS problem_templates (
    id TEXT PRIMARY KEY,
    topic TEXT NOT NULL,
    shape TEXT NOT NULL,
    param_schema JSONB NOT NULL,
    placement_rules JSONB NOT NULL,
    views_required JSONB NOT NULL,
    validity_predicates JSONB NOT NULL,
    rubric JSONB NOT NULL,
    statement TEXT NOT NULL,
    -- Private fields: NEVER exposed to student role
    ground_truth JSONB,
    seeding_secret TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 4. Assignments Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id TEXT NOT NULL REFERENCES problem_templates(id) ON DELETE RESTRICT,
    section TEXT NOT NULL,
    opens_at TIMESTAMPTZ NOT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    max_marks NUMERIC(5, 2) NOT NULL DEFAULT 100.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignments_sec_dates ON assignments (section, opens_at, due_at);

-- ------------------------------------------------------------------------------
-- 5. Attempts Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE RESTRICT,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seed TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    command_log JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'abandoned')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attempts_student_status ON attempts (student_id, status);
CREATE INDEX IF NOT EXISTS idx_attempts_assignment ON attempts (assignment_id);

-- ------------------------------------------------------------------------------
-- 6. Submissions Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    drawing_json JSONB NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_submissions_attempt ON submissions (attempt_id);

-- ------------------------------------------------------------------------------
-- 7. Grades Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID UNIQUE NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    score NUMERIC(5, 2) NOT NULL CHECK (score >= 0 AND score <= 100),
    breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    feedback TEXT,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grades_submission ON grades (submission_id);

-- ------------------------------------------------------------------------------
-- 8. Audit Log Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log (actor, at);
