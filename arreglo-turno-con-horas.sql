-- =====================================================================
-- EL TURNO ASIGNADO LLEVA SUS PROPIAS HORAS, Y PUEDEN SER VARIOS AL DIA.
-- 03-10-2026. Sale de las 28 capturas del planning de Skello (msgs 3323-3355).
--
-- En su dialogo «Ajouter un shift» se escriben las horas DE ESE TURNO
-- (07:00, 15:00, pausa 30) y el calcula 7h30. No se elige de un catalogo.
-- Debajo tiene «+ Ajouter un autre shift», que es el turno partido, y en la
-- malla se ve una casilla con DOS bloques apilados.
--
-- Hasta hoy `asignaciones.turno_id` apuntaba al catalogo `turnos` y de ahi
-- salian las horas. Por eso cuando Pedro pregunto si Camila podia trabajar mas
-- horas el mismo dia, la unica respuesta posible era «creale un turno mas
-- largo»: un parche, porque el modelo no daba para mas.
--
-- `turnos` NO desaparece: pasa a ser la PLANTILLA con la que se llena rapido.
--
-- Idempotente: comprueba antes de cada paso y volver a correrlo no hace daño.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. El turno asignado gana horas propias.
-- ---------------------------------------------------------------------
alter table asignaciones add column if not exists inicio   numeric(4,2);
alter table asignaciones add column if not exists fin      numeric(4,2);
alter table asignaciones add column if not exists colacion numeric(4,2) not null default 0;
alter table asignaciones add column if not exists nota     text not null default '';

-- Lo ya planificado hereda las horas de su plantilla, para que nadie vea su
-- malla distinta de un dia para otro.
update asignaciones a
   set inicio = t.inicio, fin = t.fin, colacion = t.colacion
  from turnos t
 where t.id = a.turno_id and a.inicio is null;

comment on column asignaciones.turno_id is
  'Solo la PLANTILLA de la que salio este turno, para saber su nombre y color. Las horas que mandan son inicio/fin/colacion de esta misma fila.';
comment on column asignaciones.inicio is
  'Horas decimales: 8.5 = 08:30. fin > 24 cruza la medianoche, igual que en turnos.';

-- Trabaja si tiene horas; falta si tiene ausencia. Antes se exigia turno_id,
-- pero ahora un turno puede existir sin plantilla: se escriben las horas y ya.
-- Una fila sin horas y sin ausencia no significa nada, y ademas haria fallar
-- el ALTER de mas abajo, porque un CHECK valida lo que ya esta guardado.
delete from asignaciones where inicio is null and ausencia is null;

alter table asignaciones drop constraint if exists asignaciones_check;
alter table asignaciones drop constraint if exists asignaciones_trabaja_o_falta;
alter table asignaciones add constraint asignaciones_trabaja_o_falta
  check ((inicio is not null and fin is not null) or ausencia is not null);

-- ---------------------------------------------------------------------
-- 2. Varios turnos el mismo dia: el turno partido.
-- ---------------------------------------------------------------------
-- Se cae la regla de «una fila por persona y dia», que es justo la que impedia
-- el caso de Camila.
alter table asignaciones drop constraint if exists asignaciones_persona_id_fecha_key;

-- Pero no el MISMO bloque dos veces: misma persona, mismo dia, misma hora de
-- entrada. Sin esto, dos clics seguidos dejan el turno duplicado.
create unique index if not exists asignaciones_sin_repetir
  on asignaciones (persona_id, fecha, inicio)
  where inicio is not null;

-- Y una sola ausencia por dia: ausentarse dos veces el mismo dia no significa
-- nada, y dos filas de ausencia descuadran el conteo.
create unique index if not exists asignaciones_una_ausencia
  on asignaciones (persona_id, fecha)
  where ausencia is not null;

create index if not exists asignaciones_dia_idx on asignaciones (local_id, fecha, inicio);

-- ---------------------------------------------------------------------
-- 3. La propina se reparte por las horas de CADA turno, sumadas por persona.
--    Antes salia de la plantilla y daba UNA fila por asignacion: con dos
--    turnos el mismo dia, la misma persona aparecia dos veces en el reparto y
--    el redondeo se descuadraba. Ahora se suma por persona antes de repartir.
-- ---------------------------------------------------------------------
create or replace function propina_de(p_persona uuid, p_fecha date)
returns integer language sql stable security definer set search_path = public as $$
  with yo as (
    select local_id from personas where id = p_persona
  ),
  pool as (
    select coalesce(d.propina_efectivo,0) + coalesce(d.propina_tarjeta,0) as m
    from dias d join yo on d.local_id = yo.local_id
    where d.fecha = p_fecha
  ),
  partes as (
    select a.persona_id,
           sum((a.fin - a.inicio - a.colacion) * p.factor_propina) as w
    from asignaciones a
    join yo on a.local_id = yo.local_id
    join personas p on p.id = a.persona_id and p.activo
    where a.fecha = p_fecha
      and a.inicio is not null
    group by a.persona_id
    having sum((a.fin - a.inicio - a.colacion) * p.factor_propina) > 0
  ),
  tot as (select sum(w) as s from partes),
  calc as (
    select pa.persona_id,
           floor((select m from pool) * pa.w / tot.s)::int as piso,
           ((select m from pool) * pa.w / tot.s)
             - floor((select m from pool) * pa.w / tot.s) as frac
    from partes pa cross join tot
    where tot.s > 0 and (select m from pool) > 0
  ),
  orden as (
    select persona_id, piso, row_number() over (order by frac desc, persona_id) as rn
    from calc
  ),
  sobra as (
    select coalesce((select m from pool),0)::int - coalesce(sum(piso),0)::int as r from calc
  )
  select coalesce(
    (select o.piso + case when o.rn <= (select r from sobra) then 1 else 0 end
     from orden o where o.persona_id = p_persona), 0);
