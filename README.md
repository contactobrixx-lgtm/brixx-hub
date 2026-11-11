# Brixx Hub

Panel interno de brixx: sistemas de gestión, demos web y pipeline comercial en un solo lugar.

Stack: React + Vite + TypeScript + Tailwind · Supabase (auth, base, storage) · Vercel.
Detalles del proyecto y convenciones en [`CLAUDE.md`](./CLAUDE.md).

---

## Migraciones automáticas (GitHub Action)

Los cambios de base de datos **ya no se corren a mano**. El workflow [`.github/workflows/migraciones.yml`](./.github/workflows/migraciones.yml) hace esto:

| Cuándo | Qué hace |
|---|---|
| Se abre o actualiza un **Pull request** que toca `supabase/migrations/` | **Simula**: lista qué migraciones se aplicarían, sin tocar la base (check "Simular migraciones") |
| Se **mergea a `main`** | **Aplica** en Supabase las migraciones pendientes (`supabase db push`) |
| A mano: **Actions → Migraciones de Supabase → Run workflow** | Aplica las pendientes (útil para reintentar) |

La 0001 se corrió a mano en el SQL Editor, así que no figura en el historial de la CLI. El script lo detecta (las tablas existen pero no está registrada) y la **marca como aplicada sin volver a correrla**. Después aplica solo lo que falta (hoy, la 0002).

### Configurar el secret (una sola vez, desde la web)

Hace falta **un solo secret**: `SUPABASE_DB_URL`, la dirección de conexión a la base.

**1. Sacar el valor en Supabase**

