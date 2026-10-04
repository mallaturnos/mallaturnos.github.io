-- =====================================================================
-- TODO EN UNO. 03-10-2026.
--
-- Pegar este archivo completo en el SQL Editor de Supabase y darle Run.
-- Deja la base al dia, venga del estado que venga, y SE PUEDE PEGAR LAS VECES
-- QUE HAGA FALTA: cada paso comprueba antes de actuar.
--
-- POR QUE EXISTE: los arreglos se fueron entregando de a uno y en una tarde se
-- juntaron cinco. El editor de Supabase corre todo el archivo COMO UN BLOQUE,
-- asi que si una linea falla se deshace el archivo entero —incluso lo que ya
-- habia pasado— y queda la duda de que quedo aplicado y que no. Ademas no son
-- independientes entre si: hay un orden, y no estaba escrito en ninguna parte.
--
-- Aca van los CATORCE en el orden correcto. Lo que ya este hecho se salta solo.
--
-- OJO, lo que este archivo SI borra (no todo es aditivo):
--   * la tabla `dotacion` se vacia entera y a proposito: el modelo paso de
--     filas por hora a filas por turno y las viejas no se podian traducir.
--     HAY QUE VOLVER A CARGAR LA DOTACION despues de correr esto.
--   * asignaciones sin horas ni ausencia, y marcas cuyo turno ya no existe.
--     Antes de cada uno de esos borrados hay un UPDATE que migra lo
--     rescatable, asi que solo se va lo que quedo sin significado.
--   * el marcaje queda LIBRE (se puede marcar cualquier dia). Es de
--     prototipo: para un piloto de verdad hay que reponer el limite.
-- =====================================================================


-- =====================================================================
-- arreglo-marcas.sql
-- =====================================================================
alter table marcas add column if not exists marcado_por text;

create policy dueno_marcas_ins on marcas for insert
  with check (exists (select 1 from personas p
                      where p.id = marcas.persona_id and es_mi_local(p.local_id)));

create or replace function marcar(p_token text, p_fecha date, p_campo text, p_valor boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_hoy date;
begin
  select id into v_id from personas where token = p_token and activo;
  if v_id is null then return false; end if;
  if p_campo not in ('confirmo','llego') then return false; end if;
  if not exists (select 1 from asignaciones
                 where persona_id = v_id and fecha = p_fecha and turno_id is not null) then
    return false;
  end if;
  v_hoy := (now() at time zone 'America/Santiago')::date;
  if p_campo = 'llego' and p_fecha <> v_hoy then return false; end if;
  insert into marcas (persona_id, fecha) values (v_id, p_fecha) on conflict do nothing;
  if p_campo = 'confirmo' then
    update marcas set confirmo = p_valor, marcado_por = 'trabajador'
     where persona_id = v_id and fecha = p_fecha;
  else
    update marcas set llego = p_valor, marcado_por = 'trabajador',
                      hora_llego = case when p_valor then now() else null end
     where persona_id = v_id and fecha = p_fecha;
  end if;
  return true;
end $$;

grant execute on function marcar(text,date,text,boolean) to anon;


-- =====================================================================
-- arreglo-propina.sql
-- =====================================================================
-- =====================================================================
-- Arreglo 02-10-2026, dos cosas de la vista del trabajador:
--   1. Mostrarle los SIETE dias de la semana, aunque no tenga turno.
--   2. Decirle CUANTO LE TOCA a el de propina, no el total del local.
-- El reparto se calcula ACA porque la base es el unico lugar que ve las
-- horas de todo el equipo. El trabajador nunca ve los datos de los demas:
-- solo su propio numero.
-- =====================================================================

-- Cuanto le toca a una persona un dia, con el MISMO redondeo que ve el jefe:
-- parte entera por horas x factor, y el resto de la division se asigna de a $1
-- al que quedo con la fraccion mas grande. Asi los dos lados cuadran al peso.
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
           (t.fin - t.inicio - t.colacion) * p.factor_propina as w
    from asignaciones a
    join yo on a.local_id = yo.local_id
    join turnos t on t.id = a.turno_id
    join personas p on p.id = a.persona_id and p.activo
    where a.fecha = p_fecha
      and (t.fin - t.inicio - t.colacion) * p.factor_propina > 0
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

-- La semana del trabajador: los 7 dias siempre, con su propina de cada dia.
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
    'dias', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fecha',    f.fecha,
               'turno',    t.nombre, 'inicio', t.inicio, 'fin', t.fin, 'colacion', t.colacion,
               'ausencia', a.ausencia,
               'confirmo', m.confirmo, 'llego', m.llego,
               'propina',  propina_de(v_persona.id, f.fecha))
             order by f.fecha)
      from (select (generate_series(p_desde::timestamp, (p_desde + 6)::timestamp,
                                    interval '1 day'))::date as fecha) f
      left join asignaciones a on a.persona_id = v_persona.id and a.fecha = f.fecha
      left join turnos t       on t.id = a.turno_id
      left join marcas m       on m.persona_id = v_persona.id and m.fecha = f.fecha
    ), '[]'::jsonb),
    'abiertos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ta.id, 'fecha', ta.fecha, 'puesto', ta.puesto, 'nota', ta.nota,
               'turno', t.nombre, 'inicio', t.inicio, 'fin', t.fin, 'colacion', t.colacion,
               'mio', ta.tomado_por = v_persona.id,
               'libre', ta.tomado_por is null))
      from turnos_abiertos ta join turnos t on t.id = ta.turno_id
      where ta.local_id = v_persona.local_id and ta.fecha >= p_desde
        and (ta.tomado_por is null or ta.tomado_por = v_persona.id)), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;

grant execute on function mi_semana(text,date) to anon;


