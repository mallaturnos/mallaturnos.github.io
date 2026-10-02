-- Marcaje libre mientras esto sea un prototipo: se puede marcar "llegue"
-- cualquier dia, no solo el del turno. Decidido por Pedro el 02-10-2026 para
-- poder mostrar la app sin depender de que hoy sea el dia del turno.
-- PARA UN PILOTO DE VERDAD hay que volver a poner el limite (esta en el
-- archivo arreglo-marcas.sql): si "llegue" no significa "estoy aca ahora",
-- el planificado contra real pierde su sentido.
create or replace function marcar(p_token text, p_fecha date, p_campo text, p_valor boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from personas where token = p_token and activo;
  if v_id is null then return false; end if;
  if p_campo not in ('confirmo','llego') then return false; end if;
  if not exists (select 1 from asignaciones
                 where persona_id = v_id and fecha = p_fecha and turno_id is not null) then
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
