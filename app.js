"use strict";

/* ============================ Client Supabase ============================ */
const CONFIG_OK = window.SUPABASE_URL && !window.SUPABASE_URL.includes("VOTRE-PROJET")
  && window.SUPABASE_ANON_KEY && !window.SUPABASE_ANON_KEY.includes("VOTRE_CLE");
const db = CONFIG_OK ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY) : null;

// Exécute une requête supabase-js et lève une erreur lisible
async function q(builder) {
  const { data, error } = await builder;
  if (error) throw new Error(error.message || "Erreur Supabase");
  return data;
}

/* ============================ Helpers ============================ */
const $ = (sel, el = document) => el.querySelector(sel);
const el = (tag, attrs = {}, html) => {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === "class") e.className = attrs[k];
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  }
  if (html != null) e.innerHTML = html;
  return e;
};
const num = (v) => {
  if (v === "" || v == null) return null;
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? null : n;
};
const sgToPlato = (sg) => sg == null ? null : -616.868 + 1111.14*sg - 630.272*sg*sg + 135.997*sg*sg*sg;
const platoToSg = (p) => p == null ? null : 1 + p/(258.6 - (p/258.2)*227.1);
const attenuation = (og, sg) => (!og || !sg || og <= 1) ? null : ((og - sg)/(og - 1))*100;
const today = () => new Date().toISOString().slice(0,10);
const fmtDate = (s) => { const d = new Date(s); return d.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"2-digit"}); };
const fmtDT = (s) => { const d = new Date(s); return d.toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}); };

let TOAST_T;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(TOAST_T); TOAST_T = setTimeout(() => t.classList.add("hidden"), 2600);
}

/* ============================ État & rôles ============================ */
const S = { me: null, fermenters: [], lots: [], settings: {}, tab: "saisie" };
const isSup = () => S.me?.role === "superviseur";
const canWrite = () => S.me?.role === "operateur" || S.me?.role === "superviseur";
const roleLabel = (r) => ({consultation:"Consultation",operateur:"Opérateur",superviseur:"Superviseur"}[r] || r);
const densUnit = () => S.settings.density_unit === "P" ? "P" : "SG";

const ADD_TYPES = ["Dry hop","Fruits","Sucre","Levure","Acide / correction","Autre"];
const UNITS = ["g/hl","kg/hl","kg","g","L","g/L"];

/* ============================ Démarrage ============================ */
init();
async function init() {
  $("#login-btn").addEventListener("click", doLogin);
  $("#guest-btn").addEventListener("click", doGuest);
  $("#login-pass").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });

  if (!CONFIG_OK) {
    $("#login").classList.remove("hidden");
    $("#login-err").textContent = "Configuration manquante : renseignez SUPABASE_URL et SUPABASE_ANON_KEY dans config.js.";
    $("#login-btn").disabled = true; $("#guest-btn").disabled = true;
    return;
  }
  try {
    const { data: { session } } = await db.auth.getSession();
    if (session) { await loadProfile(session.user); await enterApp(); }
    else showLogin();
  } catch (_) { showLogin(); }
}

function showLogin() {
  $("#app").classList.add("hidden");
  $("#login").classList.remove("hidden");
  $("#login-user").focus();
}

async function loadProfile(user) {
  let role = "operateur", name = user.email;
  try {
    const rows = await q(db.from("profiles").select("display_name,role").eq("id", user.id).limit(1));
    if (rows[0]) { role = rows[0].role; name = rows[0].display_name || user.email; }
  } catch (_) {}
  S.me = { id: user.id, email: user.email, role, display_name: name };
}

async function doLogin() {
  $("#login-err").textContent = "";
  let id = $("#login-user").value.trim();
  if (!id) { $("#login-err").textContent = "Identifiant requis"; return; }
  const email = id.includes("@") ? id : `${id}@${window.EMAIL_DOMAIN}`;
  try {
    const { data, error } = await db.auth.signInWithPassword({ email, password: $("#login-pass").value });
    if (error) throw error;
    await loadProfile(data.user);
    await enterApp();
  } catch (e) { $("#login-err").textContent = "Identifiant ou mot de passe incorrect"; }
}

function doGuest() {
  S.me = { role: "consultation", display_name: "Invité" };
  enterApp();
}