-- =====================================================================
-- arreglo-marcaje-libre.sql
-- =====================================================================
-- Marcaje libre mientras esto sea un prototipo: se puede marcar "llegue"
-- cualquier dia, no solo el del turno. Decidido por Pedro el 02-10-2026 para
-- poder mostrar la app sin depender de que hoy sea el dia del turno.
-- PARA UN PILOTO DE VERDAD hay que volver a poner el limite (esta en el
-- archivo arreglo-marcas.sql): si "llegue" no significa "estoy aca ahora",
-- el planificado contra real pierde su sentido.
create or replace function marcar(p_token text, p_fecha date, p_campo text, p_valor boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from personas where token = p_token and activo;
  if v_id is null then return false; end if;
  if p_campo not in ('confirmo','llego') then return false; end if;
  if not exists (select 1 from asignaciones
                 where persona_id = v_id and fecha = p_fecha and turno_id is not null) then
    return false;
  end if;
  insert into marcas (persona_id, fecha) values (v_id, p_fecha) on conflict do nothing;
  if p_campo = 'confirmo' then
    update marcas set confirmo = p_valor, marcado_por = 'trabajador'
     where persona_id = v_id and fecha = p_fecha;
  else
    update marcas set llego = p_valor, marcado_por = 'trabajador',
                      hora_llego = case when p_valor then now() else null end
     where persona_id = v_id and fecha = p_fecha;
  end if;
  return true;
end $$;

grant execute on function marcar(text,date,text,boolean) to anon;


-- =====================================================================
-- arreglo-tanda2.sql
-- =====================================================================
-- Tanda 2: disponibilidad, cambio de turno entre compañeros y banco de horas.

-- 1) Dias de la semana en que la persona NO puede trabajar (0=lunes … 6=domingo).
--    No bloquea: avisa. El encargado decide igual, pero con el dato a la vista.
alter table personas add column if not exists no_disponible smallint[] not null default '{}';

-- 2) Saldo de horas: lo que la persona te debe (negativo) o le debes (positivo).
--    Se ajusta a mano, como en Skello, porque el cierre de la semana lo decide el jefe.
alter table personas add column if not exists saldo_horas numeric(6,2) not null default 0;

-- 3) Cambio de turno: quien ofrecio el turno que quedo abierto.
alter table turnos_abiertos add column if not exists ofrecido_por uuid references personas(id) on delete set null;

-- El trabajador ofrece su turno: pasa a la lista de turnos abiertos y cualquiera
-- del equipo lo puede tomar. El turno NO se le quita hasta que el jefe apruebe el
-- cambio: si nadie lo toma, sigue siendo suyo y tiene que ir.
create or replace function ofrecer_turno(p_token text, p_fecha date)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_persona personas; v_turno uuid;
begin
  select * into v_persona from personas where token = p_token and activo;
  if not found then return false; end if;

  select turno_id into v_turno from asignaciones
   where persona_id = v_persona.id and fecha = p_fecha and turno_id is not null;
  if v_turno is null then return false; end if;

  -- no ofrecer dos veces el mismo turno
  if exists (select 1 from turnos_abiertos
             where local_id = v_persona.local_id and fecha = p_fecha
               and ofrecido_por = v_persona.id and tomado_por is null) then
    return true;
  end if;

  insert into turnos_abiertos (local_id, fecha, turno_id, puesto, nota, ofrecido_por)
  values (v_persona.local_id, p_fecha, v_turno, coalesce(v_persona.rol,''),
          'cambio ofrecido por ' || v_persona.nombre, v_persona.id);
  return true;
end $$;

grant execute on function ofrecer_turno(text,date) to anon;

-- mi_semana: agrega el saldo, la disponibilidad y si el dia ya esta ofrecido.
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
               'turno',    t.nombre, 'inicio', t.inicio, 'fin', t.fin, 'colacion', t.colacion,
               'ausencia', a.ausencia,
               'confirmo', m.confirmo, 'llego', m.llego,
               'propina',  propina_de(v_persona.id, f.fecha),
               'ofrecido', exists (select 1 from turnos_abiertos ta
                                   where ta.ofrecido_por = v_persona.id and ta.fecha = f.fecha
                                     and ta.tomado_por is null))
             order by f.fecha)
      from (select (generate_series(p_desde::timestamp, (p_desde + 6)::timestamp,
                                    interval '1 day'))::date as fecha) f
      left join asignaciones a on a.persona_id = v_persona.id and a.fecha = f.fecha
      left join turnos t       on t.id = a.turno_id
      left join marcas m       on m.persona_id = v_persona.id and m.fecha = f.fecha
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


-- =====================================================================
-- arreglo-tope.sql
-- =====================================================================
alter table locales add column if not exists bloquear_sobre_tope boolean not null default false;

-- Tomar un turno abierto, ahora avisando el motivo cuando no se puede.
-- Dos motivos posibles: alguien lo tomo primero, o la persona se pasaria de
-- sus horas contratadas y el local tiene activado el bloqueo.
-- El calculo de horas se hace ACA porque el navegador del trabajador no puede
-- ver los turnos del resto de la semana de nadie, ni siquiera los suyos pasados.
create or replace function tomar_turno(p_token text, p_abierto uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_persona personas; v_ab turnos_abiertos; v_local locales;
  v_lunes date; v_horas numeric; v_extra numeric; v_ok int;
begin
  select * into v_persona from personas where token = p_token and activo;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'link'); end if;

  select * into v_ab from turnos_abiertos where id = p_abierto and local_id = v_persona.local_id;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if v_ab.tomado_por is not null then return jsonb_build_object('ok', false, 'motivo', 'tomado'); end if;

  select * into v_local from locales where id = v_persona.local_id;

  -- horas que ya tiene esa semana (lunes a domingo del turno abierto)
  v_lunes := v_ab.fecha - ((extract(isodow from v_ab.fecha)::int - 1));
  select coalesce(sum(t.fin - t.inicio - t.colacion), 0) into v_horas
    from asignaciones a join turnos t on t.id = a.turno_id
   where a.persona_id = v_persona.id and a.fecha between v_lunes and v_lunes + 6;

  select (t.fin - t.inicio - t.colacion) into v_extra from turnos t where t.id = v_ab.turno_id;

  if v_local.bloquear_sobre_tope and (v_horas + coalesce(v_extra,0)) > v_persona.horas_contrato then
    return jsonb_build_object('ok', false, 'motivo', 'tope',
                              'horas', v_horas + coalesce(v_extra,0),
                              'contrato', v_persona.horas_contrato);
  end if;

  update turnos_abiertos
     set tomado_por = v_persona.id, tomado_en = now()
   where id = p_abierto and tomado_por is null;
  get diagnostics v_ok = row_count;
  if v_ok <> 1 then return jsonb_build_object('ok', false, 'motivo', 'tomado'); end if;

  return jsonb_build_object('ok', true,
                            'horas', v_horas + coalesce(v_extra,0),
                            'contrato', v_persona.horas_contrato);
