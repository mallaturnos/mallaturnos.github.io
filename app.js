/* Malla de Turnos — aplicación.
   Dos vistas en un mismo archivo:
   - El DUEÑO entra con sesión y ve todo lo de su local.
   - El TRABAJADOR abre la página con #sutoken y ve SOLO su semana.
   La separación no es de pantalla: es de permisos, y vive en la base. */
'use strict';

const $ = s => document.querySelector(s);
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

const DIAS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const AUSENCIAS = { L:'Libre', V:'Vacaciones', E:'Licencia', F:'Falta' };

const clp  = n => '$' + Math.round(n || 0).toLocaleString('es-CL');
const hfmt = n => (n || 0).toLocaleString('es-CL', { minimumFractionDigits:1, maximumFractionDigits:1 });
const pfmt = n => isFinite(n) ? n.toLocaleString('es-CL',{minimumFractionDigits:1,maximumFractionDigits:1}) + ' %' : '—';
const hhmm = h => { const t = ((h % 24) + 24) % 24, m = Math.round((t - Math.floor(t)) * 60);
  return String(Math.floor(t)).padStart(2,'0') + ':' + String(m).padStart(2,'0'); };
const aDec = s => { const [h,m] = String(s||'0:00').split(':').map(Number); return h + (m||0)/60; };

/* ---------- fechas: la semana empieza el lunes ---------- */
const iso = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
function lunesDe(d) { const x = new Date(d); const n = (x.getDay() + 6) % 7; x.setDate(x.getDate() - n); x.setHours(0,0,0,0); return x; }
const masDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const ddmm = f => { const [a,m,d] = f.split('-'); return d + '-' + m; };

