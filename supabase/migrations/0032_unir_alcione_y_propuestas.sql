-- =====================================================================
-- Brixx Hub — 0032: una sola carpeta de Alcione + video de las propuestas
-- 1) Había dos carpetas ("Alcione" y "Alcione Deco"). Se juntan en la que
--    tiene la propuesta COT-0004 (si no, la más avanzada en el pipeline o
--    la más vieja):
--    - todo lo que apuntaba a la otra (cotizaciones, grabaciones, reuniones,
--      cobros, videos, informes…) pasa a la que queda; se busca en todas las
--      claves foráneas a prospectos y en los jsonb que la nombran;
--    - los datos vacíos se completan con los de la otra, las notas se suman,
--      queda la etapa más avanzada y la síntesis más nueva;
--    - después se borra la carpeta repetida.
--    Solo actúa si hay exactamente dos carpetas de Alcione.
-- 2) cotizaciones.video_id: el video del hub que va en la propuesta (el MP4
--    guardado). Sin video_id ni video_url va el último video guardado del
--    cliente (propuesta.sin_video = true lo saca).
-- Idempotente.
-- =====================================================================

alter table public.cotizaciones add column if not exists video_id uuid references public.videos (id) on delete set null;

do $$
declare
  ids uuid[];
  queda uuid;
  sale uuid;
  r record;
  orden_etapas text[] := array['perdido', 'contacto', 'reunion', 'demo', 'propuesta', 'cerrado', 'implementacion', 'mantenimiento'];
begin
  select array_agg(id order by created_at) into ids
  from public.prospectos
  where public.nombre_comparable(coalesce(empresa, '')) like 'alcione%'
     or public.nombre_comparable(nombre) like 'alcione%';
  if coalesce(array_length(ids, 1), 0) <> 2 then
    return;
  end if;

  -- La que queda: la de la COT-0004; si no, la más avanzada; si no, la más vieja
  select p.id into queda
  from public.prospectos p
  where p.id = any (ids)
  order by
    exists (select 1 from public.cotizaciones c where c.prospecto_id = p.id and c.titulo ilike 'Bot con IA, automatizaciones y panel de gesti%n%') desc,
    array_position(orden_etapas, p.etapa) desc nulls last,
    p.created_at
  limit 1;
  sale := case when ids[1] = queda then ids[2] else ids[1] end;

  -- Etapa más avanzada, notas sumadas, síntesis más nueva
  update public.prospectos k
  set etapa = case when array_position(orden_etapas, d.etapa) > array_position(orden_etapas, k.etapa) then d.etapa else k.etapa end,
      notas = nullif(concat_ws(E'\n\n', nullif(k.notas, ''), nullif(d.notas, '')), ''),
      sintesis = case when d.sintesis_at > coalesce(k.sintesis_at, '-infinity') then d.sintesis else k.sintesis end,
      sintesis_at = greatest(k.sintesis_at, d.sintesis_at)
  from public.prospectos d
  where k.id = queda and d.id = sale;

  update public.prospectos k
  set fecha_cierre = least(k.fecha_cierre, d.fecha_cierre)
  from public.prospectos d
  where k.id = queda and d.id = sale and d.fecha_cierre is not null;

  -- Datos vacíos: se completan con los de la otra carpeta
  for r in
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'prospectos'
      and column_name not in ('id', 'created_at', 'updated_at', 'orden', 'etapa', 'notas', 'sintesis', 'sintesis_at', 'fecha_cierre')
      and is_generated = 'NEVER'
  loop
    execute format(
      'update public.prospectos k set %1$I = d.%1$I from public.prospectos d
       where k.id = $1 and d.id = $2 and (k.%1$I is null or k.%1$I::text = '''') and d.%1$I is not null',
      r.column_name) using queda, sale;
  end loop;

  -- Todo lo que apuntaba a la carpeta repetida pasa a la que queda
  for r in
    select c.conrelid::regclass as tabla, a.attname as columna
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.prospectos'::regclass and array_length(c.conkey, 1) = 1
  loop
    execute format('update %s set %I = $1 where %I = $2', r.tabla, r.columna, r.columna) using queda, sale;
  end loop;

  -- Y en los jsonb que la nombran (mensajes de los agentes, búsquedas del mapa, acciones de Jarvis…)
  for r in
    select table_name, column_name from information_schema.columns
    where table_schema = 'public' and data_type = 'jsonb'
      and table_name in (select tablename from pg_tables where schemaname = 'public')
  loop
    execute format(
      'update public.%1$I set %2$I = replace(%2$I::text, $2::text, $1::text)::jsonb where strpos(%2$I::text, $2::text) > 0',
      r.table_name, r.column_name) using queda, sale;
  end loop;

  delete from public.prospectos where id = sale;
end $$;

-- El video que va en una propuesta: el elegido (video_id) o el último guardado del cliente
-- (para el cliente o para que lo muestre). Nada si la propuesta tiene un link de video propio
-- (video_url) o propuesta.sin_video. Solo videos ya grabados (archivo_path).
create or replace function public.video_de_cotizacion(cot uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select v.id from public.videos v where v.id = c.video_id and v.archivo_path is not null),
    (select v.id from public.videos v
     where c.video_id is null and v.prospecto_id = c.prospecto_id and v.archivo_path is not null
       and v.estado = 'listo' and coalesce(v.enfoque, 'cliente') in ('cliente', 'equipo')
     order by (coalesce(v.enfoque, 'cliente') = 'cliente') desc, v.created_at desc
     limit 1)
  )
  from public.cotizaciones c
  where c.id = cot
    and nullif(c.video_url, '') is null
    and coalesce((c.propuesta ->> 'sin_video')::boolean, false) = false
$$;
revoke all on function public.video_de_cotizacion(uuid) from public, anon;
grant execute on function public.video_de_cotizacion(uuid) to authenticated, service_role;
