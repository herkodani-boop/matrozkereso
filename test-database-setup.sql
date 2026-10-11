-- Matrózkereső: teljes adatbázis-séma egy ÜRES (test) Supabase projekthez.
-- Futtatás: Supabase Dashboard -> SQL Editor -> New query -> beillesztés -> Run.
-- Az alaptáblák a kódból rekonstruáltak, az RLS-szabályok ésszerű alapbeállítások
-- (a main projekt tényleges szabályai nem voltak a repóban).

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ===================== ALAPTÁBLÁK =====================

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  birthdate date,
  role text,
  level text check (level is null or level in ('kezdo', 'halado', 'profi')),
  avatar_url text,
  created_at timestamptz not null default now()
);
create index if not exists idx_users_role on public.users (role);

create table if not exists public.boats (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,
  harbor text not null,
  max_crew_size integer not null,
  team_type text not null,
  image_url text,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz default now()
);
create index if not exists boats_user_id_idx on public.boats (user_id);

create table if not exists public.boat_events (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats(id) on delete cascade,
  title text not null,
  type text not null check (type in ('Verseny', 'Edzés', 'Egyéb')),
  start_date date not null,
  end_date date,
  is_one_day boolean not null default false,
  location text not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(title) > 0),
  check (char_length(location) > 0),
  check (not is_one_day or end_date is null or end_date = start_date)
);
create index if not exists boat_events_boat_id_idx on public.boat_events (boat_id);
create index if not exists boat_events_start_date_idx on public.boat_events (start_date);

