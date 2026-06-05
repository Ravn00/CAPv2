// LICENSE SYSTEM
// ---
let LICENSE_SECRET = "";

// Pure JS SHA-256 fallback para file:// (crypto.subtle solo disponible en HTTPS)
function sha256(str) {
  const chrsz = 8;
  function safe_add(x, y) { const lsw = (x & 0xFFFF) + (y & 0xFFFF); return (x >>> 16) + (y >>> 16) + (lsw >>> 16) << 16 | lsw & 0xFFFF; }
  function S(X, n) { return X >>> n; } function R(X, n) { return X << n >>> 0; }
  function Ch(x, y, z) { return x & y ^ ~x & z; } function Maj(x, y, z) { return x & y ^ x & z ^ y & z; }
  function Sigma0256(x) { return S(x, 2) ^ S(x, 13) ^ S(x, 22); } function Sigma1256(x) { return S(x, 6) ^ S(x, 11) ^ S(x, 25); }
  function Gamma0256(x) { return S(x, 7) ^ S(x, 18) ^ R(x, 3); } function Gamma1256(x) { return S(x, 17) ^ S(x, 19) ^ R(x, 10); }
  const K = [1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];
  const l = str.length * chrsz; const m = [];
  for (let i = 0; i < l; i += chrsz) m[i>>5] |= (str.charCodeAt(i / chrsz) & 0xFF) << (24 - i % 32);
  m[l>>5] |= 0x80 << (24 - l % 32); m[((l + 64 >> 9) << 4) + 15] = l;
  let H = [1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225];
  for (let i = 0; i < m.length; i += 16) {
    const W = new Array(64);
    for (let t = 0; t < 16; t++) W[t] = m[i + t];
    for (let t = 16; t < 64; t++) W[t] = safe_add(safe_add(safe_add(Gamma1256(W[t - 2]), W[t - 7]), Gamma0256(W[t - 15])), W[t - 16]);
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let t = 0; t < 64; t++) {
      const T1 = safe_add(safe_add(safe_add(safe_add(h, Sigma1256(e)), Ch(e, f, g)), K[t]), W[t]);
      const T2 = safe_add(Sigma0256(a), Maj(a, b, c));
      h = g; g = f; f = e; e = safe_add(d, T1); d = c; c = b; b = a; a = safe_add(T1, T2);
    }
    H[0] = safe_add(H[0], a); H[1] = safe_add(H[1], b); H[2] = safe_add(H[2], c); H[3] = safe_add(H[3], d);
    H[4] = safe_add(H[4], e); H[5] = safe_add(H[5], f); H[6] = safe_add(H[6], g); H[7] = safe_add(H[7], h);
  }
  return H.map(x => ("0123456789abcdef").split("").reduce((s, _, i) => s + "0123456789abcdef"[(x >>> (7 - i) * 4) & 15], "")).join("");
}

async function licHash(clientId, month, year2d) {
  const raw = `${LICENSE_SECRET}|${clientId}|${String(month).padStart(2,'0')}|${String(year2d).padStart(2,'0')}`;
  try {
    if (crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('').toUpperCase().slice(0, 8);
    }
  } catch(e) {}
  return sha256(raw).toUpperCase().slice(0, 8);
}

