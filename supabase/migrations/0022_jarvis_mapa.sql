-- =====================================================================
-- Brixx Hub — 0022: modo mapa de Jarvis y búsqueda de negocios por zona
-- - jarvis_busquedas: lo que Jarvis encontró al pedirle "buscame
--   hamburgueserías en Yerba Buena" (OpenStreetMap + búsqueda web), con
--   su ubicación para marcarlo en el mapa. La escribe la función
--   "asistente"; los socios la leen y marcan qué lugares sumaron al
--   pipeline (columna lugares).
-- - ajustes.mapa_clave: clave pública de MapTiler para la imagen
--   satelital, el relieve y los edificios en 3D (sin clave, el mapa usa
--   calles y edificios de OpenFreeMap). Se carga en /jarvis → Mapa.
-- Idempotente.
-- =====================================================================

create table if not exists public.jarvis_busquedas (
  id          uuid primary key default gen_random_uuid(),
  usuario     text not null,                 -- email del socio que la pidió
  rubro       text not null,                 -- "hamburgueserías"
  zona        text not null,                 -- "Yerba Buena, Tucumán"
  centro      jsonb,                         -- {lat, lng, bbox: [sur, oeste, norte, este]}
  lugares     jsonb not null default '[]',   -- [{nombre, lat, lng, direccion, telefono, web, instagram, horario, fuente, prospecto_id}]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists jarvis_busquedas_fecha_idx on public.jarvis_busquedas (created_at desc);

drop trigger if exists jarvis_busquedas_updated_at on public.jarvis_busquedas;
create trigger jarvis_busquedas_updated_at
  before update on public.jarvis_busquedas
  for each row execute function public.set_updated_at();

alter table public.jarvis_busquedas enable row level security;

drop policy if exists "jarvis_busquedas_leer" on public.jarvis_busquedas;
create policy "jarvis_busquedas_leer" on public.jarvis_busquedas
  for select to authenticated
  using (public.es_miembro());

-- Los socios solo pueden actualizar la lista de lugares (para marcar los que sumaron al pipeline)
drop policy if exists "jarvis_busquedas_marcar" on public.jarvis_busquedas;
create policy "jarvis_busquedas_marcar" on public.jarvis_busquedas
  for update to authenticated
  using (public.es_miembro())
  with check (public.es_miembro());

drop policy if exists "jarvis_busquedas_borrar" on public.jarvis_busquedas;
create policy "jarvis_busquedas_borrar" on public.jarvis_busquedas
  for delete to authenticated
  using (public.es_miembro());

revoke all on public.jarvis_busquedas from anon, authenticated;
grant select, delete on public.jarvis_busquedas to authenticated;
grant update (lugares) on public.jarvis_busquedas to authenticated;

alter table public.ajustes add column if not exists mapa_clave text;
