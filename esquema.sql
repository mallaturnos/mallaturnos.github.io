-- =====================================================================
-- Malla de Turnos — esquema de la base (Supabase / Postgres)
-- Escrito el 02-10-2026. NO aplicado todavía: Pedro aún no crea la cuenta.
--
-- DECISIÓN CENTRAL DE SEGURIDAD
-- El trabajador NO tiene cuenta: entra con un link que lleva su token.
-- Por eso el rol anónimo NO puede leer ni escribir NINGUNA tabla.
-- Solo puede EJECUTAR las tres funciones del final, que reciben el token
-- y devuelven o escriben únicamente lo de esa persona.
-- Si se dejara leer las tablas al anónimo, cualquiera con la dirección de
-- la app vería el equipo entero y los sueldos. Esto lo impide por diseño.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- locales ----------
create table locales (
  id           uuid primary key default gen_random_uuid(),
  dueno_id     uuid not null references auth.users(id) on delete cascade,
  nombre       text not null,
  objetivo_pct numeric(5,2) not null default 30,   -- costo de personal sobre venta
  tope_semanal numeric(5,2) not null default 42,   -- Ley 21.561: 42 h hoy, 40 en abril 2028
  creado       timestamptz not null default now()
);

-- ---------- personas ----------
-- Sin RUT, sin dirección, sin teléfono: decisión de privacidad de Pedro
-- (17-sep) y de la Ley 21.719, que entra el 1-dic-2026.
create table personas (
  id             uuid primary key default gen_random_uuid(),
  local_id       uuid not null references locales(id) on delete cascade,
  nombre         text not null,
  rol            text not null default '',
  valor_hora     integer not null default 0,
  horas_contrato numeric(5,2) not null default 42,  -- se valida contra ESTO, no contra un tope único
  tipo_contrato  text not null default 'indefinido',
  factor_propina numeric(4,2) not null default 1,   -- acuerdo del equipo (art. 64), 1 = por horas puras
  feriado_tomado integer not null default 0,
  token          text not null unique default encode(gen_random_bytes(16),'hex'),
  activo         boolean not null default true,
  creado         timestamptz not null default now()
);
create index on personas(local_id);

-- ---------- catálogo de turnos ----------
create table turnos (
  id       uuid primary key default gen_random_uuid(),
  local_id uuid not null references locales(id) on delete cascade,
  nombre   text not null,
  inicio   numeric(4,2) not null,          -- horas decimales: 8.5 = 08:30
  fin      numeric(4,2) not null,          -- > 24 cruza la medianoche
  colacion numeric(4,2) not null default 0.5,
  orden    integer not null default 0
);
create index on turnos(local_id);

-- ---------- asignaciones: una fila por persona y día ----------
-- turno_id lleno = trabaja · ausencia llena = libre/vacaciones/licencia/falta
create table asignaciones (
  id         uuid primary key default gen_random_uuid(),
  local_id   uuid not null references locales(id) on delete cascade,
  persona_id uuid not null references personas(id) on delete cascade,
  fecha      date not null,
  turno_id   uuid references turnos(id) on delete set null,
  ausencia   text,                          -- 'L','V','E','F'
  unique (persona_id, fecha),
  check (turno_id is not null or ausencia is not null)
);
create index on asignaciones(local_id, fecha);

-- ---------- lo que marca el trabajador ----------
create table marcas (
  persona_id uuid not null references personas(id) on delete cascade,
  fecha      date not null,
  confirmo   boolean,                       -- null = no ha contestado
  llego      boolean,
  hora_llego timestamptz,
  primary key (persona_id, fecha)
);

-- ---------- turnos abiertos: el primero que lo toma se lo queda ----------
create table turnos_abiertos (
  id          uuid primary key default gen_random_uuid(),
  local_id    uuid not null references locales(id) on delete cascade,
  fecha       date not null,
  turno_id    uuid not null references turnos(id) on delete cascade,
  puesto      text not null default '',
  nota        text not null default '',
  tomado_por  uuid references personas(id) on delete set null,
  tomado_en   timestamptz,
  creado      timestamptz not null default now()
);
create index on turnos_abiertos(local_id, fecha);

