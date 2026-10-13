-- Studio AccessFlow · ouverture / fermeture
-- Équipe, points de contrôle, cycles soir → matin, coches, signatures, photos.

create extension if not exists pgcrypto;

-- ---------- Équipe
create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Points de contrôle
-- list: 'studios' | 'playback' | 'tasks'
-- phases: phases où le point apparaît ('soir', 'matin')
-- weekdays: pour les tâches, jours concernés (1 = lundi … 7 = dimanche, ISO).
--   Pour une tâche du soir, c'est le jour du soir ; pour une tâche du matin, le jour du matin.
create table public.studio_items (
  id text primary key,
  list text not null check (list in ('studios','playback','tasks')),
  label text not null,
  hint text,
  phases text[] not null default array['soir','matin'],
  weekdays int[],
  photo_slots text[] not null default '{}',
  position int not null default 0,
  active boolean not null default true
);

-- ---------- Cycles : soir du jour D → matin du prochain jour ouvré
create table public.studio_cycles (
  id uuid primary key default gen_random_uuid(),
  evening_date date not null unique,
  morning_date date not null,
  status text not null default 'open' check (status in ('open','done','incomplete')),
  expected jsonb not null default '[]'::jsonb,  -- [{"phase":"soir","item":"s1"}, …] figé à la création
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table public.studio_checks (
  cycle_id uuid not null references public.studio_cycles(id) on delete cascade,
  phase text not null check (phase in ('soir','matin')),
  item_id text not null references public.studio_items(id),
  checked_at timestamptz not null default now(),
  primary key (cycle_id, phase, item_id)
);

-- Qui a fait quelle liste (studios / playback / tasks) à quel moment
create table public.studio_signs (
  cycle_id uuid not null references public.studio_cycles(id) on delete cascade,
  phase text not null check (phase in ('soir','matin')),
  list text not null check (list in ('studios','playback','tasks')),
  member_id uuid not null references public.team_members(id),
  signed_at timestamptz not null default now(),
  primary key (cycle_id, phase, list)
);

-- Photos de référence remplacées par l'équipe (sinon la photo d'origine du site est utilisée)
create table public.studio_photos (
  slot text primary key,
  path text not null,
  updated_at timestamptz not null default now()
);

-- ---------- Fonctions de date (heure de Paris)
create or replace function public.paris_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Europe/Paris')::date
$$;

create or replace function public.next_open_day(d date) returns date
language sql immutable set search_path = '' as $$
  select case extract(isodow from d + 1)::int
    when 6 then d + 3   -- samedi → lundi
    when 7 then d + 2   -- dimanche → lundi
    else d + 1 end
$$;

-- Liste attendue pour un cycle
create or replace function public.studio_expected(p_evening date) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('phase', ph, 'item', i.id) order by ph desc, i.list, i.position), '[]'::jsonb)
  from public.studio_items i
  cross join lateral unnest(i.phases) as ph
  where i.active
    and (i.weekdays is null
         or (ph = 'soir'  and extract(isodow from p_evening)::int = any(i.weekdays))
         or (ph = 'matin' and extract(isodow from public.next_open_day(p_evening))::int = any(i.weekdays)))
$$;

-- Le cycle en cours. Clôture en « incomplete » un cycle dont le matin est passé, puis en crée un si besoin.
create or replace function public.studio_current_cycle() returns public.studio_cycles
language plpgsql security invoker set search_path = '' as $$
declare
  t date := public.paris_today();
  c public.studio_cycles;
begin
  update public.studio_cycles set status = 'incomplete', closed_at = now()
   where status = 'open' and morning_date < t;

  select * into c from public.studio_cycles where status = 'open' order by evening_date limit 1;
  if found then return c; end if;

  insert into public.studio_cycles (evening_date, morning_date, expected)
  values (t, public.next_open_day(t), public.studio_expected(t))
  on conflict (evening_date) do nothing;

  select * into c from public.studio_cycles where status = 'open' order by evening_date limit 1;
  if not found then
    -- le cycle du jour existe déjà et est clos : on prépare le suivant
    insert into public.studio_cycles (evening_date, morning_date, expected)
    values (public.next_open_day(t), public.next_open_day(public.next_open_day(t)), public.studio_expected(public.next_open_day(t)))
    on conflict (evening_date) do nothing;
    select * into c from public.studio_cycles where status = 'open' order by evening_date limit 1;
  end if;
  return c;
