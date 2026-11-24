-- =====================================================================
-- Brixx Hub — 0033: cierre de las propuestas
-- La última hoja pasa a ser la "Conclusión de la propuesta" y la frase del
-- cierre arranca con "Empecemos por las bases" (antes "Empecemos por el
-- asistente…"). Se cambia en las propuestas que ya tienen una frase que
-- empieza con "Empecemos por …" (se mantiene lo que sigue: la inversión).
-- La de Alcione (COT-0004) además recibe su conclusión.
-- Idempotente.
-- =====================================================================

update public.cotizaciones
set propuesta = jsonb_set(
  propuesta, '{cierre}',
  to_jsonb(regexp_replace(propuesta ->> 'cierre', '^\s*Empecemos por [^:.]*', 'Empecemos por las bases'))
)
where propuesta ->> 'cierre' ~* '^\s*Empecemos por '
  and propuesta ->> 'cierre' !~* '^\s*Empecemos por las bases';

update public.cotizaciones
set propuesta = propuesta || jsonb_build_object('conclusion',
  'Con las tres etapas, Alcione atiende y vende a toda hora, opera su tienda online sin cargar nada a mano y maneja ventas, '
  || 'stock y caja desde el celular, sin sumar personal. Arrancamos por las bases, el asistente de WhatsApp, y con eso '
  || 'andando sumamos la tienda y la gestión.')
where titulo ilike 'Bot con IA, automatizaciones y panel de gesti%n%'
  and coalesce(propuesta ->> 'conclusion', '') = '';