end $$;

revoke execute on function tomar_turno(text,uuid) from anon;
grant execute on function tomar_turno(text,uuid) to anon;


-- =====================================================================
-- arreglo-equipos.sql
-- =====================================================================
alter table personas add column if not exists equipo text not null default '';


-- =====================================================================
-- arreglo-dotacion-puesto.sql
-- =====================================================================
-- La dotacion pasa a ser POR PUESTO y POR DIA DE LA SEMANA.
-- Antes era "5 personas" en dos perfiles (L-J y V-D). El numero total puede
-- cuadrar y el local no funcionar: 5 garzones y ningun cocinero. Y viernes,
-- sabado y domingo no se parecen en nada entre si.
alter table dotacion add column if not exists puesto text not null default '';
alter table dotacion drop constraint if exists dotacion_pkey;
alter table dotacion add primary key (local_id, perfil, puesto, hora);
-- Las filas viejas no tienen puesto y usan los perfiles antiguos: se borran.
delete from dotacion where puesto = '' or perfil in ('semana','finde');


-- =====================================================================
-- arreglo-dotacion-turno.sql
-- =====================================================================
-- La dotacion pasa de HORAS a TURNOS. Pedirle a alguien que llene 17 casillas
-- por puesto y por dia son mas de 350 numeros: eso es una planilla, no una
-- herramienta. Por turno son 63 y se llena en cinco minutos, y ademas es como
-- piensa un dueño de local: "el sabado en la tarde necesito tres garzones".
alter table dotacion drop constraint if exists dotacion_pkey;
delete from dotacion;                       -- las filas por hora ya no sirven
alter table dotacion drop column if exists hora;
alter table dotacion add column if not exists turno_id uuid references turnos(id) on delete cascade;
alter table dotacion add primary key (local_id, perfil, puesto, turno_id);


-- =====================================================================
-- arreglo-puesto-en-turno.sql
-- =====================================================================
-- =====================================================================
-- El PUESTO pasa de la PERSONA al TURNO ASIGNADO. 03-10-2026.
--
-- Pedro mando una captura del planning de Skello (msg 3303) y ahi esta la
-- respuesta: cada casilla dice el horario y DEBAJO el puesto (Ronde, Manager,
-- Poste 5). El puesto viaja con el turno, no con el empleado. La prueba son
-- sus solapas «Employes | Postes»: dar vuelta la tabla y poner los puestos
-- como filas solo es posible si el puesto esta en el turno.
--
-- Hasta hoy el puesto era personas.rol, o sea una propiedad de la persona:
-- alguien era garzon O barra, para siempre. Por eso Pedro tuvo que inventar
-- una segunda «Camila» para ponerla en Barra — y eso le partia en dos la
-- propina (propina_de reparte por persona_id) y el saldo de horas.
--
-- Nota: turnos_abiertos YA tenia su propio puesto por fila desde el principio.
-- El modelo bueno ya estaba escrito, pero solo en esa esquina.
--
-- ESTE ARCHIVO NO SUPONE EN QUE ESTADO ESTA LA BASE. Se puede pegar aunque
-- haya quedado sin aplicar el parche de la dotacion de anoche: cada paso
-- comprueba antes de actuar y volver a correrlo entero no hace daño.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Poner al dia la dotacion, si quedo a medias.
-- ---------------------------------------------------------------------
alter table dotacion add column if not exists puesto   text not null default '';
alter table dotacion add column if not exists turno_id uuid references turnos(id) on delete cascade;

do $$
begin
  -- Si todavia esta la columna «hora», la dotacion sigue siendo por hora y sus
  -- filas no sirven: la nueva va por turno.
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'dotacion'
               and column_name = 'hora') then
    alter table dotacion drop constraint if exists dotacion_pkey;
    delete from dotacion;
    alter table dotacion drop column hora;
  end if;

  -- La clave tiene que ser exactamente (local_id, perfil, puesto, turno_id).
  if not exists (
    select 1 from pg_constraint c
     where c.conrelid = 'dotacion'::regclass and c.contype = 'p'
       and (select array_agg(a.attname::text order by a.attname)
              from unnest(c.conkey) k
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k)
           = array['local_id','perfil','puesto','turno_id']
  ) then
    alter table dotacion drop constraint if exists dotacion_pkey;
    delete from dotacion where turno_id is null;   -- no puede ir en la clave
    alter table dotacion add primary key (local_id, perfil, puesto, turno_id);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. El puesto, en la asignacion.
-- ---------------------------------------------------------------------
alter table asignaciones add column if not exists puesto text not null default '';

-- Lo que ya estaba planificado hereda el puesto que hoy tiene la persona, para
-- que nadie vea su malla cambiada de un dia para otro.
update asignaciones a
   set puesto = coalesce(p.rol, '')
  from personas p
 where p.id = a.persona_id
   and a.puesto = ''
   and coalesce(p.rol, '') <> '';

create index if not exists asignaciones_puesto_idx on asignaciones(local_id, fecha, puesto);

-- personas.rol NO se borra: pasa a ser el PUESTO HABITUAL, el que se propone
-- solo al asignarle un turno. Sigue sirviendo para ordenar y agrupar el equipo.
comment on column personas.rol is
  'Puesto habitual. Es solo el valor que se propone al asignar; el puesto de verdad de cada turno vive en asignaciones.puesto.';
comment on column asignaciones.puesto is
  'El puesto que se trabaja ESE turno. Puede no ser el habitual de la persona: barra el lunes y garzon el martes.';

