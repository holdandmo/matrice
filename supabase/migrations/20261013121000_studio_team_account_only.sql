-- Accès limité au compte d'équipe (même si l'inscription publique reste active dans Supabase Auth)
create table public.team_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now()
);
alter table public.team_accounts enable row level security;
create policy "compte voit sa ligne" on public.team_accounts for select to authenticated using (user_id = auth.uid());

create or replace function public.is_team() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_accounts where user_id = auth.uid())
$$;
revoke all on function public.is_team() from public, anon;
grant execute on function public.is_team() to authenticated;

-- Le compte d'équipe (equipe-studio@holdandmotion.app) est créé dans Authentication > Users,
-- puis déclaré ici :
insert into public.team_accounts (user_id, label)
select id, 'Équipe studio (mot de passe partagé)' from auth.users where email = 'equipe-studio@holdandmotion.app';

create policy "compte équipe uniquement" on public.team_members  as restrictive for all to authenticated using (public.is_team()) with check (public.is_team());
create policy "compte équipe uniquement" on public.studio_items  as restrictive for all to authenticated using (public.is_team()) with check (public.is_team());
create policy "compte équipe uniquement" on public.studio_cycles as restrictive for all to authenticated using (public.is_team()) with check (public.is_team());
create policy "compte équipe uniquement" on public.studio_checks as restrictive for all to authenticated using (public.is_team()) with check (public.is_team());
create policy "compte équipe uniquement" on public.studio_signs  as restrictive for all to authenticated using (public.is_team()) with check (public.is_team());
create policy "compte équipe uniquement" on public.studio_photos as restrictive for all to authenticated using (public.is_team()) with check (public.is_team());
create policy "photos studio : compte équipe uniquement" on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'studio-photos' or public.is_team())
  with check (bucket_id <> 'studio-photos' or public.is_team());
