#!/usr/bin/env bash
# Aplica en Supabase las migraciones de supabase/migrations que falten.
#
# Uso:  aplicar-migraciones.sh [--dry-run]
# Necesita: SUPABASE_DB_URL (connection string del Session pooler) y la CLI de supabase.
#
# Caso especial: la 0001 se corrió a mano en el SQL Editor, así que no figura en el
# historial de la CLI (supabase_migrations.schema_migrations). Si sus tablas ya
# existen y no está registrada, se marca como aplicada en vez de volver a correrla.
set -euo pipefail

: "${SUPABASE_DB_URL:?Falta el secret SUPABASE_DB_URL}"
DRY_RUN="${1:-}"
URL="$SUPABASE_DB_URL"

sql() { psql "$URL" -v ON_ERROR_STOP=1 -tAc "$1"; }

echo "▸ Revisando historial de migraciones…"
hay_historial=$(sql "select to_regclass('supabase_migrations.schema_migrations') is not null")
cero_uno_registrada=f
if [ "$hay_historial" = "t" ]; then
  cero_uno_registrada=$(sql "select exists (select 1 from supabase_migrations.schema_migrations where version = '0001')")
fi
esquema_existe=$(sql "select to_regclass('public.miembros') is not null and to_regclass('public.fichas') is not null and to_regclass('public.prospectos') is not null")

saltear_0001=f
if [ "$esquema_existe" = "t" ] && [ "$cero_uno_registrada" = "f" ]; then
  saltear_0001=t
  if [ "$DRY_RUN" = "--dry-run" ]; then
    echo "  (dry-run) La 0001 ya está aplicada a mano: se marcaría como aplicada sin volver a correrla."
  else
    echo "  La 0001 ya estaba aplicada a mano: se registra como aplicada (no se vuelve a correr)."
    supabase migration repair 0001 --status applied --remote="$URL" --yes
  fi
fi

if [ "$DRY_RUN" = "--dry-run" ]; then
  echo "▸ Simulación (no se cambia nada). Migraciones que se aplicarían al mergear:"
  aplicadas=""
  if [ "$hay_historial" = "t" ]; then aplicadas=$(sql "select version from supabase_migrations.schema_migrations"); fi
  [ "$saltear_0001" = "t" ] && aplicadas=$(printf '%s\n0001' "$aplicadas")
  hay=f
  for f in supabase/migrations/*.sql; do
    nombre=$(basename "$f")
    version=${nombre%%_*}
    if ! printf '%s\n' "$aplicadas" | grep -qx "$version"; then
      echo "  • $nombre"
      hay=t
    fi
  done
  [ "$hay" = "f" ] && echo "  Ninguna: la base ya está al día."
  exit 0
else
  echo "▸ Aplicando migraciones pendientes…"
  supabase db push --remote="$URL" --yes
fi

echo "▸ Estado final:"
supabase migration list --remote="$URL" || true
