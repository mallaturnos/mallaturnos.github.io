-- =====================================================================
-- UN TURNO SABE EN QUE DIAS EXISTE.   06-10-2026
--
-- Pedro, msgs 4360-4361: al crear un turno quiere «definir las fechas,
-- definir los horarios», y hoy la tabla `turnos` solo guarda nombre, inicio,
-- fin, colacion y orden. En que dias existe un turno no se guardaba en ningun
-- sitio: se deducia de donde hubiera gente puesta, que es otra cosa.
--
-- POR QUE IMPORTA. «La Cena existe de jueves a domingo» es una propiedad DEL
-- TURNO, no de quien lo trabaja esta semana. Sin esto, el lunes aparece una
-- Cena vacia en «Cuanta gente necesito» y el dueno tiene que acordarse de que
-- ese dia no va.
--
-- COMO SE GUARDA. Una cadena con los indices de los dias, **0 = lunes** y
-- **6 = domingo**, que es la misma convencion que ya usa la app para el perfil
-- del dia (`(getDay() + 6) % 7`). Ejemplos:
--     '0123456'  todos los dias          (es lo que traen los turnos de hoy)
--     '3456'     de jueves a domingo
--     '01234'    de lunes a viernes
--
-- Se eligio texto y no un array ni una mascara de bits por una razon practica:
-- se lee de un vistazo en el editor de Supabase. Si algun dia hay que
-- depurarlo, `select nombre, dias from turnos` lo dice todo.
--
-- EL DEFAULT ES TODOS LOS DIAS A PROPOSITO: los turnos que ya existen tienen
-- que seguir comportandose exactamente igual despues de pegar esto. Una
-- migracion que cambia lo que ya funcionaba no es una migracion, es un susto.
--
-- NO BORRA NADA. Se puede pegar las veces que haga falta.
-- =====================================================================

alter table turnos
  add column if not exists dias text not null default '0123456';

-- Que no entre basura: solo digitos del 0 al 6, sin repetir y en orden no
-- importa. La app los escribe ordenados; la comprobacion es por si alguien
-- toca la tabla a mano.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'turnos_dias_validos') then
    alter table turnos
      add constraint turnos_dias_validos check (dias ~ '^[0-6]*$');
  end if;
end $$;

-- Comprobar que quedo:
--   select nombre, dias from turnos order by orden;
-- Deberia salir '0123456' en todos los que ya existian.