-- ---------------------------------------------------------------------
-- 3. Que el trabajador vea en que puesto va cada dia.
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
               'turno',    t.nombre, 'inicio', t.inicio, 'fin', t.fin, 'colacion', t.colacion,
               -- el puesto de ESE dia; si la asignacion no lo trae, el habitual
               'puesto',   coalesce(nullif(a.puesto, ''), v_persona.rol),
               'ausencia', a.ausencia,
               'confirmo', m.confirmo, 'llego', m.llego,
               'propina',  propina_de(v_persona.id, f.fecha),
               'ofrecido', exists (select 1 from turnos_abiertos ta
                                   where ta.ofrecido_por = v_persona.id and ta.fecha = f.fecha
                                     and ta.tomado_por is null))
             order by f.fecha)
      from (select (generate_series(p_desde::timestamp, (p_desde + 6)::timestamp,
                                    interval '1 day'))::date as fecha) f
      left join asignaciones a on a.persona_id = v_persona.id and a.fecha = f.fecha
      left join turnos t       on t.id = a.turno_id
      left join marcas m       on m.persona_id = v_persona.id and m.fecha = f.fecha
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
-- 4. Al ofrecer un cambio, que el turno salga con el puesto de ESE dia.
--    Antes salia siempre con el puesto habitual de quien lo ofrece, que con
--    el modelo nuevo puede no ser el que se trabaja ese dia.
--    (tomar_turno no se toca: no escribe en asignaciones, solo marca quien
--     se quedo con el turno abierto.)
-- ---------------------------------------------------------------------
create or replace function ofrecer_turno(p_token text, p_fecha date)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_persona personas; v_turno uuid; v_puesto text;
begin
  select * into v_persona from personas where token = p_token and activo;
  if not found then return false; end if;

  select turno_id, nullif(puesto, '') into v_turno, v_puesto from asignaciones
   where persona_id = v_persona.id and fecha = p_fecha and turno_id is not null;
  if v_turno is null then return false; end if;

  -- no ofrecer dos veces el mismo turno
  if exists (select 1 from turnos_abiertos
             where local_id = v_persona.local_id and fecha = p_fecha
               and ofrecido_por = v_persona.id and tomado_por is null) then
    return true;
  end if;

  insert into turnos_abiertos (local_id, fecha, turno_id, puesto, nota, ofrecido_por)
  values (v_persona.local_id, p_fecha, v_turno,
          coalesce(v_puesto, v_persona.rol, ''),
          'cambio ofrecido por ' || v_persona.nombre, v_persona.id);
  return true;
end $$;

grant execute on function ofrecer_turno(text,date) to anon;


-- =====================================================================
-- arreglo-turno-con-horas.sql
-- =====================================================================
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


-- =====================================================================
-- arreglo-reloj-control.sql
-- =====================================================================
-- =====================================================================
-- RELOJ CONTROL: entrada y salida reales, y horas pagadas.
-- 03-10-2026. De las capturas de la Badgeuse de Skello (msgs 3361-3369).
--
-- Su pantalla muestra TRES columnas en paralelo por persona:
--   Previsto (lo que planificaste) · Marcado (lo que marco) · Remunerado.
-- La tercera es la clave: no eligen solos entre lo planificado y lo real,
-- muestran los dos y lo pagado es un dato propio que el jefe puede ajustar.
-- Y al «Validar la journee» preguntan la VENTA de esa fecha.
--
-- Hasta hoy guardabamos `llego` (un si/no) y `hora_llego`, que no la usaba
-- NINGUN calculo: el costo, el banco de horas y la propina salian todos del
-- turno planificado. O sea el que se iba tres horas antes cobraba igual.
--
-- Decision tomada y dicha a Pedro: NO se implementa la foto al marcar. El
-- propio Skello la trae apagada advirtiendo que la CNIL la considera
-- «recoleccion excesiva de datos», y la Ley 21.719 rige en Chile el 1-dic-2026.
--
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Las marcas pasan a ser POR TURNO, no por dia.
--    Con el turno partido, marcar una vez al dia no significa nada: hay que
--    saber a que bloque corresponde cada entrada y cada salida.
-- ---------------------------------------------------------------------
alter table marcas add column if not exists marcado_por text;   -- por si falto ese parche
alter table marcas add column if not exists asignacion_id uuid references asignaciones(id) on delete cascade;
alter table marcas add column if not exists entrada timestamptz;
alter table marcas add column if not exists salida  timestamptz;

-- Lo que ya hay se pega al PRIMER turno de ese dia, que es el unico que habia.
update marcas m
   set asignacion_id = (select a.id from asignaciones a
                         where a.persona_id = m.persona_id and a.fecha = m.fecha
                           and a.inicio is not null
                         order by a.inicio limit 1)
 where m.asignacion_id is null;

update marcas set entrada = hora_llego
 where entrada is null and hora_llego is not null;

-- Marcas de dias en que ya no hay turno: no se pueden colgar de ninguna parte.
delete from marcas where asignacion_id is null;

do $$
begin
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'marcas'::regclass and c.contype = 'p'
                    and (select array_agg(att.attname::text)
                           from unnest(c.conkey) k
                           join pg_attribute att on att.attrelid = c.conrelid and att.attnum = k)
                        = array['asignacion_id']) then
    alter table marcas drop constraint if exists marcas_pkey;
    alter table marcas alter column asignacion_id set not null;
    alter table marcas add primary key (asignacion_id);
  end if;
end $$;

create index if not exists marcas_persona_fecha_idx on marcas (persona_id, fecha);

-- ---------------------------------------------------------------------
-- 2. Las horas que se PAGAN.
--    `horas_pagadas` vacio = vale la regla del local. Lleno = lo decidio el
--    jefe mirando las otras dos columnas, que es justo lo que hace Skello.
-- ---------------------------------------------------------------------
alter table asignaciones add column if not exists horas_pagadas numeric(5,2);
comment on column asignaciones.horas_pagadas is
  'Horas que se pagan por este turno. Vacio = sale de la regla del local (lo marcado o lo planificado). Lleno = lo ajusto el jefe a mano.';

-- La regla del local: «si debia salir a las 18:00 y salio 17:55, cuento 17:55».
-- En Skello es un interruptor y aca tambien.
alter table locales add column if not exists pagar_marcado boolean not null default true;
comment on column locales.pagar_marcado is
  'true = se pagan las horas realmente marcadas. false = se paga lo planificado aunque haya marcado distinto.';

-- Cerrar el dia, que es cuando se carga la venta.
alter table dias add column if not exists cerrado_en  timestamptz;
alter table dias add column if not exists cerrado_por uuid references auth.users(id);

-- ---------------------------------------------------------------------
-- 3. Una sola definicion de «cuantas horas vale este turno», para que la
--    propina, el costo y el banco de horas no se contradigan entre si.
-- ---------------------------------------------------------------------
create or replace function horas_pagadas_de(p_asignacion uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    a.horas_pagadas,
    case
      when l.pagar_marcado and m.entrada is not null and m.salida is not null
        then greatest(extract(epoch from (m.salida - m.entrada)) / 3600.0 - coalesce(a.colacion,0), 0)
      else coalesce(a.fin - a.inicio - a.colacion, 0)
    end)
  from asignaciones a
  join locales l on l.id = a.local_id
  left join marcas m on m.asignacion_id = a.id
  where a.id = p_asignacion and a.inicio is not null;
