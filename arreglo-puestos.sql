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
