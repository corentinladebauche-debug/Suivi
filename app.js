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

// Densité abrégée : on stocke en SG (1.059) mais on affiche/saisit "59".
function sgToAbbr(sg){
  if (sg == null) return "—";
  let p = (sg - 1) * 1000;
  p = Math.round(p * 10) / 10;
  return (Math.abs(p - Math.round(p)) < 1e-9) ? String(Math.round(p)) : String(p);
}
// Saisie : "59" -> 1.059. Tolère aussi une saisie directe en SG (1.059) par sécurité.
function parseDens(v){
  const n = num(v);
  if (n == null) return null;
  if (n > 0.95 && n < 1.25) return n;   // déjà saisi en SG
  return 1 + n / 1000;                  // saisi en abrégé (points)
}

// Ordre d'affichage des fermenteurs demandé (les non listés vont à la fin).
const FERM_ORDER = [
  "A","B","C","D","E","F","G","H","CC #1","CC #2","CC #3","CC #4","Alphonse","Brigitte","Didier","Corinne",
  "Patrick","Thierry","Martine","Bob",
  "1","2","3","4","5","6","Bertha","Maïté","9","10","11","12",
];
const fermRank = (name) => { const i = FERM_ORDER.indexOf(name); return i === -1 ? 999 : i; };
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
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    let fr = "Échec de connexion : " + msg;
    if (/not confirmed/i.test(msg))
      fr = "E-mail non confirmé. Dans Supabase, confirmez le compte (ou recréez-le avec « Auto Confirm User » coché), puis réessayez.";
    else if (/invalid login credentials/i.test(msg))
      fr = "Identifiants incorrects : vérifiez l'adresse e-mail EXACTE du compte (domaine compris) et le mot de passe.";
    $("#login-err").textContent = fr;
  }
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
  S.fermenters = ferms.sort((a, b) => {
    const ra = fermRank(a.name), rb = fermRank(b.name);
    if (ra !== rb) return ra - rb;
    return (a.site || "").localeCompare(b.site || "") || a.name.localeCompare(b.name);
  });
  S.lots = lotsRaw.map(l => ({
    ...l,
    fermenter_name: l.fermenter?.name,
    volume_hl: l.fermenter?.volume_hl,
    site: l.fermenter?.site,
  })).sort((a, b) => {
    const aa = a.status === "Active", ba = b.status === "Active";
    if (aa !== ba) return aa ? -1 : 1;
    const ra = fermRank(a.fermenter_name), rb = fermRank(b.fermenter_name);
    if (ra !== rb) return ra - rb;
    return (b.start_date || "").localeCompare(a.start_date || "");
  });
  S.settings = {}; setRows.forEach(r => S.settings[r.key] = r.value);
}

function buildTabs() {
  const tabs = [];
  if (canWrite()) tabs.push(["saisie","Saisie"]);
  tabs.push(["courbes","Courbes"], ["lots","Cuves & lots"]);
  if (canWrite()) tabs.push(["import","Import"]);
  if (isSup()) tabs.push(["admin","Admin"]);
  const nav = $("#tabs"); nav.innerHTML = "";
  tabs.forEach(([id,label]) => nav.appendChild(
    el("button", { class: S.tab===id?"active":"", onclick:()=>go(id) }, label)));
}

