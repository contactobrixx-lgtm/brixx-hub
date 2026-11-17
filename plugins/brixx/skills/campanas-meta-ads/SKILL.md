---
name: campanas-meta-ads
description: Investiga una marca, cliente o idea de infoproducto (página de ventas, Instagram, competencia, anuncios validados, ofertas) y genera automáticamente la propuesta de campaña Meta Ads en PDF editable brixx de 3 páginas.
---

# /campanas-meta-ads — investigación + propuesta de campaña + PDF brixx

Para cada cliente nuevo (productos físicos) o infoproducto. Termina siempre con el **PDF editable de 3 páginas generado y enviado**, sin pasos manuales.

Archivos junto a este SKILL.md: `generar_pdf.py` (genera el PDF) y `ejemplo-datos.json` (ejemplo completo, campaña Nova Navidad 2026).

El análisis de campañas ya lanzadas NO es parte de este skill: se hace en VS Code con Claude Code y el plugin 3qs, usando los techos y cortes de este PDF.

## Regla de oro (no negociable)

- **Nunca crear, activar, pausar ni modificar campañas, conjuntos, anuncios o presupuestos en Meta**, por ninguna vía (conector, CLI, navegador). Meta restringe la creación de campañas con IA: la carga la hace un socio a mano con el PDF.
- En Meta solo se mira: Biblioteca de anuncios y, si hace falta, datos de solo lectura.

## 1. Relevamiento

Tomar de lo que dé el usuario ("@marca" identifica al cliente):

- **Productos físicos:** web o tienda, catálogo del proveedor, costos y precios, envío, medios de pago y cuotas, stock, promos posibles.
- **Infoproducto:** URL de la **página de ventas** (Hotmart, Shopify, Claude-shop u otra), Instagram de la marca, precio, plataforma y su comisión, bonus y garantía.
- Siempre: presupuesto diario y días, píxel conectado, material para creativos, carpeta del cliente si existe.

Preguntar **una sola vez y en un solo mensaje** solo lo imprescindible que no se pueda investigar (costos, presupuesto). Si el usuario no responde, avanzar con supuestos razonables y marcarlos como "supuesto" en la nota del PDF.

## 2. Datos de la marca e identidad visual

1. **Carpeta del cliente:** si hay acceso a la computadora del usuario, buscar su carpeta (por ejemplo `brixx/@marca/`) y leer logo, paleta, tipografías, fotos de producto, portadas o mockups y documentos de marca.
2. **Adjuntos** del chat, si los hay.
3. **Web e Instagram** (con el navegador) si no hay archivos: colores, estilo de fotos, tono de voz, promesa, productos destacados, temas que más funcionan. Si no se pueden bajar imágenes, usar la paleta de la marca y el recuadro con nombre del producto. Nunca usar fotos de personas públicas.

Usar la paleta de la marca en los fondos de las maquetas (`bg` de cada ángulo) y su tono de voz en los copies.

## 3. Investigación de mercado

Usar el navegador (Claude in Chrome o el navegador integrado; cargar su skill antes del primer paso) para lo que WebFetch no lee bien.

- **Competencia:** 3 a 5 competidores directos (tiendas, Mercado Libre, Hotmart, Instagram). Precios, ofertas, bonus, garantías, envío, cuotas, posicionamiento.
- **Anuncios validados:** Biblioteca de anuncios de Meta (facebook.com/ads/library), país del cliente, por marca, competidores y palabra clave. Validado = activo hace 30+ días, varias versiones del mismo creativo o el mismo ángulo repetido por varios competidores. Anotar ángulo, formato, gancho y oferta.
- **Ofertas del mercado:** packs, 2x, % por transferencia, bonus, regalos, envío gratis, garantías.
- **Calendario:** fechas comerciales cercanas (Hot Sale, CyberMonday, Black Friday, Día del Padre/Madre, Navidad, vuelta a clases, verano, Año Nuevo para infoproductos de hábitos) y estacionalidad.
- No inventar precios ni métricas de mercado: lo que no se pudo verificar se dice. Citar las fuentes abiertas.

