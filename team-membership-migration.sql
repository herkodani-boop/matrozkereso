CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS boat_team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id uuid NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_email citext NOT NULL,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  invited_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  accepted_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  CHECK (char_length(invitee_email) > 0)
);

CREATE TABLE IF NOT EXISTS boat_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id uuid NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  user_id uuid NULL REFERENCES users(id) ON DELETE CASCADE,
  email citext NOT NULL,
  invited_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'removed')),
  display_name text,
  role text NOT NULL DEFAULT 'Új tag',
  UNIQUE (boat_id, email),
  UNIQUE (boat_id, user_id),
  CHECK (status <> 'active' OR user_id IS NOT NULL),
  CHECK (char_length(email) > 0)
);

CREATE INDEX IF NOT EXISTS boat_team_invitations_boat_id_idx
  ON boat_team_invitations (boat_id);

CREATE INDEX IF NOT EXISTS boat_team_invitations_invitee_email_idx
  ON boat_team_invitations (invitee_email);

CREATE INDEX IF NOT EXISTS boat_team_invitations_status_idx
  ON boat_team_invitations (status);

CREATE INDEX IF NOT EXISTS boat_team_members_boat_id_idx
  ON boat_team_members (boat_id);

CREATE INDEX IF NOT EXISTS boat_team_members_user_id_idx
  ON boat_team_members (user_id);

CREATE INDEX IF NOT EXISTS boat_team_members_email_idx
  ON boat_team_members (email);

CREATE OR REPLACE FUNCTION accept_boat_team_invitation(p_token uuid, p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  invitation_record boat_team_invitations%ROWTYPE;
  member_record boat_team_members%ROWTYPE;
  joined_user_name text;
BEGIN
  SELECT *
  INTO invitation_record
  FROM boat_team_invitations
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A meghívás nem létezik vagy lejárt.' USING ERRCODE = 'P0001';
  END IF;

  IF invitation_record.status <> 'pending' THEN
    RAISE EXCEPTION 'A meghívás már feldolgozásra került.' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM boat_team_members
    WHERE boat_id = invitation_record.boat_id
      AND email = invitation_record.invitee_email
      AND status = 'removed'
  ) THEN
    UPDATE boat_team_invitations
    SET status = 'cancelled'
    WHERE id = invitation_record.id;

    RAISE EXCEPTION 'A meghívás törölve lett, ezért nem fogadható el.' USING ERRCODE = 'P0001';
  END IF;

  IF invitation_record.expires_at < now() THEN
    UPDATE boat_team_invitations
    SET status = 'expired'
    WHERE id = invitation_record.id;

    RAISE EXCEPTION 'A meghívás lejárt.' USING ERRCODE = 'P0001';
  END IF;

  SELECT full_name
  INTO joined_user_name
  FROM users
  WHERE id = p_user_id;

  IF joined_user_name IS NULL OR btrim(joined_user_name) = '' THEN
    joined_user_name := 'Új csapattag';
  END IF;

  INSERT INTO boat_team_members (
    boat_id,
    user_id,
    email,
    invited_by,
    status,
    display_name,
    accepted_at,
    role
  )
  VALUES (
    invitation_record.boat_id,
    p_user_id,
    invitation_record.invitee_email,
    invitation_record.inviter_id,
    'active',
    joined_user_name,
    now(),
    'Csapattag'
  )
  ON CONFLICT (boat_id, email)
  DO UPDATE SET
    user_id = EXCLUDED.user_id,
    status = 'active',
    display_name = COALESCE(boat_team_members.display_name, EXCLUDED.display_name),
    accepted_at = now(),
    invited_by = COALESCE(boat_team_members.invited_by, EXCLUDED.invited_by),
    role = 'Csapattag'
  RETURNING *
  INTO member_record;

  UPDATE boat_team_invitations
  SET status = 'accepted',
      accepted_at = now(),
      accepted_by_user_id = p_user_id
  WHERE id = invitation_record.id;

  RETURN member_record.id;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS boat_team_invitations_pending_unique_idx
  ON boat_team_invitations (boat_id, invitee_email)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION create_boat_team_invitation(
  p_boat_id uuid,
  p_inviter_id uuid,
  p_invitee_email text,
  p_invited_name text DEFAULT NULL,
  p_expires_in_days integer DEFAULT 7
)
RETURNS boat_team_invitations
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  normalized_email text;
  invite_record boat_team_invitations;
BEGIN
  normalized_email := lower(trim(p_invitee_email));

  SELECT *
  INTO invite_record
  FROM boat_team_invitations
  WHERE boat_id = p_boat_id
    AND invitee_email = normalized_email
  ORDER BY created_at DESC
  LIMIT 1;

  IF invite_record.id IS NULL OR invite_record.status IN ('accepted', 'expired', 'cancelled') THEN
    INSERT INTO boat_team_invitations (
      boat_id,
      inviter_id,
      invitee_email,
      invited_name,
      status,
      expires_at
    )
    VALUES (
      p_boat_id,
      p_inviter_id,
      normalized_email,
      p_invited_name,
      'pending',
      now() + (p_expires_in_days || ' days')::interval
    )
    RETURNING *
    INTO invite_record;
  ELSE
    UPDATE boat_team_invitations
    SET inviter_id = p_inviter_id,
        invited_name = p_invited_name,
        status = 'pending',
        expires_at = now() + (p_expires_in_days || ' days')::interval,
        created_at = now()
    WHERE id = invite_record.id
    RETURNING *
    INTO invite_record;
  END IF;

  INSERT INTO boat_team_members (
    boat_id,
    user_id,
    email,
    invited_by,
    status,
    display_name,
    role
  )
  VALUES (
    p_boat_id,
    NULL,
    normalized_email,
    p_inviter_id,
    'invited',
    NULL,
    'Meghívott'
  )
  ON CONFLICT (boat_id, email)
  DO UPDATE SET
    invited_by = EXCLUDED.invited_by,
    status = CASE WHEN boat_team_members.status = 'active' THEN 'active' ELSE 'invited' END,
    role = CASE WHEN boat_team_members.status = 'active' THEN 'Csapattag' ELSE 'Meghívott' END;

  RETURN invite_record;
END;
$$;
