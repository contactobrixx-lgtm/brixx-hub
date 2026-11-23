-- =====================================================================
-- Brixx Hub — 0029: link público de la propuesta
-- Para mandarle la propuesta al cliente por WhatsApp: un link que se abre sin
-- iniciar sesión (/p/<token>), con todas las hojas y el video andando.
-- - cotizaciones.token_publico: se genera al tocar "Link para el cliente";
--   sin token, la propuesta no es pública. Es un uuid al azar (no se adivina)
--   y se puede regenerar o borrar desde el hub para cortar el acceso.
-- - propuesta_publica(token): devuelve solo lo que se ve en la propuesta
--   (sin mail ni teléfono del cliente). La puede llamar cualquiera que tenga
--   el token; el resto de la base sigue protegido por RLS.
-- Idempotente.
-- =====================================================================

alter table public.cotizaciones add column if not exists token_publico uuid;
create unique index if not exists cotizaciones_token_publico_idx on public.cotizaciones (token_publico) where token_publico is not null;

create or replace function public.propuesta_publica(t uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', c.id,
    'numero', c.numero,
    'titulo', c.titulo,
    'estado', c.estado,
    'fecha', c.fecha,
    'valida_hasta', c.valida_hasta,
    'moneda', c.moneda,
    'descuento_pct', c.descuento_pct,
    'notas', c.notas,
    'introduccion', c.introduccion,
    'video_url', c.video_url,
    'etapas', c.etapas,
    'propuesta', c.propuesta,
    'prospectos', jsonb_build_object('nombre', p.nombre, 'empresa', p.empresa),
    'cotizacion_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'descripcion', i.descripcion, 'cantidad', i.cantidad,
        'precio_implementacion', i.precio_implementacion, 'precio_mensual', i.precio_mensual,
        'orden', i.orden, 'etapa', i.etapa, 'opcional', i.opcional,
        'resumen', i.resumen, 'incluye', i.incluye, 'entregable', i.entregable
      ) order by i.orden)
      from public.cotizacion_items i where i.cotizacion_id = c.id
    ), '[]'::jsonb)
  )
  from public.cotizaciones c
  left join public.prospectos p on p.id = c.prospecto_id
  where t is not null and c.token_publico = t
$$;

revoke all on function public.propuesta_publica(uuid) from public;
grant execute on function public.propuesta_publica(uuid) to anon, authenticated;