## 4. Auditoría de la página de ventas (físico o digital)

Revisar la página a la que va a llegar el anuncio, en celular y en computadora:

- Promesa clara arriba (se entiende en 5 segundos qué es, para quién y qué logra).
- Oferta: qué incluye, bonus, precio y anclaje honesto, cuotas, urgencia real.
- Prueba: testimonios, reseñas, resultados, autoridad.
- Objeciones: preguntas frecuentes, garantía, envío o acceso.
- Botón de compra visible y repetido (fijo en celular), checkout corto, velocidad, píxel.
- Coherencia con el Instagram y con lo que promete el anuncio.

Según el resultado:

- **Si hay inconsistencias:** proponer el embudo de mayor conversión para ese caso. Por ejemplo: infoproducto de ticket bajo = anuncio → página de ventas larga (promesa, problema, mecanismo, contenido, bonus, prueba, garantía, FAQ, botón) → checkout con order bump → upsell; ticket alto = anuncio → clase o lead magnet → WhatsApp o email → venta; físico = anuncio → página de producto con la oferta del anuncio arriba → carrito → checkout. Los 4 a 6 ajustes más importantes van al PDF (`auditoria`); si el embudo necesita más detalle, explicarlo después de enviar el PDF.
- **Si la página está bien hecha:** los anuncios se alinean con ella (coincidencia anuncio–página): el texto superpuesto o el título repiten el titular de la página, misma oferta, mismo precio, mismos bonus, mismas fotos y colores, mismo nombre del producto. Los ángulos salen de los argumentos de la propia página. En `auditoria` poner "Coincidencia anuncio–página" con lo que se debe mantener igual.

## 5. Selección (3 a 5 productos u ofertas)

Criterios: alto poder visual (demostrable en 3 s), margen que soporte el costo de adquisición, demanda o estacionalidad favorable, problema claro o impulso de compra, poca saturación. En infoproductos, las "filas" pueden ser ofertas del mismo producto (producto solo, pack con bonus, versión premium) o productos distintos de la marca. Elegir y seguir sin esperar aprobación: el PDF es editable.

Economía por fila (la fórmula va en la nota del PDF):

- Físico: precio sugerido ≈ 2 a 2,2 × costo, redondeado a $X.900 y comparado con la competencia.
- **CPA de equilibrio** = precio − costo − 10% de costos de cobro (ajustar con cuotas sin interés). Infoproducto: costo ≈ 0, descontar la comisión real de la plataforma.
- **Máx. por evento** (carrito; en infoproductos, iniciar pago) = CPA × 25%.
- **CPC máx.** = máx. por evento × 5%. **CPM máx.** = CPC máx. × 10 (CTR de 1%).

Son techos para que los números cierren, no promedios del mercado.

## 6. Estructura de campaña

- Campaña de **Ventas, ABO**, 1 conjunto por fila con el mismo presupuesto, público **Advantage+** del país, ubicaciones Advantage+.
- Presupuesto por conjunto bajo (menos de ~USD 10/día o equivalente): optimizar por **Agregar al carrito** (infoproducto: Iniciar pago) y **1 anuncio con formato flexible** por conjunto con los 3 ángulos. Con más presupuesto: optimizar por **Compra** y 3 anuncios separados.
- Cortes a las 48–72 h: gancho ≥ 25% (cortar < 15%), CPM ≤ máx. (> 2×), CTR enlace ≥ 1% (< 0,6% con gasto suficiente), CPC ≤ máx. (> 2×), visitas/clics ≥ 70% (< 50%), tasa de carrito o pago ≥ 5% (0 con 40 visitas), costo por evento ≤ máx. (> 2×).
- Plan: día 1 no tocar; día 2 apagar lo que falla claro; día 3 elegir 1–2 ganadores; día 4+ campaña nueva optimizada por Compra.

## 7. Creativos: 3 ángulos por fila