async function enterApp() {
  $("#login").classList.add("hidden");
  $("#app").classList.remove("hidden");
  renderUserBox();
  try { await refreshData(); }
  catch (e) { toast("Erreur de chargement : " + e.message); }
  if (!canWrite() && S.tab === "saisie") S.tab = "courbes";
  buildTabs();
  go(S.tab);
}

function renderUserBox() {
  const box = $("#user-box"); box.innerHTML = "";
  box.appendChild(el("span", { class: "muted" }, `${S.me.display_name} · ${roleLabel(S.me.role)}`));
  if (S.me.role === "consultation") {
    box.appendChild(el("button", { class: "btn ghost sm", onclick: () => location.reload() }, "Se connecter"));
  } else {
    box.appendChild(el("button", { class: "btn ghost sm", onclick: changePassword }, "Mot de passe"));
    box.appendChild(el("button", { class: "btn ghost sm", onclick: doLogout }, "Déconnexion"));
  }
}

async function doLogout() { await db.auth.signOut(); location.reload(); }

async function changePassword() {
  const pw = prompt("Nouveau mot de passe (4 caractères minimum) :");
  if (pw == null) return;
  if (pw.length < 4) { toast("Trop court"); return; }
  try { const { error } = await db.auth.updateUser({ password: pw }); if (error) throw error; toast("Mot de passe changé ✓"); }
  catch (e) { toast(e.message); }
}

async function refreshData() {
  const [ferms, lotsRaw, setRows] = await Promise.all([
    q(db.from("fermenters").select("*").eq("archived", false).order("site").order("name")),
    q(db.from("lots").select("*, fermenter:fermenters(name,volume_hl,site)")),
    q(db.from("settings").select("*")),
  ]);
  S.fermenters = ferms;
  S.lots = lotsRaw.map(l => ({
    ...l,
    fermenter_name: l.fermenter?.name,
    volume_hl: l.fermenter?.volume_hl,
    site: l.fermenter?.site,
  })).sort((a, b) => {
    const aa = a.status === "Active", ba = b.status === "Active";
    if (aa !== ba) return aa ? -1 : 1;
    return (b.start_date || "").localeCompare(a.start_date || "");
  });
  S.settings = {}; setRows.forEach(r => S.settings[r.key] = r.value);
}

function buildTabs() {
  const tabs = [];
  if (canWrite()) tabs.push(["saisie","Saisie"]);
  tabs.push(["courbes","Courbes"], ["lots","Cuves & lots"]);
  if (isSup()) tabs.push(["admin","Admin"]);
  const nav = $("#tabs"); nav.innerHTML = "";
  tabs.forEach(([id,label]) => nav.appendChild(
    el("button", { class: S.tab===id?"active":"", onclick:()=>go(id) }, label)));
}

function go(tab) {
  if (tab === "saisie" && !canWrite()) tab = "courbes";
  if (tab === "admin" && !isSup()) tab = "courbes";
  S.tab = tab; buildTabs();
  const v = $("#view"); v.innerHTML = "";
  if (tab==="saisie") viewSaisie(v);
  else if (tab==="courbes") viewCourbes(v);
  else if (tab==="lots") viewLots(v);
  else if (tab==="admin") viewAdmin(v);
}

