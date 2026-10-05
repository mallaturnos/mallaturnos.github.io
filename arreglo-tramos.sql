-- =====================================================================
-- LA NECESIDAD DE GENTE PASA DE «POR TURNO» A «POR TRAMO HORARIO». 05-10-2026.
--
-- Pedro, con el caso que lo explica todo (msg 3892):
--   «no se ve bien si tengo turnos corridos de 8 horas y turnos de refuerzos
--    partidos de 4 horas»
--
-- Y tiene razon. Con un corrido 08:00-16:30 y un refuerzo 12:00-16:00, la
-- tabla de hoy obliga a poner un numero en cada turno, y ese numero NO
-- significa lo mismo en los dos:
--   * en el corrido es «cuanta gente quiero»
--   * en el refuerzo es «cuanta gente MAS»
-- La tabla no lo dice en ninguna parte, y entre una lectura y la otra hay seis
-- personas de diferencia en la semana. Un solo numero no alcanza para decir
-- dos cosas distintas.
--
-- Con tramos, un numero tiene UN significado: cuanta gente quiero a esa hora.
--   08:00-12:00  2
--   12:00-16:00  4     <- entra el refuerzo
--   16:00-01:00  2
--
-- De paso desaparece el error que el mismo encontro el 05-10 (msg 3772): con
-- turnos que se pisan, contar por turno daba por cubierto lo que no lo estaba.
-- Por hora eso no puede pasar.
--
-- ---------------------------------------------------------------------
-- POR QUE UNA TABLA NUEVA Y NO CAMBIAR LA QUE HAY
--
-- El Prototipo 2 (mallaturnos.github.io/p2/) y el 3 comparten esta base. Si se
-- cambiara `dotacion`, el panel «¿Te alcanza la gente?» del 2 dejaria de
-- funcionar de un momento a otro, y Pedro lo esta usando EN VIVO. Asi que:
--   * `dotacion` NO se toca. El /p2/ sigue leyendola y funciona igual.
--   * `dotacion_tramos` es nueva y la usa el 3.
--   * Lo ya tecleado se CONVIERTE, no se pierde.
--
-- NO BORRA NADA. Se puede pegar las veces que haga falta.
-- =====================================================================

create table if not exists dotacion_tramos (
  local_id uuid not null references locales(id) on delete cascade,
  perfil   text not null,                       -- '0'..'6', 0 = lunes
  puesto   text not null,
  desde    numeric(4,2) not null,               -- horas decimales: 8.5 = 08:30
  hasta    numeric(4,2) not null,               -- > 24 cruza la medianoche (25 = 01:00)
  cantidad integer not null default 0,
  primary key (local_id, perfil, puesto, desde),
  check (hasta > desde)
);
create index if not exists dotacion_tramos_local_idx on dotacion_tramos(local_id);

alter table dotacion_tramos enable row level security;

drop policy if exists dotacion_tramos_ver on dotacion_tramos;
create policy dotacion_tramos_ver on dotacion_tramos for select using (es_mi_local(local_id));
drop policy if exists dotacion_tramos_tocar on dotacion_tramos;
create policy dotacion_tramos_tocar on dotacion_tramos for all using (es_mi_local(local_id))
  with check (es_mi_local(local_id));

-- Toda tabla nueva necesita su GRANT: las policies dicen QUE filas se pueden
-- tocar, no SI la tabla se puede tocar. Esto ya costo un rato el 03-10.
grant select, insert, update, delete on dotacion_tramos to authenticated;
revoke all on dotacion_tramos from anon;

-- ---------------------------------------------------------------------
-- CONVERTIR LO QUE YA ESTA TECLEADO
--
-- Se hace hora por hora y despues se juntan las horas seguidas que piden lo
-- mismo. Es exactamente la cuenta que ya hace la vista de Dia: a cada hora, la
-- necesidad es la SUMA de los turnos que pasan por esa hora — si de 13 a 16:30
-- corren la mañana y la tarde, a esa hora se necesita la gente de las dos.
--
-- Solo se siembra lo que falta: si ya hay tramos para ese local, perfil y
-- puesto, no se toca. Asi esto se puede repetir sin pisar lo que Pedro ajuste
-- despues a mano.
-- ---------------------------------------------------------------------
insert into dotacion_tramos (local_id, perfil, puesto, desde, hasta, cantidad)
with horas as (
  -- una fila por local, perfil, puesto y HORA, con lo que piden los turnos
  -- que pasan por ahi
  select d.local_id, d.perfil, d.puesto, h.hora,
         sum(d.cantidad)::int as cantidad
    from dotacion d
    join turnos t on t.id = d.turno_id
    cross join generate_series(0, 47) as h(hora)
   where d.cantidad > 0
     and h.hora >= floor(t.inicio) and h.hora < t.fin
     -- lo que ya tenga tramos no se vuelve a sembrar: asi esto se puede pegar
     -- de nuevo sin pisar lo que Pedro ajuste despues a mano
     and not exists (
       select 1 from dotacion_tramos x
        where x.local_id = d.local_id and x.perfil = d.perfil and x.puesto = d.puesto)
   group by d.local_id, d.perfil, d.puesto, h.hora
),
marcadas as (
  -- se marca donde EMPIEZA un tramo: cuando la hora anterior no existe o pedia
  -- otra cantidad
  select *,
         case when lag(hora)     over w = hora - 1
               and lag(cantidad) over w = cantidad then 0 else 1 end as corte
    from horas
  window w as (partition by local_id, perfil, puesto order by hora)
),
grupos as (
  select *, sum(corte) over (partition by local_id, perfil, puesto order by hora) as grupo
    from marcadas
)
select local_id, perfil, puesto,
       min(hora)::numeric      as desde,
       (max(hora) + 1)::numeric as hasta,
       max(cantidad)           as cantidad
  from grupos
 group by local_id, perfil, puesto, grupo
having max(cantidad) > 0
on conflict do nothing;

-- Comprobar que quedo: deberia salir una fila por tramo, con horas corridas.
--   select perfil, puesto, desde, hasta, cantidad
--     from dotacion_tramos order by perfil, puesto, desde;
