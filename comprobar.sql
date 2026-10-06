-- =====================================================================
-- ¿QUE ARREGLOS ESTAN APLICADOS?   06-10-2026
--
-- POR QUE EXISTE. Hay 17 archivos de arreglos y nadie sabe de memoria cuales
-- se pegaron. Ya paso: `arreglo-equipos.sql`, del 02-10, llevaba un dia sin
-- aplicar y el campo Equipo no se podia guardar — se descubrio por un error,
-- no por una comprobacion.
--
-- Y `arreglo-todo.sql` NO sirve para salir de dudas, aunque sea acumulado:
-- **vacia la dotacion**. Pegarlo «por si acaso» cuesta el trabajo de llenar
-- cuanta gente va en cada turno.
--
-- ESTO NO ESCRIBE NADA. Solo lee el catalogo de Postgres y dice que falta.
-- Pegalo en el SQL Editor de Supabase y mira la columna «estado». Son 13 filas.
-- =====================================================================

with revision(archivo, que_comprueba, aplicado) as (values
  ('arreglo-puestos.sql',          'tabla puestos',
     (to_regclass('public.puestos') is not null)),
  ('arreglo-tramos.sql',           'tabla dotacion_tramos',
     (to_regclass('public.dotacion_tramos') is not null)),
  ('arreglo-modelos.sql',          'tablas modelos_semana y modelo_turnos',
     (to_regclass('public.modelos_semana') is not null
      and to_regclass('public.modelo_turnos') is not null)),
  ('arreglo-equipos.sql',          'personas.equipo',
     exists(select 1 from information_schema.columns
             where table_name='personas' and column_name='equipo')),
  ('arreglo-tanda2.sql',           'personas.no_disponible y saldo_horas',
     exists(select 1 from information_schema.columns
             where table_name='personas' and column_name='no_disponible')
      and exists(select 1 from information_schema.columns
             where table_name='personas' and column_name='saldo_horas')),
  ('arreglo-puesto-en-turno.sql',  'dotacion.turno_id y asignaciones.puesto',
     exists(select 1 from information_schema.columns
             where table_name='dotacion' and column_name='turno_id')
      and exists(select 1 from information_schema.columns
             where table_name='asignaciones' and column_name='puesto')),
  ('arreglo-turno-con-horas.sql',  'asignaciones.inicio y fin',
     exists(select 1 from information_schema.columns
             where table_name='asignaciones' and column_name='inicio')),
  ('arreglo-sin-asignar.sql',      'asignaciones.tomado_por',
     exists(select 1 from information_schema.columns
             where table_name='asignaciones' and column_name='tomado_por')),
  ('arreglo-reloj-control.sql',    'marcas.asignacion_id',
     exists(select 1 from information_schema.columns
             where table_name='marcas' and column_name='asignacion_id')),
  ('arreglo-tope.sql',             'locales.bloquear_sobre_tope',
     exists(select 1 from information_schema.columns
             where table_name='locales' and column_name='bloquear_sobre_tope')),
  ('arreglo-renombrar-tramos.sql', 'renombrar_puesto mueve los tramos',
     exists(select 1 from pg_proc
             where proname='renombrar_puesto' and prosrc like '%dotacion_tramos%')),
  ('arreglo-dias-turno.sql',       'turnos.dias',
     exists(select 1 from information_schema.columns
             where table_name='turnos' and column_name='dias')),
  -- Esta no mira una tabla sino el CUERPO de la funcion. Es el agujero por el
  -- que se colo el fallo del 06-10: `marcar()` seguia exigiendo que el turno
  -- viniera de una plantilla, y como no faltaba ninguna columna, comprobar.sql
  -- no tenia nada que decir. Un arreglo que solo reescribe una funcion no se
  -- ve en el catalogo de columnas: hay que mirar `prosrc`.
  ('arreglo-marcar-sin-plantilla.sql', 'marcar() acepta turnos sin plantilla',
     -- POSITIVA, no «not like». La primera version preguntaba si la condicion
     -- vieja YA NO estaba, y el propio arreglo la nombraba en un comentario de
     -- adentro de la funcion: `prosrc` se lleva los comentarios, asi que el
     -- verificador leia el comentario y decia que faltaba. Preguntar por lo que
     -- TIENE QUE ESTAR no se puede romper por escribir de mas.
     exists(select 1 from pg_proc
             where proname='marcar' and prosrc like '%p_fecha and inicio is not null%'))
)
select
  case when aplicado then '✅ aplicado' else '🔴 FALTA' end as estado,
  archivo,
  que_comprueba
from revision
order by aplicado, archivo;
