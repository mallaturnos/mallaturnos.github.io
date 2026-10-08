-- =====================================================================
-- EL TURNO GUARDA SU PUESTO. 08-10-2026.
--
-- Pedro eligio la opcion «A» (msg 4888) despues de mandar una captura del
-- desplegable «Copiar de» con la lista de horarios sueltos intacta y decir
-- «eso se suponia desaparecia» (msg 4886).
--
-- EL PROBLEMA, que es de modelo y no de pantalla: la tabla `turnos` es
-- `nombre + inicio + fin + colacion + orden`. NO TIENE PUESTO. El puesto vive
-- en `asignaciones` (lo puso `arreglo-puesto-en-turno.sql` el 03-10). O sea
-- que la fila de un turno ES, literalmente, un rango de horas con nombre: el
-- catalogo de horarios sueltos que habia que eliminar.
--
-- El 07-10 por la noche se saco la PANTALLA de ese catalogo y se hizo que el
-- dialogo EXIJA elegir puesto. Pero ese puesto se estampaba solo en las
-- asignaciones que salen a la malla: la plantilla seguia sin puesto. Por eso
-- la lista solo podia decir «Cena · 11:00-15:03», y por eso Pedro la seguia
-- viendo. Se quito la superficie, no el concepto.
--
-- QUE HACE ESTE ARCHIVO:
--   1. Agrega `turnos.puesto_id` (mismo patron y mismo tipo que las cinco
--      columnas de `migracion-ids-paso1.sql`: id del catalogo, no texto).
--   2. Rellena los turnos que YA existen mirando con que puesto se usan de
--      verdad en la malla, y SOLO cuando la respuesta es inequivoca.
--
-- POR QUE EL RELLENO ES CONSERVADOR: un turno que en la malla aparece unas
-- veces en Barra y otras en Cocina no tiene UN puesto, y elegir el mas
-- frecuente seria inventar. Esos quedan en NULL y salen listados en el informe
-- del final para que Pedro los asigne a mano abriendo cada turno. Es preferible
-- un hueco visible a un dato plausible y falso.
--
-- SE PUEDE PEGAR SOLO, y esto no es el caso de `migracion-suelta-caduca`: aqui
-- no se redefine NINGUNA funcion, asi que no puede retroceder la base pisando
-- una version posterior. Es un ALTER aditivo mas un UPDATE que solo toca filas
-- con `puesto_id is null`. Idempotente: pegarlo dos veces no cambia nada.
--
-- DESHACERLO: `alter table turnos drop column puesto_id;`
-- =====================================================================

alter table turnos
  add column if not exists puesto_id uuid references puestos(id) on delete set null;

create index if not exists turnos_puesto_id_idx on turnos (puesto_id);

-- ---------------------------------------------------------------------
-- Relleno. El nombre del puesto de cada asignacion sale PRIMERO del catalogo
-- siguiendo su id, y solo si no tiene id se usa el texto guardado — el mismo
-- orden que `puestoDe()` en la app, para que las dos cuenten lo mismo.
-- ---------------------------------------------------------------------
with usos as (
  select a.turno_id,
         coalesce(nullif(btrim(q.nombre), ''), nullif(btrim(a.puesto), '')) as nombre
    from asignaciones a
    left join puestos q on q.id = a.puesto_id
   where a.turno_id is not null
),
claros as (
  select turno_id,
         min(lower(btrim(nombre)))      as nombre,
         count(distinct lower(btrim(nombre))) as cuantos
    from usos
   where nombre is not null
   group by turno_id
)
update turnos t
   set puesto_id = q.id
  from claros c
  join puestos q
    on lower(btrim(q.nombre)) = c.nombre
 where t.id = c.turno_id
   and q.local_id = t.local_id          -- cada local tiene su propio catalogo
   and c.cuantos = 1                    -- inequivoco: un solo puesto en toda la malla
   and t.puesto_id is null;             -- no pisa lo ya resuelto

-- ---------------------------------------------------------------------
-- Informe. No escribe nada: dice que quedo y que hay que mirar a mano.
-- «sin resolver» son los turnos que siguen sin puesto, con el motivo.
-- ---------------------------------------------------------------------
select t.nombre                                           as turno,
       coalesce(q.nombre, '— SIN PUESTO —')                as puesto,
       case
         when t.puesto_id is not null then 'resuelto'
         when not exists (select 1 from asignaciones a where a.turno_id = t.id)
           then 'nunca se ha usado en la malla: elegir a mano'
         else 'se usa con MAS DE UN puesto: elegir a mano'
       end                                                 as estado
  from turnos t
  left join puestos q on q.id = t.puesto_id
 order by t.puesto_id is not null, t.orden, t.inicio;
