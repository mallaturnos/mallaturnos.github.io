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
