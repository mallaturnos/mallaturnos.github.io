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
const S = { local:null, personas:[], turnos:[], asign:{}, marcas:{}, dias:{}, abiertos:[],
            lunes:lunesDe(new Date()), modo:'semana', dia:new Date(), filtro:'', filtroE:'', cobDia:'0', dotacion:{}, canal:null,
            hist:[], histDot:[], histEq:[], recien:null };

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
  const filas = Object.values(S.asign).flat()
    .filter(a => a.fecha >= r.desde && a.fecha <= r.hasta)
    .map(a => ({ persona_id:a.persona_id, fecha:a.fecha, turno_id:a.turno_id,
                 ausencia:a.ausencia, inicio:a.inicio, fin:a.fin,
                 colacion:a.colacion, puesto:a.puesto, nota:a.nota }));
  S.hist.push({ desde:r.desde, hasta:r.hasta, filas, que: que || 'el ultimo cambio' });
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
    await DATOS.reponerDotacion(S.local.id, h.filas);
    await refrescar();
    $('#detNecesita').open = true;
    if (m) { m.textContent = 'Deshecho: ' + h.que + '.'; m.className = 'msg ok'; }
  } catch (e) {
    S.histDot.push(h);                   // no se pudo: el paso atras sigue ahi
    if (m) { m.textContent = e.message; m.className = 'msg bad'; }
  }
  pintarDeshacerDot();
  setTimeout(() => { const x = $('#msgDot'); if (x) x.textContent = ''; }, 5000);
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
// Dos bloques se pisan si comparten aunque sea un minuto. Se compara por horas
// y no por turno_id porque un turno asignado puede no venir de ninguna
// plantilla: se le escribieron las horas y ya.
const solapan = (a, t) => Number(a.inicio) < Number(t.fin) && Number(t.inicio) < Number(a.fin);

// Todos los puestos que existen: los habituales del equipo MAS los que se usan
// en alguna asignacion. Sin esto, un puesto que solo se trabaja de vez en
// cuando no aparece para elegirlo ni para pedir dotacion.
const puestosConocidos = () => [...new Set([
  ...S.personas.map(p => (p.rol || '').trim()),
  ...Object.values(S.asign).flat().map(a => (a.puesto || '').trim()),
].filter(Boolean))].sort();

// El filtro por puesto aplica a las tres vistas del plan. No toca las propinas
// ni las confirmaciones: el reparto tiene que considerar SIEMPRE a todo el
// equipo, aunque en pantalla estés mirando solo la cocina.
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
const fechas = () => Array.from({length:7}, (_,i) => iso(masDias(S.lunes, i)));

