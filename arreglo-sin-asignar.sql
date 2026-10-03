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
 where not exists (select 1 from asignaciones a where a.origen_abierto = ta.id);

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
