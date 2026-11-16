-- Run once in Supabase Dashboard -> SQL Editor.
-- Private shared library for original video files uploaded by authenticated family members.

create table if not exists public.custom_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Семейная история',
  storage_path text not null unique,
  mime_type text not null default 'video/mp4',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  created_at timestamptz not null default now()
);

grant select, insert, delete on table public.custom_videos to authenticated;
alter table public.custom_videos enable row level security;

drop policy if exists "Signed-in family members can read custom videos" on public.custom_videos;
create policy "Signed-in family members can read custom videos"
  on public.custom_videos for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "Users can add their own custom videos" on public.custom_videos;
create policy "Users can add their own custom videos"
  on public.custom_videos for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own custom videos" on public.custom_videos;
create policy "Users can delete their own custom videos"
  on public.custom_videos for delete to authenticated
  using (auth.uid() = user_id);

create index if not exists custom_videos_created_at_idx
  on public.custom_videos (created_at desc);

insert into storage.buckets (id, name, public, allowed_mime_types)
values ('history-videos', 'history-videos', false, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update
set public = false, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated family members can read history videos" on storage.objects;
create policy "Authenticated family members can read history videos"
  on storage.objects for select to authenticated
  using (bucket_id = 'history-videos');

drop policy if exists "Users can upload their own history videos" on storage.objects;
create policy "Users can upload their own history videos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'history-videos' and owner_id = (select auth.uid()::text));

drop policy if exists "Users can delete their own history videos" on storage.objects;
create policy "Users can delete their own history videos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'history-videos' and owner_id = (select auth.uid()::text));
