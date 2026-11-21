-- ==============================================================================
-- Seed Script: 001_dev_seed.sql
-- Description: Local development test dataset with 3 sections of fake students
--              and 1 instructor managing sections A, B, and C.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Instructor
-- ------------------------------------------------------------------------------
INSERT INTO users (id, email, roll_no, name, role, section)
VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'h.sharma@college.edu',
    'FAC_001',
    'Prof. H. Sharma',
    'instructor',
    'ALL'
)
ON CONFLICT (id) DO NOTHING;

-- Map Instructor to sections A, B, and C
INSERT INTO instructor_sections (instructor_id, section)
VALUES
    ('00000000-0000-0000-0000-000000000001'::uuid, 'A'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'B'),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'C')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------------------------
-- 2. Section A Students (Computer Engineering)
-- ------------------------------------------------------------------------------
INSERT INTO users (id, email, roll_no, name, role, section)
VALUES
    ('00000000-0000-0000-0001-000000000001'::uuid, 'aarav.p@college.edu', '22BCE10001', 'Aarav Patel', 'student', 'A'),
    ('00000000-0000-0000-0001-000000000002'::uuid, 'priya.s@college.edu', '22BCE10002', 'Priya Sharma', 'student', 'A'),
    ('00000000-0000-0000-0001-000000000003'::uuid, 'rohan.i@college.edu', '22BCE10003', 'Rohan Iyer', 'student', 'A'),
    ('00000000-0000-0000-0001-000000000004'::uuid, 'ananya.r@college.edu', '22BCE10004', 'Ananya Reddy', 'student', 'A')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 3. Section B Students (Mechanical Engineering)
-- ------------------------------------------------------------------------------
INSERT INTO users (id, email, roll_no, name, role, section)
VALUES
    ('00000000-0000-0000-0002-000000000001'::uuid, 'vikram.m@college.edu', '22BME10001', 'Vikram Mehta', 'student', 'B'),
    ('00000000-0000-0000-0002-000000000002'::uuid, 'sneha.j@college.edu', '22BME10002', 'Sneha Joshi', 'student', 'B'),
    ('00000000-0000-0000-0002-000000000003'::uuid, 'karthik.n@college.edu', '22BME10003', 'Karthik Nair', 'student', 'B'),
    ('00000000-0000-0000-0002-000000000004'::uuid, 'pooja.g@college.edu', '22BME10004', 'Pooja Gupta', 'student', 'B')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 4. Section C Students (Electrical Engineering)
-- ------------------------------------------------------------------------------
INSERT INTO users (id, email, roll_no, name, role, section)
VALUES
    ('00000000-0000-0000-0003-000000000001'::uuid, 'devendra.v@college.edu', '22BEE10001', 'Devendra Verma', 'student', 'C'),
    ('00000000-0000-0000-0003-000000000002'::uuid, 'rhea.c@college.edu', '22BEE10002', 'Rhea Chopra', 'student', 'C'),
    ('00000000-0000-0000-0003-000000000003'::uuid, 'arjun.d@college.edu', '22BEE10003', 'Arjun Das', 'student', 'C'),
    ('00000000-0000-0000-0003-000000000004'::uuid, 'meera.m@college.edu', '22BEE10004', 'Meera Menon', 'student', 'C')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 5. Invite Codes