async function validateLicense(code) {
  const p = String(code||'').trim().toUpperCase().replace(/\s/g, '').split('-');
  if (p.length !== 4 || p[0] !== 'AP')
    return { ok:false, error:'Formato inválido. Ejemplo: AP-C001-0526-XXXXXXXX' };
  const clientId = p[1], mmyy = p[2], hash = p[3];
  if (clientId.length !== 4 || !/^[A-Z0-9]{4}$/.test(clientId))
    return { ok:false, error:'ID de cliente inválido (debe ser 4 caracteres alfanuméricos)' };
  if (mmyy.length !== 4 || !/^\d{4}$/.test(mmyy))
    return { ok:false, error:'Fecha inválida (debe ser MMAA, ej: 0526)' };
  if (hash.length !== 8 || !/^[A-F0-9]{8}$/.test(hash))
    return { ok:false, error:'Hash inválido (debe ser 8 caracteres hexadecimales)' };
  const mm = parseInt(mmyy.slice(0,2)), yy = parseInt(mmyy.slice(2,4));
  if (mm < 1 || mm > 12)
    return { ok:false, error:'Mes inválido en el código' };
  const fullYear = 2000 + yy;
  const now = new Date();
  const codeVal = fullYear * 12 + mm;
  const currVal = now.getFullYear() * 12 + (now.getMonth() + 1);
  if (codeVal < currVal)
    return { ok:false, expired:true, error:`Licencia vencida — solicita el código de ${now.toLocaleString('es-CL',{month:'long'})} a tu proveedor` };
  const expected = await licHash(clientId, mm, yy);
  if (expected !== hash)
    return { ok:false, error:'Código incorrecto. Verifica que lo copiaste bien.' };
  const expiry = new Date(fullYear, mm, 0);
  const daysLeft = Math.ceil((expiry - now) / 864e5);
  return { ok:true, clientId, month:mm, year:fullYear, daysLeft, expiry };
}

// ---
const _LK_KEY = "ap_lk_v2";
const MAX_TRIES = 3;
const LOCK_MS = 24 * 60 * 60 * 1000;
function getLockState() { try { return JSON.parse(localStorage.getItem(_LK_KEY)||"{}"); } catch(_){return {};} }
function setLockState(s) { localStorage.setItem(_LK_KEY, JSON.stringify(s)); }
function checkLockout() {
  const s = getLockState();
  if (!s.lockedAt) return null;
  const rem = LOCK_MS - (Date.now() - s.lockedAt);
  if (rem <= 0) { localStorage.removeItem(_LK_KEY); return null; }
  return rem;
}
function registerFailedAttempt() {
  const s = getLockState();
  const tries = (s.tries||0) + 1;
  if (tries >= MAX_TRIES) { setLockState({ tries, lockedAt: Date.now() }); return { locked:true, tries }; }
  setLockState({ tries });
  return { locked:false, tries, remaining: MAX_TRIES - tries };
}
function clearFailedAttempts() { localStorage.removeItem(_LK_KEY); }

async function activateLicense() {
  const code = (document.getElementById('lic-input').value || '').trim().toUpperCase();
  const errEl = document.getElementById('lic-error');
  const btn = document.getElementById('lic-btn');
  errEl.textContent = '';
  const remaining = checkLockout();
  if (remaining) {
    const hrs = Math.floor(remaining / 36e5);
    const mins = Math.ceil((remaining % 36e5) / 60000);
    errEl.textContent = `Demasiados intentos. Bloqueado por ${hrs > 0 ? hrs+'h ' : ''}${mins} min más.`;
    return;
  }
  if (!code) { errEl.textContent = 'Ingresa tu código de licencia'; return; }
  btn.disabled = true; btn.textContent = 'Verificando…';
  try {
    const result = await validateLicense(code);
    if (!result.ok) {
      const lock = registerFailedAttempt();
      if (lock.locked) {
        errEl.textContent = 'Código incorrecto. Demasiados intentos — bloqueado por 24 horas.';
      } else {
        errEl.textContent = `Código incorrecto (${lock.remaining} intento${lock.remaining!==1?'s':''} restante${lock.remaining!==1?'s':''})`;
      }
      btn.disabled = false; btn.textContent = 'Activar Licencia';
      const box = document.querySelector('.lic-box');
      if (box) { box.style.animation = 'none'; void box.offsetHeight; box.style.animation = 'shake .4s ease'; }
      return;
    }
    clearFailedAttempts();
    try { localStorage.setItem('ap_license_v2', JSON.stringify({ code, clientId:result.clientId, month:result.month, year:result.year, savedAt:Date.now() })); }
    catch(se) { console.warn('localStorage write failed:', se); }
    const gate = document.getElementById('lic-gate');
    gate.classList.add('hiding');
    setTimeout(async () => {
      gate.classList.add('gone');
      try { updateLicPill(result); } catch(_) {}
      try { await initApp(); } catch(ie) { console.error('initApp error:', ie); }
    }, 320);
    btn.disabled = false; btn.textContent = 'Activar Licencia';
  } catch(err) {
    console.error('activateLicense error:', err);
    errEl.textContent = 'Error al verificar: ' + (err.message || String(err)).slice(0, 60);
    btn.disabled = false; btn.textContent = 'Activar Licencia';
  }
}

