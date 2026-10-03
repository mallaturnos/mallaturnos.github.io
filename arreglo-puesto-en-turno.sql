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
