-- =====================================================================
-- Brixx Hub — 0018: agentes de Jarvis (preparador de reuniones, postventa,
-- monitor de sistemas y demos, cobranzas; después se suman más)
-- - agentes_config: un registro por agente (prendido/apagado, hora, última corrida).
-- - agentes_informes: lo que entrega cada agente (brief, alertas, mensajes redactados).
-- - fichas: estado del último chequeo del monitor (en línea / caída).
-- - privado.config: token interno para que el programador de la base llame a la
--   función "agentes" sin sesión (no lo ve nadie: el esquema no se expone).
-- - pg_cron + pg_net (si el proyecto los tiene): cada 15 minutos llama a la función.
--   Si no están, los agentes programados corren igual cuando alguien abre el hub.
-- Los agentes solo LEEN el hub y escriben sus informes: nunca mandan nada a un
-- cliente ni cambian datos. Idempotente.
-- =====================================================================

create table if not exists public.agentes_config (
  agente          text primary key,
  activo          boolean not null default true,
  hora            integer not null default 8 check (hora between 0 and 23),  -- hora de Argentina (agentes diarios/semanales)
  ultima_corrida  timestamptz,
  ultimo_estado   text,
  updated_at      timestamptz not null default now()
);

insert into public.agentes_config (agente) values ('preparador'), ('postventa'), ('monitor'), ('cobranzas')
on conflict (agente) do nothing;

create table if not exists public.agentes_informes (
  id            uuid primary key default gen_random_uuid(),
  agente        text not null,
  clave         text unique,                 -- evita repetir el mismo informe (ej. "preparador:<reunion>")
  titulo        text not null,
  resumen       text,                        -- 1 o 2 oraciones (para Jarvis y la voz)
  contenido     text,                        -- el informe completo, en texto plano
  datos         jsonb not null default '{}'::jsonb,  -- estructura extra (mensajes redactados, alertas…)
  prospecto_id  uuid references public.prospectos (id) on delete set null,
  reunion_id    uuid references public.reuniones (id) on delete cascade,
  estado        text not null default 'lista' check (estado in ('trabajando', 'lista', 'error')),
  error         text,
  leido         boolean not null default false,
  pedido_por    text,                        -- email del socio, o null si fue programado
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists agentes_informes_created_idx on public.agentes_informes (created_at desc);
create index if not exists agentes_informes_agente_idx on public.agentes_informes (agente, created_at desc);

alter table public.fichas add column if not exists en_linea boolean;
alter table public.fichas add column if not exists chequeo_at timestamptz;
alter table public.fichas add column if not exists chequeo_detalle text;

do $$
declare t text;
begin
  foreach t in array array['agentes_config', 'agentes_informes'] loop
    execute format('drop trigger if exists %1$s_updated_at on public.%1$s', t);
    execute format('create trigger %1$s_updated_at before update on public.%1$s for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%1$s enable row level security', t);
  end loop;
end $$;

-- Configuración: los socios la ven y prenden/apagan agentes o cambian la hora
drop policy if exists "agentes_config_ver" on public.agentes_config;
create policy "agentes_config_ver" on public.agentes_config for select to authenticated using (public.es_miembro());
drop policy if exists "agentes_config_editar" on public.agentes_config;
create policy "agentes_config_editar" on public.agentes_config for update to authenticated using (public.es_miembro()) with check (public.es_miembro());
revoke insert, update, delete on public.agentes_config from authenticated, anon;
grant select on public.agentes_config to authenticated;
grant update (activo, hora) on public.agentes_config to authenticated;

-- Informes: los socios los leen, los marcan como leídos y los borran. Los escribe la función.
drop policy if exists "agentes_informes_ver" on public.agentes_informes;
create policy "agentes_informes_ver" on public.agentes_informes for select to authenticated using (public.es_miembro());
drop policy if exists "agentes_informes_marcar" on public.agentes_informes;
create policy "agentes_informes_marcar" on public.agentes_informes for update to authenticated using (public.es_miembro()) with check (public.es_miembro());
drop policy if exists "agentes_informes_borrar" on public.agentes_informes;
create policy "agentes_informes_borrar" on public.agentes_informes for delete to authenticated using (public.es_miembro());
revoke insert, update on public.agentes_informes from authenticated, anon;
grant select, delete on public.agentes_informes to authenticated;
grant update (leido) on public.agentes_informes to authenticated;

-- ---------------------------------------------------------------------
-- Token interno y dirección de las funciones (para el programador de la base)
-- ---------------------------------------------------------------------
create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

create table if not exists privado.config (
  id             boolean primary key default true check (id),
  token          text not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  url_funciones  text
);
insert into privado.config (id) values (true) on conflict (id) do nothing;
revoke all on privado.config from public, anon, authenticated;

-- La función "agentes" valida el token que le manda el programador
create or replace function public.agentes_token_valido(t text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from privado.config where token = t and length(t) >= 32)
$$;

-- La función "agentes" deja anotada su dirección la primera vez que la llaman desde el hub
create or replace function public.agentes_guardar_url(u text)
returns void language sql security definer set search_path = '' as $$
  update privado.config set url_funciones = u where url_funciones is distinct from u
$$;

-- Lo que corre el programador cada 15 minutos: le avisa a la función que revise qué toca
create or replace function public.agentes_tic()
returns void language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  select token, url_funciones into c from privado.config limit 1;
  if c.url_funciones is null then return; end if;
  perform net.http_post(
    url := c.url_funciones || '/agentes',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-agentes-token', c.token),
    body := '{"accion":"tic"}'::jsonb,
    timeout_milliseconds := 5000
  );
end $$;

-- ¿Está andando el programador? (para mostrarlo en el hub)
create or replace function public.agentes_programados()
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_miembro() then return false; end if;
  return exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net')
     and to_regclass('cron.job') is not null
     and exists (select 1 from cron.job where jobname = 'brixx-agentes');
exception when others then return false;
end $$;

revoke all on function public.agentes_token_valido(text) from public, anon, authenticated;
revoke all on function public.agentes_guardar_url(text) from public, anon, authenticated;
revoke all on function public.agentes_tic() from public, anon, authenticated;
grant execute on function public.agentes_token_valido(text) to service_role;
grant execute on function public.agentes_guardar_url(text) to service_role;
grant execute on function public.agentes_programados() to authenticated;

-- Programador (pg_cron + pg_net). Si el proyecto no los permite, se sigue sin él.
do $$
begin
  begin
    create extension if not exists pg_net with schema extensions;
  exception when others then raise notice 'pg_net no disponible: %', sqlerrm;
  end;
  begin
    create extension if not exists pg_cron;
  exception when others then raise notice 'pg_cron no disponible: %', sqlerrm;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    begin
      perform cron.schedule('brixx-agentes', '*/15 * * * *', 'select public.agentes_tic()');
    exception when others then raise notice 'No se pudo programar: %', sqlerrm;
    end;
  end if;
end $$;
