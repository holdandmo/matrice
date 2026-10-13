-- Tâches du jour : rattachées au jour calendaire (matin / dans la journée), une seule case chacune.
-- Elles sortent des cycles soir → matin.
alter table public.studio_items add column moment text check (moment in ('matin','journee'));
update public.studio_items set moment = 'journee', phases = array['journee'] where id = 't-courses';
update public.studio_items set moment = 'matin', phases = array['matin'] where id in ('t-poubelles','t-recyclage','t-deso');
update public.studio_items set hint = case id
  when 't-courses' then 'Le mardi'
  when 't-poubelles' then 'Lundi, mercredi, vendredi'
  when 't-recyclage' then 'Le mardi'
  when 't-deso' then 'Mardi et vendredi'
  else hint end where list = 'tasks';

create or replace function public.studio_expected(p_evening date) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('phase', ph, 'item', i.id) order by ph desc, i.list, i.position), '[]'::jsonb)
  from public.studio_items i
  cross join lateral unnest(i.phases) as ph
  where i.active and i.list <> 'tasks'
$$;
update public.studio_cycles set expected = public.studio_expected(evening_date) where status = 'open';

create table public.studio_days (
  day date primary key,
  expected jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create table public.studio_day_checks (
  day date not null references public.studio_days(day) on delete cascade,
  item_id text not null references public.studio_items(id),
  checked_at timestamptz not null default now(),
  checked_by uuid references public.team_members(id) default public.my_member_id(),
  primary key (day, item_id)
);
alter table public.studio_days enable row level security;
alter table public.studio_day_checks enable row level security;
create policy "équipe lit" on public.studio_days for select to authenticated using (public.is_team());
create policy "équipe crée" on public.studio_days for insert to authenticated with check (public.is_team());
create policy "équipe lit" on public.studio_day_checks for select to authenticated using (public.is_team());
create policy "équipe coche" on public.studio_day_checks for insert to authenticated with check (public.is_team() and day >= public.paris_today() - 1);
create policy "équipe décoche" on public.studio_day_checks for delete to authenticated using (public.is_team() and day >= public.paris_today() - 1);

-- Les tâches du jour (figées à la première ouverture de la journée)
create or replace function public.studio_today() returns public.studio_days
language plpgsql security invoker set search_path = '' as $$
declare t date := public.paris_today(); d public.studio_days;
begin
  insert into public.studio_days (day, expected)
  select t, coalesce(jsonb_agg(i.id order by case i.moment when 'matin' then 0 else 1 end, i.position), '[]'::jsonb)
  from public.studio_items i
  where i.active and i.list = 'tasks' and extract(isodow from t)::int = any(i.weekdays)
  on conflict (day) do nothing;
  select * into d from public.studio_days where day = t;
  return d;
end $$;
revoke all on function public.studio_today() from public, anon;
grant execute on function public.studio_today() to authenticated;

-- Historique des tâches du jour, faites ou non
create view public.studio_day_history with (security_invoker = true) as
select d.day, i.id as item_id, i.label, i.moment,
       k.checked_at is not null as checked, k.checked_at,
       public.member_name(k.checked_by) as checked_by
from public.studio_days d
cross join lateral jsonb_array_elements_text(d.expected) e(item)
join public.studio_items i on i.id = e.item
left join public.studio_day_checks k on k.day = d.day and k.item_id = i.id;

alter publication supabase_realtime add table public.studio_day_checks;
