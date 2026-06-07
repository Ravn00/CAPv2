// DASHBOARD rendering
const BAR_COLORS = ["#C8A96E","#3DBFA0","#6B7280","#E55347","#E2A84B","#5B8DEF","#C084FC","#34D399","#F472B6","#F97316"];
function renderDashboard() {
  const total = parts.length;
  const disp = parts.filter(p=>(p.estado||(p.sold?"vendida":"disponible"))==="disponible").length;
  const vend = parts.filter(p=>(p.estado||(p.sold?"vendida":"disponible"))==="vendida").length;
  const conPrecio = parts.filter(p=>p.precioVenta>0);
  const valorInv = conPrecio.reduce((s,p)=>s+(p.precioVenta||0)*(p.stock||1),0);
  const precioProm = conPrecio.length ? conPrecio.reduce((s,p)=>s+(p.precioVenta||0),0)/conPrecio.length : 0;
  const conCompra = parts.filter(p=>p.precioCompra>0&&p.precioVenta>0);
  const margenProm = conCompra.length ? conCompra.reduce((s,p)=>s+(((p.precioVenta-p.precioCompra)/p.precioCompra)*100),0)/conCompra.length : 0;
  const rotacion = total ? Math.round((vend/total)*100) : 0;
  const resv = parts.filter(p=>(p.estado||(p.sold?"vendida":"disponible"))==="reservada").length;
  const sinUbic = parts.filter(p => !p.ubicacion).length;
  const sinPrecio = parts.filter(p => !p.precioVenta || p.precioVenta <= 0).length;

  $("dash-valor").textContent = "$"+valorInv.toLocaleString("es-CL",{minimumFractionDigits:0,maximumFractionDigits:0});
  $("dash-promedio").textContent = "$"+Math.round(precioProm).toLocaleString("es-CL");
  $("dash-margen").textContent = Math.round(margenProm)+"%";
  $("dash-rotacion").textContent = rotacion+"%";
  if($("dash-resv")) $("dash-resv").textContent = resv;
  $("dash-sin-ubic").textContent = sinUbic;
  $("dash-sin-precio").textContent = sinPrecio;

  const barEl = $("dash-bars"); barEl.innerHTML = "";
  const cats = Object.entries(CATS);
  cats.forEach(([k,c],i) => {
    const count = parts.filter(p=>p.categoria===k).length;
    if (!count) return;
    const pct = (count/total)*100;
    const row = document.createElement("div"); row.className = "dash-bar-row";
    row.innerHTML = `<div class="dash-bar-label">${c.label}</div>
      <div class="dash-bar-track"><div class="dash-bar-fill" style="width:${Math.max(pct,2)}%;background:${BAR_COLORS[i%BAR_COLORS.length]}"></div></div>
      <div class="dash-bar-count">${count}</div>`;
    barEl.appendChild(row);
  });

  const tbody = $("dash-tbody"); tbody.innerHTML = "";
  const sorted = [...parts].sort((a,b)=>{const da=new Date(a.addedAt).getTime()||0;const db=new Date(b.addedAt).getTime()||0;return db-da}).slice(0,20);
  sorted.forEach(p => {
    const tr = document.createElement("tr");
    const est = p.estado||(p.sold?"vendida":"disponible");
    const val = p.precioVenta ? "$"+Math.round(p.precioVenta).toLocaleString("es-CL") : "-";
    tr.innerHTML = `<td>${p.addedAt||"-"}</td><td>${escH(p.marca+" "+p.modelo).slice(0,30)}</td><td><span class="estado-badge estado-${est}">${est}</span></td><td>${val}</td>`;
    tbody.appendChild(tr);
  });
}
