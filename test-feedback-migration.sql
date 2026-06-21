create extension if not exists pgcrypto;

create table if not exists public.test_feedback (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  page_path text,
  user_id uuid,
  user_email text,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists test_feedback_created_at_idx
  on public.test_feedback (created_at desc);

create index if not exists test_feedback_user_id_idx
  on public.test_feedback (user_id);

alter table public.test_feedback enable row level security;
