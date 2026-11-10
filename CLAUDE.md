# Brixx Hub

Panel interno de **brixx**, agencia de IA de dos socios. Centraliza en un solo lugar:

1. **Sistemas de gestión**: los paneles/apps ya entregados o en desarrollo (ERP ferretería, ERP huevos, POS Doña Martu, etc.). Cada uno es una app independiente con su propia URL; el hub solo los lista y los abre.
2. **Demos web**: menús digitales, cotizadores, landings. Misma lógica de fichas que los sistemas.
3. **Pipeline**: tablero kanban de prospectos comerciales.

Usuarios: solo los dos socios, invitados manualmente desde Supabase. No hay registro público.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| Estilos | Tailwind CSS (tema oscuro único) |
| Ruteo | React Router |
| Datos / Auth | Supabase (Postgres + Auth + Row Level Security) |
| Kanban | @dnd-kit (drag & drop) |
| Deploy | Vercel (build automático desde GitHub) |

No hay backend propio: el frontend habla directo con Supabase usando la clave pública (anon/publishable). **La seguridad la dan las políticas RLS**, no el frontend.

## Variables de entorno

Definidas en `.env.local` (local, no se commitea) y en Vercel → Settings → Environment Variables:

```
VITE_SUPABASE_URL=https://<proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<clave pública anon / publishable>
```

Nunca usar ni commitear la `service_role` / secret key en este repo.

## Estructura de carpetas (objetivo)

```
src/
  lib/supabase.ts        # cliente único de Supabase
  auth/                  # AuthProvider, ruta protegida, pantalla de login
  components/ui/         # botones, inputs, modal, badge... (reutilizables)
  features/
    fichas/              # tarjetas, grilla, formulario, visor iframe (sistemas + demos)
    pipeline/            # tablero kanban, columna, tarjeta, formulario de prospecto
  pages/                 # una página por ruta
  types/                 # tipos de las tablas de la base
supabase/
  migrations/            # SQL versionado: esquema, RLS, seeds
```

## Rutas

- `/login` — única ruta pública.
- `/sistemas`, `/demos` — grilla de fichas filtrada por `seccion`.
- `/ver/:id` — ficha abierta embebida en iframe (con botón "abrir en pestaña nueva").
- `/pipeline` — kanban de prospectos.

## Convenciones

- **Idioma**: UI, nombres de tablas/columnas y textos en **español**. Código (variables, funciones, componentes) en inglés o español, pero consistente dentro de cada archivo; nombres de tablas/columnas siempre como están en la base.
- **Datos, no código**: todo contenido (fichas, prospectos) vive en Supabase y se edita desde formularios del hub. Nunca hardcodear fichas en el código.
- **Esquema versionado**: cualquier cambio de base va como archivo nuevo en `supabase/migrations/` (`NNNN_descripcion.sql`), idempotente cuando sea posible. Mantener `src/types/` en sincronía.
- **RLS siempre activo** en todas las tablas. Acceso solo para usuarios autenticados cuyo email esté en la tabla `miembros`.
- **Iframes**: muchas apps bloquean ser embebidas (`X-Frame-Options` / `frame-ancestors`). Cada ficha tiene `modo_apertura` (`iframe` | `pestana`); el visor siempre ofrece "abrir en pestaña nueva" como salida.
- **Estética**: oscura premium. Fondo casi negro, superficies con leve elevación y bordes sutiles, un solo color de acento, tipografía limpia (Inter), mucho aire, animaciones cortas y discretas. Definir colores como tokens en la config de Tailwind; no colores sueltos en componentes.
- **Componentes**: funcionales con hooks. Acceso a datos encapsulado en hooks por feature (`useFichas`, `useProspectos`), no llamadas a Supabase sueltas en componentes de UI.
- **Responsive**: tiene que poder usarse desde el celular (consultar el pipeline en una reunión).
- **Sin dependencias innecesarias**: antes de sumar una librería, preferir lo que ya está en el stack.
- **Deploy**: `main` se despliega a producción en Vercel. SPA con rewrite de todas las rutas a `index.html` (`vercel.json`).

## Comandos

```
npm install
npm run dev       # desarrollo local
npm run build     # build de producción
npm run lint
```