/* ============================ SAISIE ============================ */
function viewSaisie(root) {
  const active = S.lots.filter(l=>l.status==="Active");
  if (!active.length) { root.appendChild(emptyBox("Aucun lot actif","Créez un lot dans « Cuves & lots ».")); return; }

  const grid = el("div",{class:"grid cols-2"});
  const left = el("div",{class:"stack"}); const right = el("div",{class:"stack"});
  grid.append(left,right); root.appendChild(grid);

  let lotId = active[0].id;

  const selCard = el("div",{class:"card"});
  const sel = el("select");
  active.forEach(l=> sel.appendChild(el("option",{value:l.id}, `${l.fermenter_name} — ${l.beer_name}${l.batch_no?` (${l.batch_no})`:""}`)));
  selCard.append(el("label",{}, "Lot en cours"), sel);
  const lotInfo = el("div",{class:"flexb mt"}); selCard.appendChild(lotInfo);
  left.appendChild(selCard);

  const formCard = el("div",{class:"card"});
  formCard.appendChild(el("h3",{},"Nouveau relevé"));
  const r = el("div",{class:"row"});
  const fDate = inp("date", today());
  const fDens = inp("text","", densUnit()==="P"?"12.5":"1.048");
  const platoHint = el("div",{class:"hint"});
  const fPh = inp("text","","4.2");
  const fTemp = inp("text","","20");
  const fPress = inp("text","","0.0");
  const fNote = inp("text","","optionnel");
  const fOp = inp("text","", S.me.display_name);
  r.append(lab("Date", fDate), lab(`Densité (${densUnit()==="P"?"°P":"SG"})`, fDens, platoHint),
    lab("pH", fPh), lab("Température (°C)", fTemp), lab("Pression (bar)", fPress), lab("Saisi par", fOp));
  formCard.appendChild(r);
  formCard.appendChild(lab("Commentaire", fNote));
  fDens.addEventListener("input", ()=>{
    const n = num(fDens.value);
    const sg = n==null?null:(densUnit()==="P"?platoToSg(n):n);
    platoHint.textContent = sg!=null?`≈ ${sgToPlato(sg).toFixed(1)} °P`:"";
  });
  const saveBtn = el("button",{class:"btn primary mt"},"Enregistrer le relevé");
  formCard.appendChild(saveBtn);
  left.appendChild(formCard);

  const recentCard = el("div",{class:"card"});
  recentCard.appendChild(el("h3",{},"Derniers relevés"));
  const recentBody = el("div",{class:"scroll"}); recentCard.appendChild(recentBody);
  left.appendChild(recentCard);

  right.appendChild(addPanel(()=>lotId));

  async function loadInfo() {
    const l = active.find(x=>x.id==lotId);
    lotInfo.innerHTML = "";
    lotInfo.append(
      el("span",{class:`badge ${l.phase==="Garde"?"garde":"ferm"}`}, l.phase),
      el("span",{class:"muted"}, `${l.fermenter_name} · ${l.volume_hl||"?"} hl · ${l.site||""}`));
    if (l.og) lotInfo.append(el("span",{class:"muted"}, `· DI ${(+l.og).toFixed(3)} (${sgToPlato(+l.og).toFixed(1)}°P)`));
    try {
      const ms = await q(db.from("measurements").select("*").eq("lot_id", lotId).order("ts"));
      recentBody.innerHTML = "";
      if (!ms.length) { recentBody.appendChild(el("p",{class:"muted"},"Aucun relevé pour l'instant.")); return; }
      const t = el("table");
      t.innerHTML = `<thead><tr><th>Date</th><th>Densité</th><th>pH</th><th>T°</th><th>Bar</th><th>Par</th></tr></thead>`;
      const tb = el("tbody");
      ms.slice(-6).reverse().forEach(m=> tb.appendChild(el("tr",{},
        `<td>${fmtDate(m.ts)}</td><td>${m.densite_sg!=null?(+m.densite_sg).toFixed(3):"—"}</td><td>${m.ph??"—"}</td><td>${m.temp??"—"}</td><td>${m.pressure??"—"}</td><td class="muted">${m.author||""}</td>`)));
      t.appendChild(tb); recentBody.appendChild(t);
    } catch(e){ toast(e.message); }
  }

  sel.addEventListener("change", ()=>{ lotId = sel.value; loadInfo(); });

  saveBtn.addEventListener("click", async ()=>{
    const l = active.find(x=>x.id==lotId);
    const dn = num(fDens.value);
    const sg = dn==null?null:(densUnit()==="P"?platoToSg(dn):dn);
    if (sg==null && num(fPh.value)==null && num(fTemp.value)==null && num(fPress.value)==null) { toast("Renseignez au moins une valeur"); return; }
    try {
      await q(db.from("measurements").insert({
        lot_id: l.id, date: fDate.value, densite_sg: sg, ph: num(fPh.value),
        temp: num(fTemp.value), pressure: num(fPress.value), phase: l.phase,
        operator: fOp.value.trim() || null, note: fNote.value.trim() || null }));
      fDens.value=""; fPh.value=""; fTemp.value=""; fPress.value=""; fNote.value=""; platoHint.textContent="";
      toast("Relevé enregistré ✓"); loadInfo();
    } catch(e){ toast(e.message); }
  });

  loadInfo();
}

