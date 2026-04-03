-- Run this in Supabase SQL editor
create extension if not exists "uuid-ossp";

DO $$
BEGIN
  CREATE TYPE public.session_status AS ENUM ('scheduled', 'active', 'ended');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.message_type AS ENUM ('text', 'code', 'system');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  role text not null check (role in ('mentor', 'student')),
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references auth.users(id),
  student_id uuid references auth.users(id),
  title text not null,
  description text,
  status public.session_status not null default 'scheduled',
  room_key text not null unique,
  scheduled_for timestamptz,
  duration_minutes integer not null default 60,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sessions alter column student_id drop not null;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  sender_id uuid not null references auth.users(id),
  sender_role text not null,
  message_type public.message_type not null default 'text',
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.code_snapshots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  editor_language text not null default 'python',
  content text not null,
  version integer not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.messages enable row level security;
alter table public.code_snapshots enable row level security;

drop policy if exists "users can view own profile" on public.profiles;
create policy "users can view own profile" on public.profiles
for select to authenticated
using (auth.uid() = id);

drop policy if exists "users can upsert own profile" on public.profiles;
create policy "users can upsert own profile" on public.profiles
for insert to authenticated
with check (auth.uid() = id);

drop policy if exists "participants can read sessions" on public.sessions;
create policy "participants can read sessions" on public.sessions
for select to authenticated
using (auth.uid() = mentor_id or auth.uid() = student_id);

drop policy if exists "mentor can create sessions" on public.sessions;
create policy "mentor can create sessions" on public.sessions
for insert to authenticated
with check (auth.uid() = mentor_id);

drop policy if exists "mentor can update sessions" on public.sessions;
create policy "mentor can update sessions" on public.sessions
for update to authenticated
using (auth.uid() = mentor_id);

drop policy if exists "participants can read messages" on public.messages;
create policy "participants can read messages" on public.messages
for select to authenticated
using (
  exists (
    select 1
    from public.sessions s
    where s.id = session_id
      and (auth.uid() = s.mentor_id or auth.uid() = s.student_id)
  )
);

drop policy if exists "participants can insert messages" on public.messages;
create policy "participants can insert messages" on public.messages
for insert to authenticated
with check (
  auth.uid() = sender_id
  and exists (
    select 1
    from public.sessions s
    where s.id = session_id
      and (auth.uid() = s.mentor_id or auth.uid() = s.student_id)
  )
);

drop policy if exists "participants can read snapshots" on public.code_snapshots;
create policy "participants can read snapshots" on public.code_snapshots
for select to authenticated
using (
  exists (
    select 1
    from public.sessions s
    where s.id = session_id
      and (auth.uid() = s.mentor_id or auth.uid() = s.student_id)
  )
);

drop policy if exists "participants can insert snapshots" on public.code_snapshots;
create policy "participants can insert snapshots" on public.code_snapshots
for insert to authenticated
with check (
  auth.uid() = created_by
  and exists (
    select 1
    from public.sessions s
    where s.id = session_id
      and (auth.uid() = s.mentor_id or auth.uid() = s.student_id)
  )
);