1. **Dolor / solución** (infoproducto: dolor / transformación) — video.
2. **Oferta / pack / urgencia** (infoproducto: oferta, bonus, garantía) — imagen fija.
3. **Curiosidad / demostración** (infoproducto: vista previa del contenido, resultado o testimonio) — video.

Basarse en los ángulos validados del mercado y, si la página está bien, en sus propios argumentos y titulares. Por ángulo: brief visual de 1 línea; texto superpuesto de **máx. 7 palabras**; texto principal con gancho en las 2 primeras líneas, beneficios con ✔ y CTA (**máx. ~330 caracteres**); título de **máx. 40 caracteres**; una descripción común (envíos o acceso inmediato + cuotas). En la oferta, escribir `{promo}` y `{venta}` para que el precio sea editable.

Reglas: sin precios tachados si nunca se vendió a ese precio; "envío gratis" solo donde aplica; sin promesas médicas, de ingresos ni de resultados garantizados; no afirmar specs ni resultados no verificados (van a "Antes de lanzar").

## 8. Generar y entregar el PDF (automático)

1. Carpeta de trabajo `campana-<marca>-AAAAMM/` con `datos.json` (misma estructura que `ejemplo-datos.json`) e `img/`.
2. **Imágenes** en `img/<key>.jpg` (~700 px, sin textos encima): de la carpeta del cliente, adjuntos, recortes del catálogo PDF (renderizar con pypdfium2 y recortar con PIL) o portada/mockup del infoproducto. Si no hay, el PDF muestra un recuadro con el nombre.
3. Dependencias: probar `python -c "import playwright, pypdf"`; si falta algo, `pip install playwright pypdf` (con `--break-system-packages` si lo pide) y `python -m playwright install chromium` si no hay navegador.
4. Correr `python <carpeta de este skill>/generar_pdf.py <carpeta de trabajo>`. Si avisa de texto desbordado, acortar copies y regenerar.
5. **Revisar**: renderizar cada página a PNG (pypdfium2, `init_forms()` + `may_draw_forms=True`) y mirarlas. Corregir solapamientos o textos cortados antes de entregar.
6. Entregar el PDF con 2 o 3 líneas: qué se eligió, qué se puede editar, qué es supuesto o falta verificar y, si corresponde, el embudo recomendado.

Estructura de `datos.json` (ver `ejemplo-datos.json`): `archivo`, `cliente`, `fecha`, `contacto` (+54 9 381 582-3919), `titulo`, `subtitulo`, `descripcion`, `cta`, `leyenda_video`, `leyenda_imagen`, `campos` (valores editables del header), `kpis` (6), `productos_titulo`, `columna_promo`, `columna_evento`, `nota_productos`, `cortes`, `nota_cortes`, `pasos` (4), `antes_de_lanzar`, `reglas`, `auditoria` (opcional: `titulo` + `items`), `productos` (3 a 6; cada uno con `key`, `nombre`, `codigo`, `costo`, `venta`, `promo_label`, `promo`, `cpa`, `max_evento`, `cpc`, `cpm` y exactamente 3 `angulos` con `tipo` video|imagen, `pack` opcional, `bg`, `nombre`, `overlay`, `brief`, `texto`, `titulo`). Con 6 filas no entran los recuadros finales.

Contenido del PDF (A4 horizontal, marca **brixx**):

- Página 1: header con tipo de campaña, objetivo, presupuesto (diario × días = total), anuncios por campaña, presupuesto por anuncio y público; tabla de filas (costo, precio, promo, CPA, máx. evento, CPC y CPM máx.); cortes; plan día por día.
- Páginas 2–3: una fila por producto u oferta con sus 3 ángulos (maqueta 9:16 con texto superpuesto + texto principal, título y brief). Al final: "Antes de lanzar", "Reglas de la promo" y, si hay `auditoria`, el recuadro de la página de ventas.
- Editables: precios, promos y valores del header. Un mismo campo cambia en todo el PDF. Avisar que CPA/CPC/CPM no se recalculan solos y que conviene abrirlo con Acrobat Reader o Chrome.