$$;

-- ---------------------------------------------------------------------
-- 4. La propina se reparte por las horas que SE PAGAN, no por las del papel.
--    Es el cambio que Pedro tiene que ver venir: hasta hoy el que se iba
--    temprano cobraba igual que el que se quedaba.
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
           sum(horas_pagadas_de(a.id) * p.factor_propina) as w
    from asignaciones a
    join yo on a.local_id = yo.local_id
    join personas p on p.id = a.persona_id and p.activo
    where a.fecha = p_fecha
      and a.inicio is not null
    group by a.persona_id
    having sum(horas_pagadas_de(a.id) * p.factor_propina) > 0
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
-- 5. Marcar: ahora es por TURNO y la hora la pone el SERVIDOR.
--    Que la ponga el servidor no es un detalle: si la pusiera el telefono,
--    cualquiera la cambia adelantando el reloj del aparato.
-- ---------------------------------------------------------------------
create or replace function marcar_turno(p_token text, p_asignacion uuid, p_accion text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_persona personas; v_a asignaciones; v_m marcas;
begin
  select * into v_persona from personas where token = p_token and activo;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'link'); end if;

  select * into v_a from asignaciones
   where id = p_asignacion and persona_id = v_persona.id and inicio is not null;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no_es_tuyo'); end if;

  insert into marcas (asignacion_id, persona_id, fecha)
  values (p_asignacion, v_persona.id, v_a.fecha)
  on conflict (asignacion_id) do nothing;

  select * into v_m from marcas where asignacion_id = p_asignacion;

  if p_accion = 'entrada' then
    if v_m.entrada is not null then
      return jsonb_build_object('ok', false, 'motivo', 'ya_entro', 'entrada', v_m.entrada);
    end if;
    update marcas set entrada = now(), llego = true, hora_llego = now(),
                      marcado_por = 'trabajador'
     where asignacion_id = p_asignacion;

  elsif p_accion = 'salida' then
    if v_m.entrada is null then
      return jsonb_build_object('ok', false, 'motivo', 'sin_entrada');
    end if;
    if v_m.salida is not null then
      return jsonb_build_object('ok', false, 'motivo', 'ya_salio', 'salida', v_m.salida);
    end if;
    update marcas set salida = now(), marcado_por = 'trabajador'
     where asignacion_id = p_asignacion;

  elsif p_accion in ('confirmo','no_puedo') then
    update marcas set confirmo = (p_accion = 'confirmo'), marcado_por = 'trabajador'
     where asignacion_id = p_asignacion;

  else
    return jsonb_build_object('ok', false, 'motivo', 'accion_desconocida');
  end if;

  select * into v_m from marcas where asignacion_id = p_asignacion;
  return jsonb_build_object('ok', true, 'entrada', v_m.entrada, 'salida', v_m.salida,
                            'confirmo', v_m.confirmo);
end $$;

grant execute on function marcar_turno(text,uuid,text) to anon;

-- La vieja marcaba por dia y por eso ya no sirve con el turno partido.
drop function if exists marcar(text,date,text,boolean);

-- ---------------------------------------------------------------------
-- 6. La semana del trabajador: cada turno con su entrada, su salida y lo
--    que lleva pagado.
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
               'turnos', coalesce((
                  select jsonb_agg(jsonb_build_object(
                           'id',       a.id,
                           'turno',    t.nombre,
                           'inicio',   a.inicio, 'fin', a.fin, 'colacion', a.colacion,
                           'puesto',   coalesce(nullif(a.puesto,''), v_persona.rol),
                           'nota',     a.nota,
                           'confirmo', m.confirmo,
                           'entrada',  m.entrada,
                           'salida',   m.salida,
                           'horas',    horas_pagadas_de(a.id))
                         order by a.inicio)
                  from asignaciones a
                  left join turnos t on t.id = a.turno_id
                  left join marcas m on m.asignacion_id = a.id
                  where a.persona_id = v_persona.id and a.fecha = f.fecha
                    and a.inicio is not null), '[]'::jsonb),
               'ausencia', (select a.ausencia from asignaciones a
                             where a.persona_id = v_persona.id and a.fecha = f.fecha
                               and a.ausencia is not null limit 1),
               'propina',  propina_de(v_persona.id, f.fecha),
               'ofrecido', exists (select 1 from turnos_abiertos ta
                                   where ta.ofrecido_por = v_persona.id and ta.fecha = f.fecha
                                     and ta.tomado_por is null))
             order by f.fecha)
      from (select (generate_series(p_desde::timestamp, (p_desde + 6)::timestamp,
                                    interval '1 day'))::date as fecha) f
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


-- =====================================================================
-- arreglo-puestos.sql
-- =====================================================================
-- =====================================================================
-- LOS PUESTOS PASAN A SER UNA LISTA DE VERDAD. 03-10-2026.
--
-- Pedro, mirando la pantalla de dotacion: «seria conveniente que tambien se
-- pudiera editar, puestos por ejemplo».
--
-- Hoy un puesto no existe como cosa: «Barra» aparece en la lista SOLO porque
-- alguien lo tiene escrito en su ficha. De ahi salen tres problemas:
--   1. No se puede crear un puesto antes de tener a la persona, asi que no se
--      puede planificar «necesito 2 de Bodega» antes de contratar a nadie.
--   2. Renombrar es imposible sin editar persona por persona y turno por turno.
--   3. «Barra» y «barra» son dos puestos distintos para la app.
--
-- Skello los tiene como catalogo con NOMBRE, COLOR y MINUTOS DE COLACION, y
-- de ahi sale el color de los bloques del planning. Se ve en sus capturas.
--
-- Idempotente.
-- =====================================================================

create table if not exists puestos (
  id       uuid primary key default gen_random_uuid(),
  local_id uuid not null references locales(id) on delete cascade,
  nombre   text not null,
  color    smallint not null default 1,          -- 1..4, los mismos de la malla
  colacion numeric(4,2),                         -- minutos por defecto; vacio = la del turno
  orden    integer not null default 0,
  activo   boolean not null default true
);
create index if not exists puestos_local_idx on puestos(local_id);

