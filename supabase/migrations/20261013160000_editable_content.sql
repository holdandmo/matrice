-- Contenu modifiable par l'administrateur, tâches séparées, coches rattachées au compte.

-- ---------- Listes de rangement réécrites et remises dans l'ordre du rangement
update public.studio_items set label = v.label, position = v.pos from (values
  ('s5','Verres débarrassés et lavés',1),
  ('s4','Bouteilles d’eau vides jetées',2),
  ('s1','Cendriers vidés et lavés',3),
  ('s7','Câbles enroulés, instruments posés sur leurs pieds',4),
  ('s2','Tables essuyées',5),
  ('s6','Poubelles vidées',6),
  ('s3','Aspirateur passé',7),
  ('b1','Outils rangés à leur place',1),
  ('b2','Kits alignés le long du mur',2),
  ('b4','Chaises rangées sous les tables',3),
  ('b3','Tables propres',4),
  ('b5','Mezzanine : ateliers et bureau rangés',5)
) as v(id,label,pos) where studio_items.id = v.id;
insert into public.studio_items (id, list, label, phases, weekdays, photo_slots, position) values
  ('b6','playback','Mezzanine : aspirateur passé',array['soir','matin'],null,'{}',6);

-- ---------- Tâches du jour séparées (une personne différente peut faire chacune)
update public.studio_items set active = false where id in ('t-deso','t-courses');
insert into public.studio_items (id, list, label, hint, phases, weekdays, photo_slots, position, moment) values
  ('t-deso-bureau','tasks','Désodorisant dans le bureau',null,array['matin'],array[2,5],array['deso-bureau'],4,'matin'),
  ('t-deso-studio','tasks','Désodorisant dans le studio',null,array['matin'],array[2,5],array['deso-studio'],5,'matin'),
  ('t-courses-maj','tasks','Mettre à jour la liste de courses',null,array['journee'],array[2],'{}',6,'journee'),
  ('t-courses-achat','tasks','Faire les courses',null,array['journee'],array[2],'{}',7,'journee');

-- ---------- Plus de « Fait par » : chaque coche garde le compte qui l'a faite
create or replace function public.studio_try_complete(p_cycle uuid) returns public.studio_cycles
language plpgsql security invoker set search_path = '' as $$
declare
  c public.studio_cycles; missing int; t date := public.paris_today(); nxt date;
begin
  select * into c from public.studio_cycles where id = p_cycle for update;
  if not found or c.status <> 'open' then return public.studio_current_cycle(); end if;
  select count(*) into missing from jsonb_array_elements(c.expected) e
   where not exists (select 1 from public.studio_checks k where k.cycle_id = c.id and k.phase = e->>'phase' and k.item_id = e->>'item');
  if missing > 0 then return c; end if;
  update public.studio_cycles set status = 'done', closed_at = now() where id = p_cycle;
  nxt := case when t > c.evening_date then t else public.next_open_day(c.evening_date) end;
  insert into public.studio_cycles (evening_date, morning_date, expected)
  values (nxt, public.next_open_day(nxt), public.studio_expected(nxt))
  on conflict (evening_date) do nothing;
  return public.studio_current_cycle();
end $$;

-- ---------- Tâches attendues d'un jour
create or replace function public.studio_day_expected(d date) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(i.id order by case i.moment when 'matin' then 0 else 1 end, i.position), '[]'::jsonb)
  from public.studio_items i
  where i.active and i.list = 'tasks' and extract(isodow from d)::int = any(i.weekdays)
$$;
create or replace function public.studio_today() returns public.studio_days
language plpgsql security invoker set search_path = '' as $$
declare t date := public.paris_today(); d public.studio_days;
begin
  insert into public.studio_days (day, expected) values (t, public.studio_day_expected(t)) on conflict (day) do nothing;
  select * into d from public.studio_days where day = t;
  return d;
end $$;

-- Une modification des listes s'applique au jour en cours et aux suivants (pas au passé)
create or replace function public.studio_items_apply() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.studio_cycles set expected = public.studio_expected(evening_date) where status = 'open';
  update public.studio_days set expected = public.studio_day_expected(day) where day >= public.paris_today();
  return null;
end $$;
create trigger studio_items_apply after insert or update or delete on public.studio_items
  for each statement execute function public.studio_items_apply();
update public.studio_cycles set expected = public.studio_expected(evening_date) where status = 'open';
update public.studio_days set expected = public.studio_day_expected(day) where day >= public.paris_today();