1. Entrá a tu proyecto en [supabase.com](https://supabase.com/dashboard).
2. Tocá el botón **Connect**, arriba de todo.
3. En **Connection String** elegí el método **Session pooler**. *No* uses "Direct connection": GitHub no la alcanza (es solo IPv6).
4. Copiá la URI. Tiene esta forma:
   `postgresql://postgres.abcdefghijkl:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`
5. Reemplazá `[YOUR-PASSWORD]` (con los corchetes) por la **contraseña de la base**, la que elegiste al crear el proyecto.
   - ¿No la recordás? **Project Settings → Database → Reset database password**. No afecta al hub, que entra con la clave pública.
   - Usá una contraseña con **solo letras y números**: los símbolos como `@ # / ?` rompen la URI.

**2. Cargarlo en GitHub**

1. Abrí el repo `brixx-hub` → **Settings** → **Secrets and variables** → **Actions**.
2. **New repository secret**.
3. Name: `SUPABASE_DB_URL`. Secret: la URI completa del paso anterior, con la contraseña.
4. **Add secret**.

**3. Probar**

En el Pull request abierto, entrá a **Checks → Migraciones de Supabase → Re-run jobs**. En el resumen tiene que aparecer la lista de migraciones que se aplicarían. Si da error de conexión, revisá la contraseña y que sea la URI del *Session pooler*.

> Las versiones de preview de Vercel usan la **misma base** que producción. Si un PR trae una migración nueva, su preview puede mostrar errores en lo que dependa de las tablas nuevas hasta que se mergee.

---

## Puesta en marcha (todo desde la web, sin terminal)

### 1. Supabase: crear el proyecto

1. Entrá a [supabase.com](https://supabase.com) → **New project**.
2. Nombre: `brixx-hub`. Elegí una contraseña de base (guardala) y la región más cercana (São Paulo).
3. Esperá a que termine de crearse (1–2 minutos).

### 2. Supabase: crear las tablas

> Si ya configuraste las [migraciones automáticas](#migraciones-automáticas-github-action), alcanza con correr a mano **solo la 0001** (tiene los emails de los socios). El Action registra la 0001 y aplica las demás.

Hay que correr **los archivos de `supabase/migrations/` en orden** (0001, después 0002…). Para cada uno:

1. Abrí el archivo acá en GitHub (por ejemplo [`supabase/migrations/0001_esquema_inicial.sql`](./supabase/migrations/0001_esquema_inicial.sql)) y copiá todo el contenido.
2. En Supabase: menú izquierdo → **SQL Editor** → **New query** → pegalo.
3. **Solo en la 0001, antes de ejecutar**: bajá hasta el final (sección 7) y reemplazá los dos emails y nombres por los tuyos y los de tu socio.
4. Tocá **Run**. Tiene que decir *Success. No rows returned*.
5. Verificá en **Table Editor** que estén las tablas (`miembros`, `fichas`, `prospectos`, `servicios`, `cotizaciones`, `cobros`, `costos`, `reuniones`…) y en **Storage** el bucket `capturas`.

> Para sumar a alguien más en el futuro: **Table Editor → miembros → Insert row** con su email, y después creale el usuario (paso 4).

### 3. Supabase: cerrar el registro público

1. **Authentication → Sign In / Providers** (o *Providers*, según la versión del panel).
2. Desactivá **Allow new users to sign up** y guardá.
3. Confirmá que el proveedor **Email** esté habilitado.

### 4. Supabase: crear los dos usuarios

1. **Authentication → Users → Add user → Create new user**.
2. Email (el mismo que pusiste en `miembros`) + contraseña.
3. Tildá **Auto Confirm User** y creá.
4. Repetí para tu socio. Después cada uno puede cambiar su contraseña desde el hub (botón *Contraseña*).

### 5. Supabase: copiar las claves

1. **Project Settings → API** (o *Data API* / *API Keys*).
2. Copiá:
   - **Project URL** → `https://xxxx.supabase.co`
   - **anon public** key (o **publishable key**, empieza con `sb_publishable_`).
3. **No** uses la `service_role` / secret key en ningún lado.

### 6. GitHub: pasar el código a `main`

El código está en la rama `claude/elegant-keller-4at0n8`. En GitHub: **Pull requests → New pull request** → base `main`, compare `claude/elegant-keller-4at0n8` → **Create** → **Merge**.
(Si el repo todavía no tiene `main`, en **Settings → General → Default branch** podés usar directamente esta rama.)

### 7. Vercel: desplegar

1. Entrá a [vercel.com](https://vercel.com) con tu cuenta de GitHub → **Add New… → Project**.
2. Importá el repo `brixx-hub`. Vercel detecta **Vite** solo; no cambies los comandos de build.
3. Abrí **Environment Variables** y agregá:
   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | la Project URL del paso 5 |
   | `VITE_SUPABASE_ANON_KEY` | la anon / publishable key del paso 5 |
4. **Deploy**. Al terminar copiá el dominio (ej. `brixx-hub.vercel.app`).

> Si cambiás una variable de entorno después, hay que ir a **Deployments → ⋯ → Redeploy** para que tome el valor nuevo.

### 8. Supabase: avisarle dónde vive el hub

Necesario para que funcione el link de "¿Olvidaste tu contraseña?".

1. **Authentication → URL Configuration**.
2. **Site URL**: `https://brixx-hub.vercel.app` (tu dominio).
3. **Redirect URLs** → agregá `https://brixx-hub.vercel.app/**`.
4. Guardá.

### 9. Probar

Entrá a tu dominio, logueate, y cargá tu primera ficha con **Nuevo sistema** (podés pegar una captura con Ctrl+V).

---

## Notas

- **"No carga dentro del hub"**: algunas apps no se dejan embeber (cabeceras `X-Frame-Options` o `frame-ancestors`). Editá la ficha y elegí **Pestaña nueva**. Si la app es tuya y está en Vercel, podés permitir el embebido quitando esas cabeceras en ese proyecto.
- **Mails de recuperación**: Supabase usa un servidor de correo propio con límite bajo de envíos por hora. Para dos usuarios alcanza.
- **Desarrollo local** (opcional): copiar `.env.example` a `.env.local`, completar, y `npm install && npm run dev`.
