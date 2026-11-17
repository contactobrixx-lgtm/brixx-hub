-- =====================================================================
-- Brixx Hub — 0014: memoria de Jarvis
-- - jarvis_memoria: notas que Jarvis guarda cuando le dicen "recordá que…"
--   o cuando sale un dato que vale la pena tener siempre presente. Las ven
--   los dos socios (es memoria del estudio) y se pueden borrar desde /jarvis.
-- - asistente_mensajes: la conversación con Jarvis, para que se acuerde de
--   lo que se habló aunque se cierre la pestaña o se cambie de equipo.
--   Cada socio ve solo la suya.
-- Las escribe la Edge Function "asistente". Idempotente.
-- =====================================================================

create table if not exists public.jarvis_memoria (
  id          uuid primary key default gen_random_uuid(),
  contenido   text not null check (length(trim(contenido)) > 0),
  creado_por  text,              -- nombre del socio que lo pidió
  created_at  timestamptz not null default now()
);

create index if not exists jarvis_memoria_created_idx on public.jarvis_memoria (created_at desc);

alter table public.jarvis_memoria enable row level security;
drop policy if exists "jarvis_memoria_miembros" on public.jarvis_memoria;
create policy "jarvis_memoria_miembros" on public.jarvis_memoria
  for all to authenticated
  using (public.es_miembro()) with check (public.es_miembro());

create table if not exists public.asistente_mensajes (
  id          uuid primary key default gen_random_uuid(),
  usuario     text not null,     -- email del socio
  rol         text not null check (rol in ('usuario', 'asistente')),
  texto       text not null,
  consultas   text[] not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists asistente_mensajes_usuario_idx on public.asistente_mensajes (lower(usuario), created_at desc);

alter table public.asistente_mensajes enable row level security;
drop policy if exists "asistente_mensajes_propios" on public.asistente_mensajes;
create policy "asistente_mensajes_propios" on public.asistente_mensajes
  for all to authenticated
  using (public.es_miembro() and lower(usuario) = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (public.es_miembro() and lower(usuario) = lower(coalesce(auth.jwt() ->> 'email', '')));