$$;

-- ---------------------------------------------------------------------
-- 4. La semana del trabajador: un dia puede traer VARIOS turnos.
--    Antes devolvia un turno por dia y con el turno partido se perdia uno.
-- ---------------------------------------------------------------------
create or replace function mi_semana(p_token text, p_desde date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_persona personas; v_out jsonb;
begin
  select * into v_persona from personas where token = p_token and activo;
  if not found then return null; end if;

  select jsonb_build_object(
    'nombre', v_persona.nombre,
    'rol',    v_persona.rol,
    'factor', v_persona.factor_propina,
    'saldo',  v_persona.saldo_horas,
    'dias', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fecha',    f.fecha,
               -- TODOS los turnos del dia, en orden de entrada
               'turnos', coalesce((
                  select jsonb_agg(jsonb_build_object(
                           'id',       a.id,
                           'turno',    t.nombre,
                           'inicio',   a.inicio, 'fin', a.fin, 'colacion', a.colacion,
                           'puesto',   coalesce(nullif(a.puesto,''), v_persona.rol),
                           'nota',     a.nota)
                         order by a.inicio)
                  from asignaciones a
                  left join turnos t on t.id = a.turno_id
                  where a.persona_id = v_persona.id and a.fecha = f.fecha
                    and a.inicio is not null), '[]'::jsonb),
               'ausencia', (select a.ausencia from asignaciones a
                             where a.persona_id = v_persona.id and a.fecha = f.fecha
                               and a.ausencia is not null limit 1),
               'confirmo', m.confirmo, 'llego', m.llego,
               'propina',  propina_de(v_persona.id, f.fecha),
               'ofrecido', exists (select 1 from turnos_abiertos ta
                                   where ta.ofrecido_por = v_persona.id and ta.fecha = f.fecha
                                     and ta.tomado_por is null))
             order by f.fecha)
      from (select (generate_series(p_desde::timestamp, (p_desde + 6)::timestamp,
                                    interval '1 day'))::date as fecha) f
      left join marcas m on m.persona_id = v_persona.id and m.fecha = f.fecha
    ), '[]'::jsonb),
    'abiertos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ta.id, 'fecha', ta.fecha, 'puesto', ta.puesto, 'nota', ta.nota,
               'turno', t.nombre, 'inicio', t.inicio, 'fin', t.fin, 'colacion', t.colacion,
               'mio', ta.tomado_por = v_persona.id,
               'propio', ta.ofrecido_por = v_persona.id,
               'libre', ta.tomado_por is null))
      from turnos_abiertos ta join turnos t on t.id = ta.turno_id
      where ta.local_id = v_persona.local_id and ta.fecha >= p_desde
        and (ta.tomado_por is null or ta.tomado_por = v_persona.id)
        and coalesce(ta.ofrecido_por, '00000000-0000-0000-0000-000000000000'::uuid) <> v_persona.id
    ), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;

grant execute on function mi_semana(text,date) to anon;

-- ---------------------------------------------------------------------
-- 5. Ofrecer un cambio: ahora hay que decir CUAL turno del dia se ofrece.
--    Con el turno partido, «el turno del martes» ya no identifica nada.
-- ---------------------------------------------------------------------
create or replace function ofrecer_turno(p_token text, p_asignacion uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_persona personas; v_a asignaciones;
begin
  select * into v_persona from personas where token = p_token and activo;
  if not found then return false; end if;

  select * into v_a from asignaciones
   where id = p_asignacion and persona_id = v_persona.id and inicio is not null;
  if not found then return false; end if;

  -- no ofrecer dos veces el mismo turno
  if exists (select 1 from turnos_abiertos
             where local_id = v_persona.local_id and fecha = v_a.fecha
               and ofrecido_por = v_persona.id and tomado_por is null) then
    return true;
  end if;

  insert into turnos_abiertos (local_id, fecha, turno_id, puesto, nota, ofrecido_por)
  values (v_persona.local_id, v_a.fecha, v_a.turno_id,
          coalesce(nullif(v_a.puesto,''), v_persona.rol, ''),
          'cambio ofrecido por ' || v_persona.nombre, v_persona.id);
  return true;
end $$;

-- La version vieja recibia la fecha, que con el turno partido ya no identifica
-- nada. Se elimina; el drop se lleva sus permisos.
drop function if exists ofrecer_turno(text,date);
grant execute on function ofrecer_turno(text,uuid) to anon;
