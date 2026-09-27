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

  WITH keep_latest AS (
    SELECT id
    FROM boat_team_members
    WHERE boat_id = invitation_record.boat_id
      AND user_id = p_user_id
    ORDER BY accepted_at DESC NULLS LAST, invited_at DESC
    LIMIT 1
  )
  DELETE FROM boat_team_members
  WHERE boat_id = invitation_record.boat_id
    AND user_id = p_user_id
    AND id NOT IN (SELECT id FROM keep_latest);

  UPDATE boat_team_members
  SET user_id = p_user_id,
      email = invitation_record.invitee_email,
      status = 'active',
      display_name = joined_user_name,
      accepted_at = now(),
      invited_by = COALESCE(invited_by, invitation_record.inviter_id),
      role = 'Csapattag'
  WHERE boat_id = invitation_record.boat_id
    AND user_id = p_user_id
  RETURNING *
  INTO member_record;

  IF member_record.id IS NULL THEN
    UPDATE boat_team_members
    SET user_id = p_user_id,
        status = 'active',
        display_name = joined_user_name,
        accepted_at = now(),
        invited_by = COALESCE(invited_by, invitation_record.inviter_id),
        role = 'Csapattag'
    WHERE boat_id = invitation_record.boat_id
      AND email = invitation_record.invitee_email
    RETURNING *
    INTO member_record;
  END IF;

  IF member_record.id IS NULL THEN
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
    RETURNING *
    INTO member_record;
  END IF;

  UPDATE boat_team_invitations
  SET status = 'accepted',
      accepted_at = now(),
      accepted_by_user_id = p_user_id
  WHERE id = invitation_record.id;

  RETURN member_record.id;
END;
$$;