create table if not exists public.ads (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  event_id uuid references public.boat_events(id) on delete set null,
  title text not null,
  date_text text,
  start_date date,
  end_date date,
  commitment text,
  location text,
  positions text[],
  experience_level text,
  captain_note text,
  max_applicants integer default 25 check (max_applicants is null or max_applicants > 0),
  image_focus_x smallint not null default 50 check (image_focus_x between 0 and 100),
  image_focus_y smallint not null default 50 check (image_focus_y between 0 and 100),
  is_active boolean not null default true,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_ads_is_active on public.ads (is_active);
create index if not exists ads_event_id_idx on public.ads (event_id);
create index if not exists ads_boat_id_idx on public.ads (boat_id);
create index if not exists ads_user_id_idx on public.ads (user_id);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references public.ads(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  message text check (message is null or char_length(message) <= 500),
  captain_contact_shared_at timestamptz,
  captain_contact_name text,
  captain_contact_email text,
  captain_contact_phone text,
  created_at timestamptz not null default now()
);
create index if not exists applications_ad_id_idx on public.applications (ad_id);
create index if not exists applications_user_id_idx on public.applications (user_id);

create table if not exists public.boat_event_attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.boat_events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'confirmed' check (status in ('confirmed', 'pending', 'declined', 'unset')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index if not exists boat_event_attendees_event_id_idx on public.boat_event_attendees (event_id);
create index if not exists boat_event_attendees_user_id_idx on public.boat_event_attendees (user_id);

create table if not exists public.boat_team_invitations (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats(id) on delete cascade,
  inviter_id uuid not null references public.users(id) on delete cascade,
  invitee_email citext not null,
  token uuid not null unique default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'cancelled')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  invited_name text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by_user_id uuid references public.users(id) on delete set null,
  check (char_length(invitee_email) > 0)
);
create index if not exists boat_team_invitations_boat_id_idx on public.boat_team_invitations (boat_id);
create index if not exists boat_team_invitations_invitee_email_idx on public.boat_team_invitations (invitee_email);
create index if not exists boat_team_invitations_status_idx on public.boat_team_invitations (status);
create unique index if not exists boat_team_invitations_pending_unique_idx
  on public.boat_team_invitations (boat_id, invitee_email) where status = 'pending';

create table if not exists public.boat_team_members (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  email citext not null,
  invited_by uuid not null references public.users(id) on delete cascade,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  status text not null default 'invited' check (status in ('invited', 'active', 'removed')),
  display_name text,
  role text not null default 'Új tag',
  unique (boat_id, email),
  unique (boat_id, user_id),
  check (status <> 'active' or user_id is not null),
  check (char_length(email) > 0)
);
create index if not exists boat_team_members_boat_id_idx on public.boat_team_members (boat_id);
create index if not exists boat_team_members_user_id_idx on public.boat_team_members (user_id);
create index if not exists boat_team_members_email_idx on public.boat_team_members (email);

create table if not exists public.test_feedback (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  page_path text,
  user_id uuid,
  user_email text,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists test_feedback_created_at_idx on public.test_feedback (created_at desc);
create index if not exists test_feedback_user_id_idx on public.test_feedback (user_id);

-- ===================== FÜGGVÉNYEK ÉS TRIGGEREK =====================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists boat_events_set_updated_at on public.boat_events;
create trigger boat_events_set_updated_at
before update on public.boat_events
for each row execute function public.set_updated_at();

drop trigger if exists boat_event_attendees_set_updated_at on public.boat_event_attendees;
create trigger boat_event_attendees_set_updated_at
before update on public.boat_event_attendees
for each row execute function public.set_updated_at();

create or replace function public.add_event_owner_as_attendee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.boat_event_attendees (event_id, user_id, status)
  select new.id, boat.user_id, 'confirmed'
  from public.boats as boat
  where boat.id = new.boat_id
    and boat.user_id = auth.uid()
  on conflict (event_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists boat_event_owner_auto_attendee on public.boat_events;
create trigger boat_event_owner_auto_attendee
after insert on public.boat_events
for each row execute function public.add_event_owner_as_attendee();

create or replace function public.enforce_application_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  listing_limit integer;
  active_count integer;
begin
  select listing.max_applicants
  into listing_limit
  from public.ads as listing
  where listing.id = new.ad_id
  for update;

  if listing_limit is null then
    return new;
  end if;

  select count(*)
  into active_count
  from public.applications as application
  where application.ad_id = new.ad_id
    and application.status <> 'rejected';

  if active_count >= listing_limit then
    raise exception 'Erre a hirdetésre betelt a jelentkezők maximális száma.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_application_limit on public.applications;
create trigger enforce_application_limit
before insert on public.applications
for each row execute function public.enforce_application_limit();

create or replace function public.prevent_owner_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  listing_owner_id uuid;
begin
  if tg_op = 'INSERT'
    and auth.uid() is not null
    and new.user_id <> auth.uid() then
    raise exception 'A jelentkezés csak a bejelentkezett felhasználó nevében adható be.'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
    and (new.user_id is distinct from old.user_id or new.ad_id is distinct from old.ad_id)
    and auth.uid() is not null
    and new.user_id <> auth.uid() then
    raise exception 'A jelentkezés csak a bejelentkezett felhasználó nevében adható be.'
      using errcode = '42501';
  end if;

  select listing.user_id
  into listing_owner_id
  from public.ads as listing
  where listing.id = new.ad_id;

  if listing_owner_id is not null and listing_owner_id = new.user_id then
    raise exception 'Saját hirdetésre nem lehet jelentkezni.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_owner_application on public.applications;
create trigger prevent_owner_application
before insert or update of user_id, ad_id on public.applications
for each row execute function public.prevent_owner_application();

create or replace function public.revoke_application_contact(
  p_application_id uuid,
  p_event_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  target_boat_id uuid;
  current_status text;
begin
  select application_record.user_id, listing.boat_id, application_record.status
  into target_user_id, target_boat_id, current_status
  from public.applications as application_record
  join public.ads as listing on listing.id = application_record.ad_id
  where application_record.id = p_application_id
    and listing.user_id = auth.uid()
  for update of application_record;

  if not found then
    raise exception 'A jelentkezés nem található, vagy nincs jogosultságod módosítani.';
  end if;

  if current_status <> 'accepted' then
    raise exception 'A jelentkezés állapota időközben megváltozott.';
  end if;

  if p_event_id is not null and not exists (
    select 1
    from public.boat_events as event_record
    where event_record.id = p_event_id
      and event_record.boat_id = target_boat_id
  ) then
    raise exception 'Az esemény nem tartozik ehhez a hajóhoz.';
  end if;

  update public.applications
  set status = 'pending',
      captain_contact_shared_at = null,
      captain_contact_name = null,
      captain_contact_email = null,
      captain_contact_phone = null
  where id = p_application_id;

  if p_event_id is not null then
    delete from public.boat_event_attendees
    where event_id = p_event_id
      and user_id = target_user_id;
  end if;

  return true;
end;
$$;

revoke all on function public.revoke_application_contact(uuid, uuid) from public;
grant execute on function public.revoke_application_contact(uuid, uuid) to authenticated;

create or replace function public.accept_boat_team_invitation(p_token uuid, p_user_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  invitation_record public.boat_team_invitations%rowtype;
  member_record public.boat_team_members%rowtype;
  joined_user_name text;
begin
  select * into invitation_record
  from public.boat_team_invitations
  where token = p_token
  for update;

  if not found then
    raise exception 'A meghívás nem létezik vagy lejárt.' using errcode = 'P0001';
  end if;

  if invitation_record.status <> 'pending' then
    raise exception 'A meghívás már feldolgozásra került.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.boat_team_members
    where boat_id = invitation_record.boat_id
      and email = invitation_record.invitee_email
      and status = 'removed'
  ) then
    update public.boat_team_invitations set status = 'cancelled' where id = invitation_record.id;
    raise exception 'A meghívás törölve lett, ezért nem fogadható el.' using errcode = 'P0001';
  end if;

  if invitation_record.expires_at < now() then
    update public.boat_team_invitations set status = 'expired' where id = invitation_record.id;
    raise exception 'A meghívás lejárt.' using errcode = 'P0001';
  end if;

  select full_name into joined_user_name from public.users where id = p_user_id;

  if joined_user_name is null or btrim(joined_user_name) = '' then
    joined_user_name := 'Új csapattag';
  end if;

  with keep_latest as (
    select id from public.boat_team_members
    where boat_id = invitation_record.boat_id and user_id = p_user_id
    order by accepted_at desc nulls last, invited_at desc
    limit 1
  )
  delete from public.boat_team_members
  where boat_id = invitation_record.boat_id
    and user_id = p_user_id
    and id not in (select id from keep_latest);

  update public.boat_team_members
  set user_id = p_user_id,
      email = invitation_record.invitee_email,
      status = 'active',
      display_name = joined_user_name,
      accepted_at = now(),
      invited_by = coalesce(invited_by, invitation_record.inviter_id),
      role = 'Csapattag'
  where boat_id = invitation_record.boat_id
    and user_id = p_user_id
  returning * into member_record;

  if member_record.id is null then
    update public.boat_team_members
    set user_id = p_user_id,
        status = 'active',
        display_name = joined_user_name,
        accepted_at = now(),
        invited_by = coalesce(invited_by, invitation_record.inviter_id),
        role = 'Csapattag'
    where boat_id = invitation_record.boat_id
      and email = invitation_record.invitee_email
    returning * into member_record;
  end if;

  if member_record.id is null then
    insert into public.boat_team_members (
      boat_id, user_id, email, invited_by, status, display_name, accepted_at, role
    )
    values (
      invitation_record.boat_id, p_user_id, invitation_record.invitee_email,
      invitation_record.inviter_id, 'active', joined_user_name, now(), 'Csapattag'
    )
    returning * into member_record;
  end if;

  update public.boat_team_invitations
  set status = 'accepted', accepted_at = now(), accepted_by_user_id = p_user_id
  where id = invitation_record.id;

  return member_record.id;
end;
$$;

create or replace function public.create_boat_team_invitation(
  p_boat_id uuid,
  p_inviter_id uuid,
  p_invitee_email text,
  p_invited_name text default null,
  p_expires_in_days integer default 7
)
returns public.boat_team_invitations
language plpgsql
security definer
as $$
declare
  normalized_email text;
  invite_record public.boat_team_invitations;
begin
  normalized_email := lower(trim(p_invitee_email));

  select * into invite_record
  from public.boat_team_invitations
  where boat_id = p_boat_id and invitee_email = normalized_email
  order by created_at desc
  limit 1;

  if invite_record.id is null or invite_record.status in ('accepted', 'expired', 'cancelled') then
    insert into public.boat_team_invitations (
      boat_id, inviter_id, invitee_email, invited_name, status, expires_at
    )
    values (
      p_boat_id, p_inviter_id, normalized_email, p_invited_name, 'pending',
      now() + (p_expires_in_days || ' days')::interval
    )
    returning * into invite_record;
  else
    update public.boat_team_invitations
    set inviter_id = p_inviter_id,
        invited_name = p_invited_name,
        status = 'pending',
        expires_at = now() + (p_expires_in_days || ' days')::interval,
        created_at = now()
    where id = invite_record.id
    returning * into invite_record;
  end if;

  insert into public.boat_team_members (
    boat_id, user_id, email, invited_by, status, display_name, role
  )
  values (
    p_boat_id, null, normalized_email, p_inviter_id, 'invited',
    coalesce(p_invited_name, null), 'Meghívott'
  )
  on conflict (boat_id, email)
  do update set
    invited_by = excluded.invited_by,
    display_name = coalesce(public.boat_team_members.display_name, excluded.display_name),
    status = case when public.boat_team_members.status = 'active' then 'active' else 'invited' end,
    role = case when public.boat_team_members.status = 'active' then 'Csapattag' else 'Meghívott' end;

  return invite_record;
end;
$$;

-- ===================== RLS (ésszerű alapszabályok a teszthez) =====================

alter table public.users enable row level security;
alter table public.boats enable row level security;
alter table public.ads enable row level security;
alter table public.applications enable row level security;
alter table public.boat_events enable row level security;
alter table public.boat_event_attendees enable row level security;
alter table public.boat_team_members enable row level security;
alter table public.boat_team_invitations enable row level security;
alter table public.test_feedback enable row level security; -- csak service role éri el

-- users: a böngésző és a kapitányi nézetek olvassák; csak a saját sort lehet írni
create policy users_select on public.users for select using (true);
create policy users_insert_own on public.users for insert to authenticated with check (auth.uid() = id);
create policy users_update_own on public.users for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy users_delete_own on public.users for delete to authenticated using (auth.uid() = id);

-- boats
create policy boats_select on public.boats for select using (true);
create policy boats_insert_own on public.boats for insert to authenticated with check (auth.uid() = user_id);
create policy boats_update_own on public.boats for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy boats_delete_own on public.boats for delete to authenticated using (auth.uid() = user_id);

-- ads
create policy ads_select on public.ads for select using (true);
create policy ads_insert_own on public.ads for insert to authenticated with check (auth.uid() = user_id);
create policy ads_update_own on public.ads for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy ads_delete_own on public.ads for delete to authenticated using (auth.uid() = user_id);

-- applications: a böngésző a jelentkezések számát olvassa, ezért az olvasás nyitott
create policy applications_select on public.applications for select using (true);
create policy applications_insert_own on public.applications for insert to authenticated with check (auth.uid() = user_id);
create policy applications_update on public.applications for update to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.ads a where a.id = ad_id and a.user_id = auth.uid())
  );
create policy applications_delete on public.applications for delete to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.ads a where a.id = ad_id and a.user_id = auth.uid())
  );