-- Un mismo nombre no puede estar dos veces en el mismo local, sin importar
-- mayusculas ni espacios: es justo lo que hoy deja crear «Barra» y «barra».
create unique index if not exists puestos_unicos
  on puestos (local_id, lower(btrim(nombre)));

alter table puestos enable row level security;

drop policy if exists puestos_ver on puestos;
create policy puestos_ver on puestos for select using (es_mi_local(local_id));
drop policy if exists puestos_tocar on puestos;
create policy puestos_tocar on puestos for all using (es_mi_local(local_id))
  with check (es_mi_local(local_id));

-- ---------------------------------------------------------------------
-- Sembrar la lista con los puestos que YA se usan, para que nadie tenga que
-- volver a escribirlos: los habituales del equipo mas los de las asignaciones.
-- ---------------------------------------------------------------------
insert into puestos (local_id, nombre, orden)
select x.local_id, x.nombre,
       row_number() over (partition by x.local_id order by x.nombre)
from (
  select distinct p.local_id, btrim(p.rol) as nombre
    from personas p where btrim(coalesce(p.rol,'')) <> ''
  union
  select distinct a.local_id, btrim(a.puesto)
    from asignaciones a where btrim(coalesce(a.puesto,'')) <> ''
) x
where not exists (
  select 1 from puestos q
   where q.local_id = x.local_id and lower(btrim(q.nombre)) = lower(x.nombre));

-- El color se reparte en los cuatro de la malla, por orden, para que no salgan
-- todos del mismo.
update puestos set color = ((orden - 1) % 4) + 1 where color = 1 and orden > 0;

-- ---------------------------------------------------------------------
-- Renombrar un puesto en un solo lugar: arrastra a las personas y a los turnos
-- ya asignados. Es lo que hoy obliga a editar ficha por ficha.
-- ---------------------------------------------------------------------
create or replace function renombrar_puesto(p_puesto uuid, p_nombre text)
returns void language plpgsql security definer set search_path = public as $$
declare v_viejo text; v_local uuid;
begin
  select nombre, local_id into v_viejo, v_local from puestos where id = p_puesto;
  if not found then raise exception 'ese puesto no existe'; end if;
  if not es_mi_local(v_local) then raise exception 'ese puesto no es de tu local'; end if;
  if btrim(coalesce(p_nombre,'')) = '' then raise exception 'el nombre no puede ir vacio'; end if;

  update puestos set nombre = btrim(p_nombre) where id = p_puesto;
  update personas    set rol    = btrim(p_nombre)
   where local_id = v_local and lower(btrim(rol))    = lower(btrim(v_viejo));
  update asignaciones set puesto = btrim(p_nombre)
   where local_id = v_local and lower(btrim(puesto)) = lower(btrim(v_viejo));
  update dotacion    set puesto = btrim(p_nombre)
   where local_id = v_local and lower(btrim(puesto)) = lower(btrim(v_viejo));
end $$;

-- ---------------------------------------------------------------------
-- PERMISOS. Sin esto la tabla nueva no la puede leer NI EL DUEÑO.
-- Ya pasó el 02-10 y la app cargó en blanco: con «Automatically expose new
-- tables» desactivado —que es lo correcto—, una tabla recién creada no recibe
-- permisos para ningún rol de la API. Las reglas por fila de arriba siguen
-- mandando; esto solo le abre la puerta a quien tiene sesión.
-- ---------------------------------------------------------------------
grant select, insert, update, delete on puestos to authenticated;
grant execute on function renombrar_puesto(uuid,text) to authenticated;
revoke all on puestos from anon;


-- =====================================================================
-- arreglo-sin-asignar.sql
-- =====================================================================
-- =====================================================================
-- EL TURNO SIN ASIGNAR ES UN TURNO MÁS, SIN PERSONA. 03-10-2026.
--
-- De las capturas de Skello: en su vista por puestos, el desplegable de quién
-- cubre un turno tiene «Non assigné» como UNA OPCIÓN MÁS de la lista de
-- empleados. No es otra cosa: es el mismo turno con la persona vacía. Por eso
-- ellos no tienen una pestaña aparte y lo publican desde la propia malla.
--
-- Nosotros teníamos `turnos_abiertos` como tabla SEPARADA, y de ahí salían
-- tres síntomas:
--   1. Vivían en otra pestaña, lejos de donde se planifica.
--   2. `tomar_turno` NO escribía en `asignaciones`, así que un turno tomado no
--      aparecía en la malla hasta que alguien lo pasaba a mano.
--   3. Solo se podían publicar en la semana que se estaba viendo y eligiendo
--      un turno del catálogo, nunca un horario cualquiera.
--
-- Idempotente. Se puede pegar dos veces.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Este archivo NECESITA que antes este aplicado arreglo-reloj-control.sql,
--    porque mi_semana usa horas_pagadas_de() y marcas.asignacion_id. Mejor un
--    aviso claro aca que un error raro treinta lineas mas abajo.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'marcas'
                    and column_name = 'asignacion_id') then
    raise exception 'Falta aplicar antes arreglo-reloj-control.sql. Pega ese primero y despues este.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. La persona pasa a ser opcional.
-- ---------------------------------------------------------------------
alter table asignaciones alter column persona_id drop not null;
alter table asignaciones add column if not exists ofrecido_por uuid references personas(id) on delete set null;
alter table asignaciones add column if not exists tomado_por   uuid references personas(id) on delete set null;
alter table asignaciones add column if not exists tomado_en    timestamptz;
-- De qué fila de turnos_abiertos vino, para que traer los datos dos veces no
-- los duplique.
alter table asignaciones add column if not exists origen_abierto uuid;
create unique index if not exists asignaciones_origen_unico
  on asignaciones (origen_abierto) where origen_abierto is not null;

comment on column asignaciones.persona_id is
  'Vacío = turno sin asignar, el «Non assigné» de Skello. No es otra tabla: es el mismo turno sin dueño.';

-- ---------------------------------------------------------------------
-- 2. Traer lo que haya en turnos_abiertos.
-- ---------------------------------------------------------------------
insert into asignaciones (local_id, persona_id, fecha, turno_id, inicio, fin, colacion,
                          puesto, nota, ofrecido_por, tomado_por, tomado_en, origen_abierto)