// El rango que hay que traer de la base depende de la vista: un dia, una
// semana o un mes entero. Todo lo demas se calcula sobre lo que ya esta cargado.
function rango() {
  if (S.modo === 'dia')  return { desde: iso(S.dia), hasta: iso(S.dia) };
  if (S.modo === 'mes') {
    const a = new Date(S.lunes.getFullYear(), S.lunes.getMonth(), 1);
    const b = new Date(S.lunes.getFullYear(), S.lunes.getMonth() + 1, 0);
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
  const [personas, turnos, asign, marcas, dias, abiertos, dot] = await Promise.all([
    DATOS.personas(S.local.id), DATOS.turnos(S.local.id),
    DATOS.asignaciones(S.local.id, desde, hasta), DATOS.marcas(S.local.id, desde, hasta),
    DATOS.dias(S.local.id, desde, hasta), DATOS.abiertos(S.local.id, desde),
    DATOS.dotacion(S.local.id),
  ]);
  S.personas = personas || []; S.turnos = turnos || []; S.abiertos = abiertos || [];
  // Un dia puede traer VARIOS turnos de la misma persona (turno partido), asi
  // que cada casilla guarda una LISTA, no una fila.
  S.asign = {};
  (asign||[]).forEach(a => {
    const k = a.persona_id + '|' + a.fecha;
    (S.asign[k] = S.asign[k] || []).push(a);
  });
  Object.values(S.asign).forEach(l => l.sort((x,y) => (x.inicio||0) - (y.inicio||0)));
  S.marcas = {}; (marcas||[]).forEach(m => { S.marcas[m.persona_id + '|' + m.fecha] = m; });
  S.dias = {};   (dias||[]).forEach(d => { S.dias[d.fecha] = d; });
  S.dotacion = {};
  (dot||[]).forEach(x => {
    const perfil = S.dotacion[x.perfil] = S.dotacion[x.perfil] || {};
    (perfil[x.puesto || ''] = perfil[x.puesto || ''] || {})[x.turno_id] = x.cantidad;
  });
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
  if (selE) {
    const es = equipos();
    selE.hidden = !es.length;                 // si nadie tiene equipo, no estorba
    selE.innerHTML = '<option value="">Todos los equipos</option>' +
      es.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
    if (S.filtroE && !es.includes(S.filtroE)) S.filtroE = '';
    selE.value = S.filtroE;
    selE.classList.toggle('activo', !!S.filtroE);
  }
  $('#cajaSemana').hidden = S.modo !== 'semana';
  $('#cajaDia').hidden    = S.modo !== 'dia';
  $('#cajaMes').hidden    = S.modo !== 'mes';
  $('#btnCopiarSem').hidden = S.modo !== 'semana';
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
const deHora = v => { const [h,m] = String(v||'').split(':').map(Number);
  return isFinite(h) ? h + (m||0)/60 : null; };

function duraDlg() {
  const i = deHora($('#dEntra').value), fRaw = deHora($('#dSale').value);
  if (i == null || fRaw == null) { $('#dDura').value = ''; return null; }
  const f = fRaw <= i ? fRaw + 24 : fRaw;                 // cruza la medianoche
  const h = f - i - (Number($('#dPausa').value) || 0) / 60;
  $('#dDura').value = h > 0 ? hfmt(h) + ' h' : '—';
  return { inicio: i, fin: f, colacion: (Number($('#dPausa').value) || 0) / 60, horas: h };
}

function abrirTurno(p, fecha, asig) {
  DLG = { p, fecha, asig };
  const esNuevo = !asig, esAus = asig && asig.ausencia;
  $('#dlgTit').textContent = esNuevo ? 'Agregar turno' : (esAus ? 'Editar ausencia' : 'Editar turno');
  $('#dlgSub').textContent = p.nombre + ' · ' + DIAS[(new Date(fecha + 'T00:00:00').getDay() + 6) % 7] + ' ' + ddmm(fecha);
  $('#dlgMsg').textContent = '';
  $('#dBorrar').hidden = esNuevo;

  $('#dPlantilla').innerHTML = '<option value="">— escribir las horas —</option>' +
    S.turnos.map(t => `<option value="${t.id}">${esc(t.nombre)} ${hhmm(t.inicio)}–${hhmm(t.fin)}</option>`).join('');
  $('#dPuesto').innerHTML = opcionesPuesto(asig ? puestoDe(asig, p) : (p.rol||'').trim());
  $('#dAusencia').innerHTML = Object.entries(AUSENCIAS)
    .filter(([k]) => k !== 'L')
    .map(([k,v]) => `<option value="${k}">${v}</option>`).join('');

  // La semana COMPLETA, con el día que se está creando ya marcado y bloqueado.
  // Antes se escondía ese día, y Pedro preguntó «¿por qué para Luz no me
  // aparece el lunes?»: esconderlo hace pensar que falta algo. Skello los
  // muestra los siete y deja marcado el del turno.
  const f = fechas();
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
    $('#dSale').value  = t ? aHora(t.fin)    : '18:00';
    $('#dPausa').value = t ? Math.round(Number(t.colacion) * 60) : 30;
    $('#dPlantilla').value = t ? t.id : '';
    $('#dNota').value = '';
  }
  if (esAus) $('#dAusencia').value = asig.ausencia;
  pestañaDlg(!esAus);
  duraDlg();
  $('#dlgTurno').showModal();
  setTimeout(() => $('#dEntra').focus(), 30);
}

function pestañaDlg(turno) {
  $('#paneTurno').hidden = !turno; $('#paneAus').hidden = turno;
  $('#tabTurno').classList.toggle('primary', turno);
  $('#tabAus').classList.toggle('primary', !turno);
}

async function guardarDlg() {
  const { p, fecha, asig } = DLG;
  const m = $('#dlgMsg');
  const esAus = $('#paneAus').hidden === false;

  if (esAus) {
    recordar('la ausencia de ' + p.nombre + ' del ' + ddmm(fecha));
    try {
      await DATOS.ponerAusencia(S.local.id, p.id, fecha, $('#dAusencia').value);
      await refrescar(); $('#dlgTurno').close();
    } catch (e) { S.hist.pop(); pintarDeshacer(); m.textContent = e.message; m.className = 'msg bad'; }
    return;
  }

  const d = duraDlg();
  if (!d) { m.textContent = 'Faltan las horas.'; m.className = 'msg bad'; return; }
  if (d.horas <= 0) { m.textContent = 'La pausa se come el turno entero.'; m.className = 'msg bad'; return; }

  const campos = { turno_id: $('#dPlantilla').value || null, inicio: d.inicio, fin: d.fin,
                   colacion: d.colacion, puesto: $('#dPuesto').value, nota: $('#dNota').value.trim() };
  // Solo los botones que LLEVAN fecha: el del día del propio turno va marcado
  // pero sin `data-fe`, y colarlo aquí mandaba a la base una fila con la fecha
  // vacía. El Set evita además repetir ese mismo día.
  const marcados = [...$('#dRepetir').querySelectorAll('button[data-fe][aria-pressed="true"]')]
    .map(b => b.dataset.fe).filter(Boolean);
  const dias = [...new Set([fecha, ...marcados])];

  recordar(asig ? 'el turno de ' + p.nombre + ' del ' + ddmm(fecha)
                : 'agregar turno a ' + p.nombre);
  try {
    if (asig) await DATOS.editarAsignacion(asig.id, campos);
    else for (const fe of dias) {
      // si ese día ya tiene el mismo bloque, no se duplica
      if (turnosDe(p.id, fe).some(x => Number(x.inicio) === d.inicio)) continue;
      await DATOS.crearAsignacion(S.local.id, p.id, fe, campos);
    }
    await refrescar(); $('#dlgTurno').close();
  } catch (e) { S.hist.pop(); pintarDeshacer(); m.textContent = e.message; m.className = 'msg bad'; }
}

async function borrarDlg() {
  const { p, fecha, asig } = DLG; if (!asig) return;
  recordar('quitar un turno de ' + p.nombre + ' del ' + ddmm(fecha));
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
    const ci = t ? (S.turnos.findIndex(x => x.id === t.id) % 4) + 1 : 5;
    const pu = puestoDe(a, p);
    return `<span class="bloque" data-c="${ci}" data-asig="${a.id}" data-fecha="${fe}"
              role="button" tabindex="0" title="Editar este turno">
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

function pintarSemana() {
  const f = fechas();
  $('#semTitulo').textContent = ddmm(f[0]) + ' al ' + ddmm(f[6]);
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
  const sinDueno = el('tr','noasig');
  sinDueno.innerHTML = '<th scope="row">Sin asignar<span class="rol">turnos abiertos</span></th>' +
    f.map(fe => {
      const aqui = S.abiertos.filter(a => a.fecha === fe);
      if (!aqui.length) return '<td class="cell"></td>';
      return '<td class="cell">' + aqui.map(a => {
        const t = turnoDe(a.turno_id);
        const quien = a.tomado_por ? S.personas.find(x => x.id === a.tomado_por) : null;
        return `<span class="chip ${quien ? 'tomado' : ''}" title="${quien ? 'Lo tomó ' + esc(quien.nombre) : 'Sin tomar'}">
                  ${t ? esc(t.nombre) : '—'}${quien ? ' · ' + esc(quien.nombre.split(' ')[0]) : ''}</span>`;
      }).join('') + '</td>';
    }).join('') + '<td class="tot"></td>';
  sinDueno.addEventListener('click', () => $('#tab-abi').click());
  if (S.abiertos.some(a => f.includes(a.fecha))) cuerpo.appendChild(sinDueno);

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
      f.map(fe => `<td class="cell">${pintarCasilla(p, fe)}</td>`).join('')
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
      if (hd > 10) alertas.push({n:'bad', t:`${DIAS[i]} sobre 10 h`});
    }
    else if (a.ausencia && a.ausencia !== 'L') aus++;
  });
  const tope = Number(p.horas_contrato) || Number(S.local.tope_semanal) || 42;
  if (horas > tope) alertas.push({ n:'bad', t:`${hfmt(horas)} h · ${hfmt(horas-tope)} sobre su contrato de ${hfmt(tope)}` });
  if (trabajados === 7) alertas.push({ n:'bad', t:'7 días seguidos' });
  // disponibilidad: avisa, no bloquea. El encargado decide igual, pero viéndolo.
  const nd = p.no_disponible || [];
  f.forEach((fe, i) => {
    if (turnosDe(p.id, fe).length && nd.includes(i))
      alertas.push({ n:'warn', t:`${DIAS[i]}: dijo que no puede` });
  });
  if (aus) alertas.push({ n:'info', t:`${aus} ${aus===1?'día':'días'} de ausencia` });
  if (!alertas.some(a => a.n==='bad' || a.n==='warn')) alertas.unshift({ n:'ok', t:'conforme' });
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
      const dif = a.dif;
      h.innerHTML = hfmt(a.horas) + ' h' + (Math.abs(dif) >= 0.25
        ? `<span class="dif ${dif > 0 ? 'mas' : 'menos'}">${dif > 0 ? '+' : '−'} ${hfmt(Math.abs(dif))} h</span>`
        : '<span class="dif justo">al día</span>');
      h.classList.toggle('over', a.horas > a.tope);
    }
    lista.appendChild(el('li', '', `
      <div class="prow"><span class="pname">${esc(p.nombre)}</span>
        <span class="pstat">${hfmt(a.horas)} h · ${a.trabajados} d · ${clp(a.costo)}${
          Math.abs(a.dif) >= 0.5 ? ` · <b style="color:${a.dif>0?'var(--warn)':'var(--fg-dim)'}">${a.dif>0?'+':''}${hfmt(a.dif)} h</b>` : ''}${
          Number(p.saldo_horas) ? ` · saldo ${Number(p.saldo_horas)>0?'+':''}${hfmt(Number(p.saldo_horas))} h` : ''}</span></div>
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

/* ---------- vista del día: quién está hoy, por turno ---------- */
function pintarDia() {
  const fe = iso(S.dia);
  const i = (S.dia.getDay() + 6) % 7;
  $('#semTitulo').textContent = DIAS[i] + ' ' + ddmm(fe);

  const caja = $('#cajaDia'); caja.innerHTML = '';
  // Una persona con turno partido aparece una vez POR BLOQUE, no una sola.
  const conTurno = personasVisibles().flatMap(p => turnosDe(p.id, fe).map(a => ({ p, a })));

  if (!conTurno.length) {
    caja.innerHTML = '<p class="vacio">Nadie tiene turno este día.</p>';
    $('#semPersonas').innerHTML = ''; $('#semPie').innerHTML = ''; return;
  }

  // Agrupados por HORARIO REAL y ordenados por hora de entrada, que es como se
  // lee el día. Antes se agrupaba por plantilla, pero ahora dos turnos de la
  // misma plantilla pueden tener horas distintas: la plantilla solo da el nombre.
  const porHorario = {};
  conTurno.forEach(x => {
    const k = Number(x.a.inicio) + '|' + Number(x.a.fin) + '|' + Number(x.a.colacion||0);
    (porHorario[k] = porHorario[k] || { a: x.a, gente: [] }).gente.push(x.p);
  });
  Object.values(porHorario)
    .sort((u,v) => Number(u.a.inicio) - Number(v.a.inicio) || Number(u.a.fin) - Number(v.a.fin))
    .forEach(({ a: ta, gente }) => {
    const t = ta.turno_id ? turnoDe(ta.turno_id) : null;
    const hs = horasAsig(ta);
    const costo = gente.reduce((s,p) => s + hs * (p.valor_hora||0), 0);
    caja.appendChild(el('div','turnodia', `
      <div class="turnodia-h">
        <b>${esc(t ? t.nombre : hhmm(ta.inicio) + '–' + hhmm(ta.fin))}</b>
        <span>${hhmm(ta.inicio)}–${hhmm(ta.fin)} · ${hfmt(hs)} h · ${gente.length} ${gente.length===1?'persona':'personas'} · ${clp(costo)}</span>
      </div>
      <ul>${gente.map(p => {
        const m = marcaDe(p.id, fe);
        const hl = horaLlegada(m);
        const tarde = hl !== null ? Math.round((hl - Number(ta.inicio))*60) : null;
        const et = m.llego === true
                 ? `<span class="flag ok">llegó${hl !== null ? ' ' + hhmm(hl) : ''}${tarde > 5 ? ' · '+tarde+' min tarde' : ''}</span>`
                 : m.confirmo === true ? '<span class="flag info">confirmó</span>'
                 : m.confirmo === false ? '<span class="flag bad">no puede</span>' : '';
        return `<li><b>${esc(p.nombre)}</b> <span class="rol">${esc(p.rol||'')}</span> ${et}</li>`;
      }).join('')}</ul>`));
  });

  const ausentes = personasVisibles().map(p => ({ p, a: ausenciaDe(p.id, fe) }))
    .filter(x => x.a && x.a.ausencia !== 'L');
  if (ausentes.length) caja.appendChild(el('div','turnodia', `
    <div class="turnodia-h"><b>Ausencias</b></div>
    <ul>${ausentes.map(x => `<li><b>${esc(x.p.nombre)}</b> <span class="rol">${AUSENCIAS[x.a.ausencia]}</span></li>`).join('')}</ul>`));

  pintarResumenSemana();
}

/* ---------- vista del mes: el patrón de la dotación de un vistazo ---------- */
function pintarMes() {
  const ds = diasDelMes();
  const ref = new Date(ds[0] + 'T00:00:00');
  $('#semTitulo').textContent = ref.toLocaleDateString('es-CL', { month:'long', year:'numeric' });

  $('#mesCab').innerHTML = '<th>Persona</th>' + ds.map(f => {
    const d = new Date(f + 'T00:00:00'), i = (d.getDay() + 6) % 7;
    return `<th class="${i>=5?'fin':''}">${d.getDate()}<span class="dsem">${DIAS[i][0]}</span></th>`;
  }).join('') + '<th>Horas</th>';

  const cuerpo = $('#mesCuerpo'); cuerpo.innerHTML = '';
  personasVisibles().forEach(p => {
    let horas = 0;
    const celdas = ds.map(f => {
      const ts = turnosDe(p.id, f), a = ausenciaDe(p.id, f);
      const t = ts[0];
      if (t) {
        horas += horasDia(p.id, f);
        const pl = t.turno_id ? turnoDe(t.turno_id) : null;
        const ci = pl ? (S.turnos.findIndex(x => x.id === pl.id) % 4) + 1 : 5;
        const tit = ts.map(x => hhmm(x.inicio) + '–' + hhmm(x.fin)).join(' + ');
        // con turno partido la inicial sola miente: se marca que son dos
        return `<td class="mcel" data-c="${ci}" title="${esc(tit)}">${esc(
          (pl ? pl.nombre[0] : hhmm(t.inicio).slice(0,2)))}${ts.length > 1 ? '<sup>'+ts.length+'</sup>' : ''}</td>`; }
      if (a && a.ausencia && a.ausencia !== 'L')
        return `<td class="mcel aus" title="${AUSENCIAS[a.ausencia]}">${a.ausencia}</td>`;
      return '<td class="mcel"></td>';
    }).join('');
    cuerpo.innerHTML += `<tr><th class="r" scope="row">${esc(p.nombre)}<span class="rol">${esc(p.rol||'')}</span></th>${celdas}<td class="tot">${hfmt(horas)} h</td></tr>`;
  });
  $('#semPersonas').innerHTML = ''; $('#semPie').innerHTML = '';
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

function pintarTurnos() {
  const box = $('#eqTurnos'); box.innerHTML = '';
  S.turnos.forEach(t => {
    const row = el('div','rowline', `
      ${filaCampo('Nombre','text',t.nombre,'data-k="nombre"')}
      ${filaCampo('Entra','time',hhmm(t.inicio),'data-k="inicio"')}
      ${filaCampo('Sale','time',hhmm(t.fin),'data-k="fin"')}
      ${filaCampo('Colación (min)','number',Math.round(t.colacion*60),'data-k="colacion" class="n" min="0" max="120" step="15"')}
      <div class="fld"><label>Horas</label><input type="text" value="${hfmt(horasDe(t))}" readonly tabindex="-1" class="n"></div>
      <button class="mini" data-del="1">Quitar</button>`);
    box.appendChild(row);
    let tm = null;
    row.querySelectorAll('input[data-k]').forEach(inp => {
      inp.addEventListener('input', () => {
        clearTimeout(tm);
        tm = setTimeout(async () => {
          const k = inp.dataset.k; let campos = {};
          if (k === 'nombre') campos.nombre = inp.value;
          else if (k === 'colacion') campos.colacion = (Number(inp.value)||0)/60;
          else {
            const v = aDec(inp.value);
            if (k === 'inicio') { campos.inicio = v; if (Number(t.fin) <= v) campos.fin = v + 8; }
            else campos.fin = v <= Number(t.inicio) ? v + 24 : v;   // cruza la medianoche
          }
          try { Object.assign(t, await DATOS.guardarTurno(t.id, campos)); pintarTurnos(); pintarSemana(); pintarAbiertos(); }
          catch (e) { error(e); }
        }, 600);
      });
    });
    row.querySelector('[data-del]').addEventListener('click', async () => {
      if (S.turnos.length <= 1) return alert('Tiene que quedar al menos un turno.');
      if (!confirm('¿Quitar el turno "' + t.nombre + '"?')) return;
      try { await DATOS.quitarTurno(t.id); await refrescar(); } catch (e) { error(e); }
    });
  });
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
    const celdas = ts.map(t => {
      const faltas = [], sobras = [];
      ps.forEach(puesto => {
        const req = necesita(String(d), puesto, t.id);
        if (req) hayDotacion = true;
        const hay = asignados(fe, t.id, puesto);
        if (req && hay < req) { faltas.push(`${req - hay} ${puesto.toLowerCase()}`); faltanTot += req - hay; }
        else if (req && hay > req) { sobras.push(`${hay - req} ${puesto.toLowerCase()}`); sobranTot += hay - req; }
      });
      const total = ps.reduce((n,x) => n + asignados(fe, t.id, x), 0);
      let cls = 'ok', txt = total ? total + (total === 1 ? ' persona' : ' personas') : '—';
      if (faltas.length) { cls = 'falta'; txt = 'falta ' + faltas.join(', '); }
      else if (sobras.length) { cls = 'sobra'; txt = 'sobra ' + sobras.join(', '); }
      return `<div class="cobcel ${cls}"><b>${esc(t.nombre)}</b><span>${esc(txt)}</span></div>`;
    }).join('');
    cont.appendChild(el('div','cobfila', `<div class="covday">${DIAS[d]} <span class="num">${ddmm(fe)}</span></div>
      <div class="cobcels" style="grid-template-columns:repeat(${ts.length},1fr)">${celdas}</div>`));
  });

  /* ---- abajo: cuánta necesito, un día a la vez, por puesto y por turno ---- */
  const tabs = $('#cobTabs'); tabs.innerHTML = '';
  DIAS.forEach((dn, i) => {
    const b = el('button','act' + (String(i) === S.cobDia ? ' primary' : ''), dn);
    b.addEventListener('click', () => { S.cobDia = String(i); pintarCobertura(); });
    tabs.appendChild(b);
  });

  const box = $('#needDia'); box.innerHTML = '';
  if (!ps.length || !ts.length) {
    box.innerHTML = '<p class="vacio">Primero agrega tu equipo y tus turnos.</p>';
  } else {
    const tabla = el('table','neces');
    tabla.innerHTML = '<thead><tr><th>Puesto</th>' +
      ts.map(t => `<th>${esc(t.nombre)}<span class="num">${hhmm(t.inicio)}</span></th>`).join('') + '</tr></thead>';
    const tb = el('tbody');
    ps.forEach(puesto => {
      const tr = el('tr');
      tr.innerHTML = `<th scope="row">${esc(puesto)}</th>` +
        ts.map(t => `<td><input class="n" type="number" min="0" max="99"
          value="${necesita(S.cobDia, puesto, t.id)}" data-t="${t.id}"
          aria-label="${esc(puesto)}, ${DIAS[Number(S.cobDia)]}, turno ${esc(t.nombre)}"></td>`).join('');
      tb.appendChild(tr);
      tr.querySelectorAll('input[data-t]').forEach(inp => {
        let tm = null;
        inp.addEventListener('input', () => {
          clearTimeout(tm);
          tm = setTimeout(async () => {
            const v = Number(inp.value) || 0;
            recordarDot('cambiar un número');     // la foto, antes de tocar nada
            const pf = S.dotacion[S.cobDia] = S.dotacion[S.cobDia] || {};
            (pf[puesto] = pf[puesto] || {})[inp.dataset.t] = v;
            try { await DATOS.guardarDotacion(S.local.id, S.cobDia, puesto, inp.dataset.t, v); pintarCobertura(); }
            catch (e) { error(e); }
          }, 600);
        });
      });
    });
    tabla.appendChild(tb);
    box.appendChild(tabla);
  }

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
    { k:'Gente que falta', v: hayDotacion ? faltanTot : '—', n:'turnos con menos de la que pediste', c: faltanTot ? 'alert' : '' },
    { k:'Gente de sobra', v: hayDotacion ? sobranTot : '—', n:'turnos con más de la necesaria' },
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
  const pesos = S.personas.map(p => {
    return horasDia(p.id, fecha) * (Number(p.factor_propina)||0);
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
function pintarAbiertos() {
  const f = fechas();
  const sd = $('#abiDia'), st = $('#abiTurno');
  const dv = sd.value, tv = st.value;
  sd.innerHTML = f.map((fe,i) => `<option value="${fe}">${DIAS[i]} ${ddmm(fe)}</option>`).join('');
  st.innerHTML = S.turnos.map(t => `<option value="${t.id}">${esc(t.nombre)} ${hhmm(t.inicio)}–${hhmm(t.fin)}</option>`).join('');
  if (dv && f.includes(dv)) sd.value = dv;
  if (tv && S.turnos.some(t => t.id === tv)) st.value = tv;

  const bq = $('#bloqTope');
  if (bq && document.activeElement !== bq) bq.checked = !!S.local.bloquear_sobre_tope;

  const lista = $('#abiLista'); lista.innerHTML = '';
  if (!S.abiertos.length) { lista.innerHTML = '<p class="vacio">No hay turnos abiertos. Publica uno cuando te falte gente.</p>'; return; }
  S.abiertos.forEach(a => {
    const t = turnoDe(a.turno_id);
    const quien = a.tomado_por ? S.personas.find(p => p.id === a.tomado_por) : null;
    // Choca solo si el horario SE PISA con otro turno suyo: con el turno partido
    // tener algo ese dia ya no es impedimento, doblar es justamente lo normal.
    const choque = quien && t && turnosDe(quien.id, a.fecha).some(x => solapan(x, t));
    // ¿quién del equipo quedaría sobre su contrato si tomara este turno?
    const extra = horasDe(t);
    const pasados = t ? S.personas.filter(p => {
      const ya = analizar(p).horas;
      return ya + extra > (Number(p.horas_contrato) || 0);
    }) : [];
    const quienPasa = quien && t && (analizar(quien).horas > (Number(quien.horas_contrato) || 0));
    const card = el('div','abicard' + (a.tomado_por ? ' tomado' : ''), `
      <div class="qué">
        <b>${ddmm(a.fecha)} · ${t ? esc(t.nombre)+' '+hhmm(t.inicio)+'–'+hhmm(t.fin) : 'turno borrado'}</b>
        <span>${esc(a.puesto||'sin puesto')}${t ? ' · '+hfmt(horasDe(t))+' h' : ''}</span>
        ${a.nota ? `<em>${esc(a.nota)}</em>` : ''}
      </div>
      <div class="abiest">
        ${a.ofrecido_por ? '<span class="flag info">cambio de turno</span>' : ''}
        ${a.tomado_por ? `<span class="flag ok">Lo tomó ${esc(quien ? quien.nombre : '—')}</span>` : '<span class="flag warn">Sin tomar</span>'}
        ${choque ? '<span class="flag bad">ya tiene turno ese día</span>' : ''}
        ${quienPasa ? `<span class="flag bad">queda sobre su contrato</span>` : ''}
        ${!a.tomado_por && pasados.length ? `<span class="flag warn" title="${esc(pasados.map(x=>x.nombre).join(', '))}">${pasados.length} ${pasados.length===1?'persona quedaría':'personas quedarían'} sobre su contrato</span>` : ''}
        ${a.tomado_por && t && quien ? '<button class="act" data-pasar="1">Pasar a la malla</button>' : ''}
        <button class="mini" data-quitar="1">Quitar</button>
      </div>`);
    lista.appendChild(card);
    const bp = card.querySelector('[data-pasar]');
    if (bp) bp.addEventListener('click', async () => {
      try {
        await DATOS.crearAsignacion(S.local.id, quien.id, a.fecha, {
          turno_id: a.turno_id, inicio: t.inicio, fin: t.fin, colacion: t.colacion,
          puesto: a.puesto || (quien.rol||'').trim(), nota: a.nota || '',
        });
        // si era un cambio ofrecido, al confirmarlo se le quita ESE turno a
        // quien lo ofreció: antes se le ponía una ausencia «L», que ahora no
        // existe como fila — quedarse sin turno ES estar libre.
        if (a.ofrecido_por && a.ofrecido_por !== quien.id) {
          const suyo = turnosDe(a.ofrecido_por, a.fecha)
            .find(x => Number(x.inicio) === Number(t.inicio));
          if (suyo) await DATOS.borrarAsignacion(suyo.id);
        }
        await DATOS.cerrarTurno(a.id); await refrescar();
      } catch (e) { error(e); }
    });
    card.querySelector('[data-quitar]').addEventListener('click', async () => {
      try { await DATOS.cerrarTurno(a.id); await refrescar(); } catch (e) { error(e); }
    });
  });
}

/* ================= CONFIRMACIONES ================= */
const marcaDe = (pid, f) => S.marcas[pid + '|' + f] || {};
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
    { k:'Atrasos', v:atr ? atr+' min' : '—', n:'acumulados sobre la hora de entrada' },
  ].map(x => `<div class="kpi"><div class="k">${x.k}</div><div class="v ${x.c||''}">${x.v}</div><div class="n">${x.n}</div></div>`).join('');

  $('#pcrDetalle').innerHTML = pcr.filter(x => x.plan > 0).map(x =>
    `<li><div class="prow"><span class="pname">${esc(x.p.nombre)}</span>
       <span class="pstat">${hfmt(x.conLlegada)} de ${hfmt(x.plan)} h${x.atrasos ? ' · '+x.atrasoMin+' min tarde' : ''}</span></div>
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

/* ================= PINTAR TODO ================= */
function pintarTodo() {
  $('#hLocal').textContent = S.local ? S.local.nombre : '';
  pintarPlan(); pintarEquipo(); pintarTurnos(); pintarPropinas(); pintarAbiertos(); pintarConf(); pintarLinks();
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
  const porConfirmar = dias.filter(x => (x.turnos||[]).length && x.confirmo !== true);
  const btnTodo = $('#tConfTodo');
  if (porConfirmar.length > 1) {
    btnTodo.hidden = false;
    btnTodo.innerHTML = `<button class="act primary" id="btnTodaSemana">Confirmo toda la semana
      <span>${porConfirmar.length} turnos</span></button>
      <p class="soloHoy">Si alguno no puedes, lo cambias después uno por uno.</p>`;
    on('#btnTodaSemana', 'click', async ev => {
      const b = ev.currentTarget; b.disabled = true; b.textContent = 'Confirmando…';
      try {
        for (const x of porConfirmar) await DATOS.marcar(token, x.fecha, 'confirmo', true);
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
      (trabaja ? `<div class="btns">
        <button data-a="confirmo" data-v="1" aria-pressed="${x.confirmo === true}">Confirmo</button>
        <button class="no" data-a="confirmo" data-v="0" aria-pressed="${x.confirmo === false}">No puedo</button>
        <button data-a="llego" data-v="1" aria-pressed="${x.llego === true}">Llegué</button>
      </div>` + (x.ofrecido
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
    card.querySelectorAll('button[data-a]').forEach(b => {
      b.addEventListener('click', async () => {
        const campo = b.dataset.a, valor = b.dataset.v === '1';
        const actual = campo === 'confirmo' ? x.confirmo : x.llego;
        try {
          await DATOS.marcar(token, x.fecha, campo, actual === valor ? null : valor);
          await pintarTrabajador(token);
        } catch (e) { $('#tAviso').innerHTML = `<div class="avisoro">No se pudo guardar: ${esc(e.message)}</div>`; }
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

function conectarApp() {
  // pestañas
  const TABS = ['sem','eq','prop','abi','conf','link'];
  TABS.forEach(t => $('#tab-'+t).addEventListener('click', () => {
    TABS.forEach(o => { $('#tab-'+o).setAttribute('aria-selected', String(o===t)); $('#p-'+o).hidden = (o!==t); });
  }));

  // modos de vista
  const irA = modo => { S.modo = modo; refrescar().catch(error); };
  on('#modoDia', 'click', () => irA('dia'));
  on('#modoSemana', 'click', () => irA('semana'));
  on('#modoMes', 'click', () => irA('mes'));

  // navegar: el paso depende de la vista en la que estés
  const mover = n => {
    if (S.modo === 'dia') S.dia = masDias(S.dia, n);
    else if (S.modo === 'mes') S.lunes = new Date(S.lunes.getFullYear(), S.lunes.getMonth() + n, 1);
    else S.lunes = masDias(S.lunes, n * 7);
    refrescar().catch(error);
  };
  on('#semAnt', 'click', () => mover(-1));
  on('#semSig', 'click', () => mover(1));
  on('#semHoy', 'click', () => {
    S.dia = new Date(); S.lunes = lunesDe(new Date()); refrescar().catch(error);
  });

  // copiar la semana anterior sobre esta
  on('#btnCopiarSem', 'click', async () => {
    const m = $('#msgSem');
    const anterior = iso(masDias(S.lunes, -7));
    if (!confirm('Copiar los turnos de la semana del ' + ddmm(anterior) + ' sobre esta.\n\n'
               + 'Se pisan los turnos que ya pusiste. Las ausencias NO se copian.')) return;
    m.textContent = 'Copiando…'; m.className = 'msg';
    try {
      recordar('copiar la semana anterior');
      const n = await DATOS.copiarSemana(S.local.id, anterior, iso(S.lunes));
      await refrescar();
      m.textContent = n ? `Listo: ${n} turnos copiados.` : 'La semana anterior estaba vacía.';
      m.className = 'msg ' + (n ? 'ok' : '');
    } catch (e) { m.textContent = e.message; m.className = 'msg bad'; }
    setTimeout(() => { $('#msgSem').textContent = ''; }, 5000);
  });

  // copiar la dotación de un día a los demás, para no teclear siete veces
  on('#btnCopiarDotacion', 'click', async () => {
    const dia = DIAS[Number(S.cobDia)];
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
      $('#detNecesita').open = true;
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
  on('#tabTurno', 'click', () => pestañaDlg(true));
  on('#tabAus',   'click', () => pestañaDlg(false));
  on('#dCancelar','click', () => $('#dlgTurno').close());
  on('#dGuardar', 'click', guardarDlg);
  on('#dBorrar',  'click', borrarDlg);
  ['#dEntra','#dSale','#dPausa'].forEach(id => on(id, 'input', duraDlg));
  // Elegir plantilla solo RELLENA los campos: después se editan. La plantilla
  // deja de ser la verdad y pasa a ser un atajo para no teclear.
  on('#dPlantilla', 'change', () => {
    const t = turnoDe($('#dPlantilla').value); if (!t) return;
    $('#dEntra').value = aHora(t.inicio);
    $('#dSale').value  = aHora(t.fin);
    $('#dPausa').value = Math.round(Number(t.colacion) * 60);
    duraDlg();
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
      $('#detNecesita').open = true;
      m.textContent = dia + ' en blanco. Si fue sin querer, aprieta Deshacer.'; m.className = 'msg ok';
    } catch (e) { S.histDot.pop(); pintarDeshacerDot(); m.textContent = e.message; m.className = 'msg bad'; }
    setTimeout(() => { const x = $('#msgDot'); if (x) x.textContent = ''; }, 6000);
  });
  on('#btnDeshacerDot', 'click', deshacerDot);

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
  on('#btnTurno', 'click', async () => {
    try { await DATOS.crearTurno(S.local.id, { nombre:'Turno '+(S.turnos.length+1), inicio:9, fin:17,
            colacion:0.5, orden:S.turnos.length+1 }); await refrescar(); } catch (e) { error(e); }
  });
  on('#btnAbrir', 'click', async () => {
    const turnoId = $('#abiTurno').value; if (!turnoId) return alert('Primero crea un turno en Equipo.');
    try {
      await DATOS.abrirTurno(S.local.id, { fecha:$('#abiDia').value, turno_id:turnoId,
        puesto:$('#abiPuesto').value.trim(), nota:$('#abiNota').value.trim() });
      $('#abiNota').value = ''; await refrescar();
    } catch (e) { error(e); }
  });
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