-- L'administrateur gère les listes
create policy "admin gère les listes" on public.studio_items for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- Étapes de l'Internal process (modifiables)
create table public.process_steps (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('open','close')),
  grp text not null,
  position int not null default 0,
  text text not null,
  detail text,
  day_tag text,
  warn text,
  photo_slots text[] not null default '{}',
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.process_steps enable row level security;
create policy "équipe lit" on public.process_steps for select to authenticated using (public.is_team());
create policy "admin modifie" on public.process_steps for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- {door_code} est remplacé par le code de la porte à l'affichage
insert into public.process_steps (section, grp, position, text, detail, day_tag, warn, photo_slots) values
 ('open','Entrée',1,'Porte principale : code {door_code}',null,null,null,array['code']),
 ('open','Entrée',2,'Ouvrir le rideau métallique',null,null,null,'{}'),
 ('open','Entrée',3,'Désactiver l’alarme (badge Verisure)',null,null,null,array['alarme']),
 ('open','Entrée',4,'Allumer uniquement : tableau électrique, cuisine, les 2 lumières frigo / piano',null,null,'Ne pas allumer la lumière principale de l’entrée',array['tableau','cuisine','frigopiano']),
 ('open','Playback Solutions · bureau',5,'Ouvrir la porte du bureau',null,null,null,'{}'),
 ('open','Playback Solutions · bureau',6,'Vérifier le rangement du bureau',null,null,null,array['bureau']),
 ('open','Playback Solutions · bureau',7,'Allumer la musique via l’iPad',null,null,null,array['ipad']),
 ('open','Playback Solutions · bureau',8,'Désodorisant dans le bureau',null,'MAR & VEN',null,array['deso-bureau']),
 ('open','AccessFlow · studios',9,'Ouvrir la porte du studio',null,null,null,'{}'),
 ('open','AccessFlow · studios',10,'Vérifier les studios A, B et le SAS',null,null,null,array['A1','A2','A3','B1','B2','B3','sas']),
 ('open','AccessFlow · studios',11,'Désodorisant dans le studio',null,'MAR & VEN',null,array['deso-studio']),
 ('open','AccessFlow · studios',12,'Remplir le stock des frigos du studio',null,null,null,array['frigos']),
 ('open','Espace commun',13,'Laver la vaisselle sale, ranger la propre',null,null,null,'{}'),
 ('open','Espace commun',14,'Changer la poubelle de la cuisine si elle est pleine','Containers à gauche en sortant, sous le porche',null,null,array['containers']),
 ('close','AccessFlow · studios',1,'Ranger les studios A, B et le SAS',null,null,null,array['A1','A2','A3','B1','B2','B3','sas']),
 ('close','AccessFlow · studios',2,'Éteindre les lumières via l’iPad du SAS',null,null,null,array['ipad-sas']),
 ('close','AccessFlow · studios',3,'Fermer à clé la porte du studio uniquement',null,null,null,'{}'),
 ('close','Playback Solutions · bureau',4,'Ranger le bureau et la mezzanine',null,null,null,array['bureau']),
 ('close','Playback Solutions · bureau',5,'Éteindre la musique via l’iPad',null,null,null,array['ipad']),
 ('close','Playback Solutions · bureau',6,'Éteindre la lumière (télécommande Philips Hue)',null,null,null,array['hue']),
 ('close','Playback Solutions · bureau',7,'Fermer à clé la porte du bureau',null,null,null,'{}'),
 ('close','Espace commun · en dernier',8,'Laver la vaisselle sale, ranger la propre',null,null,null,'{}'),
 ('close','Espace commun · en dernier',9,'Coup d’éponge sur la table et le plan de travail',null,null,null,'{}'),
 ('close','Espace commun · en dernier',10,'Éteindre toutes les lumières',null,null,null,'{}'),
 ('close','Espace commun · en dernier',11,'Activer l’alarme (badge Verisure)',null,null,null,array['alarme']),
 ('close','Espace commun · en dernier',12,'Fermer le rideau métallique',null,null,null,'{}'),
 ('close','Espace commun · en dernier',13,'Fermer la porte d’entrée et vérifier qu’elle est bien verrouillée',null,null,null,'{}');

-- ---------- Textes libres du site (titres, phrases) modifiables ou masquables
create table public.site_texts (
  key text primary key,
  value text not null default '',
  hidden boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.site_texts enable row level security;
create policy "équipe lit" on public.site_texts for select to authenticated using (public.is_team());
create policy "admin modifie" on public.site_texts for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter publication supabase_realtime add table public.studio_items, public.studio_days;

-- ---------- Journal de toutes les coches et décoches (visible par l'administrateur seulement)
create table public.check_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  member_id uuid references public.team_members(id),
  action text not null check (action in ('coché','décoché')),
  kind text not null check (kind in ('rangement','tâche')),
  day date not null,
  phase text,
  item_id text not null,
  label text
);
alter table public.check_log enable row level security;
create policy "admin lit le journal" on public.check_log for select to authenticated using (public.is_admin());

create or replace function public.log_studio_check() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record; d date;
begin
  if tg_op = 'INSERT' then r := new; else r := old; end if;
  select case when r.phase = 'soir' then evening_date else morning_date end into d from public.studio_cycles where id = r.cycle_id;
  insert into public.check_log (member_id, action, kind, day, phase, item_id, label)
  values (public.my_member_id(), case when tg_op = 'INSERT' then 'coché' else 'décoché' end, 'rangement', coalesce(d, public.paris_today()), r.phase, r.item_id,
          (select label from public.studio_items where id = r.item_id));
  return null;
end $$;
create trigger log_studio_check after insert or delete on public.studio_checks for each row execute function public.log_studio_check();

create or replace function public.log_day_check() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if tg_op = 'INSERT' then r := new; else r := old; end if;
  insert into public.check_log (member_id, action, kind, day, phase, item_id, label)
  values (public.my_member_id(), case when tg_op = 'INSERT' then 'coché' else 'décoché' end, 'tâche', r.day, null, r.item_id,
          (select label from public.studio_items where id = r.item_id));
  return null;
end $$;
create trigger log_day_check after insert or delete on public.studio_day_checks for each row execute function public.log_day_check();

create view public.check_log_view with (security_invoker = true) as
select l.id, l.at, public.member_name(l.member_id) as who, l.action, l.kind, l.day, l.phase, l.item_id, l.label
from public.check_log l;