function go(tab) {
  if (tab === "saisie" && !canWrite()) tab = "courbes";
  if (tab === "import" && !canWrite()) tab = "courbes";
  if (tab === "admin" && !isSup()) tab = "courbes";
  S.tab = tab; buildTabs();
  const v = $("#view"); v.innerHTML = "";
  if (tab==="saisie") viewSaisie(v);
  else if (tab==="courbes") viewCourbes(v);
  else if (tab==="lots") viewLots(v);
  else if (tab==="import") viewImport(v);
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
  const fDens = inp("text","","59");
  const platoHint = el("div",{class:"hint"});
  const fPh = inp("text","","4.2");
  const fTemp = inp("text","","20");
  const fPress = inp("text","","0.0");
  const fNote = inp("text","","optionnel");
  const fOp = inp("text","", S.me.display_name);
  r.append(lab("Date", fDate), lab("Densité (ex. 59 = 1.059)", fDens, platoHint),
    lab("pH", fPh), lab("Température (°C)", fTemp), lab("Pression (bar)", fPress), lab("Saisi par", fOp));
  formCard.appendChild(r);
  formCard.appendChild(lab("Commentaire", fNote));
  fDens.addEventListener("input", ()=>{
    const sg = parseDens(fDens.value);
    platoHint.textContent = sg!=null?`= ${sg.toFixed(3)} · ≈ ${sgToPlato(sg).toFixed(1)} °P`:"";
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
    if (l.og) lotInfo.append(el("span",{class:"muted"}, `· DiM ${sgToAbbr(+l.og)} (${sgToPlato(+l.og).toFixed(1)}°P)`));
    try {
      const ms = await q(db.from("measurements").select("*").eq("lot_id", lotId).order("ts"));
      recentBody.innerHTML = "";
      if (!ms.length) { recentBody.appendChild(el("p",{class:"muted"},"Aucun relevé pour l'instant.")); return; }
      const t = el("table");
      t.innerHTML = `<thead><tr><th>Date</th><th>Densité</th><th>pH</th><th>T°</th><th>Bar</th><th>Par</th></tr></thead>`;
      const tb = el("tbody");
      ms.slice(-6).reverse().forEach(m=> tb.appendChild(el("tr",{},
        `<td>${fmtDate(m.ts)}</td><td>${sgToAbbr(m.densite_sg)}</td><td>${m.ph??"—"}</td><td>${m.temp??"—"}</td><td>${m.pressure??"—"}</td><td class="muted">${m.author||""}</td>`)));
      t.appendChild(tb); recentBody.appendChild(t);
    } catch(e){ toast(e.message); }
  }

  sel.addEventListener("change", ()=>{ lotId = sel.value; loadInfo(); });

  saveBtn.addEventListener("click", async ()=>{
    const l = active.find(x=>x.id==lotId);
    const sg = parseDens(fDens.value);
    if (sg==null && num(fPh.value)==null && num(fTemp.value)==null && num(fPress.value)==null) { toast("Renseignez au moins une valeur"); return; }
    try {
      await q(db.from("measurements").insert({
        lot_id: l.id, ts: (fDate.value || today()) + "T12:00:00Z", date: fDate.value, densite_sg: sg, ph: num(fPh.value),
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
        lot_id: getLotId(), ts: (aDate.value || today()) + "T12:00:00Z", date: aDate.value, type: aType.value, label: aLabel.value.trim(),
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
  chartCard.appendChild(el("p",{class:"hint"},"Densité à gauche (◆ = DiM, point de départ) · série à droite · traits verts = ajouts (dry hop, fruits, sucres…)"));
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
    add("DiM", og?sgToAbbr(+og):"—");
    add("Densité actuelle", last?sgToAbbr(+last.densite_sg):"—");
    add("Atténuation app.", att!=null?att.toFixed(0)+" %":"—");
    add("Relevés", meas.length);
    add("Phase", lot.phase);
  }

  function draw() {
    const dens = meas.filter(m=>m.densite_sg!=null).map(m=>({x:new Date(m.ts).getTime(), y:+m.densite_sg}));
    // DiM = point de départ de la densité, à la date de départ du lot.
    let dimAdded = false;
    if (lot.og && lot.start_date) {
      const startT = new Date(lot.start_date + "T12:00:00Z").getTime();
      if (!dens.length || dens[0].x > startT) { dens.unshift({ x: startT, y: +lot.og }); dimAdded = true; }
    }
    const sec = meas.filter(m=>m[secondary]!=null).map(m=>({x:new Date(m.ts).getTime(), y:+m[secondary]}));
    const secLabel = {temp:"Température (°C)",ph:"pH",pressure:"Pression (bar)"}[secondary];
    const secColor = {temp:"#0e7490",ph:"#7c3aed",pressure:"#475569"}[secondary];
    const markers = adds.map(a=>({x:new Date(a.ts).getTime(), label:a.label}));

    // Axe densité : 0 -> 60 (abr.). Monte jusqu'à la DiM si DiM > 60. S'étend si une mesure sort.
    const ogSg = lot.og ? +lot.og : null;
    let dMax = (ogSg && (ogSg - 1) * 1000 > 60) ? ogSg : 1.060;
    let dMin = 1.000;
    const dv = dens.map(p=>p.y);
    if (dv.length) { dMax = Math.max(dMax, ...dv); dMin = Math.min(dMin, ...dv); }

    // Axe secondaire : bornes par défaut selon la mesure, extension automatique.
    const sv = sec.map(p=>p.y);
    let sMin, sMax, sStep;
    if (secondary === "temp") {
      sMin = Math.floor(Math.min(-5, ...sv) / 5) * 5;
      sMax = Math.ceil(Math.max(25, ...sv) / 5) * 5;
      sStep = 5;
    } else if (secondary === "ph") {
      sMin = Math.min(3.5, ...sv);
      sMax = Math.max(5.2, ...sv);
    } else {
      sMin = Math.min(0, ...sv);
      sMax = Math.ceil(Math.max(3, ...sv));
      sStep = 0.5;
    }
    const sScale = { position:"right", min:sMin, max:sMax, grid:{drawOnChartArea:false},
      ticks:{ font:{size:11} }, title:{display:true,text:secLabel,font:{size:11}} };
    if (sStep) sScale.ticks.stepSize = sStep;

    if (CHART) CHART.destroy();
    CHART = new Chart(canvas.getContext("2d"), {
      type:"line",
      data:{ datasets:[
        { label:"Densité", data:dens, yAxisID:"d", borderColor:"#92400e", backgroundColor:"#92400e", borderWidth:2.5, tension:.25,
          pointRadius:(c)=> dimAdded && c.dataIndex===0 ? 5.5 : 3,
          pointStyle:(c)=> dimAdded && c.dataIndex===0 ? "rectRot" : "circle" },
        { label:secLabel, data:sec, yAxisID:"s", borderColor:secColor, backgroundColor:secColor, borderWidth:1.8, tension:.25, pointRadius:2.5 },
      ]},
      options:{
        responsive:true, maintainAspectRatio:false, parsing:true,
        interaction:{mode:"nearest",intersect:false},
        scales:{
          x:{ type:"linear", ticks:{ callback:(v)=>fmtDate(new Date(v).toISOString()), maxRotation:0, font:{size:11} } },
          d:{ position:"left", min:dMin, max:dMax,
              ticks:{ callback:(v)=>sgToAbbr(v), stepSize:0.010, font:{size:11} },
              title:{display:true,text:"Densité (abr.)",font:{size:11}} },
          s:sScale,
        },
        plugins:{
          legend:{labels:{font:{size:12}}},
          tooltip:{ callbacks:{
            title:(items)=> items.length?fmtDT(new Date(items[0].parsed.x).toISOString()):"",
            label:(it)=> it.dataset.label==="Densité"
              ? `${dimAdded && it.dataIndex===0 ? "DiM" : "Densité"} : ${sgToAbbr(it.parsed.y)}`
              : `${it.dataset.label} : ${it.parsed.y}`,
          } },
        },
      },
      plugins:[ addMarkersPlugin(markers), zeroTempLine(secondary === "temp") ],
    });
  }

  function renderHist() {
    histBody.innerHTML = "";
    if (!meas.length) { histBody.appendChild(el("p",{class:"muted"},"Aucun relevé.")); return; }
    const t = el("table");
    t.innerHTML = `<thead><tr><th>Date</th><th>Phase</th><th>Densité</th><th>°P</th><th>pH</th><th>T°</th><th>Bar</th><th>Par</th><th>Note</th>${isSup()?"<th></th>":""}</tr></thead>`;
    const tb = el("tbody");
    [...meas].reverse().forEach(m=>{
      const tr = el("tr",{},`<td>${fmtDT(m.ts)}</td><td>${m.phase||""}</td><td>${sgToAbbr(m.densite_sg)}</td><td>${m.densite_sg!=null?sgToPlato(+m.densite_sg).toFixed(1):"—"}</td><td>${m.ph??"—"}</td><td>${m.temp??"—"}</td><td>${m.pressure??"—"}</td><td class="muted">${m.author||""}</td><td class="muted">${m.note||""}</td>`);
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
    const rows = [["Date/heure","Phase","Densite_abr","Densite_SG","Plato","pH","Temp_C","Pression_bar","Saisi_par","Compte","Commentaire"]];
    meas.forEach(m=>rows.push([fmtDT(m.ts), m.phase||"", m.densite_sg!=null?sgToAbbr(+m.densite_sg):"", m.densite_sg??"", m.densite_sg!=null?sgToPlato(+m.densite_sg).toFixed(2):"",
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

function zeroTempLine(active) {
  return {
    id:"zeroTemp",
    afterDatasetsDraw(chart){
      if (!active) return;
      const s = chart.scales.s; if (!s) return;
      const y = s.getPixelForValue(0);
      const { left, right } = chart.chartArea;
      if (y == null || isNaN(y) || y < chart.chartArea.top || y > chart.chartArea.bottom) return;
      const ctx = chart.ctx; ctx.save();
      ctx.strokeStyle = "#0e7490"; ctx.lineWidth = 1.5; ctx.setLineDash([6,3]); ctx.globalAlpha = .55;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.fillStyle = "#0e7490"; ctx.font = "10px system-ui";
      ctx.fillText("0 °C", left + 4, y - 3); ctx.restore();
    }
  };
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
    const cOg = inp("text","","59");
    const ogHint = el("div",{class:"hint"});
    const cDate = inp("date", today());
    const r = el("div",{class:"row"});
    r.append(lab("Fermenteur",fSel), lab("Bière",cBeer),
             lab("DiM — densité initiale (ex. 59)", cOg, ogHint), lab("Date de départ", cDate));
    create.appendChild(r);
    cOg.addEventListener("input",()=>{ const sg=parseDens(cOg.value); ogHint.textContent = sg!=null?`= ${sg.toFixed(3)} · ≈ ${sgToPlato(sg).toFixed(1)} °P`:""; });
    const cBtn = el("button",{class:"btn primary mt"},"Créer le lot");
    create.appendChild(cBtn); left.appendChild(create);
    cBtn.addEventListener("click", async ()=>{
      if(!cBeer.value.trim()){ toast("Nom de la bière requis"); return; }
      const og = parseDens(cOg.value);
      if(og==null){ toast("La densité initiale (DiM) est obligatoire"); return; }
      try{
        await q(db.from("lots").insert({ fermenter_id:Number(fSel.value), beer_name:cBeer.value.trim(),
          og:og, start_date:cDate.value }));
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
    item.appendChild(el("div",{style:"flex:1"},`<div class="title">${l.fermenter_name} — ${l.beer_name}</div><div class="sub">Départ ${l.start_date?fmtDate(l.start_date):"?"} ${l.og?`· DiM ${sgToAbbr(+l.og)}`:""}</div>`));
    item.appendChild(el("span",{class:`badge ${l.phase==="Garde"?"garde":"ferm"}`}, l.phase));
    if (canWrite()) {
      // Fermentation -> Garde : tout opérateur. Garde -> Fermentation (retour) : superviseur seulement.
      const canRevert = isSup();
      if (l.phase === "Fermentation" || canRevert) {
        const toggle = el("button",{class:"btn ghost sm"}, l.phase==="Fermentation"?"→ Garde":"→ Fermentation");
        toggle.addEventListener("click", async ()=>{ try{ await q(db.from("lots").update({phase:l.phase==="Fermentation"?"Garde":"Fermentation"}).eq("id",l.id)); toast("Phase mise à jour"); await refreshData(); go("lots"); }catch(e){toast(e.message);} });
        item.append(toggle);
      }
      const close = el("button",{class:"btn ghost sm"},"Clôturer");
      close.addEventListener("click", async ()=>{ if(confirm("Clôturer ce lot ?")){ try{ await q(db.from("lots").update({status:"Terminé", end_date:today()}).eq("id",l.id)); toast("Lot clôturé"); await refreshData(); go("lots"); }catch(e){toast(e.message);} }});
      item.append(close);
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

/* ============================ IMPORT EXCEL ============================ */
const normKey = (s) => String(s).trim().toLowerCase().replace(/\s+/g," ");
function buildLookup(fs){ const m={}; for(const f of fs) m[normKey(f.name)] = f.name; return m; }
function resolveFerm(raw, lk){
  if (raw==null || raw==="") return null;
  const k = normKey(raw); if (lk[k]) return lk[k];
  const m = k.match(/^cc\s*#?\s*(\d+)$/); if (m && lk["cc #"+m[1]]) return lk["cc #"+m[1]];
  return null;
}
function normMeasure(v){
  if (v==null) return null; const s = String(v).trim().toLowerCase();
  if (s.startsWith("press")) return "press";
  if (s.startsWith("temp") || s.includes("°")) return "temp";
  if (s.startsWith("dens")) return "dens";
  if (s==="ph") return "ph";
  return null;
}
function xlDateStr(v){
  if (v==null || v==="") return null;
  const pad = (n)=> String(n).padStart(2,"0");
  if (typeof v==="number"){                         // numero de serie Excel -> jour entier en UTC (independant du fuseau)
    const d = new Date(Math.round(v - 25569) * 86400 * 1000);
    return isNaN(d) ? null : `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
  }
  if (v instanceof Date && !isNaN(v))               // secours (objet Date en minuit local)
    return `${v.getFullYear()}-${pad(v.getMonth()+1)}-${pad(v.getDate())}`;
  const s = String(v).trim();                       // chaine : JJ/MM/AAAA (format FR) puis ISO
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m){ let [,d,mo,y]=m; if (y.length===2) y="20"+y; return `${y}-${pad(mo)}-${pad(d)}`; }
  const dd = new Date(s);
  return isNaN(dd) ? null : `${dd.getUTCFullYear()}-${pad(dd.getUTCMonth()+1)}-${pad(dd.getUTCDate())}`;
}
// rows = tableau de lignes (header:1). Retourne [{ferm,date,press,temp,dens,ph}]
function parseSheet(rows, lk){
  let hi = rows.findIndex(r => r && r[0]!=null && String(r[0]).trim().toLowerCase().startsWith("date"));
  if (hi < 0) hi = 0;
  const header = rows[hi] || []; const colFerm = {};
  for (let c=2; c<header.length; c++){ const nm = resolveFerm(header[c], lk); if (nm) colFerm[c]=nm; }
  const out = {}; let cur = null;
  for (let i=hi+1; i<rows.length; i++){
    const r = rows[i]; if (!r) continue;
    const ds = xlDateStr(r[0]); if (ds) cur = ds;
    const mt = normMeasure(r[1]); if (!mt || !cur) continue;
    for (const c in colFerm){
      let v = r[c]; if (v==null || v==="") continue;
      v = (typeof v==="number") ? v : parseFloat(String(v).replace(",","."));
      if (isNaN(v)) continue;
      const key = colFerm[c]+"||"+cur;
      (out[key] ??= { ferm:colFerm[c], date:cur }); out[key][mt] = v;
    }
  }
  return Object.values(out);
}
function downloadTemplate(){
  const header = ["Date","Mesure", ...FERM_ORDER];
  const aoa = [header];
  const measures = ["Pression","Température","Densité","pH"];
  for (let d=0; d<25; d++) measures.forEach(mz => aoa.push(["", mz, ...FERM_ORDER.map(()=> "")]));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = header.map((_,i)=> ({ wch: i===0?12 : i===1?13 : 9 }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Relevés");
  XLSX.writeFile(wb, "modele_releves.xlsx");
}

function viewImport(root){
  if (!canWrite()){ root.appendChild(emptyBox("Accès restreint","Réservé aux opérateurs et superviseurs.")); return; }
  if (!window.XLSX){ root.appendChild(emptyBox("Composant indisponible","La librairie de lecture Excel n'a pas pu être chargée (vérifiez la connexion internet).")); return; }

  const card = el("div",{class:"card",style:"max-width:780px"});
  card.appendChild(el("h3",{},"Import d'un classeur Excel"));
  card.appendChild(el("p",{class:"hint"},
    "Une colonne par fermenteur. Pour chaque date (colonne A, sur la 1ʳᵉ ligne du bloc), 4 lignes en colonne B : "+
    "Pression, Température, Densité, pH. Densités en abrégé (59 = 1.059). Chaque relevé est rattaché au lot actif du fermenteur."));

  const tmplBtn = el("button",{class:"btn ghost"},"⬇ Télécharger le modèle");
  tmplBtn.addEventListener("click", downloadTemplate);
  card.appendChild(tmplBtn);

  const file = el("input",{class:"mt", type:"file", accept:".xlsx,.xls"});
  card.appendChild(el("div",{class:"mt"})); card.appendChild(file);

  const summary = el("div",{class:"mt"}); card.appendChild(summary);
  const importBtn = el("button",{class:"btn primary mt hidden"},"Importer les relevés");
  card.appendChild(importBtn);
  const result = el("div",{class:"mt"}); card.appendChild(result);
  root.appendChild(card);

  let toInsert = [];

  file.addEventListener("change", async ()=>{
    summary.innerHTML=""; result.innerHTML=""; importBtn.classList.add("hidden"); toInsert=[];
    const f = file.files[0]; if (!f) return;
    let parsed;
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type:"array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header:1, raw:true, blankrows:false });
      parsed = parseSheet(rows, buildLookup(S.fermenters));
    } catch(e){ summary.innerHTML = `<p class="err">Lecture impossible : ${e.message}</p>`; return; }
    if (!parsed.length){ summary.innerHTML = `<p class="err">Aucun relevé détecté — vérifiez le format (entête « Date », libellés des mesures).</p>`; return; }

    const activeByFerm = {}; S.lots.filter(l=>l.status==="Active").forEach(l=> activeByFerm[l.fermenter_name]=l);
    const noLot = new Set(); const lotIds = new Set(); const candidates = [];
    for (const m of parsed){
      const lot = activeByFerm[m.ferm];
      if (!lot){ noLot.add(m.ferm); continue; }
      lotIds.add(lot.id); candidates.push({ m, lot });
    }
    let already = new Set();
    try {
      if (lotIds.size){
        const ex = await q(db.from("measurements").select("lot_id,date").in("lot_id",[...lotIds]).eq("operator","Import xlsx"));
        ex.forEach(r => already.add(r.lot_id+"||"+r.date));
      }
    } catch(_){}
    let dupes = 0;
    for (const { m, lot } of candidates){
      if (already.has(lot.id+"||"+m.date)){ dupes++; continue; }
      toInsert.push({
        lot_id: lot.id, ts: m.date+"T12:00:00Z", date: m.date,
        densite_sg: m.dens!=null ? parseDens(m.dens) : null,
        ph: m.ph ?? null, temp: m.temp ?? null, pressure: m.press ?? null,
        phase: lot.phase, operator: "Import xlsx" });
    }
    const dates = [...new Set(parsed.map(m=>m.date))].sort();
    const ferms = [...new Set(candidates.map(c=>c.lot.fermenter_name))].sort((a,b)=> fermRank(a)-fermRank(b));
    let html = `<p><strong>${parsed.length}</strong> relevés lus${dates.length?` · du ${fmtDate(dates[0])} au ${fmtDate(dates[dates.length-1])}`:""}.</p>`;
    html += `<p><strong>${toInsert.length}</strong> à importer sur ${ferms.length} fermenteur(s) actif(s)${dupes?` · ${dupes} déjà importés (ignorés)`:""}.</p>`;
    if (noLot.size) html += `<p class="err">Sans lot actif, donc ignorés : ${[...noLot].sort((a,b)=>fermRank(a)-fermRank(b)).join(", ")}</p>`;
    summary.innerHTML = html;
    if (toInsert.length) importBtn.classList.remove("hidden");
  });

  importBtn.addEventListener("click", async ()=>{
    importBtn.disabled = true; importBtn.textContent = "Import en cours…";
    try {
      for (let i=0; i<toInsert.length; i+=200) await q(db.from("measurements").insert(toInsert.slice(i,i+200)));
      result.innerHTML = `<p class="ok">${toInsert.length} relevés importés ✓</p>`;
      importBtn.classList.add("hidden"); toast("Import terminé ✓");
      await refreshData();
    } catch(e){ result.innerHTML = `<p class="err">Échec : ${e.message}</p>`; importBtn.disabled=false; importBtn.textContent="Importer les relevés"; }
  });
}

/* ============================ ADMIN ============================ */
function viewAdmin(root) {
  const set = el("div",{class:"card",style:"max-width:460px"});
  set.appendChild(el("h3",{},"Administration"));
  set.appendChild(el("p",{class:"hint"},"Les densités sont saisies et affichées en abrégé (ex. 59 = 1.059), et stockées en SG."));
  set.appendChild(el("p",{class:"hint",style:"margin-top:10px"},"La gestion des comptes et des rôles se fait dans le tableau de bord Supabase (Authentication → Users), pour des raisons de sécurité."));
  root.appendChild(set);
}

/* ============================ Petits composants ============================ */
function inp(type, value="", placeholder=""){ const e=el("input"); e.type=type; e.value=value; if(placeholder)e.placeholder=placeholder; return e; }
function sels(opts, value){ const s=el("select"); opts.forEach(o=>{ const [v,l]=Array.isArray(o)?o:[o,o]; const op=el("option",{value:v},l); if(value!=null&&String(value)===String(v))op.selected=true; s.appendChild(op); }); return s; }
function lab(text, ctrl, hint){ const l=el("label",{},text); l.appendChild(ctrl); if(hint)l.appendChild(hint); return l; }
function emptyBox(title, body){ return el("div",{class:"empty"},`<strong>${title}</strong>${body}`); }
