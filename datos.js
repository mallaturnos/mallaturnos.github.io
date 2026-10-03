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
  const misLocales = () => pedir(sb.from('locales').select('*').order('creado'));

  const crearLocal = async (nombre) => {
    const { data: s } = await sb.auth.getUser();
    if (!s || !s.user) throw new Error('No hay sesión.');
    return pedir(sb.from('locales').insert({ nombre, dueno_id: s.user.id }).select().single());
  };

  const guardarLocal = (id, campos) =>
    pedir(sb.from('locales').update(campos).eq('id', id).select().single());

  /* ---------- equipo ---------- */
  const personas = (localId) =>
    pedir(sb.from('personas').select('*').eq('local_id', localId).eq('activo', true).order('rol').order('nombre'));

  const crearPersona = (localId, p) =>
    pedir(sb.from('personas').insert(Object.assign({ local_id: localId }, p)).select().single());

  const guardarPersona = (id, campos) =>
    pedir(sb.from('personas').update(campos).eq('id', id).select().single());

  // Baja lógica: si se borrara de verdad, se llevaría por delante el historial
  // de turnos y de marcas de esa persona.
  const quitarPersona = (id) =>
    pedir(sb.from('personas').update({ activo: false }).eq('id', id).select().single());

  // Varias de una vez, para el boton Limpiar del equipo y para su Deshacer.
  // Como es baja logica, reponer es volver a poner activo = true en los mismos
  // ids: los turnos y las marcas nunca se fueron.
  const activarPersonas = (ids, activo) =>
    pedir(sb.from('personas').update({ activo: !!activo }).in('id', ids).select());

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

  // Copia la semana anterior sobre la actual. A PROPOSITO no copia ausencias:
  // si se copiaran, las vacaciones de la semana pasada se repetirian para siempre.
  // (El propio tutorial de Skello advierte de eso con sus plantillas.)
  const copiarSemana = async (localId, desdeAnterior, desdeActual) => {
    const hastaAnterior = new Date(desdeAnterior + 'T00:00:00');
    hastaAnterior.setDate(hastaAnterior.getDate() + 6);
    const previas = await pedir(sb.from('asignaciones').select('*').eq('local_id', localId)
      .gte('fecha', desdeAnterior)
      .lte('fecha', hastaAnterior.toISOString().slice(0,10))
      .not('turno_id', 'is', null));
    if (!previas || !previas.length) return 0;
    const corrimiento = (new Date(desdeActual + 'T00:00:00') - new Date(desdeAnterior + 'T00:00:00')) / 86400000;
    const filas = previas.map(a => {
      const d = new Date(a.fecha + 'T00:00:00'); d.setDate(d.getDate() + corrimiento);
      return { local_id: localId, persona_id: a.persona_id,
               fecha: d.toISOString().slice(0,10), turno_id: a.turno_id, ausencia: null };
    });
    await pedir(sb.from('asignaciones').upsert(filas, { onConflict: 'persona_id,fecha' }).select());
    return filas.length;
  };

  // Borra todo lo asignado en un rango: la hoja queda en blanco y, al no haber
  // fila, cada casilla se dibuja como "libre". No se borra nada mas (ni marcas
  // ni propinas), solo la malla.
  const borrarAsignaciones = (localId, desde, hasta) =>
    pedir(sb.from('asignaciones').delete().eq('local_id', localId)
            .gte('fecha', desde).lte('fecha', hasta));

  // Vuelve a dejar el rango exactamente como estaba: lo que hay se borra y se
  // reponen las filas guardadas. Es lo que usa el boton Deshacer.
  const reponerAsignaciones = async (localId, desde, hasta, filas) => {
    await borrarAsignaciones(localId, desde, hasta);
    if (!filas || !filas.length) return 0;
    await pedir(sb.from('asignaciones').insert(filas.map(a => ({
      local_id: localId, persona_id: a.persona_id, fecha: a.fecha,
      turno_id: a.turno_id || null, ausencia: a.turno_id ? null : (a.ausencia || 'L'),
    }))).select());
    return filas.length;
  };

  const marcas = (localId, desde, hasta) =>
    pedir(sb.from('marcas').select('*, personas!inner(local_id)')
            .eq('personas.local_id', localId).gte('fecha', desde).lte('fecha', hasta));

  /* ---------- plata del día ---------- */
  // el jefe marca por alguien que perdio el telefono: queda registrado que fue EL
  const marcarComoJefe = (personaId, fecha, campo, valor) =>
    pedir(sb.from('marcas').upsert(
      Object.assign({ persona_id: personaId, fecha, marcado_por: 'jefe' },
                    { [campo]: valor },
                    campo === 'llego' ? { hora_llego: valor ? new Date().toISOString() : null } : {}),
      { onConflict: 'persona_id,fecha' }).select().single());

  const dias = (localId, desde, hasta) =>
    pedir(sb.from('dias').select('*').eq('local_id', localId).gte('fecha', desde).lte('fecha', hasta));

  const guardarDia = (localId, fecha, campos) =>
    pedir(sb.from('dias').upsert(Object.assign({ local_id: localId, fecha }, campos),
                                 { onConflict: 'local_id,fecha' }).select().single());

  /* ---------- dotación necesaria por hora ---------- */
  const dotacion = (localId) =>
    pedir(sb.from('dotacion').select('*').eq('local_id', localId));

  const guardarDotacion = (localId, perfil, puesto, turnoId, cantidad) =>
    pedir(sb.from('dotacion').upsert({ local_id: localId, perfil, puesto, turno_id: turnoId, cantidad },
      { onConflict: 'local_id,perfil,puesto,turno_id' }).select().single());

  // Varias filas de dotacion de una vez: copiar un dia a los otros seis son
  // decenas de casillas, y mandarlas una por una es lento y se corta a la mitad.
  const guardarDotacionLote = (filas) =>
    pedir(sb.from('dotacion').upsert(filas, { onConflict: 'local_id,perfil,puesto,turno_id' }).select());

  // Dejar en blanco un dia de la semana, o la semana entera si no se pasa perfil.
  const borrarDotacion = (localId, perfil) => {
    let q = sb.from('dotacion').delete().eq('local_id', localId);
    if (perfil != null) q = q.eq('perfil', String(perfil));
    return pedir(q);
  };

  // Vuelve a dejar la dotacion exactamente como estaba. Se repone COMPLETA y no
  // por dia, porque 'copiar a los demas' toca seis dias de una y un deshacer
  // que solo repusiera uno dejaria la mitad del cambio puesto.
  const reponerDotacion = async (localId, filas) => {
    await borrarDotacion(localId);
    if (!filas || !filas.length) return 0;
    await pedir(sb.from('dotacion').insert(filas.map(f => ({
      local_id: localId, perfil: String(f.perfil), puesto: f.puesto,
      turno_id: f.turno_id, cantidad: f.cantidad,
    }))).select());
    return filas.length;
  };

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

  const ofrecerTurno = (token, fecha) =>
    pedir(sb.rpc('ofrecer_turno', { p_token: token, p_fecha: fecha }));

  const tomarTurno = (token, abiertoId) =>
    pedir(sb.rpc('tomar_turno', { p_token: token, p_abierto: abiertoId }));

  /* ---------- en vivo: que al jefe se le actualice solo ---------- */
  const dejarDeEscuchar = canal => { try { if (canal) sb.removeChannel(canal); } catch (e) {} };

  function escuchar(localId, alCambiar) {
    return sb.channel('local-' + localId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marcas' }, alCambiar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turnos_abiertos',
                                filter: 'local_id=eq.' + localId }, alCambiar)
      .subscribe();
  }

  global.DATOS = {
    init, explicar,
    miLocal, misLocales, crearLocal, guardarLocal, dejarDeEscuchar,
    personas, crearPersona, guardarPersona, quitarPersona, activarPersonas,
    turnos, crearTurno, guardarTurno, quitarTurno,
    asignaciones, ponerTurno, marcas, marcarComoJefe, copiarSemana,
    borrarAsignaciones, reponerAsignaciones,
    dias, guardarDia, dotacion, guardarDotacion, guardarDotacionLote,
    borrarDotacion, reponerDotacion,
    abiertos, abrirTurno, cerrarTurno,
    miSemana, marcar, tomarTurno, ofrecerTurno,
    escuchar,
  };
})(window);
