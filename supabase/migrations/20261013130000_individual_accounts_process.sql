-- Comptes individuels, rôle administrateur, lecture validée de l'Internal process.

-- ---------- Membres ↔ comptes
alter table public.team_members
  add column email text unique,
  add column user_id uuid unique references auth.users(id) on delete set null,
  add column role text not null default 'member' check (role in ('member','admin')),
  add column must_change_password boolean not null default true;

-- L'ancien compte partagé n'est plus utilisé
drop policy if exists "compte voit sa ligne" on public.team_accounts;
delete from auth.users where id in (select user_id from public.team_accounts);
drop table public.team_accounts;

create or replace function public.my_member_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.team_members where user_id = auth.uid() and active
$$;

create or replace function public.is_team() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_members where user_id = auth.uid() and active)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_members where user_id = auth.uid() and active and role = 'admin')
$$;

revoke all on function public.my_member_id() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.my_member_id() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- Chaque membre peut marquer son propre mot de passe comme changé
create or replace function public.mark_password_changed() returns void
language sql security definer set search_path = '' as $$
  update public.team_members set must_change_password = false where user_id = auth.uid()
$$;
revoke all on function public.mark_password_changed() from public, anon;
grant execute on function public.mark_password_changed() to authenticated;

-- Les e-mails ne sont visibles que de l'administrateur ; les noms passent par team_names()
drop policy if exists "équipe lit" on public.team_members;
create policy "admin lit tout" on public.team_members for select to authenticated using (public.is_admin() or user_id = auth.uid());
create policy "admin gère" on public.team_members for all to authenticated using (public.is_admin()) with check (public.is_admin());
create or replace function public.team_names() returns table(id uuid, name text, is_me boolean)
language sql stable security definer set search_path = '' as $$
  select id, name, coalesce(user_id = auth.uid(), false) from public.team_members
  where active and public.is_team() order by name
$$;
revoke all on function public.team_names() from public, anon;
grant execute on function public.team_names() to authenticated;

-- ---------- Qui coche
alter table public.studio_checks add column checked_by uuid references public.team_members(id) default public.my_member_id();

-- ---------- Internal process : versions et validations de lecture
create table public.process_versions (
  version int primary key,
  title text not null,
  summary text,
  published_at timestamptz not null default now()
);
create table public.process_acks (
  member_id uuid not null references public.team_members(id) on delete cascade,
  version int not null references public.process_versions(version),
  acknowledged_at timestamptz not null default now(),
  primary key (member_id, version)
);
alter table public.process_versions enable row level security;
alter table public.process_acks enable row level security;
create policy "équipe lit" on public.process_versions for select to authenticated using (public.is_team());
create policy "admin publie" on public.process_versions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "chacun voit sa validation, l'admin voit tout" on public.process_acks for select to authenticated
  using (public.is_admin() or member_id = public.my_member_id());
create policy "chacun valide pour soi" on public.process_acks for insert to authenticated
  with check (member_id = public.my_member_id());

insert into public.process_versions (version, title, summary)
values (1, 'Studio AccessFlow · ouverture & fermeture', 'Première version : procédure d’ouverture et de fermeture, listes de rangement, tâches de la semaine.');

-- État de lecture pour l'administrateur
create or replace view public.process_read_status with (security_invoker = true) as
select m.id as member_id, m.name, m.email, m.role, m.active,
       v.version, v.title, a.acknowledged_at
from public.team_members m
cross join (select * from public.process_versions order by version desc limit 1) v
left join public.process_acks a on a.member_id = m.id and a.version = v.version;

-- ---------- Noms dans l'historique (les membres ne lisent pas la table team_members en entier)
create or replace function public.member_name(p uuid) returns text
language sql stable security definer set search_path = '' as $$
  select name from public.team_members where id = p and public.is_team()
$$;
revoke all on function public.member_name(uuid) from public, anon;
grant execute on function public.member_name(uuid) to authenticated;

drop view public.studio_history_items;
create view public.studio_history_items with (security_invoker = true) as
select c.id as cycle_id, c.evening_date, c.morning_date, c.status,
       e->>'phase' as phase, i.list, i.id as item_id, i.label,
       k.checked_at is not null as checked, k.checked_at,
       public.member_name(k.checked_by) as checked_by,
       public.member_name(s.member_id) as signed_by
from public.studio_cycles c
cross join lateral jsonb_array_elements(c.expected) e
join public.studio_items i on i.id = e->>'item'
left join public.studio_checks k on k.cycle_id = c.id and k.phase = e->>'phase' and k.item_id = i.id
left join public.studio_signs s on s.cycle_id = c.id and s.phase = e->>'phase' and s.list = i.list;
