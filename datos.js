/* Capa de datos: TODO lo que habla con Supabase pasa por acá.
   Dos razones para separarlo: la pantalla no sabe de base de datos, y si algún
   día cambiamos de proveedor se reescribe este archivo y nada más.

   Reglas que respeta este archivo:
   - El DUEÑO entra con su sesión y la base le deja ver solo lo suyo (reglas por fila).
   - El TRABAJADOR no tiene sesión: todo lo suyo pasa por las tres funciones
     (mi_semana, marcar, tomar_turno) que reciben su token.
*/
(function (global) {
  'use strict';

  let sb = null;
  const init = cliente => { sb = cliente; };

  // Errores de Postgres/Supabase dichos en castellano, porque los va a leer Pedro.
  function explicar(e) {
    if (!e) return 'Error desconocido.';
    const m = (e.message || '') + ' ' + (e.details || '');
    if (/relation .* does not exist|schema cache/i.test(m))
      return 'Las tablas todavía no existen en la base. Falta aplicar el esquema.';
    if (/row-level security|violates row-level/i.test(m))
      return 'La base rechazó la operación por las reglas de acceso. Revisa que estés en tu propio local.';
    if (/duplicate key/i.test(m)) return 'Ese registro ya existe.';
    if (/JWT|token is expired|not authenticated/i.test(m))
      return 'Se venció la sesión. Vuelve a entrar.';
    if (/Failed to fetch|NetworkError/i.test(m))
      return 'No hay conexión con la base. Revisa internet.';
    return e.message || String(e);
  }

  const pedir = async (promesa) => {
    const { data, error } = await promesa;
    if (error) { const x = new Error(explicar(error)); x.crudo = error; throw x; }
    return data;
  };

  /* ---------- local ---------- */
  const miLocal = () => pedir(sb.from('locales').select('*').limit(1).maybeSingle());

  const crearLocal = async (nombre) => {
    const { data: s } = await sb.auth.getUser();
    if (!s || !s.user) throw new Error('No hay sesión.');
    return pedir(sb.from('locales').insert({ nombre, dueno_id: s.user.id }).select().single());
  };

  const guardarLocal = (id, campos) =>
    pedir(sb.from('locales').update(campos).eq('id', id).select().single());

  /* ---------- equipo ---------- */
  const personas = (localId) =>
    pedir(sb.from('personas').select('*').eq('local_id', localId).eq('activo', true).order('nombre'));

  const crearPersona = (localId, p) =>
    pedir(sb.from('personas').insert(Object.assign({ local_id: localId }, p)).select().single());

  const guardarPersona = (id, campos) =>
    pedir(sb.from('personas').update(campos).eq('id', id).select().single());

  // Baja lógica: si se borrara de verdad, se llevaría por delante el historial
  // de turnos y de marcas de esa persona.
  const quitarPersona = (id) =>
    pedir(sb.from('personas').update({ activo: false }).eq('id', id).select().single());

  /* ---------- catálogo de turnos ---------- */
  const turnos = (localId) =>
    pedir(sb.from('turnos').select('*').eq('local_id', localId).order('orden').order('inicio'));

  const crearTurno = (localId, t) =>
    pedir(sb.from('turnos').insert(Object.assign({ local_id: localId }, t)).select().single());

  const guardarTurno = (id, campos) =>
    pedir(sb.from('turnos').update(campos).eq('id', id).select().single());

  const quitarTurno = (id) => pedir(sb.from('turnos').delete().eq('id', id));

  /* ---------- la semana ---------- */
  const asignaciones = (localId, desde, hasta) =>
    pedir(sb.from('asignaciones').select('*').eq('local_id', localId)
            .gte('fecha', desde).lte('fecha', hasta));

  // Una fila por persona y día: se pisa la que haya (clave única persona+fecha).
  const ponerTurno = (localId, personaId, fecha, turnoId, ausencia) =>
    pedir(sb.from('asignaciones')
            .upsert({ local_id: localId, persona_id: personaId, fecha,
                      turno_id: turnoId || null, ausencia: turnoId ? null : (ausencia || 'L') },
                    { onConflict: 'persona_id,fecha' })
            .select().single());

  const marcas = (localId, desde, hasta) =>
    pedir(sb.from('marcas').select('*, personas!inner(local_id)')
            .eq('personas.local_id', localId).gte('fecha', desde).lte('fecha', hasta));

  /* ---------- plata del día ---------- */
  const dias = (localId, desde, hasta) =>
    pedir(sb.from('dias').select('*').eq('local_id', localId).gte('fecha', desde).lte('fecha', hasta));

  const guardarDia = (localId, fecha, campos) =>
    pedir(sb.from('dias').upsert(Object.assign({ local_id: localId, fecha }, campos),
                                 { onConflict: 'local_id,fecha' }).select().single());

  /* ---------- turnos abiertos ---------- */
  const abiertos = (localId, desde) =>
    pedir(sb.from('turnos_abiertos').select('*').eq('local_id', localId)
            .gte('fecha', desde).order('fecha'));

  const abrirTurno = (localId, a) =>
    pedir(sb.from('turnos_abiertos').insert(Object.assign({ local_id: localId }, a)).select().single());

  const cerrarTurno = (id) => pedir(sb.from('turnos_abiertos').delete().eq('id', id));

  /* ---------- la puerta del trabajador: solo estas tres ---------- */
  const miSemana = (token, desde) =>
    pedir(sb.rpc('mi_semana', { p_token: token, p_desde: desde }));

  const marcar = (token, fecha, campo, valor) =>
    pedir(sb.rpc('marcar', { p_token: token, p_fecha: fecha, p_campo: campo, p_valor: valor }));

  const tomarTurno = (token, abiertoId) =>
    pedir(sb.rpc('tomar_turno', { p_token: token, p_abierto: abiertoId }));

  /* ---------- en vivo: que al jefe se le actualice solo ---------- */
  function escuchar(localId, alCambiar) {
    return sb.channel('local-' + localId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marcas' }, alCambiar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turnos_abiertos',
                                filter: 'local_id=eq.' + localId }, alCambiar)
      .subscribe();
  }

  global.DATOS = {
    init, explicar,
    miLocal, crearLocal, guardarLocal,
    personas, crearPersona, guardarPersona, quitarPersona,
    turnos, crearTurno, guardarTurno, quitarTurno,
    asignaciones, ponerTurno, marcas,
    dias, guardarDia,
    abiertos, abrirTurno, cerrarTurno,
    miSemana, marcar, tomarTurno,
    escuchar,
  };
})(window);
