-- =====================================================================
-- Brixx Hub — 0011: un prospecto pasa solo a "demo" cuando tiene una demo
--
-- Regla: si un prospecto en "contacto" o "reunion" tiene una demo, se mueve
-- solo a la columna "demo" del pipeline (al final). Nunca retrocede a nadie
-- que ya esté en propuesta, ganado o perdido.
--
-- Hay dos formas de que un prospecto "tenga una demo":
--   a) se le vincula una ficha de demo (prospectos.ficha_demo_id);
--   b) se crea o edita una ficha de la sección Demos web cuyo "cliente"
--      coincide con un único prospecto (por empresa o nombre, sin importar
--      mayúsculas, tildes, "@" ni espacios). Esa ficha se vincula sola si el
--      prospecto no tenía ninguna.
--
-- Además corrige a Moritz: ya estaba registrado en "contacto" y la 0010
-- pudo crear un segundo prospecto. Se conserva el original, se le pasan la
-- demo y los datos, y se borra el duplicado si nada lo referencia.
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Nombre comparable: minúsculas, sin tildes y solo letras y números
--    ("@Félix Café" -> "felixcafe")
-- ---------------------------------------------------------------------
create or replace function public.nombre_comparable(t text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      translate(lower(coalesce(t, '')), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'),
      '[^a-z0-9]', '', 'g'),
    '')
$$;

-- ---------------------------------------------------------------------
-- 2. Al vincular una demo a un prospecto abierto, pasa a "demo"
-- ---------------------------------------------------------------------
create or replace function public.prospecto_a_demo()
returns trigger
language plpgsql
as $$
begin
  if new.ficha_demo_id is not null
     and new.etapa in ('contacto', 'reunion')
     and (tg_op = 'INSERT' or old.ficha_demo_id is distinct from new.ficha_demo_id) then
    new.etapa := 'demo';
    new.orden := coalesce((select max(orden) from public.prospectos
                            where etapa = 'demo' and id <> new.id), 0) + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists prospectos_a_demo on public.prospectos;
create trigger prospectos_a_demo
  before insert or update of ficha_demo_id on public.prospectos
  for each row execute function public.prospecto_a_demo();

-- ---------------------------------------------------------------------
-- 3. Vincular una ficha de demo con su prospecto (si hay uno solo)
-- ---------------------------------------------------------------------
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

  -- Solo si el cliente es inequívoco
  if coalesce(array_length(v_ids, 1), 0) <> 1 then
    return;
  end if;

  -- Sin demo propia: se vincula esta (el trigger del punto 2 lo mueve).
  update public.prospectos
     set ficha_demo_id = p_ficha
   where id = v_ids[1] and ficha_demo_id is null;

  -- Ya tenía otra demo: igual pasa a "demo" si seguía abierto.
  update public.prospectos
     set etapa = 'demo',
         orden = coalesce((select max(orden) from public.prospectos where etapa = 'demo'), 0) + 1
   where id = v_ids[1] and etapa in ('contacto', 'reunion');
end;
$$;

create or replace function public.ficha_demo_vincular()
returns trigger
language plpgsql
as $$
begin
  -- Al editar una ficha, solo si cambió algo que afecte el vínculo
  -- (así no se pisa un prospecto que se movió a mano)
  if tg_op = 'UPDATE'
     and old.cliente is not distinct from new.cliente
     and old.seccion = new.seccion
     and old.estado = new.estado then
    return null;
  end if;
  perform public.vincular_demo(new.id);
  return null;
end;
$$;

drop trigger if exists fichas_vincular_demo on public.fichas;
create trigger fichas_vincular_demo
  after insert or update of cliente, seccion, estado on public.fichas
  for each row execute function public.ficha_demo_vincular();

-- ---------------------------------------------------------------------
-- 4. Moritz: unificar con el prospecto que ya existía
-- ---------------------------------------------------------------------
do $$
declare
  v_ficha uuid;
  v_dup   public.prospectos%rowtype;
  v_orig  uuid;
begin
  select id into v_ficha from public.fichas where url = 'https://moritzdigital.netlify.app/' limit 1;
  if v_ficha is null then
    return;
  end if;

  -- El que creó la 0010 (se reconoce por su nota)
  select * into v_dup from public.prospectos
   where notas like 'Demo de carta digital lista (falta subirla a Netlify como moritzdigital%'
   limit 1;

  -- El que ya estaba registrado (el más antiguo que no sea el de la 0010)
  select id into v_orig from public.prospectos
   where (public.nombre_comparable(empresa) like '%moritz%'
          or public.nombre_comparable(nombre) like '%moritz%')
     and id is distinct from v_dup.id
     and etapa <> 'perdido'
   order by created_at
   limit 1;

  if v_dup.id is not null and v_orig is not null then
    -- Pasar la demo y completar solo lo que el original no tenga
    update public.prospectos p
       set ficha_demo_id  = coalesce(p.ficha_demo_id, v_ficha),
           empresa        = coalesce(nullif(p.empresa, ''), v_dup.empresa),
           rubro          = coalesce(nullif(p.rubro, ''), v_dup.rubro),
           proxima_accion = coalesce(nullif(p.proxima_accion, ''), v_dup.proxima_accion),
           notas          = case
                              when coalesce(p.notas, '') like '%moritzdigital%' then p.notas
                              when nullif(p.notas, '') is null then v_dup.notas
                              else p.notas || E'\n\n' || v_dup.notas
                            end
     where p.id = v_orig;

    -- Borrar el duplicado solo si nada lo referencia
    if not exists (select 1 from public.cotizaciones where prospecto_id = v_dup.id)
       and not exists (select 1 from public.cobros      where prospecto_id = v_dup.id)
       and not exists (select 1 from public.reuniones   where prospecto_id = v_dup.id)
       and not exists (select 1 from public.grabaciones where prospecto_id = v_dup.id) then
      delete from public.prospectos where id = v_dup.id;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5. Aplicar la regla a las demos que ya existen
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  -- Prospectos con demo vinculada que siguen en contacto o reunión
  update public.prospectos
     set etapa = 'demo',
         orden = coalesce((select max(orden) from public.prospectos where etapa = 'demo'), 0) + 1
   where ficha_demo_id is not null and etapa in ('contacto', 'reunion');

  -- Fichas de demo sin prospecto vinculado
  for r in select id from public.fichas where seccion = 'demo' and estado <> 'archivado' order by created_at loop
    perform public.vincular_demo(r.id);
  end loop;
end $$;
