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
    if (/relation .* does not exist/i.test(m)) {
      const t = m.match(/relation "([^"]+)"/);
      return `La tabla «${t ? t[1].replace(/^public\./,'') : '?'}» no existe en la base todavía. `
           + 'Falta aplicar el archivo arreglo-*.sql que la crea.';
    }
    // «column X.Y does not exist» tambien dice exactamente que falta
    const colf = m.match(/column ([a-z_]+)\.([a-z_]+) does not exist/i);
    if (colf) return `A la base le falta la columna «${colf[2]}» de la tabla «${colf[1]}». `
           + 'Falta aplicar el archivo arreglo-*.sql que la agrega.';
    // Postgres dice lo mismo («schema cache») cuando falta una COLUMNA, y decir
    // «faltan las tablas» ahi manda a buscar al lugar equivocado: la base esta,
    // lo que falta es el ultimo parche.
    if (/schema cache/i.test(m)) {
      // Decir QUE falta, no solo que falta algo: con cinco archivos arreglo-*.sql
      // un mensaje generico manda a buscar a ciegas.
      const col = m.match(/'([^']+)' column of '([^']+)'/);
      const que = col ? `la columna «${col[1]}» de la tabla «${col[2]}»` : 'un cambio';
      return `A la base le falta ${que}, que la app ya está usando. `
           + 'Hay que aplicar el archivo arreglo-*.sql que la agrega.';
    }
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

  // Borrar un local se lleva por delante TODO lo suyo: su gente, sus turnos, su
  // malla y sus propinas. La base lo hace en cascada. Por eso arriba se pide
  // escribir el nombre: un clic de mas no puede costar eso.
  const borrarLocal = (id) => pedir(sb.from('locales').delete().eq('id', id));

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

  // Verdadero cuando el error es «esto todavia no existe en la base», mirando
  // el error CRUDO de Postgres y no el texto que nosotros mostramos: ese texto
  // se reescribe y la comprobacion se cae sin que nadie se entere. Ya paso.
  //   42703 = columna que no existe · 42P01 = tabla que no existe
  //   PGRST204/205 = PostgREST no la encuentra en su cache
  const faltaEnLaBase = (e) => {
    const c = (e && e.crudo) || {};
    const cod = String(c.code || '');
    if (['42703','42P01','PGRST204','PGRST205'].includes(cod)) return true;
    const t = (c.message || '') + ' ' + (c.details || '') + ' ' + (e && e.message || '');
    return /does not exist|schema cache|no existe|le falta la columna|no existe en la base/i.test(t);
  };

  // ¿Esta la base al dia con lo que la app necesita? Se comprueba pidiendo las
  // columnas nuevas, que es barato y no cambia nada. Vale mas detectarlo ANTES
  // y decir que hacer, que intentar, fallar y dejar a medias.
  const baseAlDia = async (localId) => {
    const falta = [];
    const probar = async (tabla, columna) => {
      try { await pedir(sb.from(tabla).select(columna).eq('local_id', localId).limit(1)); }
      catch (e) { if (faltaEnLaBase(e)) falta.push(tabla + '.' + columna); else throw e; }
    };
    await probar('personas', 'equipo');
    await probar('asignaciones', 'inicio');
    await probar('asignaciones', 'ofrecido_por');
    await probar('asignaciones', 'horas_pagadas');
    return falta;
  };

  /* ---------- catálogo de puestos ----------
     Mientras no se aplique `arreglo-puestos.sql` la tabla no existe. La app
     tiene que seguir funcionando igual, asi que esta lectura DEVUELVE VACIO en
     vez de reventar: los puestos se siguen deduciendo de la gente, como antes. */
  const puestos = async (localId) => {
    try {
      return await pedir(sb.from('puestos').select('*').eq('local_id', localId)
                           .eq('activo', true).order('orden').order('nombre'));
    } catch (e) {
      if (faltaEnLaBase(e)) return [];
      throw e;
    }
  };
  const crearPuesto = (localId, p) =>
    pedir(sb.from('puestos').insert(Object.assign({ local_id: localId }, p)).select().single());
  const guardarPuesto = (id, campos) =>
    pedir(sb.from('puestos').update(campos).eq('id', id).select().single());
  const quitarPuesto = (id) =>
    pedir(sb.from('puestos').update({ activo: false }).eq('id', id).select().single());
  // Renombrar arrastra a la gente y a los turnos ya asignados, en la base, de
  // una sola vez: a mano habria que editar ficha por ficha.
  const renombrarPuesto = (id, nombre) =>
    pedir(sb.rpc('renombrar_puesto', { p_puesto: id, p_nombre: nombre }));

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
  /* ---------- turnos asignados ----------
     Cada turno lleva SUS horas (inicio, fin, colacion) y su puesto, como en
     Skello. `turno_id` solo recuerda de que plantilla salio, para el nombre.
     Puede haber VARIOS el mismo dia: eso es el turno partido. Por eso ya no
     hay upsert por (persona, fecha) y todo va por el id de la fila. */
  // personaId null = turno SIN ASIGNAR, el «Non assigné» de Skello.
  const crearAsignacion = (localId, personaId, fecha, t) =>
    pedir(sb.from('asignaciones').insert({
      local_id: localId, persona_id: personaId || null, fecha, ausencia: null,
      turno_id: t.turno_id || null,
      inicio: t.inicio, fin: t.fin, colacion: t.colacion || 0,
      puesto: t.puesto || '', nota: t.nota || '',
    }).select().single());

  const editarAsignacion = (id, campos) =>
    pedir(sb.from('asignaciones').update(campos).eq('id', id).select().single());

  const borrarAsignacion = (id) =>
    pedir(sb.from('asignaciones').delete().eq('id', id));

  // La ausencia es UNA por dia y manda sobre los turnos: si alguien esta de
  // vacaciones, no puede tener turnos ese dia. Por eso se borra lo que haya.
  const ponerAusencia = async (localId, personaId, fecha, ausencia) => {
    await pedir(sb.from('asignaciones').delete()
                  .eq('local_id', localId).eq('persona_id', personaId).eq('fecha', fecha));
    if (!ausencia || ausencia === 'L') return null;      // «libre» es no tener nada
    return pedir(sb.from('asignaciones').insert({
      local_id: localId, persona_id: personaId, fecha,
      ausencia, inicio: null, fin: null, puesto: '',
    }).select().single());
  };

  // Dejar el dia de alguien en blanco, sin poner ausencia.
  const limpiarDia = (localId, personaId, fecha) =>
    pedir(sb.from('asignaciones').delete()
            .eq('local_id', localId).eq('persona_id', personaId).eq('fecha', fecha));

  // Copia la semana anterior sobre la actual. A PROPOSITO no copia ausencias:
  // si se copiaran, las vacaciones de la semana pasada se repetirian para siempre.
  // (El propio tutorial de Skello advierte de eso con sus plantillas.)
  const copiarSemana = async (localId, desdeAnterior, desdeActual) => {
    const hastaAnterior = new Date(desdeAnterior + 'T00:00:00');
    hastaAnterior.setDate(hastaAnterior.getDate() + 6);
    const previas = await pedir(sb.from('asignaciones').select('*').eq('local_id', localId)
      .gte('fecha', desdeAnterior)
      .lte('fecha', hastaAnterior.toISOString().slice(0,10))
      .not('inicio', 'is', null));
    if (!previas || !previas.length) return 0;
    const corrimiento = (new Date(desdeActual + 'T00:00:00') - new Date(desdeAnterior + 'T00:00:00')) / 86400000;
    const filas = previas.map(a => {
      const d = new Date(a.fecha + 'T00:00:00'); d.setDate(d.getDate() + corrimiento);
      return { local_id: localId, persona_id: a.persona_id,
               fecha: d.toISOString().slice(0,10), turno_id: a.turno_id, ausencia: null,
               inicio: a.inicio, fin: a.fin, colacion: a.colacion || 0,
               puesto: a.puesto || '', nota: a.nota || '' };
    });
    // Sin la clave (persona, fecha) ya no hay upsert posible: se limpia el
    // destino y se inserta. Las ausencias del destino se respetan a proposito.
    const hasta = new Date(desdeActual + 'T00:00:00');
    hasta.setDate(hasta.getDate() + 6);
    await pedir(sb.from('asignaciones').delete().eq('local_id', localId)
                  .gte('fecha', desdeActual).lte('fecha', hasta.toISOString().slice(0,10))
                  .not('inicio', 'is', null));
    await pedir(sb.from('asignaciones').insert(filas).select());
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
      turno_id: a.turno_id || null,
      ausencia: a.inicio == null ? (a.ausencia || 'L') : null,
      inicio: a.inicio, fin: a.fin, colacion: a.colacion || 0,
      puesto: a.puesto || '', nota: a.nota || '',
    }))).select());
    return filas.length;
  };

  const marcas = (localId, desde, hasta) =>
    pedir(sb.from('marcas').select('*, personas!inner(local_id)')
            .eq('personas.local_id', localId).gte('fecha', desde).lte('fecha', hasta));

  /* ---------- plata del día ---------- */
  // el jefe marca por alguien que perdio el telefono: queda registrado que fue EL
  const marcarComoJefe = (asignacionId, personaId, fecha, campos) =>
    pedir(sb.from('marcas').upsert(
      Object.assign({ asignacion_id: asignacionId, persona_id: personaId, fecha, marcado_por: 'jefe' }, campos),
      { onConflict: 'asignacion_id' }).select().single());

  // Las horas que SE PAGAN de un turno. Vacio = vale la regla del local.
  // Es la tercera columna de Skello: se ve lo previsto y lo marcado, y esto
  // es lo que de verdad se paga.
  const horasPagadas = (asignacionId, horas) =>
    pedir(sb.from('asignaciones').update({ horas_pagadas: horas })
            .eq('id', asignacionId).select().single());

  // Cerrar el dia es cuando se carga la venta: es el momento en que el jefe
  // ya esta haciendo la caja, no una pestaña aparte que hay que acordarse.
  const cerrarDia = (localId, fecha, venta) =>
    pedir(sb.from('dias').upsert({ local_id: localId, fecha, venta,
                                   cerrado_en: new Date().toISOString() },
                                 { onConflict: 'local_id,fecha' }).select().single());

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
  // Los turnos sin dueño ya no viven en otra tabla: son asignaciones sin
  // persona, o asignaciones que alguien ofreció.
  // Mientras no se aplique `arreglo-sin-asignar.sql` la columna ofrecido_por no
  // existe. La app TIENE que seguir funcionando: devuelve vacio en vez de
  // dejar la pantalla en blanco. Esto ya lo hace la lectura de puestos; aqui
  // faltaba, y Pedro recargo antes de pegar el SQL y se quedo sin datos.
  const abiertos = async (localId, desde, hasta) => {
    try {
      return await pedir(sb.from('asignaciones').select('*').eq('local_id', localId)
              .not('inicio', 'is', null)
              .gte('fecha', desde).lte('fecha', hasta)
              .or('persona_id.is.null,ofrecido_por.not.is.null')
              .order('fecha').order('inicio'));
    } catch (e) {
      if (faltaEnLaBase(e)) return [];
      throw e;
    }
  };

  const abrirTurno = (localId, a) =>
    pedir(sb.from('turnos_abiertos').insert(Object.assign({ local_id: localId }, a)).select().single());

  const cerrarTurno = (id) => pedir(sb.from('turnos_abiertos').delete().eq('id', id));

  /* ---------- la puerta del trabajador: solo estas tres ---------- */
  const miSemana = (token, desde) =>
    pedir(sb.rpc('mi_semana', { p_token: token, p_desde: desde }));

  // Marcar es por TURNO, no por dia, y la hora la pone el SERVIDOR: si la
  // pusiera el telefono, se cambia adelantando el reloj del aparato.
  // Acciones: 'entrada' · 'salida' · 'confirmo' · 'no_puedo'.
  const marcarTurno = (token, asignacionId, accion) =>
    pedir(sb.rpc('marcar_turno', { p_token: token, p_asignacion: asignacionId, p_accion: accion }));

  const ofrecerTurno = (token, asignacionId) =>
    pedir(sb.rpc('ofrecer_turno', { p_token: token, p_asignacion: asignacionId }));

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
    miLocal, misLocales, crearLocal, guardarLocal, borrarLocal, dejarDeEscuchar,
    personas, crearPersona, guardarPersona, quitarPersona, activarPersonas,
    turnos, crearTurno, guardarTurno, quitarTurno,
    baseAlDia,
    puestos, crearPuesto, guardarPuesto, quitarPuesto, renombrarPuesto,
    asignaciones, crearAsignacion, editarAsignacion, borrarAsignacion, ponerAusencia, limpiarDia,
    marcas, marcarComoJefe, horasPagadas, cerrarDia, copiarSemana,
    borrarAsignaciones, reponerAsignaciones,
    dias, guardarDia, dotacion, guardarDotacion, guardarDotacionLote,
    borrarDotacion, reponerDotacion,
    abiertos, abrirTurno, cerrarTurno,
    miSemana, marcarTurno, tomarTurno, ofrecerTurno,
    escuchar,
  };
})(window);
