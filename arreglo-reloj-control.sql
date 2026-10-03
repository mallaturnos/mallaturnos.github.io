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
