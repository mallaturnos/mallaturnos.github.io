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
