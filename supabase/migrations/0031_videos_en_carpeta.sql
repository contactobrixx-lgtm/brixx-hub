-- =====================================================================
-- Brixx Hub — 0031: los videos no se pierden, quedan en la carpeta del cliente
-- - videos.archivo_path: el MP4 (o WebM) ya grabado. Al tocar "Descargar" en
--   el hub, además de bajarlo se sube a Storage ({video}/video.mp4), así queda
--   en la carpeta del cliente para volver a bajarlo o mandarlo sin rearmarlo.
-- - Bucket "videos": acepta también video/mp4 y video/webm, hasta 50 MB.
--   Los socios pueden subir solo el archivo del video ({id}/video.*).
-- - Los socios pueden cambiar solo videos.archivo_path (grant por columna).
-- - Videos de una grabación sin cliente: cuando la grabación (o su reunión)
--   se vincula a un cliente, el video pasa a su carpeta. Se completan los
--   que ya existen.
-- Idempotente.
-- =====================================================================

alter table public.videos add column if not exists archivo_path text;

update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array['audio/mpeg', 'video/mp4', 'video/webm']
where id = 'videos';

drop policy if exists "videos_archivo_subida" on storage.objects;
create policy "videos_archivo_subida" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'videos' and public.es_miembro() and name ~ '^[0-9a-f-]{36}/video\.(mp4|webm)$');

drop policy if exists "videos_archivo_reemplazo" on storage.objects;
create policy "videos_archivo_reemplazo" on storage.objects
  for update to authenticated
  using (bucket_id = 'videos' and public.es_miembro() and name ~ '^[0-9a-f-]{36}/video\.(mp4|webm)$')
  with check (bucket_id = 'videos' and public.es_miembro() and name ~ '^[0-9a-f-]{36}/video\.(mp4|webm)$');

drop policy if exists "videos_guardar_archivo" on public.videos;
create policy "videos_guardar_archivo" on public.videos
  for update to authenticated
  using (public.es_miembro())
  with check (public.es_miembro());

grant update (archivo_path) on public.videos to authenticated;

-- El cliente de una grabación: el suyo o el de su reunión
create or replace function public.cliente_de_grabacion(g_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(g.prospecto_id, r.prospecto_id)
  from public.grabaciones g
  left join public.reuniones r on r.id = g.reunion_id
  where g.id = g_id
$$;
revoke all on function public.cliente_de_grabacion(uuid) from public, anon, authenticated;

-- Videos sin cliente cuya grabación ya tiene uno
update public.videos v
set prospecto_id = public.cliente_de_grabacion(v.grabacion_id)
where v.prospecto_id is null
  and v.grabacion_id is not null
  and public.cliente_de_grabacion(v.grabacion_id) is not null;

-- Al vincular una grabación (o su reunión) a un cliente, sus videos sin cliente pasan a esa carpeta
create or replace function public.videos_siguen_grabacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'grabaciones' then
    update public.videos
    set prospecto_id = public.cliente_de_grabacion(new.id)
    where grabacion_id = new.id
      and prospecto_id is null
      and public.cliente_de_grabacion(new.id) is not null;
  else
    update public.videos v
    set prospecto_id = new.prospecto_id
    from public.grabaciones g
    where g.reunion_id = new.id
      and v.grabacion_id = g.id
      and v.prospecto_id is null
      and g.prospecto_id is null
      and new.prospecto_id is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists grabaciones_videos_cliente on public.grabaciones;
create trigger grabaciones_videos_cliente
  after update of prospecto_id, reunion_id on public.grabaciones
  for each row execute function public.videos_siguen_grabacion();

drop trigger if exists reuniones_videos_cliente on public.reuniones;
create trigger reuniones_videos_cliente
  after update of prospecto_id on public.reuniones
  for each row execute function public.videos_siguen_grabacion();
