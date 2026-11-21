-- ==============================================================================
-- Migration: 002_rls_policies.sql
-- Description: Row Level Security (RLS) policies for multi-tenant isolation
-- ==============================================================================

-- Enable RLS on all sensitive tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructor_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE problem_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- Helper Functions for Role and Section Resolution
-- ------------------------------------------------------------------------------

-- Safely get current authenticated user ID in Supabase or direct SQL testing
CREATE OR REPLACE FUNCTION auth_uid() RETURNS UUID AS $$
BEGIN
    RETURN COALESCE(
        auth.uid(),
        NULLIF(current_setting('app.current_user_id', true), '')::UUID
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Check if authenticated user is admin
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM users
        WHERE id = auth_uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Check if authenticated user is instructor or admin
CREATE OR REPLACE FUNCTION is_instructor_or_admin() RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM users
        WHERE id = auth_uid() AND role IN ('instructor', 'admin')
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Check if authenticated user is an instructor assigned to a specific section
CREATE OR REPLACE FUNCTION instructor_manages_section(target_section TEXT) RETURNS BOOLEAN AS $$
BEGIN
    IF is_admin() THEN
        RETURN true;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = auth_uid() AND u.role = 'instructor' AND (
            u.section = 'ALL'
            OR u.section = target_section
            OR EXISTS (
                SELECT 1 FROM instructor_sections isec
                WHERE isec.instructor_id = u.id AND isec.section = target_section
            )
        )
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- ------------------------------------------------------------------------------
-- 1. Users Table Policies
-- ------------------------------------------------------------------------------

-- Students can read only their own profile
CREATE POLICY "users_student_read_self" ON users
    FOR SELECT TO authenticated
    USING (id = auth_uid());

-- Instructors can read students in their assigned sections plus themselves
CREATE POLICY "users_instructor_read_section" ON users
    FOR SELECT TO authenticated
    USING (
        is_instructor_or_admin() AND (
            id = auth_uid()
            OR (role = 'student' AND instructor_manages_section(section))
        )
    );

-- Service role / admins have full access
CREATE POLICY "users_admin_all" ON users
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 2. Problem Templates Policies (Zero Ground-Truth Leaks)
-- ------------------------------------------------------------------------------

-- Public student view that strictly omits ground_truth and seeding_secret
CREATE OR REPLACE VIEW student_problem_templates AS
    SELECT
        id,
        topic,
        shape,
        param_schema,
        placement_rules,
        views_required,
        validity_predicates,
        rubric,
        statement,
        created_at
    FROM problem_templates;

-- Base table access: instructors and service role can read full template
CREATE POLICY "templates_instructor_read_all" ON problem_templates
    FOR SELECT TO authenticated
    USING (is_instructor_or_admin());

CREATE POLICY "templates_service_role_all" ON problem_templates
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Students can only read templates through the sanitized view or with masked fields
CREATE POLICY "templates_student_read_public" ON problem_templates
    FOR SELECT TO authenticated
    USING (NOT is_instructor_or_admin());

-- Revoke direct column select on secret fields from general authenticated role
REVOKE SELECT (ground_truth, seeding_secret) ON problem_templates FROM authenticated;
GRANT SELECT (ground_truth, seeding_secret) ON problem_templates TO service_role;

-- ------------------------------------------------------------------------------
-- 3. Assignments Policies
-- ------------------------------------------------------------------------------

-- Students can read active assignments for their own section
CREATE POLICY "assignments_student_read_own_section" ON assignments
    FOR SELECT TO authenticated
    USING (
        section = (SELECT section FROM users WHERE id = auth_uid())
        AND opens_at <= now()
    );

-- Instructors can read and manage assignments in their sections
CREATE POLICY "assignments_instructor_manage" ON assignments
    FOR ALL TO authenticated
    USING (instructor_manages_section(section))
    WITH CHECK (instructor_manages_section(section));

-- ------------------------------------------------------------------------------
-- 4. Attempts Policies (Students read/write only their own attempts)
-- ------------------------------------------------------------------------------

-- Students read only their own attempts
CREATE POLICY "attempts_student_read_own" ON attempts
    FOR SELECT TO authenticated
    USING (student_id = auth_uid());

-- Students create their own attempts
CREATE POLICY "attempts_student_insert_own" ON attempts
    FOR INSERT TO authenticated
    WITH CHECK (
        student_id = auth_uid()
        AND EXISTS (
            SELECT 1 FROM assignments a
            JOIN users u ON u.id = auth_uid()
            WHERE a.id = attempts.assignment_id
              AND a.section = u.section
              AND a.opens_at <= now()
              AND a.due_at >= now()
        )
    );

-- Students update only their own in-progress attempt command logs
CREATE POLICY "attempts_student_update_own" ON attempts
    FOR UPDATE TO authenticated
    USING (student_id = auth_uid() AND status = 'in_progress')
    WITH CHECK (student_id = auth_uid());

-- Instructors read attempts of students in their sections
CREATE POLICY "attempts_instructor_read_section" ON attempts
    FOR SELECT TO authenticated
    USING (
        instructor_manages_section(
            (SELECT section FROM users WHERE users.id = attempts.student_id)
        )
    );

-- ------------------------------------------------------------------------------
-- 5. Submissions Policies (Students read/write only their own submissions)
-- ------------------------------------------------------------------------------

-- Students read their own submissions
CREATE POLICY "submissions_student_read_own" ON submissions
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM attempts a
            WHERE a.id = submissions.attempt_id AND a.student_id = auth_uid()
        )
    );