select ta.local_id, ta.tomado_por, ta.fecha, ta.turno_id, t.inicio, t.fin, t.colacion,
       ta.puesto, ta.nota, ta.ofrecido_por, ta.tomado_por, ta.tomado_en, ta.id
  from turnos_abiertos ta
  join turnos t on t.id = ta.turno_id
 where not exists (select 1 from asignaciones a where a.origen_abierto = ta.id)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 3. Tomar un turno = ponerle la persona. Antes solo marcaba quién lo tomó en
--    la otra tabla y la malla no se enteraba.
-- ---------------------------------------------------------------------
create or replace function tomar_turno(p_token text, p_abierto uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_persona personas; v_a asignaciones; v_local locales;
  v_lunes date; v_horas numeric; v_extra numeric; v_ok int;
begin
  select * into v_persona from personas where token = p_token and activo;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'link'); end if;

  select * into v_a from asignaciones
   where id = p_abierto and local_id = v_persona.local_id and inicio is not null;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  -- se puede tomar lo que no tiene dueño, o lo que alguien ofrecio
  if v_a.persona_id is not null and v_a.ofrecido_por is null then
    return jsonb_build_object('ok', false, 'motivo', 'tomado');
  end if;
  if v_a.persona_id = v_persona.id then
    return jsonb_build_object('ok', false, 'motivo', 'ya_es_tuyo');
  end if;

  -- no se puede tomar algo que se pisa con un turno propio del mismo dia
  if exists (select 1 from asignaciones x
              where x.persona_id = v_persona.id and x.fecha = v_a.fecha
                and x.inicio is not null
                and x.inicio < v_a.fin and v_a.inicio < x.fin) then
    return jsonb_build_object('ok', false, 'motivo', 'se_pisa');
  end if;

  select * into v_local from locales where id = v_persona.local_id;

  v_lunes := v_a.fecha - ((extract(isodow from v_a.fecha)::int - 1));
  select coalesce(sum(a.fin - a.inicio - a.colacion), 0) into v_horas
    from asignaciones a
   where a.persona_id = v_persona.id and a.inicio is not null
     and a.fecha between v_lunes and v_lunes + 6;
  v_extra := v_a.fin - v_a.inicio - coalesce(v_a.colacion,0);

  if v_local.bloquear_sobre_tope and (v_horas + v_extra) > v_persona.horas_contrato then
    return jsonb_build_object('ok', false, 'motivo', 'tope',
                              'horas', v_horas + v_extra, 'contrato', v_persona.horas_contrato);
  end if;

  -- la carrera se resuelve en la base: si dos aprietan a la vez, gana uno solo
  update asignaciones
     set persona_id = v_persona.id, tomado_por = v_persona.id, tomado_en = now(),
         ofrecido_por = null,
         puesto = coalesce(nullif(puesto,''), v_persona.rol, '')
   where id = p_abierto
     and (persona_id is null or ofrecido_por is not null)
     and coalesce(persona_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_persona.id;
  get diagnostics v_ok = row_count;
  if v_ok <> 1 then return jsonb_build_object('ok', false, 'motivo', 'tomado'); end if;

  return jsonb_build_object('ok', true, 'horas', v_horas + v_extra,
                            'contrato', v_persona.horas_contrato);
end $$;

grant execute on function tomar_turno(text,uuid) to anon;

-- ---------------------------------------------------------------------
-- 4. Ofrecer un turno = marcarlo como disponible, SIN soltarlo.
--    Sigue siendo suyo hasta que alguien lo tome. Si al ofrecerlo se le quitara
--    de inmediato, un turno que nadie toma quedaría descubierto, que es
--    exactamente lo contrario de lo que se busca.
-- ---------------------------------------------------------------------
create or replace function ofrecer_turno(p_token text, p_asignacion uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_persona personas; v_a asignaciones;
begin
  select * into v_persona from personas where token = p_token and activo;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'link'); end if;

  select * into v_a from asignaciones
   where id = p_asignacion and persona_id = v_persona.id and inicio is not null;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no_es_tuyo'); end if;

  update asignaciones
     set ofrecido_por = v_persona.id
   where id = p_asignacion;

  return jsonb_build_object('ok', true);
end $$;

drop function if exists ofrecer_turno(text,date);
grant execute on function ofrecer_turno(text,uuid) to anon;

-- ---------------------------------------------------------------------
-- 5. La semana del trabajador: los turnos libres salen de asignaciones.
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
               'turnos', coalesce((
                  select jsonb_agg(jsonb_build_object(
                           'id',       a.id,
                           'turno',    t.nombre,
                           'inicio',   a.inicio, 'fin', a.fin, 'colacion', a.colacion,
                           'puesto',   coalesce(nullif(a.puesto,''), v_persona.rol),
                           'nota',     a.nota,
                           'confirmo', m.confirmo,
                           'entrada',  m.entrada,
                           'salida',   m.salida,
                           'horas',    horas_pagadas_de(a.id))
                         order by a.inicio)
                  from asignaciones a
                  left join turnos t on t.id = a.turno_id
                  left join marcas m on m.asignacion_id = a.id
                  where a.persona_id = v_persona.id and a.fecha = f.fecha
                    and a.inicio is not null), '[]'::jsonb),
               'ausencia', (select a.ausencia from asignaciones a
                             where a.persona_id = v_persona.id and a.fecha = f.fecha
                               and a.ausencia is not null limit 1),
               'propina',  propina_de(v_persona.id, f.fecha),
               'ofrecido', exists (select 1 from asignaciones a
                                   where a.ofrecido_por = v_persona.id and a.fecha = f.fecha))
             order by f.fecha)
      from (select (generate_series(p_desde::timestamp, (p_desde + 6)::timestamp,
                                    interval '1 day'))::date as fecha) f
    ), '[]'::jsonb),
    'abiertos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'fecha', a.fecha, 'puesto', a.puesto, 'nota', a.nota,
               'turno', t.nombre, 'inicio', a.inicio, 'fin', a.fin, 'colacion', a.colacion,
               'propio', a.ofrecido_por = v_persona.id,
               'libre', true)
             order by a.fecha, a.inicio)
      from asignaciones a left join turnos t on t.id = a.turno_id
      where a.local_id = v_persona.local_id
        and (a.persona_id is null or a.ofrecido_por is not null)
        and a.inicio is not null and a.fecha >= p_desde
        and coalesce(a.persona_id,   '00000000-0000-0000-0000-000000000000'::uuid) <> v_persona.id
        and coalesce(a.ofrecido_por, '00000000-0000-0000-0000-000000000000'::uuid) <> v_persona.id
    ), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;

