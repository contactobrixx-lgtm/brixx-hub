-- =====================================================================
-- Brixx Hub — 0035: el pipeline pasa de 8 a 5 etapas
--
--   contacto → propuesta → demo → implementacion → mantenimiento  (+ perdido)
--
-- La propuesta se manda antes de diseñar demos: si la aceptan, el cliente
-- pasa a "demo" (se diseñan las demos). Desde "demo" en adelante es un
-- cliente ganado. "perdido" sigue existiendo pero no es columna del tablero.
--
-- - "reunion" se junta con "contacto" y "cerrado" con "demo" (al final de
--   cada columna, en el orden que tenían).
-- - fecha_cierre: "ganado" ahora es demo, implementacion o mantenimiento.
-- - Vincular una demo a un prospecto ya no lo mueve de etapa (las demos
--   vienen después de la propuesta); la ficha se sigue vinculando sola.
-- Idempotente.
-- =====================================================================

-- 1. Cliente ganado = demo, implementación o mantenimiento.
--    (va antes de mover datos para que "cerrado" → "demo" no borre la fecha)
create or replace function public.set_fecha_cierre()
returns trigger
language plpgsql
as $$
declare
  ganadas text[] := array['demo', 'implementacion', 'mantenimiento'];
begin
  if new.etapa = any (ganadas) then
    if new.fecha_cierre is null then
      new.fecha_cierre := current_date;
    end if;
  elsif new.etapa <> 'perdido' then
    -- volvió a una etapa abierta: todavía no es cliente
    new.fecha_cierre := null;
  end if;
  return new;
end;
$$;

-- 2. Mover los datos: reunion → contacto, cerrado → demo (al final de la columna)
do $$
declare
  v_par  text[];
  v_base double precision;
  r      record;
  i      integer;
begin
  foreach v_par slice 1 in array array[array['reunion', 'contacto'], array['cerrado', 'demo']] loop
    select coalesce(max(orden), 0) into v_base from public.prospectos where etapa = v_par[2];
    i := 0;
    for r in select id from public.prospectos where etapa = v_par[1] order by orden, created_at loop
      i := i + 1;
      update public.prospectos set etapa = v_par[2], orden = v_base + i where id = r.id;
    end loop;
  end loop;
end $$;

-- 3. Solo las 5 etapas + perdido
alter table public.prospectos drop constraint if exists prospectos_etapa_check;
alter table public.prospectos add constraint prospectos_etapa_check
  check (etapa in ('contacto', 'propuesta', 'demo', 'implementacion', 'mantenimiento', 'perdido'));

-- 4. Una demo vinculada ya no mueve la etapa (solo se vincula la ficha)
drop trigger if exists prospectos_a_demo on public.prospectos;
drop function if exists public.prospecto_a_demo();

create or replace function public.vincular_demo(p_ficha uuid)
returns void
language plpgsql
as $$
declare
  v_cliente text;
  v_ids     uuid[];
begin
  select public.nombre_comparable(cliente) into v_cliente
    from public.fichas
   where id = p_ficha and seccion = 'demo' and estado <> 'archivado';

  -- Muy corto para comparar sin riesgo de confundir clientes
  if v_cliente is null or length(v_cliente) < 4 then
    return;
  end if;

  select array_agg(id) into v_ids
    from public.prospectos
   where etapa <> 'perdido'
     and (public.nombre_comparable(empresa) like v_cliente || '%'
          or public.nombre_comparable(nombre) like v_cliente || '%');

  -- Solo si el cliente es inequívoco y no tenía demo propia
  if coalesce(array_length(v_ids, 1), 0) <> 1 then
    return;
  end if;

  update public.prospectos
     set ficha_demo_id = p_ficha
   where id = v_ids[1] and ficha_demo_id is null;
end;
$$;

-- 5. Acciones de Jarvis sin confirmar que movían a una etapa que ya no existe
update public.jarvis_acciones
   set estado = 'cancelada'
 where estado = 'pendiente'
   and tipo = 'mover_etapa'
   and datos ->> 'etapa' in ('reunion', 'cerrado');
