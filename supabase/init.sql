-- Run this in Supabase SQL Editor for project initialization.
-- It creates the tables expected by server.ts.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  plan_type text not null default 'free',
  created_at timestamptz not null default now()
);

-- Backfill/upgrade existing users table shape if it was created earlier.
alter table if exists public.users
  add column if not exists password_hash text;
alter table if exists public.users
  add column if not exists plan_type text default 'free';
alter table if exists public.users
  add column if not exists created_at timestamptz default now();

update public.users
set password_hash = 'OAUTH_USER'
where password_hash is null;

alter table if exists public.users
  alter column password_hash set not null;
alter table if exists public.users
  alter column plan_type set not null;
alter table if exists public.users
  alter column plan_type set default 'free';
alter table if exists public.users
  alter column created_at set not null;
alter table if exists public.users
  alter column created_at set default now();

create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  slug text not null unique,
  long_url text not null,
  clicks integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_links_user_id on public.links(user_id);
create index if not exists idx_links_slug on public.links(slug);

create table if not exists public.usage (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  date date not null,
  count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (identifier, date)
);

create index if not exists idx_usage_identifier_date on public.usage(identifier, date);
