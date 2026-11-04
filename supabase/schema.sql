-- Run in Supabase Dashboard -> SQL Editor.
-- Playback time is stored as position_seconds. "current_time" is a PostgreSQL keyword.
create table if not exists public.watch_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id text not null,
  title text not null default '',
  position_seconds integer not null default 0 check (position_seconds >= 0),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

grant select, insert, update, delete on table public.watch_progress to authenticated;

alter table public.watch_progress enable row level security;

drop policy if exists "Users can read their own watch progress" on public.watch_progress;
create policy "Users can read their own watch progress"
  on public.watch_progress for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own watch progress" on public.watch_progress;
create policy "Users can insert their own watch progress"
  on public.watch_progress for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own watch progress" on public.watch_progress;
create policy "Users can update their own watch progress"
  on public.watch_progress for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own watch progress" on public.watch_progress;
create policy "Users can delete their own watch progress"
  on public.watch_progress for delete
  to authenticated
  using (auth.uid() = user_id);

create index if not exists watch_progress_updated_at_idx
  on public.watch_progress (user_id, updated_at desc);


-- Add cloud favorites to an existing Supabase project.
create table if not exists public.favorite_videos (
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id text not null,
  title text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

grant select, insert, update, delete on table public.favorite_videos to authenticated;

alter table public.favorite_videos enable row level security;

drop policy if exists "Users can read their own favorites" on public.favorite_videos;
create policy "Users can read their own favorites"
  on public.favorite_videos for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own favorites" on public.favorite_videos;
create policy "Users can insert their own favorites"
  on public.favorite_videos for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own favorites" on public.favorite_videos;
create policy "Users can update their own favorites"
  on public.favorite_videos for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own favorites" on public.favorite_videos;
create policy "Users can delete their own favorites"
  on public.favorite_videos for delete to authenticated
  using (auth.uid() = user_id);

create index if not exists favorite_videos_created_at_idx
  on public.favorite_videos (user_id, created_at desc);