-- ---------- plata del día ----------
-- La propina va SEPARADA en efectivo y tarjeta, y no es un capricho:
-- la de tarjeta sale del cierre de la máquina, así que el garzón la puede
-- contrastar. El efectivo es lo que siempre se discute. Además, por el
-- art. 64 de la tarjeta NO se puede descontar la comisión, así que ese
-- monto debe entrar completo.
create table dias (
  local_id         uuid not null references locales(id) on delete cascade,
  fecha            date not null,
  venta            integer not null default 0,
  propina_efectivo integer not null default 0,
  propina_tarjeta  integer not null default 0,
  cargado_por      uuid references auth.users(id),
  cargado_en       timestamptz,
  primary key (local_id, fecha),
  check (propina_efectivo >= 0 and propina_tarjeta >= 0)
);

-- Toda corrección de un monto ya cargado queda registrada. Si el reparto
-- ya se mostró al equipo y después cambia, tiene que poder verse.
create table dias_cambios (
  id        bigserial primary key,
  local_id  uuid not null,
  fecha     date not null,
  campo     text not null,
  antes     integer,
  despues   integer,
  quien     uuid,
  cuando    timestamptz not null default now()
);

create or replace function registrar_cambio_dia() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.propina_efectivo is distinct from old.propina_efectivo then
      insert into dias_cambios(local_id,fecha,campo,antes,despues,quien)
      values (new.local_id,new.fecha,'propina_efectivo',old.propina_efectivo,new.propina_efectivo,auth.uid());
    end if;
    if new.propina_tarjeta is distinct from old.propina_tarjeta then
      insert into dias_cambios(local_id,fecha,campo,antes,despues,quien)
      values (new.local_id,new.fecha,'propina_tarjeta',old.propina_tarjeta,new.propina_tarjeta,auth.uid());
    end if;
  end if;
  new.cargado_por := auth.uid();
  new.cargado_en  := now();
  return new;
end $$;

create trigger trg_dias_cambios before insert or update on dias
  for each row execute function registrar_cambio_dia();

-- ---------- dotación necesaria por hora ----------
create table dotacion (
  local_id uuid not null references locales(id) on delete cascade,
  perfil   text not null,                   -- 'semana' | 'finde'
  hora     smallint not null,               -- 8..24
  cantidad smallint not null default 0,
  primary key (local_id, perfil, hora)
);

-- =====================================================================
-- RLS: el dueño ve y escribe lo suyo. Nadie más toca las tablas.
-- =====================================================================
alter table locales         enable row level security;
alter table personas        enable row level security;
alter table turnos          enable row level security;
alter table asignaciones    enable row level security;
alter table marcas          enable row level security;
alter table turnos_abiertos enable row level security;
alter table dias            enable row level security;
alter table dias_cambios    enable row level security;
alter table dotacion        enable row level security;

create policy dueno_local on locales
  for all using (dueno_id = auth.uid()) with check (dueno_id = auth.uid());

-- helper: ¿este local es mío?
create or replace function es_mi_local(l uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from locales where id = l and dueno_id = auth.uid());
$$;

create policy dueno_personas  on personas        for all
  using (es_mi_local(local_id)) with check (es_mi_local(local_id));
create policy dueno_turnos    on turnos          for all
  using (es_mi_local(local_id)) with check (es_mi_local(local_id));
create policy dueno_asig      on asignaciones    for all
  using (es_mi_local(local_id)) with check (es_mi_local(local_id));
create policy dueno_abiertos  on turnos_abiertos for all
  using (es_mi_local(local_id)) with check (es_mi_local(local_id));
create policy dueno_dias      on dias            for all
  using (es_mi_local(local_id)) with check (es_mi_local(local_id));
create policy dueno_dotacion  on dotacion        for all
  using (es_mi_local(local_id)) with check (es_mi_local(local_id));
create policy dueno_cambios   on dias_cambios    for select
  using (es_mi_local(local_id));
create policy dueno_marcas    on marcas          for all
  using (exists (select 1 from personas p
                 where p.id = marcas.persona_id and es_mi_local(p.local_id)));

