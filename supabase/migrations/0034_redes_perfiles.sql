-- =====================================================================
-- Brixx Hub — 0034: Instagram con la API de Meta
-- redes_perfiles: cada vez que el hub (o Jarvis, o un agente) lee una cuenta
-- de Instagram por la API de Meta, guarda la foto del momento: datos del
-- perfil (seguidores, bio, últimas publicaciones) y métricas calculadas
-- (frecuencia, interacción, formatos, mejores publicaciones). Así se ve cómo
-- evoluciona una cuenta y se compara con la vez anterior.
-- Se vincula a la carpeta (prospecto_id) si el usuario coincide con su Instagram.
-- La escriben las funciones; los socios la leen y la borran.
-- Idempotente.
-- =====================================================================

create table if not exists public.redes_perfiles (
  id            uuid primary key default gen_random_uuid(),
  prospecto_id  uuid references public.prospectos (id) on delete cascade,
  red           text not null default 'instagram' check (red in ('instagram', 'facebook')),
  usuario       text not null,
  datos         jsonb not null default '{}',
  metricas      jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create index if not exists redes_perfiles_usuario_idx on public.redes_perfiles (red, usuario, created_at desc);
create index if not exists redes_perfiles_prospecto_idx on public.redes_perfiles (prospecto_id, created_at desc);

alter table public.redes_perfiles enable row level security;

drop policy if exists "redes_perfiles_leer" on public.redes_perfiles;
create policy "redes_perfiles_leer" on public.redes_perfiles
  for select to authenticated
  using (public.es_miembro());

drop policy if exists "redes_perfiles_borrar" on public.redes_perfiles;
create policy "redes_perfiles_borrar" on public.redes_perfiles
  for delete to authenticated
  using (public.es_miembro());

revoke all on public.redes_perfiles from anon, authenticated;
grant select, delete on public.redes_perfiles to authenticated;
