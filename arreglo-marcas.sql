alter table marcas add column if not exists marcado_por text;

create policy dueno_marcas_ins on marcas for insert
  with check (exists (select 1 from personas p
                      where p.id = marcas.persona_id and es_mi_local(p.local_id)));

create or replace function marcar(p_token text, p_fecha date, p_campo text, p_valor boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_hoy date;
begin
  select id into v_id from personas where token = p_token and activo;
  if v_id is null then return false; end if;
  if p_campo not in ('confirmo','llego') then return false; end if;
  if not exists (select 1 from asignaciones
                 where persona_id = v_id and fecha = p_fecha and turno_id is not null) then
    return false;
  end if;
  v_hoy := (now() at time zone 'America/Santiago')::date;
  if p_campo = 'llego' and p_fecha <> v_hoy then return false; end if;
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
