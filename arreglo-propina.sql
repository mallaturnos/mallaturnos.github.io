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
