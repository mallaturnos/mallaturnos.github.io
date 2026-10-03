-- La dotacion pasa de HORAS a TURNOS. Pedirle a alguien que llene 17 casillas
-- por puesto y por dia son mas de 350 numeros: eso es una planilla, no una
-- herramienta. Por turno son 63 y se llena en cinco minutos, y ademas es como
-- piensa un dueño de local: "el sabado en la tarde necesito tres garzones".
alter table dotacion drop constraint if exists dotacion_pkey;
delete from dotacion;                       -- las filas por hora ya no sirven
alter table dotacion drop column if exists hora;
alter table dotacion add column if not exists turno_id uuid references turnos(id) on delete cascade;
alter table dotacion add primary key (local_id, perfil, puesto, turno_id);
