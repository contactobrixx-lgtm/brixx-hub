-- =====================================================================
-- Brixx Hub — 0005: grabaciones de reuniones (transcripción + análisis)
-- El audio se graba desde el celular, se guarda en el bucket privado
-- "grabaciones" y la Edge Function "grabaciones" lo transcribe (AssemblyAI)
-- y lo analiza (Claude). Idempotente.
-- =====================================================================

create table if not exists public.grabaciones (
  id               uuid primary key default gen_random_uuid(),
  titulo           text not null,
  reunion_id       uuid references public.reuniones (id) on delete set null,
  prospecto_id     uuid references public.prospectos (id) on delete set null,
  audio_path       text,              -- ruta en el bucket; null cuando se borra a los 90 días
  audio_mime       text,
  duracion_seg     integer,
  estado           text not null default 'pendiente'
                   check (estado in ('pendiente', 'transcribiendo', 'analizando', 'lista', 'error')),
  error            text,              -- motivo legible si algo falló
  proveedor        text not null default 'assemblyai',
  proveedor_id     text,              -- id del trabajo en el proveedor de transcripción
  segmentos        jsonb,             -- [{hablante, inicio_ms, fin_ms, texto}]
  hablantes        jsonb not null default '{}'::jsonb,  -- {"A": "Patricio", "B": "José María"}
  analisis         jsonb,             -- resultado estructurado de Claude
  modelo           text,              -- modelo que hizo el análisis
  grabado_por      text,              -- email del miembro
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists grabaciones_reunion_idx on public.grabaciones (reunion_id);
create index if not exists grabaciones_created_idx on public.grabaciones (created_at desc);

drop trigger if exists grabaciones_updated_at on public.grabaciones;
create trigger grabaciones_updated_at
  before update on public.grabaciones
  for each row execute function public.set_updated_at();

alter table public.grabaciones enable row level security;
drop policy if exists "grabaciones_miembros" on public.grabaciones;
create policy "grabaciones_miembros" on public.grabaciones
  for all to authenticated
  using (public.es_miembro()) with check (public.es_miembro());

-- ---------------------------------------------------------------------
-- Bucket privado para los audios (hasta 50 MB por archivo ≈ 3 h a 32 kbps)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('grabaciones', 'grabaciones', false, 52428800,
        array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/x-m4a', 'audio/wav'])
on conflict (id) do nothing;

drop policy if exists "grabaciones_lectura" on storage.objects;
create policy "grabaciones_lectura" on storage.objects
  for select to authenticated
  using (bucket_id = 'grabaciones' and public.es_miembro());

drop policy if exists "grabaciones_subida" on storage.objects;
create policy "grabaciones_subida" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'grabaciones' and public.es_miembro());

drop policy if exists "grabaciones_borrado" on storage.objects;
create policy "grabaciones_borrado" on storage.objects
  for delete to authenticated
  using (bucket_id = 'grabaciones' and public.es_miembro());
