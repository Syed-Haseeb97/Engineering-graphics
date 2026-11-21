-- ==============================================================================
-- Migration: 003_invite_code_auth.sql
-- Description: Functions and triggers for College Email & Invite-Code Auth Flow
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Invite Code Validation Function (Publicly queryable by unauthenticated/new users)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_invite_code(p_code TEXT)
RETURNS JSONB AS $$
DECLARE
    v_invite invite_codes%ROWTYPE;
BEGIN
    SELECT * INTO v_invite
    FROM invite_codes
    WHERE code = TRIM(p_code);

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'valid', false,
            'reason', 'INVALID_CODE',
            'message', 'Invite code does not exist.'
        );
    END IF;

    IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
        RETURN jsonb_build_object(
            'valid', false,
            'reason', 'EXPIRED_CODE',
            'message', 'Invite code has expired.'
        );
    END IF;

    IF v_invite.uses_count >= v_invite.max_uses THEN
        RETURN jsonb_build_object(
            'valid', false,
            'reason', 'EXHAUSTED_CODE',
            'message', 'Invite code has reached its maximum allowed uses.'
        );
    END IF;

    RETURN jsonb_build_object(
        'valid', true,
        'role', v_invite.role,
        'section', v_invite.section,
        'remaining_uses', v_invite.max_uses - v_invite.uses_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 2. Invite Code Claim & Account Provisioning Transaction
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_invite_code(
    p_code TEXT,
    p_user_id UUID,
    p_email TEXT,
    p_roll_no TEXT,
    p_name TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_invite invite_codes%ROWTYPE;
    v_user users%ROWTYPE;
BEGIN
    -- Atomic row-lock to prevent race conditions during concurrent redemptions
    SELECT * INTO v_invite
    FROM invite_codes
    WHERE code = TRIM(p_code)
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVITE_NOT_FOUND: Code "%" is invalid.', p_code;
    END IF;

    IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
        RAISE EXCEPTION 'INVITE_EXPIRED: Code "%" has expired.', p_code;
    END IF;

    IF v_invite.uses_count >= v_invite.max_uses THEN
        RAISE EXCEPTION 'INVITE_EXHAUSTED: Code "%" has already been fully redeemed.', p_code;
    END IF;

    -- Validate roll number uniqueness
    IF EXISTS (SELECT 1 FROM users WHERE roll_no = TRIM(p_roll_no) AND id != p_user_id) THEN
        RAISE EXCEPTION 'ROLL_NO_EXISTS: Roll number "%" is already registered.', p_roll_no;
    END IF;

    -- Increment usage count
    UPDATE invite_codes
    SET uses_count = uses_count + 1
    WHERE id = v_invite.id;

    -- Upsert user profile
    INSERT INTO users (id, email, roll_no, name, role, section)
    VALUES (
        p_user_id,
        LOWER(TRIM(p_email)),
        UPPER(TRIM(p_roll_no)),
        TRIM(p_name),
        v_invite.role,
        v_invite.section
    )
    ON CONFLICT (id) DO UPDATE
    SET
        roll_no = EXCLUDED.roll_no,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        section = EXCLUDED.section,
        updated_at = now()
    RETURNING * INTO v_user;

    -- If instructor, also register section mapping
    IF v_invite.role = 'instructor' THEN
        INSERT INTO instructor_sections (instructor_id, section)
        VALUES (v_user.id, v_invite.section)
        ON CONFLICT DO NOTHING;
    END IF;

    -- Record audit log entry
    INSERT INTO audit_log (actor, action, target, metadata)
    VALUES (
        v_user.id,
        'INVITE_CLAIMED',
        v_user.id::text,
        jsonb_build_object(
            'code', v_invite.code,
            'role', v_user.role,
            'section', v_user.section,
            'roll_no', v_user.roll_no
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_user.id,
        'role', v_user.role,
        'section', v_user.section,
        'name', v_user.name,
        'roll_no', v_user.roll_no
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 3. College Email Domain Validation Trigger
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_college_email_domain()
RETURNS TRIGGER AS $$
DECLARE
    v_domain TEXT;
    v_allowed_domains TEXT[] := ARRAY['college.edu', 'university.ac.in', 'iit.ac.in', 'nit.ac.in'];
BEGIN
    v_domain := split_part(NEW.email, '@', 2);

    -- Allow all in test / local development if domain ends in .edu or is in approved list
    IF NOT (v_domain = ANY(v_allowed_domains) OR v_domain LIKE '%.edu' OR v_domain LIKE '%.ac.in') THEN
        -- Allow exceptions for admin role
        IF NEW.role != 'admin' THEN
            RAISE EXCEPTION 'DISALLOWED_EMAIL_DOMAIN: Email domain "@%" is not authorized for institutional enrollment.', v_domain;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_college_email ON users;
CREATE TRIGGER trg_enforce_college_email
    BEFORE INSERT OR UPDATE OF email ON users
    FOR EACH ROW
    EXECUTE FUNCTION enforce_college_email_domain();
