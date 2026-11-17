---
name: cliente-nuevo-brixx
description: Usar cuando el usuario escribe "nuevo cliente de brixx @marca" (o "cliente nuevo", "infoproducto nuevo", "actualizá @marca") con datos y links: lo carga o actualiza en el panel brixx-hub y arma su carpeta.
---

# Cliente nuevo (o actualización) de brixx

brixx es la agencia de soluciones digitales e IA de dos socios (Argentina). El **panel brixx-hub** es el sistema de gestión: pipeline, carpetas de clientes, intervenciones, cotizaciones y Jarvis. Este skill carga ahí los clientes nuevos y las novedades de los existentes. Se activa con mensajes como:

- "nuevo cliente de brixx @cafeteria-luna, cafetería en Yerba Buena, quieren carta digital, instagram.com/…"
- "infoproducto nuevo @aniyogui + página de ventas"
- "actualizá @nova: ya tiene el píxel, quiere arrancar en diciembre"

Flujo corto y barato: no generar PDFs ni campañas acá (eso es `/campanas-meta-ads`).

## 1. Entender el pedido

- **Nombre:** lo que sigue a "@"; slug en minúsculas, con guiones y sin tildes (`@Cafetería Luna` → `@cafeteria-luna`).
- **Tipo:** cliente (servicios o productos físicos) o infoproducto. Si no se aclara, deducirlo.
- **Material:** todo lo que escribió el usuario (rubro, ciudad, contacto, qué necesita, presupuesto, notas de la charla), adjuntos y links (web, tienda, Instagram, página de ventas, catálogo).

No hacer preguntas antes de empezar.

## 2. Cargar en el hub (conector "brixx hub")

Si están disponibles las herramientas del conector del hub (`buscar_cliente`, `leer_cliente`, `cargar_intervencion`, `estado_intervencion`, `completar_cliente`):

1. **`buscar_cliente`** con el nombre, el @usuario de Instagram o el dominio web, para no duplicar carpetas.
2. **`cargar_intervencion`** con:
   - `texto`: todo el material en texto claro (quién es, qué hace, qué pidió, datos de contacto, lo que se vio en sus links, y "Tipo: infoproducto" si corresponde).
   - `urls`: hasta 5 links.
   - `prospecto_id`: el de la carpeta si ya existe (actualización); sin él si es nuevo (el hub crea la carpeta en el pipeline, etapa contacto).
   - `titulo`: "Alta de cliente" o "Actualización: <tema>".
3. Esperar alrededor de un minuto y llamar **`estado_intervencion`** (reintentar hasta 3 veces si sigue "analizando"). Ese análisis del hub (dolores, cuellos de botella, soluciones del catálogo, mensaje para el cliente) es el **diagnóstico**: no rehacerlo.
4. **`completar_cliente`** solo si quedó algún dato claro sin cargar (teléfono, mail, Instagram, web, rubro) o para una nota corta.

Nunca cargar contraseñas ni tokens aunque el usuario los pase: avisar que no se guardan. El conector no borra ni cambia etapas, cotizaciones o finanzas: eso se hace en el hub o con Jarvis.

**Si el conector no está disponible:** abrir los links (WebFetch o navegador), armar un diagnóstico corto (situación, dolores, soluciones brixx que encajan, próximos pasos, qué falta saber) y dejar al final un bloque listo para pegar en el hub en **Clientes → Nueva intervención → texto**. Avisar en una línea que con el conector (Clientes → "Conectar con Claude") esto se carga solo.

## 3. Carpeta en la computadora (si el chat está vinculado)

Si la conversación puede escribir en la computadora del usuario, buscar la carpeta `brixx` (escritorio o `C:\Users\Ezequiel\brixx`) y en `01_clientes/@slug/` (o `02_infoproductos/@slug/`):

- Crear las subcarpetas que falten (`00_info` a `05_reportes`).
- `00_info/ficha.md` con los datos del cliente y el link a su carpeta del hub.
- `02_investigacion/diagnostico-inicial.md` con el análisis.
- Adjuntos a su lugar según `brixx/CLAUDE.md` (logos y fotos → `01_identidad`, chats y audios → `00_info`). No pisar nada que ya exista.

Si no está vinculada, no crear archivos: el hub ya guarda todo.

## Respuesta en el chat

Breve:

- Si la carpeta en el hub es **nueva** o **actualizada**, con su link.
- Las 2 o 3 soluciones principales y qué falta saber.
- El mensaje sugerido para el cliente (el del hub), listo para copiar.
- Una línea con el siguiente paso natural (demo, propuesta o `/campanas-meta-ads @slug`).