-- boat_events
create policy boat_events_select on public.boat_events for select to authenticated using (true);
create policy boat_events_write_owner on public.boat_events for all to authenticated
  using (exists (select 1 from public.boats b where b.id = boat_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.boats b where b.id = boat_id and b.user_id = auth.uid()));

-- boat_event_attendees
create policy attendees_select on public.boat_event_attendees for select to authenticated using (true);
create policy attendees_write on public.boat_event_attendees for all to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.boat_events e
      join public.boats b on b.id = e.boat_id
      where e.id = event_id and b.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.boat_events e
      join public.boats b on b.id = e.boat_id
      where e.id = event_id and b.user_id = auth.uid()
    )
  );

-- boat_team_members: a hajó tulajdonosa kezeli, a tag a sajátját látja
create policy team_members_select on public.boat_team_members for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.boats b where b.id = boat_id and b.user_id = auth.uid())
  );
create policy team_members_write_owner on public.boat_team_members for all to authenticated
  using (exists (select 1 from public.boats b where b.id = boat_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.boats b where b.id = boat_id and b.user_id = auth.uid()));

-- boat_team_invitations
create policy team_invitations_owner on public.boat_team_invitations for all to authenticated
  using (exists (select 1 from public.boats b where b.id = boat_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.boats b where b.id = boat_id and b.user_id = auth.uid()));

-- ===================== STORAGE =====================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('boats', 'boats', true)
on conflict (id) do update set public = true;

create policy storage_public_read on storage.objects for select
  using (bucket_id in ('avatars', 'boats'));
create policy storage_avatars_insert on storage.objects for insert
  with check (bucket_id = 'avatars');
create policy storage_boats_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'boats');
create policy storage_manage_authenticated on storage.objects for update to authenticated
  using (bucket_id in ('avatars', 'boats'));
create policy storage_delete_authenticated on storage.objects for delete to authenticated
  using (bucket_id in ('avatars', 'boats'));