end $$;

-- État d'avancement d'un cycle
create or replace function public.studio_cycle_progress(p_cycle uuid)
returns table(phase text, expected int, checked int, signs_needed int, signs_done int)
language sql stable set search_path = '' as $$
  with c as (select * from public.studio_cycles where id = p_cycle),
  exp as (
    select e->>'phase' as phase, e->>'item' as item, i.list
    from c, jsonb_array_elements(c.expected) e
    join public.studio_items i on i.id = e->>'item'
  ),
  lists as (select distinct phase, list from exp)
  select p.phase,
    (select count(*) from exp where exp.phase = p.phase)::int,
    (select count(*) from exp join public.studio_checks k on k.cycle_id = p_cycle and k.phase = exp.phase and k.item_id = exp.item where exp.phase = p.phase)::int,
    (select count(*) from lists where lists.phase = p.phase)::int,
    (select count(*) from lists join public.studio_signs s on s.cycle_id = p_cycle and s.phase = lists.phase and s.list = lists.list where lists.phase = p.phase)::int
  from (values ('soir'), ('matin')) p(phase)
$$;

-- Clôture le cycle s'il est complet et ouvre le suivant. Renvoie le cycle en cours.
create or replace function public.studio_try_complete(p_cycle uuid) returns public.studio_cycles
language plpgsql security invoker set search_path = '' as $$
declare
  c public.studio_cycles;
  incomplete int;
  t date := public.paris_today();
  nxt date;
begin
  select * into c from public.studio_cycles where id = p_cycle for update;
  if not found or c.status <> 'open' then return public.studio_current_cycle(); end if;

  select count(*) into incomplete from public.studio_cycle_progress(p_cycle) p
   where p.checked < p.expected or p.signs_done < p.signs_needed;
  if incomplete > 0 then return c; end if;

  update public.studio_cycles set status = 'done', closed_at = now() where id = p_cycle;
  nxt := case when t > c.evening_date then t else public.next_open_day(c.evening_date) end;
  insert into public.studio_cycles (evening_date, morning_date, expected)
  values (nxt, public.next_open_day(nxt), public.studio_expected(nxt))
  on conflict (evening_date) do nothing;
  return public.studio_current_cycle();
end $$;

-- ---------- Historique : une ligne par cycle et par point attendu, coché ou non
create or replace view public.studio_history_items with (security_invoker = true) as
select c.id as cycle_id, c.evening_date, c.morning_date, c.status,
       e->>'phase' as phase, i.list, i.id as item_id, i.label,
       k.checked_at is not null as checked, k.checked_at,
       m.name as signed_by
from public.studio_cycles c
cross join lateral jsonb_array_elements(c.expected) e
join public.studio_items i on i.id = e->>'item'
left join public.studio_checks k on k.cycle_id = c.id and k.phase = e->>'phase' and k.item_id = i.id
left join public.studio_signs s on s.cycle_id = c.id and s.phase = e->>'phase' and s.list = i.list
left join public.team_members m on m.id = s.member_id;

-- ---------- Accès : seul le compte d'équipe connecté lit et écrit
alter table public.team_members  enable row level security;
alter table public.studio_items  enable row level security;
alter table public.studio_cycles enable row level security;
alter table public.studio_checks enable row level security;
alter table public.studio_signs  enable row level security;
alter table public.studio_photos enable row level security;

create policy "équipe lit" on public.team_members  for select to authenticated using (true);
create policy "équipe lit" on public.studio_items  for select to authenticated using (true);
create policy "équipe lit" on public.studio_cycles for select to authenticated using (true);
create policy "équipe crée" on public.studio_cycles for insert to authenticated with check (true);
create policy "équipe clôt" on public.studio_cycles for update to authenticated using (true) with check (true);
create policy "équipe lit" on public.studio_checks for select to authenticated using (true);
create policy "équipe coche" on public.studio_checks for insert to authenticated with check (exists (select 1 from public.studio_cycles c where c.id = cycle_id and c.status = 'open'));
create policy "équipe décoche" on public.studio_checks for delete to authenticated using (exists (select 1 from public.studio_cycles c where c.id = cycle_id and c.status = 'open'));
create policy "équipe lit" on public.studio_signs for select to authenticated using (true);
create policy "équipe signe" on public.studio_signs for insert to authenticated with check (exists (select 1 from public.studio_cycles c where c.id = cycle_id and c.status = 'open'));
create policy "équipe modifie" on public.studio_signs for update to authenticated using (exists (select 1 from public.studio_cycles c where c.id = cycle_id and c.status = 'open')) with check (true);
create policy "équipe retire" on public.studio_signs for delete to authenticated using (exists (select 1 from public.studio_cycles c where c.id = cycle_id and c.status = 'open'));
create policy "équipe lit" on public.studio_photos for select to authenticated using (true);
create policy "équipe ajoute" on public.studio_photos for insert to authenticated with check (true);
create policy "équipe remplace" on public.studio_photos for update to authenticated using (true) with check (true);
create policy "équipe retire" on public.studio_photos for delete to authenticated using (true);