-- ------------------------------------------------------------------------------
INSERT INTO invite_codes (code, role, section, max_uses, uses_count, expires_at)
VALUES
    ('STUDENT-SEC-A-2026', 'student', 'A', 60, 4, now() + interval '90 days'),
    ('STUDENT-SEC-B-2026', 'student', 'B', 60, 4, now() + interval '90 days'),
    ('STUDENT-SEC-C-2026', 'student', 'C', 60, 4, now() + interval '90 days'),
    ('FACULTY-JOIN-GRAPHICS', 'instructor', 'ALL', 5, 1, now() + interval '90 days'),
    ('EXPIRED-CODE-DEMO', 'student', 'A', 10, 0, now() - interval '1 day'),
    ('EXHAUSTED-CODE-DEMO', 'student', 'B', 2, 2, now() + interval '30 days')
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 6. Problem Templates
-- ------------------------------------------------------------------------------
INSERT INTO problem_templates (
    id, topic, shape, param_schema, placement_rules, views_required,
    validity_predicates, rubric, statement, ground_truth, seeding_secret
) VALUES (
    'cone_inclined_both',
    'PROJECTION_OF_SOLIDS',
    'CONE',
    '{"baseDia":{"min":40,"max":50,"step":5,"unit":"mm"},"height":{"min":55,"max":75,"step":5,"unit":"mm"},"theta":{"min":30,"max":45,"step":5,"unit":"deg"},"phi":{"min":20,"max":35,"step":5,"unit":"deg"},"distVP":{"min":20,"max":35,"step":5,"unit":"mm"}}'::jsonb,
    '{"restingPlane":"HP","restingFeature":"generator"}'::jsonb,
    '["FRONT_VIEW","TOP_VIEW"]'::jsonb,
    '{"requireFirstQuadrant":true,"maxCombinedTiltDeg":75}'::jsonb,
    '{"recall":0.35,"precision":0.30,"lineType":0.25,"dimensions":0.10}'::jsonb,
    'A cone of base {baseDia} mm diameter and axis {height} mm long rests on HP on a point of its base. Axis inclined at {theta}° to HP and {phi}° to VP. Draw its projections.',
    '{"vertices":[{"x":30,"y":15},{"x":70,"y":65}],"edges":[{"p1":{"x":30,"y":15},"p2":{"x":70,"y":65},"type":"visible"}]}'::jsonb,
    'super_secret_generator_salt_cone_992'
), (
    'prism_inclined_hp',
    'PROJECTION_OF_SOLIDS',
    'PRISM',
    '{"baseSide":{"min":25,"max":40,"step":5,"unit":"mm"},"height":{"min":50,"max":75,"step":5,"unit":"mm"},"theta":{"min":30,"max":50,"step":5,"unit":"deg"},"distVP":{"min":20,"max":35,"step":5,"unit":"mm"}}'::jsonb,
    '{"restingPlane":"HP","restingFeature":"edge"}'::jsonb,
    '["FRONT_VIEW","TOP_VIEW"]'::jsonb,
    '{"requireFirstQuadrant":true}'::jsonb,
    '{"recall":0.35,"precision":0.30,"lineType":0.25,"dimensions":0.10}'::jsonb,
    'A square prism, base {baseSide} mm side and axis {height} mm long, rests with an edge on HP. Axis inclined at {theta}° to HP. Draw its projections.',
    '{"vertices":[{"x":30,"y":10},{"x":75,"y":10}],"edges":[{"p1":{"x":30,"y":10},"p2":{"x":75,"y":10},"type":"visible"}]}'::jsonb,
    'super_secret_generator_salt_prism_881'
), (
    'line_inclined_both',
    'PROJECTION_OF_LINES',
    'LINE',
    '{"trueLength":{"min":60,"max":85,"step":5,"unit":"mm"},"theta":{"min":25,"max":40,"step":5,"unit":"deg"},"phi":{"min":20,"max":35,"step":5,"unit":"deg"},"distHP":{"min":15,"max":30,"step":5,"unit":"mm"},"distVP":{"min":20,"max":35,"step":5,"unit":"mm"}}'::jsonb,
    '{"restingPlane":"HP","restingFeature":"point"}'::jsonb,
    '["FRONT_VIEW","TOP_VIEW"]'::jsonb,
    '{"requireFirstQuadrant":true}'::jsonb,
    '{"recall":0.35,"precision":0.30,"lineType":0.25,"dimensions":0.10}'::jsonb,
    'A straight line AB, {trueLength} mm long, has end A {distHP} mm above HP and {distVP} mm in front of VP. Inclined at {theta}° to HP and {phi}° to VP. Draw projections.',
    '{"vertices":[{"x":20,"y":15},{"x":70,"y":45}],"edges":[{"p1":{"x":20,"y":15},"p2":{"x":70,"y":45},"type":"visible"}]}'::jsonb,
    'super_secret_generator_salt_line_774'
)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 7. Active Assignments for Sections A, B, and C
-- ------------------------------------------------------------------------------
INSERT INTO assignments (id, template_id, section, opens_at, due_at, max_marks)
VALUES
    ('10000000-0000-0000-0000-000000000001'::uuid, 'cone_inclined_both', 'A', now() - interval '2 days', now() + interval '5 days', 100.00),
    ('10000000-0000-0000-0000-000000000002'::uuid, 'prism_inclined_hp', 'B', now() - interval '2 days', now() + interval '5 days', 100.00),
    ('10000000-0000-0000-0000-000000000003'::uuid, 'line_inclined_both', 'C', now() - interval '2 days', now() + interval '5 days', 100.00)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 8. Sample Attempts, Submissions & Grades
-- ------------------------------------------------------------------------------
-- Attempt for Aarav (Section A)
INSERT INTO attempts (id, assignment_id, student_id, seed, started_at, status)
VALUES (
    '20000000-0000-0000-0000-000000000001'::uuid,
    '10000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0001-000000000001'::uuid,
    'sha256_seed_for_aarav_cone_attempt1',
    now() - interval '1 day',
    'submitted'
)
ON CONFLICT (id) DO NOTHING;

-- Submission for Aarav
INSERT INTO submissions (id, attempt_id, drawing_json, submitted_at)
VALUES (
    '30000000-0000-0000-0000-000000000001'::uuid,
    '20000000-0000-0000-0000-000000000001'::uuid,
    '{"entities":[{"id":"line_1","type":"line","p1":{"x":30,"y":15},"p2":{"x":70,"y":65},"lineType":"continuous"}]}'::jsonb,
    now() - interval '1 day'
)
ON CONFLICT (id) DO NOTHING;

-- Grade for Aarav
INSERT INTO grades (id, submission_id, score, breakdown, feedback, reviewed_by)
VALUES (
    '40000000-0000-0000-0000-000000000001'::uuid,
    '30000000-0000-0000-0000-000000000001'::uuid,
    95.00,
    '{"recall":0.35,"precision":0.30,"lineType":0.20,"dimensions":0.10}'::jsonb,
    'Excellent projection alignment and clean hidden line removal.',
    '00000000-0000-0000-0000-000000000001'::uuid
)
ON CONFLICT (id) DO NOTHING;

-- Attempt for Vikram (Section B)
INSERT INTO attempts (id, assignment_id, student_id, seed, started_at, status)
VALUES (
    '20000000-0000-0000-0000-000000000002'::uuid,
    '10000000-0000-0000-0000-000000000002'::uuid,
    '00000000-0000-0000-0002-000000000001'::uuid,
    'sha256_seed_for_vikram_prism_attempt1',
    now() - interval '4 hours',
    'in_progress'
)
ON CONFLICT (id) DO NOTHING;