-- =====================================================================
-- La puerta del trabajador: SOLO estas tres funciones.
-- Reciben el token del link. No exponen ninguna tabla.
-- =====================================================================

-- 1) su semana, y nada más que la suya
create or replace function mi_semana(p_token text, p_desde date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_persona personas; v_out jsonb;
begin
  select * into v_persona from personas where token = p_token and activo;
  if not found then return null; end if;

  select jsonb_build_object(
    'nombre', v_persona.nombre,
    'rol',    v_persona.rol,
    'dias', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fecha', a.fecha,
               'turno', t.nombre, 'inicio', t.inicio, 'fin', t.fin, 'colacion', t.colacion,
               'ausencia', a.ausencia,
               'confirmo', m.confirmo, 'llego', m.llego)
             order by a.fecha)
      from asignaciones a
      left join turnos t on t.id = a.turno_id
      left join marcas m on m.persona_id = a.persona_id and m.fecha = a.fecha
      where a.persona_id = v_persona.id and a.fecha between p_desde and p_desde + 6), '[]'::jsonb),
    'propinas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fecha', d.fecha, 'efectivo', d.propina_efectivo, 'tarjeta', d.propina_tarjeta,
               'cargado_en', d.cargado_en)
             order by d.fecha)
      from dias d
      where d.local_id = v_persona.local_id
        and d.fecha between p_desde and p_desde + 6
        and (d.propina_efectivo + d.propina_tarjeta) > 0), '[]'::jsonb),
    'factor', v_persona.factor_propina,
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

-- 2) confirmar / decir que no puede / marcar que llegó
create or replace function marcar(p_token text, p_fecha date, p_campo text, p_valor boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from personas where token = p_token and activo;
  if v_id is null then return false; end if;
  if p_campo not in ('confirmo','llego') then return false; end if;
  -- solo puede marcar un día que efectivamente le toca
  if not exists (select 1 from asignaciones
                 where persona_id = v_id and fecha = p_fecha and turno_id is not null) then
    return false;
  end if;
  insert into marcas (persona_id, fecha) values (v_id, p_fecha) on conflict do nothing;
  if p_campo = 'confirmo' then
    update marcas set confirmo = p_valor where persona_id = v_id and fecha = p_fecha;
  else
    update marcas set llego = p_valor,
                      hora_llego = case when p_valor then now() else null end
     where persona_id = v_id and fecha = p_fecha;
  end if;
  return true;
end $$;

-- 3) tomar un turno abierto — el primero se lo queda, sin empates
create or replace function tomar_turno(p_token text, p_abierto uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_persona personas; v_ok int;
begin
  select * into v_persona from personas where token = p_token and activo;
  if not found then return false; end if;
  -- el UPDATE condicional es la carrera resuelta en la base: si dos aprietan
  -- a la vez, solo uno encuentra tomado_por IS NULL y el otro recibe false.
  update turnos_abiertos
     set tomado_por = v_persona.id, tomado_en = now()
   where id = p_abierto and local_id = v_persona.local_id and tomado_por is null;
  get diagnostics v_ok = row_count;
  return v_ok = 1;
end $$;

revoke all on all tables in schema public from anon;
grant execute on function mi_semana(text,date)            to anon;
grant execute on function marcar(text,date,text,boolean)  to anon;
grant execute on function tomar_turno(text,uuid)          to anon;

-- =====================================================================
-- CORRECCION 02-10-2026: faltaban los permisos del DUEÑO.
-- Con "Automatically expose new tables" desactivado (que es lo correcto),
-- las tablas nuevas no reciben permisos para NINGUN rol de la API, ni
-- siquiera para las cuentas con sesion. Resultado: la app cargaba en
-- blanco porque hasta el dueño recibia "permission denied".
-- El cierre al visitante estaba bien; faltaba abrirle la puerta al dueño.
-- Esto no afloja nada: las reglas por fila siguen mandando, y el anonimo
-- vuelve a quedar solo con las tres funciones del trabajador.
-- =====================================================================
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke all on all tables in schema public from anon;
grant execute on function mi_semana(text,date)            to anon;
grant execute on function marcar(text,date,text,boolean)  to anon;
grant execute on function tomar_turno(text,uuid)          to anon;
