alter table locales add column if not exists bloquear_sobre_tope boolean not null default false;

-- Tomar un turno abierto, ahora avisando el motivo cuando no se puede.
-- Dos motivos posibles: alguien lo tomo primero, o la persona se pasaria de
-- sus horas contratadas y el local tiene activado el bloqueo.
-- El calculo de horas se hace ACA porque el navegador del trabajador no puede
-- ver los turnos del resto de la semana de nadie, ni siquiera los suyos pasados.
create or replace function tomar_turno(p_token text, p_abierto uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_persona personas; v_ab turnos_abiertos; v_local locales;
  v_lunes date; v_horas numeric; v_extra numeric; v_ok int;
begin
  select * into v_persona from personas where token = p_token and activo;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'link'); end if;

  select * into v_ab from turnos_abiertos where id = p_abierto and local_id = v_persona.local_id;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if v_ab.tomado_por is not null then return jsonb_build_object('ok', false, 'motivo', 'tomado'); end if;

  select * into v_local from locales where id = v_persona.local_id;

  -- horas que ya tiene esa semana (lunes a domingo del turno abierto)
  v_lunes := v_ab.fecha - ((extract(isodow from v_ab.fecha)::int - 1));
  select coalesce(sum(t.fin - t.inicio - t.colacion), 0) into v_horas
    from asignaciones a join turnos t on t.id = a.turno_id
   where a.persona_id = v_persona.id and a.fecha between v_lunes and v_lunes + 6;

  select (t.fin - t.inicio - t.colacion) into v_extra from turnos t where t.id = v_ab.turno_id;

  if v_local.bloquear_sobre_tope and (v_horas + coalesce(v_extra,0)) > v_persona.horas_contrato then
    return jsonb_build_object('ok', false, 'motivo', 'tope',
                              'horas', v_horas + coalesce(v_extra,0),
                              'contrato', v_persona.horas_contrato);
  end if;

  update turnos_abiertos
     set tomado_por = v_persona.id, tomado_en = now()
   where id = p_abierto and tomado_por is null;
  get diagnostics v_ok = row_count;
  if v_ok <> 1 then return jsonb_build_object('ok', false, 'motivo', 'tomado'); end if;

  return jsonb_build_object('ok', true,
                            'horas', v_horas + coalesce(v_extra,0),
                            'contrato', v_persona.horas_contrato);
end $$;

revoke execute on function tomar_turno(text,uuid) from anon;
grant execute on function tomar_turno(text,uuid) to anon;