function addPanel(getLotId) {
  const card = el("div",{class:"card"});
  card.appendChild(el("h3",{},"Ajout / houblonnage"));
  const aDate = inp("date", today());
  const aType = sels(ADD_TYPES);
  const aLabel = inp("text","","Citra, framboise, sucre candi…");
  const aQty = inp("text","","200");
  const aUnit = sels(UNITS);
  card.append(lab("Date", aDate), lab("Type", aType), lab("Désignation", aLabel));
  const qrow = el("div",{class:"row"}); qrow.style.gridTemplateColumns = "1fr 1fr";
  qrow.append(lab("Quantité", aQty), lab("Unité", aUnit));
  card.appendChild(qrow);
  const btn = el("button",{class:"btn primary mt"},"Enregistrer l'ajout"); btn.style.width="100%";
  card.appendChild(btn);
  const recent = el("div",{class:"stack mt"}); card.appendChild(recent);

  async function load(){
    try {
      const arr = await q(db.from("additions").select("*").eq("lot_id", getLotId()).order("ts"));
      recent.innerHTML = "";
      arr.slice(-4).reverse().forEach(a=> recent.appendChild(el("div",{class:"flexb",style:"font-size:12px;border-top:1px solid #f0efed;padding-top:6px"},
        `<span>${fmtDate(a.ts)} · ${a.type} — ${a.label}</span><span class="spacer"></span><span class="muted">${a.qty!=null?`${a.qty} ${a.unit||""}`:""}</span>`)));
    } catch(e){ /* silencieux */ }
  }
  btn.addEventListener("click", async ()=>{
    if (!aLabel.value.trim()) { toast("Précisez l'ajout"); return; }
    try{
      await q(db.from("additions").insert({
        lot_id: getLotId(), date: aDate.value, type: aType.value, label: aLabel.value.trim(),
        qty: num(aQty.value), unit: aUnit.value, operator: S.me.display_name }));
      aLabel.value=""; aQty.value=""; toast("Ajout enregistré ✓"); load();
    }catch(e){ toast(e.message); }
  });
  load();
  return card;
}

