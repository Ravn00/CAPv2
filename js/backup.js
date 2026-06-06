// Backup system: uses Supabase admin_config for compact storage (free-plan friendly)
// - Reviews: backed up on every change
// - Parts snapshot: backed up periodically (every 10 saves, or on critical changes)
// - Auto-restore: if localStorage is corrupt, recovers from Supabase

const BACKUP_INTERVAL = 300000; // 5 min
const SNAPSHOT_EVERY = 10; // saves between snapshots
let _saveCounter = 0;
let _backupTimer = null;

// --- Reviews backup (stored in admin_config as JSON) ---
async function backupReviews() {
  if (!pendingReviews || !pendingReviews.length) return;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    await fetch(`${SB_URL}/rest/v1/admin_config?id=eq.global`, {
      method: "PATCH",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ review_backup: pendingReviews.slice(0, 200) }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
  } catch (e) { /* silent */ }
}

async function restoreReviewsFromBackup() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`${SB_URL}/rest/v1/admin_config?select=review_backup&id=eq.global`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return;
    const rows = await r.json();
    if (rows?.[0]?.review_backup && Array.isArray(rows[0].review_backup)) {
      // Merge with existing, avoid duplicates
      const existing = new Set(pendingReviews.map(p => p.id));
      rows[0].review_backup.forEach(r => { if (!existing.has(r.id)) pendingReviews.push(r); });
      savePendingReviews();
    }
  } catch (e) { /* silent */ }
}

// --- Parts snapshot (full catalog as JSON blob) ---
async function backupPartsSnapshot() {
  if (!parts || !parts.length) return;
  // Strip bulky fields to keep payload small
  const snapshot = parts.map(p => ({
    id: p.id, marca: p.marca, modelo: p.modelo, años: p.años,
    categoria: p.categoria, posicion: p.posicion, descripcion: p.descripcion,
    confianza: p.confianza, precio_sugerido: p.precio_sugerido ?? null,
    precioVenta: p.precioVenta ?? null, codigo_oem: p.codigo_oem || null,
    ubicacion: p.ubicacion || null, estado: p.estado || "disponible",
    stock: p.stock ?? 1, addedAt: p.addedAt,
    photoUrl: p.photoUrl || null,
    _ok: p._ok ? true : false,
  }));
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    await fetch(`${SB_URL}/rest/v1/admin_config?id=eq.global`, {
      method: "PATCH",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ parts_backup: snapshot }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
  } catch (e) { /* silent */ }
}

async function restorePartsFromBackup() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`${SB_URL}/rest/v1/admin_config?select=parts_backup&id=eq.global`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return [];
    const rows = await r.json();
    if (rows?.[0]?.parts_backup && Array.isArray(rows[0].parts_backup)) {
      return rows[0].parts_backup;
    }
    return [];
  } catch (e) { return []; }
}

// --- Integrity check & auto-restore ---
async function checkAndRepairLocalStorage() {
  let corrupted = false;
  try {
    const raw = localStorage.getItem("ap_parts_v2");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) corrupted = true;
      else if (parsed.some(p => !p.id || !p.marca)) corrupted = true;
    }
  } catch (e) { corrupted = true; }

  if (corrupted) {
    console.warn("localStorage corrupto, intentando restaurar desde backup...");
    const backup = await restorePartsFromBackup();
    if (backup.length > 0) {
      parts = backup;
      saveParts();
      if (typeof toast === "function") toast("🔄 Datos restaurados desde backup en la nube", 4000);
      return true;
    } else {
      if (typeof toast === "function") toast("⚠️ localStorage corrupto y sin backup disponible", 5000);
    }
  }

  // Also check reviews
  try {
    const r = localStorage.getItem("ap_reviews_v2");
    if (r) { const p = JSON.parse(r); if (!Array.isArray(p)) throw 1; }
  } catch (e) {
    await restoreReviewsFromBackup();
  }

  return false;
}

// --- Hook into saveParts ---
const _origSaveParts = typeof saveParts === "function" ? saveParts : null;
// We override saveParts via a wrapper in backup-init

function incrementSaveCounter() {
  _saveCounter++;
  if (_saveCounter >= SNAPSHOT_EVERY) {
    _saveCounter = 0;
    backupPartsSnapshot();
  }
}

function startBackupTimer() {
  if (_backupTimer) return;
  _backupTimer = setInterval(() => {
    backupPartsSnapshot();
    backupReviews();
  }, BACKUP_INTERVAL);
}

// --- Init ---
async function initBackupSystem() {
  await checkAndRepairLocalStorage();
  startBackupTimer();

  // Override saveParts to also backup periodically
  if (typeof window.saveParts === "function" && !window.__backupHooked) {
    const orig = window.saveParts;
    window.saveParts = function() {
      orig();
      incrementSaveCounter();
    };
    window.__backupHooked = true;
  }

  // Hook into pendingReviews changes via savePendingReviews
  if (typeof window.savePendingReviews === "function" && !window.__reviewsHooked) {
    const orig = window.savePendingReviews;
    window.savePendingReviews = function() {
      orig();
      backupReviews();
    };
    window.__reviewsHooked = true;
  }
}

// Run after app init
(function() {
  const checkInit = setInterval(() => {
    if (typeof parts !== "undefined" && typeof saveParts === "function") {
      clearInterval(checkInit);
      initBackupSystem();
    }
  }, 500);
  // Safety timeout
  setTimeout(() => clearInterval(checkInit), 15000);
})();
