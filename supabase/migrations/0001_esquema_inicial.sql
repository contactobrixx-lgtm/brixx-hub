-- =====================================================================
-- Brixx Hub — esquema inicial
-- Pegar completo en Supabase → SQL Editor → Run.
-- Se puede volver a correr sin romper nada (es idempotente).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Miembros: quién puede usar el hub
-- ---------------------------------------------------------------------
create table if not exists public.miembros (
  email      text primary key,
  nombre     text not null,
  created_at timestamptz not null default now()
);

-- ¿El usuario logueado está en la tabla miembros?
-- security definer: puede leer miembros aunque RLS esté activo.
create or replace function public.es_miembro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.miembros
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.es_miembro() from public;
grant execute on function public.es_miembro() to authenticated;

-- ---------------------------------------------------------------------
-- 2. Trigger genérico para updated_at
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Fichas: sistemas de gestión y demos web
-- ---------------------------------------------------------------------
create table if not exists public.fichas (
  id            uuid primary key default gen_random_uuid(),
  seccion       text not null check (seccion in ('sistema', 'demo')),
  nombre        text not null,
  cliente       text,
  categoria     text,
  descripcion   text,
  url           text not null,
  imagen_path   text,  -- ruta dentro del bucket "capturas"
  modo_apertura text not null default 'iframe' check (modo_apertura in ('iframe', 'pestana')),
  estado        text not null default 'activo' check (estado in ('activo', 'en_desarrollo', 'archivado')),
  etiquetas     text[] not null default '{}',
  orden         integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists fichas_seccion_idx on public.fichas (seccion, orden);

drop trigger if exists fichas_updated_at on public.fichas;
create trigger fichas_updated_at
  before update on public.fichas
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. Prospectos: pipeline comercial
-- ---------------------------------------------------------------------
create table if not exists public.prospectos (
  id                   uuid primary key default gen_random_uuid(),
  nombre               text not null,
  empresa              text,
  rubro                text,
  telefono             text,
  email                text,
  etapa                text not null default 'contacto'
                       check (etapa in ('contacto', 'reunion', 'demo', 'propuesta', 'cerrado', 'perdido')),
  valor_estimado       numeric(14, 2),
  moneda               text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  responsable          text,
  proxima_accion       text,
  fecha_proxima_accion date,
  ficha_demo_id        uuid references public.fichas (id) on delete set null,
  motivo_perdida       text,
  notas                text,
  orden                double precision not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists prospectos_etapa_idx on public.prospectos (etapa, orden);

drop trigger if exists prospectos_updated_at on public.prospectos;
create trigger prospectos_updated_at
  before update on public.prospectos
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 5. Seguridad (RLS): solo miembros
-- ---------------------------------------------------------------------
alter table public.miembros   enable row level security;
alter table public.fichas     enable row level security;
alter table public.prospectos enable row level security;

-- miembros: solo lectura desde la app (se edita desde el panel de Supabase)
drop policy if exists "miembros_lectura" on public.miembros;
create policy "miembros_lectura" on public.miembros
  for select to authenticated using (public.es_miembro());

drop policy if exists "fichas_miembros" on public.fichas;
create policy "fichas_miembros" on public.fichas
  for all to authenticated
  using (public.es_miembro()) with check (public.es_miembro());

drop policy if exists "prospectos_miembros" on public.prospectos;
create policy "prospectos_miembros" on public.prospectos
  for all to authenticated
  using (public.es_miembro()) with check (public.es_miembro());

-- ---------------------------------------------------------------------
-- 6. Storage: bucket privado para las capturas de las fichas
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('capturas', 'capturas', false, 5242880,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists "capturas_lectura" on storage.objects;
create policy "capturas_lectura" on storage.objects
  for select to authenticated
  using (bucket_id = 'capturas' and public.es_miembro());

drop policy if exists "capturas_subida" on storage.objects;
create policy "capturas_subida" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'capturas' and public.es_miembro());

drop policy if exists "capturas_edicion" on storage.objects;
create policy "capturas_edicion" on storage.objects
  for update to authenticated
  using (bucket_id = 'capturas' and public.es_miembro());

drop policy if exists "capturas_borrado" on storage.objects;
create policy "capturas_borrado" on storage.objects
  for delete to authenticated
  using (bucket_id = 'capturas' and public.es_miembro());

-- =====================================================================
-- 7. ¡EDITÁ ESTO! Los emails de los dos socios.
--    Tienen que ser exactamente los mismos con los que crean el usuario
--    en Authentication → Users.
-- =====================================================================
insert into public.miembros (email, nombre) values
  ('tu-email@ejemplo.com',    'Tu nombre'),
  ('email-socio@ejemplo.com', 'Nombre de tu socio')
on conflict (email) do update set nombre = excluded.nombre;
