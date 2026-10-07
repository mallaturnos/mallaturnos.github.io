/* Malla de Turnos — aplicación.
   Dos vistas en un mismo archivo:
   - El DUEÑO entra con sesión y ve todo lo de su local.
   - El TRABAJADOR abre la página con #sutoken y ve SOLO su semana.
   La separación no es de pantalla: es de permisos, y vive en la base. */
'use strict';

const $ = s => document.querySelector(s);
const SIN_CONECTAR = [];
const on = (sel, ev, fn) => {
  const n = document.querySelector(sel);
  if (n) n.addEventListener(ev, fn);
  else { SIN_CONECTAR.push(sel); console.warn('falta el elemento', sel, '— sigo igual'); }
};
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

const DIAS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const AUSENCIAS = { L:'Libre', V:'Vacaciones', E:'Licencia', F:'Falta' };

const clp  = n => '$' + Math.round(n || 0).toLocaleString('es-CL');
const hfmt = n => (n || 0).toLocaleString('es-CL', { minimumFractionDigits:1, maximumFractionDigits:1 });
const pfmt = n => isFinite(n) ? n.toLocaleString('es-CL',{minimumFractionDigits:1,maximumFractionDigits:1}) + ' %' : '—';
// Un atraso en minutos se lee hasta la hora; «307 min» no se lee. Pedro:
// «no es mejor en horas? tipo 1 hora 30 tarde».
const minFmt = n => {
  n = Math.round(Math.abs(n));
  if (n < 60) return n + ' min';
  const h = Math.floor(n / 60), m = n % 60;
  return h + ' h' + (m ? ' ' + m + ' min' : '');
};
const hhmm = h => { const t = ((h % 24) + 24) % 24, m = Math.round((t - Math.floor(t)) * 60);
  return String(Math.floor(t)).padStart(2,'0') + ':' + String(m).padStart(2,'0'); };
// Campos de plata: se escriben y se leen como $20.000, no como 20000.
const soloDigitos = v => String(v == null ? '' : v).replace(/[^\d]/g, '');
const aPlata = n => '$' + Number(n || 0).toLocaleString('es-CL');
const dePlata = v => Number(soloDigitos(v) || 0);

const aDec = s => { const [h,m] = String(s||'0:00').split(':').map(Number); return h + (m||0)/60; };

/* ---------- fechas: la semana empieza el lunes ---------- */
const iso = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
function lunesDe(d) { const x = new Date(d); const n = (x.getDay() + 6) % 7; x.setDate(x.getDate() - n); x.setHours(0,0,0,0); return x; }
const masDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const ddmm = f => { const [a,m,d] = f.split('-'); return d + '-' + m; };

let sb = null;
const S = { necModo:'turno', local:null, personas:[], turnos:[], puestos:[], asign:{}, marcas:{}, dias:{}, abiertos:[],
            lunes:lunesDe(new Date()), mes:new Date(), modo:'semana', dia:new Date(), filtro:'', filtroE:'', cobDia:'0', dotacion:{}, canal:null,
            hist:[], histDot:[], histEq:[], recien:null, relojDia:null, agrupar:'personas', modelos:[] };

/* ---------- deshacer ----------
   Antes de cualquier cambio en la malla se guarda una foto de como estaba el
   rango que se ve en pantalla. Deshacer repone esa foto tal cual. Se guardan
   las ultimas 20: es un paso atras de verdad, no un historial eterno. */
const MAX_HIST = 20;
function recordar(que) {
  const r = rango();
  // S.asign guarda una LISTA por casilla desde que existe el turno partido, y
  // la foto tiene que llevarse las horas: sin ellas, deshacer repondria turnos
  // vacios que el CHECK de la base rechaza.
  // Los turnos SIN DUEÑO van tambien en la foto. `reponerAsignaciones` borra el
  // rango entero y repone lo fotografiado: si no estuvieran aca, deshacer
  // CUALQUIER cambio los borraria en silencio. Se nota poco hasta que existen
  // en cantidad, y desde los modelos de semana con «solo la forma» existen.
  // Solo los que no tienen persona: `S.abiertos` trae ademas los turnos
  // OFRECIDOS, que siguen siendo de alguien y ya estan en S.asign.
  const filas = Object.values(S.asign).flat()
    .concat(S.abiertos.filter(a => !a.persona_id))
    .filter(a => a.fecha >= r.desde && a.fecha <= r.hasta)
    .map(a => ({ persona_id:a.persona_id, fecha:a.fecha, turno_id:a.turno_id,
                 ausencia:a.ausencia, inicio:a.inicio, fin:a.fin,
                 colacion:a.colacion, puesto:a.puesto, nota:a.nota }));
  S.hist.push({ desde:r.desde, hasta:r.hasta, filas, que: que || 'el ultimo cambio' });
  if (S.hist.length > MAX_HIST) S.hist.shift();
  pintarDeshacer();
}
/* Un paso atras sobre un rango que NO es el que se esta viendo.

   `recordar()` fotografia `S.asign`, que solo tiene lo que la vista cargo. Al
   copiar esta semana a las tres siguientes, esas semanas no estan cargadas: la
   foto saldria vacia y Deshacer, en vez de reponerlas, BORRARIA lo que hubiera
   ahi. Por eso esta lee el rango de la base antes de tocarlo.

   Vale lo mismo en la vista de Dia, donde `rango()` es un solo dia y copiar a
   otros seis se saldria de la foto. */
async function recordarDeLaBase(que, desde, hasta) {
  const filas = (await DATOS.asignaciones(S.local.id, desde, hasta) || []).map(a => ({
    persona_id: a.persona_id, fecha: a.fecha, turno_id: a.turno_id,
    ausencia: a.ausencia, inicio: a.inicio, fin: a.fin,
    colacion: a.colacion, puesto: a.puesto, nota: a.nota,
  }));
  S.hist.push({ desde, hasta, filas, que: que || 'el ultimo cambio' });
  if (S.hist.length > MAX_HIST) S.hist.shift();
  pintarDeshacer();
}

function pintarDeshacer() {
  const b = $('#btnDeshacer'); if (!b) return;
  const h = S.hist[S.hist.length - 1];
  b.disabled = !h;
  b.title = h ? 'Deshacer ' + h.que : 'No hay nada que deshacer';
}
async function deshacer() {
  const h = S.hist.pop(); if (!h) return;
  const m = $('#msgSem');
  try {
    await DATOS.reponerAsignaciones(S.local.id, h.desde, h.hasta, h.filas);
    await refrescar();
    if (m) { m.textContent = 'Deshecho: ' + h.que + '.'; m.className = 'msg ok'; }
  } catch (e) {
    S.hist.push(h);                      // no se pudo: el paso atras sigue ahi
    if (m) { m.textContent = e.message; m.className = 'msg bad'; }
  }
  pintarDeshacer();
  setTimeout(() => { const x = $('#msgSem'); if (x) x.textContent = ''; }, 5000);
}

/* ---------- deshacer de la DOTACION ----------
   Se guarda la dotacion COMPLETA, no el dia que se ve: 'copiar este dia a los
   demas' toca seis dias de una, y un paso atras que repusiera solo uno dejaria
   la mitad del cambio puesto. Son unas decenas de numeros: cabe de sobra. */
function fotoDotacion() {
  const filas = [];
  for (const perfil of Object.keys(S.dotacion))
    for (const puesto of Object.keys(S.dotacion[perfil]))
      for (const turnoId of Object.keys(S.dotacion[perfil][puesto]))
        filas.push({ perfil, puesto, turno_id:turnoId, cantidad:S.dotacion[perfil][puesto][turnoId] });
  return filas;
}
function recordarDot(que) {
  S.histDot.push({ filas: fotoDotacion(), que: que || 'el ultimo cambio' });
  if (S.histDot.length > MAX_HIST) S.histDot.shift();
  pintarDeshacerDot();
}
function pintarDeshacerDot() {
  const b = $('#btnDeshacerDot'); if (!b) return;
  const h = S.histDot[S.histDot.length - 1];
  b.disabled = !h;
  b.title = h ? 'Deshacer ' + h.que : 'No hay nada que deshacer';
}
async function deshacerDot() {
  const h = S.histDot.pop(); if (!h) return;
  const m = $('#msgDot');
  try {
    // Un mismo boton para los dos modelos: mientras el SQL de tramos no este
    // aplicado se sigue deshaciendo la dotacion vieja.
    if (h.renombre) await DATOS.renombrarPuesto(h.renombre.id, h.renombre.de);
    // Las dos juntas van PRIMERO: con `h.tramos` arriba, una entrada que lleva
    // las dos repondria solo los tramos y daria el paso por hecho.
    else if (h.tramos && h.filas) {
      await reponerTramos(h.tramos);
      await DATOS.reponerDotacion(S.local.id, h.filas);
    }
    else if (h.tramos) await reponerTramos(h.tramos);
    else await DATOS.reponerDotacion(S.local.id, h.filas);
    await refrescar();
    verSub('nec');
    if (m) { m.textContent = 'Deshecho: ' + h.que + '.'; m.className = 'msg ok'; }
  } catch (e) {
    S.histDot.push(h);                   // no se pudo: el paso atras sigue ahi
    if (m) { m.textContent = e.message; m.className = 'msg bad'; }
  }
  pintarDeshacerDot();
  setTimeout(() => { const x = $('#msgDot'); if (x) x.textContent = ''; }, 5000);
}

/* ---------- deshacer de los TRAMOS ----------
   Mismo criterio que la dotacion vieja: se guarda la lista COMPLETA, porque
   «copiar este dia a los demas» toca seis dias de una. Son unas pocas decenas
   de filas. */
function fotoTramos() {
  const filas = [];
  for (const perfil of Object.keys(S.tramos || {}))
    for (const puesto of Object.keys(S.tramos[perfil]))
      S.tramos[perfil][puesto].forEach(t => filas.push(
        { perfil, puesto, desde: Number(t.desde), hasta: Number(t.hasta),
          cantidad: Number(t.cantidad) }));
  return filas;
}
/* Las dos clases de linea de una vez. Desde el 06-10 «Cuanta gente necesito»
   muestra junto lo que por debajo vive en DOS tablas —`dotacion` para las
   lineas que vinieron de un turno, `dotacion_tramos` para las demas—, asi que
   una operacion que las borra a las dos necesita una foto de las dos. */
function recordarAmbos(que) {
  S.histDot.push({ tramos: fotoTramos(), filas: fotoDotacion(), que: que || 'el ultimo cambio' });
  if (S.histDot.length > MAX_HIST) S.histDot.shift();
  pintarDeshacerDot();
}

function recordarTr(que) {
  S.histDot.push({ tramos: fotoTramos(), que: que || 'el ultimo cambio' });
  if (S.histDot.length > MAX_HIST) S.histDot.shift();
  pintarDeshacerDot();
}
async function reponerTramos(filas) {
  await DATOS.borrarTramos(S.local.id, null);
  const porClave = {};
  filas.forEach(f => {
    const k = f.perfil + '|' + f.puesto;
    (porClave[k] = porClave[k] || []).push(f);
  });
  for (const k of Object.keys(porClave)) {
    const [perfil, puesto] = k.split('|');
    await DATOS.guardarTramos(S.local.id, perfil, puesto, porClave[k]);
  }
}

/* ---------- deshacer de un RENOMBRE ----------
   Pedro eligio dejar el renombrado como esta -la palabra «cambiar» al lado del
   nombre- y pidio que tuviera Deshacer (msg 4650, «A»).

   No lleva foto, y la razon importa: `fotoDotacion()` y `fotoTramos()` guardan
   las filas POR NOMBRE de puesto. Una foto tomada ANTES del renombre repondria
   filas colgando de un nombre que ya no existe — exactamente el defecto que
   `arreglo-renombrar-tramos.sql` vino a tapar. El paso atras de un renombre es
   el renombre al reves: `renombrar_puesto` con el nombre viejo, que propaga la
   vuelta por el catalogo, el rol de la gente, los turnos y la dotacion igual
   que propago la ida. */
function recordarRen(id, de, a) {
  S.histDot.push({ renombre: { id, de }, que: 'cambiar \u00ab' + de + '\u00bb por \u00ab' + a + '\u00bb' });
  if (S.histDot.length > MAX_HIST) S.histDot.shift();
  pintarDeshacerDot();
}

/* ---------- deshacer del EQUIPO ----------
   Quitar a alguien es baja logica (activo = false), nunca un borrado: sus
   turnos y sus marcas siguen ahi. Por eso aca basta con guardar los ids y el
   paso atras repone exactamente lo que habia, sin perder historial. */
function recordarEq(ids, que) {
  if (!ids.length) return;
  S.histEq.push({ ids, que: que || 'el ultimo cambio' });
  if (S.histEq.length > MAX_HIST) S.histEq.shift();
  pintarDeshacerEq();
}
function pintarDeshacerEq() {
  const b = $('#btnDeshacerEq'); if (!b) return;
  const h = S.histEq[S.histEq.length - 1];
  b.disabled = !h;
  b.title = h ? 'Deshacer ' + h.que : 'No hay nada que deshacer';
}
async function deshacerEq() {
  const h = S.histEq.pop(); if (!h) return;
  const m = $('#msgEq');
  try {
    await DATOS.activarPersonas(h.ids, true);
    await refrescar();
    if (m) { m.textContent = 'Deshecho: ' + h.que + '.'; m.className = 'msg ok'; }
  } catch (e) {
    S.histEq.push(h);
    if (m) { m.textContent = e.message; m.className = 'msg bad'; }
  }
  pintarDeshacerEq();
  setTimeout(() => { const x = $('#msgEq'); if (x) x.textContent = ''; }, 5000);
}

// La franja horaria no se fija a mano: sale de los turnos que tenga el local.
// Un café que cierra a las 19 no tiene por qué mirar columnas hasta la 1 AM.
function franja() {
  if (!S.turnos.length) return { h0: 8, h1: 24 };
  const ini = Math.floor(Math.min(...S.turnos.map(t => Number(t.inicio))));
  const fin = Math.ceil(Math.max(...S.turnos.map(t => Number(t.fin))));
  return { h0: Math.max(0, ini), h1: Math.min(ini + 24, Math.max(fin, ini + 1)) };
}
// Un perfil por día de la semana: 0 = lunes … 6 = domingo. Viernes, sábado y
// domingo no se parecen en nada, y meterlos en un mismo "fin de semana"
// obliga a poner un número que no sirve para ninguno de los tres.
const perfilDe = fecha => String((new Date(fecha + 'T00:00:00').getDay() + 6) % 7);
// La dotación va por DÍA DE LA SEMANA, PUESTO y TURNO.
// Por hora eran 350+ casillas que nadie llena; por turno son 63 y además es
// como piensa un dueño: "el sábado en la tarde necesito tres garzones".
const necesita = (perfil, puesto, turnoId) => ((S.dotacion[perfil] || {})[puesto] || {})[turnoId] || 0;

/* ---------- cuanta gente se necesita A ESA HORA ----------
   Es LA pregunta del Prototipo 3, y reemplaza a «cuanta en ese turno».

   El caso que lo obligo lo trajo Pedro (msg 3892): con un corrido de 8 h y un
   refuerzo de 4 h, el numero por turno no significa lo mismo en los dos — en el
   corrido es «cuanta quiero» y en el refuerzo «cuanta MAS». Por hora, un numero
   tiene un solo significado.

   Los tramos NO se suman entre si: se toma el mayor. Dos tramos no deberian
   pisarse —la clave primaria va por `desde` y el editor los ordena— pero si
   alguno queda mal, sumar volveria a inventar gente, que es justo el error del
   que venimos. Con el maximo, lo peor que pasa es que se respete el mas alto.

   Mientras no se aplique `arreglo-tramos.sql` no hay tramos, y entonces se
   deduce de la dotacion vieja sumando los turnos que pasan por esa hora: es
   como se leia hasta hoy, asi que la pantalla no cambia de un dia para otro. */
/* ¿El bloque [ini, fin) cubre algo de la hora h? UNA sola implementación, y
   por un motivo concreto: había OCHO copias de esta prueba escritas como
   `ini <= h && h < fin`, y esa versión **se come la primera media hora y regala
   la última**. Un turno de 20:30 a 01:00 no contaba la hora 20 —porque 20,5 no
   es <= 20— pero uno que termina a las 16:30 sí contaba la hora 16 entera. Lo
   vio Pedro: «toma el turno de cena y baja en otro horario» (msg 4158).

   Peor: el SQL de la migración usaba `hora >= floor(inicio)`, que SÍ es la
   prueba de solape. O sea que la base y la pantalla contaban distinto.

   La prueba correcta es la de solape de intervalos, y trata los dos extremos
   igual: la hora h va de h a h+1, así que hay solape si `ini < h+1` y `h < fin`. */
const cubreHora = (ini, fin, h) => Number(ini) < h + 1 && h < Number(fin);

/* 06-10-2026: turnos y horarios libres SE SUMAN, no se reemplazan.
   Pedro pidio juntarlos en una sola lista (msg 4157). Si conviven, lo que el
   dueno espera es que se sumen — «dos de apertura MAS uno de refuerzo a las
   seis» son tres a las seis.

   ⚠️ LA TRAMPA, y es la razon de `tramosSonCopiaDeTurnos()`: la migracion de
   octubre creo tramos que REPRODUCEN los turnos. Antes daba igual porque los
   tramos reemplazaban; al sumar, **contarian dos veces** y el dueno veria el
   doble de gente sin haber tocado nada.

   No se borran aqui: se RECONOCEN y se ignoran. Borrar es irreversible y esto
   no. Se limpian en un solo momento —al tocar un turno de ese puesto, ver
   `poner()`—, que es cuando dejarian de calzar y empezarian a sumar. */
function tramosSonCopiaDeTurnos(perfil, puesto) {
  const tr = tramosDe(perfil, puesto);
  if (!tr.length) return false;
  const base = franja();
  for (let h = base.h0; h < base.h1; h++) {
    const porTurnos = S.turnos.reduce((n, t) =>
      n + (cubreHora(t.inicio, t.fin, h) ? necesita(perfil, puesto, t.id) : 0), 0);
    let porTramos = 0;
    tr.forEach(t => {
      if (cubreHora(t.desde, t.hasta, h)) porTramos = Math.max(porTramos, Number(t.cantidad) || 0);
    });
    if (porTurnos !== porTramos) return false;
  }
  return true;
}

function necesitaHora(perfil, puesto, h) {
  let n = S.turnos.reduce((a, t) =>
    a + (cubreHora(t.inicio, t.fin, h) ? necesita(perfil, puesto, t.id) : 0), 0);
  if (!tramosSonCopiaDeTurnos(perfil, puesto))
    tramosDe(perfil, puesto).forEach(t => {
      if (cubreHora(t.desde, t.hasta, h)) n += Number(t.cantidad) || 0;
    });
  return n;
}
const hayTramos = () => Object.keys(S.tramos || {}).length > 0;

// El puesto que se trabaja ESE turno. Si la asignacion no lo trae (una vieja,
// de antes del cambio), vale el habitual de la persona.
const puestoDe = (a, p) => ((a && a.puesto) || '').trim() || ((p && p.rol) || '').trim();
const puestoRot = (a, p) => puestoDe(a, p) || 'Sin puesto';

// cuánta gente de ese puesto tiene ese turno asignado ese día. Cuenta el puesto
// DE LA ASIGNACION: si Camila hace barra el lunes, cuenta en barra ese lunes
// aunque su puesto habitual sea garzón.
const asignados = (fecha, turnoId, puesto) => {
  const t = turnoDe(turnoId); if (!t) return 0;
  return S.personas.reduce((n, p) => n + (turnosDe(p.id, fecha).some(a =>
    (puesto ? puestoRot(a, p) === puesto : true) && solapan(a, t)) ? 1 : 0), 0);
};
// Cuanta gente de ese puesto esta trabajando A ESA HORA. Es el companero de
// `necesitaHora`: los dos miran la hora, no el turno, que es lo unico que no
// miente cuando los turnos se pisan.
const asignadosHora = (fecha, puesto, h) => S.personas.reduce((n, p) =>
  n + (turnosDe(p.id, fecha).some(a => cubreHora(a.inicio, a.fin, h)
       && (!puesto || puestoRot(a, p) === puesto)) ? 1 : 0), 0);

// Dos bloques se pisan si comparten aunque sea un minuto. Se compara por horas
// y no por turno_id porque un turno asignado puede no venir de ninguna
// plantilla: se le escribieron las horas y ya.
const solapan = (a, t) => Number(a.inicio) < Number(t.fin) && Number(t.inicio) < Number(a.fin);

// Todos los puestos que existen: los habituales del equipo MAS los que se usan
// en alguna asignacion. Sin esto, un puesto que solo se trabaja de vez en
// cuando no aparece para elegirlo ni para pedir dotacion.
// Del catálogo si lo hay. Si todavía no se aplicó `arreglo-puestos.sql`, se
// siguen deduciendo de la gente y de los turnos, como antes: la app no puede
// quedar inservible por un SQL pendiente.
const puestosConocidos = () => {
  if (S.puestos.length) return S.puestos.map(x => x.nombre);
  return [...new Set([
    ...S.personas.map(p => (p.rol || '').trim()),
    ...Object.values(S.asign).flat().map(a => (a.puesto || '').trim()),
  ].filter(Boolean))].sort();
};
const puestoCat = nombre => S.puestos.find(x =>
  normal(x.nombre) === normal(nombre)) || null;

// El filtro por puesto aplica a las tres vistas del plan. No toca las propinas
// ni las confirmaciones: el reparto tiene que considerar SIEMPRE a todo el
// equipo, aunque en pantalla estés mirando solo la cocina.
/* ---------- el color de un turno ----------
   Sale del PUESTO, que es su color guardado en el catalogo.

   Hasta el 07-10 salia de LAS HORAS: dos bloques del mismo color eran dos
   bloques del mismo horario. Eso venia de arreglar algo real —antes salia de la
   plantilla, y un turno al que le cambiaban las horas se quedaba con el color
   viejo, que Pedro cazo dos veces— pero elegia la dimension equivocada.

   Lo decidio el 07-10 (msg 4779, «debe ser por puesto») mirando Skello, donde
   Manager es azul y Ronde verde a cualquier hora. Las dos lecturas se
   defienden: por horario ves de un vistazo quien abre y quien cierra; por
   puesto ves cuanta cocina y cuanta barra hay. Esta es la suya.

   El puesto de la ASIGNACION manda sobre el habitual de la persona: si Camila
   hace barra el lunes, ese bloque es de barra aunque ella sea garzona. Un
   puesto fuera del catalogo —o un turno sin puesto— cae en el neutro, que no
   es un error: es no tener con que pintarlo. */
function colorDe(a, p) {
  if (!a || a.inicio == null || a.fin == null) return 5;
  const nom = ((a.puesto || '').trim()) || ((p && p.rol || '').trim());
  const q = nom ? puestoCat(nom) : null;
  const c = q ? Number(q.color) : 0;
  return (c >= 1 && c <= 4) ? c : 5;
}

const puestos = () => {
  const hay = puestosConocidos();
  // «Sin puesto» solo si de verdad hay alguien sin el, para no ensuciar la lista
  if (S.personas.some(p => !(p.rol||'').trim())) hay.push('Sin puesto');
  return hay;
};
// "equipo" es una segunda dimensión, aparte del puesto: un garzón part-time
// sigue siendo garzón. Mezclar las dos cosas en un campo pierde información.
const equipos = () => [...new Set(S.personas.map(p => (p.equipo||'').trim()).filter(Boolean))].sort();
const personasVisibles = () => S.personas.filter(p =>
  (!S.filtro  || ((p.rol||'').trim() || 'Sin puesto') === S.filtro) &&
  (!S.filtroE || (p.equipo||'').trim() === S.filtroE));
/* Numero de semana del año, ISO-8601: la semana 1 es la del primer jueves.
   Pedro lo pidio mirando Skello, que lo muestra como «Semaine 33» al lado de
   las fechas (msg 4826). Sirve para hablar con otra gente —«la 41»— sin tener
   que leer dos fechas.

   Se calcula en UTC a proposito: con fechas locales, el cambio de hora de
   septiembre en Chile mueve la medianoche y una semana del limite puede salir
   corrida por un dia. */
function semanaISO(fechaIso) {
  const [a, m, d] = String(fechaIso).slice(0, 10).split('-').map(Number);
  const x = new Date(Date.UTC(a, m - 1, d));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7) + 3);   // el jueves de esa semana
  const ene4 = new Date(Date.UTC(x.getUTCFullYear(), 0, 4));
  ene4.setUTCDate(ene4.getUTCDate() - ((ene4.getUTCDay() + 6) % 7) + 3);
  return 1 + Math.round((x - ene4) / 604800000);
}

const fechas = () => Array.from({length:7}, (_,i) => iso(masDias(S.lunes, i)));

// El rango que hay que traer de la base depende de la vista: un dia, una
// semana o un mes entero. Todo lo demas se calcula sobre lo que ya esta cargado.
function rango() {
  if (S.modo === 'dia')  return { desde: iso(S.dia), hasta: iso(S.dia) };
  if (S.modo === 'mes') {
    // Del ancla del MES, no del lunes de la semana: el lunes de la semana en
    // curso puede caer en el mes anterior.
    const a = new Date(S.mes.getFullYear(), S.mes.getMonth(), 1);
    const b = new Date(S.mes.getFullYear(), S.mes.getMonth() + 1, 0);
    return { desde: iso(a), hasta: iso(b) };
  }
  const f = fechas(); return { desde: f[0], hasta: f[6] };
}
const diasDelMes = () => {
  const r = rango(), a = new Date(r.desde + 'T00:00:00'), b = new Date(r.hasta + 'T00:00:00'), out = [];
  for (let d = new Date(a); d <= b; d = masDias(d, 1)) out.push(iso(d));
  return out;
};
const turnoDe = id => S.turnos.find(t => t.id === id) || null;
const horasDe = t => t ? Number(t.fin) - Number(t.inicio) - Number(t.colacion) : 0;
const filasDe  = (pid, f) => S.asign[pid + '|' + f] || [];
// Los turnos de trabajo de ese dia, en orden de entrada. Pueden ser varios.
const turnosDe = (pid, f) => filasDe(pid, f).filter(a => a.inicio != null);
// La ausencia, que es UNA por dia y manda sobre los turnos.
const ausenciaDe = (pid, f) => filasDe(pid, f).find(a => a.ausencia) || null;
// Las horas las manda la propia fila, no la plantilla de la que salio.
const horasAsig = a => (a && a.inicio != null) ? Number(a.fin) - Number(a.inicio) - Number(a.colacion || 0) : 0;
const horasDia  = (pid, f) => turnosDe(pid, f).reduce((n, a) => n + horasAsig(a), 0);
// Las horas que SE PAGAN ese día. Es lo que manda para la propina: la base de
// datos reparte con estas, así que la pantalla del jefe tiene que usar las
// mismas o el trabajador y el jefe verían números distintos.
const horasPagadasDia = (pid, f) => turnosDe(pid, f).reduce((n, a) => n + horasPagadasDe(a), 0);

/* ---------- diagnóstico: solo se muestra si algo falla ---------- */
const marca = (id, estado, texto) => { const li = $(id); if (!li) return;
  li.className = estado; li.querySelector('.pt').textContent = estado === 'ok' ? '✓' : estado === 'bad' ? '✕' : '!';
  if (texto) li.lastChild.textContent = ' ' + texto; };

function revisar() {
  marca('#c-web','ok');
  if (!window.supabase || !window.supabase.createClient) {
    $('#diag').hidden = false; marca('#c-lib','bad','La librería de la base no cargó');
    $('#diagNota').textContent = 'Puede ser la conexión o que el CDN esté bloqueado.'; return false; }
  marca('#c-lib','ok');
  const c = window.CONFIG || {};
  if (!c.SUPABASE_URL || c.SUPABASE_URL === 'PENDIENTE') {
    $('#diag').hidden = false; marca('#c-cfg','warn','Falta configurar la conexión');
    $('#diagNota').textContent = 'Faltan los datos del proyecto de Supabase en config.js.'; return false; }
  marca('#c-cfg','ok');
  sb = window.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON);
  DATOS.init(sb);
  return true;
}

function error(e) {
  const m = (e && e.message) ? e.message : String(e);
  alert(m);
  console.error(e);
}

/* ================= ENTRAR ================= */
function avisoLogin(t, c) { const m = $('#msgLogin'); m.textContent = t; m.className = 'msg ' + (c||''); }

function conectarLogin() {
  on('#formLogin', 'submit', async ev => {
    ev.preventDefault(); avisoLogin('Entrando…');
    const { error: e } = await sb.auth.signInWithPassword({ email: $('#email').value.trim(), password: $('#clave').value });
    avisoLogin(e ? traducir(e.message) : '', e ? 'bad' : '');
  });
  on('#btnCrear', 'click', async () => {
    const email = $('#email').value.trim(), password = $('#clave').value;
    if (!email || password.length < 8) return avisoLogin('Pon tu correo y una clave de al menos 8 caracteres.','bad');
    avisoLogin('Creando la cuenta…');
    const { error: e } = await sb.auth.signUp({ email, password });
    avisoLogin(e ? traducir(e.message) : 'Listo. Si pide confirmación, revisa tu correo.', e ? 'bad' : 'ok');
  });
}

function traducir(m) {
  const t = (m||'').toLowerCase();
  if (t.includes('invalid login')) return 'Correo o contraseña incorrectos.';
  if (t.includes('already registered')) return 'Ese correo ya tiene cuenta. Entra en vez de crearla.';
  if (t.includes('email not confirmed')) return 'Falta confirmar el correo: revisa tu bandeja.';
  if (t.includes('rate limit') || t.includes('too many')) return 'Demasiados intentos seguidos. Espera unos minutos.';
  if (t.includes('password')) return 'La contraseña debe tener al menos 8 caracteres.';
  return m;
}

// Lleva a la vista la persona recien agregada y deja el cursor en su nombre,
// con el texto seleccionado: se escribe encima y listo.
function mostrarRecien() {
  if (!S.recien) return;
  const row = document.querySelector(`#eqLista [data-persona="${S.recien}"]`);
  if (!row) return;
  row.scrollIntoView({ behavior:'smooth', block:'center' });
  const inp = row.querySelector('input[data-k="nombre"]');
  if (inp) { inp.focus(); inp.select(); }
}

/* ---------- varios locales: un selector, cada uno con su gente ---------- */
function pintarLocales() {
  const caja = $('#hLocales'); if (!caja) return;
  caja.innerHTML = '';
  if (!S.locales || !S.locales.length) return;

  if (S.locales.length > 1) {
    const sel = el('select'); sel.id = 'selLocal'; sel.setAttribute('aria-label','Local');
    sel.innerHTML = S.locales.map(l => `<option value="${l.id}">${esc(l.nombre)}</option>`).join('');
    sel.value = S.local.id;
    sel.addEventListener('change', async () => {
      try { localStorage.setItem('malla-local', sel.value); } catch (e) {}
      S.local = S.locales.find(l => l.id === sel.value);
      DATOS.dejarDeEscuchar(S.canal); S.canal = null;
      try {
        await cargar(); pintarTodo();
        S.canal = DATOS.escuchar(S.local.id, () => { cargar().then(pintarTodo).catch(()=>{}); });
      } catch (e) { error(e); }
    });
    caja.appendChild(sel);
  }

  const mas = el('button','act','+ Local');
  mas.title = 'Agregar otro local';
  mas.addEventListener('click', () => {
    $('#cardLocal').hidden = false;
    $('#app').hidden = true;
    $('#nombreLocal').value = '';
    $('#nombreLocal').focus();
    $('#cancelarLocal').hidden = S.locales.length === 0;
  });
  caja.appendChild(mas);
}

/* ================= CARGAR TODO ================= */
async function cargar() {
  const r = rango(), desde = r.desde, hasta = r.hasta;
  const [personas, turnos, puestosCat, asign, marcas, dias, abiertos, dot, modelos, tramos] = await Promise.all([
    DATOS.personas(S.local.id), DATOS.turnos(S.local.id), DATOS.puestos(S.local.id),
    DATOS.asignaciones(S.local.id, desde, hasta), DATOS.marcas(S.local.id, desde, hasta),
    DATOS.dias(S.local.id, desde, hasta), DATOS.abiertos(S.local.id, desde, hasta),
    DATOS.dotacion(S.local.id), DATOS.modelos(S.local.id), DATOS.tramos(S.local.id),
  ]);
  S.personas = personas || []; S.turnos = turnos || []; S.abiertos = abiertos || [];
  S.puestos = puestosCat || [];
  S.modelos = modelos || [];
  // Un dia puede traer VARIOS turnos de la misma persona (turno partido), asi
  // que cada casilla guarda una LISTA, no una fila.
  S.asign = {};
  (asign||[]).forEach(a => {
    if (!a.persona_id) return;        // sin dueño: va a la fila «Sin asignar»
    const k = a.persona_id + '|' + a.fecha;
    (S.asign[k] = S.asign[k] || []).push(a);
  });
  Object.values(S.asign).forEach(l => l.sort((x,y) => (x.inicio||0) - (y.inicio||0)));
  // Las marcas van por TURNO: una persona puede tener dos el mismo día.
  S.marcas = {};
  (marcas||[]).forEach(m => {
    if (m.asignacion_id) S.marcas['a:' + m.asignacion_id] = m;
    // también por persona+fecha, para lo que todavía razona por día
    const k = m.persona_id + '|' + m.fecha;
    if (!S.marcas[k] || (m.entrada && !S.marcas[k].entrada)) S.marcas[k] = m;
  });
  S.dias = {};   (dias||[]).forEach(d => { S.dias[d.fecha] = d; });
  S.dotacion = {};
  (dot||[]).forEach(x => {
    const perfil = S.dotacion[x.perfil] = S.dotacion[x.perfil] || {};
    (perfil[x.puesto || ''] = perfil[x.puesto || ''] || {})[x.turno_id] = x.cantidad;
  });
  // La necesidad POR TRAMO, que reemplaza a la de arriba en el Prototipo 3.
  // `null` quiere decir que falta pegar `arreglo-tramos.sql`.
  S.sinTablaTramos = (tramos === null);
  S.tramos = {};
  (tramos||[]).forEach(x => {
    const perfil = S.tramos[x.perfil] = S.tramos[x.perfil] || {};
    (perfil[x.puesto || ''] = perfil[x.puesto || ''] || []).push(x);
  });
  Object.values(S.tramos).forEach(p => Object.values(p)
    .forEach(l => l.sort((a,b) => Number(a.desde) - Number(b.desde))));
}

async function refrescar() { await cargar(); pintarTodo(); }

/* ================= SEMANA ================= */
function pintarPlan() {
  ['semana','dia','mes'].forEach(m => {
    const b = $('#modo' + m[0].toUpperCase() + m.slice(1));
    if (b) b.setAttribute('aria-pressed', String(S.modo === m));
  });
  // selector de puesto, con aviso cuando hay uno puesto
  const sel = $('#filtroPuesto');
  if (sel) {
    const ps = puestos();
    sel.innerHTML = '<option value="">Todos los puestos</option>' +
      ps.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
    if (S.filtro && !ps.includes(S.filtro)) S.filtro = '';
    sel.value = S.filtro;
    sel.classList.toggle('activo', !!S.filtro);
  }
  const selE = $('#filtroEquipo');
  const lblE = $('#lblEquipo');
  if (selE) {
    const es = equipos();
    selE.hidden = !es.length;                 // si nadie tiene equipo, no estorba
    if (lblE) lblE.hidden = !es.length;       // y su rotulo se va con el
    selE.innerHTML = '<option value="">Todos los equipos</option>' +
      es.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
    if (S.filtroE && !es.includes(S.filtroE)) S.filtroE = '';
    selE.value = S.filtroE;
    selE.classList.toggle('activo', !!S.filtroE);
  }
  $('#cajaSemana').hidden = S.modo !== 'semana';
  $('#cajaDia').hidden    = S.modo !== 'dia';
  $('#cajaMes').hidden    = S.modo !== 'mes';
  // Copiar sirve en Dia y en Semana; en Mes no hay nada que copiar.
  $('#btnCopiar').hidden    = S.modo === 'mes';
  // Agrupar por puesto vale en la semana Y en el dia (Pedro, 04-10: «ok, agregar
  // a dia»). En el MES no: quedaria un conteo por dia y poco mas, asi que ahi se
  // esconde — es una decision, no un olvido.
  const seg = document.querySelector('.segm');
  if (seg) seg.hidden = S.modo === 'mes';
  // la franja de cobertura vive junto a la malla, no en otra pestaña:
  // sirve MIENTRAS planificas, no después
  const caja = $('#cardCobertura');
  if (caja) caja.hidden = (S.modo === 'mes');
  if (S.modo !== 'mes') pintarCobertura();
  if (S.modo === 'dia')  return pintarDia();
  if (S.modo === 'mes')  return pintarMes();
  return pintarSemana();
}

/* ---------- el diálogo del turno ----------
   Es el «Ajouter un shift» de Skello: se escriben LAS HORAS DE ESTE TURNO, no
   se elige de una lista. La plantilla solo rellena los campos de un saque.
   Trae además lo que ellos tienen y nos faltaba: repetir el mismo turno en
   varios días de la semana de una vez. */
let DLG = null;      // { p, fecha, asig }   asig null = turno nuevo

const aHora = h => { const t = ((Number(h) % 24) + 24) % 24;
  return String(Math.floor(t)).padStart(2,'0') + ':' + String(Math.round((t - Math.floor(t)) * 60)).padStart(2,'0'); };
/* Lee una hora tecleada y la vuelve numero. Pasa SIEMPRE por el normalizador:
   si alguien escribe «830» y aprieta Guardar sin salir del campo, partir por
   «:» a secas daria 830 HORAS y eso llegaria a la base. El normalizador vive
   mas abajo, pero esto corre dentro de una funcion, no al cargar. */
const deHora = v => {
  const t = normalizarHora(v);
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h + (m || 0) / 60;
};

/* Normaliza lo que se teclea en los campos de hora, SIEMPRE en 24 horas.
   Acepta «8», «800», «8:0», «0800», «8.30» y devuelve «08:00» / «08:30».
   Existe porque el `input type="time"` del navegador mostraba la hora en el
   formato del sistema —a Pedro le salia «09:00 p.m.» junto a un «21:00» en la
   malla— y el atributo `lang` NO lo fuerza: probado con en-GB, es-ES y es-CL,
   los tres siguieron en 12 horas. */
function normalizarHora(txt) {
  const d = String(txt || '').replace(/[^\d]/g, '');
  if (!d) return '';
  let h, m;
  if (d.length <= 2)      { h = Number(d);               m = 0; }
  else if (d.length === 3){ h = Number(d.slice(0,1));    m = Number(d.slice(1)); }
  else                    { h = Number(d.slice(0,2));    m = Number(d.slice(2,4)); }
  if (!isFinite(h) || !isFinite(m)) return '';
  h = Math.min(23, Math.max(0, h));
  m = Math.min(59, Math.max(0, m));
  return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
}

function duraDlg() {
  const i = deHora($('#dEntra').value), fRaw = deHora($('#dSale').value);
  if (i == null || fRaw == null) { $('#dDura').value = ''; return null; }
  const f = fRaw <= i ? fRaw + 24 : fRaw;                 // cruza la medianoche
  const h = f - i - (Number($('#dPausa').value) || 0) / 60;
  $('#dDura').value = h > 0 ? hfmt(h) + ' h' : '—';
  return { inicio: i, fin: f, colacion: (Number($('#dPausa').value) || 0) / 60, horas: h };
}

/* Las pastillas de «quiénes lo cubren», con LA GENTE DEL PUESTO ADELANTE.
   Pedro (04-10): «está bien tener a todo el equipo como opción pero debería ser
   claro en destacar a la gente [que] es del cargo».

   Tiene razon: con catorce personas en una lista plana, elegir al que
   corresponde es buscarlo. Siguen estando todos —un garzon puede cubrir barra
   un dia— pero los del puesto van primero y rotulados, y el resto despues.

   Se vuelve a pintar cuando cambia el puesto en el dialogo, porque si no la
   lista quedaria ordenada por el puesto anterior. */
/* ¿Este turno se pisa con otro de la MISMA persona ese dia?
   Pedro: «que no se dejen pisar los turnos». Nadie puede estar en dos lados a
   la misma hora, y hasta hoy la app lo dejaba guardar: el unico control miraba
   que la hora de ENTRADA no fuera identica, asi que 08:00–16:30 y 13:30–22:00
   convivian sin que nadie dijera nada.

   Devuelve el turno con el que choca, o null. `exceptoId` sirve al EDITAR, para
   que un turno no choque consigo mismo.

   Los turnos sin dueño no chocan con nadie: no son de ninguna persona. */
function chocaCon(personaId, fecha, inicio, fin, exceptoId) {
  if (!personaId) return null;
  return (turnosDe(personaId, fecha) || []).find(x =>
    x.id !== exceptoId
    && Number(x.inicio) < Number(fin) && Number(inicio) < Number(x.fin)) || null;
}

const diceChoque = (nombre, x) =>
  `${nombre} ya tiene ${hhmm(x.inicio)}–${hhmm(x.fin)} ese día: se pisan.`;

function marcarTodosTextoDlg() { /* sin indicador en este dialogo, por ahora */ }

function pintarPastillasPersonas(quien) {
  const puesto = ($('#dPuesto') && $('#dPuesto').value || '').trim().toLowerCase();
  // Quien YA tiene turno ese dia se marca con sus horas. No se esconde ni se
  // bloquea —el turno partido es legitimo— pero se ve antes de elegir, que es
  // justo lo que Pedro echaba de menos al verla repetida en la lista.
  const fe = DLG && DLG.fecha;
  const yaTiene = x => {
    const ts = fe ? (turnosDe(x.id, fe) || []) : [];
    return ts.length ? ts.map(t => hhmm(t.inicio) + '–' + hhmm(t.fin)).join(' · ') : '';
  };
  const pastilla = x => {
    const ya = yaTiene(x);
    return `<button type="button" class="act dia${x.id === quien ? ' on' : ''}${ya ? ' ocupada' : ''}"
      data-pid="${x.id}" aria-pressed="${x.id === quien ? 'true' : 'false'}"
      title="${esc(x.nombre + ((x.rol || '').trim() ? ' · ' + x.rol : '')
        + (ya ? ' · ya tiene ' + ya + ' ese día' : ''))}">${esc(x.nombre.split(' ')[0])}`
      + (ya ? `<span class="yatiene">${esc(ya)}</span>` : '') + '</button>';
  };
  const suyos = puesto ? S.personas.filter(x => (x.rol || '').trim().toLowerCase() === puesto) : [];
  const otros = S.personas.filter(x => !suyos.includes(x));
  const sinAsignar = `<button type="button" class="act dia${quien ? '' : ' on'}" data-pid=""
      aria-pressed="${quien ? 'false' : 'true'}">sin asignar</button>`;

  // «sin asignar» va SUELTO arriba, no bajo el rotulo del puesto: no es una
  // persona de ese puesto y ponerlo ahi lo hacia parecer una.
  $('#dPersonas').innerHTML = suyos.length
    ? sinAsignar
      + `<span class="pillcap">${esc($('#dPuesto').value)}</span>${suyos.map(pastilla).join('')}`
      + (otros.length ? `<span class="pillcap">Otros</span>${otros.map(pastilla).join('')}` : '')
    : sinAsignar + S.personas.map(pastilla).join('');
}

/* `puestoFijo` llega cuando el turno se crea desde una fila de PUESTO: la fila
   ya dice en que puesto va, y lo unico que falta elegir es quien lo cubre. */
function abrirTurno(p, fecha, asig, puestoFijo) {
  DLG = { p, fecha, asig };
  const esNuevo = !asig, esAus = asig && asig.ausencia;
  $('#dlgTit').textContent = esNuevo ? 'Agregar turno' : (esAus ? 'Editar ausencia' : 'Editar turno');
  $('#dlgSub').textContent = (p ? p.nombre : 'Sin asignar') + ' · '
    + DIAS[(new Date(fecha + 'T00:00:00').getDay() + 6) % 7] + ' ' + ddmm(fecha);
  $('#dlgMsg').textContent = '';
  $('#dBorrar').hidden = esNuevo;

  $('#dPlantilla').innerHTML = '<option value="">— escribir las horas —</option>' +
    S.turnos.map(t => `<option value="${t.id}">${esc(t.nombre)} ${hhmm(t.inicio)}–${hhmm(t.fin)}</option>`).join('');
  // La lista de quién lo cubre, con «sin asignar» como una opción más. Es
  // exactamente el desplegable de Skello: el turno sin dueño no es otra cosa.
  const quien = asig ? (asig.persona_id || '') : (p ? p.id : '');
  $('#dPersona').innerHTML = `<option value=""${quien ? '' : ' selected'}>— sin asignar —</option>`
    + S.personas.map(x => `<option value="${x.id}"${x.id === quien ? ' selected' : ''}>${esc(x.nombre)}</option>`).join('');

  // Al crear, varias personas de una vez. Un turno nuevo se le pone a quien
  // haga falta; uno que ya existe es de alguien, y ahí sigue siendo uno solo.
  $('#cajaPersonas').hidden = !esNuevo;
  $('#cajaPersona').hidden  = esNuevo;
  $('#dPuesto').innerHTML = opcionesPuesto(asig ? puestoDe(asig, p)
    : ((puestoFijo || '').trim() || ((p && p.rol) || '').trim()));
  // DESPUES de llenar el puesto: las pastillas se ordenan por el, asi que
  // pintarlas antes las habria ordenado por el puesto del turno anterior.
  pintarPastillasPersonas(quien);
  $('#dAusencia').innerHTML = Object.entries(AUSENCIAS)
    .filter(([k]) => k !== 'L')
    .map(([k,v]) => `<option value="${k}">${v}</option>`).join('');

  // La semana COMPLETA, con el día que se está creando ya marcado y bloqueado.
  // Antes se escondía ese día, y Pedro preguntó «¿por qué para Luz no me
  // aparece el lunes?»: esconderlo hace pensar que falta algo. Skello los
  // muestra los siete y deja marcado el del turno.
  // OJO: la semana sale de la FECHA del turno y no de la que se está viendo,
  // porque desde el mes se edita cualquier día, no solo los de esta semana.
  const lun = lunesDe(new Date(fecha + 'T00:00:00'));
  const f = [...Array(7)].map((_, k) => iso(masDias(lun, k)));
  $('#dRepetir').innerHTML = f.map((fe,i) => fe === fecha
    ? `<button type="button" class="act dia on" disabled aria-pressed="true"
         title="Es el día de este turno">${DIAS[i]}</button>`
    : `<button type="button" class="act dia" data-fe="${fe}" aria-pressed="false">${DIAS[i]}</button>`).join('');
  $('#cajaRepetir').hidden = !esNuevo;

  if (asig && !esAus) {
    $('#dEntra').value = aHora(asig.inicio);
    $('#dSale').value  = aHora(asig.fin);
    $('#dPausa').value = Math.round(Number(asig.colacion || 0) * 60);
    $('#dPlantilla').value = asig.turno_id || '';
    $('#dNota').value = asig.nota || '';
  } else {
    const t = S.turnos[0];
    $('#dEntra').value = t ? aHora(t.inicio) : '09:00';
    /* turno nuevo */
    $('#dSale').value  = t ? aHora(t.fin)    : '18:00';
    $('#dPausa').value = t ? Math.round(Number(t.colacion) * 60) : 30;
    $('#dPlantilla').value = t ? t.id : '';
    $('#dNota').value = '';
  }
  if (esAus) $('#dAusencia').value = asig.ausencia;
  pestañaDlg(!esAus);
  ajustarAusencia();
  duraDlg();
  $('#dlgTurno').showModal();
  setTimeout(() => $('#dEntra').focus(), 30);
}

function pestañaDlg(turno) {
  $('#paneTurno').hidden = !turno; $('#paneAus').hidden = turno;
  $('#tabTurno').classList.toggle('primary', turno);
  $('#tabAus').classList.toggle('primary', !turno);
}

// Una ausencia es DE ALGUIEN: en un turno sin asignar no significa nada.
function ajustarAusencia() {
  const hayPersona = $('#cajaPersonas').hidden
    ? !!$('#dPersona').value
    : [...$('#dPersonas').querySelectorAll('[aria-pressed="true"]')].some(b => b.dataset.pid);
  $('#tabAus').hidden = !hayPersona;
  if (!hayPersona) pestañaDlg(true);
}

async function guardarDlg() {
  const { p, fecha, asig } = DLG;
  const m = $('#dlgMsg');
  const esAus = $('#paneAus').hidden === false;

  if (esAus) {
    if (!p) { m.textContent = 'Una ausencia es de alguien: elige la persona.'; m.className = 'msg bad'; return; }
    recordar('la ausencia de ' + p.nombre + ' del ' + ddmm(fecha));
    // Poner una ausencia BORRA los turnos de ese dia: una ausencia es una por
    // dia y manda sobre lo planificado. Deshacer lo repone —`recordar()` esta
    // arriba— pero hasta el 06-10 no se decia NADA, y los turnos desaparecian
    // en silencio. Decir lo que se hizo es la mitad del principio que fijo
    // Pedro ese dia: la app puede actuar, pero no a escondidas.
    const seVan = turnosDe(p.id, fecha).length;
    try {
      await DATOS.ponerAusencia(S.local.id, p.id, fecha, $('#dAusencia').value);
      await refrescar();
      if (seVan) decir(`Se ${seVan === 1 ? 'quitó 1 turno' : 'quitaron ' + seVan + ' turnos'}`
        + ` de ${p.nombre.split(' ')[0]} el ${ddmm(fecha)}: una ausencia manda sobre lo planificado.`
        + ' Si fue sin querer, aprieta Deshacer.', 'ok');
    // Con choques el diálogo se queda abierto: el aviso hay que leerlo, y
    // cerrarlo lo haría desaparecer junto con la explicación.
    if (!(m.className || '').includes('bad') && !m.textContent.includes('se pisaban')
        && !m.textContent.includes('Se pisaban')) $('#dlgTurno').close();
    } catch (e) { S.hist.pop(); pintarDeshacer(); m.textContent = e.message; m.className = 'msg bad'; }
    return;
  }

  const d = duraDlg();
  if (!d) { m.textContent = 'Faltan las horas.'; m.className = 'msg bad'; return; }
  if (d.horas <= 0) { m.textContent = 'La colación se come el turno entero.'; m.className = 'msg bad'; return; }

  const esNuevo = !asig;
  // al crear, las pastillas; al editar, el desplegable de siempre
  const quienes = esNuevo
    ? [...$('#dPersonas').querySelectorAll('[aria-pressed="true"]')].map(b => b.dataset.pid || null)
    : [$('#dPersona').value || null];
  if (!quienes.length) {
    m.textContent = 'Elige al menos a alguien, o «sin asignar».'; m.className = 'msg bad'; return;
  }
  const campos = { turno_id: $('#dPlantilla').value || null, inicio: d.inicio, fin: d.fin,
                   colacion: d.colacion, puesto: $('#dPuesto').value, nota: $('#dNota').value.trim() };
  // Solo los botones que LLEVAN fecha: el del día del propio turno va marcado
  // pero sin `data-fe`, y colarlo aquí mandaba a la base una fila con la fecha
  // vacía. El Set evita además repetir ese mismo día.
  const marcados = [...$('#dRepetir').querySelectorAll('button[data-fe][aria-pressed="true"]')]
    .map(b => b.dataset.fe).filter(Boolean);
  const dias = [...new Set([fecha, ...marcados])];

  let creados = null;
  recordar(asig ? 'el turno de ' + (p ? p.nombre : 'sin asignar') + ' del ' + ddmm(fecha)
                : 'agregar turno' + (p ? ' a ' + p.nombre : ' sin asignar'));
  try {
    if (asig) {
      const ch = chocaCon(quienes[0], fecha, d.inicio, d.fin, asig.id);
      if (ch) {
        const nom = (S.personas.find(x => x.id === quienes[0]) || {}).nombre || 'Esa persona';
        S.hist.pop(); pintarDeshacer();
        m.textContent = diceChoque(nom.split(' ')[0], ch); m.className = 'msg bad';
        return;
      }
      await DATOS.editarAsignacion(asig.id, Object.assign({ persona_id: quienes[0] }, campos));
    } else {
      // tantos turnos como personas x días. Con 4 personas y 5 días son 20 de
      // una, que es justamente la gracia: antes eran 4 veces este diálogo.
      let hechos = 0;
      const choques = [];
      for (const fe of dias) for (const q of quienes) {
        // si esa persona ya tiene el mismo bloque ese día, no se duplica
        if (q && turnosDe(q, fe).some(x => Number(x.inicio) === d.inicio)) continue;
        // y si se PISA con otro suyo, tampoco se crea: nadie está en dos lados
        // a la misma hora. Se salta esa combinación y se dice cuál fue.
        const ch = chocaCon(q, fe, d.inicio, d.fin);
        if (ch) {
          const nom = (S.personas.find(x => x.id === q) || {}).nombre || '';
          choques.push(`${nom.split(' ')[0]} el ${ddmm(fe)} (${hhmm(ch.inicio)}–${hhmm(ch.fin)})`);
          continue;
        }
        await DATOS.crearAsignacion(S.local.id, q, fe, campos);
        hechos++;
      }
      if (choques.length) {
        m.textContent = (hechos ? `Se crearon ${hechos}. ` : 'No se creó ninguno. ')
          + 'Se pisaban con turnos que ya tenían: ' + choques.join(' · ') + '.';
        m.className = 'msg ' + (hechos ? '' : 'bad');
      } else if (!hechos) { m.textContent = 'Eso ya estaba puesto: no se agregó nada.'; m.className = 'msg'; }
      else creados = { n: hechos, dias, quienes };
    }
    await refrescar(); $('#dlgTurno').close();
    // Decir QUE se creo. Antes se creaban los turnos y el dialogo se cerraba
    // callado: desde la vista de Dia uno marca tres dias, ve un solo dia y no se
    // entera de nada. Pedro lo noto («no es mejor que solo en dia se pueda
    // agregar el del dia?») y el problema no era poder hacerlo, era el silencio.
    if (creados) {
      const w = $('#msgSem');
      if (w) {
        const gente = creados.quienes.map(q => q ? (S.personas.find(x => x.id === q) || {}).nombre : null)
          .filter(Boolean).map(x => x.split(' ')[0]);
        const dd = creados.dias.map(ddmm);
        const txt = `Listo: ${creados.n} turno${creados.n === 1 ? '' : 's'}`
          + (gente.length ? ' · ' + gente.join(', ') : ' · sin asignar')
          + (dd.length > 1 ? ' · ' + dd.join(', ') : '') + '.';
        w.textContent = txt; w.className = 'msg ok';
        setTimeout(() => { if (w.textContent === txt) w.textContent = ''; }, 7000);
      }
    }
  } catch (e) { S.hist.pop(); pintarDeshacer(); m.textContent = e.message; m.className = 'msg bad'; }
}

async function borrarDlg() {
  const { p, fecha, asig } = DLG; if (!asig) return;
  recordar('quitar un turno de ' + (p ? p.nombre : 'sin asignar') + ' del ' + ddmm(fecha));
  try {
    await DATOS.borrarAsignacion(asig.id);
    await refrescar(); $('#dlgTurno').close();
  } catch (e) { S.hist.pop(); pintarDeshacer(); $('#dlgMsg').textContent = e.message; $('#dlgMsg').className = 'msg bad'; }
}

async function quitarTurno(p, fecha, id) {
  const m = $('#msgSem');
  recordar('quitar el turno de ' + p.nombre + ' del ' + ddmm(fecha));
  try {
    await DATOS.borrarAsignacion(id);
    await refrescar();
    if (m) { m.textContent = 'Turno quitado. Si fue sin querer, aprieta Deshacer.'; m.className = 'msg ok'; }
  } catch (e) { S.hist.pop(); pintarDeshacer(); if (m) { m.textContent = e.message; m.className = 'msg bad'; } }
  setTimeout(() => { const x = $('#msgSem'); if (x) x.textContent = ''; }, 5000);
}

/* ---------- la casilla: una PILA de bloques ----------
   Skello no usa un desplegable: la casilla vacia dice «Ajouter un shift» y la
   llena muestra un bloque por turno, apilados. Es lo que permite el turno
   partido, y lo que hace que se vea de un vistazo quien dobla. */
function pintarCasilla(p, fe) {
  const aus = ausenciaDe(p.id, fe);
  if (aus && aus.ausencia !== 'L')
    return `<span class="bloque aus" data-asig="${aus.id}" data-fecha="${fe}" role="button" tabindex="0"
              title="${esc(AUSENCIAS[aus.ausencia] || aus.ausencia)}">${esc(aus.ausencia)} · ${esc(AUSENCIAS[aus.ausencia]||'')}</span>`;

  const ts = turnosDe(p.id, fe);
  const bloques = ts.map(a => {
    const t = a.turno_id ? turnoDe(a.turno_id) : null;
    const ci = colorDe(a, p);
    const pu = puestoDe(a, p);
    return `<span class="bloque" data-c="${ci}" data-asig="${a.id}" data-fecha="${fe}"
              draggable="true" role="button" tabindex="0"
              title="Editar este turno · o arrástralo a otro día o persona">
              <b>${hhmm(a.inicio)}–${hhmm(a.fin)}</b><i>${hfmt(horasAsig(a))} h</i>
              <em>${esc(pu || 'sin puesto')}</em>
              <button type="button" class="borrarbl" data-borrar="${a.id}" data-fecha="${fe}"
                title="Quitar este turno" aria-label="Quitar el turno de ${hhmm(a.inicio)}">×</button></span>`;
  }).join('');

  return bloques + `<button type="button" class="anadir" data-anadir="${fe}"
    aria-label="Agregar turno a ${esc(p.nombre)} el ${fe}">${ts.length ? '+' : '+ turno'}</button>`;
}

// Las opciones del puesto de una casilla: los que ya existen, mas el que tenga
// puesto esa asignacion aunque no lo use nadie mas, mas la salida «sin puesto».
function opcionesPuesto(actual) {
  const hay = puestosConocidos();
  if (actual && !hay.includes(actual)) hay.push(actual);
  return `<option value=""${actual ? '' : ' selected'}>— sin puesto —</option>`
    + hay.sort().map(x =>
        `<option value="${esc(x)}"${x === actual ? ' selected' : ''}>${esc(x)}</option>`).join('');
}

function pintarSemanaPorPuesto() {
  const f = fechas();
  $('#semCab').innerHTML = '<th>Puesto</th>' +
    DIAS.map((d,i) => `<th class="${i>=4?'fin':''}">${d}<span class="num">${ddmm(f[i])}</span></th>`).join('') + '<th>Horas</th>';

  const cuerpo = $('#semCuerpo'); cuerpo.innerHTML = '';
  // todas las asignaciones de la semana, con su persona (o sin ella)
  const todas = [];
  S.personas.forEach(p => f.forEach(fe => turnosDe(p.id, fe).forEach(a => todas.push({ p, a }))));
  S.abiertos.filter(a => f.includes(a.fecha)).forEach(a => todas.push({ p: null, a }));

  /* Las filas salen del CATALOGO de puestos, no solo de los turnos que ya hay.
     Con la semana en blanco no habia ninguna fila, asi que no habia donde
     apretar para crear: la vista no se podia arrancar a si misma. Lo encontro
     Pedro —«¿acá cómo agrego a un puesto o una persona?»— con la semana vacia.
     Se suman ademas los puestos que aparezcan en turnos y no esten en el
     catalogo, para no esconder nada. */
  const lista = [...new Set([...puestos(), ...todas.map(x => puestoRot(x.a, x.p))])].sort();
  if (!lista.length) {
    cuerpo.innerHTML = '<tr><td colspan="9" class="vacio">Todavía no hay puestos. '
      + 'Créalos en la pestaña <b>Equipo</b> y vuelve acá.</td></tr>';
    pintarResumenSemana(); return;
  }

  lista.forEach(q => {
    const horasQ = todas.filter(x => puestoRot(x.a, x.p) === q)
                        .reduce((n,x) => n + horasAsig(x.a), 0);
    const tr = el('tr');
    tr.innerHTML = `<th scope="row">${esc(q)}<span class="rol">${hfmt(horasQ)} h en la semana</span></th>` +
      f.map(fe => {
        const aqui = todas.filter(x => x.a.fecha === fe && puestoRot(x.a, x.p) === q)
                          .sort((u,v) => Number(u.a.inicio) - Number(v.a.inicio));
        const hs = aqui.reduce((n,x) => n + horasAsig(x.a), 0);
        /* Los que comparten MISMO HORARIO en el mismo puesto se ven juntos, en vez
           de dos bloques que repiten la hora. Pedro, msg 4666: «si la otra persona
           va a trabajar en el mismo horario, mismo aseo, etc se puedan vizualizar
           juntos».

           Cada persona sigue siendo su PROPIO bloque: su fila en la base, su
           click y su arrastre. Lo unico que cambia es que la hora se escribe una
           vez y los nombres van debajo. Agrupar de verdad —un bloque para varios—
           habria roto el arrastre, que mueve UNA asignacion. */
        /* El nombre es un DESPLEGABLE, con «sin asignar» al final de la lista.
           De las capturas de Skello que mando Pedro (07-10): cambiar quien cubre
           un turno es el gesto mas repetido de la semana, y hoy cuesta tres
           clics —abrir el dialogo, cambiar, guardar—. Aqui es uno.

           No decide nada por su cuenta: al cambiar llama a `soltarTurno()`, el
           mismo camino del arrastre, que ya pregunta antes de quitarle el turno
           a alguien, revisa ausencias y choques de horario, y deja paso atras.
           Duplicar esas reglas aqui seria tener dos versiones de cada una.

           El atributo va como `data-cubre` y NO como `data-asig`: ese ultimo
           significa «soy un bloque de turno» para media docena de
           `closest('[data-asig]')`, y ponerselo tambien al <select> hacia que
           esos closest devolvieran el select —sin `data-p` ni `data-fecha`— en
           vez del bloque. Lo caza la prueba que cuenta los bloques del grupo. */
        const pedazo = ({ p, a }, conHora) => {
          const ci = colorDe(a, p);
          const ops = ['<option value="">— sin asignar —</option>'].concat(
            S.personas.map(x => `<option value="${x.id}"${p && x.id === p.id ? ' selected' : ''}>`
                              + `${esc(x.nombre.split(' ')[0])}</option>`)).join('');
          return `<span class="bloque${p ? '' : ' libre'}" data-c="${ci}" data-asig="${a.id}"
            data-fecha="${fe}" data-p="${p ? p.id : ''}" draggable="true" role="button" tabindex="0"
            title="${esc((p ? p.nombre : 'Sin asignar') + ' · ' + hhmm(a.inicio) + '–' + hhmm(a.fin)
              + ' · arrástralo a otro puesto o día')}">
            ${conHora ? `<b>${hhmm(a.inicio)}–${hhmm(a.fin)}</b>` : ''}
            <select class="qcubre" data-cubre="${a.id}" draggable="false"
                    aria-label="Quién cubre este turno">${ops}</select></span>`;
        };
        const porHorario = new Map();
        aqui.forEach(x => {
          const k = hhmm(x.a.inicio) + '\u2013' + hhmm(x.a.fin);
          if (!porHorario.has(k)) porHorario.set(k, []);
          porHorario.get(k).push(x);
        });
        const bloques = [...porHorario].map(([horas, grupo]) => {
          if (grupo.length === 1) return pedazo(grupo[0], true);
          // «falta N» sale de los que NO tienen persona: no es una estimacion,
          // es la cuenta de los turnos sin dueño que ya estan en la base.
          const faltan = grupo.filter(x => !x.p).length;
          return `<div class="grupo"><b class="ghoras">${horas}`
            + (faltan ? ` <i>falta ${faltan}</i>` : '') + `</b>`
            + grupo.map(x => pedazo(x, false)).join('') + `</div>`;
        }).join('');
        // debajo de cada día, cuánta gente y cuántas horas: es la cobertura
        // metida en la misma pantalla, como la de Skello
        // El boton «+ turno», igual que en la vista por personas. Sin el, una
        // casilla que YA tiene un turno no ofrecia ninguna forma visible de
        // agregar otro: se podia apretar el borde, pero eso no lo adivina nadie.
        return `<td class="cell" data-fecha="${fe}" data-puesto="${esc(q)}">${bloques}
          <button type="button" class="anadir" data-anadir="${fe}"
            aria-label="Agregar turno de ${esc(q)} el ${fe}">${aqui.length ? '+' : '+ turno'}</button>
          <span class="cuenta">${aqui.length} ${aqui.length === 1 ? 'pers.' : 'pers.'} · ${hfmt(hs)} h</span></td>`;
      }).join('') + `<td class="tot">${hfmt(horasQ)} h</td>`;
    cuerpo.appendChild(tr);
  });

  cuerpo.onclick = ev => {
    const bl = ev.target.closest('[data-asig]');
    if (bl) {
      const p = bl.dataset.p ? S.personas.find(x => x.id === bl.dataset.p) : null;
      const lista2 = p ? filasDe(p.id, bl.dataset.fecha) : S.abiertos;
      const a = lista2.find(x => x.id === bl.dataset.asig);
      if (a) abrirTurno(p, bl.dataset.fecha, a);
      return;
    }
    // Apretar «+ turno» —o el hueco de la casilla— crea aca tambien. La fila es
    // un PUESTO, asi que el turno nace con ese puesto puesto y sin dueño: quien
    // lo cubre se elige en el dialogo. Vale aunque la casilla YA tenga turnos:
    // un puesto puede necesitar dos personas el mismo dia.
    const cel = ev.target.closest('td.cell[data-fecha][data-puesto]'); if (!cel) return;
    abrirTurno(null, cel.dataset.fecha, null, cel.dataset.puesto);
  };
  /* El clic en el desplegable NO debe abrir el dialogo del turno ni arrancar un
     arrastre: la casilla entera escucha los dos. */
  cuerpo.querySelectorAll('select.qcubre').forEach(sel => {
    ['click', 'pointerdown', 'mousedown'].forEach(ev =>
      sel.addEventListener(ev, e => e.stopPropagation()));
    sel.addEventListener('change', async e => {
      e.stopPropagation();
      await soltarTurno(sel.dataset.cubre, { persona: sel.value || null });
      // Si dijo que no en la confirmacion, el desplegable se quedo con el nombre
      // nuevo y el dato con el viejo. Repintar los vuelve a juntar.
      pintarPlan();
    });
  });

  engancharArrastre($('#tablaSem'));
  engancharSeleccion($('#tablaSem'));
  pintarSeleccion();
  pintarResumenSemana();
}

/* ---------- mover un turno arrastrandolo ----------
   Cambiar un turno de persona o de dia era: abrir el dialogo, cambiar el campo,
   guardar. Tres pasos para algo que mentalmente es uno: «este turno pasalo a
   Carla». Es la operacion mas repetida al cubrir una falla.

   Un solo escuchador en la TABLA, no en cada bloque: las casillas se repintan
   enteras y los escuchadores por bloque quedarian huerfanos en cada repintado.
   Es la misma razon por la que el clic ya se escucha a nivel de fila.

   Las AUSENCIAS no se arrastran: son una por dia y reemplazan a los turnos, asi
   que moverlas abre casos raros que nadie pidio.

   Y va SOLO en la vista por personas. En la de puestos las filas no son gente,
   asi que «soltar aca» no quiere decir nada claro: sus celdas no llevan persona
   y el turno quedaria sin dueño sin que nadie lo haya pedido. Si alguna vez se
   agrega ahi, soltar tendria que cambiar el PUESTO y respetar a la persona. */
function turnoArrastrable(id) {
  return Object.values(S.asign).flat().concat(S.abiertos).find(a => a.id === id) || null;
}

/* Soltar un turno en otra casilla. `destino` trae SOLO lo que cambia:
     { persona: id|null }  la fila era una persona
     { puesto: 'Barra'  }  la fila era un puesto
     { fecha: '2026-10-05' } la columna era otro dia
   La regla que lo ordena, de Pedro (04-10): LA FILA DICE QUE CAMBIA. Si la fila
   es una persona, soltar cambia de persona; si es un puesto, cambia de puesto. */
async function soltarTurno(id, destino) {
  const a = turnoArrastrable(id);
  const m = $('#msgSem');
  const aviso = (texto, clase) => {
    if (!m) return;
    m.textContent = texto; m.className = 'msg ' + clase;
    setTimeout(() => { if (m.textContent === texto) m.textContent = ''; }, 5000);
  };
  if (!a) return;
  const d = destino || {};
  const cambiaPersona = 'persona' in d && (a.persona_id || null) !== (d.persona || null);
  const cambiaPuesto  = 'puesto'  in d && (a.puesto || '').trim() !== (d.puesto || '').trim();
  const cambiaFecha   = 'fecha'   in d && a.fecha !== d.fecha;
  if (!cambiaPersona && !cambiaPuesto && !cambiaFecha) return;   // lo soltó donde ya estaba

  const nom = x => { const q = x ? S.personas.find(y => y.id === x) : null;
                     return q ? q.nombre.split(' ')[0] : 'Sin asignar'; };

  // Lo que le SACA un turno a alguien se confirma; correr de dia o cambiar de
  // puesto, no. Pedro lo pidio para el dia («si modifica el turno de otra
  // persona que arroje una alerta») y vale igual en las demas vistas.
  if (cambiaPersona) {
    if (!confirm(`El turno pasa de ${nom(a.persona_id)} a ${nom(d.persona)}.`
               + (cambiaFecha ? `\n\nY del ${ddmm(a.fecha)} al ${ddmm(d.fecha)}.` : '')
               + '\n\n¿Lo hago?')) return;
  }

  const fechaFinal = cambiaFecha ? d.fecha : a.fecha;
  const personaFinal = 'persona' in d ? (d.persona || null) : (a.persona_id || null);

  // Si la persona de destino tiene AUSENCIA ese dia, la casilla solo dibuja la
  // ausencia: el turno quedaria guardado pero INVISIBLE. Mejor no dejarlo.
  if (personaFinal) {
    const aus = ausenciaDe(personaFinal, fechaFinal);
    if (aus && aus.ausencia !== 'L')
      return aviso(`${nom(personaFinal)} tiene `
        + `${(AUSENCIAS[aus.ausencia] || 'una ausencia').toLowerCase()} ese día. Quita la ausencia primero.`, 'bad');
  }

  const ch = chocaCon(personaFinal, fechaFinal, Number(a.inicio), Number(a.fin), a.id);
  if (ch) return aviso(diceChoque(nom(personaFinal), ch), 'bad');

  const campos = {};
  if (cambiaFecha) campos.fecha = d.fecha;
  if (cambiaPuesto) campos.puesto = (d.puesto || '').trim();
  if ('persona' in d) {
    campos.persona_id = d.persona || null;
    // `ofrecido_por` se limpia a proposito: la fila «Sin asignar» muestra los
    // turnos sin persona Y los ofrecidos, asi que mover a alguien un turno
    // ofrecido lo dejaria visible en los dos lados a la vez.
    campos.ofrecido_por = null;
  }
  try {
    recordar('mover un turno');
    await DATOS.editarAsignacion(id, campos);
    await refrescar();
    const partes = [];
    if (cambiaPersona) partes.push('a ' + nom(d.persona));
    if (cambiaPuesto) partes.push('a ' + (d.puesto || 'sin puesto'));
    if (cambiaFecha) partes.push('al ' + ddmm(d.fecha));
    aviso('Turno movido ' + partes.join(' · ') + '.', 'ok');
  } catch (e) {
    S.hist.pop(); pintarDeshacer();        // no se movio: el paso atras sobra
    aviso(e.message, 'bad');
  }
}

/* Engancha arrastrar/soltar a una tabla de casillas: sirve para la semana —por
   personas o por puestos— y para el mes. Idempotente: se llama en cada
   repintado y marca la tabla para no colgar dos veces lo mismo.

   El destino se lee de la CASILLA, que es lo que hace que la regla «la fila dice
   que cambia» se cumpla sola: una casilla con `data-puesto` cambia el puesto,
   una con `data-p` cambia la persona. */
function destinoDeCasilla(cel) {
  const d = {};
  if (cel.dataset.fecha) d.fecha = cel.dataset.fecha;
  if ('puesto' in cel.dataset) d.puesto = cel.dataset.puesto;
  else if ('p' in cel.dataset || 'noasig' in cel.dataset) d.persona = cel.dataset.p || null;
  return d;
}

function engancharArrastre(tabla) {
  if (!tabla || tabla.dataset.arrastre) return;
  tabla.dataset.arrastre = '1';
  const casilla = t => t.closest('td.cell[data-fecha], td.mcel[data-fecha]');
  tabla.addEventListener('dragstart', ev => {
    const bl = ev.target.closest('[data-asig]');
    if (!bl || bl.classList.contains('aus')) return ev.preventDefault();
    ev.dataTransfer.setData('text/plain', bl.dataset.asig);
    ev.dataTransfer.effectAllowed = 'move';
    bl.classList.add('llevando');
  });
  tabla.addEventListener('dragend', ev => {
    const bl = ev.target.closest('[data-asig]');
    if (bl) bl.classList.remove('llevando');
    tabla.querySelectorAll('.encima').forEach(x => x.classList.remove('encima'));
  });
  tabla.addEventListener('dragover', ev => {
    const cel = casilla(ev.target); if (!cel) return;
    ev.preventDefault();                    // sin esto el navegador no deja soltar
    ev.dataTransfer.dropEffect = 'move';
    if (!cel.classList.contains('encima')) {
      tabla.querySelectorAll('.encima').forEach(x => x.classList.remove('encima'));
      cel.classList.add('encima');
    }
  });
  tabla.addEventListener('drop', ev => {
    const cel = casilla(ev.target); if (!cel) return;
    ev.preventDefault();
    cel.classList.remove('encima');
    const id = ev.dataTransfer.getData('text/plain');
    if (id) soltarTurno(id, destinoDeCasilla(cel));
  });
}


/* ================== LA MALLA COMO UNA PLANILLA ==================
   Pedido por Pedro el 06-10-2026: «la planilla deberia aceptar enegrecer,
   copiar pegar... se deberia poder navegar en la planilla como si fuera una
   planilla excel».

   ETAPA 1: seleccionar, copiar, pegar y borrar. El menu del boton derecho y
   las flechas del teclado vienen despues.

   LA DECISION QUE ORDENA EL RESTO. Nada de lo que ya funciona cambia de
   gesto. Un clic en un bloque sigue abriendo el dialogo, y un clic en
   «+ turno» sigue agregando. Lo unico que se suma es que CUALQUIER clic
   ademas SELECCIONA esa casilla, y que arrastrar desde el fondo de la casilla
   —no desde un bloque, que eso ya es mover el turno— pinta un rango.

   Por que asi y no «un clic selecciona, dos clics editan», que es lo de Excel:
   porque el clic que abre el dialogo es el gesto mas repetido de la pantalla
   y cambiarlo de significado le romperia la mano a Pedro por una funcion que
   todavia no sabe que existe. Se puede revisar cuando la use.

   La seleccion vive por CLAVE (persona + fecha), no por elemento del DOM: la
   tabla se repinta entera en cada cambio y una referencia a un <td> se queda
   apuntando a algo que ya no esta en la pagina.

   SOLO en la vista por personas. En la de puestos una fila no es gente, y
   «pegar aca» no quiere decir nada claro; en el mes, el clic en el hueco YA
   abre el dialogo, asi que no hay gesto libre que tomar. */

const SEL = { claves: new Set(), ancla: null, pintando: false, suma: false,
              rellenando: null, arrastro: false, tragarClic: false };
let PORTA = null;   // lo copiado: { ancho, alto, celdas: [[ [turnos...] ]] }

/* La clave lleva de que TIPO de casilla es, y no solo a que apunta. Las tres
   rejillas se parecen —persona x dia en Semana y en Mes, puesto x dia en
   Puestos— y sin el prefijo, lo copiado en una vista se podria pegar en otra
   donde significa algo distinto.

     p|<personaId>|<fecha>   Semana por personas, y el Mes (misma cosa)
     q|<puesto>|<fecha>      Semana por puestos

   El Mes no necesita tipo propio: su casilla es exactamente persona x dia. */
function claveCel(cel) {
  if ('puesto' in cel.dataset) return 'q|' + cel.dataset.puesto + '|' + cel.dataset.fecha;
  return 'p|' + (cel.dataset.p || '') + '|' + cel.dataset.fecha;
}
const tipoClave = k => k.slice(0, 1);
// La fecha es el ULTIMO trozo, no el tercero: un puesto puede llamarse «Barra|2».
const parteClave = k => { const i = k.indexOf('|'), j = k.lastIndexOf('|');
                          return { tipo: k.slice(0, i), que: k.slice(i + 1, j), fecha: k.slice(j + 1) }; };

/* Cual es la rejilla que se esta viendo. Son tres y solo una esta visible:
   el cuerpo de la semana —que sirve tanto para personas como para puestos— y
   el del mes. El dia no es una rejilla: es una linea de tiempo. */
function cuerpoVisible() {
  if (S.modo === 'mes')    return $('#mesCuerpo');
  if (S.modo === 'semana') return $('#semCuerpo');
  return null;
}
const SELECTOR_CEL = 'td.cell[data-fecha], td.mcel[data-fecha]';

/* La geometria se saca del DOM EN EL MOMENTO del gesto. Las filas no son una
   grilla regular —hay titulos de grupo, la fila «Sin asignar» y el pie— asi
   que numerar <tr> no sirve: se numeran solo las filas que TIENEN casillas. */
function geometria() {
  const cuerpo = cuerpoVisible(); if (!cuerpo) return null;
  const filas = [...cuerpo.querySelectorAll('tr')].filter(tr => tr.querySelector(SELECTOR_CEL));
  const mapa = new Map(); const rejilla = [];
  filas.forEach(tr => {
    const cels = [...tr.querySelectorAll(SELECTOR_CEL)];
    if (!cels.length) return;
    rejilla.push(cels);
    const f = rejilla.length - 1;
    cels.forEach((cel, c) => mapa.set(claveCel(cel), { f, c, cel }));
  });
  return { rejilla, mapa };
}

function pintarSeleccion() {
  const cuerpo = cuerpoVisible();
  // Se limpia en TODAS las rejillas, no solo en la visible: al cambiar de vista
  // la otra se queda con casillas pintadas de verde que ya no estan marcadas.
  document.querySelectorAll('td.sel').forEach(x => x.classList.remove('sel', 'ancla'));
  if (!cuerpo || !SEL.claves.size) { avisarSeleccion(); pintarTirador(); return; }
  cuerpo.querySelectorAll(SELECTOR_CEL).forEach(cel => {
    if (SEL.claves.has(claveCel(cel))) cel.classList.add('sel');
  });
  const a = SEL.ancla && [...cuerpo.querySelectorAll(SELECTOR_CEL)]
              .find(c => claveCel(c) === SEL.ancla);
  if (a) a.classList.add('ancla');
  avisarSeleccion();
  pintarTirador();
}

/* La barrita de abajo. Sin esto, la seleccion es un recuadro azul que no le
   dice a nadie que ahora puede apretar Ctrl+C: la funcion existiria y nadie la
   encontraria. Es el mismo problema que tenia «Horario libre…» escondido. */
function avisarSeleccion() {
  const caja = $('#selAviso'); if (!caja) return;
  const n = SEL.claves.size;
  if (!n) { caja.hidden = true; return; }
  const turnos = [...SEL.claves].reduce((t, k) => t + turnosDeClave(k).length, 0);
  caja.hidden = false;
  caja.innerHTML = `<b>${n}</b> ${n === 1 ? 'casilla' : 'casillas'}`
    + ` · <b>${turnos}</b> ${turnos === 1 ? 'turno' : 'turnos'}`
    + `<span>Ctrl+C copiar · Ctrl+V pegar · Supr borrar · Esc soltar</span>`
    + (PORTA ? (() => { const n = PORTA.celdas.flat().reduce((t,c)=>t+c.length,0);
        return `<em>en el portapapeles: ${PORTA.alto}×${PORTA.ancho}`
             + ` (${n} ${n === 1 ? 'turno' : 'turnos'})</em>`; })() : '');
}

/* Que turnos hay en una casilla. Depende del tipo: en la rejilla de personas
   la casilla es «lo de Ana el lunes»; en la de puestos, «todo lo de Barra el
   lunes», que puede ser de varias personas a la vez y tambien sin dueño. */
function turnosDeClave(k) {
  const { tipo, que, fecha } = parteClave(k);
  if (tipo === 'q') {
    const dentro = [];
    S.personas.forEach(p => turnosDe(p.id, fecha).forEach(a => {
      if (puestoRot(a, p) === que) dentro.push(a);
    }));
    S.abiertos.forEach(a => {
      if (a.fecha === fecha && !a.persona_id && puestoRot(a, null) === que) dentro.push(a);
    });
    return dentro.sort((u, v) => Number(u.inicio) - Number(v.inicio));
  }
  if (!que) return S.abiertos.filter(a => a.fecha === fecha && !a.persona_id);
  if (ausenciaDe(que, fecha)) return [];     // un dia de ausencia no se copia
  return turnosDe(que, fecha);
}

/* Como nace un turno pegado en una casilla. La diferencia entre las dos
   rejillas esta justo aca, y es la que Pedro describio: en la de PERSONAS
   manda la fila —el turno pasa a ser de esa persona y conserva su puesto—; en
   la de PUESTOS manda la columna de la izquierda —el turno pasa a ese puesto y
   CONSERVA A SU PERSONA, o se queda sin asignar si no tenia—. */
function nacerEn(k, t) {
  const { tipo, que, fecha } = parteClave(k);
  if (tipo === 'q') return { persona_id: t.persona_id || null, fecha,
                             puesto: que === 'Sin puesto' ? '' : que,
                             turno_id: t.turno_id || null, inicio: t.inicio, fin: t.fin,
                             colacion: t.colacion || 0, nota: t.nota || '' };
  return { persona_id: que || null, fecha, puesto: t.puesto || '',
           turno_id: t.turno_id || null, inicio: t.inicio, fin: t.fin,
           colacion: t.colacion || 0, nota: t.nota || '' };
}

function seleccionar(cel, modo) {
  const g = geometria(); if (!g) return;
  const k = claveCel(cel);
  if (modo === 'suma') {                      // Ctrl+clic: sumar o quitar una
    if (SEL.claves.has(k)) SEL.claves.delete(k); else SEL.claves.add(k);
    SEL.ancla = k;
  } else if (modo === 'rango' && SEL.ancla && g.mapa.has(SEL.ancla)) {
    const a = g.mapa.get(SEL.ancla), b = g.mapa.get(k); if (!b) return;
    SEL.claves.clear();
    for (let f = Math.min(a.f, b.f); f <= Math.max(a.f, b.f); f++)
      for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c++)
        if (g.rejilla[f] && g.rejilla[f][c]) SEL.claves.add(claveCel(g.rejilla[f][c]));
  } else {
    SEL.claves.clear(); SEL.claves.add(k); SEL.ancla = k;
  }
  // Un clic tambien manda sobre la casilla ACTIVA: si no, apretar con el raton
  // y seguir con las flechas arrancaria desde donde quedo el teclado, que no
  // es donde el usuario esta mirando.
  if (modo !== 'rango') ACTIVA = k;
  pintarSeleccion();
}

function soltarSeleccion() { SEL.claves.clear(); SEL.ancla = null; ACTIVA = null; pintarSeleccion(); }

/* Idempotente, igual que `engancharArrastre`: se llama en cada repintado. */
function engancharSeleccion(tabla) {
  if (!tabla || tabla.dataset.selec) return;
  tabla.dataset.selec = '1';

  tabla.addEventListener('mousedown', ev => {
    if (ev.button !== 0) return;              // el derecho es de la etapa 2
    const cel = ev.target.closest(SELECTOR_CEL); if (!cel) return;
    const enBloque = !!ev.target.closest('[data-asig]');

    if (ev.shiftKey) { ev.preventDefault(); return seleccionar(cel, 'rango'); }
    if (ev.ctrlKey || ev.metaKey) { ev.preventDefault(); return seleccionar(cel, 'suma'); }

    seleccionar(cel, 'uno');
    // Arrastrar desde un bloque ya significa MOVER el turno. Desde el resto de
    // la casilla —el «+ turno» incluido, que ocupa casi toda— pinta el rango.
    if (!enBloque) { SEL.pintando = true; SEL.arrastro = false; }
  });

  /* Si hubo arrastre, el clic que viene despues NO llega a la casilla.
     Sin esto, en la rejilla de PUESTOS y en el MES —donde apretar el hueco ya
     abre el dialogo de crear— marcar un rango te abria una ventana al soltar.
     Va en fase de captura para adelantarse a los escuchadores de la tabla.

     El permiso lo arma el `mouseup` y se desarma SOLO (ver mas abajo). La
     primera version usaba la bandera del arrastre directamente y se quedaba
     armada cuando el clic no llegaba —soltar fuera de la tabla, o arrastrar el
     tirador—: el siguiente clic en un turno no abria el dialogo. Lo cazo la
     prueba de que el clic sigue funcionando, que para eso esta. */
  tabla.addEventListener('click', ev => {
    if (!SEL.tragarClic) return;
    SEL.tragarClic = false;
    ev.preventDefault(); ev.stopPropagation();
  }, true);

  tabla.addEventListener('mouseover', ev => {
    if (!SEL.pintando && !SEL.rellenando) return;
    const cel = ev.target.closest(SELECTOR_CEL); if (!cel) return;
    // Solo cuenta como arrastre si se SALIO de la casilla donde empezo. Moverse
    // por dentro —de un bloque al boton, por ejemplo— tambien dispara
    // `mouseover`, y tragarse ese clic dejaria muerto el clic normal.
    if (claveCel(cel) !== SEL.ancla) SEL.arrastro = true;
    seleccionar(cel, 'rango');
  });
}

// El mouseup va en el documento: soltar el boton fuera de la tabla tiene que
// terminar el arrastre igual, o la seleccion sigue pintandose sola despues.
document.addEventListener('mouseup', () => {
  SEL.pintando = false;
  if (SEL.rellenando) soltarRelleno();
  /* El navegador manda `click` justo despues de `mouseup`, antes de cualquier
     temporizador. Asi que armar aqui y desarmar en un `setTimeout(0)` se come
     exactamente UN clic —el de este arrastre— y ninguno mas, aunque ese clic
     nunca llegue porque se solto fuera de la tabla. */
  if (SEL.arrastro) { SEL.tragarClic = true; setTimeout(() => { SEL.tragarClic = false; }, 0); }
  SEL.arrastro = false;
});

/* ---------- copiar, pegar, borrar ---------- */

function enCampo() {
  const a = document.activeElement;
  return !!a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable
                 || a.closest('dialog[open]'));
}

function copiarSeleccion(cortar) {
  const g = geometria(); if (!g || !SEL.claves.size) return;
  const pts = [...SEL.claves].map(k => g.mapa.get(k)).filter(Boolean);
  if (!pts.length) return;
  const f0 = Math.min(...pts.map(p => p.f)), f1 = Math.max(...pts.map(p => p.f));
  const c0 = Math.min(...pts.map(p => p.c)), c1 = Math.max(...pts.map(p => p.c));
  const celdas = [];
  for (let f = f0; f <= f1; f++) {
    const fila = [];
    for (let c = c0; c <= c1; c++) {
      const cel = g.rejilla[f] && g.rejilla[f][c];
      const dentro = cel && SEL.claves.has(claveCel(cel));
      // Se guarda tambien `persona_id`: en la rejilla de PUESTOS es lo que
      // hace que el turno pegado siga siendo de quien era, y que uno sin dueño
      // siga sin dueño. En la de personas se ignora, porque manda la fila.
      fila.push(dentro ? turnosDeClave(claveCel(cel)).map(a => ({
        persona_id: a.persona_id || null,
        turno_id: a.turno_id || null, inicio: a.inicio, fin: a.fin,
        colacion: a.colacion || 0, puesto: a.puesto || '', nota: a.nota || '',
      })) : []);
    }
    celdas.push(fila);
  }
  // Se anota de que rejilla salio: pegar lo de una fila de persona dentro de
  // una fila de puesto significa otra cosa, y mezclarlas en silencio dejaria
  // turnos donde nadie los puso.
  PORTA = { ancho: c1 - c0 + 1, alto: f1 - f0 + 1, celdas,
            tipo: tipoClave(claveCel(pts[0].cel)) };

  // Ademas al portapapeles del sistema, en texto, para que se pueda pegar en
  // un correo o en un Excel de verdad. Es best-effort: sin https o sin permiso
  // tira, y eso no debe romper el copiado de adentro, que es el que importa.
  const txt = celdas.map(fila => fila.map(cel =>
    cel.map(t => { const q = t.persona_id && S.personas.find(x => x.id === t.persona_id);
      return hhmm(t.inicio) + '-' + hhmm(t.fin)
        + (t.puesto ? ' ' + t.puesto : '') + (q ? ' ' + q.nombre : ''); }).join(' / ')
  ).join('\t')).join('\n');
  try { navigator.clipboard && navigator.clipboard.writeText(txt); } catch (e) {}

  const n = celdas.flat().reduce((t, c) => t + c.length, 0);
  if (cortar) return borrarSeleccion('cortar');
  decir(`Copiadas ${PORTA.alto}×${PORTA.ancho} casillas con ${n} ${n === 1 ? 'turno' : 'turnos'}. `
        + 'Marca donde quieras ponerlos y aprieta Ctrl+V.', 'ok');
  avisarSeleccion();
}

/* Pegar REEMPLAZA lo que haya en la casilla de destino, como en Excel: copiar
   el lunes sobre el martes tiene que dejar el martes igual al lunes, no con el
   doble de turnos. Deshacer lo repone si fue sin querer.

   Dos formas, las dos de Excel:
     · una sola casilla copiada  → se repite en TODAS las marcadas
     · un rectangulo             → se pega anclado arriba a la izquierda */
async function pegarSeleccion() {
  if (!PORTA) return decir('No hay nada copiado. Marca casillas y aprieta Ctrl+C.', 'bad');
  const g = geometria(); if (!g || !SEL.claves.size)
    return decir('Marca primero dónde quieres pegar.', 'bad');

  const pts = [...SEL.claves].map(k => g.mapa.get(k)).filter(Boolean);
  if (!pts.length) return decir('Marca primero dónde quieres pegar.', 'bad');
  const tipoAqui = tipoClave(claveCel(pts[0].cel));
  if (PORTA.tipo && PORTA.tipo !== tipoAqui)
    return decir(PORTA.tipo === 'q'
      ? 'Eso lo copiaste de la vista por puestos. Vuelve a Puestos para pegarlo.'
      : 'Eso lo copiaste de la vista por personas. Vuelve a Personas para pegarlo.', 'bad');
  const f0 = Math.min(...pts.map(p => p.f)), c0 = Math.min(...pts.map(p => p.c));
  const unaSola = PORTA.alto === 1 && PORTA.ancho === 1;

  const destinos = [];   // { cel, turnos }
  if (unaSola) {
    pts.forEach(p => destinos.push({ cel: p.cel, turnos: PORTA.celdas[0][0] }));
  } else {
    for (let f = 0; f < PORTA.alto; f++)
      for (let c = 0; c < PORTA.ancho; c++) {
        const cel = g.rejilla[f0 + f] && g.rejilla[f0 + f][c0 + c];
        if (cel) destinos.push({ cel, turnos: PORTA.celdas[f][c] });
      }
  }

  // Las ausencias no se pisan: si alguien esta de vacaciones, pegarle un turno
  // encima es lo contrario de lo que uno quiso hacer. Se saltan y se avisa.
  const saltadas = [];
  const utiles = destinos.filter(d => {
    const { tipo, que, fecha } = parteClave(claveCel(d.cel));
    if (tipo === 'p' && que && ausenciaDe(que, fecha)) { saltadas.push(d.cel); return false; }
    return true;
  });
  if (!utiles.length) return decir('Todas las casillas marcadas son días de ausencia. No se pegó nada.', 'bad');

  const borrar = [];
  const crear = [];
  utiles.forEach(({ cel, turnos }) => {
    const k = claveCel(cel);
    turnosDeClave(k).forEach(a => borrar.push(a.id));
    turnos.forEach(t => crear.push(nacerEn(k, t)));
  });
  if (!borrar.length && !crear.length) return decir('No había nada que pegar.', 'bad');

  recordar('pegar en ' + utiles.length + (utiles.length === 1 ? ' casilla' : ' casillas'));
  try {
    if (borrar.length) await DATOS.borrarVarias(borrar);
    if (crear.length)  await DATOS.crearAsignacionesLote(S.local.id, crear);
    await refrescar();
    decir(`Pegados ${crear.length} ${crear.length === 1 ? 'turno' : 'turnos'} en `
      + `${utiles.length} ${utiles.length === 1 ? 'casilla' : 'casillas'}.`
      + (saltadas.length ? ` Se saltaron ${saltadas.length} por ausencia.` : '')
      + ' Si fue sin querer, aprieta Deshacer.', 'ok');
  } catch (e) { S.hist.pop(); pintarDeshacer(); decir(e.message, 'bad'); }
}

async function borrarSeleccion(porCorte) {
  const ids = [...SEL.claves].flatMap(k => turnosDeClave(k).map(a => a.id));
  if (!ids.length) return decir('En lo marcado no hay ningún turno que borrar.', 'bad');
  recordar((porCorte ? 'cortar ' : 'borrar ') + ids.length
           + (ids.length === 1 ? ' turno' : ' turnos'));
  try {
    await DATOS.borrarVarias(ids);
    await refrescar();
    decir(`${porCorte ? 'Cortados' : 'Borrados'} ${ids.length} `
      + `${ids.length === 1 ? 'turno' : 'turnos'}. Si fue sin querer, aprieta Deshacer.`, 'ok');
  } catch (e) { S.hist.pop(); pintarDeshacer(); decir(e.message, 'bad'); }
}

function decir(txt, clase) {
  const m = $('#msgSem'); if (!m) return;
  m.textContent = txt; m.className = 'msg ' + (clase || '');
  clearTimeout(decir.t);
  decir.t = setTimeout(() => { const x = $('#msgSem'); if (x) { x.textContent = ''; x.className = 'msg'; } }, 7000);
}

/* El teclado va en el DOCUMENTO, no en la tabla: para que la tabla reciba
   teclas tendria que tener el foco, y aca el foco lo tienen los bloques y los
   botones de adentro. Se sale si el foco esta en un campo o en un dialogo, que
   es donde Ctrl+C tiene que seguir copiando texto. */
document.addEventListener('keydown', ev => {
  if (enCampo()) return;
  if (!SEL.claves.size && ev.key !== 'Escape') return;
  const ctrl = ev.ctrlKey || ev.metaKey;
  if (ctrl && (ev.key === 'c' || ev.key === 'C')) { ev.preventDefault(); copiarSeleccion(false); }
  else if (ctrl && (ev.key === 'x' || ev.key === 'X')) { ev.preventDefault(); copiarSeleccion(true); }
  else if (ctrl && (ev.key === 'v' || ev.key === 'V')) { ev.preventDefault(); pegarSeleccion(); }
  else if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); borrarSeleccion(false); }
  else if (ev.key === 'Escape') {
    const m = $('#menuCel');
    if (m && !m.hidden) cerrarMenu(); else soltarSeleccion();
  }
});


/* ---------- ETAPA 2: el menu del boton derecho ----------
   Pedro, 06-10-2026: «faltan las opciones del boton derecho».

   Lo que hace que valga la pena no es tener las mismas acciones del teclado en
   un menu: es que **se vean**. Los atajos de la etapa 1 solo los encuentra
   quien ya sabe que existen; el boton derecho es donde la gente va a BUSCAR
   que se puede hacer con lo que tiene marcado.

   Dos reglas que se siguieron:

   · Si lo que se aprieta esta fuera de la seleccion, se selecciona eso primero
     —como Excel, y como cualquier explorador de archivos—. Abrir un menu que
     opera sobre otra cosa es la forma mas rapida de borrar lo que no era.
   · Las opciones que no se pueden hacer salen APAGADAS, no escondidas. Un menu
     que cambia de largo segun el caso no se aprende nunca; uno que siempre
     tiene las mismas filas, si. Y «Pegar» apagado ademas ENSEÑA que existe. */

const MENU = { cel: null };

function menuCel() {
  let m = $('#menuCel');
  if (m) return m;
  m = el('div', 'menucel');
  m.id = 'menuCel'; m.hidden = true; m.setAttribute('role', 'menu');
  document.body.appendChild(m);
  // Un solo escuchador, con la accion en el propio boton: el menu se vuelve a
  // dibujar entero cada vez que se abre.
  m.addEventListener('click', ev => {
    const b = ev.target.closest('button[data-acc]'); if (!b || b.disabled) return;
    // La casilla se guarda ANTES de cerrar: `cerrarMenu()` deja `MENU.cel` en
    // null, y las dos opciones de abajo la necesitan. Con esto en el orden
    // contrario, «Marcar toda la fila» cerraba el menu y no marcaba nada.
    const cel = MENU.cel;
    cerrarMenu();
    const acc = b.dataset.acc;
    if (acc === 'copiar')  return copiarSeleccion(false);
    if (acc === 'cortar')  return copiarSeleccion(true);
    if (acc === 'pegar')   return pegarSeleccion();
    if (acc === 'borrar')  return borrarSeleccion(false);
    if (acc === 'agregar') {
      const [pid, fecha] = claveCel(cel).split('|');
      return abrirTurno(pid ? S.personas.find(x => x.id === pid) : null, fecha, null);
    }
    if (acc === 'fila')    return seleccionarLinea('fila', cel);
    if (acc === 'columna') return seleccionarLinea('columna', cel);
  });
  return m;
}

/* Toda la fila de una persona, o todo un dia de todos. Es lo que uno quiere
   cuando piensa «copiale la semana a Benja» o «el lunes igual que el martes»,
   y a mano son siete u ocho clics con el Shift apretado. */
function seleccionarLinea(que, cel) {
  const g = geometria(); if (!g || !cel) return;
  const p = g.mapa.get(claveCel(cel)); if (!p) return;
  SEL.claves.clear();
  if (que === 'fila') g.rejilla[p.f].forEach(c => SEL.claves.add(claveCel(c)));
  else g.rejilla.forEach(fila => { if (fila[p.c]) SEL.claves.add(claveCel(fila[p.c])); });
  SEL.ancla = claveCel(cel);
  pintarSeleccion();
}

function cerrarMenu() { const m = $('#menuCel'); if (m) m.hidden = true; MENU.cel = null; }

function abrirMenu(cel, x, y) {
  MENU.cel = cel;
  const m = menuCel();
  const nCel = SEL.claves.size;
  const nTur = [...SEL.claves].reduce((t, k) => t + turnosDeClave(k).length, 0);
  const plural = (n, u, v) => n + ' ' + (n === 1 ? u : v);

  const fila = (acc, txt, atajo, activo) =>
    `<button type="button" role="menuitem" data-acc="${acc}"${activo ? '' : ' disabled'}>`
    // Sin atajo no va <kbd>: un recuadro vacio al lado de «Marcar toda la fila»
    // parece un control roto. Se vio en la captura, no en las pruebas.
    + `<span>${txt}</span>${atajo ? `<kbd>${atajo}</kbd>` : ''}</button>`;

  m.innerHTML =
      `<p class="cab">${plural(nCel, 'casilla marcada', 'casillas marcadas')}`
    + `${nTur ? ' · ' + plural(nTur, 'turno', 'turnos') : ''}</p>`
    + fila('copiar',  'Copiar',        'Ctrl+C', nTur > 0)
    + fila('cortar',  'Cortar',        'Ctrl+X', nTur > 0)
    + fila('pegar',   PORTA ? `Pegar (${PORTA.alto}×${PORTA.ancho})` : 'Pegar', 'Ctrl+V', !!PORTA)
    + fila('borrar',  'Borrar los turnos', 'Supr', nTur > 0)
    + '<hr>'
    + fila('agregar', 'Agregar un turno acá', '', true)
    + '<hr>'
    + fila('fila',    'Marcar toda la fila',    '', true)
    + fila('columna', 'Marcar todo el día',     '', true);

  // Se dibuja primero y se mide despues: sin medirlo, un menu abierto abajo a
  // la derecha se sale de la pantalla y la mitad queda donde no se alcanza.
  m.hidden = false;
  m.style.left = '0px'; m.style.top = '0px';
  const r = m.getBoundingClientRect();
  const mx = Math.min(x, window.innerWidth  - r.width  - 8);
  const my = Math.min(y, window.innerHeight - r.height - 8);
  m.style.left = Math.max(8, mx) + 'px';
  m.style.top  = Math.max(8, my) + 'px';
  const primero = m.querySelector('button:not([disabled])');
  if (primero) primero.focus();
}

document.addEventListener('contextmenu', ev => {
  const cel = ev.target.closest(SELECTOR_CEL);
  if (!cel || !cuerpoVisible() || !cuerpoVisible().contains(cel)) return;  // fuera, el menu del navegador
  ev.preventDefault();
  // Apretar fuera de lo marcado selecciona eso primero: un menu que opera
  // sobre otra cosa es la forma mas rapida de borrar lo que no era.
  if (!SEL.claves.has(claveCel(cel))) seleccionar(cel, 'uno');
  abrirMenu(cel, ev.clientX, ev.clientY);
});

document.addEventListener('mousedown', ev => {
  const m = $('#menuCel');
  if (m && !m.hidden && !ev.target.closest('#menuCel')) cerrarMenu();
}, true);
window.addEventListener('scroll', cerrarMenu, true);
window.addEventListener('scroll', () => { if (typeof pintarTirador === 'function') pintarTirador(); }, true);
window.addEventListener('resize', () => { if (typeof pintarTirador === 'function') pintarTirador(); });
window.addEventListener('resize', cerrarMenu);


/* ---------- ETAPA 3: moverse con el teclado, Ctrl+Z, y el tirador ----------
   Pedro pidio «navegar en la planilla como si fuera una planilla excel». Las
   etapas 1 y 2 dieron marcar y operar; falta lo de MOVERSE sin soltar el
   teclado, que es lo que hace que una planilla se sienta planilla.

   · Flechas          mueven la casilla marcada
   · Shift + flechas  estiran el rectangulo desde el ancla
   · Inicio / Fin     al primer o ultimo dia de la fila
   · Enter            abre el turno de la casilla (o crea uno si esta vacia)
   · Ctrl + Z         deshacer, el mismo boton de arriba

   El ANCLA es lo que hace que Shift+flecha funcione como en Excel: el
   rectangulo siempre se mide entre el ancla —la casilla donde empezo la
   seleccion— y la casilla «activa», que es la que se mueve. Sin guardar las
   dos por separado, estirar y despues achicar no vuelve sobre sus pasos. */

let ACTIVA = null;   // la casilla que se mueve con las flechas, por clave

function moverActiva(df, dc, estirando) {
  const g = geometria(); if (!g) return false;
  const base = ACTIVA && g.mapa.has(ACTIVA) ? ACTIVA : SEL.ancla;
  if (!base || !g.mapa.has(base)) return false;
  const p = g.mapa.get(base);
  const f = Math.max(0, Math.min(g.rejilla.length - 1, p.f + df));
  const fila = g.rejilla[f]; if (!fila || !fila.length) return false;
  const c = dc === 'inicio' ? 0
          : dc === 'fin'    ? fila.length - 1
          : Math.max(0, Math.min(fila.length - 1, p.c + dc));
  const destino = fila[c]; if (!destino) return false;

  ACTIVA = claveCel(destino);
  if (estirando) {
    if (!SEL.ancla) SEL.ancla = base;
    seleccionar(destino, 'rango');
  } else {
    SEL.ancla = ACTIVA;
    seleccionar(destino, 'uno');
  }
  // Que la casilla a la que uno se movio este a la vista. `nearest` y no
  // `center`: con `center` la tabla salta en cada flecha aunque la casilla ya
  // se viera, y marea.
  destino.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return true;
}

function abrirLaActiva() {
  const g = geometria(); if (!g) return;
  const k = ACTIVA || SEL.ancla; if (!k || !g.mapa.has(k)) return;
  const [pid, fecha] = k.split('|');
  const p = pid ? S.personas.find(x => x.id === pid) : null;
  const hay = turnosDeClave(k);
  // Con un solo turno se abre ESE; con varios no hay forma de saber cual quiso,
  // asi que se crea uno nuevo, que es lo unico que no destruye informacion.
  abrirTurno(p, fecha, hay.length === 1 ? hay[0] : null);
}

/* El tirador de relleno: el cuadradito de la esquina de abajo a la derecha de
   la seleccion. Se arrastra y repite lo marcado hacia donde se lleve.

   Va en un elemento SUELTO, posicionado sobre la tabla, y no dentro de la
   casilla: dentro de un <td> con `overflow` lo cortaria el borde, y ademas
   habria que redibujarlo en cada repintado de la fila. Asi solo se mueve. */
function pintarTirador() {
  let t = $('#tirador');
  if (!t) {
    t = el('div', 'tirador'); t.id = 'tirador'; t.hidden = true;
    t.title = 'Arrastra para repetir lo marcado';
    document.body.appendChild(t);
    t.addEventListener('mousedown', ev => {
      ev.preventDefault(); ev.stopPropagation();
      SEL.rellenando = { desde: new Set(SEL.claves) };
    });
  }
  const caja = S.modo === 'mes' ? $('#cajaMes') : $('#cajaSemana');
  const g = geometria();
  if (!g || SEL.claves.size < 1 || !caja) { t.hidden = true; return; }
  const pts = [...SEL.claves].map(k => g.mapa.get(k)).filter(Boolean);
  if (!pts.length) { t.hidden = true; return; }
  const f1 = Math.max(...pts.map(p => p.f)), c1 = Math.max(...pts.map(p => p.c));
  const esquina = g.rejilla[f1] && g.rejilla[f1][c1];
  if (!esquina) { t.hidden = true; return; }
  const r = esquina.getBoundingClientRect();
  const rc = caja.getBoundingClientRect();
  // Si la casilla todavia no tiene tamaño es que la tabla se esta repintando
  // en este mismo instante: medir ahora da ceros y el tirador se escondria
  // solo. Se vuelve a intentar en el cuadro siguiente en vez de ocultarlo.
  // (Se descubrio porque la prueba del tirador fallaba una vez de cada dos.)
  if (!r.width || !r.height) { requestAnimationFrame(pintarTirador); return; }
  // Si la esquina quedo fuera de la parte visible de la tabla, el tirador no se
  // dibuja: pegado al borde parece que marca otra casilla.
  if (r.right < rc.left || r.right > rc.right + 2 || r.bottom < rc.top || r.bottom > rc.bottom + 2) {
    t.hidden = true; return;
  }
  t.style.left = (r.right - 4) + 'px';
  t.style.top  = (r.bottom - 4) + 'px';
  t.hidden = false;
}

async function soltarRelleno() {
  const origen = SEL.rellenando; SEL.rellenando = null;
  if (!origen) return;
  const g = geometria(); if (!g) return;
  // Lo que se marco DESPUES de empezar a arrastrar, menos lo que ya estaba:
  // eso es a donde hay que repetir.
  const nuevas = [...SEL.claves].filter(k => !origen.desde.has(k));
  if (!nuevas.length) return;

  // El molde: lo que habia en las casillas de origen, por COLUMNA. Rellenar
  // hacia abajo repite la columna; hacia el lado, repite la fila. Es lo que
  // hace Excel y lo que uno espera al estirar una semana.
  const pts = [...origen.desde].map(k => g.mapa.get(k)).filter(Boolean);
  if (!pts.length) return;
  const f0 = Math.min(...pts.map(p => p.f)), f1 = Math.max(...pts.map(p => p.f));
  const c0 = Math.min(...pts.map(p => p.c)), c1 = Math.max(...pts.map(p => p.c));
  const alto = f1 - f0 + 1, ancho = c1 - c0 + 1;
  const molde = (f, c) => {
    const cel = g.rejilla[f0 + ((f - f0) % alto + alto) % alto]
             && g.rejilla[f0 + ((f - f0) % alto + alto) % alto][c0 + ((c - c0) % ancho + ancho) % ancho];
    return cel ? turnosDeClave(claveCel(cel)) : [];
  };

  const borrar = [], crear = [];
  let saltadas = 0;
  nuevas.forEach(k => {
    const p = g.mapa.get(k); if (!p) return;
    const { tipo, que, fecha } = parteClave(k);
    if (tipo === 'p' && que && ausenciaDe(que, fecha)) { saltadas++; return; }
    turnosDeClave(k).forEach(a => borrar.push(a.id));
    molde(p.f, p.c).forEach(t => crear.push(nacerEn(k, t)));
  });
  if (!borrar.length && !crear.length)
    return decir('No había turnos que repetir en lo marcado.', 'bad');

  recordar('rellenar ' + nuevas.length + (nuevas.length === 1 ? ' casilla' : ' casillas'));
  try {
    if (borrar.length) await DATOS.borrarVarias(borrar);
    if (crear.length)  await DATOS.crearAsignacionesLote(S.local.id, crear);
    await refrescar();
    decir(`Repetidos ${crear.length} ${crear.length === 1 ? 'turno' : 'turnos'} en `
      + `${nuevas.length} ${nuevas.length === 1 ? 'casilla' : 'casillas'}.`
      + (saltadas ? ` Se saltaron ${saltadas} por ausencia.` : '')
      + ' Si fue sin querer, aprieta Deshacer.', 'ok');
  } catch (e) { S.hist.pop(); pintarDeshacer(); decir(e.message, 'bad'); }
}

const FLECHAS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

document.addEventListener('keydown', ev => {
  if (enCampo()) return;
  const ctrl = ev.ctrlKey || ev.metaKey;

  if (ctrl && (ev.key === 'z' || ev.key === 'Z')) {
    const b = $('#btnDeshacer');
    if (b && !b.disabled) { ev.preventDefault(); deshacer(); }
    return;
  }
  if (!SEL.claves.size) return;
  if (FLECHAS[ev.key]) {
    const [df, dc] = FLECHAS[ev.key];
    if (moverActiva(df, dc, ev.shiftKey)) ev.preventDefault();
  } else if (ev.key === 'Home' || ev.key === 'End') {
    if (moverActiva(0, ev.key === 'Home' ? 'inicio' : 'fin', ev.shiftKey)) ev.preventDefault();
  } else if (ev.key === 'Enter') {
    ev.preventDefault(); abrirLaActiva();
  }
});

function pintarSemana() {
  if (S.agrupar === 'puestos') return pintarSemanaPorPuesto();
  const f = fechas();
  $('#semTitulo').innerHTML = esc(ddmm(f[0]) + ' al ' + ddmm(f[6]))
    + `<span class="numsem">Semana ${semanaISO(f[0])}</span>`;
  $('#semCab').innerHTML = '<th>Persona</th>' +
    DIAS.map((d,i) => `<th class="${i>=4?'fin':''}">${d}<span class="num">${ddmm(f[i])}</span></th>`).join('') + '<th>Horas</th>';

  const cuerpo = $('#semCuerpo'); cuerpo.innerHTML = '';
  const gente = personasVisibles();
  if (!gente.length) {
    cuerpo.innerHTML = `<tr><td colspan="9" class="vacio">${(S.filtro || S.filtroE)
      ? 'Nadie con esos filtros. Cámbialos arriba.'
      : 'Todavía no tienes a nadie. Anda a <b>Equipo</b> y agrega tu primera persona.'}</td></tr>`;
    $('#semPie').innerHTML = ''; $('#semPersonas').innerHTML = ''; return;
  }

  // Fila de turnos sin dueño, arriba de todo: se ven MIENTRAS planificas,
  // no en otra pestaña. Es como lo hace Skello con su fila "Non assignés".
  // La fila de los turnos sin dueño, arriba de todo. Ya no es un atajo a otra
  // pestaña: son turnos de verdad, se editan aquí y se asignan desde el mismo
  // diálogo, eligiendo a quién. Es como lo hace Skello con «Non assigné».
  const sinDueno = el('tr','noasig');
  sinDueno.innerHTML = '<th scope="row">Sin asignar<span class="rol">el primero que lo tome se lo queda</span></th>' +
    f.map(fe => {
      const aqui = S.abiertos.filter(a => a.fecha === fe);
      return `<td class="cell" data-fecha="${fe}" data-p="">` + aqui.map(a => {
        const t = a.turno_id ? turnoDe(a.turno_id) : null;
        const ci = colorDe(a);
        const of = a.ofrecido_por ? S.personas.find(x => x.id === a.ofrecido_por) : null;
        return `<span class="bloque libre" data-c="${ci}" data-asig="${a.id}" data-fecha="${fe}"
          draggable="true" role="button" tabindex="0"
          title="${of ? 'Lo ofreció ' + esc(of.nombre) : 'Nadie lo ha tomado'} · arrástralo a alguien para asignárselo">
          <b>${hhmm(a.inicio)}–${hhmm(a.fin)}</b><i>${hfmt(horasAsig(a))} h</i>
          <em>${esc(a.puesto || 'sin puesto')}${of ? ' · ofrece ' + esc(of.nombre.split(' ')[0]) : ''}</em></span>`;
      }).join('') + `<button type="button" class="anadir" data-anadir="${fe}"
        aria-label="Publicar un turno sin asignar el ${fe}">${aqui.length ? '+' : '+ turno'}</button></td>`;
    }).join('') + '<td class="tot"></td>';
  sinDueno.addEventListener('click', ev => {
    const cel = ev.target.closest('td[data-fecha]'); if (!cel) return;
    const bl = ev.target.closest('[data-asig]');
    if (bl) {
      const a = S.abiertos.find(x => x.id === bl.dataset.asig);
      if (a) return abrirTurno(null, cel.dataset.fecha, a);
    }
    if (ev.target.closest('[data-anadir]')) abrirTurno(null, cel.dataset.fecha, null);
  });
  cuerpo.appendChild(sinDueno);

  let grupoActual = null;
  gente.forEach(p => {
    // una fila de titulo cada vez que cambia el puesto: cocina, mesas, barra…
    const g = (p.rol || '').trim() || 'Sin puesto';
    if (g !== grupoActual) {
      grupoActual = g;
      const n = gente.filter(x => ((x.rol||'').trim() || 'Sin puesto') === g).length;
      const huerfano = g === 'Sin puesto';
      cuerpo.appendChild(el('tr','grupo' + (huerfano ? ' sinpuesto' : ''),
        `<th colspan="9">${esc(g)} <span>${n}</span>${huerfano
          ? '<span class="ojo">no se cuentan en la cobertura</span>' : ''}</th>`));
    }
    const tr = el('tr');
    tr.innerHTML = `<th scope="row">${esc(p.nombre)}<span class="rol">${esc(p.rol||'')} · ${clp(p.valor_hora)}/h · ${hfmt(p.horas_contrato)} h</span></th>` +
      f.map(fe => `<td class="cell" data-fecha="${fe}" data-p="${p.id}">${pintarCasilla(p, fe)}</td>`).join('')
      + `<td class="tot"><span class="hcell" id="h-${p.id}"></span></td>`;
    cuerpo.appendChild(tr);

    // Un solo escuchador por fila: las casillas se repintan enteras y colgarle
    // un escuchador a cada bloque los dejaria huerfanos en cada repintado.
    tr.addEventListener('click', ev => {
      const papelera = ev.target.closest('[data-borrar]');
      if (papelera) { ev.stopPropagation(); return quitarTurno(p, papelera.dataset.fecha, papelera.dataset.borrar); }
      const añadir = ev.target.closest('[data-anadir]');
      if (añadir) return abrirTurno(p, añadir.dataset.anadir, null);
      const bloque = ev.target.closest('[data-asig]');
      if (bloque) {
        const a = filasDe(p.id, bloque.dataset.fecha).find(x => x.id === bloque.dataset.asig);
        if (a) return abrirTurno(p, bloque.dataset.fecha, a);
      }
    });
  });
  engancharArrastre($('#tablaSem'));
  engancharSeleccion($('#tablaSem'));
  pintarSeleccion();
  pintarResumenSemana();
}

function analizar(p) {
  const f = fechas();
  let horas = 0, trabajados = 0, aus = 0;
  const alertas = [];
  f.forEach((fe, i) => {
    const ts = turnosDe(p.id, fe), a = ausenciaDe(p.id, fe);
    if (!ts.length && !a) return;
    if (ts.length) {
      const hd = horasDia(p.id, fe);
      horas += hd; trabajados++;
      if (hd > 10) alertas.push({n:'bad', t:`${DIAS[i]} sobre 10 h en el día`});
    }
    else if (a.ausencia && a.ausencia !== 'L') aus++;
  });
  const tope = Number(p.horas_contrato) || Number(S.local.tope_semanal) || 42;
  if (horas > tope) alertas.push({ n:'bad', t:`${hfmt(horas)} h · ${hfmt(horas-tope)} sobre su contrato de ${hfmt(tope)}` });
  if (trabajados === 7) alertas.push({ n:'bad', t:'7 días seguidos' });   // tope del local, no legal
  // disponibilidad: avisa, no bloquea. El encargado decide igual, pero viéndolo.
  const nd = p.no_disponible || [];
  f.forEach((fe, i) => {
    if (turnosDe(p.id, fe).length && nd.includes(i))
      alertas.push({ n:'warn', t:`${DIAS[i]}: dijo que no puede` });
  });
  if (aus) alertas.push({ n:'info', t:`${aus} ${aus===1?'día':'días'} de ausencia` });
  // «conforme» sonaba a veredicto legal, y no lo es: lo unico que dice es que no
  // salto ninguno de los avisos que el propio local se puso. Pedro eligio el
  // 06-10 llamar a las cosas por su nombre mientras la app no tenga reglas del
  // Codigo del Trabajo de verdad — prometer cumplimiento que no existe lo paga el.
  if (!alertas.some(a => a.n==='bad' || a.n==='warn')) alertas.unshift({ n:'ok', t:'sin avisos' });
  const dif = horas - (Number(p.horas_contrato) || 0);
  return { horas, trabajados, aus, costo: horas * (p.valor_hora||0), alertas, tope, dif };
}

function pintarResumenSemana() {
  const lista = $('#semPersonas'); lista.innerHTML = '';
  let horasT = 0, costoT = 0;
  personasVisibles().forEach(p => {
    const a = analizar(p); horasT += a.horas; costoT += a.costo;
    const h = $('#h-' + p.id);
    if (h) {
      // horas y, debajo, cuánto le falta o le sobra contra su contrato
      /* El «− 42,0 h» no se entiende solo: parece que esa persona tiene horas
         negativas. Dice otra cosa —cuánto le falta para llegar a su contrato—
         y hasta el 06-10 no había forma de averiguarlo desde la pantalla.
         Es el mismo principio que escribió Pedro: decir por qué, no solo qué. */
      const dif = a.dif;
      const tope = Number(p.horas_contrato) || 0;
      h.title = tope
        ? `${hfmt(a.horas)} h planificadas · su contrato es de ${hfmt(tope)} h\n`
          + (Math.abs(dif) < 0.25 ? 'Va justo.'
             : dif > 0 ? `Le sobran ${hfmt(dif)} h sobre el contrato.`
                       : `Le faltan ${hfmt(-dif)} h para completarlo.`)
        : `${hfmt(a.horas)} h planificadas · no tiene horas de contrato escritas en su ficha`;
      h.innerHTML = hfmt(a.horas) + ' h' + (Math.abs(dif) >= 0.25
        ? `<span class="dif ${dif > 0 ? 'mas' : 'menos'}">${dif > 0 ? '+' : '−'} ${hfmt(Math.abs(dif))} h</span>`
        : '<span class="dif justo">al día</span>');
      h.classList.toggle('over', a.horas > a.tope);
    }
    lista.appendChild(el('li', '', `
      <div class="prow"><span class="pname">${esc(p.nombre)}</span>
        <span class="pstat">${hfmt(a.horas)} h · ${a.trabajados} d · ${clp(a.costo)}${
          Math.abs(a.dif) >= 0.5 ? ` · <b style="color:${a.dif>0?'var(--warn)':'var(--fg-dim)'}"
            title="${esc(a.dif > 0 ? 'Le sobran ' + hfmt(a.dif) + ' h sobre su contrato de ' + hfmt(a.tope) + ' h'
                                   : 'Le faltan ' + hfmt(-a.dif) + ' h para su contrato de ' + hfmt(a.tope) + ' h')}"
            >${a.dif>0?'+':''}${hfmt(a.dif)} h</b>` : ''}${
          Number(p.saldo_horas) ? ` · <span title="Saldo acumulado de semanas anteriores, de «Cerrar la semana al saldo». No es de esta semana."
            >saldo ${Number(p.saldo_horas)>0?'+':''}${hfmt(Number(p.saldo_horas))} h</span>` : ''}</span></div>
      <div class="bar"><i class="${a.horas>a.tope?'over':''}" style="width:${Math.min(100,(a.horas/a.tope)*100)}%"></i></div>
      <div class="flags">${a.alertas.map(x => `<span class="flag ${x.n}">${esc(x.t)}</span>`).join('')}</div>`));
  });
  const f = fechas();
  const ventaT = f.reduce((s,fe) => s + ((S.dias[fe]||{}).venta || 0), 0);
  const pct = ventaT ? (costoT/ventaT)*100 : NaN;
  $('#semPie').innerHTML = '<tr class="sumrow"><th>Costo del día</th>' +
    f.map(fe => {
      const c = S.personas.reduce((s,p) => s + horasDia(p.id, fe) * (p.valor_hora||0), 0);
      const v = (S.dias[fe]||{}).venta || 0, pd = v ? (c/v)*100 : NaN;
      const col = !isFinite(pd) ? 'var(--fg-faint)' : (pd > Number(S.local.objetivo_pct) ? 'var(--bad)' : 'var(--fg-dim)');
      return `<td style="color:${col}">${clp(c)}<br><span style="font-size:.6875rem">${pfmt(pd)}</span></td>`;
    }).join('') + `<td>${clp(costoT)}<br><span style="font-size:.6875rem">${pfmt(pct)}</span></td></tr>`;
}

/* ---------- vista del día: una LÍNEA DE TIEMPO ----------
   Pedro: «sigo sin entender Día». Tenía razón, y el problema no era la
   explicación: era el formato. Estaba como una lista de tarjetas, una por
   horario, y un día no es una lista. Así no se ve lo único que de verdad
   importa mirar en un día — dónde quedan huecos —: había que calcularlo.

   Skello lo hace como línea de tiempo: las horas corren de izquierda a
   derecha y cada turno es una barra que ocupa su tramo. Los huecos se VEN. */
/* ---------- la necesidad por hora, en la vista de dia ----------
   La linea de tiempo ya estaba; lo que faltaba es lo de arriba: cuanta gente
   SE NECESITA a cada hora contra cuanta HAY puesta. Convierte «mirar la malla y
   contar cabezas» en «ver el hueco».

   Lo puesto NO se teclea: sale solo de los turnos que ya estan asignados. Lo
   unico que hay que definir es la necesidad, y eso ya existe en la dotacion.

   Dos turnos que se pisan SUMAN su necesidad en las horas compartidas: si de
   13 a 16:30 corren la mañana y la tarde, a esa hora se necesita la gente de
   las dos. No es doble conteo, es lo que pide el local. */
function necesidadPorHora(fe) {
  const d = String((new Date(fe + 'T00:00:00').getDay() + 6) % 7);
  const base = franja();
  const ps = puestos();
  const horas = [];
  for (let h = base.h0; h < base.h1; h++) {
    let req = 0;
    ps.forEach(pu => { req += necesitaHora(d, pu, h); });
    // Cuenta PERSONAS. Un turno sin dueño esta planificado pero no hay nadie,
    // que es justamente el hueco que esta pantalla tiene que mostrar.
    const hay = S.personas.reduce((n, p) => n + (turnosDe(p.id, fe).some(a =>
      cubreHora(a.inicio, a.fin, h)) ? 1 : 0), 0);
    horas.push({ h, req, hay });
  }
  return horas;
}

/* Dicho en palabras, no solo en colores: el tramo que falta, de tal a tal hora.
   Es la misma regla que ya sigue la cobertura de la semana. */
function huecosEnPalabras(horas) {
  const tramos = [];
  let act = null;
  horas.forEach(x => {
    const falta = x.req - x.hay;
    if (falta > 0) {
      if (act && act.falta === falta && act.hasta === x.h) act.hasta = x.h + 1;
      else { act = { desde: x.h, hasta: x.h + 1, falta }; tramos.push(act); }
    } else act = null;
  });
  if (!tramos.length) return null;
  return tramos.map(t => `falta${t.falta === 1 ? '' : 'n'} <b>${t.falta}</b> `
    + `de <b>${hhmm(t.desde)}</b> a <b>${hhmm(t.hasta)}</b>`).join(' · ');
}

function pintarNecesidadDia(fe, caja) {
  const horas = necesidadPorHora(fe);
  const hayDotacion = horas.some(x => x.req > 0);
  if (!hayDotacion) return;              // sin dotacion definida no hay nada que comparar

  const celdas = horas.map(x => {
    const cls = x.hay < x.req ? 'falta' : (x.req && x.hay > x.req ? 'sobra' : 'justo');
    return `<div class="hncel ${cls}" title="${hhmm(x.h)}–${hhmm(x.h + 1)}: hay ${x.hay}, se necesita${x.req === 1 ? '' : 'n'} ${x.req}">
      <span class="hnh">${hhmm(x.h).slice(0,2)}</span>
      <b>${x.hay}</b><i>/${x.req}</i></div>`;
  }).join('');

  const faltan = huecosEnPalabras(horas);
  const box = el('div', 'necdia');
  box.innerHTML = `<div class="nectit">¿Alcanza la gente, hora por hora?
      <span class="hint">arriba lo que hay, abajo lo que se necesita</span></div>
    <div class="hnfila" style="grid-template-columns:repeat(${horas.length},1fr)">${celdas}</div>
    <p class="necres ${faltan ? 'bad' : 'ok'}">${faltan ? faltan : 'No falta nadie en todo el día.'}</p>`;
  caja.appendChild(box);
}

/* Reparte turnos que se pisan en CARRILES dentro de la misma fila.
   Sin esto, dos personas de 08:00 a 16:30 en el mismo puesto caen una encima de
   la otra y se ve UNA SOLA — lo pregunto Pedro antes de que pasara.
   Cada turno va al primer carril donde no choque con el ultimo que hay ahi. */
function repartirEnCarriles(items) {
  const orden = items.slice().sort((x, y) => Number(x.a.inicio) - Number(y.a.inicio)
                                          || Number(x.a.fin) - Number(y.a.fin));
  const finDe = [];                       // hasta que hora llega cada carril
  /* UNA PERSONA NO SE PARTE EN DOS LINEAS. Pedro lo pregunto con dos casos
     (msgs 4797 y 4798): Carla con dos turnos el lunes salia arriba y abajo,
     porque el segundo CABIA en el carril de otra persona que ya habia
     terminado. Visto desde arriba parece que son dos Carlas.

     Se le reserva a cada persona el carril donde entro. Sin esto el reparto era
     solo «que no se pisen», que sirve para ver huecos y no para seguir a
     alguien — y seguir a alguien es lo que el estaba haciendo.

     No cuesta altura a quien tiene UN turno: esos siguen compartiendo carril
     como antes. Solo deja de mover al que tiene dos, que es el caso raro. */
  const suyo = new Map();                 // persona -> carril que ya ocupa
  orden.forEach(it => {
    const pid = it.p ? it.p.id : (it.a.persona_id || null);
    let c = -1;
    if (pid != null && suyo.has(pid)) {
      const mio = suyo.get(pid);
      if (finDe[mio] <= Number(it.a.inicio)) c = mio;   // cabe en el suyo
    }
    if (c === -1) c = finDe.findIndex(f => f <= Number(it.a.inicio));
    if (c === -1) { c = finDe.length; finDe.push(0); }
    finDe[c] = Number(it.a.fin);
    it.carril = c;
    if (pid != null) suyo.set(pid, c);
  });
  return { items: orden, carriles: Math.max(1, finDe.length) };
}

/* ---------- arrastrar en la vista de DIA ----------
   Pedro eligio la opcion A (04-10, msg 3673): correrlo de lado cambia la HORA,
   soltarlo en otra fila cambia la PERSONA. Y pidio que cambiar de persona AVISE.

   El salto es de 15 minutos (msg 3677: «no sera mejor el desplazamiento cada 15
   minutos?»). Mas fino que media hora y alcanza para cualquier horario real.

   Se respeta DONDE se agarro la barra: si uno la toma por la mitad, la barra no
   salta para que su inicio quede bajo el cursor. */
const SALTO = 0.25;                        // 15 minutos, en horas

function horaDesdeX(pista, clientX, agarreFrac) {
  const linea = pista.closest('.linea');
  const h0 = Number(linea.dataset.h0), h1 = Number(linea.dataset.h1);
  const r = pista.getBoundingClientRect();
  if (!r.width) return null;
  const frac = (clientX - r.left) / r.width - (agarreFrac || 0);
  const h = h0 + frac * (h1 - h0);
  return Math.round(h / SALTO) * SALTO;
}

async function soltarEnDia(id, destino, horaNueva) {
  const a = turnoArrastrable(id);
  if (!a) return;
  const d = destino || {};
  const dur = Number(a.fin) - Number(a.inicio);
  let inicio = Number(a.inicio);
  if (horaNueva != null && Math.abs(horaNueva - inicio) >= SALTO) inicio = horaNueva;
  if (inicio < 0) inicio = 0;
  const fin = inicio + dur;
  const mismaHora = Math.abs(inicio - Number(a.inicio)) < 0.001;

  const cambiaPersona = 'persona' in d && (a.persona_id || null) !== (d.persona || null);
  const cambiaPuesto  = 'puesto'  in d && (a.puesto || '').trim() !== (d.puesto || '').trim();
  if (!cambiaPersona && !cambiaPuesto && mismaHora) return;      // no cambió nada

  const m = $('#msgSem');
  const aviso = (texto, clase) => {
    if (!m) return;
    m.textContent = texto; m.className = 'msg ' + clase;
    setTimeout(() => { if (m.textContent === texto) m.textContent = ''; }, 5000);
  };
  const nom = x => { const q = x ? S.personas.find(y => y.id === x) : null;
                     return q ? q.nombre.split(' ')[0] : 'Sin asignar'; };

  // Pedro: «si modifica el turno de otra persona que arroje una alerta». Cambiar
  // de dueño le saca el turno a alguien: eso se confirma. Correr la hora o
  // cambiar de puesto, no — no se lo quita a nadie.
  if (cambiaPersona &&
      !confirm(`El turno pasa de ${nom(a.persona_id)} a ${nom(d.persona)}.\n\n`
             + `${hhmm(inicio)}–${hhmm(fin)}. ¿Lo hago?`)) return;

  const personaFinal = 'persona' in d ? (d.persona || null) : (a.persona_id || null);
  if (personaFinal) {
    const aus = ausenciaDe(personaFinal, a.fecha);
    if (aus && aus.ausencia !== 'L')
      return aviso(`${nom(personaFinal)} tiene ${(AUSENCIAS[aus.ausencia] || 'una ausencia').toLowerCase()} `
                 + 'ese día. Quita la ausencia primero.', 'bad');
  }

  const ch2 = chocaCon(personaFinal, a.fecha, inicio, fin, a.id);
  if (ch2) return aviso(diceChoque(nom(personaFinal), ch2), 'bad');

  const campos = {};
  if (!mismaHora) { campos.inicio = inicio; campos.fin = fin; }
  if (cambiaPuesto) campos.puesto = (d.puesto || '').trim();
  if ('persona' in d) { campos.persona_id = d.persona || null; campos.ofrecido_por = null; }
  try {
    recordar('mover un turno');
    await DATOS.editarAsignacion(id, campos);
    await refrescar();
    const partes = [];
    if (cambiaPersona) partes.push('a ' + nom(d.persona));
    if (cambiaPuesto) partes.push('a ' + (d.puesto || 'sin puesto'));
    if (!mismaHora) partes.push(hhmm(inicio) + '–' + hhmm(fin));
    aviso('Turno movido ' + partes.join(' · ') + '.', 'ok');
  } catch (e) {
    S.hist.pop(); pintarDeshacer();
    aviso(e.message, 'bad');
  }
}

/* ---------- estirar y acortar un turno ----------
   Pedro (04-10): «si tengo un turno de las 9:00 a la 13:00 deberia poder
   extenderlo a las 13:30 o reducirlo a las 12:00... esto en ambos sentidos».

   Va con eventos de puntero y no con el arrastre del navegador: arrastrar sirve
   para llevar la barra entera, y estirar es otra cosa. Mientras se estira, la
   barra deja de ser `draggable` para que los dos gestos no se peleen.

   Mismo salto de 15 minutos y un minimo de 15: un turno de duracion cero no
   significa nada y la base lo guardaria igual. */
function engancharEstirar(caja) {
  if (!caja || caja.dataset.estirar) return;
  caja.dataset.estirar = '1';

  caja.addEventListener('pointerdown', ev => {
    const tira = ev.target.closest('.tira[data-borde]'); if (!tira) return;
    const barra = tira.closest('.barra[data-asig]'); if (!barra) return;
    const pista = barra.closest('.linea-pista'); if (!pista) return;
    const a = turnoArrastrable(barra.dataset.asig); if (!a) return;

    ev.preventDefault(); ev.stopPropagation();
    barra.draggable = false;                 // que no arranque el arrastre
    barra.classList.add('estirando');
    const borde = tira.dataset.borde;
    const linea = pista.closest('.linea');
    const h0 = Number(linea.dataset.h0), h1 = Number(linea.dataset.h1);
    const r = pista.getBoundingClientRect();
    let ini = Number(a.inicio), fin = Number(a.fin);

    const horaEn = x => {
      const h = h0 + ((x - r.left) / r.width) * (h1 - h0);
      return Math.min(h1, Math.max(h0, Math.round(h / SALTO) * SALTO));
    };
    const pintar = () => {
      const iz = ((ini - h0) / (h1 - h0)) * 100, an = ((fin - ini) / (h1 - h0)) * 100;
      barra.style.left = iz + '%'; barra.style.width = an + '%';
      const t = barra.querySelector('b'); if (t) t.textContent = hhmm(ini) + '–' + hhmm(fin);
    };
    const mover = e => {
      const h = horaEn(e.clientX);
      if (borde === 'inicio') ini = Math.min(h, fin - SALTO);
      else                    fin = Math.max(h, ini + SALTO);
      pintar();
    };
    const soltar = async e => {
      document.removeEventListener('pointermove', mover);
      document.removeEventListener('pointerup', soltar);
      barra.classList.remove('estirando');
      barra.draggable = true;
      if (Math.abs(ini - Number(a.inicio)) < 0.001 && Math.abs(fin - Number(a.fin)) < 0.001) {
        pintar(); return;                    // no se movio
      }
      const m = $('#msgSem');
      const aviso = (texto, clase) => {
        if (!m) return;
        m.textContent = texto; m.className = 'msg ' + clase;
        setTimeout(() => { if (m.textContent === texto) m.textContent = ''; }, 5000);
      };
      const ch3 = chocaCon(a.persona_id, a.fecha, ini, fin, a.id);
      if (ch3) {
        const q = S.personas.find(x => x.id === a.persona_id);
        aviso(diceChoque(q ? q.nombre.split(' ')[0] : 'Esa persona', ch3), 'bad');
        await refrescar();                   // devolver la barra a su sitio
        return;
      }
      try {
        recordar('cambiar la hora de un turno');
        await DATOS.editarAsignacion(a.id, { inicio: ini, fin });
        await refrescar();
        aviso(`Turno de ${hhmm(ini)} a ${hhmm(fin)}.`, 'ok');
      } catch (err) {
        S.hist.pop(); pintarDeshacer();
        aviso(err.message, 'bad');
        await refrescar();                   // deshacer lo pintado a mano
      }
    };
    document.addEventListener('pointermove', mover);
    document.addEventListener('pointerup', soltar);
  });
}

function engancharArrastreDia(caja) {
  if (!caja || caja.dataset.arrastre) return;
  caja.dataset.arrastre = '1';
  let agarre = 0;                          // donde se tomo la barra, 0..1 de la pista
  caja.addEventListener('dragstart', ev => {
    const b = ev.target.closest('.barra[data-asig]');
    if (!b) return ev.preventDefault();
    const pista = b.closest('.linea-pista');
    const r = pista.getBoundingClientRect(), rb = b.getBoundingClientRect();
    agarre = r.width ? (ev.clientX - rb.left) / r.width : 0;
    ev.dataTransfer.setData('text/plain', b.dataset.asig);
    ev.dataTransfer.effectAllowed = 'move';
    b.classList.add('llevando');
  });
  caja.addEventListener('dragend', ev => {
    const b = ev.target.closest('.barra[data-asig]');
    if (b) b.classList.remove('llevando');
    caja.querySelectorAll('.encima').forEach(x => x.classList.remove('encima'));
  });
  caja.addEventListener('dragover', ev => {
    const pista = ev.target.closest('.linea-pista[data-fecha]'); if (!pista) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    if (!pista.classList.contains('encima')) {
      caja.querySelectorAll('.encima').forEach(x => x.classList.remove('encima'));
      pista.classList.add('encima');
    }
  });
  caja.addEventListener('drop', ev => {
    const pista = ev.target.closest('.linea-pista[data-fecha]'); if (!pista) return;
    ev.preventDefault();
    pista.classList.remove('encima');
    const id = ev.dataTransfer.getData('text/plain'); if (!id) return;
    const fila = pista.closest('.linea-fila');
    // La fila dice que cambia: si es una persona, el dueño; si es un puesto, el
    // puesto. Y correrlo de lado cambia la hora en los dos casos.
    const destino = S.agrupar === 'puestos'
      ? { puesto: fila.dataset.puesto || '' }
      : { persona: fila.dataset.p || null };
    soltarEnDia(id, destino, horaDesdeX(pista, ev.clientX, agarre));
  });
}

function pintarDia() {
  const fe = iso(S.dia);
  const i = (S.dia.getDay() + 6) % 7;
  $('#semTitulo').innerHTML = esc(DIAS[i] + ' ' + ddmm(fe))
    + `<span class="numsem">Semana ${semanaISO(fe)}</span>`;

  const caja = $('#cajaDia'); caja.innerHTML = '';
  pintarNecesidadDia(fe, caja);

  // La franja se estira a lo que de verdad haya ese día, no solo al catálogo:
  // un turno escrito a mano puede empezar antes o terminar después.
  const todos = S.personas.flatMap(p => turnosDe(p.id, fe).map(a => ({ p, a })))
    .concat(S.abiertos.filter(a => a.fecha === fe).map(a => ({ p: null, a })));
  const base = franja();
  const h0 = Math.floor(Math.min(base.h0, ...todos.map(x => Number(x.a.inicio))));
  const h1 = Math.ceil(Math.max(base.h1, ...todos.map(x => Number(x.a.fin))));
  const ancho = Math.max(h1 - h0, 1);
  const pos = h => ((h - h0) / ancho) * 100;

  if (!todos.length) {
    caja.innerHTML = '<p class="vacio">Nadie tiene turno este día. '
      + 'Aprieta una fila para agregar uno.</p>';
  }

  // regla de horas arriba
  const horas = [];
  for (let h = Math.ceil(h0); h <= h1; h++) horas.push(h);
  const regla = horas.map(h => `<span class="hmarca" style="left:${pos(h)}%">${hhmm(h)}</span>`).join('');

  /* Las filas: por PERSONA o por PUESTO, segun el mismo control de la semana.
     Agrupado por puesto se ve de un golpe QUE PUESTO tiene el hoyo y a que hora,
     que es lo que la franja de necesidad de arriba no dice: ella avisa que
     faltan dos a las 20:00, pero no de que. */
  const libres = S.abiertos.filter(a => a.fecha === fe);
  const filas = [];
  if (S.agrupar === 'puestos') {
    // Cada turno lleva SU puesto, no el de la persona: alguien puede hacer barra
    // el lunes y cocina el martes. Se agrupa por el del turno.
    const porPuesto = new Map();
    personasVisibles().forEach(p => turnosDe(p.id, fe).forEach(a => {
      const q = puestoRot(a, p);
      if (!porPuesto.has(q)) porPuesto.set(q, []);
      porPuesto.get(q).push({ a, p });
    }));
    libres.forEach(a => {
      const q = (a.puesto || '').trim() || 'Sin puesto';
      if (!porPuesto.has(q)) porPuesto.set(q, []);
      porPuesto.get(q).push({ a, p: null });
    });
    // Igual que en la semana: los puestos del CATALOGO salen aunque no tengan
    // ningun turno ese dia. Si no, un dia en blanco no deja crear nada.
    puestos().forEach(q => { if (!porPuesto.has(q)) porPuesto.set(q, []); });
    [...porPuesto.keys()].sort((x, y) => x.localeCompare(y, 'es'))
      .forEach(q => filas.push({ puesto: q, items: porPuesto.get(q) }));
  } else {
    personasVisibles().forEach(p => {
      const ts = turnosDe(p.id, fe);
      if (ts.length) filas.push({ p, items: ts.map(a => ({ a, p })) });
    });
    if (libres.length) filas.unshift({ p: null, items: libres.map(a => ({ a, p: null })) });
  }

  // h0/h1 viajan en el DOM: el manejador de arrastre vive fuera de esta funcion
  // y necesita convertir una posicion en pantalla a una hora.
  caja.innerHTML = `
    <div class="linea" data-h0="${h0}" data-h1="${h1}" data-fecha="${fe}">
      <div class="linea-cab"><div class="linea-quien"></div><div class="linea-pista">${regla}</div></div>
      ${filas.map(fila => {
        const porPuesto = S.agrupar === 'puestos';
        // En la vista por puestos la fila NO es de nadie: su `data-p` queda vacio
        // a proposito, para que soltar ahi no le adjudique el turno a nadie.
        const quien = porPuesto
          ? `<b>${esc(fila.puesto)}</b><span class="rol">${fila.items.length} turno${fila.items.length === 1 ? '' : 's'}</span>`
          : (fila.p ? `<b>${esc(fila.p.nombre)}</b><span class="rol">${esc(fila.p.rol || '')}</span>`
                    : '<b>Sin asignar</b><span class="rol">libre</span>');
        const rep = repartirEnCarriles(fila.items);
        return `
        <div class="linea-fila${porPuesto ? ' porpuesto' : ''}" data-p="${!porPuesto && fila.p ? fila.p.id : ''}"
             ${porPuesto ? `data-puesto="${esc(fila.puesto)}"` : ''}
             style="--carriles:${rep.carriles}">
          <div class="linea-quien">${quien}</div>
          <div class="linea-pista" data-fecha="${fe}">
            ${horas.map(h => `<span class="hlinea" style="left:${pos(h)}%"></span>`).join('')}
            ${rep.items.map(({ a, p, carril }) => {
              const t = a.turno_id ? turnoDe(a.turno_id) : null;
              const ci = colorDe(a, p);
              const iz = pos(Number(a.inicio)), an = pos(Number(a.fin)) - iz;
              const m = marcaAsig(a);
              // Agrupado por puesto, lo util en la barra es QUIEN lo cubre; por
              // persona, es el puesto. La misma barra dice lo que falta saber.
              const pie = porPuesto ? (p ? p.nombre.split(' ')[0] : 'sin asignar')
                                    : (puestoDe(a, p) || 'sin puesto');
              return `<span class="barra${p ? '' : ' libre'}" data-c="${ci}" data-asig="${a.id}"
                draggable="true" role="button" tabindex="0"
                style="left:${iz}%;width:${an}%;--carril:${carril}"
                title="${esc((p ? p.nombre + ' · ' : 'Sin asignar · ')
                  + (puestoDe(a, p) || 'sin puesto') + ' · ' + hhmm(a.inicio) + '–' + hhmm(a.fin)
                  + ' · ' + hfmt(horasAsig(a)) + ' h' + (a.nota ? '\n' + a.nota : ''))}">
                <b>${hhmm(a.inicio)}–${hhmm(a.fin)}</b>
                <em>${esc(pie)}</em>
                ${m.entrada ? '<i class="marcado" title="marcó entrada">•</i>' : ''}
                <i class="tira izq" data-borde="inicio" title="Cambiar la hora de entrada"></i>
                <i class="tira der" data-borde="fin" title="Cambiar la hora de salida"></i>
              </span>`;
            }).join('')}
          </div>
        </div>`; }).join('')}
    </div>`;

  engancharArrastreDia(caja);
  engancharEstirar(caja);

  // abrir un turno, o agregar uno en la fila de alguien
  caja.onclick = ev => {
    const pista = ev.target.closest('.linea-pista[data-fecha]'); if (!pista) return;
    const fila = pista.closest('.linea-fila');
    const bl = ev.target.closest('[data-asig]');
    if (bl) {
      // El dueño sale del TURNO, no de la fila: agrupado por puesto la fila no
      // es de nadie, y buscar por fila abriria el turno como «sin asignar».
      const a = turnoArrastrable(bl.dataset.asig);
      if (a) return abrirTurno(a.persona_id ? (S.personas.find(x => x.id === a.persona_id) || null) : null, fe, a);
      return;
    }
    // Apretar un hueco crea, con lo que la fila ya sabe: en fila de persona viene
    // con la persona; en fila de puesto, con el puesto, y se elige a quien.
    if (S.agrupar === 'puestos')
      return abrirTurno(null, fe, null, fila.dataset.puesto || '');
    const p = fila.dataset.p ? S.personas.find(x => x.id === fila.dataset.p) : null;
    abrirTurno(p, fe, null);
  };

  const ausentes = personasVisibles().map(p => ({ p, a: ausenciaDe(p.id, fe) }))
    .filter(x => x.a && x.a.ausencia !== 'L');
  if (ausentes.length) caja.appendChild(el('div','turnodia', `
    <div class="turnodia-h"><b>Ausencias</b></div>
    <ul>${ausentes.map(x => `<li><b>${esc(x.p.nombre)}</b> <span class="rol">${AUSENCIAS[x.a.ausencia]}</span></li>`).join('')}</ul>`));

  pintarResumenSemana();
}

/* ---------- vista del mes: el patrón de la dotación de un vistazo ---------- */
/* Los cortes de semana del mes: en que indice de `ds` cierra cada semana y que
   dias la forman. Sirve para meter una columna con las horas de ESA semana, que
   es lo que hace Skello y lo que convierte el mes en algo que se mira en vez de
   algo que se recorre. */
function semanasDelMes(ds) {
  const out = []; let act = null;
  ds.forEach((f, n) => {
    const dow = (new Date(f + 'T00:00:00').getDay() + 6) % 7;
    if (!act || (dow === 0 && n > 0)) { act = { desde: n, dias: [] }; out.push(act); }
    act.dias.push(f); act.hasta = n;
  });
  return out;
}

function pintarMes() {
  const ds = diasDelMes();
  const ref = new Date(ds[0] + 'T00:00:00');
  $('#semTitulo').textContent = ref.toLocaleDateString('es-CL', { month:'long', year:'numeric' });

  /* Las celdas del mes van SIN TEXTO: un cuadrito de color por turno, y las
     horas en el globo al pasar por encima.

     Pedro miro septiembre, lo vio «en blanco» y pregunto si estaba roto. No lo
     estaba: con una fila por persona, 30 columnas de 46 px y el horario escrito
     adentro, la tabla no cabe en ninguna pantalla y sus turnos quedaban fuera
     del borde. Skello resuelve lo mismo sacando el texto —se ve en la captura
     que mando el 05-10— y de paso mete el total de cada semana entre medio.
     El mes no se lee: se mira. */
  const sems = semanasDelMes(ds);
  const cierra = {};                       // indice de `ds` -> esa semana cierra ahi
  sems.forEach(w => { cierra[w.hasta] = w; });

  $('#mesCab').innerHTML = '<th>Persona</th>' + ds.map((f,n) => {
    const d = new Date(f + 'T00:00:00'), i = (d.getDay() + 6) % 7;
    const sem = cierra[n]
      ? `<th class="semcol" title="Semana ${semanaISO(f)} del año">S${semanaISO(f)}</th>` : '';
    return `<th class="${i>=5?'fin':''}">${d.getDate()}<span class="dsem">${DIAS[i][0]}</span></th>` + sem;
  }).join('') + '<th>Horas</th>';

  const cuerpo = $('#mesCuerpo'); cuerpo.innerHTML = '';

  /* Los turnos SIN DUEÑO, arriba de todo, igual que en la semana.
     Hasta el 04-10 el mes solo dibujaba filas de PERSONAS, asi que un turno sin
     asignar no aparecia en ninguna parte. Pedro aplico un modelo con «solo la
     forma» —que crea justamente turnos sin dueño—, miro el mes y vio la pantalla
     vacia. Si la app deja crearlos, el mes tiene que mostrarlos: si no, uno
     planifica y concluye que no se guardo nada. */
  const sinDueno = ds.map((f, n) => {
    const sem = cierra[n] ? '<td class="semcol"></td>' : '';
    const aqui = S.abiertos.filter(a => a.fecha === f);
    if (!aqui.length)
      return `<td class="mcel vacia" data-noasig="1" data-fecha="${f}"></td>` + sem;
    return `<td class="mcel" data-noasig="1" data-fecha="${f}">` + aqui.map(a => {
      const t = a.turno_id ? turnoDe(a.turno_id) : null;
      const ci = colorDe(a);
      const pu = (a.puesto || '').trim();
      return `<span class="mbl" data-c="${ci}" data-asig="${a.id}" draggable="true"
        role="button" tabindex="0"
        title="${esc('Sin asignar · ' + (pu ? pu + ' · ' : '')
        + hhmm(a.inicio) + '–' + hhmm(a.fin) + ' · ' + hfmt(horasAsig(a)) + ' h')}"
        ></span>`;
    }).join('') + '</td>' + sem;
  }).join('');
  const nSin = S.abiertos.length;
  cuerpo.innerHTML = `<tr class="noasig"><th class="r" scope="row">Sin asignar`
    + `<span class="rol">el primero que lo tome se lo queda</span></th>${sinDueno}`
    + `<td class="tot">${nSin || ''}</td></tr>`;

  personasVisibles().forEach(p => {
    let horas = 0;
    const celdas = ds.map((f,n) => {
      // Al cerrar una semana, su total y la diferencia contra el contrato. Es
      // lo que uno busca en el mes: quien va corto y quien va pasado.
      let sem = '';
      if (cierra[n]) {
        const w = cierra[n];
        const hs = w.dias.reduce((x, fe) => x + horasDia(p.id, fe), 0);
        const tope = Number(p.horas_contrato) || 0;
        /* La diferencia contra el contrato SOLO en las semanas completas.
           Octubre parte un jueves: su primera «semana» son cuatro días, y
           compararlos contra un contrato de 42 h da «−19 h» en rojo para alguien
           que no debe nada. Un número alarmante que no significa nada es peor
           que no poner número. */
        const entera = w.dias.length === 7;
        const dif = (entera && tope) ? hs - tope : 0;
        sem = `<td class="semcol"${entera ? '' : ' title="Semana incompleta: no se compara contra el contrato"'}>`
            + `<b>${hs ? hfmt(hs) : '—'}</b>`
            + (hs && dif ? `<span class="${dif > 0 ? 'mas' : 'menos'}">${dif > 0 ? '+' : '−'}${hfmt(Math.abs(dif))}</span>` : '')
            + '</td>';
      }
      const ts = turnosDe(p.id, f), a = ausenciaDe(p.id, f);
      if (ts.length) {
        horas += horasDia(p.id, f);
        // Un bloque por turno, con las horas en dos líneas. El mes sirve para
        // ver el patrón —«tres garzones todos los sábados»— y con una inicial
        // no se ve nada.
        return `<td class="mcel" data-p="${p.id}" data-fecha="${f}">` + ts.map(x => {
          const pl = x.turno_id ? turnoDe(x.turno_id) : null;
          const ci = colorDe(x, p);
          const pu = puestoDe(x, p);
          return `<span class="mbl" data-c="${ci}" data-asig="${x.id}" draggable="true"
            role="button" tabindex="0"
            title="${esc((pu ? pu + ' · ' : '')
            + hhmm(x.inicio) + '–' + hhmm(x.fin) + ' · ' + hfmt(horasAsig(x)) + ' h'
            + (x.nota ? '\n' + x.nota : ''))}"></span>`;
        }).join('') + '</td>' + sem;
      }
      if (a && a.ausencia && a.ausencia !== 'L')
        return `<td class="mcel" data-p="${p.id}" data-fecha="${f}"><span class="mbl aus"
          data-asig="${a.id}" role="button" tabindex="0" title="${AUSENCIAS[a.ausencia]}"></span></td>` + sem;
      return `<td class="mcel vacia" data-p="${p.id}" data-fecha="${f}" role="button" tabindex="0"
        title="Agregar turno"></td>` + sem;
    }).join('');
    cuerpo.innerHTML += `<tr><th class="r" scope="row">${esc(p.nombre)}<span class="rol">${esc(p.rol||'')}`
      + `${Number(p.horas_contrato) ? ' · ' + hfmt(p.horas_contrato) + ' h' : ''}</span></th>`
      + `${celdas}<td class="tot">${hfmt(horas)} h</td></tr>`;
  });

  // Al pie, las horas de cada día y el total del mes: es lo que convierte la
  // tabla en algo con lo que se decide, y no solo en una grilla de colores.
  let totMes = 0;
  const pie = ds.map((f,n) => {
    const h = personasVisibles().reduce((x,p) => x + horasDia(p.id, f), 0);
    totMes += h;
    const sem = cierra[n]
      ? `<td class="semcol"><b>${hfmt(cierra[n].dias.reduce((x, fe) =>
          x + personasVisibles().reduce((y,p) => y + horasDia(p.id, fe), 0), 0))}</b></td>`
      : '';
    return `<td class="mpie">${h ? hfmt(h) : ''}</td>` + sem;
  }).join('');
  cuerpo.innerHTML += `<tr class="piemes"><th class="r" scope="row">Horas del día</th>${pie}<td class="tot">${hfmt(totMes)} h</td></tr>`;

  engancharArrastre(cuerpo.closest('table') || cuerpo);
  engancharSeleccion(cuerpo.closest('table') || cuerpo);

  // Un solo escuchador para toda la tabla. En el mes también se edita: Pedro
  // lo pidió y Skello lo hace («si veo algún desajuste puedo rectificarlo
  // directamente desde aquí»), que es justamente para lo que sirve el mes.
  cuerpo.onclick = ev => {
    // La fila sin dueño va primero: no tiene persona, y su lista es S.abiertos.
    const sin = ev.target.closest('td.mcel[data-noasig]');
    if (sin) {
      const b = ev.target.closest('[data-asig]');
      const a = b ? S.abiertos.find(x => x.id === b.dataset.asig) : null;
      return abrirTurno(null, sin.dataset.fecha, a);
    }
    const cel = ev.target.closest('td.mcel[data-p]'); if (!cel) return;
    const p = S.personas.find(x => x.id === cel.dataset.p); if (!p) return;
    const bl = ev.target.closest('[data-asig]');
    if (bl) {
      const a = filasDe(p.id, cel.dataset.fecha).find(x => x.id === bl.dataset.asig);
      if (a) return abrirTurno(p, cel.dataset.fecha, a);
    }
    abrirTurno(p, cel.dataset.fecha, null);
  };

  $('#semPersonas').innerHTML = ''; $('#semPie').innerHTML = '';
  pintarSeleccion();
}

/* `nuevoTurnoRapido()` se borro el 06-10-2026. Era esto:

     const nombre = prompt('¿Cómo se llama el turno nuevo?');
     await DATOS.crearTurno(S.local.id, { nombre, inicio: 9, fin: 17, colacion: 0.5 });

   Una ventanita del navegador que pedia SOLO el nombre y dejaba el turno de
   9:00 a 17:00 todos los dias, para que despues uno fuera a Equipo a corregir
   las horas en una fila de campos sueltos. Lo reemplaza `abrirTN()`. */

/* ---------- llenar con datos de ejemplo ----------
   Pedro: «si quiero probar la plataforma tengo que gestionar a todo el
   personal yo manualmente». La salida no es darle herramientas para hacerlo
   mas rapido: es que no tenga que hacerlo.

   Esto deja la semana como si el local llevara una semana andando, con los
   casos que hacen que las pantallas digan algo: alguien que llego tarde,
   alguien que no marco, un turno sin dueño, una ausencia y la propina
   repartida de verdad. Con todo en blanco no se entiende para que sirve nada.

   Todo lo que crea se deshace con Limpiar, Borrar las marcas y Deshacer. */
// La gente del local de ejemplo. Nombres inventados a proposito: esto no se
// mezcla con nadie real, y por eso tampoco lleva RUT, telefono ni correo.
const EJEMPLO = [
  { nombre:'Camila Reyes',    rol:'Barra',  equipo:'Fijos',       valor_hora:3500, horas_contrato:45, factor_propina:1 },
  { nombre:'Alonso Tapia',    rol:'Garzón', equipo:'Fijos',       valor_hora:3200, horas_contrato:45, factor_propina:1 },
  { nombre:'Carla Núñez',     rol:'Barra',  equipo:'Fijos',       valor_hora:3500, horas_contrato:45, factor_propina:1 },
  { nombre:'Bernardita Soto', rol:'Garzón', equipo:'Por llamado', valor_hora:3200, horas_contrato:30, factor_propina:1 },
  { nombre:'Ignacio Fuentes', rol:'Cocina', equipo:'Fijos',       valor_hora:4200, horas_contrato:45, factor_propina:0.5 },
  { nombre:'Luz Carrasco',    rol:'Cocina', equipo:'Fijos',       valor_hora:3800, horas_contrato:45, factor_propina:0.5 },
  { nombre:'Matías Vera',     rol:'Garzón', equipo:'Por llamado', valor_hora:3200, horas_contrato:20, factor_propina:1 },
  { nombre:'Paula Lagos',     rol:'Barra',  equipo:'Fijos',       valor_hora:3500, horas_contrato:45, factor_propina:1 },
];

async function llenarEjemplo() {
  const m = $('#msgEjemplo');
  const b = $('#btnEjemplo');
  if (!confirm('Se va a crear un local nuevo llamado «Ejemplo», aparte de los tuyos, '
    + 'con su propia gente y una semana completa de turnos, marcas y propinas.\n\n'
    + 'No se toca ninguno de tus locales. Para volver al tuyo, lo eliges arriba.')) return;

  b.disabled = true; b.textContent = 'Revisando…';
  m.textContent = 'Revisando que la base esté al día…'; m.className = 'msg';

  // Comprobar ANTES. Intentar y fallar deja al usuario reintentando un boton
  // que no puede funcionar, y cada intento ensucia un poco mas.
  const falta = await DATOS.baseAlDia(S.local.id).catch(() => []);
  if (falta.length) {
    b.disabled = false; b.textContent = 'Llenar con datos de ejemplo';
    m.innerHTML = 'La base todavía no está al día: le faltan <b>' + falta.map(esc).join('</b>, <b>') + '</b>.<br>'
      + 'Abre <a href="https://github.com/mallaturnos/mallaturnos.github.io/blob/main/arreglo-todo.sql" target="_blank" rel="noopener"><b>arreglo-todo.sql</b></a>, '
      + 'copia todo, pégalo en el <b>SQL Editor</b> de Supabase, dale <b>Run</b> y vuelve a recargar esta página.';
    m.className = 'msg bad'; return;
  }

  b.textContent = 'Creando…';
  m.textContent = 'Creando el local, la gente y los turnos…'; m.className = 'msg';

  // Si esto falla a mitad de camino, hay que DESHACER el local recien creado.
  // Si no, cada intento fallido deja un «Ejemplo» vacio dando vueltas: a Pedro
  // le pasó tres veces seguidas porque el fallo venia despues de crearlo.
  let recienCreado = null;
  try {
    const yaHay = (S.locales || []).filter(l => l.nombre === 'Ejemplo');
    if (yaHay.length) {
      if (!confirm(`Ya tienes ${yaHay.length === 1 ? 'un local' : yaHay.length + ' locales'} «Ejemplo».\n\n`
        + 'Voy a usar el que ya está en vez de crear otro.')) {
        b.disabled = false; b.textContent = 'Llenar con datos de ejemplo'; m.textContent = ''; return;
      }
      S.local = yaHay[0];
      try { localStorage.setItem('malla-local', S.local.id); } catch (e) {}
      await refrescar();
    } else {
      S.local = await DATOS.crearLocal('Ejemplo');
      recienCreado = S.local.id;
    }
    if (!S.turnos.length) await Promise.all([
      DATOS.crearTurno(S.local.id, { nombre:'Apertura', inicio:8,  fin:16.5, colacion:0.5, orden:1 }),
      DATOS.crearTurno(S.local.id, { nombre:'Tarde',    inicio:13, fin:21.5, colacion:0.5, orden:2 }),
      DATOS.crearTurno(S.local.id, { nombre:'Cierre',   inicio:17, fin:25,   colacion:0.5, orden:3 }),
    ]);
    for (const q of ['Barra','Cocina','Garzón'])
      try { await DATOS.crearPuesto(S.local.id, { nombre:q, color:(['Barra','Cocina','Garzón'].indexOf(q) % 4) + 1,
                                                  orden:['Barra','Cocina','Garzón'].indexOf(q) + 1 }); }
      catch (e) { /* si el SQL de puestos no está, se sigue igual */ }
    // si ya estaban, no se duplican
    for (const d of EJEMPLO)
      if (!S.personas.some(x => normal(x.nombre) === normal(d.nombre)))
        await DATOS.crearPersona(S.local.id, d);
    try { localStorage.setItem('malla-local', S.local.id); } catch (e) {}
    await refrescar();
  } catch (e) {
    // deshacer: que un intento fallido no deje un local vacío
    if (recienCreado) {
      try { await DATOS.borrarLocal(recienCreado); } catch (e2) {}
      try { localStorage.removeItem('malla-local'); } catch (e2) {}
      await verJefe().catch(() => {});
    }
    b.disabled = false; b.textContent = 'Llenar con datos de ejemplo';
    m.textContent = e.message + ' — no se creó nada.'; m.className = 'msg bad'; return;
  }

  const f = fechas();
  m.textContent = 'Armando la semana…'; b.textContent = 'Llenando…';
  const ts = S.turnos.slice().sort((a,x) => Number(a.inicio) - Number(x.inicio));
  const gente = S.personas.slice();
  let creados = 0, marcados = 0;

  try {
    recordar('llenar con datos de ejemplo');

    // Reparte a la gente entre los turnos, rotando, y deja libre a cada uno un
    // dia distinto: una malla donde todos trabajan siempre no se parece a nada.
    for (let d = 0; d < 7; d++) {
      const fe = f[d];
      for (let i = 0; i < gente.length; i++) {
        const p = gente[i];
        if ((i + d) % 7 === 6) continue;                 // su dia libre
        if (d === 6 && i % 2 === 0) continue;            // domingo con menos gente
        const t = ts[(i + d) % ts.length];
        if (turnosDe(p.id, fe).some(x => Number(x.inicio) === Number(t.inicio))) continue;
        await DATOS.crearAsignacion(S.local.id, p.id, fe, {
          turno_id: t.id, inicio: t.inicio, fin: t.fin, colacion: t.colacion,
          puesto: (p.rol || '').trim(), nota: '',
        });
        creados++;
      }
    }

    // Una ausencia, para que esa columna no se vea siempre vacia
    if (gente.length > 2) await DATOS.ponerAusencia(S.local.id, gente[2].id, f[3], 'V');

    // Un turno sin dueño esperando que alguien lo tome
    await DATOS.crearAsignacion(S.local.id, null, f[5], {
      turno_id: ts[0].id, inicio: ts[0].inicio, fin: ts[0].fin, colacion: ts[0].colacion,
      puesto: (gente[0].rol || '').trim(), nota: 'reemplazo por licencia',
    });
    creados++;

    await refrescar();

    // Marcas: la gracia esta en que NO cuadren con lo planificado. Si todos
    // marcan exacto, la pantalla de control horario no muestra nada.
    for (let d = 0; d < 5; d++) {
      const fe = f[d];
      const hoy = new Date(fe + 'T00:00:00');
      const enHora = h => { const x = new Date(hoy); const hh = ((Number(h) % 24) + 24) % 24;
        x.setHours(Math.floor(hh), Math.round((hh - Math.floor(hh)) * 60), 0, 0);
        if (Number(h) >= 24) x.setDate(x.getDate() + 1);
        return x.toISOString(); };
      let n = 0;
      for (const p of gente) {
        for (const a of turnosDe(p.id, fe)) {
          n++;
          if (n % 7 === 0) continue;                       // este no marco nada
          const tarde = (n % 5 === 0) ? 0.6 : 0;           // este llego 36 min tarde
          const antes = (n % 4 === 0) ? 0.5 : 0;           // este se fue media hora antes
          await DATOS.marcarComoJefe(a.id, p.id, fe, {
            entrada: enHora(Number(a.inicio) + tarde),
            salida:  enHora(Number(a.fin) - antes),
            llego: true, hora_llego: enHora(Number(a.inicio) + tarde),
          });
          marcados++;
        }
      }
    }

    // Cuanta gente necesita cada puesto en cada turno. SIN ESTO la cobertura
    // compara contra cero y sale todo verde, que es peor que no mostrarla: dice
    // «te alcanza» siempre. Lo cacho Pedro mirando el ejemplo.
    const puestosEj = puestosConocidos();
    const filasDot = [];
    for (let d = 0; d < 7; d++) {
      const finde = d >= 4;                       // viernes, sabado y domingo
      for (const q of puestosEj) {
        ts.forEach((t, k) => {
          // apertura con poca gente, tarde y cierre con mas, y el finde sube
          const base = k === 0 ? 1 : 2;
          filasDot.push({ local_id:S.local.id, perfil:String(d), puesto:q,
                          turno_id:t.id, cantidad: base + (finde && k > 0 ? 1 : 0) });
        });
      }
    }
    if (filasDot.length) await DATOS.guardarDotacionLote(filasDot);

    // Ventas y propinas, para que el reparto tenga de donde salir
    const venta = [380000, 420000, 395000, 460000, 610000, 840000, 520000];
    for (let d = 0; d < 7; d++)
      await DATOS.guardarDia(S.local.id, f[d], {
        venta: venta[d],
        propina_efectivo: Math.round(venta[d] * 0.04 / 1000) * 1000,
        propina_tarjeta:  Math.round(venta[d] * 0.06 / 1000) * 1000,
      });

    await refrescar();
    m.textContent = `Listo. Estás en el local «Ejemplo» con ${creados} turnos y ${marcados} marcas. `
      + 'Mira la Semana, el Día y Control horario. Arriba puedes volver a tu local.';
    m.className = 'msg ok';
  } catch (e) {
    S.hist.pop(); pintarDeshacer();
    m.textContent = e.message; m.className = 'msg bad';
  }
  b.disabled = false; b.textContent = 'Llenar con datos de ejemplo';
}

/* ---------- cargar el equipo desde una planilla ----------
   El valor no está en ahorrarle tiempo a Pedro con 8 personas: está en que un
   local de verdad con 25 YA TIENE su lista en una planilla, y nadie reescribe
   25 fichas a mano.

   Regla del 17-sep de Pedro: la app no guarda RUT, teléfono ni correo de los
   trabajadores. El cargador ignora esas columnas Y LO DICE, en vez de
   tragárselas calladito. Así él puede subir su planilla tal cual, sin
   limpiarla antes, y entra solo lo que corresponde. */

const COLUMNAS = {
  nombre:         ['nombre','nombres','nombre completo','trabajador','persona'],
  rol:            ['puesto','puesto habitual','cargo','rol','funcion','función'],
  equipo:         ['equipo','grupo','turno fijo'],
  valor_hora:     ['valor hora','valor por hora','sueldo hora','precio hora','valor_hora'],
  horas_contrato: ['horas contrato','horas','jornada','horas semanales','horas_contrato'],
  factor_propina: ['factor propina','factor','propina','factor_propina'],
};
// Columnas que NO se cargan aunque vengan. Se avisan aparte, por nombre.
const VETADAS = ['rut','run','cedula','cédula','dni','telefono','teléfono','fono','celular',
                 'correo','email','e-mail','mail','direccion','dirección','domicilio',
                 'fecha nacimiento','nacimiento','edad','cuenta','banco'];

const normal = t => String(t||'').trim().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'');

// Un CSV de Excel en Chile sale con punto y coma. Y con comillas cuando el
// campo trae el separador adentro. Las dos cosas hay que aguantarlas.
function leerCSV(texto) {
  texto = texto.replace(/^\uFEFF/, '');                  // Excel pone una marca al inicio
  const prim = (texto.split(/\r?\n/)[0] || '');
  const sep = (prim.split(';').length > prim.split(',').length) ? ';' : ',';
  const filas = []; let campo = '', fila = [], comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i+1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter(f => f.some(x => String(x).trim() !== ''));
}

function analizarPlanilla(texto) {
  const filas = leerCSV(texto);
  if (filas.length < 2) return { error: 'La planilla no tiene filas con datos.' };

  const cab = filas[0].map(normal);
  const mapa = {};                       // campo -> índice de columna
  Object.entries(COLUMNAS).forEach(([campo, nombres]) => {
    const i = cab.findIndex(c => nombres.some(n => normal(n) === c));
    if (i >= 0) mapa[campo] = i;
  });
  if (mapa.nombre == null) return { error: 'No encontré una columna «Nombre». Usa la plantilla.' };

  const usadas = new Set(Object.values(mapa));
  const ignoradas = [], sensibles = [];
  cab.forEach((c, i) => {
    if (usadas.has(i) || !c) return;
    (VETADAS.some(v => c.includes(normal(v))) ? sensibles : ignoradas).push(filas[0][i].trim());
  });

  const porNombre = {};
  S.personas.forEach(p => { porNombre[normal(p.nombre)] = p; });

  const nuevas = [], existentes = [], malas = [];
  filas.slice(1).forEach((f, n) => {
    const nombre = String(f[mapa.nombre] || '').trim();
    if (!nombre) { malas.push('fila ' + (n+2) + ': sin nombre'); return; }
    const d = { nombre };
    if (mapa.rol != null)    d.rol    = String(f[mapa.rol] || '').trim();
    if (mapa.equipo != null) d.equipo = String(f[mapa.equipo] || '').trim();
    if (mapa.valor_hora != null)     d.valor_hora     = Number(soloDigitos(f[mapa.valor_hora])) || 0;
    if (mapa.horas_contrato != null) d.horas_contrato = Number(String(f[mapa.horas_contrato]||'').replace(',','.')) || 0;
    if (mapa.factor_propina != null) d.factor_propina = Number(String(f[mapa.factor_propina]||'').replace(',','.')) || 1;
    const ya = porNombre[normal(nombre)];
    if (ya) existentes.push({ d, p: ya }); else nuevas.push(d);
  });
  return { nuevas, existentes, malas, ignoradas, sensibles };
}

function pintarPrevia(r) {
  const caja = $('#previaEq');
  if (r.error) { caja.innerHTML = `<p class="msg bad">${esc(r.error)}</p>`; return; }
  const li = [];
  if (r.nuevas.length)     li.push(`<b>${r.nuevas.length}</b> ${r.nuevas.length === 1 ? 'persona nueva' : 'personas nuevas'}`);
  if (r.existentes.length) li.push(`<b>${r.existentes.length}</b> que ya ${r.existentes.length === 1 ? 'existe y se actualiza' : 'existen y se actualizan'}`);
  caja.innerHTML = `
    <div class="note">
      <p><b>Esto es lo que va a pasar:</b> ${li.length ? li.join(' · ') : 'nada, no hay filas con nombre'}.</p>
      ${r.sensibles.length ? `<p>🔒 <b>No se cargan</b> estas columnas, porque la app no guarda esos datos:
        <b>${r.sensibles.map(esc).join(', ')}</b>.</p>` : ''}
      ${r.ignoradas.length ? `<p>Se ignoran además, porque no sé qué son: ${r.ignoradas.map(esc).join(', ')}.</p>` : ''}
      ${r.malas.length ? `<p class="msg bad">${r.malas.map(esc).join(' · ')}</p>` : ''}
      <div class="acciones" style="margin-top:10px">
        <button class="act primary" id="btnAplicar">Aplicar</button>
        <button class="act" id="btnCancelarCarga">Cancelar</button>
      </div>
    </div>`;
  on('#btnCancelarCarga', 'click', () => { caja.innerHTML = ''; });
  on('#btnAplicar', 'click', async () => {
    const b = $('#btnAplicar'); b.disabled = true; b.textContent = 'Cargando…';
    try {
      for (const d of r.nuevas) await DATOS.crearPersona(S.local.id, Object.assign({ valor_hora:2900, horas_contrato:45, factor_propina:1 }, d));
      for (const { d, p } of r.existentes) await DATOS.guardarPersona(p.id, d);
      await refrescar();
      caja.innerHTML = `<p class="msg ok">Listo: ${r.nuevas.length} nuevas y ${r.existentes.length} actualizadas.</p>`;
      setTimeout(() => { caja.innerHTML = ''; }, 6000);
    } catch (e) { b.disabled = false; b.textContent = 'Aplicar'; caja.innerHTML += `<p class="msg bad">${esc(e.message)}</p>`; }
  });
}

/* ================= EQUIPO ================= */
function filaCampo(label, tipo, valor, attrs) {
  if (tipo === 'plata')
    return `<div class="fld"><label>${label}</label><input type="text" inputmode="numeric"
      value="${esc(aPlata(valor))}" ${attrs||''}></div>`;
  return `<div class="fld"><label>${label}</label><input type="${tipo}" value="${esc(valor)}" ${attrs||''}></div>`;
}

function pintarEquipo() {
  const box = $('#eqLista'); box.innerHTML = '';
  if (!S.personas.length) box.appendChild(el('p','vacio','Todavía no hay nadie. Agrega tu primera persona abajo.'));
  S.personas.forEach(p => {
    const row = el('div','rowline' + (p.id === S.recien ? ' recien' : ''), `
      ${filaCampo('Nombre','text',p.nombre,'data-k="nombre"')}
      ${filaCampo('Puesto habitual','text',p.rol||'','data-k="rol" placeholder="ej.: Garzón"'
        + ((p.rol||'').trim() ? '' : ' class="falta"'))}
      ${filaCampo('Equipo','text',p.equipo||'','data-k="equipo" placeholder="Fijos / Por llamado"')}
      ${filaCampo('Valor hora','plata',p.valor_hora,'data-k="valor_hora" class="n"')}
      ${filaCampo('Horas contrato','number',p.horas_contrato,'data-k="horas_contrato" class="n" min="0" max="60" step="1"')}
      ${filaCampo('Factor propina','number',p.factor_propina,'data-k="factor_propina" class="n" min="0" max="3" step="0.1"')}
      ${filaCampo('Saldo horas','number',p.saldo_horas,'data-k="saldo_horas" class="n" step="0.5"')}
      <button class="mini" data-del="1">Quitar</button>
      <div class="dispo"><span>No puede:</span>${DIAS.map((d,i) =>
        `<button type="button" class="dia ${(p.no_disponible||[]).includes(i) ? 'no' : ''}" data-dia="${i}"
          aria-pressed="${(p.no_disponible||[]).includes(i)}">${d}</button>`).join('')}</div>`);
    row.dataset.persona = p.id;
    box.appendChild(row);
    let t = null;
    row.querySelectorAll('input[data-k]').forEach(inp => {
      inp.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(async () => {
          const k = inp.dataset.k;
          let v;
          if (k === 'nombre' || k === 'rol' || k === 'equipo') v = inp.value;
          else if (k === 'valor_hora') { v = dePlata(inp.value); inp.value = aPlata(v); }
          else v = Number(inp.value) || 0;
          try {
            Object.assign(p, await DATOS.guardarPersona(p.id, { [k]: v }));
            if (p.id === S.recien && k === 'nombre') { S.recien = null; row.classList.remove('recien'); }
            if (k === 'rol') inp.classList.toggle('falta', !inp.value.trim());
            pintarSemana(); pintarPropinas(); pintarLinks();
          }
          catch (e) { error(e); }
        }, 600);
      });
    });
    row.querySelectorAll('button.dia').forEach(b => {
      b.addEventListener('click', async () => {
        const i = Number(b.dataset.dia);
        const nd = new Set(p.no_disponible || []);
        nd.has(i) ? nd.delete(i) : nd.add(i);
        try { Object.assign(p, await DATOS.guardarPersona(p.id, { no_disponible: [...nd].sort() }));
              pintarEquipo(); pintarPlan(); }
        catch (e) { error(e); }
      });
    });
    row.querySelector('[data-del]').addEventListener('click', async () => {
      if (!confirm('¿Quitar a ' + p.nombre + ' del equipo?\n\nSus turnos y marcas anteriores no se borran.')) return;
      try {
        recordarEq([p.id], 'quitar a ' + p.nombre);
        await DATOS.quitarPersona(p.id); await refrescar();
      } catch (e) { S.histEq.pop(); pintarDeshacerEq(); error(e); }
    });
  });
}

/* ---------- los puestos del local ----------
   Eran campos sueltos siempre abiertos: por cada puesto, Nombre + Color +
   Colacion + Quitar, uno debajo de otro. Cuatro puestos llenaban la pantalla y
   no se veian de un vistazo. Justo debajo, la lista de TURNOS ya era una linea
   por turno que se abre. **Dos listas de lo mismo con dos estilos distintos en
   la misma pagina**, y Pedro lo vio: «es mejor con puestos» (07-10).

   Ahora es la misma forma que los turnos —se reusa su clase `.tnfila`, no hay
   CSS nuevo— y editar abre el MISMO dialogo con el que se crea. De paso se cae
   el `prompt()` de «Agregar puesto», que es lo que ya se habia quitado en los
   turnos.

   El renombrado desde «Cuanta gente necesito» sigue donde estaba: Pedro lo
   pidio tres veces ahi. Esto no lo reemplaza. */
function pintarPuestos() {
  const bq = $('#bloqTope');
  if (bq && document.activeElement !== bq) bq.checked = !!(S.local && S.local.bloquear_sobre_tope);
  const box = $('#eqPuestos'); if (!box) return;
  box.innerHTML = '';
  if (!S.puestos.length) {
    box.innerHTML = '<p class="vacio">Todavía no hay lista de puestos. '
      + 'Si acabas de pegar el SQL, recarga; si no, agrega el primero abajo.</p>';
    return;
  }
  S.puestos.forEach(q => {
    const col = q.colacion == null ? 'la del turno' : Math.round(q.colacion * 60) + ' min';
    const fila = el('button', 'tnfila');
    fila.type = 'button';
    fila.dataset.puesto = q.id;
    /* El nombre va DENTRO de su pastilla de color, una sola vez. Al pasar de
       campos sueltos a lista quedaba escrito dos veces —como texto y otra vez
       en la muestra—, que ahi tenia sentido (era la vista previa del color
       mientras lo elegias) y en una lista es ruido. */
    fila.innerHTML = `<span class="tnf-nom muestra" data-c="${q.color}">${esc(q.nombre)}</span>`
      + `<span class="tnf-dias"></span>`
      + `<span class="tnf-h">${esc(col)}</span>`;
    fila.addEventListener('click', () => abrirPQ(q));
    box.appendChild(fila);
  });
}

/* Abre el dialogo. Sin `q` es uno nuevo. */
function abrirPQ(q) {
  S.pqEdit = q || null;
  $('#pqTit').textContent = q ? 'Editar el puesto' : 'Puesto nuevo';
  $('#pqNombre').value   = q ? q.nombre : '';
  $('#pqColor').value    = String(q ? q.color : (S.puestos.length % 4) + 1);
  $('#pqColacion').value = q && q.colacion != null ? String(Math.round(q.colacion * 60)) : '';
  $('#pqBorrar').hidden  = !q;
  const m = $('#pqMsg'); m.textContent = ''; m.className = 'msg';
  $('#dlgPQ').showModal();
  $('#pqNombre').focus();
}

async function guardarPQ() {
  const q = S.pqEdit;
  const m = $('#pqMsg');
  const nombre = $('#pqNombre').value.trim();
  if (!nombre) { m.textContent = 'Ponle un nombre.'; m.className = 'msg bad'; return; }
  const color    = Number($('#pqColor').value);
  const colacion = $('#pqColacion').value === ''
    ? null : (Number($('#pqColacion').value) || 0) / 60;
  try {
    if (!q) {
      await DATOS.crearPuesto(S.local.id, { nombre, color, colacion,
        orden: S.puestos.length + 1 });
    } else {
      /* El nombre va por `renombrar_puesto`, que arrastra a la gente y a los
         turnos ya asignados, y deja su paso atras —el mismo Deshacer que se
         hizo esta mañana para «Cuanta gente necesito»—. El color y la colacion
         son del puesto y nada mas, asi que van por el camino corto. */
      if (nombre !== q.nombre) {
        recordarRen(q.id, q.nombre, nombre);
        try { await DATOS.renombrarPuesto(q.id, nombre); }
        catch (e) { S.histDot.pop(); pintarDeshacerDot(); throw e; }
      }
      if (color !== Number(q.color) || colacion !== (q.colacion == null ? null : Number(q.colacion)))
        await DATOS.guardarPuesto(q.id, { color, colacion });
    }
    await refrescar();
    $('#dlgPQ').close();
  } catch (e) {
    m.textContent = /duplicate|unicos/i.test(e.message)
      ? 'Ya hay un puesto con ese nombre.' : e.message;
    m.className = 'msg bad';
  }
}

/* Quitar un puesto del catalogo, con su aviso. Vive aqui y no dentro del
   dialogo porque desde el 07-10 se puede pedir desde DOS sitios —el dialogo de
   «Puestos del local» y el atajo del bloque en «Cuanta gente necesito»— y la
   advertencia de cuanta gente lo tiene no puede existir en dos versiones.
   Devuelve true si de verdad se quito. */
async function quitarPuestoDelCatalogo(q) {
  if (!q) return false;
  const usan = S.personas.filter(p => normal(p.rol) === normal(q.nombre)).length;
  if (!confirm(`¿Quitar el puesto «${q.nombre}»?\n\n`
    + (usan ? `Lo tienen ${usan} ${usan === 1 ? 'persona' : 'personas'}. No se les borra: `
            + 'siguen con ese puesto escrito, pero deja de ofrecerse en las listas.\n\n' : '')
    + 'No se borra nada de lo ya planificado.')) return false;
  await DATOS.quitarPuesto(q.id);
  await refrescar();
  return true;
}

async function borrarPQ() {
  const q = S.pqEdit; if (!q) return;
  try { if (await quitarPuestoDelCatalogo(q)) $('#dlgPQ').close(); }
  catch (e) { const m = $('#pqMsg'); m.textContent = e.message; m.className = 'msg bad'; }
}

/* ---------- la lista de turnos del local ----------
   Era una fila de CAMPOS SUELTOS por turno —nombre, entra, sale, colacion,
   horas y «Quitar»— sin titulo ni jerarquia: cinco controles para algo que
   mentalmente es una sola cosa. Y era el unico sitio donde se podia editar un
   turno, cuando crearlos ya se hace en otra pantalla distinta.

   Decision 5 de Pedro: **editar abre el mismo dialogo que crear**. Asi que esto
   pasa a ser una LISTA en la que cada linea se abre, y la edicion vive en un
   solo lugar. Los dias salen del patron guardado (`turnos.dias`), que hasta hoy
   no se mostraba en ninguna parte aunque la columna existiera. */
function pintarTurnos() {
  const box = $('#eqTurnos'); if (!box) return;
  box.innerHTML = '';
  if (!S.turnos.length) {
    box.innerHTML = '<p class="vacio">Todavía no hay turnos. Crea el primero con el botón de abajo.</p>';
    return;
  }
  const CORTOS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  S.turnos.forEach(t => {
    const dias = String(t.dias == null ? '' : t.dias);
    const cuando = !dias ? 'sin días fijos'
      : dias.length === 7 ? 'todos los días'
      : dias.split('').map(d => CORTOS[Number(d)]).join(' · ');
    const fila = el('button', 'tnfila');
    fila.type = 'button';
    fila.dataset.turno = t.id;
    fila.innerHTML = `<span class="tnf-nom">${esc(t.nombre)}</span>`
      + `<span class="tnf-hor">${hhmm(t.inicio)}–${hhmm(t.fin)}</span>`
      + `<span class="tnf-dias">${esc(cuando)}</span>`
      + `<span class="tnf-h">${hfmt(horasDe(t))} h</span>`;
    fila.addEventListener('click', () => abrirTN(t));
    box.appendChild(fila);
  });
}

/* ================= GENERAR LA PROPUESTA DE TURNOS =================
   Pedro, 05-10-2026 (msg 3764), y es el encargo entero en dos frases:

     «el administrador no deberia comenzar diciendo "Juan trabaja el lunes a
      las 12". Primero deberia decir "el lunes necesito 5 garzones entre 12:00
      y 16:00". Despues el sistema asigna las personas disponibles.»

   Hasta hoy la dotacion era un numero que solo servia para pintar la cobertura
   de rojo: pedia 84 casillas y no devolvia nada, y por eso esa pantalla se
   sentia debil. Esto es lo que la consume.

   NO es IA, y no debe serlo. Es un problema de encaje, y lo unico que se le
   exige a esto es que sea EXPLICABLE: si no puede cubrir algo tiene que decir
   por que —«dos ya tienen turno ese dia, uno esta de vacaciones»—. Una IA ahi
   inventaria, y en un producto que promete cumplimiento laboral el invento lo
   paga Pedro.

   ⚠️ LA CUENTA VA POR HORA, NO POR TURNO, y eso no es un lujo: lo encontro
   Pedro el mismo dia (msg 3772) agregando «almuerzo 11:00–15:30» y «Cena
   20:30–01:00» sobre los tres turnos que ya tenia. Contando por turno, quien
   trabaja 08:00–16:30 cuenta como cobertura de la Tarde 13:00–21:30 porque se
   pisan — asi que con UNA persona el panel daba por cubiertos los dos turnos y
   a las 17:00 no habia nadie. Por hora eso no puede pasar.

   `proponer()` entra y sale SOLO por parametro: no toca `S`, no toca la base y
   no toca el DOM. Es a proposito, para poder probarla en node. */

/* Cuantas horas tiene que descansar alguien entre el fin de un turno y el
   inicio del siguiente para que el repartidor se lo ofrezca.

   ⚠️ Esto NO es una regla legal chilena: el Codigo del Trabajo no fija un
   descanso diario minimo general como el de 11 h de la directiva europea. Es
   una regla de SENTIDO COMUN del local, para que la maquina no le encaje a
   nadie un cierre 17:00–01:00 y una apertura a las 08:00 del dia siguiente.
   El encargado puede hacerlo a mano si quiere; el automatico no lo propone. */
const DESCANSO_MIN = 10;

/* Tope de vueltas del repartidor. Cada vuelta o pone a alguien o descarta un
   par puesto+turno, asi que termina solo; esto es un cinturon por si un dato
   raro —un turno de fin menor que su inicio— lo dejara dando vueltas. Que la
   pantalla se congele es peor que una propuesta incompleta. */
const MAX_VUELTAS = 400;

/* Las razones por las que alguien no entra. El texto va en plural porque
   siempre se muestra con un numero delante. */
const MOTIVOS = {
  ocupado:      'ya tienen turno ese día',
  ausencia:     'están de ausencia',
  noDisponible: 'dijeron que no pueden ese día',
  contrato:     'se pasarían de su contrato',
  // Estos dos son topes DEL LOCAL, no del Codigo del Trabajo. Se dice en el
  // propio texto para que nadie los lea como una exigencia legal: Pedro eligio
  // el 06-10 llamarlos por su nombre mientras no haya reglas de verdad.
  sieteDias:    'quedarían con 7 días seguidos (tope del local)',
  descanso:     'no alcanzan a descansar ' + DESCANSO_MIN + ' h entre turnos (tope del local)',
  sinGente:     'no hay nadie con ese puesto',
};

/* proponer(ent) -> { filas, huecos, nadie }

   ent = {
     fechas:   [iso x7, lunes primero],
     turnos:   [{ id, nombre, inicio, fin, colacion }],
     puestos:  [nombre],
     dotacion: { perfil: { puesto: { turnoId: cantidad } } },   perfil '0'..'6'
     tramos:   { perfil: { puesto: [ {desde, hasta, cantidad} ] } },  manda sobre `dotacion`
     personas: [{ id, nombre, rol, horas_contrato, no_disponible:[dow] }],
     asign:    { 'personaId|fecha': [ fila ] },   lo que YA hay
     sinDueno: [ { fecha, inicio, fin, puesto } ],
   }

   `filas` son turnos nuevos CON persona. `huecos` es lo que quedo sin cubrir,
   en TRAMOS de horas y con su explicacion. `nadie` suma las persona-horas que
   faltan, que es la unidad honesta cuando los turnos se pisan. */
function proponer(ent) {
  const norm = s => String(s == null ? '' : s).trim().toLowerCase();
  const horasT = t => Number(t.fin) - Number(t.inicio) - Number(t.colacion || 0);

  const turnos  = (ent.turnos || []).slice().sort((a, b) => Number(a.inicio) - Number(b.inicio));
  const puestos = (ent.puestos || []).slice();
  const dot     = ent.dotacion || {};
  const filasDe = (pid, fe) => (ent.asign || {})[pid + '|' + fe] || [];
  if (!turnos.length || !puestos.length || !ent.personas.length)
    return { filas: [], huecos: [], nadie: 0 };

  // La franja del local sale de los turnos que existen. Un turno que cruza la
  // medianoche trae `fin` > 24 (01:00 es 25), asi que el techo puede pasar de 24.
  const h0 = Math.floor(Math.min.apply(null, turnos.map(t => Number(t.inicio))));
  const h1 = Math.ceil(Math.max.apply(null, turnos.map(t => Number(t.fin))));

  /* El estado de cada persona durante el reparto: lo que YA tenia MAS lo que le
     vamos proponiendo. Sin esto todos quedan empatados en cero horas y la
     segunda ranura del mismo turno le vuelve a tocar al mismo de la primera. */
  const est = {};
  ent.personas.forEach(p => { est[p.id] = { horas: 0, dias: 0, bloques: {}, ausente: {} }; });
  ent.fechas.forEach(fe => {
    ent.personas.forEach(p => {
      const fs = filasDe(p.id, fe);
      const ts = fs.filter(a => a.inicio != null);
      const au = fs.find(a => a.ausencia);
      // «Libre» no es una ausencia que impida nada: es no tener nada ese dia.
      if (au && au.ausencia && au.ausencia !== 'L') est[p.id].ausente[fe] = true;
      if (ts.length) est[p.id].dias++;
      ts.forEach(a => {
        est[p.id].horas += Number(a.fin) - Number(a.inicio) - Number(a.colacion || 0);
        (est[p.id].bloques[fe] = est[p.id].bloques[fe] || []).push({
          inicio: Number(a.inicio), fin: Number(a.fin),
          // el puesto DE LA ASIGNACION manda: si Camila hace barra el lunes,
          // ese lunes cuenta en barra aunque su puesto habitual sea garzon.
          puesto: (a.puesto || '').trim() || (p.rol || '').trim(),
        });
      });
    });
  });

  /* Cuanta gente de ese puesto se necesita a esa hora.

     Si hay TRAMOS definidos mandan ellos, y no se suman entre si: se toma el
     mayor. Es la misma regla que `necesitaHora()` usa en la pantalla, y tiene
     que ser la misma — si el generador contara distinto que el panel que esta
     al lado, uno de los dos estaria mintiendo y no se sabria cual.

     Sin tramos se deduce de la dotacion vieja sumando los turnos que pasan por
     la hora. Ahi SI se suma, porque asi se leia: si de 13:00 a 16:30 corren la
     mañana y la tarde, se pide la gente de las dos. Esa ambigueedad es
     justamente la que los tramos vinieron a matar. */
  const reqHora = (d, puesto, h) => {
    const lista = (((ent.tramos || {})[String(d)] || {})[puesto]) || [];
    if (lista.length) {
      let n = 0;
      lista.forEach(t => {
        if (cubreHora(t.desde, t.hasta, h)) n = Math.max(n, Number(t.cantidad) || 0);
      });
      return n;
    }
    return turnos.reduce((n, t) =>
      n + (cubreHora(t.inicio, t.fin, h)
        ? ((((dot[String(d)] || {})[puesto] || {})[t.id]) || 0) : 0), 0);
  };

  /* Cuanta gente de ese puesto hay puesta a esa hora: lo que ya estaba mas lo
     que llevamos propuesto en esta corrida.

     Los turnos SIN DUEÑO cuentan aca a proposito, y es la unica concesion del
     archivo: en la pantalla de cobertura NO cuentan como gente —no hay nadie,
     y ese es justo el hueco que hay que mostrar— pero para el repartidor son
     una ranura ya planificada. Si no contaran, apretar el boton dos veces
     crearia el mismo turno dos veces. Este boton no les pone gente: solo
     agrega turnos nuevos. */
  const hayHora = (fe, puesto, h) => {
    let n = 0;
    ent.personas.forEach(p => {
      if ((est[p.id].bloques[fe] || []).some(b =>
        cubreHora(b.inicio, b.fin, h) && norm(b.puesto) === norm(puesto))) n++;
    });
    (ent.sinDueno || []).forEach(a => {
      if (a.fecha === fe && norm(a.puesto) === norm(puesto)
        && cubreHora(a.inicio, a.fin, h)) n++;
    });
    return n;
  };

  /* El descanso desde el ultimo turno que la persona tenga ANTES de este. Se
     mira el dia anterior y el mismo dia: un cierre que termina a las 25.0
     (01:00 del dia siguiente) se compara contra el inicio de mañana + 24. */
  const descansoAntes = (p, fe, d, t) => {
    const antes = [];
    const prev = ent.fechas[d - 1];
    if (prev) (est[p.id].bloques[prev] || []).forEach(b => antes.push(b.fin - 24));
    (est[p.id].bloques[fe] || []).forEach(b => { if (b.fin <= Number(t.inicio)) antes.push(b.fin); });
    if (!antes.length) return Infinity;
    return Number(t.inicio) - Math.max.apply(null, antes);
  };

  /* Quien puede tomar ese turno en ese puesto, ya ordenado. Devuelve tambien el
     recuento de por que NO pudieron los demas: es lo que despues se lee en
     palabras debajo del hueco. */
  const candidatos = (fe, d, t, puesto) => {
    const motivos = {};
    const suma = k => { motivos[k] = (motivos[k] || 0) + 1; };
    // Solo la gente de ESE puesto. Mandar a un cocinero a atender mesas es una
    // decision del encargado, no de un algoritmo: el que mira la propuesta
    // puede moverlo, la maquina no lo inventa.
    const delPuesto = ent.personas.filter(p => norm(p.rol) === norm(puesto));
    if (!delPuesto.length) { suma('sinGente'); return { pueden: [], motivos }; }

    const pueden = [];
    delPuesto.forEach(p => {
      const e = est[p.id];
      if (e.ausente[fe]) return suma('ausencia');
      if ((e.bloques[fe] || []).some(b => b.inicio < Number(t.fin) && Number(t.inicio) < b.fin))
        return suma('ocupado');
      if ((p.no_disponible || []).indexOf(d) >= 0) return suma('noDisponible');
      const tope = Number(p.horas_contrato) || 0;
      if (tope && e.horas + horasT(t) > tope) return suma('contrato');
      // El 7.º dia seguido solo cuenta si ese dia todavia no trabajaba.
      if (!(e.bloques[fe] || []).length && e.dias + 1 >= 7) return suma('sieteDias');
      if (descansoAntes(p, fe, d, t) < DESCANSO_MIN) return suma('descanso');
      pueden.push(p);
    });

    /* Reparte parejo: el que menos horas lleva, y a igualdad el que menos dias.
       El nombre al final no es decoracion — sin un desempate fijo, dos corridas
       sobre los mismos datos darian mallas distintas y nadie podria revisar
       nada. */
    pueden.sort((a, b) => (est[a.id].horas - est[b.id].horas)
      || (est[a.id].dias - est[b.id].dias)
      || String(a.nombre).localeCompare(String(b.nombre)));
    return { pueden, motivos };
  };

  const filas = [], huecos = [];
  let nadie = 0;

  ent.fechas.forEach((fe, d) => {
    const agotado = {};          // 'puesto|turnoId' que ya no tiene a quien mandar
    const sinSalida = {};        // puesto que ya no tiene ningun turno por donde entrar
    const motivosPuesto = {};    // puesto -> recuento acumulado del dia
    let vueltas = 0;

    while (vueltas++ < MAX_VUELTAS) {
      /* El hueco mas grande del dia. A igual tamaño gana la hora mas temprana:
         tapar primero la mañana deja la tarde entera disponible para el resto,
         y ademas hace la propuesta reproducible. */
      let peor = null;
      puestos.forEach(pu => {
        if (sinSalida[pu]) return;
        for (let h = h0; h < h1; h++) {
          const f = reqHora(d, pu, h) - hayHora(fe, pu, h);
          if (f > 0 && (!peor || f > peor.falta || (f === peor.falta && h < peor.h)))
            peor = { puesto: pu, h, falta: f };
        }
      });
      if (!peor) break;

      /* Por que turno se tapa. Entre los que pasan por esa hora, gana el que
         cubre MAS horas con falta: poner a alguien en el turno que tapa tres
         horas deficitarias vale mas que en el que tapa una.

         Con la dotacion VIEJA solo sirven los turnos que el local pidio para
         ese puesto, porque la necesidad venia atada al turno. Con TRAMOS la
         necesidad ya no sabe de turnos: sirve cualquiera que pase por la hora,
         y el turno es solo la forma de darle horario al bloque que se crea.
         Sin esta distincion, con tramos y la dotacion vieja en blanco no habia
         ningun turno elegible y el generador no proponia nada — lo cazo una
         prueba, no la pantalla. */
      const conTramos = ((( ent.tramos || {})[String(d)] || {})[peor.puesto] || []).length > 0;
      const sirven = turnos.filter(t =>
        Number(t.inicio) <= peor.h && peor.h < Number(t.fin)
        && (conTramos || ((((dot[String(d)] || {})[peor.puesto] || {})[t.id]) || 0) > 0)
        && !agotado[peor.puesto + '|' + t.id]);
      if (!sirven.length) { sinSalida[peor.puesto] = true; continue; }

      const tapa = t => {
        let n = 0;
        for (let h = Math.floor(Number(t.inicio)); h < Number(t.fin); h++)
          if (reqHora(d, peor.puesto, h) - hayHora(fe, peor.puesto, h) > 0) n++;
        return n;
      };
      sirven.sort((a, b) => (tapa(b) - tapa(a)) || (Number(a.inicio) - Number(b.inicio)));
      const t = sirven[0];

      const { pueden, motivos } = candidatos(fe, d, t, peor.puesto);
      const acum = motivosPuesto[peor.puesto] = motivosPuesto[peor.puesto] || {};
      Object.keys(motivos).forEach(k => { acum[k] = Math.max(acum[k] || 0, motivos[k]); });

      if (!pueden.length) { agotado[peor.puesto + '|' + t.id] = true; continue; }

      const q = pueden[0], e = est[q.id];
      if (!(e.bloques[fe] || []).length) e.dias++;
      e.horas += horasT(t);
      (e.bloques[fe] = e.bloques[fe] || []).push({
        inicio: Number(t.inicio), fin: Number(t.fin), puesto: peor.puesto });

      filas.push({
        persona_id: q.id, nombre: q.nombre, fecha: fe, dia: d,
        turno_id: t.id, turno: t.nombre, puesto: peor.puesto,
        inicio: Number(t.inicio), fin: Number(t.fin), colacion: Number(t.colacion || 0),
      });
    }

    /* Lo que quedo sin cubrir, dicho en TRAMOS de horas y no hora por hora:
       «falta 1 garzón de 17:00 a 21:00» se lee; cuatro lineas de una hora, no.
       Horas seguidas con el MISMO faltante se juntan; faltantes distintos no,
       porque son dos problemas distintos. Es la misma regla que ya sigue la
       vista de dia. */
    puestos.forEach(pu => {
      let act = null;
      for (let h = h0; h < h1; h++) {
        const f = reqHora(d, pu, h) - hayHora(fe, pu, h);
        if (f > 0) {
          nadie += f;
          if (act && act.falta === f && act.hasta === h) act.hasta = h + 1;
          else {
            act = { fecha: fe, dia: d, puesto: pu, falta: f, desde: h, hasta: h + 1,
                    motivos: motivosPuesto[pu] || {} };
            huecos.push(act);
          }
        } else act = null;
      }
    });
  });

  return { filas, huecos, nadie };
}

/* El por que de un hueco, en palabras. Se ordena de mayor a menor para que lo
   primero que se lea sea la razon principal, y se cortan las tres primeras: la
   lista completa es cierta pero no se lee. */
function diceMotivos(motivos) {
  const ks = Object.keys(motivos || {}).filter(k => motivos[k] > 0)
    .sort((a, b) => motivos[b] - motivos[a]);
  if (!ks.length) return '';
  return ks.slice(0, 3).map(k => k === 'sinGente'
    ? MOTIVOS.sinGente
    : motivos[k] + ' ' + MOTIVOS[k]).join(', ');
}

/* ---------- el boton del repartidor ----------
   `proponer()` existia desde el 05-10, con 25 pruebas en verde, y **no la
   llamaba nadie**: logica escrita y enterrada. Pedro lo pidio el 07-10
   («sigamos con todo lo que falta»).

   Va en «Cuanta gente necesito» a proposito: es lo que esa pantalla DEVUELVE.
   Hasta hoy pedia las horas de cada puesto y no entregaba nada visible, que es
   lo que Pedro viene diciendo que le hace ruido.

   PROPONE Y PREGUNTA, no escribe de una. Y cuando no puede cubrir algo lo dice
   con su motivo —«2 ya tienen turno ese dia, 1 esta de ausencia»—, que es la
   unica exigencia que se le puso desde el principio: tiene que ser explicable.
   Una maquina que reparte sin decir por que, en algo que promete cumplimiento
   laboral, convierte cada duda en una revision a mano. */
async function repartirSemana() {
  const m = $('#msgDot');
  const decir = (t, c) => { if (!m) return; m.textContent = t; m.className = 'msg ' + c;
                            setTimeout(() => { if (m.textContent === t) m.textContent = ''; }, 9000); };
  const f7 = fechas();
  const r = proponer({
    fechas: f7,
    turnos: S.turnos.map(t => ({ id: t.id, nombre: t.nombre, inicio: Number(t.inicio),
                                 fin: Number(t.fin), colacion: Number(t.colacion || 0) })),
    puestos: puestos(),
    dotacion: S.dotacion,
    tramos: S.tramos,
    personas: S.personas.map(p => ({ id: p.id, nombre: p.nombre, rol: p.rol,
                                     horas_contrato: Number(p.horas_contrato) || 0,
                                     no_disponible: p.no_disponible || [] })),
    asign: S.asign,
    sinDueno: S.abiertos.filter(a => f7.includes(a.fecha) && a.inicio != null)
                        .map(a => ({ fecha: a.fecha, inicio: Number(a.inicio),
                                     fin: Number(a.fin), puesto: (a.puesto || '').trim() })),
  });

  if (!r.filas.length) {
    return decir(r.nadie
      ? 'No puedo poner a nadie más: ' + (diceMotivos((r.huecos[0] || {}).motivos) || 'no queda gente disponible') + '.'
      : 'No falta nadie esta semana: no hay nada que repartir.', r.nadie ? 'bad' : 'ok');
  }

  /* Lo que queda sin cubrir se cuenta en PERSONA-HORAS y no en turnos: cuando
     dos turnos se pisan, contar turnos da por cubierto lo que no lo esta. */
  const faltan = r.huecos.slice(0, 3).map(h =>
    `${h.falta} de ${h.puesto} el ${DIAS[h.dia]} de ${hhmm(h.desde)} a ${hhmm(h.hasta)}`
    + (diceMotivos(h.motivos) ? ` (${diceMotivos(h.motivos)})` : ''));

  if (!confirm(`Voy a poner ${r.filas.length} ${r.filas.length === 1 ? 'turno' : 'turnos'} en la semana.`
    + (r.nadie ? `\n\nQuedan ${hfmt(r.nadie)} persona-horas sin cubrir:\n· ${faltan.join('\n· ')}`
               + (r.huecos.length > 3 ? `\n· …y ${r.huecos.length - 3} tramos más` : '') : '')
    + '\n\nNo se toca nada de lo que ya pusiste. ¿Lo hago?')) return;

  try {
    recordar('repartir la semana');
    await DATOS.crearAsignacionesLote(S.local.id, r.filas.map(x => ({
      persona_id: x.persona_id, fecha: x.fecha, turno_id: x.turno_id,
      inicio: x.inicio, fin: x.fin, colacion: x.colacion, puesto: x.puesto, nota: '',
    })));
    await refrescar();
    decir(`Puestos ${r.filas.length} turnos.`
      + (r.nadie ? ` Quedan ${hfmt(r.nadie)} persona-horas sin cubrir.` : ' Semana cubierta.')
      + ' Si fue sin querer, aprieta Deshacer.', r.nadie ? 'bad' : 'ok');
  } catch (e) {
    S.hist.pop(); pintarDeshacer();
    decir(e.message, 'bad');
  }
}

/* ================= CUANTA GENTE NECESITO, POR TRAMO =================
   Reemplaza a la tabla de puesto x turno. El caso que la mato lo trajo Pedro
   (msg 3892): con un corrido de 8 h y un refuerzo de 4 h, el mismo numero
   significaba dos cosas — «cuanta quiero» en uno y «cuanta MAS» en el otro— y
   la tabla no lo decia en ninguna parte. Con sus propios numeros eso eran seis
   personas de diferencia en la semana.

   Acá un numero tiene UN significado: cuanta gente quiero a esa hora. */

const tramosDe = (perfil, puesto) => ((S.tramos[perfil] || {})[puesto] || []);

/* Deja la lista de tramos como se debe guardar: tira la basura, los ordena y
   PEGA los que se tocan y piden lo mismo.

   Lo de pegar no es cosmetico: sin eso, teclear 08–12 y despues 12–16 con el
   mismo numero deja dos filas que dicen lo que una sola diria mejor, y al dia
   siguiente nadie entiende por que estan partidas.

   Va de nivel superior y con nombre a proposito, para poder probarla en node
   sin navegador — la misma razon por la que `proponer()` entra y sale por
   parametro. */
/* Un tramo tecleado, llevado a horas del DIA DE TRABAJO (que puede pasar de 24).

   `hhmm(24)` escribe «00:00» y `deHora('00:00')` devuelve 0: la ida y la vuelta
   no son la misma hora. Un tramo guardado como 20,5 → 25 se dibuja
   «20:30 – 01:00», pero al releer la fila vuelve como 20,5 → 1 y
   `normalizarTramos` lo tira, con razon. Tocabas un numero y la fila
   desaparecia. Lo vio Pedro dos veces seguidas (msgs 4170 y 4171).

   La regla es la que ya usan los turnos, que guardan la 01:00 como 25: una hora
   anterior a la apertura, o un fin que no supera a su inicio, es del dia
   siguiente. Vive aqui arriba y no dentro del editor para que se pueda probar:
   el bug duro porque estaba enterrada en un closure. */
function tramoDelDia(desde, hasta, h0) {
  if (desde != null && desde < h0) desde += 24;
  if (desde != null && hasta != null && hasta <= desde) hasta += 24;
  return { desde, hasta };
}

function normalizarTramos(lista) {
  const ok = (lista || [])
    .filter(t => t.desde != null && t.hasta != null
                 && Number(t.hasta) > Number(t.desde) && Number(t.cantidad) > 0)
    .map(t => ({ desde: Number(t.desde), hasta: Number(t.hasta), cantidad: Number(t.cantidad) }))
    .sort((a, b) => a.desde - b.desde);
  const out = [];
  ok.forEach(t => {
    const u = out[out.length - 1];
    if (u && u.cantidad === t.cantidad && Math.abs(u.hasta - t.desde) < 0.01) u.hasta = t.hasta;
    else out.push(t);
  });
  return out;
}

/* El dibujo de barras por hora. Es la misma informacion de la tabla vista de un
   golpe: la hora punta se ve sin leer.

   06-10-2026. Antes el alto era PROPORCIONAL AL MAXIMO DEL DIA
   (`n / tope * 46`), y por eso subir un turno ACHICABA los demas. Pedro subio
   la cena de 2 a 5 y las barras de la manana, que seguian en 1 persona, bajaron
   de 23 px a 9 px: «aumentar o bajar numeros no coincide con el verde de abajo»
   (msgs 4180-4184). El dibujo cambiaba sin que cambiara el dato, y como no habia
   ningun numero en pantalla no habia forma de notarlo.

   Ahora UNA PERSONA MIDE SIEMPRE LO MISMO (`ALTO_PERSONA`) y es el grafico el
   que crece; subir la cena no mueve la manana. Cada barra lleva ademas SU
   NUMERO, que es lo unico que no se puede malinterpretar. Solo por sobre
   `TOPE_PERSONAS` se comprime, para no desbordar la pantalla, y ahi el numero
   sigue diciendo la verdad.

   Lo otro que pidio Pedro —«hoy es un solo bloque que sube o baja, deberia ser
   mas claro» (msg 4184)— es el separador: las horas en cero dejan de pintarse
   verdes, asi el bloque tiene principio y fin. */
const ALTO_PERSONA = 14;    // px que mide UNA persona, siempre
const TOPE_PERSONAS = 10;   // desde aqui se comprime para que quepa en pantalla

const altoPorPersona = tope =>
  tope <= TOPE_PERSONAS ? ALTO_PERSONA : ALTO_PERSONA * TOPE_PERSONAS / tope;

function barrasNecesidad(perfil, puesto) {
  const base = franja();
  const horas = [];
  for (let h = base.h0; h < base.h1; h++) horas.push(necesitaHora(perfil, puesto, h));
  const tope = Math.max(1, ...horas);
  const alto = altoPorPersona(tope);
  // 26 px de respiro para el numero de arriba y la hora de abajo.
  return `<div class="grn" style="height:${Math.round(tope * alto) + 26}px">`
    + horas.map((n, i) =>
    `<div class="grb" title="${hhmm(base.h0 + i)}: ${n}">`
    + `<b>${n || ''}</b>`
    + `<i${n ? '' : ' class="cero"'} style="height:${Math.round(n * alto)}px"></i>`
    + `<span>${String((base.h0 + i) % 24).padStart(2,'0')}</span></div>`).join('') + '</div>';
}

/* `pintarNecesidad()` —la tabla SOLO de tramos— se borro el 06-10-2026 al juntar
   turnos y horarios libres en una sola lista. Lo que hacia vive ahora dentro de
   `pintarNecesidadPorTurno()`, en las filas con `data-i`. */


/* ================= CUÁNTA GENTE NECESITO =================
   DOS MANERAS DE DECIR LO MISMO, y la de por turno manda.

   Pedro, despues de probar la version por tramos (msgs 4081-4086):
     «es que para mi es mas intuitivo de la otra forma... son turnos separados»
     «no quiero que me toque a mi tipiar por hora porque serian muchos tipeos»
     «claro, por detras es por hora, pero al designar turnos me ahorro teclear»

   Y tenia razon, asi que esto deshace media decision mia del mismo dia. Cuando
   pase la necesidad a tramos junte DOS problemas distintos en uno:

     1. Como se COMPARA. Contar por turno estaba mal de verdad: con un corrido y
        un refuerzo que se pisan, una persona salia cubriendo los dos. Ese error
        lo encontro el (msg 3772) y habia que arreglarlo por hora.
     2. Como se TECLEA. Aca no habia ningun error. Habia una ETIQUETA mala: la
        tabla no decia si el numero del refuerzo era «uno mas» o «uno en total».

   Cambie los dos cuando solo el primero lo necesitaba, y el precio lo pago el,
   tecleando rangos de hora. La comparacion sigue siendo por hora —eso no se
   toca— y la entrada vuelve a ser por turno.

   COMO CONVIVEN, que es lo unico delicado: `necesitaHora()` usa los tramos SI
   los hay, y si no SUMA los turnos que pasan por esa hora. Entonces no hay que
   guardar nada derivado: al teclear por turno se BORRAN los tramos de ese
   puesto y la cuenta cae sola en la suma. Un solo dato, siempre en sintonia.
   Los tramos quedan para lo que no calza con ningun turno. */
function pintarNecesidadBox(box, ps, ts) {
  box.innerHTML = '';
  if (!ps.length || !ts.length) {
    box.innerHTML = '<p class="vacio">Primero agrega tu equipo y tus turnos.</p>';
    return;
  }
  /* 06-10-2026: SE ACABO EL CONMUTADOR «Por turno / Ajustar por hora».
     Era la version torpe de una sola idea. Pedro lo dijo en una linea (msg
     4157): que turnos y horarios libres vivan en LA MISMA lista, con «Horario
     libre…» al final del desplegable. Lo que antes obligaba a elegir PANTALLA
     ahora se elige POR FILA, y la cuenta suma en vez de reemplazar. */
  pintarNecesidadPorTurno(box, ps, ts);
}

/* UNA SOLA LISTA POR PUESTO: turnos del catalogo y horarios libres mezclados.

   Pedro, 06-10-2026 (msg 4157): «juntar turnos y horarios libres en la misma
   lista, con una opcion Horario libre… al final del desplegable». Antes eran
   dos pantallas con un conmutador, y elegir pantalla para escribir dos cosas
   que conviven en la cabeza del dueno era la parte torpe.

   Una linea es:
     · un TURNO del catalogo  -> desplegable + cuantas personas
     · un HORARIO LIBRE       -> dos horas + cuantas personas
   y **todas suman**. «Dos de apertura mas uno de refuerzo a las seis» son tres
   a las seis, que es lo que cualquiera espera.

   Los tramos que son CALCO de los turnos no se muestran: son restos de la
   migracion de octubre y mostrarlos seria ensenar dos veces lo mismo. Ver
   `tramosSonCopiaDeTurnos()`. */
function pintarNecesidadPorTurno(box, ps, ts) {
  ps.forEach(puesto => {
    const usados = ts.filter(t => necesita(S.cobDia, puesto, t.id) > 0);
    const calco  = !S.sinTablaTramos && tramosSonCopiaDeTurnos(S.cobDia, puesto);
    const libres = (S.sinTablaTramos || calco) ? [] : tramosDe(S.cobDia, puesto);

    /* ---- UNA SOLA FORMA DE LINEA: HORAS ----
       Pedro, msg 4569: «dejemos todo en hora sin turnos... por el momento».

       Antes habia dos clases de linea: una atada a un turno con nombre
       —elegido en un desplegable— y otra de horas sueltas. El desplegable
       hacia leer la pantalla como si hubiera que elegir una plantilla
       (msg 4561), cuando lo que el quiere decir es «el lunes necesito 5
       garzones entre 12:00 y 16:00».

       Ahora TODAS las lineas se ven igual: desde, hasta y cuanta gente.
       Por debajo siguen siendo dos cosas distintas, y eso es a proposito: la
       linea que venia de un turno sigue guardada en `dotacion` con su
       `turno_id`, que es lo que usa el repartidor automatico. Solo se despega
       —y pasa a ser horas sueltas— si el usuario CAMBIA sus horas, porque
       mover «08:00» a «09:00» aqui no puede mover la Apertura de todo el local
       sin avisar.

       Ese «por el momento» es la razon de no borrar nada: volver atras es
       revertir este bloque, no rehacer la dotacion. */
    const filaTurno = (t) => `<tr data-t="${t.id}">
        <td><input class="hora nth" value="${hhmm(t.inicio)}" inputmode="numeric" maxlength="5"
            aria-label="desde qué hora"></td>
        <td class="gui">–</td>
        <td><input class="hora nth" value="${hhmm(t.fin)}" inputmode="numeric" maxlength="5"
            aria-label="hasta qué hora"></td>
        <td><input class="n ntn" type="number" min="0" max="99"
            value="${necesita(S.cobDia, puesto, t.id)}" aria-label="cuántas personas"></td>
        <td><button type="button" class="act ntx" title="Quitar esta línea">quitar</button></td>
      </tr>`;

    const filaLibre = (t, i) => `<tr data-i="${i}">
        <td><input class="hora trh" value="${hhmm(t.desde)}" inputmode="numeric" maxlength="5" aria-label="desde"></td>
        <td class="gui">–</td>
        <td><input class="hora trh" value="${hhmm(t.hasta)}" inputmode="numeric" maxlength="5" aria-label="hasta"></td>
        <td><input class="n trn" type="number" min="0" max="99" value="${Number(t.cantidad)}" aria-label="cuántas personas"></td>
        <td><button type="button" class="act trx" title="Quitar esta línea">quitar</button></td>
      </tr>`;

    const filas = usados.map(filaTurno).join('') + libres.map(filaLibre).join('');
    const q = puestoCat(puesto);
    const btnMas = `<button type="button" class="act ntmas">+ línea</button>`;
    const filaMas = `<tr class="ntmasfila"><td colspan="5">${btnMas}</td></tr>`;
    const hay = usados.length || libres.length;
    const caja = el('div', 'trpuesto', `
      <div class="trtit"><b class="pnom"${q ? ' title="Pincha para cambiarle el nombre"'
        : ' data-fijo="1" title="Este puesto no está en el catálogo, así que no se puede renombrar desde aquí"'
        }>${esc(puesto)}</b>${q ? `<button type="button" class="pquit"
          title="Sacar «${esc(puesto)}» de tu lista de puestos">quitar puesto</button>` : ''}</div>
      ${hay ? `<table class="tramos nt"><tbody>${filas}${filaMas}</tbody></table>`
        : `<p class="hint">Este día no se pide a nadie de este puesto.</p>${btnMas}`}
      ${hay ? barrasNecesidad(S.cobDia, puesto) : ''}`);
    box.appendChild(caja);

    /* Renombrar el puesto DESDE AQUI (Pedro, msg 4165). Lo propaga la base con
       `renombrar_puesto`, que toca de una vez el catalogo, el rol de la gente,
       los turnos ya asignados y la dotacion. */
    /* Atajo para sacar el puesto desde aqui. Pedro, 07-10 (msg 4809): se topo
       con el bloque de «Mesera» vacio —«si no tengo meseros?»— y no tenia que
       hacer con el sin irse a otra pantalla. Llama a la MISMA funcion que el
       dialogo de «Puestos del local», con su mismo aviso. */
    const btnQuit = caja.querySelector('.pquit');
    if (btnQuit && q) btnQuit.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      try { await quitarPuestoDelCatalogo(q); }
      catch (e) { error(e); }
    });

    const nom = caja.querySelector('.pnom');
    if (q) nom.addEventListener('click', () => {
      if (caja.querySelector('.pedit')) return;
      const inp = el('input', 'pedit');
      inp.value = puesto; inp.maxLength = 40;
      nom.replaceWith(inp); inp.focus(); inp.select();
      let listo = false;
      const cerrar = (guardar) => {
        if (listo) return; listo = true;
        const v = inp.value.trim();
        if (!guardar || !v || v === puesto) { pintarCobertura(); return; }
        recordarRen(q.id, puesto, v);
        DATOS.renombrarPuesto(q.id, v).then(refrescar).catch(e => {
          S.histDot.pop(); pintarDeshacerDot();   // no se renombro: el paso atras sobra
          error(e); pintarCobertura();
        });
      };
      inp.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') { ev.preventDefault(); cerrar(true); }
        if (ev.key === 'Escape') { ev.preventDefault(); cerrar(false); }
      });
      inp.addEventListener('blur', () => cerrar(true));
    });

    /* ---- las lineas de TURNO ---- */
    const poner = async (turnoId, v, que) => {
      recordarDot(que);
      const pf = S.dotacion[S.cobDia] = S.dotacion[S.cobDia] || {};
      (pf[puesto] = pf[puesto] || {})[turnoId] = v;
      try {
        await DATOS.guardarDotacion(S.local.id, S.cobDia, puesto, turnoId, v);
        /* ⚠️ Solo se borran los tramos que son CALCO de los turnos.
           Si se dejan, al cambiar este numero dejan de calzar, `necesitaHora()`
           empieza a sumarlos y la cuenta se DUPLICA sin que nadie haya tocado
           un horario libre. Este es el unico momento en que estorban.
           Los escritos a mano no se tocan: ahora conviven a proposito. */
        if (!S.sinTablaTramos && tramosSonCopiaDeTurnos(S.cobDia, puesto))
          await DATOS.guardarTramos(S.local.id, S.cobDia, puesto, []);
        await refrescar();
      } catch (e) { S.histDot.pop(); pintarDeshacerDot(); error(e); }
    };

    caja.querySelectorAll('.ntn').forEach(inp => {
      let tm = null;
      inp.addEventListener('input', () => {
        clearTimeout(tm);
        tm = setTimeout(() => poner(inp.closest('tr').dataset.t,
                                    Number(inp.value) || 0, 'cambiar un número'), 600);
      });
    });

    caja.querySelectorAll('.ntx').forEach(b => b.addEventListener('click', () =>
      poner(b.closest('tr').dataset.t, 0, 'quitar una línea')));

    /* ---- las lineas de HORARIO LIBRE ---- */
    const leerLibres = () => [...caja.querySelectorAll('tbody tr')]
      .filter(tr => tr.querySelector('.trh'))
      .map(tr => {
        const t = tramoDelDia(deHora(tr.querySelector('.trh').value),
                              deHora(tr.querySelectorAll('.trh')[1].value), franja().h0);
        return { desde: t.desde, hasta: t.hasta,
                 cantidad: Number(tr.querySelector('.trn').value) || 0 };
      });

    const guardarLibres = async (lista, que) => {
      try {
        recordarTr(que);
        await DATOS.guardarTramos(S.local.id, S.cobDia, puesto, normalizarTramos(lista));
        await refrescar();
        verSub('nec');
      } catch (e) {
        S.histDot.pop(); pintarDeshacerDot();
        const m = $('#msgDot');
        if (m) { m.textContent = e.message; m.className = 'msg bad'; }
      }
    };

    caja.querySelectorAll('.trh, .trn').forEach(inp => {
      let tm = null;
      inp.addEventListener('input', () => {
        clearTimeout(tm);
        tm = setTimeout(() => guardarLibres(leerLibres(), 'cambiar un horario libre'), 700);
      });
    });

    caja.querySelectorAll('.trx').forEach(b => b.addEventListener('click', () => {
      const i = Number(b.closest('tr').dataset.i);
      guardarLibres(leerLibres().filter((_, k) => k !== i), 'quitar una línea');
    }));

    /* ---- cambiar las HORAS de una linea que venia de un turno ----
       Se despega del turno y pasa a ser horas sueltas, conservando su numero.
       Es la misma operacion que el antiguo «pasar a horario libre» del
       desplegable, pero ahora se dispara al editar la hora en vez de al elegir
       una opcion escondida al final de una lista. */
    caja.querySelectorAll('.nth').forEach(inp => {
      let tm = null;
      inp.addEventListener('input', () => {
        clearTimeout(tm);
        tm = setTimeout(async () => {
          const tr = inp.closest('tr'), tid = tr.dataset.t;
          const hs = tr.querySelectorAll('.nth');
          const t = tramoDelDia(deHora(hs[0].value), deHora(hs[1].value), franja().h0);
          if (!(t.hasta > t.desde)) return;      // a medio escribir: no se guarda nada
          const v = Number(tr.querySelector('.ntn').value) || 1;
          recordarDot('cambiar las horas de una línea');
          try {
            await DATOS.guardarDotacion(S.local.id, S.cobDia, puesto, tid, 0);
            const base = (S.sinTablaTramos || tramosSonCopiaDeTurnos(S.cobDia, puesto))
              ? [] : tramosDe(S.cobDia, puesto).slice();
            base.push({ desde: t.desde, hasta: t.hasta, cantidad: v });
            await DATOS.guardarTramos(S.local.id, S.cobDia, puesto, normalizarTramos(base));
            await refrescar(); verSub('nec');
          } catch (e) { S.histDot.pop(); pintarDeshacerDot(); error(e); }
        }, 700);
      });
    });

    /* ---- «+ linea» ---- */
    const mas = caja.querySelector('.ntmas');
    if (mas) mas.addEventListener('click', () => {
      /* Toda linea nueva nace como HORAS. Antes buscaba primero un turno sin
         usar y lo enchufaba, que era justo lo que hacia sentir la pantalla
         como un catalogo cerrado. */
      if (S.sinTablaTramos) {
        const m = $('#msgDot');
        if (m) { m.textContent = 'Ya usaste todos los turnos de este puesto.'; m.className = 'msg bad'; }
        return;
      }
      const h = franja();
      const l = leerLibres();
      const ult = l[l.length - 1];
      const desde = ult && ult.hasta != null ? Number(ult.hasta) : h.h0;
      if (desde >= h.h1) {
        const m = $('#msgDot');
        /* El aviso iba SOLO al pie de la tarjeta, lejos del boton que se acaba
           de apretar. Desde arriba, apretar «+ linea» y que no pase nada se ve
           identico a un boton roto — y asi lo reporto Pedro (msg 4793). Un
           «no» que no se lee es un «no funciona».

           Se dice ademas AL LADO del boton, que es donde esta mirando. */
        const razon = 'Ya hay líneas hasta el cierre (' + hhmm(h.h1)
                    + '). Cambia una hora de término, o quita una, para agregar otra.';
        if (m) { m.textContent = razon; m.className = 'msg bad'; }
        const fila = mas.closest('td');
        if (fila && !fila.querySelector('.ntmasno')) {
          const aviso = el('span', 'ntmasno', esc(razon));
          fila.appendChild(aviso);
          setTimeout(() => aviso.remove(), 6000);
        }
        return;
      }
      l.push({ desde, hasta: Math.min(desde + 4, h.h1), cantidad: 1 });
      guardarLibres(l, 'agregar una línea');
    });
  });

  /* Aqui hubo un boton de crear turno, y despues dejo de haberlo.
     El 05-10 Pedro lo pidio arriba a la derecha de esta tarjeta (msg 4547),
     porque bajar hasta el final para crear no tiene sentido. El 07-10 lo mando
     fuera de esta pantalla entera (msg 4751): crear una PLANTILLA de turno no
     es lo mismo que decir cuanta gente necesitas, y tenerlos juntos confundia.
     Vive ahora en su propia pestaña, «Turnos». */
}

/* ================= COBERTURA Y COSTO ================= */
function pintarCobertura() {
  const f = fechas();
  const ts = S.turnos.slice().sort((a,b) => Number(a.inicio) - Number(b.inicio));
  const ps = puestos();

  /* ---- arriba: una línea por día y turno, legible sin interpretar colores ---- */
  const cont = $('#cobertura'); cont.innerHTML = '';
  if (!ts.length || !ps.length) {
    cont.innerHTML = '<p class="vacio">Agrega turnos y gente al equipo para ver esto.</p>';
  }
  let faltanTot = 0, sobranTot = 0, hayDotacion = false;
  const diasVista = S.modo === 'dia' ? [iso(S.dia)] : f;

  diasVista.forEach(fe => {
    const d = (new Date(fe + 'T00:00:00').getDay() + 6) % 7;
    /* Las casillas de turno dicen un HECHO —cuánta gente hay— y ya no un
       veredicto. El veredicto bajó a la línea de abajo y se calcula POR HORA.

       Por qué: con turnos que se pisan, juzgar turno por turno miente. Lo
       encontró Pedro (msg 3772): quien trabaja 08:00–16:30 contaba como
       cobertura de la Tarde 13:00–21:30, así que con UNA persona los dos
       turnos salían cubiertos y a las 17:00 no había nadie. */
    /* 07-10: ESTO ERA UNA COLUMNA POR TURNO —«Apertura · 9 personas»— y Pedro
       lo mando cambiar (msg 4784, «si, la tira por horas»). Tenia dos
       problemas, y el segundo lo destapo el solo:

       1. La tarjeta YA DECIA en su texto que va por hora, y arriba enseñaba
          turnos. Decia una cosa y mostraba otra.
       2. Entre las columnas le salia **«Apertura (copia)»**: el nombre que
          queda al copiar una plantilla. Como columna no significa nada, y
          ocupaba el mismo lugar que Apertura.

       Y contar por turno miente cuando se pisan: Apertura 08:00–16:30 y
       almuerzo 11:00–15:30 dan «9 y 9» y parece cubierto, cuando a las 14:00
       puede haber 3. Es el mismo defecto que ya habia cazado Pedro (msg 3772).

       Se reusan las clases `.hncel` de la vista de Dia: misma tira, mismo
       lenguaje visual, cero CSS nuevo. */
    const base = franja();
    const porHora = [];
    for (let h = base.h0; h < base.h1; h++) {
      let hay = 0, req = 0;
      ps.forEach(pu => { hay += asignadosHora(fe, pu, h); req += necesitaHora(String(d), pu, h); });
      porHora.push({ h, hay, req });
    }
    /* Un dia sin gente Y sin necesidad se dice en una linea, no en diecisiete
       casillas de «0/0». Con la semana a medio llenar quedaban seis filas
       identicas de ceros ahogando al unico dia que tenia algo: el ruido movia
       el ojo justo al lado del dato. Mismo criterio que ya se aplico a la lista
       de huecos cuando no hay nadie asignado. */
    const vacio = porHora.every(x => !x.hay && !x.req);
    const celdas = vacio ? '' : porHora.map(x => {
      const cls = x.hay < x.req ? 'falta' : (x.req && x.hay > x.req ? 'sobra' : 'justo');
      return `<div class="hncel ${cls}" title="${hhmm(x.h)}–${hhmm(x.h + 1)}: hay ${x.hay}`
        + `, se necesita${x.req === 1 ? '' : 'n'} ${x.req}">`
        + `<span class="hnh">${hhmm(x.h).slice(0,2)}</span><b>${x.hay}</b><i>/${x.req}</i></div>`;
    }).join('');

    // Los huecos del día, por hora y por puesto, dichos en palabras.
    const trozos = [];
    let faltaDia = 0;
    ps.forEach(pu => {
      let act = null;
      for (let h = base.h0; h < base.h1; h++) {
        const req = necesitaHora(String(d), pu, h);
        if (req) hayDotacion = true;
        const falta = req - asignadosHora(fe, pu, h);
        if (falta > 0) {
          faltanTot += falta; faltaDia += falta;
          if (act && act.falta === falta && act.hasta === h) act.hasta = h + 1;
          else { act = { pu, falta, desde: h, hasta: h + 1 }; trozos.push(act); }
        } else { act = null; if (req) sobranTot += Math.max(0, -falta); }
      }
    });
    /* Un dia SIN NADIE asignado no se enumera. Pedro lo vio en la pagina
       publicada (msg 4064): de martes a sabado no habia nadie, asi que el panel
       escupia los ocho huecos de cada dia, identicos cinco veces. Cuando falta
       todo, listar todo es ruido y no ayuda a decidir nada.

       Es ademas lo que hacen los dos que miramos: Skello no escribe la falta,
       la dibuja como curva por hora; 7shifts la resume arriba en dos numeros y
       deja el detalle a pedido. Ninguno de los dos escribe la lista entera.
       El resumen de la semana y la curva quedaron para despues (msg 4068). */
    /* «Nadie asignado» se comprueba contra las filas del dia, NO contra la
       grilla de horas. `franja()` solo abarca del primer turno del catalogo al
       ultimo, y una fila puede llevar horario propio fuera de ese rango: contra
       la grilla, esa persona no existe y la frase mentiria. */
    const nadie = !Object.values(S.asign).flat()
      .some(a => a.fecha === fe && a.inicio != null);
    const dice = !trozos.length ? ''
      : nadie
        ? `<b>Nadie asignado</b> — falta el día entero, ${faltaDia} persona${faltaDia === 1 ? '' : 's'}-hora`
        : trozos.map(x => `falta${x.falta === 1 ? '' : 'n'} <b>${x.falta} ${esc(x.pu.toLowerCase())}</b>`
            + ` de ${hhmm(x.desde)} a ${hhmm(x.hasta)}`).join(' · ');
    cont.appendChild(el('div','cobfila', `<div class="covday">${DIAS[d]} <span class="num">${ddmm(fe)}</span></div>
      ` + (vacio
            ? `<p class="cobnada">sin gente ni necesidad</p>`
            : `<div class="hnfila" style="grid-template-columns:repeat(${porHora.length},1fr)">${celdas}</div>`)
      + (dice ? `<p class="cobfalta">${dice}</p>` : '')));
  });

  /* ---- abajo: cuánta necesito, un día a la vez, por puesto y por turno ---- */
  const tabs = $('#cobTabs'); tabs.innerHTML = '';
  DIAS.forEach((dn, i) => {
    const b = el('button','act' + (String(i) === S.cobDia ? ' primary' : ''), dn);
    b.addEventListener('click', () => { S.cobDia = String(i); pintarCobertura(); });
    tabs.appendChild(b);
  });

  const box = $('#needDia'); box.innerHTML = '';
  pintarNecesidadBox(box, ps, ts);

  /* ---- costo sobre venta ---- */
  const obj = Number(S.local.objetivo_pct) || 30;
  const oi = $('#objetivoPct');
  if (oi && document.activeElement !== oi) oi.value = obj;
  let costoT = 0, ventaT = 0;
  $('#cobDias').innerHTML = f.map((fe, d) => {
    const costo = S.personas.reduce((s,p) => {
      return s + horasDia(p.id, fe) * (p.valor_hora||0); }, 0);
    const venta = (S.dias[fe]||{}).venta || 0;
    costoT += costo; ventaT += venta;
    const pct = venta ? (costo/venta)*100 : NaN;
    const mal = isFinite(pct) && pct > obj;
    return `<li><div class="prow"><span class="pname">${DIAS[d]} <span class="num">${ddmm(fe)}</span></span>
      <span class="pstat">${clp(costo)} de ${clp(venta)} · <b style="color:${mal?'var(--bad)':'var(--ok)'}">${pfmt(pct)}</b></span></div>
      <div class="bar"><i class="${mal?'over':''}" style="width:${isFinite(pct)?Math.min(100,pct):0}%"></i></div></li>`;
  }).join('');

  const pctT = ventaT ? (costoT/ventaT)*100 : NaN;
  $('#cobKpis').innerHTML = [
    { k:'Costo de personal', v:clp(costoT), n:'la semana completa' },
    { k:'Sobre la venta', v:pfmt(pctT), n:`tu objetivo es ${obj} %`,
      c: isFinite(pctT) ? (pctT > obj ? 'alert' : 'good') : '' },
    // La unidad cambió con la cuenta: ya no son «turnos», son horas-persona.
    // Decir «turnos» sobre un número que se calcula por hora sería mentir en la
    // etiqueta, que es la peor forma de mentir en una pantalla.
    { k:'Horas-persona que faltan', v: hayDotacion ? faltanTot : '—', n:'sumando cada hora en que falta alguien', c: faltanTot ? 'alert' : '' },
    { k:'Horas-persona de sobra', v: hayDotacion ? sobranTot : '—', n:'sumando cada hora con más gente de la pedida' },
  ].map(x => `<div class="kpi"><div class="k">${x.k}</div><div class="v ${x.c||''}">${x.v}</div><div class="n">${x.n}</div></div>`).join('');
}

/* ================= PROPINAS ================= */
// Reparte al peso: el resto de la división se asigna de a $1 por mayor fracción.
function repartir(pool, pesos) {
  const total = pesos.reduce((a,b)=>a+b,0);
  if (!total || !pool) return pesos.map(()=>0);
  const monto = Math.round(pool);
  const exacto = pesos.map(w => monto*w/total);
  const piso = exacto.map(x => Math.floor(x));
  let resto = monto - piso.reduce((a,b)=>a+b,0);
  exacto.map((v,i)=>({i, f:v-Math.floor(v)})).sort((a,b)=>b.f-a.f)
        .forEach(o => { if (resto > 0) { piso[o.i]++; resto--; } });
  return piso;
}

function repartoDia(fecha) {
  // Por las horas PAGADAS, no las planificadas: es lo que hace propina_de en
  // la base. Si acá se usaran las del papel, al trabajador le aparecería un
  // monto y al jefe otro — y la propina es justo donde eso no se perdona.
  const pesos = S.personas.map(p => {
    return horasPagadasDia(p.id, fecha) * (Number(p.factor_propina)||0);
  });
  const d = S.dias[fecha] || {};
  const pool = (d.propina_efectivo||0) + (d.propina_tarjeta||0);
  const base = pesos.reduce((a,b)=>a+b,0);
  return { montos: repartir(pool, pesos), pool, base, sinRepartir: base ? 0 : pool };
}

function repartoSemana() {
  const porPersona = S.personas.map(()=>0); const dias = [];
  let total = 0, sinRepartir = 0;
  fechas().forEach(fe => {
    const r = repartoDia(fe); dias.push(r);
    r.montos.forEach((m,i) => porPersona[i] += m);
    total += r.montos.reduce((a,b)=>a+b,0); sinRepartir += r.sinRepartir;
  });
  return { dias, porPersona, total, sinRepartir };
}

function pintarPropinas() {
  const f = fechas();
  const box = $('#propDias'); box.innerHTML = '';
  f.forEach((fe,i) => {
    const d = S.dias[fe] || {};
    const w = el('div','diaplata', `
      <div class="diaplata-h">${DIAS[i]} <span class="num">${ddmm(fe)}</span></div>
      <div class="fld"><label>Venta</label><input class="n" type="text" inputmode="numeric" value="${aPlata(d.venta)}" data-c="venta"></div>
      <div class="fld"><label>Propina efectivo</label><input class="n" type="text" inputmode="numeric" value="${aPlata(d.propina_efectivo)}" data-c="propina_efectivo"></div>
      <div class="fld"><label>Propina tarjeta</label><input class="n" type="text" inputmode="numeric" value="${aPlata(d.propina_tarjeta)}" data-c="propina_tarjeta"></div>`);
    box.appendChild(w);
    let t = null;
    w.querySelectorAll('input[data-c]').forEach(inp => {
      inp.addEventListener('input', () => {
        const v = dePlata(inp.value);
        inp.value = aPlata(v);
        try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) {}
        clearTimeout(t);
        t = setTimeout(async () => {
          try { S.dias[fe] = await DATOS.guardarDia(S.local.id, fe, { [inp.dataset.c]: dePlata(inp.value) });
                pintarPropinas(); pintarCobertura(); pintarResumenSemana(); }
          catch (e) { error(e); }
        }, 700);
      });
    });
  });

  const rep = repartoSemana();
  const cols = ['Persona','Factor', ...DIAS, 'Total'];
  $('#propCab').innerHTML = cols.map((c,i) => `<th${i===cols.length-1?' class="fin"':''}>${c}</th>`).join('');
  const cuerpo = $('#propCuerpo'); cuerpo.innerHTML = '';
  S.personas.forEach((p,i) => {
    cuerpo.innerHTML += `<tr><th class="r" scope="row">${esc(p.nombre)}<span class="rol">${esc(p.rol||'')}</span></th>` +
      `<td>${hfmt(p.factor_propina)}</td>` +
      rep.dias.map(r => `<td>${r.montos[i] ? clp(r.montos[i]) : '<span style="color:var(--fg-faint)">—</span>'}</td>`).join('') +
      `<td class="fin"><b>${clp(rep.porPersona[i])}</b></td></tr>`;
  });
  $('#propPie').innerHTML = '<tr class="sumrow"><th>Propina del día</th><td></td>' +
    rep.dias.map(r => `<td${r.sinRepartir?' style="color:var(--bad)"':''}>${clp(r.pool)}</td>`).join('') +
    `<td>${clp(rep.total)}</td></tr>`;

  const ventaT = f.reduce((s,fe)=> s + ((S.dias[fe]||{}).venta||0), 0);
  const sugerido = ventaT * 0.10;
  const captura = sugerido ? (rep.total/sugerido)*100 : NaN;
  const kpis = [
    { k:'Propina de la semana', v:clp(rep.total), n:'repartida entre el equipo' },
    { k:'Si todos dejaran el 10 %', v:clp(sugerido), n:'sobre la venta cargada' },
    { k:'Se está capturando', v:pfmt(captura), n:'de la propina sugerida',
      c: isFinite(captura) ? (captura >= 85 ? 'good' : 'alert') : '' },
  ];
  if (rep.sinRepartir) kpis.push({ k:'Sin repartir', v:clp(rep.sinRepartir), n:'hay propina y nadie con factor ese día', c:'alert' });
  $('#propKpis').innerHTML = kpis.map(x =>
    `<div class="kpi"><div class="k">${x.k}</div><div class="v ${x.c||''}">${x.v}</div><div class="n">${x.n}</div></div>`).join('');
}

/* ================= TURNOS ABIERTOS ================= */

/* ================= CONFIRMACIONES ================= */
const marcaDe = (pid, f) => S.marcas[pid + '|' + f] || {};
// La marca de UN turno concreto, que es lo que manda desde el reloj control.
const marcaAsig = a => (a && S.marcas['a:' + a.id]) || {};
const horaDe = ts => { if (!ts) return null; const d = new Date(ts);
  return d.getHours() + d.getMinutes()/60; };
// Horas realmente trabajadas en un turno: de la entrada a la salida, menos la
// colación. Si no están las dos marcas, no hay horas reales que mostrar.
const horasReales = a => {
  const m = marcaAsig(a);
  if (!m.entrada || !m.salida) return null;
  const h = (new Date(m.salida) - new Date(m.entrada)) / 3600000 - Number(a.colacion || 0);
  return Math.max(h, 0);
};
// Lo que se paga: lo que el jefe fijó a mano, o la regla del local.
const horasPagadasDe = a => {
  if (a.horas_pagadas != null) return Number(a.horas_pagadas);
  const r = horasReales(a);
  return (S.local && S.local.pagar_marcado && r != null) ? r : horasAsig(a);
};
const horaLlegada = m => {
  if (!m || !m.hora_llego) return null;
  const d = new Date(m.hora_llego);
  return d.getHours() + d.getMinutes()/60;
};

/* Planificado contra real.
   OJO: esto NO son "horas trabajadas" para liquidar sueldos — eso seria el
   registro legal de asistencia y necesita certificacion de la DT. Esto es
   cobertura y puntualidad: cuanto de lo que planifique tiene a alguien que
   dijo que llego, y a que hora llego respecto de su turno. */
function planContraReal() {
  const f = fechas();
  return S.personas.map(p => {
    let plan = 0, conLlegada = 0, atrasoMin = 0, atrasos = 0, sinMarca = 0;
    f.forEach(fe => {
      const ts = turnosDe(p.id, fe); if (!ts.length) return;
      const t = ts[0];                       // la puntualidad se mide contra el PRIMER bloque
      plan += horasDia(p.id, fe);
      const m = marcaDe(p.id, fe);
      if (m.llego === true) {
        conLlegada += horasDia(p.id, fe);
        const h = horaLlegada(m);
        if (h !== null) {
          const dif = Math.round((h - Number(t.inicio)) * 60);
          if (dif > 5) { atrasoMin += dif; atrasos++; }
        }
      } else sinMarca += horasDia(p.id, fe);
    });
    return { p, plan, conLlegada, sinMarca, atrasoMin, atrasos };
  });
}

function pintarConf() {
  const f = fechas();
  $('#confLeyenda').innerHTML =
    '<span class="mk conf"><b>✓</b><em>confirmó</em></span>' +
    '<span class="mk llego"><b>✓✓</b><em>llegó</em></span>' +
    '<span class="mk nopuede"><b>✕</b><em>no puede</em></span>' +
    '<span class="mk nada"><b>·</b><em>sin responder</em></span>';
  $('#confCab').innerHTML = '<th>Persona</th>' + DIAS.map((d,i) => `<th>${d}<span class="num">${ddmm(f[i])}</span></th>`).join('');
  const cuerpo = $('#confCuerpo'); cuerpo.innerHTML = '';
  const avisos = [];

  S.personas.forEach(p => {
    cuerpo.innerHTML += `<tr><th class="r" scope="row">${esc(p.nombre)}</th>` + f.map((fe,i) => {
      const ts = turnosDe(p.id, fe);
      if (!ts.length) return '<td><span class="mk"><b class="esp">libre</b></span></td>';
      const m = marcaDe(p.id, fe);
      // los dos casos que al dueño le interesa ver de inmediato
      if (m.llego === true && m.confirmo === false)
        avisos.push({ n:'bad', t:`${p.nombre}: dijo «no puedo» el ${DIAS[i]} y llegó igual` });
      else if (m.llego === true && m.confirmo !== true)
        avisos.push({ n:'warn', t:`${p.nombre}: llegó el ${DIAS[i]} sin haber confirmado` });
      // Un solo estado por celda, el que de verdad importa, con el doble check
      // de WhatsApp: todos saben que ✓ es "dijo que sí" y ✓✓ es "pasó de verdad".
      let est;
      if (m.llego === true && m.confirmo === false) est = { c:'alerta', i:'✓✓', t:'llegó igual' };
      else if (m.llego === true)                    est = { c:'llego',  i:'✓✓', t:'llegó' };
      else if (m.confirmo === true)                 est = { c:'conf',   i:'✓',  t:'confirmó' };
      else if (m.confirmo === false)                est = { c:'nopuede',i:'✕',  t:'no puede' };
      else                                          est = { c:'nada',   i:'·',  t:'sin responder' };
      const porJefe = m.marcado_por === 'jefe' ? '<i class="porjefe" title="lo marcaste tú">tú</i>' : '';
      return `<td><span class="mk ${est.c}" data-p="${p.id}" data-f="${fe}" role="button" tabindex="0"
               title="Clic para marcar por esta persona"><b>${est.i}</b><em>${est.t}</em>${porJefe}</span></td>`;
    }).join('') + '</tr>';
  });

  // el jefe puede marcar por alguien: un clic recorre confirmo -> llego -> limpiar
  cuerpo.querySelectorAll('.mk[data-p]').forEach(celda => {
    const accion = async () => {
      const pid = celda.dataset.p, fe = celda.dataset.f, m = marcaDe(pid, fe);
      let campo, valor;
      if (m.confirmo !== true) { campo = 'confirmo'; valor = true; }
      else if (m.llego !== true) { campo = 'llego'; valor = true; }
      else { campo = 'confirmo'; valor = null; }
      try {
        S.marcas[pid + '|' + fe] = await DATOS.marcarComoJefe(pid, fe, campo, valor);
        pintarConf();
      } catch (e) { error(e); }
    };
    celda.addEventListener('click', accion);
    celda.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); accion(); } });
  });

  // resumen planificado contra real
  const pcr = planContraReal();
  const plan = pcr.reduce((s,x) => s + x.plan, 0);
  const conf = pcr.reduce((s,x) => s + x.conLlegada, 0);
  const sinM = pcr.reduce((s,x) => s + x.sinMarca, 0);
  const atr  = pcr.reduce((s,x) => s + x.atrasoMin, 0);
  const pct  = plan ? (conf/plan)*100 : NaN;
  $('#pcrKpis').innerHTML = [
    { k:'Horas planificadas', v:hfmt(plan)+' h', n:'lo que armaste esta semana' },
    { k:'Con alguien que llegó', v:hfmt(conf)+' h', n:pfmt(pct)+' de lo planificado',
      c: isFinite(pct) ? (pct >= 80 ? 'good' : '') : '' },
    { k:'Sin marca de llegada', v:hfmt(sinM)+' h', n:'nadie dijo que llegó', c: sinM ? 'alert' : '' },
    { k:'Atrasos', v:atr ? minFmt(atr) : '—', n:'acumulados sobre la hora de entrada' },
  ].map(x => `<div class="kpi"><div class="k">${x.k}</div><div class="v ${x.c||''}">${x.v}</div><div class="n">${x.n}</div></div>`).join('');

  $('#pcrDetalle').innerHTML = pcr.filter(x => x.plan > 0).map(x =>
    `<li><div class="prow"><span class="pname">${esc(x.p.nombre)}</span>
       <span class="pstat">${hfmt(x.conLlegada)} de ${hfmt(x.plan)} h${x.atrasos ? ' · '+minFmt(x.atrasoMin)+' tarde' : ''}</span></div>
     <div class="bar"><i style="width:${x.plan ? Math.min(100,(x.conLlegada/x.plan)*100) : 0}%"></i></div></li>`).join('')
    || '<li class="vacio">Todavía nadie ha marcado que llegó.</li>';

  $('#confAlertas').innerHTML = avisos.length
    ? '<div class="flags">' + avisos.map(a => `<span class="flag ${a.n}">${esc(a.t)}</span>`).join('') + '</div>'
    : '<p class="hint" style="margin:0">Sin novedades: nadie llegó sin confirmar.</p>';
}

/* ================= LINKS ================= */
const linkDe = p => location.origin + location.pathname + '#' + p.token;

function pintarLinks() {
  const box = $('#linkLista'); box.innerHTML = '';
  if (!S.personas.length) box.innerHTML = '<p class="vacio">Agrega gente al equipo y acá aparecen sus links.</p>';
  S.personas.forEach(p => {
    const url = linkDe(p);
    const row = el('div','linkrow', `<div><b>${esc(p.nombre)}</b><code>${esc(url)}</code></div><button class="mini">Copiar</button>`);
    box.appendChild(row);
    const b = row.querySelector('button');
    b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(url); b.textContent = 'Copiado'; }
      catch (e) { b.textContent = 'No se pudo'; }
      setTimeout(() => b.textContent = 'Copiar', 2000);
    });
  });

  const f = fechas();
  const rep = repartoSemana();
  const libres = S.abiertos.filter(a => !a.tomado_por).length;
  $('#salidaPub').value = S.personas.map((p,i) => {
    const lineas = f.map((fe,d) => {
      const ts = turnosDe(p.id, fe), au = ausenciaDe(p.id, fe);
      return `${DIAS[d]} ${ddmm(fe)}: ` + (ts.length
        ? ts.map(a => { const t = a.turno_id ? turnoDe(a.turno_id) : null;
            return (t ? t.nombre + ' ' : '') + hhmm(a.inicio) + '–' + hhmm(a.fin); }).join(' y ')
        : (AUSENCIAS[(au&&au.ausencia)||'L']||'libre').toLowerCase());
    });
    const horas = analizar(p).horas;
    return `Hola ${p.nombre.split(' ')[0]}, tu semana del ${ddmm(f[0])} al ${ddmm(f[6])}:\n` +
      lineas.join('\n') + `\nTotal: ${hfmt(horas)} horas.` +
      (rep.porPersona[i] ? `\nPropina que te toca: ${clp(rep.porPersona[i])}.` : '') +
      (libres ? `\nHay ${libres} ${libres===1?'turno':'turnos'} disponibles para tomar.` : '') +
      `\nConfirma y marca tu llegada acá: ${linkDe(p)}`;
  }).join('\n\n———\n\n');
}

/* ---------- Control horario: previsto · marcado · se paga ----------
   Es la pantalla de la Badgeuse de Skello. Lo importante es que NO elige sola
   entre lo planificado y lo real: muestra los dos y deja que el jefe decida
   qué se paga, viendo contra qué decide. Ese era justo el problema que Pedro
   planteó con la propina: que el número no salga de la nada. */
function pintarReloj() {
  const f = fechas();
  if (!S.relojDia || !f.includes(S.relojDia)) S.relojDia = f.includes(iso(new Date())) ? iso(new Date()) : f[0];
  const fe = S.relojDia;

  const tabs = $('#relojTabs'); if (!tabs) return;
  tabs.innerHTML = '';
  f.forEach((x,i) => {
    const b = el('button','act' + (x === fe ? ' primary' : ''), DIAS[i] + ' ' + ddmm(x).slice(0,5));
    b.addEventListener('click', () => { S.relojDia = x; pintarReloj(); });
    tabs.appendChild(b);
  });

  $('#relojCab').innerHTML = '<tr><th>Persona</th><th>Previsto</th><th>Marcado</th>'
    + '<th>Se paga</th><th>Marcar por él</th><th></th></tr>';

  const cuerpo = $('#relojCuerpo'); cuerpo.innerHTML = '';
  const filas = S.personas.flatMap(p => turnosDe(p.id, fe).map(a => ({ p, a })));
  if (!filas.length) {
    cuerpo.innerHTML = '<tr><td colspan="5" class="vacio">Nadie tiene turno este día.</td></tr>';
  }
  let totPrev = 0, totPaga = 0;
  filas.forEach(({ p, a }) => {
    const m = marcaAsig(a);
    const prev = horasAsig(a), real = horasReales(a), paga = horasPagadasDe(a);
    totPrev += prev; totPaga += paga;
    const hm = t => { const d = new Date(t); return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); };
    const marcado = m.entrada
      ? hm(m.entrada) + '–' + (m.salida ? hm(m.salida) : '<i>sin salir</i>')
        + (real != null ? ' · ' + hfmt(real) + ' h' : '')
      : '<span class="sinmarca">sin marca</span>';
    const difiere = real != null && Math.abs(real - prev) >= 0.08;
    const tr = el('tr', difiere ? 'difiere' : '', `
      <th class="r" scope="row">${esc(p.nombre)}<span class="rol">${esc(puestoDe(a,p)||'')}</span></th>
      <td class="n">${hhmm(a.inicio)}–${hhmm(a.fin)}<span class="num">${hfmt(prev)} h</span></td>
      <td class="n">${marcado}</td>
      <td><input type="number" class="n paga" step="0.25" min="0" max="24" value="${hfmt(paga).replace(',','.')}"
            data-a="${a.id}" aria-label="Horas que se pagan a ${esc(p.nombre)}"></td>
      <td class="marcar">
        ${!m.entrada ? `<button class="mini" data-marca="entrada" data-a="${a.id}" data-p="${p.id}" data-f="${fe}">Entrada</button>` : ''}
        ${m.entrada && !m.salida ? `<button class="mini" data-marca="salida" data-a="${a.id}" data-p="${p.id}" data-f="${fe}">Salida</button>` : ''}
        ${m.entrada ? `<button class="mini" data-marca="borrar" data-a="${a.id}" data-p="${p.id}" data-f="${fe}" title="Borrar las marcas de este turno">✕</button>` : ''}
      </td>
      <td>${a.horas_pagadas != null ? `<button class="mini" data-auto="${a.id}">Automático</button>` : ''}</td>`);
    cuerpo.appendChild(tr);
  });
  if (filas.length)
    cuerpo.innerHTML += `<tr class="piemes"><th class="r" scope="row">Total</th>
      <td class="n">${hfmt(totPrev)} h</td><td></td><td class="n">${hfmt(totPaga)} h</td><td></td><td></td></tr>`;

  cuerpo.querySelectorAll('input.paga').forEach(inp => {
    let t = null;
    inp.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        try { await DATOS.horasPagadas(inp.dataset.a, Number(inp.value) || 0); await refrescar(); }
        catch (e) { error(e); }
      }, 700);
    });
  });
  cuerpo.querySelectorAll('[data-auto]').forEach(b => b.addEventListener('click', async () => {
    try { await DATOS.horasPagadas(b.dataset.auto, null); await refrescar(); } catch (e) { error(e); }
  }));

  // El jefe marca POR la persona, sin abrir el link de nadie. No es solo para
  // probar la app: a alguien se le olvida marcar, se queda sin batería o marca
  // tarde, y queda registrado que lo marcó el jefe (marcado_por = 'jefe').
  cuerpo.querySelectorAll('[data-marca]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await marcarPorElJefe(b.dataset.marca, b.dataset.a, b.dataset.p, b.dataset.f); await refrescar(); }
    catch (e) { b.disabled = false; error(e); }
  }));

  const d = S.dias[fe];
  $('#relojEstado').innerHTML = d && d.cerrado_en
    ? `Cerrado · venta <b>${clp(d.venta)}</b>`
    : 'Sin cerrar. Al cerrar se te pide la venta del día.';
  $('#btnCerrarDia').textContent = d && d.cerrado_en ? 'Corregir la venta' : 'Cerrar el día';
}

// Marcar por alguien. La hora la pone el reloj del jefe, no el servidor, y por
// eso queda `marcado_por = 'jefe'`: una marca puesta por el jefe no puede
// hacerse pasar por una marca de la persona.
async function marcarPorElJefe(accion, asigId, personaId, fecha) {
  const a = filasDe(personaId, fecha).find(x => x.id === asigId); if (!a) return;
  const hoy = new Date(fecha + 'T00:00:00');
  const enHora = h => { const d = new Date(hoy); const hh = ((Number(h) % 24) + 24) % 24;
    d.setHours(Math.floor(hh), Math.round((hh - Math.floor(hh)) * 60), 0, 0);
    if (Number(h) >= 24) d.setDate(d.getDate() + 1);
    return d.toISOString(); };
  if (accion === 'borrar')
    return DATOS.marcarComoJefe(asigId, personaId, fecha, { entrada:null, salida:null, llego:null, hora_llego:null });
  if (accion === 'entrada')
    return DATOS.marcarComoJefe(asigId, personaId, fecha,
      { entrada: enHora(a.inicio), llego: true, hora_llego: enHora(a.inicio) });
  return DATOS.marcarComoJefe(asigId, personaId, fecha, { salida: enHora(a.fin) });
}

/* ================= PINTAR TODO ================= */
function pintarTodo() {
  $('#hLocal').textContent = S.local ? S.local.nombre : '';
  pintarPlan(); pintarEquipo(); pintarTurnos(); pintarPuestos(); pintarPropinas(); pintarConf(); pintarReloj(); pintarLinks();
  pintarDeshacer(); pintarDeshacerDot(); pintarDeshacerEq();
}

/* ================= VISTA DEL TRABAJADOR ================= */
const tokenDelLink = () => (location.hash || '').replace(/^#/, '').trim();

async function pintarTrabajador(token) {
  $('#vistaTrab').hidden = false; $('#vistaJefe').hidden = true;
  const lunes = iso(lunesDe(new Date()));
  let d = null;
  try { d = await DATOS.miSemana(token, lunes); }
  catch (e) { $('#tAviso').innerHTML = `<div class="avisoro">${esc(e.message)}</div>`; return; }

  if (!d) {
    $('#tNombre').textContent = 'Link no válido';
    $('#tSub').textContent = '';
    $('#tAviso').innerHTML = '<div class="avisoro">Este link no corresponde a nadie del equipo. Pídele a tu jefe que te mande el tuyo de nuevo.</div>';
    $('#tDias').innerHTML = ''; $('#tAbiertos').innerHTML = ''; $('#tPropina').innerHTML = ''; $('#tTotal').textContent = '';
    return;
  }

  $('#tNombre').textContent = d.nombre;
  $('#tSub').textContent = (d.rol ? d.rol + ' · ' : '') + 'semana del ' + ddmm(lunes);
  $('#tAviso').innerHTML = '';

  // propina de la semana: se calcula con lo que la base deja ver de su propia semana
  const dias = d.dias || [], props = d.propinas || [];
  let horasSem = 0;
  const horasDelDia = x => (x.turnos || []).reduce((n,t) =>
    n + Number(t.fin) - Number(t.inicio) - Number(t.colacion || 0), 0);
  dias.forEach(x => { horasSem += horasDelDia(x); });

  const hoy = iso(new Date());

  // Confirmar toda la semana de una: la mayoría de las semanas puede con todo,
  // y pedirle 5 toques para decir que sí es la mejor forma de que no lo haga.
  const porConfirmar = dias.filter(x => (x.turnos||[]).some(b => b.confirmo !== true));
  const btnTodo = $('#tConfTodo');
  if (porConfirmar.length > 1) {
    btnTodo.hidden = false;
    const cuantos = porConfirmar.reduce((n,x) => n + (x.turnos||[]).filter(b => b.confirmo !== true).length, 0);
    btnTodo.innerHTML = `<button class="act primary" id="btnTodaSemana">Confirmo toda la semana
      <span>${cuantos} ${cuantos === 1 ? 'turno' : 'turnos'}</span></button>
      <p class="soloHoy">Si alguno no puedes, lo cambias después uno por uno.</p>`;
    on('#btnTodaSemana', 'click', async ev => {
      const b = ev.currentTarget; b.disabled = true; b.textContent = 'Confirmando…';
      try {
        for (const x of porConfirmar)
          for (const b of (x.turnos || [])) await DATOS.marcarTurno(token, b.id, 'confirmo');
        await pintarTrabajador(token);
      } catch (e) {
        b.disabled = false;
        $('#tAviso').innerHTML = `<div class="avisoro">No se pudo confirmar todo: ${esc(e.message)}</div>`;
      }
    });
  } else btnTodo.hidden = true;

  const cont = $('#tDias'); cont.innerHTML = '';
  dias.forEach(x => {
    const bloques = x.turnos || [];
    const trabaja = bloques.length > 0;
    const hs = horasDelDia(x);
    const i = (new Date(x.fecha + 'T00:00:00').getDay() + 6) % 7;
    const card = el('div','diacard' + (trabaja ? '' : ' libre'), `
      <div class="diahead">
        <div><div class="diafecha">${DIAS[i]} ${ddmm(x.fecha)}</div>
          <div class="diaturno">${trabaja
            ? bloques.map(b => esc(b.turno || b.puesto || 'Turno')).join(' + ')
            : (AUSENCIAS[x.ausencia] || 'Libre')}</div></div>
        <div class="diahoras">${trabaja
            ? bloques.map(b => hhmm(b.inicio)+'–'+hhmm(b.fin)
                + (b.puesto ? ' <i>'+esc(b.puesto)+'</i>' : '')).join('<br>')
              + ' · ' + hfmt(hs) + ' h'
            : ''}
          ${x.propina ? `<span class="prop">${clp(x.propina)} de propina</span>` : ''}</div>
      </div>` +
      (trabaja ? bloques.map(b => {
        const dentro = b.entrada && !b.salida, listo = b.entrada && b.salida;
        const hEnt = b.entrada ? new Date(b.entrada) : null, hSal = b.salida ? new Date(b.salida) : null;
        const hm = d => String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
        return `<div class="turnocard${dentro ? ' dentro' : ''}">
          <div class="turnocard-h"><b>${hhmm(b.inicio)}–${hhmm(b.fin)}</b>
            ${b.puesto ? `<span class="rol">${esc(b.puesto)}</span>` : ''}</div>
          ${listo ? `<p class="marcado">Entraste a las <b>${hm(hEnt)}</b> y saliste a las <b>${hm(hSal)}</b>
                       · <b>${hfmt(Math.max((hSal - hEnt)/3600000 - Number(b.colacion||0), 0))} h</b></p>`
           : dentro ? `<p class="marcado">Entraste a las <b>${hm(hEnt)}</b>. Estás adentro.</p>` : ''}
          <div class="btns">
            ${!b.entrada ? `<button class="reloj" data-reloj="entrada" data-id="${b.id}">Marcar entrada</button>` : ''}
            ${dentro ? `<button class="reloj sale" data-reloj="salida" data-id="${b.id}">Marcar salida</button>` : ''}
            ${!b.entrada ? `<button data-a="confirmo" data-id="${b.id}" aria-pressed="${b.confirmo === true}">Confirmo</button>
              <button class="no" data-a="no_puedo" data-id="${b.id}" aria-pressed="${b.confirmo === false}">No puedo</button>` : ''}
          </div></div>`;
      }).join('') + (x.ofrecido
        ? '<p class="ofrecido">Ofreciste este turno. Si alguien lo toma, tu jefe confirma el cambio.</p>'
        : bloques.map(b => `<button class="ofrecer" data-of="${b.id}">Ofrecer${bloques.length > 1
             ? ' el de ' + hhmm(b.inicio) : ' este turno'} a mis compañeros</button>`).join('')) : ''));
    cont.appendChild(card);
    card.querySelectorAll('[data-of]').forEach(bo => bo.addEventListener('click', async () => {
      if (!confirm('Vas a ofrecer este turno a tus compañeros.\n\n'
                 + 'Sigue siendo tuyo hasta que alguien lo tome y tu jefe confirme el cambio.')) return;
      bo.disabled = true;
      try { await DATOS.ofrecerTurno(token, bo.dataset.of); await pintarTrabajador(token); }
      catch (e) { bo.disabled = false; $('#tAviso').innerHTML = `<div class="avisoro">${esc(e.message)}</div>`; }
    }));
    card.querySelectorAll('button[data-a],button[data-reloj]').forEach(b => {
      b.addEventListener('click', async () => {
        const accion = b.dataset.reloj || b.dataset.a;
        if (accion === 'salida' && !confirm('¿Marcar tu salida?\n\nQueda la hora exacta y no se puede deshacer.')) return;
        b.disabled = true;
        try {
          const r = await DATOS.marcarTurno(token, b.dataset.id, accion);
          if (r && r.ok === false) {
            const porque = { ya_entro:'Ya marcaste tu entrada.', ya_salio:'Ya marcaste tu salida.',
                             sin_entrada:'Primero tienes que marcar la entrada.',
                             no_es_tuyo:'Ese turno no es tuyo.', link:'Tu link no es válido.' };
            $('#tAviso').innerHTML = `<div class="avisoro">${esc(porque[r.motivo] || r.motivo)}</div>`;
          }
          await pintarTrabajador(token);
        } catch (e) { b.disabled = false; $('#tAviso').innerHTML = `<div class="avisoro">No se pudo guardar: ${esc(e.message)}</div>`; }
      });
    });
  });
  const saldo = Number(d.saldo || 0);
  $('#tTotal').innerHTML = 'Total de la semana: <b>' + hfmt(horasSem) + ' horas</b>.'
    + (Math.abs(saldo) >= 0.5
       ? ` Saldo acumulado: <b>${saldo > 0 ? '+' : ''}${hfmt(saldo)} h</b> ${saldo > 0 ? '<i>(te deben)</i>' : '<i>(debes)</i>'}.`
       : '');

  const miProp = dias.reduce((s,x) => s + (x.propina || 0), 0);
  const porHora = horasSem ? miProp / horasSem : 0;
  $('#tPropina').innerHTML = miProp
    ? `<div class="platita"><div class="k">Tu propina de la semana</div><div class="v">${clp(miProp)}</div>
       <div class="n">Son <b>${clp(porHora)} por hora</b> sobre tus ${hfmt(horasSem)} h.
       Se reparte día por día entre los que trabajaron ese día, por horas × factor; el tuyo es
       <b>${hfmt(d.factor)}</b>. El factor lo acuerda el equipo, no el jefe (art. 64).</div></div>`
    : '';

  const ab = $('#tAbiertos'); ab.innerHTML = '';
  const abiertos = d.abiertos || [];
  if (!abiertos.length) ab.innerHTML = '<p class="vacio">No hay turnos disponibles por ahora.</p>';
  abiertos.forEach(a => {
    const hs = Number(a.fin) - Number(a.inicio) - Number(a.colacion);
    const ocupado = dias.find(x => x.fecha === a.fecha && x.turno);
    const card = el('div','abicard' + (a.mio ? ' tomado' : ''), `
      <div class="qué">
        <b>${ddmm(a.fecha)} · ${esc(a.turno)} ${hhmm(a.inicio)}–${hhmm(a.fin)}</b>
        <span>${esc(a.puesto||'')} · ${hfmt(hs)} h</span>
        ${a.nota ? `<em>${esc(a.nota)}</em>` : ''}
        ${ocupado ? `<em>Ese día ya tienes ${esc(ocupado.turno)}.</em>` : ''}
      </div>
      <div class="abiest">${a.mio ? '<span class="flag ok">Lo tomaste tú</span>'
                                  : '<button class="act primary" data-tomar="1">Lo tomo</button>'}</div>`);
    ab.appendChild(card);
    const bt = card.querySelector('[data-tomar]');
    if (bt) bt.addEventListener('click', async () => {
      bt.disabled = true;
      try {
        const r = await DATOS.tomarTurno(token, a.id) || {};
        if (!r.ok) {
          const txt = r.motivo === 'tope'
            ? `No puedes tomarlo: quedarías con ${hfmt(r.horas)} h esa semana y tu contrato es de ${hfmt(r.contrato)} h. Habla con tu jefe.`
            : r.motivo === 'tomado' ? 'Alguien lo tomó primero.'
            : 'No se pudo tomar el turno.';
          $('#tAviso').innerHTML = `<div class="avisoro">${esc(txt)}</div>`;
        }
        await pintarTrabajador(token);
      } catch (e) { bt.disabled = false; $('#tAviso').innerHTML = `<div class="avisoro">${esc(e.message)}</div>`; }
    });
  });
}

/* ================= ARRANQUE ================= */
// Si la lectura de la sesion falla o se cuelga, NUNCA dejar la pantalla en blanco:
// mejor mostrar el formulario de entrar que un vacio que no explica nada.
async function sesionSegura() {
  try {
    const r = await Promise.race([
      sb.auth.getSession(),
      new Promise(res => setTimeout(() => res({ data:null, lenta:true }), 6000)),
    ]);
    if (r && r.lenta) { console.warn('getSession no respondio en 6 s'); return null; }
    return (r && r.data && r.data.session) || null;
  } catch (e) { console.warn('getSession fallo', e); return null; }
}

async function verJefe() {
  $('#vistaJefe').hidden = false; $('#vistaTrab').hidden = true;
  const sesion = await sesionSegura();
  const hay = !!sesion;
  $('#cardLogin').hidden = hay;
  $('#hAcciones').innerHTML = '';
  if (!hay) { $('#cardLocal').hidden = true; $('#app').hidden = true; return; }

  const salir = el('button','act','Cerrar sesión');
  salir.addEventListener('click', () => sb.auth.signOut());
  $('#hAcciones').appendChild(salir);

  try { S.locales = await DATOS.misLocales() || []; }
  catch (e) {
    $('#diag').hidden = false; marca('#c-db','bad','La base rechazó la consulta');
    $('#diagNota').textContent = e.message;
    $('#cardLocal').hidden = true; $('#app').hidden = true; return;
  }

  // ¿cuál local estaba mirando? se recuerda por navegador
  let elegido = null;
  try { elegido = localStorage.getItem('malla-local'); } catch (e) {}
  S.local = S.locales.find(l => l.id === elegido) || S.locales[0] || null;


  if (!S.local) { $('#cardLocal').hidden = false; $('#app').hidden = true; pintarLocales(); return; }
  $('#cardLocal').hidden = true; $('#app').hidden = false;
  pintarLocales();

  await cargar();
  pintarTodo();

  if (!S.canal) S.canal = DATOS.escuchar(S.local.id, () => { cargar().then(pintarTodo).catch(()=>{}); });
}

/* ---------- sub-pestañas de Planificación ----------
   VAN AQUI ARRIBA, no dentro de `conectarApp()`, y eso es el arreglo de un bug
   que encontro Pedro apretando «quitar» en un tramo (msg 4074): salia
   `verSub is not defined`. Estaban declaradas dentro de `conectarApp()`, asi
   que de las once llamadas solo las DOS que viven ahi adentro funcionaban; las
   otras nueve —quitar un tramo, guardarlo, copiarlo, volver de un dialogo—
   reventaban. `node --check` pasa igual y las pruebas tambien: esto solo se ve
   apretando el boton. */
const SUBS = ['malla', 'plant', 'nec', 'obj'];
function verSub(cual) {
  if (SUBS.indexOf(cual) < 0) cual = 'malla';
  S.sub = cual;
  SUBS.forEach(x => {
    const b = $('#sub-' + x), pnl = $('#s-' + x);
    if (b) b.setAttribute('aria-selected', x === cual ? 'true' : 'false');
    if (pnl) pnl.hidden = x !== cual;
  });
  if (cual === 'plant') pintarModelos();
}

/* ---------- modelos de semana ----------
   ESTAS CINCO VIVIAN DENTRO DE `conectarApp()`. Sacadas al modulo el
   06-10-2026 porque eso rompia la pantalla: `verSub()` es global y llama a
   `pintarModelos()`, que al estar anidada no existe fuera de conectarApp.
   Resultado: abrir «Plantillas» tiraba un ReferenceError que se tragaba el
   escuchador del clic, el panel se mostraba IGUAL —verSub lo destapa antes
   de pintar— y quedaba completamente vacio: sin modelos, sin semanas y sin
   gente. Se veia como una pantalla sin datos, no como un error.

   Solo usan cosas globales, asi que mudarlas no cambia nada mas.
   El resto del comentario original va mas abajo, con cada funcion. */

/* ---------- modelos de semana ----------
   Lo que mas ahorra tiempo de toda la lista: una semana de local se parece a la
   anterior, pero hoy se arma turno por turno.

   «Copiar la anterior» ya existia y resuelve el caso facil. Esto resuelve el de
   verdad: el local tiene dos o tres semanas tipo y la anterior puede ser justo
   la rara. Un modelo con nombre SE ELIGE; «la anterior» solo se acepta. */
function pintarModelos() {
  const sel = $('#pModelo');
  const antes = sel.value;
  sel.innerHTML = S.modelos.length
    ? S.modelos.map(m => {
        const n = (m.modelo_turnos || []).length;
        return `<option value="${m.id}">${esc(m.nombre)} · ${n} turno${n === 1 ? '' : 's'}</option>`;
      }).join('')
    : '<option value="">— todavía no hay modelos guardados —</option>';
  if (antes && S.modelos.some(m => m.id === antes)) sel.value = antes;

  const hay = S.modelos.length > 0;
  $('#pAplicar').disabled = !hay;
  $('#pBorrar').hidden    = !hay;

  // Las personas arrancan TODAS marcadas: el caso normal es aplicar el modelo
  // completo, y desmarcar es mas rapido que marcar a quince.
  $('#pPersonas').innerHTML = S.personas.map(x =>
    `<button type="button" class="act dia on" data-pid="${x.id}"
       aria-pressed="true">${esc(x.nombre.split(' ')[0])}</button>`).join('')
    || '<span class="hint">No hay nadie en el equipo todavía.</span>';
  marcarTodosTexto();

  // Cuantas semanas seguidas. Mas de cuatro de una vez no lo pidio nadie y
  // pisar un mes entero sin querer es caro.
  if (!$('#pSemanas').dataset.listo) {
    $('#pSemanas').innerHTML = [1,2,3,4].map(n =>
      `<button type="button" class="act dia" data-sem="${n}"
         aria-pressed="false">${n}</button>`).join('');
    $('#pSemanas').dataset.listo = '1';
  }
  // OJO: aca NO se toca la cantidad de semanas elegida. `pintarModelos` se
  // llama tambien DESPUES de guardar y de borrar, y un repintado que pisa lo
  // que el usuario eligio es un error silencioso: elegia 4 semanas, guardaba
  // un modelo y la seleccion volvia a 1 sin avisar. El reinicio a 1 se hace
  // una sola vez, al ABRIR el dialogo.
  if (!$('#pSemanas').querySelector('button[aria-pressed="true"]')) marcarSemanas(1);
}

/* El numero de semanas es una CANTIDAD, no una posicion: con el 3 marcado, el 1
   y el 2 tambien van llenos, como un nivel. Lo pidio Pedro mirando la pantalla
   —«si marcas el 2 queda en blanco el 1»— y tiene razon: tal como estaba se leia
   «la tercera semana» en vez de «tres semanas».

   OJO, el detalle que importa: el relleno va por CLASE y `aria-pressed` queda
   SOLO en el elegido. `opcionesModelo()` lee el valor con un querySelector de
   `aria-pressed="true"`, que devuelve el PRIMERO: si se marcaran los cuatro,
   leeria 1 y aplicaria siempre una sola semana, en silencio. */
/* Una accion que termina cierra el dialogo: no tiene nada mas que ofrecer y
   ademas TAPA la malla, que es justo lo que uno quiere ver despues de aplicar.
   Lo pidio Pedro —«una vez creado y guardado no deberia desaparecer esta
   pantalla?»—. El aviso se muestra donde ya lo muestra «Copiar la anterior»,
   para no inventar un segundo lugar donde mirar.
   Si algo FALLA, el dialogo se queda abierto: ahi si hay que volver a intentar. */
function listoYCerrar(texto) {
  // Antes esto cerraba el dialogo. Ahora Plantillas es una sub-pestaña, asi que
  // lo que corresponde es volver a la malla: es lo que uno quiere ver despues
  // de aplicar, y era la razon por la que el dialogo se cerraba solo.
  verSub('malla');
  const m = $('#msgSem');
  if (m) { m.textContent = texto; m.className = 'msg ok'; }
  setTimeout(() => { const x = $('#msgSem'); if (x && x.textContent === texto) x.textContent = ''; }, 6000);
}

function marcarSemanas(n) {
  $('#pSemanas').querySelectorAll('button[data-sem]').forEach(b => {
    const v = Number(b.dataset.sem);
    b.classList.toggle('on', v <= n);
    b.setAttribute('aria-pressed', v === n ? 'true' : 'false');
  });
}

function marcarTodosTexto() {
  const t = $('#pPersonas').querySelectorAll('button[data-pid][aria-pressed="true"]').length;
  const n = S.personas.length;
  $('#pTodos').textContent = n ? (t === n ? '· todos' : `· ${t} de ${n}`) : '';
}

function opcionesModelo() {
  const todas = S.personas.length;
  const marcadas = [...$('#pPersonas').querySelectorAll('button[data-pid][aria-pressed="true"]')]
    .map(b => b.dataset.pid);
  const semBtn = $('#pSemanas').querySelector('button[aria-pressed="true"]');
  return {
    // null = todas, para no filtrar de mas si alguien se sumo al equipo
    personas: marcadas.length === todas ? null : marcadas,
    sinAsignar: $('#pSinAsignar').checked,
    semanas: Number(semBtn ? semBtn.dataset.sem : 1) || 1,
  };
}


/* ================= CREAR Y EDITAR UN TURNO =================
   Los tres pasos que describio Pedro (msgs 4360-4361): como se llama, cuando
   es, quien lo trabaja. El tercero es el que HOY NO EXISTE: para meter gente a
   un turno hay que irse a la malla y ponerlos casilla por casilla.

   Reemplaza a `nuevoTurnoRapido()`, que era un `prompt()` pidiendo solo el
   nombre y dejaba el turno de 9:00 a 17:00 todos los dias.

   LA DECISION QUE COSTO TRES RONDAS. El paso 2 va con calendario, no con
   botones Lun..Dom. Yo proponia los botones porque un calendario de octubre no
   puede decir «la Cena existe los jueves, para siempre»; Pedro pidio el
   calendario tres veces, y a la tercera quedo claro que el que no entendia era
   yo. Lo que el quiere es literal:

     «si marco un dia, es solo ese dia, si marco dos, son esos dos»

   Asi que **lo que se marca es lo que queda**, y la repeticion se OFRECE
   debajo en vez de asumirse. Es lo que de verdad hace Google Calendar, que era
   lo que el tenia en la cabeza: eliges un dia y DESPUES decides si se repite.

   De ahi sale una regla que no estaba escrita en ninguna parte: **«hasta
   cuando» —indefinido incluido— solo existe si se acepto la repeticion.** No
   se puede repetir para siempre lo que son cuatro fechas sueltas. */

const TN = { turno: null, mes: null, dias: new Set(), patron: null };

const COLACIONES = [0, 15, 30, 45, 60];
const HASTAS = [
  ['1',  'Solo esta semana'],
  ['2',  '2 semanas'],
  ['4',  '4 semanas'],
  ['inf', 'Indefinido'],
];
// Cuantas semanas se escriben por adelantado cuando el turno es indefinido.
// Es la opcion «A» que eligio Pedro: materializar un horizonte y estirarlo
// solo, en vez de que la malla calcule turnos al vuelo. Se puede cambiar a la
// «B» por dentro sin que el usuario vea nada distinto.
const HORIZONTE_SEMANAS = 8;

const dowDe = f => (new Date(f + 'T00:00:00').getDay() + 6) % 7;   // 0 = lunes

/* Que dias de la semana salen de lo marcado. Devuelve los dow ordenados, sin
   repetir. No decide nada: solo describe, para poder OFRECER la repeticion. */
function patronDeDias(dias) {
  return [...new Set([...dias].map(dowDe))].sort((a, b) => a - b);
}

function nombraDias(dows) {
  const LARGOS = ['lunes','martes','miércoles','jueves','viernes','sábado','domingo'];
  const n = dows.map(d => LARGOS[d]);
  if (n.length === 1) return n[0];
  return n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1];
}

function abrirTN(turno) {
  TN.turno = turno || null;
  TN.mes = new Date(S.lunes.getFullYear(), S.lunes.getMonth(), 1);
  TN.dias = new Set();
  TN.patron = null;

  $('#tnTit').textContent = turno ? 'Editar el turno' : 'Turno nuevo';
  $('#tnCrear').textContent = turno ? 'Guardar' : 'Crear el turno';
  $('#tnBorrar').hidden = !turno;
  $('#tnMsg').textContent = ''; $('#tnMsg').className = 'msg';

  // Al editar, el patron guardado se carga y se ve como eco en el calendario.
  // No se marcan dias concretos: el turno no vive en fechas, vive en el patron.
  if (turno && turno.dias) TN.patron = String(turno.dias).split('').map(Number);

  $('#tnNombre').value = turno ? turno.nombre : '';
  $('#tnEntra').value  = turno ? hhmm(turno.inicio) : '';
  $('#tnSale').value   = turno ? hhmm(turno.fin) : '';

  // «Copiar de»: solo al crear. Editar un turno copiando otro encima es un
  // caso que nadie pidio y que se presta a pisar sin querer.
  $('#tnCopiar').innerHTML = '<option value="">— empezar en blanco —</option>'
    + S.turnos.filter(t => !turno || t.id !== turno.id)
        .slice().sort((a, b) => Number(a.inicio) - Number(b.inicio))   // por hora, como la otra lista
        .map(t => `<option value="${t.id}">${esc(t.nombre)} · ${hhmm(t.inicio)}–${hhmm(t.fin)}</option>`).join('');
  $('#tnCopiar').closest('.fld').hidden = !!turno || !S.turnos.length;

  $('#tnPuesto').innerHTML = '<option value="">— cualquiera —</option>'
    + puestosConocidos().sort().map(q => `<option value="${esc(q)}">${esc(q)}</option>`).join('');

  $('#tnColacion').innerHTML = COLACIONES.map(m =>
    `<option value="${m}"${turno && Math.round(turno.colacion * 60) === m ? ' selected' : ''}>${m} min</option>`).join('');
  if (!turno) $('#tnColacion').value = '30';

  $('#tnHasta').innerHTML = HASTAS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  $('#tnHasta').value = 'inf';
  $('#tnCajaHasta').hidden = true;

  $('#tnPersonas').innerHTML = S.personas.map(p =>
    `<label class="tnper"><input type="checkbox" data-pid="${p.id}">
       <span>${esc(p.nombre.split(' ')[0])}</span><span class="av" data-av="${p.id}" hidden></span></label>`).join('')
    || '<p class="hint">No hay nadie en el equipo todavía.</p>';
  const rNadie = document.querySelector('input[name="tnQuien"][value="nadie"]');
  if (rNadie) rNadie.checked = true;
  $('#tnPersonas').hidden = true; $('#tnCajaCupos').hidden = true;
  $('#tnCupos').value = '1';

  pintarTNCal(); pintarTNHoras(); pintarTNResumen();
  $('#dlgTN').showModal();
  $('#tnNombre').focus();
}

function pintarTNCal() {
  const caja = $('#tnCal'); if (!caja) return;
  const a = TN.mes.getFullYear(), m = TN.mes.getMonth();
  const primero = new Date(a, m, 1), ultimo = new Date(a, m + 1, 0);
  const hoy = iso(new Date());
  const hueco = (primero.getDay() + 6) % 7;

  let celdas = '';
  for (let i = 0; i < hueco; i++) celdas += '<td class="vacio"></td>';
  for (let d = 1; d <= ultimo.getDate(); d++) {
    const f = iso(new Date(a, m, d));
    const marcado = TN.dias.has(f);
    // El eco: cae en el patron aceptado pero no lo marco el. Es lo que deja VER
    // que entendio la pantalla, sin tener que creerle a la frase de abajo.
    const eco = !marcado && TN.patron && TN.patron.includes(dowDe(f));
    celdas += `<td><button type="button" data-f="${f}"
      class="${marcado ? 'on' : eco ? 'eco' : ''}${f === hoy ? ' hoy' : ''}">${d}</button></td>`;
    if ((hueco + d) % 7 === 0) celdas += '</tr><tr>';
  }

  caja.innerHTML =
      `<div class="cab"><button type="button" data-mes="-1" aria-label="Mes anterior">‹</button>`
    + `<span>${primero.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}</span>`
    + `<button type="button" data-mes="1" aria-label="Mes siguiente">›</button></div>`
    + '<table><tr><th>L</th><th>M</th><th>M</th><th>J</th><th>V</th><th>S</th><th>D</th></tr><tr>'
    + celdas + '</tr></table>';
  pintarTNOferta();
}

/* La oferta. NO asume el patron: lo propone. Si no se acepta, el turno existe
   solo los dias marcados. Era al reves en mi primera maqueta y Pedro lo
   corrigio: «si marco un dia, es solo ese dia». */
function pintarTNOferta() {
  const caja = $('#tnOferta'); if (!caja) return;
  const n = TN.dias.size;
  if (!n && !TN.patron) { caja.hidden = true; $('#tnCajaHasta').hidden = true; return; }
  caja.hidden = false;

  if (TN.patron) {
    caja.innerHTML = `<p>Se repite <b>cada semana</b>: ${esc(nombraDias(TN.patron))}.</p>`
      + `<div class="acciones"><button type="button" class="act" data-tn="norepetir">`
      + `No, solo los días que marqué</button></div>`;
    $('#tnCajaHasta').hidden = false;
    return;
  }
  const dows = patronDeDias(TN.dias);
  caja.innerHTML = `<p>Marcaste <b>${n}</b> ${n === 1 ? 'día' : 'días'}`
    + ` · ${esc(nombraDias(dows))}.</p>`
    + `<div class="acciones"><button type="button" class="act" data-tn="repetir">`
    + `¿Que se repita cada semana?</button></div>`;
  $('#tnCajaHasta').hidden = true;
}

function duraTN() {
  const i = aDec($('#tnEntra').value), f0 = aDec($('#tnSale').value);
  if (!$('#tnEntra').value || !$('#tnSale').value) return null;
  const f = f0 <= i ? f0 + 24 : f0;
  const col = (Number($('#tnColacion').value) || 0) / 60;
  return { inicio: i, fin: f, colacion: col, horas: f - i - col, cruza: f0 <= i };
}

function pintarTNHoras() {
  const d = duraTN();
  $('#tnMedia').hidden = !(d && d.cruza);
  $('#tnHoras').textContent = d && d.horas > 0 ? hfmt(d.horas) + ' h por turno' : '';
  pintarTNAvisos();
}

/* El aviso de «ya tiene turno ese dia» va AL LADO DEL NOMBRE y mientras eliges,
   no al final. Avisar despues de apretar Crear obliga a deshacer el camino.
   Es la decision 3, y es la que respeta el principio de Pedro: avisar, nunca
   bloquear — el turno partido existe y a veces es lo que quiere. */
function pintarTNAvisos() {
  const d = duraTN();
  $('#tnPersonas').querySelectorAll('[data-av]').forEach(sp => {
    const pid = sp.dataset.av;
    let choque = null;
    if (d) for (const f of TN.dias) {
      const c = chocaCon(pid, f, d.inicio, d.fin);
      if (c) { choque = { f, c }; break; }
    }
    sp.hidden = !choque;
    if (choque) sp.textContent = `ya tiene ${hhmm(choque.c.inicio)}–${hhmm(choque.c.fin)} el ${ddmm(choque.f)}`;
  });
}

function quienTN() {
  const r = document.querySelector('input[name="tnQuien"]:checked');
  return r ? r.value : 'nadie';
}

function pintarTNResumen() {
  const d = duraTN();
  const n = TN.dias.size;
  const q = quienTN();
  const marcados = [...$('#tnPersonas').querySelectorAll('input[data-pid]:checked')].length;
  const hasta = $('#tnCajaHasta').hidden ? null : $('#tnHasta').value;

  if (!n && !TN.patron) {
    $('#tnResumen').innerHTML = 'Marca en el calendario los días que trabaja este turno.'; return; }
  const partes = [];
  partes.push(TN.patron ? `<b>${esc(nombraDias(TN.patron))}</b> de cada semana`
                        : `<b>${n}</b> ${n === 1 ? 'día' : 'días'} marcados`);
  if (d && d.horas > 0) partes.push(`<b>${hhmm(d.inicio)}–${hhmm(d.fin)}</b>, ${hfmt(d.horas)} h`);
  if (hasta === 'inf') partes.push('<b>indefinido</b>');
  else if (hasta) partes.push(`<b>${hasta}</b> ${hasta === '1' ? 'semana' : 'semanas'}`);
  if (q === 'personas') partes.push(marcados ? `para <b>${marcados}</b> ${marcados === 1 ? 'persona' : 'personas'}`
                                             : 'sin nadie marcado todavía');
  if (q === 'abierto') partes.push(`<b>${$('#tnCupos').value}</b> cupos abiertos por día`);
  $('#tnResumen').innerHTML = partes.join(' · ') + '.';
}


/* ---------- las fechas que se van a escribir ----------
   Sin patron: exactamente lo que marco, ni un dia mas. Es lo que pidio Pedro
   —«si marco un dia, es solo ese dia»— y por eso aqui no hay nada mas que
   devolver lo marcado.

   Con patron: desde el lunes de la semana del primer dia marcado, tantas
   semanas como diga «hasta cuando». «Indefinido» escribe HORIZONTE_SEMANAS y
   se estira solo mas adelante: es la opcion A que eligio Pedro, y la eleccion
   se puede cambiar por dentro sin que el usuario vea nada distinto. */
function fechasTN() {
  if (!TN.patron) return [...TN.dias].sort();
  const marcados = [...TN.dias].sort();
  const base = marcados.length ? new Date(marcados[0] + 'T00:00:00') : new Date(S.lunes);
  const lunes = lunesDe(base);
  const v = $('#tnHasta').value;
  const semanas = v === 'inf' ? HORIZONTE_SEMANAS : (Number(v) || 1);
  const out = [];
  for (let w = 0; w < semanas; w++)
    TN.patron.forEach(dow => out.push(iso(masDias(lunes, w * 7 + dow))));
  // Lo marcado a mano entra siempre, aunque caiga fuera de la ventana: el
  // usuario lo toco a proposito y pisarselo seria lo contrario del principio.
  marcados.forEach(f => { if (!out.includes(f)) out.push(f); });
  return [...new Set(out)].sort();
}

async function guardarTN() {
  const m = $('#tnMsg');
  const aviso = (t, c) => { m.textContent = t; m.className = 'msg ' + (c || ''); };
  const nombre = $('#tnNombre').value.trim();
  if (!nombre) return aviso('Ponle un nombre al turno.', 'bad');
  const d = duraTN();
  if (!d) return aviso('Faltan las horas: a qué hora entra y a qué hora sale.', 'bad');
  if (d.horas <= 0) return aviso('La colación se come el turno entero.', 'bad');

  const quien = quienTN();
  const personas = [...$('#tnPersonas').querySelectorAll('input[data-pid]:checked')]
                     .map(x => x.dataset.pid);
  if (quien === 'personas' && !personas.length)
    return aviso('Marca a quién le toca, o elige «Nadie por ahora».', 'bad');
  const cupos = Math.max(1, Number($('#tnCupos').value) || 1);

  const fechas = fechasTN();
  if (quien !== 'nadie' && !fechas.length)
    return aviso('Marca en el calendario qué días trabaja este turno.', 'bad');

  const campos = { nombre, inicio: d.inicio, fin: d.fin, colacion: d.colacion,
                   dias: TN.patron ? TN.patron.join('') : '' };
  const puesto = $('#tnPuesto').value;

  $('#tnCrear').disabled = true;
  aviso('Guardando…');
  try {
    // 1. el turno (la plantilla)
    let turno;
    if (TN.turno) turno = Object.assign(TN.turno, await DATOS.guardarTurno(TN.turno.id, campos));
    else turno = await DATOS.crearTurno(S.local.id,
                   Object.assign({ orden: S.turnos.length }, campos));

    // 2. lo que va a la malla. La foto para Deshacer se toma DE LA BASE y sobre
    //    todo el rango: las semanas de mas alla no estan cargadas en `S.asign`,
    //    asi que `recordar()` guardaria una foto vacia y deshacer BORRARIA lo
    //    que hubiera ahi. Es el mismo golpe que ya se arreglo hoy en «aplicar
    //    un modelo».
    let creados = 0, saltados = 0;
    if (quien !== 'nadie' && fechas.length) {
      await recordarDeLaBase('crear el turno ' + nombre, fechas[0], fechas[fechas.length - 1]);
      const filas = [];
      fechas.forEach(f => {
        const base = { fecha: f, turno_id: turno.id, inicio: d.inicio, fin: d.fin,
                       colacion: d.colacion, puesto, nota: '' };
        if (quien === 'abierto') {
          for (let i = 0; i < cupos; i++) filas.push(Object.assign({ persona_id: null }, base));
        } else {
          personas.forEach(pid => {
            // Las ausencias no se pisan: es la misma regla que en copiar/pegar.
            if (ausenciaDe(pid, f)) { saltados++; return; }
            filas.push(Object.assign({ persona_id: pid }, base));
          });
        }
      });
      if (filas.length) await DATOS.crearAsignacionesLote(S.local.id, filas);
      creados = filas.length;
    }

    await refrescar();
    $('#dlgTN').close();
    const ms = $('#msgSem');
    if (ms) {
      ms.textContent = TN.turno
        ? `Turno «${nombre}» guardado.`
        : `Turno «${nombre}» creado`
          + (creados ? ` · ${creados} ${creados === 1 ? 'turno puesto' : 'turnos puestos'} en la malla` : '')
          + (saltados ? ` · ${saltados} saltados por ausencia` : '')
          + (creados ? '. Si fue sin querer, aprieta Deshacer.' : '.');
      ms.className = 'msg ok';
      setTimeout(() => { const x = $('#msgSem'); if (x) x.textContent = ''; }, 8000);
    }
  } catch (e) {
    aviso(e.message, 'bad');
  } finally { $('#tnCrear').disabled = false; }
}

async function borrarTN() {
  if (!TN.turno) return;
  const usados = Object.values(S.asign).flat().filter(a => a.turno_id === TN.turno.id).length;
  if (!confirm(`¿Quitar el turno «${TN.turno.nombre}»?\n\n`
    + (usados ? `Hay ${usados} ${usados === 1 ? 'turno puesto' : 'turnos puestos'} en la malla que `
              + 'salieron de él. NO se borran: se quedan con sus horas, solo pierden el nombre.\n\n'
              : '')
    + 'Esto no se puede deshacer.')) return;
  try {
    await DATOS.quitarTurno(TN.turno.id);
    await refrescar();
    $('#dlgTN').close();
  } catch (e) { $('#tnMsg').textContent = e.message; $('#tnMsg').className = 'msg bad'; }
}

function conectarTN() {
  const dlg = $('#dlgTN'); if (!dlg || dlg.dataset.listo) return;
  dlg.dataset.listo = '1';

  // Un solo escuchador para el calendario: se repinta entero en cada cambio.
  $('#tnCal').addEventListener('click', ev => {
    const mes = ev.target.closest('button[data-mes]');
    if (mes) {
      TN.mes = new Date(TN.mes.getFullYear(), TN.mes.getMonth() + Number(mes.dataset.mes), 1);
      return pintarTNCal();
    }
    const b = ev.target.closest('button[data-f]'); if (!b) return;
    const f = b.dataset.f;
    if (TN.dias.has(f)) TN.dias.delete(f); else TN.dias.add(f);
    // Cambiar lo marcado invalida un patron ya aceptado: lo que manda es lo que
    // el marco, asi que se vuelve a ofrecer sobre lo nuevo.
    TN.patron = null;
    pintarTNCal(); pintarTNAvisos(); pintarTNResumen();
  });

  $('#tnOferta').addEventListener('click', ev => {
    const b = ev.target.closest('button[data-tn]'); if (!b) return;
    TN.patron = b.dataset.tn === 'repetir' ? patronDeDias(TN.dias) : null;
    pintarTNCal(); pintarTNResumen();
  });

  ['#tnEntra', '#tnSale'].forEach(sel => on(sel, 'input', pintarTNHoras));
  ['#tnEntra', '#tnSale'].forEach(sel => on(sel, 'blur', () => {
    const e = $(sel); e.value = normalizarHora(e.value); pintarTNHoras(); pintarTNResumen();
  }));
  on('#tnColacion', 'change', () => { pintarTNHoras(); pintarTNResumen(); });
  on('#tnHasta', 'change', pintarTNResumen);
  on('#tnCupos', 'input', pintarTNResumen);

  // Copiar de otro turno: trae horas, colacion y puesto. NO trae los dias:
  // el calendario es de este turno y copiar fechas de otro no significa nada.
  on('#tnCopiar', 'change', () => {
    const t = turnoDe($('#tnCopiar').value); if (!t) return;
    $('#tnEntra').value = hhmm(t.inicio);
    $('#tnSale').value  = hhmm(t.fin);
    $('#tnColacion').value = String(Math.round((t.colacion || 0) * 60));
    if (!$('#tnNombre').value.trim()) $('#tnNombre').value = t.nombre + ' (copia)';
    pintarTNHoras(); pintarTNResumen();
  });

  document.querySelectorAll('input[name="tnQuien"]').forEach(r =>
    r.addEventListener('change', () => {
      const q = quienTN();
      $('#tnPersonas').hidden   = q !== 'personas';
      $('#tnCajaCupos').hidden  = q !== 'abierto';
      pintarTNResumen();
    }));
  $('#tnPersonas').addEventListener('change', pintarTNResumen);

  on('#tnCancelar', 'click', () => $('#dlgTN').close());
  on('#tnCrear', 'click', guardarTN);
  on('#tnBorrar', 'click', borrarTN);
}

function conectarApp() {
  // Pestañas. Se filtran las que existen de verdad: al sacar «Turnos abiertos»
  // esta lista quedó nombrando una que ya no está, y como aquí se llamaba a
  // addEventListener sin red, reventaba y SE CAÍA TODO LO DEMÁS de conectarApp.
  // Es la segunda vez hoy que un elemento que falta se lleva por delante a los
  // que venían después; que no vuelva a pasar por esta vía.
  // 'tn' = Turnos. Salio de Equipo el 07-10 a pestaña propia: para Pedro la
  // gestion de turnos es un bloque en si, no un rincon de la configuracion.
  const TABS = ['sem','eq','tn','prop','conf','link'].filter(t => $('#tab-'+t) && $('#p-'+t));
  TABS.forEach(t => $('#tab-'+t).addEventListener('click', () => {
    TABS.forEach(o => { $('#tab-'+o).setAttribute('aria-selected', String(o===t)); $('#p-'+o).hidden = (o!==t); });
  }));

  // modos de vista
  const irA = modo => {
    // al entrar al mes, se posa en el mes del día en que estabas parado
    if (modo === 'mes') S.mes = new Date(S.modo === 'dia' ? S.dia : S.lunes.getTime() + 3 * 86400000);
    S.modo = modo; soltarSeleccion(); refrescar().catch(error);
  };
  /* ---------- sub-pestañas de Planificación ----------
     Lo que hace 7shifts y nosotros no: arriba poquisimo, y el detalle adentro
     de su propia pagina. «Plantillas» y «Objetivo de costo» eran un boton en la
     barra y un campo perdido en Propinas; ahora cada uno tiene su lugar.

     `pintarModelos()` se llama al ENTRAR a Plantillas, que es cuando hace falta:
     antes se llamaba al abrir el dialogo. */
  SUBS.forEach(x => on('#sub-' + x, 'click', () => verSub(x)));

  /* ---------- el menú «···» ----------
     Se traga los filtros, Imprimir y Limpiar. No son malos botones: son los que
     NO se usan todas las semanas, y por estar al mismo nivel que los que sí
     hacian que la barra se partiera en dos filas. */
  const cerrarMas = () => {
    const pop = $('#masPop'); if (!pop) return;
    pop.hidden = true;
    const b = $('#btnMas'); if (b) b.setAttribute('aria-expanded', 'false');
  };
  on('#btnMas', 'click', ev => {
    ev.stopPropagation();
    const pop = $('#masPop'); if (!pop) return;
    const abrir = pop.hidden;
    pop.hidden = !abrir;
    $('#btnMas').setAttribute('aria-expanded', abrir ? 'true' : 'false');
  });
  // Un menu que no se cierra solo es una trampa: se cierra al tocar fuera o con
  // Escape, que es lo que todo el mundo intenta.
  document.addEventListener('click', ev => {
    const pop = $('#masPop');
    if (pop && !pop.hidden && !ev.target.closest('.masmenu')) cerrarMas();
  });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') cerrarMas(); });

  on('#modoDia', 'click', () => irA('dia'));
  on('#modoSemana', 'click', () => irA('semana'));
  on('#modoMes', 'click', () => irA('mes'));

  // navegar: el paso depende de la vista en la que estés
  const mover = n => {
    if (S.modo === 'dia') S.dia = masDias(S.dia, n);
    else if (S.modo === 'mes') S.mes = new Date(S.mes.getFullYear(), S.mes.getMonth() + n, 1);
    else S.lunes = masDias(S.lunes, n * 7);
    refrescar().catch(error);
  };
  on('#semAnt', 'click', () => mover(-1));
  on('#semSig', 'click', () => mover(1));
  const agrupar = modo => {
    S.agrupar = modo; soltarSeleccion();
    $('#agrPersonas').classList.toggle('primary', modo === 'personas');
    $('#agrPuestos').classList.toggle('primary', modo === 'puestos');
    pintarPlan();
  };
  on('#agrPersonas', 'click', () => agrupar('personas'));
  on('#agrPuestos',  'click', () => agrupar('puestos'));

  on('#semHoy', 'click', () => {
    S.dia = new Date(); S.lunes = lunesDe(new Date()); S.mes = new Date();
    refrescar().catch(error);
  });

  // copiar la semana anterior sobre esta

  /* ---------- Copiar: un boton para los dos sentidos ----------
     Antes habia «Copiar la anterior» suelto en la barra y NINGUNA forma de
     copiar un dia, que es lo que Pedro pidio (msg 3770) despues de armar un
     lunes de once turnos a mano. Ahora es un solo boton que sabe en que vista
     estas, y de paso la barra tiene un control menos. */
  function pintarCopiar() {
    const esDia = S.modo === 'dia';
    $('#cDia').hidden = !esDia;
    $('#cSemana').hidden = esDia;
    $('#cMsg').textContent = '';
    if (esDia) {
      $('#cTit').textContent = 'Copiar este día';
      $('#cSub').textContent = `${DIAS[(new Date(iso(S.dia) + 'T00:00:00').getDay() + 6) % 7]} `
        + `${ddmm(iso(S.dia))} · ${turnosDelDia(iso(S.dia))} turnos`;
      // Los dias de LA SEMANA que se esta viendo, menos el de origen.
      const f = fechas(), hoy = iso(S.dia);
      $('#cDias').innerHTML = f.map((fe, i) => fe === hoy ? '' :
        `<button type="button" class="act dia" data-fecha="${fe}" aria-pressed="false">
           ${DIAS[i]}<span class="yatiene">${ddmm(fe)}</span></button>`).join('');
    } else {
      $('#cTit').textContent = 'Copiar la semana';
      $('#cSub').textContent = `semana del ${ddmm(fechas()[0])}`;
      if (!$('#cSemanas').dataset.listo) {
        $('#cSemanas').innerHTML = [1,2,3,4].map(n =>
          `<button type="button" class="act dia" data-sem="${n}" aria-pressed="false">${n}</button>`).join('');
        $('#cSemanas').dataset.listo = '1';
      }
      marcarCuantas(1);
      marcarQue('adelante');
    }
  }
  // Cuantas semanas es una CANTIDAD, no una posicion: con el 3 marcado el 1 y
  // el 2 van llenos. Misma regla que en Modelos, que Pedro ya corrigio una vez.
  function marcarCuantas(n) {
    $('#cSemanas').querySelectorAll('button[data-sem]').forEach(b => {
      const v = Number(b.dataset.sem);
      b.classList.toggle('on', v <= n);
      b.setAttribute('aria-pressed', v === n ? 'true' : 'false');
    });
  }
  function marcarQue(q) {
    $('#cQue').querySelectorAll('button[data-que]').forEach(b => {
      const on = b.dataset.que === q;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    // Traer la anterior no tiene «cuantas»: se esconde en vez de dejarlo ahi
    // sin efecto, que es como se construye una sorpresa.
    $('#cCajaSem').hidden = q !== 'adelante';
  }
  const turnosDelDia = fe => S.personas.reduce((n, p) => n + turnosDe(p.id, fe).length, 0)
    + S.abiertos.filter(a => !a.persona_id && a.fecha === fe).length;

  on('#btnCopiar', 'click', () => { pintarCopiar(); $('#dlgCopiar').showModal(); });
  on('#cCerrar', 'click', () => $('#dlgCopiar').close());
  on('#cDias', 'click', e => {
    const b = e.target.closest('button[data-fecha]'); if (!b) return;
    const on = b.getAttribute('aria-pressed') === 'true';
    b.setAttribute('aria-pressed', on ? 'false' : 'true');
    b.classList.toggle('on', !on);
  });
  on('#cSemanas', 'click', e => {
    const b = e.target.closest('button[data-sem]'); if (b) marcarCuantas(Number(b.dataset.sem));
  });
  on('#cQue', 'click', e => {
    const b = e.target.closest('button[data-que]'); if (b) marcarQue(b.dataset.que);
  });

  on('#cCopiar', 'click', async () => {
    const m = $('#cMsg'), b = $('#cCopiar');
    const aviso = (t, cls) => { m.textContent = t; m.className = 'msg ' + (cls || ''); };
    b.disabled = true;
    try {
      if (S.modo === 'dia') {
        const destinos = [...$('#cDias').querySelectorAll('button[aria-pressed="true"]')]
          .map(x => x.dataset.fecha);
        if (!destinos.length) { aviso('Elige al menos un día.', 'bad'); b.disabled = false; return; }
        const f = fechas();
        await recordarDeLaBase('copiar el día', f[0], f[6]);
        const n = await DATOS.copiarDiaA(S.local.id, iso(S.dia), destinos);
        await refrescar();
        $('#dlgCopiar').close();
        const ms = $('#msgSem');
        if (ms) { ms.textContent = n ? `Listo: ${n} turnos copiados a ${destinos.length} día(s).`
                                     : 'Ese día no tiene turnos que copiar.';
                  ms.className = 'msg ' + (n ? 'ok' : ''); }
      } else {
        const que = ($('#cQue').querySelector('button[aria-pressed="true"]') || {}).dataset;
        if (que && que.que === 'anterior') {
          const anterior = iso(masDias(S.lunes, -7)), f = fechas();
          await recordarDeLaBase('traer la semana anterior', f[0], f[6]);
          const n = await DATOS.copiarSemana(S.local.id, anterior, iso(S.lunes));
          await refrescar();
          $('#dlgCopiar').close();
          const ms = $('#msgSem');
          if (ms) { ms.textContent = n ? `Listo: ${n} turnos traídos.` : 'La semana anterior estaba vacía.';
                    ms.className = 'msg ' + (n ? 'ok' : ''); }
        } else {
          const bsem = $('#cSemanas').querySelector('button[aria-pressed="true"]');
          const cuantas = Number(bsem ? bsem.dataset.sem : 1) || 1;
          const desde = iso(masDias(S.lunes, 7));
          const hasta = iso(masDias(S.lunes, cuantas * 7 + 6));
          await recordarDeLaBase(`copiar la semana a ${cuantas}`, desde, hasta);
          const n = await DATOS.copiarSemanaA(S.local.id, iso(S.lunes), cuantas);
          await refrescar();
          $('#dlgCopiar').close();
          const ms = $('#msgSem');
          if (ms) { ms.textContent = n ? `Listo: ${n} turnos copiados a ${cuantas} semana(s).`
                                       : 'Esta semana no tiene turnos que copiar.';
                    ms.className = 'msg ' + (n ? 'ok' : ''); }
        }
      }
      setTimeout(() => { const x = $('#msgSem'); if (x) x.textContent = ''; }, 6000);
    } catch (e) {
      // Si falla, el paso atras sobra: se saca para no dejar un Deshacer que no
      // deshace nada. Mismo criterio que el resto de la pantalla.
      S.hist.pop(); pintarDeshacer();
      aviso(e.message, 'bad');
    }
    b.disabled = false;
  });

  /* ---------- modelos de semana: los botones ---------- */
  /* Plantillas ya no es un dialogo: es una sub-pestaña. `pintarModelos()` se
     llama al entrar a ella en vez de al abrir el modal. */

  // Si se pega solo la forma, elegir personas no significa nada: se esconden en
  // vez de dejarlas ahi sin efecto, que es como se construye una sorpresa.
  on('#pSinAsignar', 'change', () => {
    $('#cajaPPersonas').hidden = $('#pSinAsignar').checked;
  });

  on('#pPersonas', 'click', ev => {
    const b = ev.target.closest('button[data-pid]'); if (!b) return;
    const activo = b.getAttribute('aria-pressed') === 'true';
    b.setAttribute('aria-pressed', activo ? 'false' : 'true');
    b.classList.toggle('on', !activo);
    marcarTodosTexto();
  });

  // Una sola cantidad de semanas: estas pastillas son excluyentes.
  on('#pSemanas', 'click', ev => {
    const b = ev.target.closest('button[data-sem]'); if (!b) return;
    const v = Number(b.dataset.sem);
    const sel = $('#pSemanas').querySelector('button[aria-pressed="true"]');
    const hoy = sel ? Number(sel.dataset.sem) : 0;
    // Apretar el ULTIMO encendido lo apaga y baja uno. Lo pidio Pedro: con el
    // relleno de nivel, volver a apretar el 2 y que no pase nada se siente
    // trabado. Pero no se baja de 1: aplicar un modelo a cero semanas no
    // significa nada, asi que el 1 es el piso y volver a apretarlo no hace nada.
    marcarSemanas(v === hoy ? Math.max(1, v - 1) : v);
  });

  on('#pGuardar', 'click', async () => {
    const m = $('#pMsg');
    const nombre = $('#pNombre').value.trim();
    if (!nombre) { m.textContent = 'Ponle un nombre al modelo.'; m.className = 'msg bad'; return; }
    // Si el nombre ya existe se reemplaza, pero se pregunta: perder un modelo
    // guardado por escribir el mismo nombre seria una sorpresa cara.
    const choca = S.modelos.find(x => x.nombre.trim().toLowerCase() === nombre.toLowerCase());
    if (choca && !confirm('Ya existe un modelo llamado «' + choca.nombre + '».\n\n'
                        + 'Se reemplaza por la semana que estás viendo.')) return;
    m.textContent = 'Guardando…'; m.className = 'msg';
    try {
      recordar('guardar el modelo de semana «' + nombre + '»');
      const r = await DATOS.guardarSemanaComoModelo(S.local.id, nombre, iso(S.lunes));
      await refrescar();
      pintarModelos();
      $('#pModelo').value = r.id;
      $('#pNombre').value = '';
      const dicho = r.n
        ? `${r.reemplazo ? 'Reemplazado' : 'Guardado'} el modelo «${r.nombre}»: ${r.n} turno${r.n === 1 ? '' : 's'}.`
        : `Guardé «${r.nombre}», pero la semana que estás viendo no tiene turnos.`;
      // Sin turnos NO se cierra: es un resultado raro y conviene que lo lea aca.
      if (r.n) return listoYCerrar(dicho);
      m.textContent = dicho; m.className = 'msg';
    } catch (e) { m.textContent = e.message; m.className = 'msg bad'; }
  });

  on('#pAplicar', 'click', async () => {
    const m = $('#pMsg');
    const id = $('#pModelo').value;
    if (!id) { m.textContent = 'No hay ningún modelo para aplicar.'; m.className = 'msg bad'; return; }
    const o = opcionesModelo();
    if (!o.sinAsignar && Array.isArray(o.personas) && !o.personas.length) {
      m.textContent = 'No marcaste a nadie. Marca a alguien, o usa «solo la forma».';
      m.className = 'msg bad'; return;
    }
    const nombre = S.modelos.find(x => x.id === id);
    if (!confirm('Aplicar «' + (nombre ? nombre.nombre : '') + '» a '
               + (o.semanas === 1 ? 'esta semana' : o.semanas + ' semanas seguidas') + '.\n\n'
               + 'Se pisan los turnos que ya haya. Las ausencias se respetan.')) return;
    m.textContent = 'Aplicando…'; m.className = 'msg';
    try {
      /* `recordar()` fotografia SOLO el rango que se esta viendo —una semana—,
         pero esto aplica a `o.semanas` seguidas. Con 4 semanas, Deshacer
         reponia la primera y dejaba las otras tres con el modelo puesto, sin
         decir nada: una promesa de deshacer que no se cumplia.

         Lo mismo que ya hacen «copiar el día» y «copiar la semana a N», que
         usan `recordarDeLaBase()` justamente porque las semanas de mas alla no
         estan cargadas en `S.asign` y la foto saldria vacia. Encontrado el
         06-10 revisando que Deshacer cumpla donde se promete. */
      const f = fechas();
      await recordarDeLaBase('aplicar un modelo de semana',
                             f[0], iso(masDias(S.lunes, o.semanas * 7 - 1)));
      const r = await DATOS.aplicarModelo(S.local.id, id, iso(S.lunes), o);
      await refrescar();
      if (r.turnos)
        return listoYCerrar(`Listo: ${r.turnos} turno${r.turnos === 1 ? '' : 's'} en `
          + (r.semanas === 1 ? '1 semana.' : r.semanas + ' semanas.'));
      m.textContent = 'El modelo no tiene turnos para lo que marcaste.';
      m.className = 'msg';
    } catch (e) { m.textContent = e.message; m.className = 'msg bad'; }
  });

  on('#pBorrar', 'click', async () => {
    const m = $('#pMsg');
    const id = $('#pModelo').value; if (!id) return;
    const x = S.modelos.find(y => y.id === id);
    if (!confirm('Eliminar el modelo «' + (x ? x.nombre : '') + '».\n\n'
               + 'No toca ninguna semana ya armada.')) return;
    try {
      recordar('eliminar un modelo de semana');
      await DATOS.borrarModelo(id);
      await refrescar();
      pintarModelos();
      m.textContent = 'Modelo eliminado.'; m.className = 'msg ok';
    } catch (e) { m.textContent = e.message; m.className = 'msg bad'; }
  });

  // copiar la dotación de un día a los demás, para no teclear siete veces
  on('#btnCopiarDotacion', 'click', async () => {
    const dia = DIAS[Number(S.cobDia)];
    // Con tramos es otra cosa que copiar: se copian las FILAS del día, no las
    // casillas. La rama vieja se queda para mientras falte el SQL.
    if (!S.sinTablaTramos) {
      /* 🔴 Contaba y copiaba SOLO los tramos. Mismo defecto que tenia «Limpiar»
         (Pedro, msg 4793: «aca +linea tambien esta malo», y antes el de
         limpiar): desde el 06-10 esta pantalla muestra junto lo que vive en dos
         tablas, y los botones se quedaron mirando una.

         Con un dia cuyas lineas vienen todas de turnos —o sea en `dotacion`—
         `mios` daba 0 y el boton contestaba «no tiene ningún tramo todavía».
         Decia que no habia nada teniendo la pantalla llena. */
      const nT = Object.values(S.tramos[S.cobDia] || {}).reduce((n, l) => n + l.length, 0);
      const hoyD = S.dotacion[S.cobDia] || {};
      const nD = Object.keys(hoyD).reduce((n, pu) => n + Object.keys(hoyD[pu]).length, 0);
      if (!nT && !nD) return alert(`${dia} no tiene ninguna línea todavía.\n\nDefínelo primero y después cópialo.`);
      const destinos = [...Array(7).keys()].map(String).filter(d => d !== S.cobDia);
      if (!confirm(`Copiar las ${nT + nD} líneas de ${dia} a los otros seis días.\n\nSe pisa lo que tengan.`)) return;
      const bt = $('#btnCopiarDotacion'); bt.disabled = true;
      recordarAmbos('copiar ' + dia + ' a los demás');
      try {
        if (nT) await DATOS.copiarTramosDia(S.local.id, S.cobDia, destinos);
        if (nD) {
          // Las lineas que vienen de un turno viven en `dotacion` y se copian
          // aqui: `copiarTramosDia` solo sabe de la otra tabla.
          const filas = [];
          destinos.forEach(d => Object.keys(hoyD).forEach(pu =>
            Object.keys(hoyD[pu]).forEach(tid => filas.push({
              local_id: S.local.id, perfil: d, puesto: pu,
              turno_id: tid, cantidad: hoyD[pu][tid] }))));
          if (filas.length) await DATOS.guardarDotacionLote(filas);
        }
        await refrescar();
        verSub('nec');
      } catch (e) { S.histDot.pop(); pintarDeshacerDot(); error(e); }
      bt.disabled = false;
      return;
    }
    const origen = S.dotacion[S.cobDia] || {};
    const filas = [];
    for (let d = 0; d < 7; d++) {
      if (String(d) === S.cobDia) continue;
      for (const puesto of Object.keys(origen))
        for (const turnoId of Object.keys(origen[puesto]))
          filas.push({ local_id:S.local.id, perfil:String(d), puesto,
                       turno_id:turnoId, cantidad:origen[puesto][turnoId] });
    }
    if (!filas.length) return alert(`${dia} no tiene ningún número puesto todavía.\n\nLlénalo primero y después cópialo.`);
    if (!confirm(`Copiar la dotación de ${dia} a los otros seis días.\n\nSe pisa lo que tengan.`)) return;
    const b = $('#btnCopiarDotacion'); b.disabled = true;
    recordarDot('copiar ' + dia + ' a los demás');
    try {
      await DATOS.guardarDotacionLote(filas);     // una sola llamada, no sesenta
      await refrescar();
      verSub('nec');
    } catch (e) { S.histDot.pop(); pintarDeshacerDot(); error(e); }
    b.disabled = false;
  });
  // dejar la hoja en blanco: todo el mundo libre, sin borrar nada mas
  on('#btnLimpiarSem', 'click', async () => {
    const r = rango();
    const cuantas = Object.values(S.asign).flat()
      .filter(a => a.fecha >= r.desde && a.fecha <= r.hasta).length;
    if (!cuantas) return alert('Esta hoja ya está en blanco.');
    if (!confirm(`Dejar libre a todo el mundo del ${ddmm(r.desde)} al ${ddmm(r.hasta)}.\n\n`
      + `Se borran ${cuantas} ${cuantas === 1 ? 'asignación' : 'asignaciones'}. `
      + `Las propinas y las marcas no se tocan, y lo puedes deshacer.`)) return;
    const m = $('#msgSem');
    recordar('limpiar la hoja');
    try {
      await DATOS.borrarAsignaciones(S.local.id, r.desde, r.hasta);
      await refrescar();
      m.textContent = 'Hoja en blanco. Si fue sin querer, aprieta Deshacer.'; m.className = 'msg ok';
    } catch (e) { S.hist.pop(); pintarDeshacer(); m.textContent = e.message; m.className = 'msg bad'; }
    setTimeout(() => { $('#msgSem').textContent = ''; }, 6000);
  });
  on('#btnDeshacer', 'click', deshacer);

  /* --- el diálogo del turno --- */
  on('#dPersona', 'change', ajustarAusencia);
  on('#tabTurno', 'click', () => pestañaDlg(true));
  on('#tabAus',   'click', () => pestañaDlg(false));
  on('#dCancelar','click', () => $('#dlgTurno').close());
  on('#dGuardar', 'click', guardarDlg);
  on('#dBorrar',  'click', borrarDlg);
  // Al salir del campo se acomoda lo tecleado: «830» queda «08:30». Mientras
  // escribe no se toca, porque reescribirle el texto bajo los dedos es peor.
  ['#dEntra','#dSale'].forEach(id => on(id, 'blur', () => {
    const e = $(id), v = normalizarHora(e.value);
    if (v && v !== e.value) { e.value = v; duraDlg(); }
  }));
  ['#dEntra','#dSale','#dPausa'].forEach(id => on(id, 'input', () => {
    duraDlg();
    // Si las horas dejan de ser las de la plantilla, la plantilla SE SUELTA.
    // Si no, queda un turno que dice ser «Apertura 08:00–16:30» corriendo de
    // 13:30 a 22:00 — y como el color sale de la plantilla, el color miente.
    // Lo encontro Pedro: «¿por que Ana y Carla quedaron en el mismo color?».
    const sel = $('#dPlantilla'); const t = turnoDe(sel.value);
    if (!t) return;
    const i = deHora($('#dEntra').value), f = deHora($('#dSale').value);
    const c = Number($('#dPausa').value || 0) / 60;
    const igual = i != null && f != null
      && Math.abs(i - Number(t.inicio)) < 0.005
      && Math.abs(f - Number(t.fin)) < 0.005
      && Math.abs(c - Number(t.colacion || 0)) < 0.005;
    if (!igual) sel.value = '';
  }));
  // Elegir plantilla solo RELLENA los campos: después se editan. La plantilla
  // deja de ser la verdad y pasa a ser un atajo para no teclear.
  on('#dPlantilla', 'change', () => {
    const t = turnoDe($('#dPlantilla').value); if (!t) return;
    $('#dEntra').value = aHora(t.inicio);
    $('#dSale').value  = aHora(t.fin);
    $('#dPausa').value = Math.round(Number(t.colacion) * 60);
    duraDlg();
  });
  // Al cambiar el puesto se reordenan las pastillas: la gente de ESE puesto
  // adelante. Se conserva lo que ya estaba marcado.
  on('#dPuesto', 'change', () => {
    const marcados = [...$('#dPersonas').querySelectorAll('button[data-pid][aria-pressed="true"]')]
      .map(b => b.dataset.pid).filter(Boolean);
    pintarPastillasPersonas(marcados.length === 1 ? marcados[0] : null);
    if (marcados.length > 1) marcados.forEach(id => {
      const b = $('#dPersonas').querySelector(`button[data-pid="${id}"]`);
      if (b) { b.setAttribute('aria-pressed', 'true'); b.classList.add('on'); }
    });
    if (marcados.length) {
      const n = $('#dPersonas').querySelector('button[data-pid=""]');
      if (n) { n.setAttribute('aria-pressed','false'); n.classList.remove('on'); }
    }
    marcarTodosTextoDlg();
  });

  on('#dPersonas', 'click', ev => {
    const b = ev.target.closest('button[data-pid]'); if (!b) return;
    const sinAsignar = b.dataset.pid === '';
    const activo = b.getAttribute('aria-pressed') === 'true';
    // «sin asignar» es excluyente: un turno es de nadie o de alguien
    if (sinAsignar && !activo)
      $('#dPersonas').querySelectorAll('button[data-pid]').forEach(x => {
        x.setAttribute('aria-pressed','false'); x.classList.remove('on'); });
    if (!sinAsignar && !activo) {
      const n = $('#dPersonas').querySelector('button[data-pid=""]');
      if (n) { n.setAttribute('aria-pressed','false'); n.classList.remove('on'); }
    }
    b.setAttribute('aria-pressed', activo ? 'false' : 'true');
    b.classList.toggle('on', !activo);
    ajustarAusencia();
  });

  on('#dRepetir', 'click', ev => {
    const b = ev.target.closest('button[data-fe]'); if (!b) return;
    b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    b.classList.toggle('on');
  });

  // dejar en blanco la dotacion del DIA que se esta editando. Si quiere los
  // siete, limpia uno y lo copia a los demas: ya existe ese boton.
  on('#btnLimpiarDot', 'click', async () => {
    const dia = DIAS[Number(S.cobDia)];
    if (!S.sinTablaTramos) {
      /* 🔴 Limpiaba SOLO los tramos. Pedro: «el limpiar no limpió» (07-10,
         msg 4786), con tres lineas de Garzon intactas despues de apretarlo.

         La pantalla muestra junto lo que vive en dos tablas: la linea que
         venia de un turno esta en `dotacion` con su `turno_id`, y las demas en
         `dotacion_tramos`. Borrar una sola deja la otra en pantalla, y como se
         ven IGUALES —a proposito, desde el 06-10— parece que el boton no hizo
         nada. Hacia justo la mitad de su trabajo, que es peor que no hacerlo:
         el que mira cree que fallo y vuelve a apretar. */
      const nT = Object.values(S.tramos[S.cobDia] || {}).reduce((k, l) => k + l.length, 0);
      const hoy = S.dotacion[S.cobDia] || {};
      const nD = Object.keys(hoy).reduce((k, pu) => k + Object.keys(hoy[pu]).length, 0);
      const n = nT + nD;
      if (!n) return alert(`${dia} ya está en blanco.`);
      if (!confirm(`Borrar las ${n} ${n === 1 ? 'línea' : 'líneas'} de ${dia}.\n\n`
        + 'Los otros días no se tocan, y lo puedes deshacer.')) return;
      const msg = $('#msgDot');
      recordarAmbos('limpiar ' + dia);
      try {
        await DATOS.borrarTramos(S.local.id, S.cobDia);
        await DATOS.borrarDotacion(S.local.id, S.cobDia);
        await refrescar();
        verSub('nec');
        msg.textContent = dia + ' en blanco. Si fue sin querer, aprieta Deshacer.'; msg.className = 'msg ok';
      } catch (e) { S.histDot.pop(); pintarDeshacerDot(); msg.textContent = e.message; msg.className = 'msg bad'; }
      setTimeout(() => { const x = $('#msgDot'); if (x) x.textContent = ''; }, 6000);
      return;
    }
    const hoy = S.dotacion[S.cobDia] || {};
    let cuantas = 0;
    for (const puesto of Object.keys(hoy)) cuantas += Object.keys(hoy[puesto]).length;
    if (!cuantas) return alert(`${dia} ya está en blanco.`);
    if (!confirm(`Borrar los números de ${dia}.\n\n`
      + `Son ${cuantas} ${cuantas === 1 ? 'casilla' : 'casillas'}. Los otros días no se tocan, `
      + `y lo puedes deshacer.`)) return;
    const m = $('#msgDot');
    recordarDot('limpiar ' + dia);
    try {
      await DATOS.borrarDotacion(S.local.id, S.cobDia);
      await refrescar();
      verSub('nec');
      m.textContent = dia + ' en blanco. Si fue sin querer, aprieta Deshacer.'; m.className = 'msg ok';
    } catch (e) { S.histDot.pop(); pintarDeshacerDot(); m.textContent = e.message; m.className = 'msg bad'; }
    setTimeout(() => { const x = $('#msgDot'); if (x) x.textContent = ''; }, 6000);
  });
  on('#btnDeshacerDot', 'click', deshacerDot);
  on('#btnRepartir', 'click', repartirSemana);
  conectarTN();

  // sacar a todo el equipo de la lista. No borra: los deja inactivos, igual que
  // el Quitar de cada fila, asi que sus turnos y sus marcas quedan intactos.
  on('#btnLimpiarEq', 'click', async () => {
    const ids = S.personas.map(p => p.id);
    if (!ids.length) return alert('El equipo ya está vacío.');
    if (!confirm(`Sacar de la lista a las ${ids.length} personas del equipo.\n\n`
      + `No se borra nada: sus turnos, sus marcas y sus propinas quedan guardados, `
      + `igual que cuando quitas a alguien de a uno. Lo puedes deshacer.`)) return;
    const m = $('#msgEq');
    recordarEq(ids, 'limpiar el equipo');
    try {
      await DATOS.activarPersonas(ids, false);
      await refrescar();
      m.textContent = 'Equipo vacío. Si fue sin querer, aprieta Deshacer.'; m.className = 'msg ok';
    } catch (e) { S.histEq.pop(); pintarDeshacerEq(); m.textContent = e.message; m.className = 'msg bad'; }
    setTimeout(() => { const x = $('#msgEq'); if (x) x.textContent = ''; }, 6000);
  });
  on('#btnDeshacerEq', 'click', deshacerEq);

  /* --- cargar el equipo desde una planilla --- */
  on('#btnEjemplo', 'click', llenarEjemplo);

  // Borrar un local es de lo poco que NO se puede deshacer en esta app, asi que
  // se pide escribir el nombre. Un «¿seguro?» se aprieta sin leer; escribir el
  // nombre obliga a mirar cual se esta borrando.
  on('#btnBorrarLocal', 'click', async () => {
    const m = $('#msgBorrarLocal');
    if ((S.locales || []).length < 2) {
      m.textContent = 'Es tu único local. Crea otro antes de borrar este.';
      m.className = 'msg bad'; return;
    }
    const n = S.personas.length, t = Object.values(S.asign).flat().length;
    const r = prompt(`Vas a borrar «${S.local.nombre}» con TODO lo suyo:\n\n`
      + `· ${n} ${n === 1 ? 'persona' : 'personas'}\n`
      + `· ${t} ${t === 1 ? 'turno' : 'turnos'} de esta semana\n`
      + '· sus marcas, sus propinas y su historial\n\n'
      + 'Esto NO se puede deshacer.\n\n'
      + `Para confirmar, escribe el nombre del local: ${S.local.nombre}`);
    if (r === null) return;
    // Sin distinguir mayusculas ni tildes: la gracia de escribir el nombre es
    // obligar a MIRAR cual se borra, no tomarle una prueba de ortografia.
    if (normal(r) !== normal(S.local.nombre)) {
      m.textContent = `No se borró nada: escribiste «${r.trim()}» y el local se llama «${S.local.nombre}».`;
      m.className = 'msg bad'; return;
    }
    try {
      await DATOS.borrarLocal(S.local.id);
      try { localStorage.removeItem('malla-local'); } catch (e) {}
      await verJefe();
    } catch (e) { m.textContent = e.message; m.className = 'msg bad'; }
  });

  on('#btnPuesto', 'click', () => abrirPQ(null));
  on('#pqGuardar', 'click', guardarPQ);
  on('#pqBorrar',  'click', borrarPQ);
  on('#pqCerrar',  'click', () => $('#dlgPQ').close());

  on('#btnPlantilla', 'click', () => {
    // Punto y coma: es lo que Excel en Chile espera, y así se abre en columnas
    // con doble clic en vez de quedar todo apelmazado en la primera.
    const cab = ['Nombre','Puesto','Equipo','Valor hora','Horas contrato','Factor propina'];
    const ej  = [['Juana Pérez','Barra','Fijos','3500','45','1'],
                 ['Luis Soto','Cocina','Por llamado','4000','30','1']];
    const csv = '\uFEFF' + [cab, ...ej].map(f => f.join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }));
    a.download = 'equipo-plantilla.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  on('#btnCargar', 'click', () => $('#archivoEq').click());
  on('#archivoEq', 'change', ev => {
    const f = ev.target.files && ev.target.files[0]; if (!f) return;
    const lector = new FileReader();
    lector.onload = () => { pintarPrevia(analizarPlanilla(String(lector.result || ''))); ev.target.value = ''; };
    lector.onerror = () => { $('#previaEq').innerHTML = '<p class="msg bad">No se pudo leer el archivo.</p>'; };
    lector.readAsText(f, 'UTF-8');
  });

  // Cerrar el día es cuando se carga la venta. Skello la pide ahí y tiene
  // razón: es el momento en que el jefe ya está haciendo la caja, y no una
  // pestaña aparte que hay que acordarse de visitar.
  // Marcar el dia entero de una. Pedro lo pidio para poder MOSTRAR la app sin
  // tener que abrir el link de cada persona y hacerse pasar por ella.
  const todosDelDia = () => S.personas.flatMap(p => turnosDe(p.id, S.relojDia).map(a => ({ p, a })));

  on('#btnMarcarTodos', 'click', async () => {
    const fe = S.relojDia; const lista = todosDelDia();
    if (!lista.length) return alert('Nadie tiene turno este día.');
    if (!confirm(`Marcar entrada y salida de ${lista.length} ${lista.length === 1 ? 'turno' : 'turnos'} del `
      + ddmm(fe) + ', en el horario que estaba planificado.\n\n'
      + 'Queda registrado que las marcaste tú y no cada persona.')) return;
    const b = $('#btnMarcarTodos'); b.disabled = true; b.textContent = 'Marcando…';
    const m = $('#msgReloj');
    try {
      for (const { p, a } of lista) {
        await marcarPorElJefe('entrada', a.id, p.id, fe);
        await marcarPorElJefe('salida',  a.id, p.id, fe);
      }
      await refrescar();
      m.textContent = `Listo: ${lista.length} ${lista.length === 1 ? 'turno marcado' : 'turnos marcados'}.`;
      m.className = 'msg ok';
    } catch (e) { m.textContent = e.message; m.className = 'msg bad'; }
    b.disabled = false; b.textContent = 'Marcar el día completo';
    setTimeout(() => { const x = $('#msgReloj'); if (x) x.textContent = ''; }, 6000);
  });

  on('#btnBorrarMarcas', 'click', async () => {
    const fe = S.relojDia; const lista = todosDelDia().filter(x => marcaAsig(x.a).entrada);
    if (!lista.length) return alert('No hay marcas que borrar en este día.');
    if (!confirm(`Borrar las marcas de ${lista.length} ${lista.length === 1 ? 'turno' : 'turnos'} del `
      + ddmm(fe) + '.\n\nLo planificado no se toca.')) return;
    const m = $('#msgReloj');
    try {
      for (const { p, a } of lista) await marcarPorElJefe('borrar', a.id, p.id, fe);
      await refrescar();
      m.textContent = 'Marcas borradas.'; m.className = 'msg ok';
    } catch (e) { m.textContent = e.message; m.className = 'msg bad'; }
    setTimeout(() => { const x = $('#msgReloj'); if (x) x.textContent = ''; }, 6000);
  });

  on('#btnCerrarDia', 'click', async () => {
    const fe = S.relojDia; if (!fe) return;
    const d = S.dias[fe] || {};
    const sinSalir = S.personas.flatMap(p => turnosDe(p.id, fe))
      .filter(a => { const m = marcaAsig(a); return m.entrada && !m.salida; }).length;
    if (sinSalir && !confirm(`Hay ${sinSalir} ${sinSalir === 1 ? 'persona que marcó entrada y no salida' : 'personas que marcaron entrada y no salida'}.\n\n`
      + 'A esas se les va a pagar lo planificado. ¿Cierro igual?')) return;

    const txt = prompt('¿Cuánto se vendió el ' + ddmm(fe) + '?\n\n'
      + 'Sirve para el costo sobre venta. Lo puedes corregir después.',
      d.venta ? String(d.venta) : '');
    if (txt === null) return;
    const venta = Number(soloDigitos(txt)) || 0;
    const m = $('#msgReloj');
    try {
      await DATOS.cerrarDia(S.local.id, fe, venta);
      await refrescar();
      m.textContent = 'Día cerrado con una venta de ' + clp(venta) + '.'; m.className = 'msg ok';
    } catch (e) { m.textContent = e.message; m.className = 'msg bad'; }
    setTimeout(() => { const x = $('#msgReloj'); if (x) x.textContent = ''; }, 6000);
  });

  on('#objetivoPct', 'change', async ev => {
    const v = Number(ev.target.value) || 30;
    try { S.local = await DATOS.guardarLocal(S.local.id, { objetivo_pct: v }); pintarCobertura(); pintarResumenSemana(); }
    catch (e) { error(e); }
  });
  on('#filtroPuesto', 'change', ev => { S.filtro = ev.target.value; pintarPlan(); });
  on('#filtroEquipo', 'change', ev => { S.filtroE = ev.target.value; pintarPlan(); });
  on('#btnImprimir', 'click', () => window.print());
  on('#btnIrPublicar', 'click', () => $('#tab-link').click());

  // crear local, con turnos de partida para que no arranque en blanco
  on('#formLocal', 'submit', async ev => {
    ev.preventDefault();
    const nombre = $('#nombreLocal').value.trim(); if (!nombre) return;
    $('#msgLocal').textContent = 'Creando…';
    try {
      S.local = await DATOS.crearLocal(nombre);
      await Promise.all([
        DATOS.crearTurno(S.local.id, { nombre:'Apertura', inicio:8,  fin:16.5, colacion:0.5, orden:1 }),
        DATOS.crearTurno(S.local.id, { nombre:'Tarde',    inicio:13, fin:21.5, colacion:0.5, orden:2 }),
        DATOS.crearTurno(S.local.id, { nombre:'Cierre',   inicio:17, fin:25,   colacion:0.5, orden:3 }),
      ]);
      try { localStorage.setItem('malla-local', S.local.id); } catch (e) {}
      $('#msgLocal').textContent = '';
      $('#nombreLocal').value = '';
      await verJefe();
    } catch (e) { $('#msgLocal').textContent = e.message; $('#msgLocal').className = 'msg bad'; }
  });

  on('#btnCerrarSemana', 'click', async () => {
    const lista = S.personas.map(p => ({ p, dif: analizar(p).dif })).filter(x => Math.abs(x.dif) >= 0.01);
    if (!lista.length) return alert('No hay diferencias que sumar esta semana.');
    const detalle = lista.map(x => `· ${x.p.nombre}: ${x.dif>0?'+':''}${hfmt(x.dif)} h`).join('\n');
    if (!confirm('Sumar al saldo de cada uno la diferencia entre lo planificado y su contrato:\n\n'
               + detalle + '\n\nEsto se hace una vez por semana.')) return;
    try {
      for (const x of lista)
        await DATOS.guardarPersona(x.p.id, { saldo_horas: Number(x.p.saldo_horas || 0) + x.dif });
      await refrescar();
    } catch (e) { error(e); }
  });
  on('#cancelarLocal', 'click', () => { $('#cardLocal').hidden = true; $('#app').hidden = false; });
  // La lista va ordenada por puesto y nombre, asi que la persona recien creada
  // NO aparece debajo del boton sino donde le toca por orden — y si hay diez,
  // queda fuera de la pantalla y parece que el boton no hizo nada.
  on('#btnPersona', 'click', async () => {
    try {
      const nueva = await DATOS.crearPersona(S.local.id, { nombre:'Nueva persona', rol:'', valor_hora:2900,
            horas_contrato:42, factor_propina:1 });
      S.recien = nueva.id;
      await refrescar();
      mostrarRecien();
    } catch (e) { error(e); }
  });
  // Antes creaba «Turno 4» de 9:00 a 17:00 sin preguntar nada y te dejaba
  // corrigiendo campos sueltos. Es la decision 6: el mismo boton en los dos
  // sitios donde uno lo busca, Equipo y «Cuanta gente necesito».
  on('#btnTurno', 'click', () => abrirTN(null));
  on('#bloqTope', 'change', async ev => {
    try { S.local = await DATOS.guardarLocal(S.local.id, { bloquear_sobre_tope: ev.target.checked }); }
    catch (e) { error(e); }
  });
  on('#btnCopiarPub', 'click', async () => {
    const m = $('#msgPub');
    try { await navigator.clipboard.writeText($('#salidaPub').value); m.textContent = 'Copiado'; }
    catch (e) { $('#salidaPub').select(); m.textContent = 'Selecciónalo y copia con el teclado'; }
    setTimeout(() => m.textContent = '', 2600);
  });
}

async function arrancar() {
  $('#pie').textContent = location.host || 'local';
  if (!revisar()) { $('#vistaJefe').hidden = false; return; }
  marca('#c-db','ok');
  conectarLogin(); conectarApp();

  const token = tokenDelLink();
  if (token) return pintarTrabajador(token);

  await verJefe();
  sb.auth.onAuthStateChange(() => { if (!tokenDelLink()) verJefe().catch(error); });
  window.addEventListener('hashchange', () => {
    const t = tokenDelLink();
    if (t) pintarTrabajador(t); else { $('#vistaTrab').hidden = true; verJefe().catch(error); }
  });
}

// Si algun boton quedo sin conectar, la app parece funcionar pero no responde.
// Vale mas un aviso feo que un boton mudo.
function avisarSinConectar() {
  if (!SIN_CONECTAR.length) return;
  const d = document.getElementById('diag');
  if (!d) return;
  d.hidden = false;
  document.getElementById('diagNota').textContent =
    'Quedaron sin conectar ' + SIN_CONECTAR.length + ' controles: ' + SIN_CONECTAR.join(', ')
    + '. Los botones existen pero no responden.';
}

arrancar().then(avisarSinConectar).catch(e => {
  // ultimo recurso: que la pagina diga algo en vez de quedarse muda
  const d = document.getElementById('diag');
  if (d) { d.hidden = false; document.getElementById('diagNota').textContent = 'Error al arrancar: ' + (e && e.message ? e.message : e); }
  const v = document.getElementById('vistaJefe'); if (v) v.hidden = false;
  console.error(e);
});