grant execute on function mi_semana(text,date) to anon;

-- `turnos_abiertos` NO se borra todavía: queda ahí por si hay que mirar algo.
-- Dejar de usarla y borrarla son dos pasos distintos, y el segundo se hace
-- cuando esto lleve unos días funcionando.


---------------------------------------------------------------------
-- arreglo-modelos.sql
---------------------------------------------------------------------
-- =====================================================================
-- MODELOS DE SEMANA GUARDADOS. 04-10-2026.
--
-- Pedro eligio esta como la primera de la lista del 04-10 (opcion A).
--
-- POR QUE ES LA QUE MAS PESA: una semana de local se parece muchisimo a la
-- anterior —los mismos puestos, los mismos horarios, casi la misma gente—
-- pero hoy se arma turno por turno. Es la diferencia entre dos minutos y
-- veinte, y es la funcion que hace que alguien deje el Excel.
--
-- Ya existia «Copiar la anterior», que resuelve el caso facil: la semana
-- pasada sirve. No resuelve el de verdad: el local tiene DOS O TRES semanas
-- tipo (invierno, verano, fin de semana largo) y la anterior puede ser justo
-- la rara. Un modelo CON NOMBRE se elige; «la anterior» se acepta.
--
-- Lo que se guarda es el DIA DE LA SEMANA (0=lunes), no la fecha: por eso un
-- modelo se puede aplicar a cualquier semana.
--
-- LAS AUSENCIAS NO ENTRAN. Lo advierte el propio tutorial de Skello y es obvio
-- al pensarlo: una vacacion de la semana pasada no se repite todas las semanas,
-- y si el modelo la trae, se duplica.
--
-- POR QUE NO SE LLAMA `plantillas`: en esta app «plantilla» YA significa otra
-- cosa —la plantilla de un TURNO, que es de donde `asignaciones.turno_id` saca
-- el nombre y el color—. Dos cosas distintas con el mismo nombre en el mismo
-- modelo de datos es una confusion que despues se paga leyendo codigo.
--
-- Idempotente: se puede pegar las veces que haga falta.
-- =====================================================================

create table if not exists modelos_semana (
  id       uuid primary key default gen_random_uuid(),
  local_id uuid not null references locales(id) on delete cascade,
  nombre   text not null,
  creada   timestamptz not null default now()
);
create index if not exists modelos_local_idx on modelos_semana(local_id);

-- Mismo criterio que en puestos: «Verano» y «verano » son el mismo modelo.
create unique index if not exists modelos_unicos
  on modelos_semana (local_id, lower(btrim(nombre)));

-- ---------------------------------------------------------------------
-- Los turnos del modelo. Mismas columnas que un turno de verdad, salvo que
-- en vez de FECHA llevan DIA DE LA SEMANA.
--
-- persona_id es NULL a proposito en dos casos distintos, y conviene no
-- confundirlos: el modelo se guardo sin personas (solo la forma), o la
-- persona que estaba ahi fue borrada del equipo despues. Los dos terminan
-- igual —un turno sin asignar— asi que la app no necesita distinguirlos.
-- ---------------------------------------------------------------------
create table if not exists modelo_turnos (
  id           uuid primary key default gen_random_uuid(),
  modelo_id uuid not null references modelos_semana(id) on delete cascade,
  dow          smallint not null check (dow between 0 and 6),   -- 0 = lunes
  persona_id   uuid references personas(id) on delete set null,
  turno_id     uuid references turnos(id)   on delete set null,
  inicio       numeric(4,2) not null,
  fin          numeric(4,2) not null,
  colacion     numeric(4,2) not null default 0,
  puesto       text not null default '',
  nota         text not null default ''
);
create index if not exists modelo_turnos_idx on modelo_turnos(modelo_id);

comment on column modelo_turnos.dow is
  '0=lunes … 6=domingo. Se guarda el dia de la semana y no la fecha, que es lo que permite aplicar el modelo a cualquier semana.';
comment on column modelo_turnos.persona_id is
  'NULL = turno sin asignar: o el modelo se guardo sin personas, o la persona se borro del equipo.';

-- ---------------------------------------------------------------------
-- Seguridad: igual que el resto. El dueño del local y nadie mas.
--
-- En modelo_turnos no se repite local_id: se pregunta por el de su
-- modelo. Asi no hay dos copias del mismo dato que puedan discrepar.
-- ---------------------------------------------------------------------
alter table modelos_semana       enable row level security;
alter table modelo_turnos enable row level security;

drop policy if exists modelos_tocar on modelos_semana;
create policy modelos_tocar on modelos_semana for all
  using (es_mi_local(local_id)) with check (es_mi_local(local_id));

drop policy if exists modelo_turnos_tocar on modelo_turnos;
create policy modelo_turnos_tocar on modelo_turnos for all
  using (exists (select 1 from modelos_semana p
                  where p.id = modelo_id and es_mi_local(p.local_id)))
  with check (exists (select 1 from modelos_semana p
                       where p.id = modelo_id and es_mi_local(p.local_id)));

-- ---------------------------------------------------------------------
-- PERMISOS. Esto no es opcional y es facil de olvidar.
--
-- `esquema.sql` hace un `grant ... on ALL TABLES in schema public`, pero eso
-- alcanza a las tablas que existian EN ESE MOMENTO: una tabla creada despues
-- nace sin permisos para `authenticated`, y la app falla con
-- «permission denied for table ...» aunque la tabla exista y las reglas por
-- fila esten bien puestas.
--
-- Pasa justamente eso el 04-10: se creo la tabla, se escribieron las policies
-- y se olvido el grant. `arreglo-puestos.sql` ya traia el suyo por la misma
-- razon; habia que copiarlo y no se copio.
--
-- Las policies deciden QUE FILAS ve cada uno; el grant decide si puede tocar
-- la tabla siquiera. Hacen falta los dos.
-- ---------------------------------------------------------------------
grant select, insert, update, delete on modelos_semana to authenticated;
grant select, insert, update, delete on modelo_turnos  to authenticated;
