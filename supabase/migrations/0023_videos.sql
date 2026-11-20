-- =====================================================================
-- Brixx Hub — 0023: videos explicativos para clientes
-- - videos: después de una reunión grabada o una intervención (audio o
--   texto), un socio pide "Generar video" y la función "videos" arma el
--   guion con Claude (escenas: apertura, charlas de WhatsApp, cómo
--   funciona, beneficios, cierre) y la voz con ElevenLabs (un MP3 por
--   escena, con los tiempos de cada palabra para los subtítulos).
--   El hub lo dibuja en un lienzo y lo descarga como video.
--   La escribe la función; los socios la leen y la borran.
-- - Bucket privado "videos": los audios de cada escena ({video}/escena-N.mp3).
-- Idempotente.
-- =====================================================================

create table if not exists public.videos (
  id            uuid primary key default gen_random_uuid(),
  prospecto_id  uuid references public.prospectos (id) on delete cascade,
  grabacion_id  uuid references public.grabaciones (id) on delete set null,
  titulo        text not null default 'Video explicativo',
  estado        text not null default 'guion'
                check (estado in ('guion', 'voz', 'listo', 'error')),
  error         text,
  guion         jsonb,                        -- {cliente, etiqueta, escenas: [{tipo, narracion, ...}]}
  audios        jsonb not null default '[]',  -- [{escena, path, duracion, palabras: [{w, s, e}]}]
  con_voz       boolean not null default false,
  pedido_por    text,                         -- email del socio
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists videos_prospecto_idx on public.videos (prospecto_id, created_at desc);
create index if not exists videos_grabacion_idx on public.videos (grabacion_id, created_at desc);

drop trigger if exists videos_updated_at on public.videos;
create trigger videos_updated_at
  before update on public.videos
  for each row execute function public.set_updated_at();

alter table public.videos enable row level security;

drop policy if exists "videos_leer" on public.videos;
create policy "videos_leer" on public.videos
  for select to authenticated
  using (public.es_miembro());

drop policy if exists "videos_borrar" on public.videos;
create policy "videos_borrar" on public.videos
  for delete to authenticated
  using (public.es_miembro());

revoke all on public.videos from anon, authenticated;
grant select, delete on public.videos to authenticated;

-- Audios de los videos (los sube la función; los socios los leen y los borran)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', false, 20971520, array['audio/mpeg'])
on conflict (id) do nothing;

drop policy if exists "videos_audio_lectura" on storage.objects;
create policy "videos_audio_lectura" on storage.objects
  for select to authenticated
  using (bucket_id = 'videos' and public.es_miembro());

drop policy if exists "videos_audio_borrado" on storage.objects;
create policy "videos_audio_borrado" on storage.objects
  for delete to authenticated
  using (bucket_id = 'videos' and public.es_miembro());
