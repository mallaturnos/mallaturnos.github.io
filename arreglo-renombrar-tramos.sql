-- =====================================================================
-- RENOMBRAR UN PUESTO TAMBIEN TIENE QUE MOVER SUS TRAMOS. 05-10-2026.
--
-- Pedro pidio poder renombrar el puesto desde «Cuanta gente necesito»
-- (msg 4165): «pinchar aseo y cambiarle el nombre a otra cosa como limpieza,
-- o caja, o estacionamiento».
--
-- La funcion `renombrar_puesto` ya existia y hacia bien su trabajo: cambiaba el
-- catalogo, el rol de la gente, los turnos ya asignados y la dotacion, todo de
-- una vez. Pero se escribio ANTES que `dotacion_tramos`, asi que esa tabla se
-- quedaba con el nombre viejo.
--
-- Que pasaria sin esto: renombras «Aseo» a «Limpieza», y los tramos horarios
-- que ajustaste a mano quedan colgando de un puesto que ya no existe. No se
-- borran — es peor, siguen ahi y no se ven. La pantalla mostraria «Limpieza»
-- sin sus ajustes, y si algun dia vuelves a crear un puesto llamado «Aseo»
-- reaparecerian solos.
--
-- Es la misma trampa de siempre: una tabla nueva que no se agrego a una
-- operacion vieja. Se arregla aqui, no en la pantalla.
--
-- NO BORRA NADA. Se puede pegar las veces que haga falta.
-- =====================================================================

create or replace function renombrar_puesto(p_puesto uuid, p_nombre text)
returns void language plpgsql security definer set search_path = public as $$
declare v_viejo text; v_local uuid;
begin
  select nombre, local_id into v_viejo, v_local from puestos where id = p_puesto;
  if not found then raise exception 'ese puesto no existe'; end if;
  if not es_mi_local(v_local) then raise exception 'ese puesto no es de tu local'; end if;
  if btrim(coalesce(p_nombre,'')) = '' then raise exception 'el nombre no puede ir vacio'; end if;

  update puestos     set nombre = btrim(p_nombre) where id = p_puesto;
  update personas    set rol    = btrim(p_nombre)
   where local_id = v_local and lower(btrim(rol))    = lower(btrim(v_viejo));
  update asignaciones set puesto = btrim(p_nombre)
   where local_id = v_local and lower(btrim(puesto)) = lower(btrim(v_viejo));
  update dotacion    set puesto = btrim(p_nombre)
   where local_id = v_local and lower(btrim(puesto)) = lower(btrim(v_viejo));

  -- LO NUEVO. `if to_regclass` para que esto se pueda pegar aunque todavia no
  -- se haya creado la tabla de tramos: asi el SQL no depende del orden en que
  -- se peguen los arreglos.
  if to_regclass('public.dotacion_tramos') is not null then
    update dotacion_tramos set puesto = btrim(p_nombre)
     where local_id = v_local and lower(btrim(puesto)) = lower(btrim(v_viejo));
  end if;
end $$;

grant execute on function renombrar_puesto(uuid,text) to authenticated;

-- Comprobar que quedo: deberia decir que la funcion menciona dotacion_tramos.
--   select prosrc like '%dotacion_tramos%' as incluye_tramos
--     from pg_proc where proname = 'renombrar_puesto';
