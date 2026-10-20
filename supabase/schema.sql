-- WhisperChat database setup
-- Run this entire file in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[A-Za-z0-9_]{3,24}$')
);
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint distinct_members check (user_a <> user_b),
  constraint canonical_members check (user_a < user_b),
  unique(user_a, user_b)
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at);
create index if not exists conversations_user_a_idx on public.conversations(user_a);
create index if not exists conversations_user_b_idx on public.conversations(user_b);

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Profiles are visible to signed-in users" on public.profiles;
create policy "Profiles are visible to signed-in users" on public.profiles for select to authenticated using (true);
drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Members can read their conversations" on public.conversations;
create policy "Members can read their conversations" on public.conversations for select to authenticated using (auth.uid() = user_a or auth.uid() = user_b);
drop policy if exists "Members can create conversations" on public.conversations;
create policy "Members can create conversations" on public.conversations for insert to authenticated with check (
  (auth.uid() = user_a or auth.uid() = user_b)
  and user_a < user_b
  and exists(select 1 from public.profiles p where p.id = user_a)
  and exists(select 1 from public.profiles p where p.id = user_b)
);

drop policy if exists "Members can read messages" on public.messages;
create policy "Members can read messages" on public.messages for select to authenticated using (
  exists(select 1 from public.conversations c where c.id = conversation_id and (auth.uid() = c.user_a or auth.uid() = c.user_b))
);
drop policy if exists "Members can send as themselves" on public.messages;
create policy "Members can send as themselves" on public.messages for insert to authenticated with check (
  auth.uid() = sender_id
  and exists(select 1 from public.conversations c where c.id = conversation_id and (auth.uid() = c.user_a or auth.uid() = c.user_b))
);
drop policy if exists "Recipient can mark messages read" on public.messages;
create policy "Recipient can mark messages read" on public.messages for update to authenticated using (
  exists(select 1 from public.conversations c where c.id = conversation_id and (auth.uid() = c.user_a or auth.uid() = c.user_b))
  and sender_id <> auth.uid()
) with check (
  exists(select 1 from public.conversations c where c.id = conversation_id and (auth.uid() = c.user_a or auth.uid() = c.user_b))
  and sender_id <> auth.uid()
);

-- Note: realtime typing indicators and push notifications require additional
-- infrastructure; this starter uses refresh/polling for messages and browser
-- notifications while the app is open. See README for next steps.