revoke all on function public.studio_current_cycle() from public, anon;
revoke all on function public.studio_try_complete(uuid) from public, anon;
revoke all on function public.studio_cycle_progress(uuid) from public, anon;
revoke all on function public.studio_expected(date) from public, anon;
grant execute on function public.studio_current_cycle() to authenticated;
grant execute on function public.studio_try_complete(uuid) to authenticated;
grant execute on function public.studio_cycle_progress(uuid) to authenticated;
grant execute on function public.studio_expected(date) to authenticated;

-- Temps réel : les coches apparaissent chez tout le monde
alter publication supabase_realtime add table public.studio_cycles, public.studio_checks, public.studio_signs, public.studio_photos;

-- ---------- Stockage des photos (privé)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('studio-photos', 'studio-photos', false, 20971520, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "équipe lit les photos" on storage.objects for select to authenticated using (bucket_id = 'studio-photos');
create policy "équipe ajoute des photos" on storage.objects for insert to authenticated with check (bucket_id = 'studio-photos');
create policy "équipe remplace des photos" on storage.objects for update to authenticated using (bucket_id = 'studio-photos');
create policy "équipe supprime des photos" on storage.objects for delete to authenticated using (bucket_id = 'studio-photos');

-- ---------- Données de départ
insert into public.team_members (name) values ('Anthony'), ('Chloé'), ('Malina'), ('Maxys'), ('Vincent');

insert into public.studio_items (id, list, label, hint, phases, weekdays, photo_slots, position) values
 ('s1','studios','Cendriers vidés et lavés',null,array['soir','matin'],null,'{}',1),
 ('s2','studios','Tables nettoyées',null,array['soir','matin'],null,'{}',2),
 ('s3','studios','Aspirateur passé',null,array['soir','matin'],null,'{}',3),
 ('s4','studios','Bouteilles d’eau vidées et jetées à la poubelle',null,array['soir','matin'],null,'{}',4),
 ('s5','studios','Verres d’eau débarrassés et lavés',null,array['soir','matin'],null,'{}',5),
 ('s6','studios','Poubelles vidées',null,array['soir','matin'],null,'{}',6),
 ('s7','studios','Câbles pliés, instruments rangés sur leurs pieds',null,array['soir','matin'],null,'{}',7),
 ('b1','playback','Outils rangés à leur place',null,array['soir','matin'],null,'{}',1),
 ('b2','playback','Kits alignés le long du mur',null,array['soir','matin'],null,'{}',2),
 ('b3','playback','Tables propres',null,array['soir','matin'],null,'{}',3),
 ('b4','playback','Chaises rangées sous les tables',null,array['soir','matin'],null,'{}',4),
 ('b5','playback','Mezzanine rangée et nettoyée : aspirateur, ateliers propres et rangés, bureau propre et rangé',null,array['soir','matin'],null,'{}',5),
 ('t-courses','tasks','Liste de courses espace commun : mise à jour + achat','Mardi · à faire dans la journée',array['soir'],array[2],'{}',1),
 ('t-poubelles','tasks','Sortir les poubelles','Lun · Mer · Ven matin',array['matin'],array[1,3,5],array['containers'],2),
 ('t-recyclage','tasks','Sortir le recyclage','Mardi matin',array['matin'],array[2],array['recyclage'],3),
 ('t-deso','tasks','Vaporiser le désodorisant dans le bureau et le studio','Mar · Ven matin',array['matin'],array[2,5],array['deso-bureau','deso-studio'],4);
