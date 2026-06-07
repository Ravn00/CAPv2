// ---
const CAT_SVGS = {
  parachoques:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="10" rx="2"/><path d="M5 7V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>`,
  opticos:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/></svg>`,
  focos:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>`,
  guardabarros:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  capots:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`,
  varios:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>`,
};
const QR_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><line x1="3" y1="10" x2="3" y2="21"/><line x1="10" y1="14" x2="10" y2="21"/><line x1="3" y1="21" x2="10" y2="21"/><line x1="14" y1="10" x2="14" y2="14"/><line x1="21" y1="14" x2="21" y2="21"/><line x1="14" y1="21" x2="21" y2="21"/></svg>`;
const CATS = {
  parachoques:{label:"Parachoques",icon:CAT_SVGS.parachoques},
  opticos:{label:"Ópticos",icon:CAT_SVGS.opticos},
  focos:{label:"Focos",icon:CAT_SVGS.focos},
  guardabarros:{label:"Guardabarros",icon:CAT_SVGS.guardabarros},
  capots:{label:"Capots",icon:CAT_SVGS.capots},
  varios:{label:"Varios",icon:CAT_SVGS.varios},
};
const ALL_FOLDERS = ["all", ...Object.keys(CATS)];
const PROMPT = `Eres el motor de IA de "CAPv2" — catálogo profesional de autopartes.

CAPACIDADES DEL SISTEMA:
- Catálogo con búsqueda por marca, modelo, año, posición, OEM, ubicación
- Códigos QR individuales por pieza (imprimibles para tracking físico)
- Stock, precios, margen de ganancia por pieza
- Dashboard con valor inventario, rotación, distribución por categoría
- Gestión de inventario
- Multi-tenant (soporta múltiples empresas aisladas)

INSTRUCCIONES:
- Analizá la imagen DETENIDAMENTE. No te rindas.
- Usá texto visible, logotipos, forma, color y razonamiento.
- Tenés acceso a internet y conocimiento de TODAS las marcas.
- Si ves un número de parte (ej: 44320-06010), incluilo en codigo_oem.
- Si no hay texto, inferí por diseño visual.

CONFIANZA: "Alta"=90%+ seguro, "Media"=60-89%, "Baja"=<60%

RESPONDÉ SOLO ESTE JSON SIN MARKDOWN:
{"marca":"marca o No determinado","modelo":"modelo o No determinado","años":"rango o No determinado","categoria":"parachoques|opticos|focos|guardabarros|capots|varios","descripcion":"max 60 chars","posicion":"Delantero|Trasero|Izquierdo|Derecho|Central|No determinado","confianza":"Alta|Media|Baja","codigo_oem":"código visible o vacío"}`;

const RETRY_WAITS = [15000, 30000, 45000, 60000, 90000];
const RETRY_MAX = RETRY_WAITS.length;

let parts = [];
let pendingReviews = [];
let queue = [];
let activeFolder = "all";
let folderSearch = {};
let folderStatus = {};
let processing = false;
let queuePaused = false;
let cancelledItems = new Set();
let editId = null;
let editBuf = {};
let confirmCb = null;
let manualPreviewDataUrl = null;
let manualPreviewFile = null;
let doneBatch = 0;
let totalBatch = 0;


ALL_FOLDERS.forEach(f => { folderSearch[f] = ""; folderStatus[f] = "all"; });


const procPill = $("proc-pill");
const procTxt = $("proc-txt");
const progWrap = $("prog-wrap");
const progFill = $("prog-fill");
const progLabel = $("prog-label");
const queueWrap = $("queue-wrap");
const queueRow = $("queue-row");
const folderContent = $("folder-content");

const fabExport = $("fab-export");

// ---