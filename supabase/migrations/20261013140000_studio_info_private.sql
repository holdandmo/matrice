-- Infos sensibles (code de la porte) : lues seulement après connexion, jamais écrites dans le code du site.
create table public.studio_info (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.studio_info enable row level security;
create policy "équipe lit" on public.studio_info for select to authenticated using (public.is_team());
create policy "admin modifie" on public.studio_info for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- valeur saisie directement dans Supabase (table studio_info, clé door_code)