-- Students insert submissions only for their own active in-progress attempt
CREATE POLICY "submissions_student_insert_own" ON submissions
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM attempts a
            WHERE a.id = submissions.attempt_id
              AND a.student_id = auth_uid()
              AND a.status = 'in_progress'
        )
    );

-- Instructors read submissions from their section students
CREATE POLICY "submissions_instructor_read_section" ON submissions
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM attempts a
            JOIN users u ON u.id = a.student_id
            WHERE a.id = submissions.attempt_id
              AND instructor_manages_section(u.section)
        )
    );

-- ------------------------------------------------------------------------------
-- 6. Grades Policies (Insertable only by server role and instructors for override)
-- ------------------------------------------------------------------------------

-- Students can read grades ONLY for their own submissions
CREATE POLICY "grades_student_read_own" ON grades
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM submissions s
            JOIN attempts a ON a.id = s.attempt_id
            WHERE s.id = grades.submission_id AND a.student_id = auth_uid()
        )
    );

-- Instructors can read grades for students in their sections
CREATE POLICY "grades_instructor_read_section" ON grades
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM submissions s
            JOIN attempts a ON a.id = s.attempt_id
            JOIN users u ON u.id = a.student_id
            WHERE s.id = grades.submission_id AND instructor_manages_section(u.section)
        )
    );

-- Instructors can INSERT grade overrides for submissions in their sections
CREATE POLICY "grades_instructor_insert_override" ON grades
    FOR INSERT TO authenticated
    WITH CHECK (
        is_instructor_or_admin() AND EXISTS (
            SELECT 1 FROM submissions s
            JOIN attempts a ON a.id = s.attempt_id
            JOIN users u ON u.id = a.student_id
            WHERE s.id = grades.submission_id AND instructor_manages_section(u.section)
        )
    );

-- Instructors can UPDATE grades for manual review / grade override
CREATE POLICY "grades_instructor_update_override" ON grades
    FOR UPDATE TO authenticated
    USING (
        is_instructor_or_admin() AND EXISTS (
            SELECT 1 FROM submissions s
            JOIN attempts a ON a.id = s.attempt_id
            JOIN users u ON u.id = a.student_id
            WHERE s.id = grades.submission_id AND instructor_manages_section(u.section)
        )
    )
    WITH CHECK (
        is_instructor_or_admin() AND EXISTS (
            SELECT 1 FROM submissions s
            JOIN attempts a ON a.id = s.attempt_id
            JOIN users u ON u.id = a.student_id
            WHERE s.id = grades.submission_id AND instructor_manages_section(u.section)
        )
    );

-- Service role (headless auto-checker engine) has unrestricted grade access
CREATE POLICY "grades_service_role_all" ON grades
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 7. Audit Log Policies
-- ------------------------------------------------------------------------------

-- Audit log is append-only for authenticated actions, readable only by instructors and admins
CREATE POLICY "audit_log_insert" ON audit_log
    FOR INSERT TO authenticated
    WITH CHECK (actor = auth_uid());

CREATE POLICY "audit_log_instructor_read" ON audit_log
    FOR SELECT TO authenticated
    USING (is_instructor_or_admin());
