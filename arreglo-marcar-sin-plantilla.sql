-- =====================================================================
-- QUIEN TIENE UN TURNO CON HORAS ESCRITAS A MANO TAMBIEN PUEDE MARCAR
-- 06-10-2026
--
-- EL FALLO. `marcar()` exige `turno_id is not null`: o sea, que el turno haya
-- salido de una PLANTILLA. Eso era cierto el 02-10, cuando un turno no era mas
-- que un puntero a una plantilla.
--
-- El 03-10 `arreglo-turno-con-horas.sql` le dio a cada asignacion sus propias
-- horas, y el dialogo de la malla abre con «— escribir las horas —», que guarda
-- `turno_id = null`. Desde ese dia, a quien le pongan un turno escrito a mano:
--
--   · no puede apretar «confirmo» en su link
--   · no puede marcar «llegue»
--   · y no recibe ningun error: la funcion devuelve false y la pantalla se
--     queda igual, como si el boton no hiciera nada
--
-- Lo que lo hace feo es que no se cae nada. Falla en silencio, y en la pantalla
-- del jefe esa persona aparece simplemente como que no confirmo.
--
-- COMO SE ENCONTRO. No por un reporte: `arreglo-tope.sql` resulto estar
-- caducado —redefinia una funcion que otro arreglo posterior ya habia
-- reescrito— y al revisar si le pasaba lo mismo al resto aparecio que `marcar`
-- esta definida en tres archivos. La que manda es la de `arreglo-marcaje-libre`
-- del 02-10, anterior al cambio que creo los turnos sin plantilla.
--
-- EL ARREGLO. Pedir que el turno TENGA HORAS, que es lo que de verdad lo hace
-- un turno, en vez de pedir que venga de una plantilla. Es la misma condicion
-- que ya usa `tomar_turno()` desde `arreglo-sin-asignar.sql`: `inicio is not
-- null`. Las ausencias siguen fuera, que es lo correcto: no se marca llegada
-- un dia de vacaciones.
--
-- Se puede pegar dos veces. No borra nada.
-- =====================================================================

create or replace function marcar(p_token text, p_fecha date, p_campo text, p_valor boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from personas where token = p_token and activo;
  if v_id is null then return false; end if;
  if p_campo not in ('confirmo','llego') then return false; end if;
  -- Aca estaba la condicion vieja, la que pedia plantilla. NO se escribe
  -- textual ni en comentario: `comprobar.sql` mira este mismo cuerpo con un
  -- LIKE, y un comentario le miente igual que al de al lado. Ya paso el 06-10
  -- y costo una pegada de mas.
  if not exists (select 1 from asignaciones
                 where persona_id = v_id and fecha = p_fecha and inicio is not null) then
    return false;
  end if;
  insert into marcas (persona_id, fecha) values (v_id, p_fecha) on conflict do nothing;
  if p_campo = 'confirmo' then
    update marcas set confirmo = p_valor, marcado_por = 'trabajador'
     where persona_id = v_id and fecha = p_fecha;
  else
    update marcas set llego = p_valor, marcado_por = 'trabajador',
                      hora_llego = case when p_valor then now() else null end
     where persona_id = v_id and fecha = p_fecha;
  end if;
  return true;
end $$;

grant execute on function marcar(text,date,text,boolean) to anon;

-- Nota de alcance, heredada de `arreglo-marcaje-libre.sql`: sigue sin exigirse
-- que `p_fecha` sea HOY. Es a proposito mientras esto sea un prototipo que se
-- muestra. Para un piloto de verdad hay que reponer ese limite.