/* ============================ COURBES ============================ */
let CHART = null;
function viewCourbes(root) {
  if (!S.lots.length) { root.appendChild(emptyBox("Aucun lot","Créez un lot puis saisissez des relevés.")); return; }

  const head = el("div",{class:"card"});
  const sel = el("select");
  S.lots.forEach(l=> sel.appendChild(el("option",{value:l.id},
    `${l.fermenter_name} — ${l.beer_name}${l.batch_no?` (${l.batch_no})`:""}${l.status!=="Active"?" · terminé":""}`)));
  const exportBtn = el("button",{class:"btn ghost"},"⬇ Export CSV");
  const top = el("div",{class:"flexb"});
  const selWrap = el("div",{style:"flex:1;min-width:220px"}); selWrap.append(lab("Lot", sel));
  top.append(selWrap, exportBtn); head.appendChild(top);
  const stats = el("div",{class:"stats"}); head.appendChild(stats);
  root.appendChild(head);

  const chartCard = el("div",{class:"card mt"});
  const ch = el("div",{class:"flexb"});
  ch.appendChild(el("h3",{style:"margin:0;flex:1"},"Courbe de fermentation"));
  const seg = el("div",{class:"seg"}); let secondary = "temp";
  [["temp","T°"],["ph","pH"],["pressure","Bar"]].forEach(([k,l])=>{
    const b = el("button",{class:k===secondary?"active":""}, l);
    b.addEventListener("click",()=>{ secondary=k; [...seg.children].forEach(c=>c.classList.remove("active")); b.classList.add("active"); draw(); });
    seg.appendChild(b);
  });
  ch.appendChild(seg); chartCard.appendChild(ch);
  const wrap = el("div",{class:"chart-wrap mt"}); const canvas = el("canvas");
  wrap.appendChild(canvas); chartCard.appendChild(wrap);
  chartCard.appendChild(el("p",{class:"hint"},"Densité à gauche · série à droite · traits verts = ajouts (dry hop, fruits, sucres…)"));
  root.appendChild(chartCard);

  const histCard = el("div",{class:"card mt"});
  histCard.appendChild(el("h3",{},"Historique des relevés"));
  const histBody = el("div",{class:"scroll"}); histCard.appendChild(histBody);
  root.appendChild(histCard);

  let meas = [], adds = [], lot = null;

  async function load() {
    lot = S.lots.find(l=>l.id==sel.value);
    try {
      [meas, adds] = await Promise.all([
        q(db.from("measurements").select("*").eq("lot_id", lot.id).order("ts")),
        q(db.from("additions").select("*").eq("lot_id", lot.id).order("ts")),
      ]);
    } catch(e){ toast(e.message); meas=[]; adds=[]; }
    renderStats(); draw(); renderHist();
  }

  function renderStats() {
    const withD = meas.filter(m=>m.densite_sg!=null);
    const last = withD[withD.length-1];
    const og = lot.og || withD[0]?.densite_sg;
    const att = (og && last) ? attenuation(+og, +last.densite_sg) : null;
    stats.innerHTML = "";
    const add = (k,v)=> stats.appendChild(el("div",{class:"stat"},`<div class="k">${k}</div><div class="v">${v}</div>`));
    add("Densité initiale", og?(+og).toFixed(3):"—");
    add("Densité actuelle", last?(+last.densite_sg).toFixed(3):"—");
    add("Atténuation app.", att!=null?att.toFixed(0)+" %":"—");
    add("Relevés", meas.length);
    add("Phase", lot.phase);
  }

  function draw() {
    const dens = meas.filter(m=>m.densite_sg!=null).map(m=>({x:new Date(m.ts).getTime(), y:+m.densite_sg}));
    const sec = meas.filter(m=>m[secondary]!=null).map(m=>({x:new Date(m.ts).getTime(), y:+m[secondary]}));
    const secLabel = {temp:"Température (°C)",ph:"pH",pressure:"Pression (bar)"}[secondary];
    const secColor = {temp:"#0e7490",ph:"#7c3aed",pressure:"#475569"}[secondary];
    const markers = adds.map(a=>({x:new Date(a.ts).getTime(), label:a.label}));

    if (CHART) CHART.destroy();
    CHART = new Chart(canvas.getContext("2d"), {
      type:"line",
      data:{ datasets:[
        { label:"Densité", data:dens, yAxisID:"d", borderColor:"#92400e", backgroundColor:"#92400e", borderWidth:2.5, tension:.25, pointRadius:3 },
        { label:secLabel, data:sec, yAxisID:"s", borderColor:secColor, backgroundColor:secColor, borderWidth:1.8, tension:.25, pointRadius:2.5 },
      ]},
      options:{
        responsive:true, maintainAspectRatio:false, parsing:true,
        interaction:{mode:"nearest",intersect:false},
        scales:{
          x:{ type:"linear", ticks:{ callback:(v)=>fmtDate(new Date(v).toISOString()), maxRotation:0, font:{size:11} } },
          d:{ position:"left", ticks:{ callback:(v)=>v.toFixed(3), font:{size:11} }, title:{display:true,text:"Densité (SG)",font:{size:11}} },
          s:{ position:"right", grid:{drawOnChartArea:false}, ticks:{font:{size:11}}, title:{display:true,text:secLabel,font:{size:11}} },
        },
        plugins:{
          legend:{labels:{font:{size:12}}},
          tooltip:{ callbacks:{ title:(items)=> items.length?fmtDT(new Date(items[0].parsed.x).toISOString()):"" } },
        },
      },
      plugins:[ addMarkersPlugin(markers) ],
    });
  }

  function renderHist() {
    histBody.innerHTML = "";
    if (!meas.length) { histBody.appendChild(el("p",{class:"muted"},"Aucun relevé.")); return; }
    const t = el("table");
    t.innerHTML = `<thead><tr><th>Date</th><th>Phase</th><th>Densité</th><th>°P</th><th>pH</th><th>T°</th><th>Bar</th><th>Par</th><th>Note</th>${isSup()?"<th></th>":""}</tr></thead>`;
    const tb = el("tbody");
    [...meas].reverse().forEach(m=>{
      const tr = el("tr",{},`<td>${fmtDT(m.ts)}</td><td>${m.phase||""}</td><td>${m.densite_sg!=null?(+m.densite_sg).toFixed(3):"—"}</td><td>${m.densite_sg!=null?sgToPlato(+m.densite_sg).toFixed(1):"—"}</td><td>${m.ph??"—"}</td><td>${m.temp??"—"}</td><td>${m.pressure??"—"}</td><td class="muted">${m.author||""}</td><td class="muted">${m.note||""}</td>`);
      if (isSup()) {
        const td = el("td"); const b = el("button",{class:"btn danger sm"},"suppr.");
        b.addEventListener("click", async ()=>{ if(confirm("Supprimer ce relevé ?")){ try{ await q(db.from("measurements").delete().eq("id", m.id)); toast("Supprimé"); load(); }catch(e){toast(e.message);} }});
        td.appendChild(b); tr.appendChild(td);
      }
      tb.appendChild(tr);
    });
    t.appendChild(tb); histBody.appendChild(t);
    if (!isSup()) histBody.appendChild(el("p",{class:"hint"},"Relevés en lecture seule. Une correction nécessite un compte superviseur."));
  }

  function exportCSV() {
    const rows = [["Date/heure","Phase","Densite_SG","Plato","pH","Temp_C","Pression_bar","Saisi_par","Compte","Commentaire"]];
    meas.forEach(m=>rows.push([fmtDT(m.ts), m.phase||"", m.densite_sg??"", m.densite_sg!=null?sgToPlato(+m.densite_sg).toFixed(2):"",
      m.ph??"", m.temp??"", m.pressure??"", m.operator||"", m.author||"", (m.note||"").replace(/[;\n]/g," ")]));
    rows.push([]); rows.push(["AJOUTS"]); rows.push(["Date","Type","Designation","Quantite","Unite","Note"]);
    adds.forEach(a=>rows.push([fmtDate(a.ts), a.type, a.label, a.qty??"", a.unit||"", (a.note||"").replace(/[;\n]/g," ")]));
    const csv = "\uFEFF"+rows.map(r=>r.join(";")).join("\n");
    const blob = new Blob([csv],{type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob); const a = el("a"); a.href=url;
    a.download = `${lot.fermenter_name||"lot"}_${lot.beer_name||""}.csv`.replace(/\s+/g,"_");
    a.click(); URL.revokeObjectURL(url);
  }
  exportBtn.addEventListener("click", ()=>{ if(meas.length) exportCSV(); else toast("Aucun relevé à exporter"); });

  sel.addEventListener("change", load);
  load();
}

function addMarkersPlugin(markers) {
  return {
    id:"addMarkers",
    afterDatasetsDraw(chart){
      const {ctx, chartArea, scales} = chart; const xs = scales.x; if (!xs) return;
      ctx.save();
      markers.forEach(m=>{
        const px = xs.getPixelForValue(m.x);
        if (px < chartArea.left || px > chartArea.right) return;
        ctx.strokeStyle = "#16a34a"; ctx.lineWidth = 1; ctx.setLineDash([4,3]);
        ctx.beginPath(); ctx.moveTo(px, chartArea.top); ctx.lineTo(px, chartArea.bottom); ctx.stroke();
        ctx.setLineDash([]); ctx.fillStyle = "#16a34a"; ctx.font = "10px system-ui";
        ctx.save(); ctx.translate(px+3, chartArea.top+4); ctx.fillText(m.label, 0, 0); ctx.restore();
      });
      ctx.restore();
    }
  };
}

/* ============================ CUVES & LOTS ============================ */
function viewLots(root) {
  const grid = el("div",{class:"grid cols-2"});
  const left = el("div",{class:"stack"}); const right = el("div",{class:"stack"});
  grid.append(left,right); root.appendChild(grid);

  if (canWrite()) {
    const occupied = new Set(S.lots.filter(l=>l.status==="Active").map(l=>l.fermenter_id));
    const create = el("div",{class:"card"});
    create.appendChild(el("h3",{},"Nouveau lot (bière dans un fermenteur)"));
    const fSel = el("select");
    S.fermenters.forEach(f=>{ const o = el("option",{value:f.id}, `${f.name}${occupied.has(f.id)?" (occupé)":""}`); if(occupied.has(f.id)) o.disabled=true; fSel.appendChild(o); });
    const cBeer = inp("text","","Nom / recette");
    const cBatch = inp("text","","optionnel");
    const cOg = inp("text","","1.052");
    const ogHint = el("div",{class:"hint"});
    const cDate = inp("date", today());
    const r = el("div",{class:"row"});
    r.append(lab("Fermenteur",fSel), lab("Bière",cBeer), lab("N° brassin",cBatch),
             lab("Densité initiale (SG)", cOg, ogHint), lab("Date de départ", cDate));
    create.appendChild(r);
    cOg.addEventListener("input",()=>{ const n=num(cOg.value); ogHint.textContent = n?`${sgToPlato(n).toFixed(1)} °P`:""; });
    const cBtn = el("button",{class:"btn primary mt"},"Créer le lot");
    create.appendChild(cBtn); left.appendChild(create);
    cBtn.addEventListener("click", async ()=>{
      if(!cBeer.value.trim()){ toast("Nom de la bière requis"); return; }
      try{
        await q(db.from("lots").insert({ fermenter_id:Number(fSel.value), beer_name:cBeer.value.trim(),
          batch_no:cBatch.value.trim()||null, og:num(cOg.value), start_date:cDate.value }));
        toast("Lot créé ✓"); await refreshData(); go("lots");
      }catch(e){ toast(e.message); }
    });
  }

  const active = S.lots.filter(l=>l.status==="Active");
  const ac = el("div",{class:"card"});
  ac.appendChild(el("h3",{},`Lots actifs (${active.length})`));
  if(!active.length) ac.appendChild(el("p",{class:"muted"},"Aucun lot actif."));
  active.forEach(l=>{
    const item = el("div",{class:"lot-item"});
    item.appendChild(el("div",{style:"flex:1"},`<div class="title">${l.fermenter_name} — ${l.beer_name} ${l.batch_no?`<span class="muted">(${l.batch_no})</span>`:""}</div><div class="sub">Départ ${l.start_date?fmtDate(l.start_date):"?"} ${l.og?`· DI ${(+l.og).toFixed(3)}`:""}</div>`));
    item.appendChild(el("span",{class:`badge ${l.phase==="Garde"?"garde":"ferm"}`}, l.phase));
    if (canWrite()) {
      const toggle = el("button",{class:"btn ghost sm"}, l.phase==="Fermentation"?"→ Garde":"→ Fermentation");
      toggle.addEventListener("click", async ()=>{ try{ await q(db.from("lots").update({phase:l.phase==="Fermentation"?"Garde":"Fermentation"}).eq("id",l.id)); toast("Phase mise à jour"); await refreshData(); go("lots"); }catch(e){toast(e.message);} });
      const close = el("button",{class:"btn ghost sm"},"Clôturer");
      close.addEventListener("click", async ()=>{ if(confirm("Clôturer ce lot ?")){ try{ await q(db.from("lots").update({status:"Terminé", end_date:today()}).eq("id",l.id)); toast("Lot clôturé"); await refreshData(); go("lots"); }catch(e){toast(e.message);} }});
      item.append(toggle, close);
    }
    ac.appendChild(item);
  });
  left.appendChild(ac);

  const done = S.lots.filter(l=>l.status!=="Active");
  if (done.length) {
    const dc = el("div",{class:"card"});
    dc.appendChild(el("h3",{},`Lots terminés (${done.length})`));
    done.forEach(l=>{
      const row = el("div",{class:"flexb",style:"border-top:1px solid #f0efed;padding:7px 0;font-size:13px"});
      row.appendChild(el("span",{},`${l.fermenter_name} — ${l.beer_name} <span class="muted">· ${l.start_date?fmtDate(l.start_date):""} → ${l.end_date?fmtDate(l.end_date):""}</span>`));
      row.appendChild(el("span",{class:"spacer"}));
      if (isSup()) { const b=el("button",{class:"btn ghost sm"},"Réactiver"); b.addEventListener("click",async()=>{ try{ await q(db.from("lots").update({status:"Active",end_date:null}).eq("id",l.id)); await refreshData(); go("lots"); }catch(e){toast(e.message);} }); row.appendChild(b); }
      dc.appendChild(row);
    });
    left.appendChild(dc);
  }

  const fc = el("div",{class:"card"});
  fc.appendChild(el("h3",{},`Fermenteurs (${S.fermenters.length})`));
  const list = el("div",{style:"max-height:230px;overflow:auto"});
  S.fermenters.forEach(f=>{
    const row = el("div",{class:"flexb",style:"border-bottom:1px solid #f0efed;padding:5px 0;font-size:13px"});
    row.appendChild(el("span",{},f.name)); row.appendChild(el("span",{class:"spacer"}));
    row.appendChild(el("span",{class:"muted"},`${f.volume_hl||"?"} hl · ${f.site||""}`));
    if (isSup()) { const b=el("button",{class:"btn danger sm",style:"margin-left:8px"},"×"); b.title="Archiver"; b.addEventListener("click",async()=>{ if(confirm(`Archiver ${f.name} ?`)){ try{ await q(db.from("fermenters").update({archived:true}).eq("id",f.id)); await refreshData(); go("lots"); }catch(e){toast(e.message);} }}); row.appendChild(b); }
    list.appendChild(row);
  });
  fc.appendChild(list);
  if (isSup()) {
    const nName = inp("text","","Nom"); const nVol = inp("text","","Vol. hl"); const nSite = sels(["Historique","Salem"]);
    const add = el("div",{class:"stack mt",style:"border-top:1px solid var(--line);padding-top:10px"});
    add.appendChild(lab("Ajouter un fermenteur", nName));
    const rr = el("div",{class:"row"}); rr.style.gridTemplateColumns="1fr 1fr";
    rr.append(lab("Volume", nVol), lab("Site", nSite)); add.appendChild(rr);
    const ab = el("button",{class:"btn ghost"},"Ajouter"); ab.style.width="100%";
    ab.addEventListener("click", async ()=>{ if(!nName.value.trim()){toast("Nom requis");return;} try{ await q(db.from("fermenters").insert({name:nName.value.trim(),volume_hl:num(nVol.value),site:nSite.value})); toast("Fermenteur ajouté"); await refreshData(); go("lots"); }catch(e){toast(e.message);} });
    add.appendChild(ab); fc.appendChild(add);
  }
  right.appendChild(fc);
}

/* ============================ ADMIN ============================ */
function viewAdmin(root) {
  const set = el("div",{class:"card",style:"max-width:460px"});
  set.appendChild(el("h3",{},"Réglages"));
  const unit = sels([["SG","Densité (SG, ex. 1.048)"],["P","Degré Plato (°P)"]], S.settings.density_unit);
  set.appendChild(lab("Unité de densité (saisie)", unit));
  set.appendChild(el("p",{class:"hint"},"Toujours convertie en SG pour le stockage et les courbes."));
  const sBtn = el("button",{class:"btn primary mt"},"Enregistrer");
  sBtn.addEventListener("click", async ()=>{ try{ await q(db.from("settings").update({value:unit.value}).eq("key","density_unit")); S.settings.density_unit=unit.value; toast("Réglages enregistrés"); }catch(e){toast(e.message);} });
  set.appendChild(sBtn);
  set.appendChild(el("p",{class:"hint",style:"margin-top:14px"},"La gestion des comptes et des rôles se fait dans le tableau de bord Supabase (Authentication → Users), pour des raisons de sécurité."));
  root.appendChild(set);
}

/* ============================ Petits composants ============================ */
function inp(type, value="", placeholder=""){ const e=el("input"); e.type=type; e.value=value; if(placeholder)e.placeholder=placeholder; return e; }
function sels(opts, value){ const s=el("select"); opts.forEach(o=>{ const [v,l]=Array.isArray(o)?o:[o,o]; const op=el("option",{value:v},l); if(value!=null&&String(value)===String(v))op.selected=true; s.appendChild(op); }); return s; }
function lab(text, ctrl, hint){ const l=el("label",{},text); l.appendChild(ctrl); if(hint)l.appendChild(hint); return l; }
function emptyBox(title, body){ return el("div",{class:"empty"},`<strong>${title}</strong>${body}`); }