let sb = null;
const S = { local:null, personas:[], turnos:[], asign:{}, marcas:{}, dias:{}, abiertos:[], lunes:lunesDe(new Date()), canal:null };
const fechas = () => Array.from({length:7}, (_,i) => iso(masDias(S.lunes, i)));
const turnoDe = id => S.turnos.find(t => t.id === id) || null;
const horasDe = t => t ? Number(t.fin) - Number(t.inicio) - Number(t.colacion) : 0;
const asigDe = (pid, f) => S.asign[pid + '|' + f] || null;

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
  $('#formLogin').addEventListener('submit', async ev => {
    ev.preventDefault(); avisoLogin('Entrando…');
    const { error: e } = await sb.auth.signInWithPassword({ email: $('#email').value.trim(), password: $('#clave').value });
    avisoLogin(e ? traducir(e.message) : '', e ? 'bad' : '');
  });
  $('#btnCrear').addEventListener('click', async () => {
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

/* ================= CARGAR TODO ================= */
async function cargar() {
  const f = fechas(), desde = f[0], hasta = f[6];
  const [personas, turnos, asign, marcas, dias, abiertos] = await Promise.all([
    DATOS.personas(S.local.id), DATOS.turnos(S.local.id),
    DATOS.asignaciones(S.local.id, desde, hasta), DATOS.marcas(S.local.id, desde, hasta),
    DATOS.dias(S.local.id, desde, hasta), DATOS.abiertos(S.local.id, desde),
  ]);
  S.personas = personas || []; S.turnos = turnos || []; S.abiertos = abiertos || [];
  S.asign = {}; (asign||[]).forEach(a => { S.asign[a.persona_id + '|' + a.fecha] = a; });
  S.marcas = {}; (marcas||[]).forEach(m => { S.marcas[m.persona_id + '|' + m.fecha] = m; });
  S.dias = {};   (dias||[]).forEach(d => { S.dias[d.fecha] = d; });
}

async function refrescar() { await cargar(); pintarTodo(); }

/* ================= SEMANA ================= */
function pintarSemana() {
  const f = fechas();
  $('#semTitulo').textContent = ddmm(f[0]) + ' al ' + ddmm(f[6]);
  $('#semCab').innerHTML = '<th>Persona</th>' +
    DIAS.map((d,i) => `<th class="${i>=4?'fin':''}">${d}<span class="num">${ddmm(f[i])}</span></th>`).join('') + '<th>Horas</th>';

  const cuerpo = $('#semCuerpo'); cuerpo.innerHTML = '';
  if (!S.personas.length) {
    cuerpo.innerHTML = `<tr><td colspan="9" class="vacio">Todavía no tienes a nadie. Anda a <b>Equipo</b> y agrega tu primera persona.</td></tr>`;
    $('#semPie').innerHTML = ''; $('#semPersonas').innerHTML = ''; return;
  }

  const opciones = S.turnos.map(t => `<option value="${t.id}">${esc(t.nombre)} ${hhmm(t.inicio)}–${hhmm(t.fin)}</option>`).join('')
    + Object.entries(AUSENCIAS).map(([k,v]) => `<option value="a:${k}">${k==='L'?'—':k} ${v}</option>`).join('');

  let grupoActual = null;
  S.personas.forEach(p => {
    // una fila de titulo cada vez que cambia el puesto: cocina, mesas, barra…
    const g = (p.rol || '').trim() || 'Sin puesto';
    if (g !== grupoActual) {
      grupoActual = g;
      const n = S.personas.filter(x => ((x.rol||'').trim() || 'Sin puesto') === g).length;
      cuerpo.appendChild(el('tr','grupo', `<th colspan="9">${esc(g)} <span>${n}</span></th>`));
    }
    const tr = el('tr');
    tr.innerHTML = `<th scope="row">${esc(p.nombre)}<span class="rol">${esc(p.rol||'')} · ${clp(p.valor_hora)}/h · ${hfmt(p.horas_contrato)} h</span></th>` +
      f.map(fe => {
        const a = asigDe(p.id, fe);
        const val = a ? (a.turno_id ? a.turno_id : 'a:' + (a.ausencia||'L')) : 'a:L';
        const t = a && a.turno_id ? turnoDe(a.turno_id) : null;
        const ci = t ? (S.turnos.findIndex(x => x.id === t.id) % 4) + 1 : 'off';
        return `<td class="cell"><select class="turno" data-c="${ci}" data-p="${p.id}" data-f="${fe}"
                 aria-label="${esc(p.nombre)}, ${fe}">${opciones}</select></td>`;
      }).join('') + `<td class="tot"><span class="hcell" id="h-${p.id}"></span></td>`;
    cuerpo.appendChild(tr);
    f.forEach(fe => {
      const a = asigDe(p.id, fe);
      const sel = tr.querySelector(`select[data-f="${fe}"]`);
      sel.value = a ? (a.turno_id || 'a:' + (a.ausencia||'L')) : 'a:L';
      sel.addEventListener('change', async () => {
        const v = sel.value, esAus = v.startsWith('a:');
        try {
          const nueva = await DATOS.ponerTurno(S.local.id, p.id, fe, esAus ? null : v, esAus ? v.slice(2) : null);
          S.asign[p.id + '|' + fe] = nueva;
          pintarTodo();
        } catch (e) { error(e); }
      });
    });
  });
  pintarResumenSemana();
}

function analizar(p) {
  const f = fechas();
  let horas = 0, trabajados = 0, aus = 0;
  const alertas = [];
  f.forEach((fe, i) => {
    const a = asigDe(p.id, fe); if (!a) return;
    const t = a.turno_id ? turnoDe(a.turno_id) : null;
    if (t) { horas += horasDe(t); trabajados++; if (horasDe(t) > 10) alertas.push({n:'bad', t:`${DIAS[i]} sobre 10 h`}); }
    else if (a.ausencia && a.ausencia !== 'L') aus++;
  });
  const tope = Number(p.horas_contrato) || Number(S.local.tope_semanal) || 42;
  if (horas > tope) alertas.push({ n:'bad', t:`${hfmt(horas)} h · ${hfmt(horas-tope)} sobre su contrato de ${hfmt(tope)}` });
  if (trabajados === 7) alertas.push({ n:'bad', t:'7 días seguidos' });
  if (aus) alertas.push({ n:'info', t:`${aus} ${aus===1?'día':'días'} de ausencia` });
  if (!alertas.some(a => a.n==='bad' || a.n==='warn')) alertas.unshift({ n:'ok', t:'conforme' });
  return { horas, trabajados, aus, costo: horas * (p.valor_hora||0), alertas, tope };
}

function pintarResumenSemana() {
  const lista = $('#semPersonas'); lista.innerHTML = '';
  let horasT = 0, costoT = 0;
  S.personas.forEach(p => {
    const a = analizar(p); horasT += a.horas; costoT += a.costo;
    const h = $('#h-' + p.id);
    if (h) { h.textContent = hfmt(a.horas) + ' h'; h.classList.toggle('over', a.horas > a.tope); }
    lista.appendChild(el('li', '', `
      <div class="prow"><span class="pname">${esc(p.nombre)}</span>
        <span class="pstat">${hfmt(a.horas)} h · ${a.trabajados} d · ${clp(a.costo)}</span></div>
      <div class="bar"><i class="${a.horas>a.tope?'over':''}" style="width:${Math.min(100,(a.horas/a.tope)*100)}%"></i></div>
      <div class="flags">${a.alertas.map(x => `<span class="flag ${x.n}">${esc(x.t)}</span>`).join('')}</div>`));
  });
  const f = fechas();
  const ventaT = f.reduce((s,fe) => s + ((S.dias[fe]||{}).venta || 0), 0);
  const pct = ventaT ? (costoT/ventaT)*100 : NaN;
  $('#semPie').innerHTML = '<tr class="sumrow"><th>Costo del día</th>' +
    f.map(fe => {
      const c = S.personas.reduce((s,p) => { const a = asigDe(p.id,fe); const t = a && a.turno_id ? turnoDe(a.turno_id) : null;
        return s + (t ? horasDe(t) * (p.valor_hora||0) : 0); }, 0);
      const v = (S.dias[fe]||{}).venta || 0, pd = v ? (c/v)*100 : NaN;
      const col = !isFinite(pd) ? 'var(--fg-faint)' : (pd > Number(S.local.objetivo_pct) ? 'var(--bad)' : 'var(--fg-dim)');
      return `<td style="color:${col}">${clp(c)}<br><span style="font-size:.6875rem">${pfmt(pd)}</span></td>`;
    }).join('') + `<td>${clp(costoT)}<br><span style="font-size:.6875rem">${pfmt(pct)}</span></td></tr>`;
}

/* ================= EQUIPO ================= */
function filaCampo(label, tipo, valor, attrs) {
  return `<div class="fld"><label>${label}</label><input type="${tipo}" value="${esc(valor)}" ${attrs||''}></div>`;
}

function pintarEquipo() {
  const box = $('#eqLista'); box.innerHTML = '';
  if (!S.personas.length) box.appendChild(el('p','vacio','Todavía no hay nadie. Agrega tu primera persona abajo.'));
  S.personas.forEach(p => {
    const row = el('div','rowline', `
      ${filaCampo('Nombre','text',p.nombre,'data-k="nombre"')}
      ${filaCampo('Puesto','text',p.rol||'','data-k="rol"')}
      ${filaCampo('Valor hora','number',p.valor_hora,'data-k="valor_hora" class="n" min="0" step="50"')}
      ${filaCampo('Horas contrato','number',p.horas_contrato,'data-k="horas_contrato" class="n" min="0" max="60" step="1"')}
      ${filaCampo('Factor propina','number',p.factor_propina,'data-k="factor_propina" class="n" min="0" max="3" step="0.1"')}
      <button class="mini" data-del="1">Quitar</button>`);
    box.appendChild(row);
    let t = null;
    row.querySelectorAll('input[data-k]').forEach(inp => {
      inp.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(async () => {
          const k = inp.dataset.k;
          const v = (k === 'nombre' || k === 'rol') ? inp.value : (Number(inp.value) || 0);
          try { Object.assign(p, await DATOS.guardarPersona(p.id, { [k]: v })); pintarSemana(); pintarPropinas(); pintarLinks(); }
          catch (e) { error(e); }
        }, 600);
      });
    });
    row.querySelector('[data-del]').addEventListener('click', async () => {
      if (!confirm('¿Quitar a ' + p.nombre + ' del equipo?\n\nSus turnos y marcas anteriores no se borran.')) return;
      try { await DATOS.quitarPersona(p.id); await refrescar(); } catch (e) { error(e); }
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
    const a = asigDe(p.id, fecha); const t = a && a.turno_id ? turnoDe(a.turno_id) : null;
    return t ? horasDe(t) * (Number(p.factor_propina)||0) : 0;
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
      <div class="fld"><label>Venta</label><input class="n" type="number" min="0" step="10000" value="${d.venta||0}" data-c="venta"></div>
      <div class="fld"><label>Propina efectivo</label><input class="n" type="number" min="0" step="1000" value="${d.propina_efectivo||0}" data-c="propina_efectivo"></div>
      <div class="fld"><label>Propina tarjeta</label><input class="n" type="number" min="0" step="1000" value="${d.propina_tarjeta||0}" data-c="propina_tarjeta"></div>`);
    box.appendChild(w);
    let t = null;
    w.querySelectorAll('input[data-c]').forEach(inp => {
      inp.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(async () => {
          try { S.dias[fe] = await DATOS.guardarDia(S.local.id, fe, { [inp.dataset.c]: Number(inp.value)||0 });
                pintarPropinas(); pintarResumenSemana(); }
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

  const lista = $('#abiLista'); lista.innerHTML = '';
  if (!S.abiertos.length) { lista.innerHTML = '<p class="vacio">No hay turnos abiertos. Publica uno cuando te falte gente.</p>'; return; }
  S.abiertos.forEach(a => {
    const t = turnoDe(a.turno_id);
    const quien = a.tomado_por ? S.personas.find(p => p.id === a.tomado_por) : null;
    const choque = quien && asigDe(quien.id, a.fecha) && asigDe(quien.id, a.fecha).turno_id;
    const card = el('div','abicard' + (a.tomado_por ? ' tomado' : ''), `
      <div class="qué">
        <b>${ddmm(a.fecha)} · ${t ? esc(t.nombre)+' '+hhmm(t.inicio)+'–'+hhmm(t.fin) : 'turno borrado'}</b>
        <span>${esc(a.puesto||'sin puesto')}${t ? ' · '+hfmt(horasDe(t))+' h' : ''}</span>
        ${a.nota ? `<em>${esc(a.nota)}</em>` : ''}
      </div>
      <div class="abiest">
        ${a.tomado_por ? `<span class="flag ok">Lo tomó ${esc(quien ? quien.nombre : '—')}</span>` : '<span class="flag warn">Sin tomar</span>'}
        ${choque ? '<span class="flag bad">ya tiene turno ese día</span>' : ''}
        ${a.tomado_por && t && quien ? '<button class="act" data-pasar="1">Pasar a la malla</button>' : ''}
        <button class="mini" data-quitar="1">Quitar</button>
      </div>`);
    lista.appendChild(card);
    const bp = card.querySelector('[data-pasar]');
    if (bp) bp.addEventListener('click', async () => {
      try { await DATOS.ponerTurno(S.local.id, quien.id, a.fecha, a.turno_id, null);
            await DATOS.cerrarTurno(a.id); await refrescar(); } catch (e) { error(e); }
    });
    card.querySelector('[data-quitar]').addEventListener('click', async () => {
      try { await DATOS.cerrarTurno(a.id); await refrescar(); } catch (e) { error(e); }
    });
  });
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
      const a = asigDe(p.id, fe); const t = a && a.turno_id ? turnoDe(a.turno_id) : null;
      return `${DIAS[d]} ${ddmm(fe)}: ` + (t ? `${t.nombre} ${hhmm(t.inicio)}–${hhmm(t.fin)}`
                                            : (AUSENCIAS[(a&&a.ausencia)||'L']||'libre').toLowerCase());
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
  pintarSemana(); pintarEquipo(); pintarTurnos(); pintarPropinas(); pintarAbiertos(); pintarLinks();
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
  dias.forEach(x => { if (x.turno) horasSem += Number(x.fin) - Number(x.inicio) - Number(x.colacion); });

  const cont = $('#tDias'); cont.innerHTML = '';
  dias.forEach(x => {
    const trabaja = !!x.turno;
    const hs = trabaja ? Number(x.fin) - Number(x.inicio) - Number(x.colacion) : 0;
    const i = (new Date(x.fecha + 'T00:00:00').getDay() + 6) % 7;
    const card = el('div','diacard' + (trabaja ? '' : ' libre'), `
      <div class="diahead">
        <div><div class="diafecha">${DIAS[i]} ${ddmm(x.fecha)}</div>
          <div class="diaturno">${trabaja ? esc(x.turno) : (AUSENCIAS[x.ausencia] || 'Libre')}</div></div>
        <div class="diahoras">${trabaja ? hhmm(x.inicio)+'–'+hhmm(x.fin)+' · '+hfmt(hs)+' h' : ''}</div>
      </div>` +
      (trabaja ? `<div class="btns">
        <button data-a="confirmo" data-v="1" aria-pressed="${x.confirmo === true}">Confirmo</button>
        <button class="no" data-a="confirmo" data-v="0" aria-pressed="${x.confirmo === false}">No puedo</button>
        <button data-a="llego" data-v="1" aria-pressed="${x.llego === true}">Llegué</button>
      </div>` : ''));
    cont.appendChild(card);
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
  $('#tTotal').textContent = 'Total de la semana: ' + hfmt(horasSem) + ' horas.';

  const totalProp = props.reduce((s,p) => s + (p.efectivo||0) + (p.tarjeta||0), 0);
  $('#tPropina').innerHTML = totalProp
    ? `<div class="platita"><div class="k">Propina del local esta semana</div><div class="v">${clp(totalProp)}</div>
       <div class="n">Tu factor acordado es <b>${hfmt(d.factor)}</b>. Se reparte día por día entre los que
       trabajaron ese día, por horas × factor. El factor lo acuerda el equipo, no el jefe (art. 64).</div></div>`
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
        const ok = await DATOS.tomarTurno(token, a.id);
        if (!ok) $('#tAviso').innerHTML = '<div class="avisoro">Alguien lo tomó primero.</div>';
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

  try { S.local = await DATOS.miLocal(); }
  catch (e) {
    // pasa, por ejemplo, si a la base le faltan los permisos del dueño
    $('#diag').hidden = false;
    marca('#c-db','bad','La base rechazó la consulta');
    $('#diagNota').textContent = e.message;
    $('#cardLocal').hidden = true; $('#app').hidden = true;
    return;
  }

  if (!S.local) { $('#cardLocal').hidden = false; $('#app').hidden = true; return; }
  $('#cardLocal').hidden = true; $('#app').hidden = false;

  await cargar();
  pintarTodo();

  if (!S.canal) S.canal = DATOS.escuchar(S.local.id, () => { cargar().then(pintarTodo).catch(()=>{}); });
}

function conectarApp() {
  // pestañas
  const TABS = ['sem','eq','prop','abi','link'];
  TABS.forEach(t => $('#tab-'+t).addEventListener('click', () => {
    TABS.forEach(o => { $('#tab-'+o).setAttribute('aria-selected', String(o===t)); $('#p-'+o).hidden = (o!==t); });
  }));

  // semana
  $('#semAnt').addEventListener('click', () => { S.lunes = masDias(S.lunes,-7); refrescar().catch(error); });
  $('#semSig').addEventListener('click', () => { S.lunes = masDias(S.lunes, 7); refrescar().catch(error); });
  $('#semHoy').addEventListener('click', () => { S.lunes = lunesDe(new Date()); refrescar().catch(error); });

  // crear local, con turnos de partida para que no arranque en blanco
  $('#formLocal').addEventListener('submit', async ev => {
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
      $('#msgLocal').textContent = '';
      await verJefe();
    } catch (e) { $('#msgLocal').textContent = e.message; $('#msgLocal').className = 'msg bad'; }
  });

  $('#btnPersona').addEventListener('click', async () => {
    try { await DATOS.crearPersona(S.local.id, { nombre:'Nueva persona', rol:'', valor_hora:2900,
            horas_contrato:42, factor_propina:1 }); await refrescar(); } catch (e) { error(e); }
  });
  $('#btnTurno').addEventListener('click', async () => {
    try { await DATOS.crearTurno(S.local.id, { nombre:'Turno '+(S.turnos.length+1), inicio:9, fin:17,
            colacion:0.5, orden:S.turnos.length+1 }); await refrescar(); } catch (e) { error(e); }
  });
  $('#btnAbrir').addEventListener('click', async () => {
    const turnoId = $('#abiTurno').value; if (!turnoId) return alert('Primero crea un turno en Equipo.');
    try {
      await DATOS.abrirTurno(S.local.id, { fecha:$('#abiDia').value, turno_id:turnoId,
        puesto:$('#abiPuesto').value.trim(), nota:$('#abiNota').value.trim() });
      $('#abiNota').value = ''; await refrescar();
    } catch (e) { error(e); }
  });
  $('#btnCopiarPub').addEventListener('click', async () => {
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

arrancar().catch(e => {
  // ultimo recurso: que la pagina diga algo en vez de quedarse muda
  const d = document.getElementById('diag');
  if (d) { d.hidden = false; document.getElementById('diagNota').textContent = 'Error al arrancar: ' + (e && e.message ? e.message : e); }
  const v = document.getElementById('vistaJefe'); if (v) v.hidden = false;
  console.error(e);
});
