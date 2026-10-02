/* Malla de Turnos — arranque.
   Esta primera versión existe para PROBAR EL CAMINO COMPLETO:
   la página se publica en GitHub Pages, carga, habla con Supabase y deja entrar.
   Si estos cuatro puntos dan verde, lo demás es trabajo sobre terreno firme. */

const $ = s => document.querySelector(s);
const marca = (id, estado, texto) => {
  const li = $(id); if (!li) return;
  li.className = estado;
  li.querySelector('.pt').textContent = estado === 'ok' ? '✓' : estado === 'bad' ? '✕' : '!';
  if (texto) li.lastChild.textContent = ' ' + texto;
};

let sb = null;

function revisar() {
  marca('#c-web', 'ok');

  if (!window.supabase || !window.supabase.createClient) {
    marca('#c-lib', 'bad', 'La librería de la base no cargó');
    $('#diagNota').textContent = 'Puede ser la conexión a internet o que el CDN esté bloqueado.';
    return false;
  }
  marca('#c-lib', 'ok');

  const c = window.CONFIG || {};
  if (!c.SUPABASE_URL || c.SUPABASE_URL === 'PENDIENTE' || !c.SUPABASE_ANON || c.SUPABASE_ANON === 'PENDIENTE') {
    marca('#c-cfg', 'warn', 'Falta configurar la conexión');
    $('#diagNota').textContent = 'Todavía no están puestos los datos del proyecto de Supabase en config.js. '
      + 'Es lo único que falta: la página ya está publicada y funcionando.';
    return false;
  }
  marca('#c-cfg', 'ok');

  sb = window.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON);
  return true;
}

async function probarBase() {
  try {
    // Llamada deliberadamente inocua: pregunta por la sesión, que no toca ninguna tabla.
    const { error } = await sb.auth.getSession();
    if (error) throw error;
    marca('#c-db', 'ok');
    $('#diagNota').textContent = '';
    return true;
  } catch (e) {
    marca('#c-db', 'bad', 'La base no responde');
    $('#diagNota').textContent = 'Detalle: ' + (e && e.message ? e.message : e);
    return false;
  }
}

async function pintarSesion() {
  const { data } = await sb.auth.getSession();
  const hay = !!(data && data.session);
  $('#cardLogin').hidden = hay;
  $('#panel').hidden = !hay;
  if (hay) $('#hola').textContent = 'Hola, ' + data.session.user.email;
}

function aviso(texto, clase) {
  const m = $('#msgLogin');
  m.textContent = texto;
  m.className = 'msg ' + (clase || '');
}

async function arrancar() {
  $('#pie').textContent = location.host || 'local';
  if (!revisar()) return;
  if (!await probarBase()) return;

  $('#cardLogin').hidden = false;
  await pintarSesion();
  sb.auth.onAuthStateChange(() => pintarSesion());

  $('#formLogin').addEventListener('submit', async ev => {
    ev.preventDefault();
    aviso('Entrando…');
    const { error } = await sb.auth.signInWithPassword({
      email: $('#email').value.trim(), password: $('#clave').value });
    if (error) aviso(traducir(error.message), 'bad');
    else aviso('');
  });

  $('#btnCrear').addEventListener('click', async () => {
    const email = $('#email').value.trim(), password = $('#clave').value;
    if (!email || password.length < 8) { aviso('Pon tu correo y una clave de al menos 8 caracteres.', 'bad'); return; }
    aviso('Creando la cuenta…');
    const { error } = await sb.auth.signUp({ email, password });
    if (error) aviso(traducir(error.message), 'bad');
    else aviso('Listo. Si pide confirmación, revisa tu correo.', 'ok');
  });

  $('#btnSalir').addEventListener('click', async () => { await sb.auth.signOut(); });
}

// Los mensajes de Supabase vienen en inglés; los más comunes se dicen en castellano.
function traducir(m) {
  const t = (m || '').toLowerCase();
  if (t.includes('invalid login')) return 'Correo o contraseña incorrectos.';
  if (t.includes('already registered')) return 'Ese correo ya tiene cuenta. Entra en vez de crearla.';
  if (t.includes('email not confirmed')) return 'Falta confirmar el correo: revisa tu bandeja.';
  if (t.includes('password')) return 'La contraseña no cumple el mínimo (8 caracteres).';
  return m;
}

arrancar();