async function checkSavedLicense() {
  try {
    const rem = checkLockout();
    if (rem) {
      const hrs = Math.floor(rem / 36e5);
      const mins = Math.ceil((rem % 36e5) / 60000);
      const e = document.getElementById('lic-error');
      const b = document.getElementById('lic-btn');
      if (e) e.textContent = `Bloqueado por ${hrs > 0 ? hrs+'h ' : ''}${mins} min.`;
      if (b) b.disabled = true;
    }
    const raw = localStorage.getItem('ap_license_v2');
    if (!raw) return false;
    const saved = JSON.parse(raw);
    const result = await validateLicense(saved.code);
    if (result.ok) { updateLicPill(result); return true; }
    return false;
  } catch(_) { return false; }
}

function updateLicPill(result) {
  const pill = document.getElementById('lic-pill');
  const txt = document.getElementById('lic-pill-txt');
  if (!pill || !result) return;
  pill.classList.add('on');
  if (result.daysLeft <= 7) {
    pill.className = 'warn on';
    txt.textContent = result.daysLeft <= 1 ? '¡Vence hoy!' : `Vence en ${result.daysLeft}d`;
  } else {
    pill.className = 'ok on';
    txt.textContent = `Lic. ${String(result.month).padStart(2,'0')}/${result.year}`;
  }
}

async function showLicenseInfo() {
  try {
    const raw = localStorage.getItem('ap_license_v2');
    if (!raw) { toast('Sin licencia activa'); return; }
    const saved = JSON.parse(raw);
    const r = await validateLicense(saved.code);
    if (!r.ok) { toast(r.error||'Licencia inválida'); updateLicPill(null); return; }
    const ex = r.expiry || new Date(r.year, r.month, 0);
    const dd = String(ex.getDate()).padStart(2,'0');
    const mm = String(ex.getMonth()+1).padStart(2,'0');
    const yy = ex.getFullYear();
    toast(`Licencia ${r.clientId} — válida hasta ${dd}/${mm}/${yy} (${r.daysLeft} días)`);
  } catch(_) { toast('Error al leer licencia'); }
}

// ---
(function() {
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
  if (isMobile) return;
  let _open = false;
  let _triggers = 0;
  function lockout() {
    if (_open) return;
    _open = true;
    localStorage.removeItem("ap_license_v2");
    const g = document.getElementById("lic-gate");
    if (g) { g.classList.remove("gone","hiding"); }
    const e = document.getElementById("lic-error");
    if (e) e.textContent = "Sesión cerrada por seguridad.";
  }
  // Resize-based: require 2 consecutive detections to avoid false positives
  setInterval(() => {
    const dw = window.outerWidth - window.innerWidth;
    const dh = window.outerHeight - window.innerHeight;
    if (dw > 200 || dh > 200) {
      _triggers++;
      if (_triggers >= 2) lockout();
    } else { _triggers = 0; }
  }, 1000);
  // debugger trap
  let _dbg = 0;
  setInterval(() => {
    _dbg++;
    if (_dbg > 3) return;
    const start = performance.now();
    debugger;
    const elapsed = performance.now() - start;
    if (elapsed > 100) { _dbg = 0; lockout(); }
  }, 5000);
})();

// ---
document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('lic-input');
  if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') activateLicense(); });
});

// ---
// APP INIT ??? runs only after license validated
// ---
let _inited = false;