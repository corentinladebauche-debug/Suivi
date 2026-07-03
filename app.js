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

// Gamme permanente : recettes proposees par defaut a la creation d'un lot.
// Editez simplement cette liste pour la mettre a jour.
const RECIPES = [
  {name:'Alma', style:'IPA', dit:1.043, dft:1.006},
  {name:'Big Boy', style:'Noir', dit:1.099, dft:1.03},
  {name:'Cat Soup', style:'IPA', dit:1.072, dft:1.01},
  {name:'Cindy Bunny', style:'Belge', dit:1.075, dft:1.01},
  {name:'Cute and Sober', style:'Sour/fruits', dit:1.017, dft:1.012},
  {name:'Demi mondaine', style:'Noir', dit:1.108, dft:1.032},
  {name:'Double Belge', style:'Belge', dit:1.075, dft:1.021},
  {name:'Hazy Diamond', style:'Sour/fruits', dit:1.05, dft:1.01},
  {name:'IPA', style:'IPA', dit:1.054, dft:1.006},
  {name:'IPA Salem', style:'IPA', dit:1.054, dft:1.006},
  {name:'Lager', style:'Lager', dit:1.046, dft:1.009},
  {name:"M'. Joe", style:'Noir', dit:1.052, dft:1.013},
  {name:'NEIPA', style:'NEIPA', dit:1.059, dft:1.012},
  {name:'Nevermore', style:'Noir', dit:1.104, dft:1.031},
  {name:'Nina Bianca', style:'Belge', dit:1.043, dft:1.005},
  {name:'Pilsner', style:'Lager', dit:1.046, dft:1.009},
  {name:'Pilsner Salem', style:'Lager', dit:1.046, dft:1.009},
  {name:'Red Tears', style:'Sour/fruits', dit:1.06, dft:1.018}
];
const STYLES = ["Lager","IPA","NEIPA","Belge","Noir","Sour/fruits"];
// Formats de conditionnement (packaging)
const PACK_FORMATS = ["c33","c44","c50","b33","b75","kk","inox"];
const PACK_LABELS = { c33:"Canette 33cl", c44:"Canette 44cl", c50:"Canette 50cl", b33:"Bouteille 33cl", b75:"Bouteille 75cl", kk:"Keykeg", inox:"Fût inox" };
const packLabel = (f)=> PACK_LABELS[f] || f;
// Icône fruits : bières avec fruits OU de style Sour/fruits (permanentes comme éphémères)
const hasFruits = (l)=> !!(l && (l.fruits || l.style === "Sour/fruits"));
const fruitIcon = (l)=> hasFruits(l) ? " 🍓" : "";

// Phases (ordre = progression). Reculer d'une phase est reserve aux superviseurs.
const PHASES = ["Fermentation","15°C","Garde"];
const phaseRank = (p)=>{ const i = PHASES.indexOf(p); return i<0 ? 0 : i; };
const phaseClass = (p)=> p==="Garde" ? "garde" : (p==="15°C" ? "palier" : "ferm");

// Sélecteur de bière : liste déroulante (gamme permanente) + case « éphémère » -> saisie libre.
function beerSelector(current, opts){
  opts = opts || {};
  const control = el("div");
  const recNames = RECIPES.map(r=>[r.name, r.name]);
  const isEph = !!current && !RECIPES.find(r=>r.name===current);
  const rec = sels(recNames, (!isEph && current) ? current : RECIPES[0].name);
  const free = inp("text","","Nom de la bière éphémère");
  // Éphémère : style (comportement) + case fruits
  const styleSel = sels(STYLES.map(s=>[s,s]), STYLES.includes(opts.style) ? opts.style : STYLES[0]);
  const styleLab = lab("Style (comportement)", styleSel);
  const fruitsLine = el("label",{style:"display:flex;align-items:center;gap:6px;margin-top:8px;font-size:13px;font-weight:500"});
  const fruitsCb = el("input"); fruitsCb.type = "checkbox"; fruitsCb.checked = !!opts.fruits;
  fruitsLine.append(fruitsCb, document.createTextNode("Ajout de fruits"));
  control.append(rec, free, styleLab, fruitsLine);

  const chkLine = el("label",{style:"display:flex;align-items:center;gap:6px;margin-top:8px;font-size:13px;font-weight:500"});
  const chk = el("input"); chk.type = "checkbox";
  chkLine.append(chk, document.createTextNode("Nouvelle bière (gamme éphémère)"));
  if (isEph){ chk.checked = true; free.value = current; }

  const sync = ()=>{
    const eph = chk.checked;
    rec.classList.toggle("hidden", eph);
    free.classList.toggle("hidden", !eph);
    styleLab.classList.toggle("hidden", !eph);   // style : éphémère seulement (sinon vient de la recette)
    fruitsLine.classList.toggle("hidden", !eph); // fruits : éphémère seulement
  };
  const currentRecipe = ()=> RECIPES.find(r=>r.name===rec.value) || null;
  chk.addEventListener("change", ()=>{ sync(); if (opts.onPick) opts.onPick(chk.checked ? null : currentRecipe()); });
  rec.addEventListener("change", ()=>{ if (opts.onPick && !chk.checked) opts.onPick(currentRecipe()); });
  sync();

  return { control, chkLine,
    // recette permanente sélectionnée (sinon null)
    recipe: ()=> chk.checked ? null : currentRecipe(),
    get: ()=> chk.checked
      ? { name: free.value.trim(), style: styleSel.value, fruits: fruitsCb.checked }
      : { name: rec.value, style: (currentRecipe()||{}).style || null, fruits: false } };
}

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
    fermenter_volume_hl: l.fermenter?.volume_hl,   // capacité nominale de la cuve
    site: l.fermenter?.site,
    // NB : volume_hl reste celui du lot (volume réel de la bière, mis à jour aux transferts)
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
  tabs.push(["courbes","Courbes"], ["lots","Cuves & Brassins"], ["archives","Archives"]);
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
  else if (tab==="archives") viewArchives(v);
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
      el("span",{class:`badge ${phaseClass(l.phase)}`}, l.phase),
      el("span",{class:"muted"}, `${l.fermenter_name} · ${l.volume_hl||"?"} hl · ${l.site||""}`));
    if (l.og) lotInfo.append(el("span",{class:"muted"}, `· DiM ${sgToAbbr(+l.og)} (${sgToPlato(+l.og).toFixed(1)}°P)`));
    if (l.dit!=null) lotInfo.append(el("span",{class:"muted"}, ` · DiT ${sgToAbbr(+l.dit)}`));
    if (l.dft!=null) lotInfo.append(el("span",{class:"muted"}, ` · DfT ${sgToAbbr(+l.dft)}`));
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
  const aBatch = inp("text","","N° de lot");
  const aQty = inp("text","","200");
  const aUnit = sels(UNITS);
  card.append(lab("Date", aDate), lab("Type", aType), lab("Désignation", aLabel), lab("N° de lot", aBatch));
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
        `<span>${fmtDate(a.ts)} · ${a.type} — ${a.label}${a.batch_no?` <span class="muted">(lot ${a.batch_no})</span>`:""}</span><span class="spacer"></span><span class="muted">${a.qty!=null?`${a.qty} ${a.unit||""}`:""}</span>`)));
    } catch(e){ /* silencieux */ }
  }
  btn.addEventListener("click", async ()=>{
    if (!aLabel.value.trim()) { toast("Précisez l'ajout"); return; }
    try{
      await q(db.from("additions").insert({
        lot_id: getLotId(), ts: (aDate.value || today()) + "T12:00:00Z", date: aDate.value, type: aType.value, label: aLabel.value.trim(),
        batch_no: aBatch.value.trim() || null, qty: num(aQty.value), unit: aUnit.value, operator: S.me.display_name }));
      aLabel.value=""; aBatch.value=""; aQty.value=""; toast("Ajout enregistré ✓"); load();
    }catch(e){ toast(e.message); }
  });
  load();
  return card;
}

/* ============================ COURBES ============================ */
let CHART = null;
function viewCourbes(root){ lotCurves(root, S.lots.filter(l=>l.status==="Active"), "Aucun brassin en cours.", false); }
function viewArchives(root){ lotCurves(root, S.lots.filter(l=>l.status!=="Active"), "Aucun brassin archivé.", true); }

function lotCurves(root, lots, emptyMsg, byRecipe) {
  if (!lots.length) { root.appendChild(emptyBox("Aucun brassin", emptyMsg)); return; }

  const head = el("div",{class:"card"});
  const sel = el("select");
  const exportBtn = el("button",{class:"btn ghost"},"⬇ Export CSV");
  const top = el("div",{class:"flexb"});

  if (byRecipe){
    const recipeOf = (l)=> RECIPES.find(r=>r.name===l.beer_name) ? l.beer_name : "Éphémères";
    const groups = {}; lots.forEach(l=>{ const g=recipeOf(l); (groups[g] ??= []).push(l); });
    const recipeNames = RECIPES.map(r=>r.name).filter(n=>groups[n]);
    if (groups["Éphémères"]) recipeNames.push("Éphémères");
    const recipeSel = el("select");
    recipeNames.forEach(n=> recipeSel.appendChild(el("option",{value:n}, `${n} (${groups[n].length})`)));
    const fillLots = ()=>{
      sel.innerHTML = "";
      (groups[recipeSel.value]||[]).slice()
        .sort((a,b)=> (b.end_date||"").localeCompare(a.end_date||""))
        .forEach(l=> sel.appendChild(el("option",{value:l.id},
          `${l.fermenter_name}${fruitIcon(l)} · ${l.start_date?fmtDate(l.start_date):"?"} → ${l.end_date?fmtDate(l.end_date):"?"}`)));
    };
    fillLots();
    recipeSel.addEventListener("change", ()=>{ fillLots(); load(); });
    const rWrap = el("div",{style:"flex:1;min-width:170px"}); rWrap.append(lab("Recette", recipeSel));
    const sWrap = el("div",{style:"flex:1;min-width:200px"}); sWrap.append(lab("Brassin", sel));
    top.append(rWrap, sWrap, exportBtn);
  } else {
    lots.forEach(l=> sel.appendChild(el("option",{value:l.id},
      `${l.fermenter_name} — ${l.beer_name}${fruitIcon(l)}${l.status!=="Active"?` · terminé ${l.end_date?fmtDate(l.end_date):""}`:""}`)));
    const selWrap = el("div",{style:"flex:1;min-width:220px"}); selWrap.append(lab("Lot", sel));
    top.append(selWrap, exportBtn);
  }
  head.appendChild(top);
  const stats = el("div",{class:"stats"}); head.appendChild(stats);
  const actions = el("div",{class:"flexb mt",style:"gap:8px;flex-wrap:wrap"}); head.appendChild(actions);
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
  chartCard.appendChild(el("p",{class:"hint"},"Densité à gauche (◆ = DiM · × = DiT · ligne pointillée = DfT) · série à droite · traits verts = ajouts (dry hop, fruits, sucres…)"));
  root.appendChild(chartCard);

  const histCard = el("div",{class:"card mt"});
  histCard.appendChild(el("h3",{},"Historique des relevés"));
  const histBody = el("div",{class:"scroll"}); histCard.appendChild(histBody);
  root.appendChild(histCard);

  const addsCard = el("div",{class:"card mt"});
  addsCard.appendChild(el("h3",{},"Ajouts"));
  const addsBody = el("div",{class:"scroll"}); addsCard.appendChild(addsBody);
  root.appendChild(addsCard);

  const transCard = el("div",{class:"card mt"});
  transCard.appendChild(el("h3",{},"Transferts"));
  const transBody = el("div",{class:"scroll"}); transCard.appendChild(transBody);
  root.appendChild(transCard);

  const packCard = el("div",{class:"card mt"});
  const packHead = el("div",{class:"flexb"});
  packHead.append(el("h3",{style:"margin:0"},"Conditionnement"));
  const packAdd = el("button",{class:"btn ghost sm"},"+ Conditionnement");
  packHead.append(packAdd); packCard.appendChild(packHead);
  const packBody = el("div",{class:"scroll mt"}); packCard.appendChild(packBody);
  root.appendChild(packCard);

  let meas = [], adds = [], transfers = [], packagings = [], lot = null;

  async function load() {
    lot = S.lots.find(l=>l.id==sel.value);
    try {
      [meas, adds] = await Promise.all([
        q(db.from("measurements").select("*").eq("lot_id", lot.id).order("ts")),
        q(db.from("additions").select("*").eq("lot_id", lot.id).order("ts")),
      ]);
    } catch(e){ toast(e.message); meas=[]; adds=[]; }
    try { transfers = await q(db.from("transfers").select("*").eq("lot_id", lot.id).order("ts")); }
    catch(_){ transfers = []; }
    try { packagings = await q(db.from("packagings").select("*").eq("lot_id", lot.id).order("date")); }
    catch(_){ packagings = []; }
    packAdd.classList.toggle("hidden", !canWrite() || packagings.length >= 4);
    renderStats(); draw(); renderHist(); renderAdds(); renderTransfers(); renderPackagings(); renderActions();
  }

  packAdd.addEventListener("click", ()=> lot && editPackaging({ lot_id: lot.id, date: (lot.end_date||today()) }, load));

  function renderActions() {
    actions.innerHTML = "";
    if (!isSup() || !lot) return;
    const edit = el("button",{class:"btn ghost sm"},"Éditer le brassin");
    edit.addEventListener("click", ()=> editLot(lot));
    actions.append(edit);
    const tr = el("button",{class:"btn ghost sm"},"Transfert");
    tr.addEventListener("click", ()=> transferLot(lot));
    actions.append(tr);
    if (lot.status !== "Active") {
      const react = el("button",{class:"btn ghost sm"},"Réactiver");
      react.addEventListener("click", async ()=>{ try{ await q(db.from("lots").update({status:"Active", end_date:null}).eq("id",lot.id)); toast("Brassin réactivé"); await refreshData(); go(S.tab); }catch(e){toast(e.message);} });
      actions.append(react);
    }
    const del = el("button",{class:"btn danger sm"},"Supprimer le brassin");
    del.addEventListener("click", async ()=>{ if(!confirm("Supprimer définitivement ce brassin et TOUTES ses données (relevés, ajouts, transferts) ?")) return; try{ await q(db.from("lots").delete().eq("id",lot.id)); toast("Brassin supprimé"); await refreshData(); go(S.tab); }catch(e){toast(e.message);} });
    actions.append(del);
  }

  function renderAdds() {
    addsBody.innerHTML = "";
    if (!adds.length) { addsBody.appendChild(el("p",{class:"muted"},"Aucun ajout.")); return; }
    const t = el("table");
    t.innerHTML = `<thead><tr><th>Nature</th><th>Désignation</th><th>N° de lot</th><th>Quantité</th><th>Date & heure</th>${isSup()?"<th></th>":""}</tr></thead>`;
    const tb = el("tbody");
    [...adds].reverse().forEach(a=>{
      const tr = el("tr",{}, `<td>${a.type||""}</td><td>${a.label||""}</td><td>${a.batch_no||"—"}</td><td>${a.qty!=null?`${a.qty} ${a.unit||""}`:"—"}</td><td>${fmtDT(a.ts)}</td>`);
      if (isSup()) {
        const td = el("td");
        const e = el("button",{class:"btn ghost sm"},"éditer"); e.addEventListener("click", ()=> editAddition(a, load));
        const b = el("button",{class:"btn danger sm",style:"margin-left:4px"},"suppr."); b.addEventListener("click", async ()=>{ if(confirm("Supprimer cet ajout ?")){ try{ await q(db.from("additions").delete().eq("id",a.id)); toast("Supprimé"); load(); }catch(e){toast(e.message);} }});
        td.append(e,b); tr.appendChild(td);
      }
      tb.appendChild(tr);
    });
    t.appendChild(tb); addsBody.appendChild(t);
  }

  function renderTransfers() {
    transBody.innerHTML = "";
    if (!transfers.length) { transBody.appendChild(el("p",{class:"muted"},"Aucun transfert.")); return; }
    const nm = (id)=> (S.fermenters.find(f=>f.id==id)||{}).name || "?";
    const t = el("table");
    t.innerHTML = `<thead><tr><th>Date & heure</th><th>De</th><th>Vers</th><th>Équipement</th><th>Volume</th><th>EBC</th><th>Par</th>${isSup()?"<th></th>":""}</tr></thead>`;
    const tb = el("tbody");
    [...transfers].reverse().forEach(x=>{
      const tr = el("tr",{}, `<td>${fmtDT(x.ts)}</td><td>${nm(x.from_fermenter_id)}</td><td>${nm(x.to_fermenter_id)}</td><td>${x.equipment||"—"}</td><td>${x.volume_hl!=null?`${x.volume_hl} hl`:"—"}</td><td>${x.ebc!=null?x.ebc:"—"}</td><td class="muted">${x.author||""}</td>`);
      if (isSup()) {
        const td = el("td");
        const e = el("button",{class:"btn ghost sm"},"éditer"); e.addEventListener("click", ()=> editTransfer(x, load));
        const b = el("button",{class:"btn danger sm",style:"margin-left:4px"},"suppr."); b.addEventListener("click", async ()=>{ if(confirm("Supprimer ce transfert ?")){ try{ await q(db.from("transfers").delete().eq("id",x.id)); toast("Supprimé"); load(); }catch(e){toast(e.message);} }});
        td.append(e,b); tr.appendChild(td);
      }
      tb.appendChild(tr);
    });
    t.appendChild(tb); transBody.appendChild(t);
  }

  function packagedTotal(){ return packagings.reduce((s,p)=> s + (p.volume_hl!=null?+p.volume_hl:0), 0); }

  function renderPackagings() {
    packBody.innerHTML = "";
    if (!packagings.length) { packBody.appendChild(el("p",{class:"muted"},"Aucun conditionnement.")); return; }
    const t = el("table");
    t.innerHTML = `<thead><tr><th>Format</th><th>Date</th><th>Volume</th>${isSup()?"<th></th>":""}</tr></thead>`;
    const tb = el("tbody");
    [...packagings].sort((a,b)=>(a.date||"").localeCompare(b.date||"")).forEach(p=>{
      const tr = el("tr",{}, `<td>${packLabel(p.format)}</td><td>${p.date?fmtDate(p.date):"—"}</td><td>${p.volume_hl!=null?`${p.volume_hl} hl`:"—"}</td>`);
      if (isSup()) {
        const td = el("td");
        const e = el("button",{class:"btn ghost sm"},"éditer"); e.addEventListener("click", ()=> editPackaging(p, load));
        const b = el("button",{class:"btn danger sm",style:"margin-left:4px"},"suppr."); b.addEventListener("click", async ()=>{ if(confirm("Supprimer ce conditionnement ?")){ try{ await q(db.from("packagings").delete().eq("id",p.id)); toast("Supprimé"); load(); }catch(e){toast(e.message);} }});
        td.append(e,b); tr.appendChild(td);
      }
      tb.appendChild(tr);
    });
    t.appendChild(tb); packBody.appendChild(t);
    const cond = packagedTotal();
    const vol = lot && lot.volume_hl!=null ? +lot.volume_hl : null;
    const loss = (vol!=null) ? vol - cond : null;
    const lossPct = (vol!=null && vol>0) ? (loss/vol*100) : null;
    packBody.appendChild(el("p",{class:"mt",style:"font-weight:600"},
      `Conditionné : ${cond.toFixed(1)} hl${vol!=null?` · en cuve : ${vol} hl · pertes : ${loss.toFixed(1)} hl${lossPct!=null?` (${lossPct.toFixed(1)} %)`:""}`:""}`));
  }

  function renderStats() {
    const withD = meas.filter(m=>m.densite_sg!=null);
    const last = withD[withD.length-1];
    const og = lot.og || withD[0]?.densite_sg;
    const att = (og && last) ? attenuation(+og, +last.densite_sg) : null;
    stats.innerHTML = "";
    const add = (k,v)=> stats.appendChild(el("div",{class:"stat"},`<div class="k">${k}</div><div class="v">${v}</div>`));
    add("DiM", og?sgToAbbr(+og):"—");
    add("DiT", lot.dit!=null?sgToAbbr(+lot.dit):"—");
    add("DfT", lot.dft!=null?sgToAbbr(+lot.dft):"—");
    add("Volume courant", lot.volume_hl!=null?`${lot.volume_hl} hl`:"—");
    if (packagings.length) add("Conditionné", `${packagedTotal().toFixed(1)} hl`);
    add("Densité actuelle", last?sgToAbbr(+last.densite_sg):"—");
    add("Atténuation app.", att!=null?att.toFixed(0)+" %":"—");
    add("Style", (lot.style||"—") + (lot.fruits?" · fruits":""));
    add("Relevés", meas.length);
    add("Phase", lot.phase);
  }

  function draw() {
    const startT = lot.start_date ? new Date(lot.start_date + "T12:00:00Z").getTime() : null;
    const dens = meas.filter(m=>m.densite_sg!=null).map(m=>({x:new Date(m.ts).getTime(), y:+m.densite_sg}));
    // DiM = point de départ de la densité, à la date de départ du lot.
    let dimAdded = false;
    if (lot.og && startT) {
      if (!dens.length || dens[0].x > startT) { dens.unshift({ x: startT, y: +lot.og }); dimAdded = true; }
    }
    const sec = meas.filter(m=>m[secondary]!=null).map(m=>({x:new Date(m.ts).getTime(), y:+m[secondary]}));
    const secLabel = {temp:"Température (°C)",ph:"pH",pressure:"Pression (bar)"}[secondary];
    const secColor = {temp:"#0e7490",ph:"#7c3aed",pressure:"#475569"}[secondary];
    const markers = adds.map(a=>({x:new Date(a.ts).getTime(), label:a.label}))
      .concat(transfers.map(t=>({ x:new Date(t.ts).getTime(),
        label:`→ ${(S.fermenters.find(f=>f.id==t.to_fermenter_id)||{}).name||"?"}`, color:"#9333ea" })));

    // Axe densité : 0 -> 60 (abr.). Monte jusqu'à la DiM si DiM > 60. S'étend si une mesure sort.
    const ogSg = lot.og ? +lot.og : null;
    let dMax = (ogSg && (ogSg - 1) * 1000 > 60) ? ogSg : 1.060;
    let dMin = 1.000;
    const dv = dens.map(p=>p.y);
    if (dv.length) { dMax = Math.max(dMax, ...dv); dMin = Math.min(dMin, ...dv); }
    // DiT (théorique) et DfT (finale théorique) peuvent élargir l'échelle
    if (lot.dit!=null){ dMax = Math.max(dMax, +lot.dit); dMin = Math.min(dMin, +lot.dit); }
    if (lot.dft!=null){ dMax = Math.max(dMax, +lot.dft); dMin = Math.min(dMin, +lot.dft); }

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
        ...(lot.dit!=null && startT ? [{ label:"DiT", data:[{x:startT, y:+lot.dit}], yAxisID:"d",
          showLine:false, pointStyle:"crossRot", pointRadius:8, pointBorderWidth:2.5,
          borderColor:"#1d4ed8", backgroundColor:"#1d4ed8" }] : []),
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
              : it.dataset.label==="DiT"
              ? `DiT : ${sgToAbbr(it.parsed.y)}`
              : `${it.dataset.label} : ${it.parsed.y}`,
          } },
        },
      },
      plugins:[ addMarkersPlugin(markers), zeroTempLine(secondary === "temp"), dftLine(lot.dft!=null?+lot.dft:null) ],
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
        const td = el("td");
        const e = el("button",{class:"btn ghost sm"},"éditer");
        e.addEventListener("click", ()=> editMeasurement(m, load));
        const b = el("button",{class:"btn danger sm",style:"margin-left:4px"},"suppr.");
        b.addEventListener("click", async ()=>{ if(confirm("Supprimer ce relevé ?")){ try{ await q(db.from("measurements").delete().eq("id", m.id)); toast("Supprimé"); load(); }catch(e){toast(e.message);} }});
        td.append(e, b); tr.appendChild(td);
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

function dftLine(dft){
  return {
    id:"dftLine",
    afterDatasetsDraw(chart){
      if (dft==null) return;
      const s = chart.scales.d; if (!s) return;
      const {ctx, chartArea} = chart;
      const y = s.getPixelForValue(dft);
      if (y < chartArea.top || y > chartArea.bottom) return;
      ctx.save();
      ctx.strokeStyle = "#b45309"; ctx.lineWidth = 1.5; ctx.setLineDash([6,4]);
      ctx.beginPath(); ctx.moveTo(chartArea.left, y); ctx.lineTo(chartArea.right, y); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = "#b45309"; ctx.font = "11px system-ui";
      ctx.fillText("DfT " + sgToAbbr(dft), chartArea.left + 4, y - 4);
      ctx.restore();
    }
  };
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
        const col = m.color || "#16a34a";
        ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([4,3]);
        ctx.beginPath(); ctx.moveTo(px, chartArea.top); ctx.lineTo(px, chartArea.bottom); ctx.stroke();
        ctx.setLineDash([]); ctx.fillStyle = col; ctx.font = "10px system-ui";
        ctx.save(); ctx.translate(px+3, chartArea.top+4); ctx.fillText(m.label, 0, 0); ctx.restore();
      });
      ctx.restore();
    }
  };
}

/* ============================ ÉDITION DES ÉTAPES (superviseur) ============================ */
function modal(title, build){
  const ov = el("div",{class:"modal-ov"});
  const box = el("div",{class:"modal-box"});
  box.appendChild(el("h3",{style:"margin-top:0"}, title));
  const body = el("div"); box.appendChild(body);
  ov.appendChild(box); document.body.appendChild(ov);
  const close = ()=> ov.remove();
  ov.addEventListener("mousedown",(e)=>{ if(e.target===ov) close(); });
  build(body, close);
}
function threeButtons(body, close, onSave, onDelete){
  const save = el("button",{class:"btn primary mt"},"Enregistrer");
  const del = el("button",{class:"btn danger mt",style:"margin-left:8px"},"Supprimer");
  const cx = el("button",{class:"btn ghost mt",style:"margin-left:8px"},"Annuler");
  body.append(save, del, cx);
  cx.addEventListener("click", close);
  save.addEventListener("click", onSave);
  del.addEventListener("click", onDelete);
}
function editMeasurement(m, reload){
  modal("Éditer le relevé", (body, close)=>{
    const d = inp("date",(m.ts||"").slice(0,10));
    const dens = inp("text", m.densite_sg!=null?sgToAbbr(+m.densite_sg):"","59");
    const ph = inp("text", m.ph??"","pH"); const temp = inp("text", m.temp??"","°C");
    const press = inp("text", m.pressure??"","bar"); const note = inp("text", m.note??"","note");
    const r1 = el("div",{class:"row"}); r1.append(lab("Date",d), lab("Densité (59)",dens), lab("pH",ph));
    const r2 = el("div",{class:"row"}); r2.append(lab("T° (°C)",temp), lab("Pression (bar)",press), lab("Note",note));
    body.append(r1, r2);
    threeButtons(body, close,
      async ()=>{ try{ await q(db.from("measurements").update({ ts:(d.value||today())+"T12:00:00Z", date:d.value||null,
        densite_sg: dens.value.trim()?parseDens(dens.value):null, ph:num(ph.value), temp:num(temp.value), pressure:num(press.value), note:note.value.trim()||null
      }).eq("id",m.id)); close(); toast("Relevé modifié ✓"); reload(); }catch(e){ toast(e.message); } },
      async ()=>{ if(!confirm("Supprimer ce relevé ?")) return; try{ await q(db.from("measurements").delete().eq("id",m.id)); close(); toast("Supprimé"); reload(); }catch(e){ toast(e.message); } });
  });
}
function editAddition(a, reload){
  modal("Éditer l'ajout", (body, close)=>{
    const d = inp("date",(a.ts||"").slice(0,10));
    const type = sels(ADD_TYPES, a.type); const label = inp("text", a.label??"","désignation");
    const batch = inp("text", a.batch_no??"","N° de lot"); const qty = inp("text", a.qty??"","qté"); const unit = sels(UNITS, a.unit);
    const r1 = el("div",{class:"row"}); r1.append(lab("Date",d), lab("Type",type), lab("Désignation",label));
    const r2 = el("div",{class:"row"}); r2.append(lab("N° de lot",batch), lab("Quantité",qty), lab("Unité",unit));
    body.append(r1, r2);
    threeButtons(body, close,
      async ()=>{ try{ await q(db.from("additions").update({ ts:(d.value||today())+"T12:00:00Z", date:d.value||null,
        type:type.value, label:label.value.trim(), batch_no:batch.value.trim()||null, qty:num(qty.value), unit:unit.value
      }).eq("id",a.id)); close(); toast("Ajout modifié ✓"); reload(); }catch(e){ toast(e.message); } },
      async ()=>{ if(!confirm("Supprimer cet ajout ?")) return; try{ await q(db.from("additions").delete().eq("id",a.id)); close(); toast("Supprimé"); reload(); }catch(e){ toast(e.message); } });
  });
}
function editTransfer(x, reload){
  modal("Éditer le transfert", (body, close)=>{
    const d = inp("date",(x.ts||"").slice(0,10));
    const from = sels(S.fermenters.map(f=>[f.id,f.name]), x.from_fermenter_id);
    const to = sels(S.fermenters.map(f=>[f.id,f.name]), x.to_fermenter_id);
    const eq = sels([["Centrifugeuse","Centrifugeuse"],["Filtre double cartouche","Filtre double cartouche"],["Aucun","Aucun"]], x.equipment);
    const vol = inp("text", x.volume_hl??"","hl");
    const ebc = inp("text", x.ebc??"","EBC");
    const r1 = el("div",{class:"row"}); r1.append(lab("Date",d), lab("De",from), lab("Vers",to));
    const r2 = el("div",{class:"row"}); r2.append(lab("Équipement",eq), lab("Volume (hl)",vol), lab("EBC",ebc));
    body.append(r1, r2);
    threeButtons(body, close,
      async ()=>{ try{ await q(db.from("transfers").update({ ts:(d.value||today())+"T12:00:00Z", date:d.value||null,
        from_fermenter_id:Number(from.value), to_fermenter_id:Number(to.value), equipment:eq.value, volume_hl:num(vol.value), ebc:num(ebc.value)
      }).eq("id",x.id)); close(); toast("Transfert modifié ✓"); reload(); }catch(e){ toast(e.message); } },
      async ()=>{ if(!confirm("Supprimer ce transfert ?")) return; try{ await q(db.from("transfers").delete().eq("id",x.id)); close(); toast("Supprimé"); reload(); }catch(e){ toast(e.message); } });
  });
}

function editPackaging(p, reload){
  const isNew = !p.id;
  modal(isNew?"Ajouter un conditionnement":"Éditer le conditionnement", (body, close)=>{
    const fmt = sels(PACK_FORMATS.map(f=>[f, packLabel(f)]), p.format || PACK_FORMATS[0]);
    const d = inp("date", (p.date||"").slice(0,10) || today());
    const vol = inp("text", p.volume_hl??"", "hl");
    const r1 = el("div",{class:"row"}); r1.append(lab("Format", fmt), lab("Date", d), lab("Volume (hl)", vol));
    body.append(r1);
    const save = el("button",{class:"btn primary mt"},"Enregistrer");
    const del = isNew ? null : el("button",{class:"btn danger mt",style:"margin-left:8px"},"Supprimer");
    const cx = el("button",{class:"btn ghost mt",style:"margin-left:8px"},"Annuler");
    body.append(save); if (del) body.append(del); body.append(cx);
    cx.addEventListener("click", close);
    save.addEventListener("click", async ()=>{
      const payload = { lot_id: p.lot_id, format: fmt.value, date: d.value||null, volume_hl: num(vol.value) };
      try{
        if (isNew) await q(db.from("packagings").insert(payload));
        else await q(db.from("packagings").update(payload).eq("id", p.id));
        close(); toast("Conditionnement enregistré ✓"); reload();
      }catch(e){ toast(e.message); }
    });
    if (del) del.addEventListener("click", async ()=>{ if(!confirm("Supprimer ce conditionnement ?")) return; try{ await q(db.from("packagings").delete().eq("id",p.id)); close(); toast("Supprimé"); reload(); }catch(e){ toast(e.message); } });
  });
}

/* ============================ ÉDITION D'UN LOT (superviseur) ============================ */
function editLot(lot){
  const v = $("#view"); v.innerHTML = "";
  const card = el("div",{class:"card",style:"max-width:660px"});
  card.appendChild(el("h3",{}, `Éditer le lot — ${lot.fermenter_name} · ${lot.beer_name}`));

  const occupied = new Set(S.lots.filter(l=>l.status==="Active" && l.id!==lot.id).map(l=>l.fermenter_id));
  const fSel = el("select");
  S.fermenters.forEach(f=>{
    const o = el("option",{value:f.id}, `${f.name}${occupied.has(f.id)?" (occupé)":""}`);
    if (occupied.has(f.id)) o.disabled = true;
    if (f.id === lot.fermenter_id) o.selected = true;
    fSel.appendChild(o);
  });
  const cOg = inp("text", lot.og!=null ? sgToAbbr(+lot.og) : "", "59");
  const ogHint = el("div",{class:"hint"});
  const cDit = inp("text", lot.dit!=null ? sgToAbbr(+lot.dit) : "", "43");
  const cDft = inp("text", lot.dft!=null ? sgToAbbr(+lot.dft) : "", "6");
  const beerSel = beerSelector(lot.beer_name || "", { style:lot.style, fruits:lot.fruits,
    onPick:(rp)=>{ if(rp){ cDit.value=sgToAbbr(rp.dit); cDft.value=sgToAbbr(rp.dft); } } });
  const cVol = inp("text", lot.volume_hl!=null ? String(lot.volume_hl) : "", "hl");
  const cDate = inp("date", lot.start_date || today());
  const phase = sels([["Fermentation","Fermentation"],["15°C","15°C"],["Garde","Garde"]], lot.phase);
  const c15 = inp("date", lot.date_15c || "");
  const cGarde = inp("date", lot.date_garde || "");
  const statusSel = sels([["Active","Actif"],["Terminé","Terminé (clôturé)"]], lot.status || "Active");
  const cEnd = inp("date", lot.end_date || "");
  const endLab = lab("Date de clôture", cEnd);
  const syncEnd = ()=> endLab.classList.toggle("hidden", statusSel.value!=="Terminé");
  statusSel.addEventListener("change", syncEnd);

  const r = el("div",{class:"row"});
  r.append(lab("Fermenteur", fSel), lab("Bière", beerSel.control),
           lab("DiM (ex. 59)", cOg, ogHint), lab("DiT", cDit), lab("DfT", cDft),
           lab("Volume (hl)", cVol), lab("Date de départ", cDate), lab("Phase", phase),
           lab("Date mise à 15°C", c15), lab("Date mise en Garde", cGarde),
           lab("Statut", statusSel), endLab);
  card.appendChild(r); card.appendChild(beerSel.chkLine);
  syncEnd();
  cOg.addEventListener("input",()=>{ const sg=parseDens(cOg.value); ogHint.textContent = sg!=null?`= ${sg.toFixed(3)} · ≈ ${sgToPlato(sg).toFixed(1)} °P`:""; });

  const save = el("button",{class:"btn primary mt"},"Enregistrer les modifications");
  const del = el("button",{class:"btn danger mt",style:"margin-left:8px"},"Supprimer le brassin");
  const cancel = el("button",{class:"btn ghost mt",style:"margin-left:8px"},"Annuler");
  card.append(save, del, cancel); v.appendChild(card);

  cancel.addEventListener("click", ()=> go(S.tab));
  del.addEventListener("click", async ()=>{
    if(!confirm("Supprimer définitivement ce brassin et TOUTES ses données (relevés, ajouts, transferts) ?")) return;
    try{ await q(db.from("lots").delete().eq("id",lot.id)); toast("Brassin supprimé"); await refreshData(); go(S.tab); }catch(e){ toast(e.message); }
  });
  save.addEventListener("click", async ()=>{
    const beer = beerSel.get();
    if (!beer.name){ toast("Choisissez ou saisissez une bière"); return; }
    const og = parseDens(cOg.value);
    if (og==null){ toast("La DiM est obligatoire"); return; }
    if (statusSel.value==="Terminé" && lot.status!=="Terminé"){
      let nCond = 0;
      try { nCond = (await q(db.from("packagings").select("id").eq("lot_id", lot.id))).length; } catch(_){}
      if (nCond === 0){ toast("Ajoutez au moins un conditionnement avant de clôturer ce brassin."); return; }
    }
    try{
      await q(db.from("lots").update({
        fermenter_id: Number(fSel.value), beer_name: beer.name, og: og, volume_hl: num(cVol.value),
        start_date: cDate.value, phase: phase.value, style: beer.style,
        dit: cDit.value.trim()?parseDens(cDit.value):null, dft: cDft.value.trim()?parseDens(cDft.value):null, fruits: beer.fruits,
        date_15c: c15.value || null, date_garde: cGarde.value || null,
        status: statusSel.value, end_date: statusSel.value==="Terminé" ? (cEnd.value || today()) : null
      }).eq("id", lot.id));
      toast("Lot mis à jour ✓"); await refreshData(); go(S.tab);
    }catch(e){ toast(e.message); }
  });
}

/* ============================ TRANSFERT ENTRE FERMENTEURS ============================ */
function transferLot(lot){
  const v = $("#view"); v.innerHTML = "";
  const allowOccupied = lot.status !== "Active" && isSup();
  const occupied = new Set(S.lots.filter(l=>l.status==="Active").map(l=>l.fermenter_id));
  const card = el("div",{class:"card",style:"max-width:600px"});
  card.appendChild(el("h3",{}, `Transfert — ${lot.fermenter_name} · ${lot.beer_name}`));
  card.appendChild(el("p",{class:"hint"}, allowOccupied
    ? "Bière clôturée : ce transfert reconstitue l'historique. Les cuves occupées sont proposées (aucune cuve n'est réellement libérée)."
    : "La bière — avec ses courbes et relevés — passe dans le fermenteur d'arrivée ; le fermenteur de départ est libéré."));

  // Case : répartir vers 2 cuves
  const splitLab = el("label",{style:"display:flex;align-items:center;gap:8px;margin:8px 0 2px;font-weight:600"});
  const splitCb = el("input"); splitCb.type = "checkbox";
  splitLab.append(splitCb, document.createTextNode("Répartir vers 2 cuves"));
  card.appendChild(splitLab);
  const splitHint = el("p",{class:"hint",style:"margin-top:0"},
    "La bière est répartie dans deux fermenteurs : deux transferts distincts (équipement, EBC, volume, date chacun). Un second brassin, même bière et même date de brassage, est créé pour la 2ᵉ cuve.");
  splitHint.style.display = "none";
  card.appendChild(splitHint);

  function destBlock(){
    const wrap = el("div",{style:"border:1px solid #eee;border-radius:10px;padding:12px;margin-top:8px"});
    const dest = el("select"); dest.appendChild(el("option",{value:""},"— choisir —"));
    S.fermenters.forEach(f=>{
      if (f.id === lot.fermenter_id) return;
      const isOcc = occupied.has(f.id);
      if (isOcc && !allowOccupied) return;
      dest.appendChild(el("option",{value:f.id}, `${f.name}${f.volume_hl?` (${f.volume_hl} hl)`:""}${isOcc?" — occupée":""}`));
    });
    const eqName = "eq_"+Math.random().toString(36).slice(2);
    const ebc = inp("text","","EBC");
    const ebcLab = lab("EBC après centrifugation (optionnel)", ebc); ebcLab.style.display = "none";
    const eqWrap = el("div",{class:"stack",style:"gap:4px;margin-top:4px"});
    ["Centrifugeuse","Filtre double cartouche","Aucun"].forEach(e=>{
      const l = el("label",{style:"display:flex;align-items:center;gap:6px;font-size:14px;font-weight:400"});
      const rb = el("input"); rb.type = "radio"; rb.name = eqName; rb.value = e;
      rb.addEventListener("change", ()=>{ ebcLab.style.display = (rb.checked && rb.value==="Centrifugeuse") ? "" : "none"; });
      l.append(rb, document.createTextNode(e)); eqWrap.appendChild(l);
    });
    const vol = inp("text","","hl"); const dateT = inp("date", today());
    wrap.appendChild(lab("Fermenteur d'arrivée", dest));
    wrap.appendChild(el("div",{style:"margin-top:8px;font-size:13px;color:var(--sub);font-weight:600"},"Équipement (obligatoire, un seul choix)"));
    wrap.appendChild(eqWrap); wrap.appendChild(ebcLab);
    const row = el("div",{class:"row mt"}); row.style.gridTemplateColumns = "1fr 1fr";
    row.append(lab("Volume transféré (hl)", vol), lab("Date", dateT)); wrap.appendChild(row);
    function read(){
      const toId = Number(dest.value);
      if (!toId) return {err:"Choisissez le fermenteur d'arrivée"};
      const checked = eqWrap.querySelector(`input[name="${eqName}"]:checked`);
      if (!checked) return {err:"Choisissez l'équipement (ou « Aucun »)"};
      const vhl = num(vol.value);
      if (vhl==null) return {err:"Le volume transféré est obligatoire"};
      const ebcVal = (checked.value==="Centrifugeuse" && ebc.value.trim()) ? num(ebc.value) : null;
      return {toId, equipment:checked.value, volume:vhl, ebc:ebcVal, date:dateT.value||today()};
    }
    return {node:wrap, read};
  }

  const t1 = el("div",{style:"font-weight:600;margin-top:8px;display:none"},"Cuve 1");
  const b1 = destBlock();
  const t2 = el("div",{style:"font-weight:600;margin-top:12px;display:none"},"Cuve 2");
  const b2 = destBlock(); b2.node.style.display = "none";
  card.append(t1, b1.node, t2, b2.node);

  splitCb.addEventListener("change", ()=>{
    const on = splitCb.checked;
    splitHint.style.display = on ? "" : "none";
    t1.style.display = on ? "" : "none";
    t2.style.display = on ? "" : "none";
    b2.node.style.display = on ? "" : "none";
  });

  const ok = el("button",{class:"btn primary mt"},"Valider le transfert");
  const cancel = el("button",{class:"btn ghost mt",style:"margin-left:8px"},"Annuler");
  card.append(ok, cancel); v.appendChild(card);
  cancel.addEventListener("click", ()=> go(S.tab));

  async function doTransfer(lotId, fromId, r){
    await q(db.from("transfers").insert({ lot_id:lotId, from_fermenter_id:fromId,
      to_fermenter_id:r.toId, equipment:r.equipment, volume_hl:r.volume, ebc:r.ebc,
      ts:r.date+"T12:00:00Z", date:r.date }));
  }

  ok.addEventListener("click", async ()=>{
    const r1 = b1.read();
    if (r1.err){ toast(r1.err); return; }

    if (!splitCb.checked){
      try{
        await doTransfer(lot.id, lot.fermenter_id, r1);
        await q(db.from("lots").update({ fermenter_id:r1.toId, volume_hl:r1.volume }).eq("id", lot.id));
        toast("Transfert effectué ✓"); await refreshData(); go(S.tab);
      }catch(e){ toast(e.message); }
      return;
    }

    // Répartition vers 2 cuves
    const r2 = b2.read();
    if (r2.err){ toast("Cuve 2 : "+r2.err); return; }
    if (r1.toId === r2.toId){ toast("Les deux cuves d'arrivée doivent être différentes"); return; }
    try{
      // 1) le brassin d'origine part vers la cuve 1
      await doTransfer(lot.id, lot.fermenter_id, r1);
      await q(db.from("lots").update({ fermenter_id:r1.toId, volume_hl:r1.volume }).eq("id", lot.id));
      // 2) un second brassin (meme biere) est cree pour la cuve 2
      const created = await q(db.from("lots").insert({ fermenter_id:r2.toId, beer_name:lot.beer_name,
        og:lot.og, volume_hl:r2.volume, start_date:lot.start_date, phase:lot.phase,
        status:lot.status, end_date:lot.end_date,
        style:lot.style, dit:lot.dit, dft:lot.dft, fruits:lot.fruits }).select("id").single());
      // l'historique de fermentation (releves + ajouts) est recopie vers le 2e brassin
      try {
        const [ms, ads] = await Promise.all([
          q(db.from("measurements").select("*").eq("lot_id", lot.id)),
          q(db.from("additions").select("*").eq("lot_id", lot.id)),
        ]);
        if (ms.length){
          const cop = ms.map(m=>({ lot_id:created.id, ts:m.ts, date:m.date, densite_sg:m.densite_sg,
            ph:m.ph, temp:m.temp, pressure:m.pressure, phase:m.phase, operator:m.operator, note:m.note }));
          for (let i=0;i<cop.length;i+=200) await q(db.from("measurements").insert(cop.slice(i,i+200)));
        }
        if (ads.length){
          const cop = ads.map(a=>({ lot_id:created.id, ts:a.ts, date:a.date, type:a.type, label:a.label,
            qty:a.qty, unit:a.unit, batch_no:a.batch_no, note:a.note }));
          for (let i=0;i<cop.length;i+=200) await q(db.from("additions").insert(cop.slice(i,i+200)));
        }
      } catch(e){ /* la copie d'historique ne doit pas bloquer la répartition */ }
      await doTransfer(created.id, lot.fermenter_id, r2);
      toast("Répartition vers 2 cuves effectuée ✓"); await refreshData(); go(S.tab);
    }catch(e){ toast(e.message); }
  });
}

/* ============================ CUVES & LOTS ============================ */
function viewLots(root) {
  const grid = el("div",{class:"grid cols-2"});
  const left = el("div",{class:"stack"}); const right = el("div",{class:"stack"});
  grid.append(left,right); root.appendChild(grid);

  if (canWrite()) {
    const occupied = new Set(S.lots.filter(l=>l.status==="Active").map(l=>l.fermenter_id));
    const create = el("div",{class:"card"});
    create.appendChild(el("h3",{},"Nouveau brassin"));
    const fSel = el("select"); const fOpts = {};
    S.fermenters.forEach(f=>{ const o = el("option",{value:f.id}, `${f.name}${occupied.has(f.id)?" (occupé)":""}`); if(occupied.has(f.id)) o.disabled=true; fOpts[f.id]=o; fSel.appendChild(o); });
    const cOg = inp("text","","59");
    const ogHint = el("div",{class:"hint"});
    const cDit = inp("text","","43");
    const cDft = inp("text","","6");
    const beerSel = beerSelector("", { onPick:(rp)=>{ if(rp){ cDit.value=sgToAbbr(rp.dit); cDft.value=sgToAbbr(rp.dft); } } });
    const cVol = inp("text","","hl");
    const cDate = inp("date", today());
    const cEnd = inp("date","");
    const endLab = lab("Date de fin", cEnd); endLab.classList.add("hidden");
    const r = el("div",{class:"row"});
    r.append(lab("Fermenteur",fSel), lab("Bière (gamme permanente)", beerSel.control),
             lab("DiM — mesurée (ex. 59)", cOg, ogHint), lab("DiT — initiale théo.", cDit), lab("DfT — finale théo.", cDft),
             lab("Volume (hl)", cVol), lab("Date de départ", cDate), endLab);
    create.appendChild(r);
    create.appendChild(beerSel.chkLine);
    { const rp = beerSel.recipe(); if(rp){ cDit.value=sgToAbbr(rp.dit); cDft.value=sgToAbbr(rp.dft); } }
    let cHist = null;
    if (isSup()) {
      const histLine = el("label",{style:"display:flex;align-items:center;gap:6px;margin-top:8px;font-size:13px;font-weight:500"});
      cHist = el("input"); cHist.type = "checkbox";
      histLine.append(cHist, document.createTextNode("Lot déjà terminé (historique) — autorise une cuve occupée"));
      create.appendChild(histLine);
      cHist.addEventListener("change", ()=>{
        endLab.classList.toggle("hidden", !cHist.checked);
        Object.entries(fOpts).forEach(([id,o])=>{ if (occupied.has(Number(id))) o.disabled = !cHist.checked; });
      });
    }
    cOg.addEventListener("input",()=>{ const sg=parseDens(cOg.value); ogHint.textContent = sg!=null?`= ${sg.toFixed(3)} · ≈ ${sgToPlato(sg).toFixed(1)} °P`:""; });
    const cBtn = el("button",{class:"btn primary mt"},"Créer le brassin");
    create.appendChild(cBtn); left.appendChild(create);
    cBtn.addEventListener("click", async ()=>{
      const beer = beerSel.get();
      if(!beer.name){ toast("Choisissez ou saisissez une bière"); return; }
      const og = parseDens(cOg.value);
      if(og==null){ toast("La densité initiale (DiM) est obligatoire"); return; }
      const vol = num(cVol.value);
      if(vol==null){ toast("Le volume (hl) est obligatoire"); return; }
      const hist = !!(cHist && cHist.checked);
      if (hist && !cEnd.value){ toast("Date de fin requise pour un lot historique"); return; }
      const payload = { fermenter_id:Number(fSel.value), beer_name:beer.name, og:og, volume_hl:vol, start_date:cDate.value,
        style:beer.style, dit: cDit.value.trim()?parseDens(cDit.value):null, dft: cDft.value.trim()?parseDens(cDft.value):null, fruits:beer.fruits };
      if (hist){ payload.status = "Terminé"; payload.end_date = cEnd.value; payload.phase = "Garde"; }
      try{
        await q(db.from("lots").insert(payload));
        toast(hist ? "Brassin historique ajouté ✓" : "Brassin créé ✓"); await refreshData(); go("lots");
      }catch(e){ toast(e.message); }
    });
  }

  const active = S.lots.filter(l=>l.status==="Active");
  const ac = el("div",{class:"card"});
  ac.appendChild(el("h3",{},`Brassins actifs (${active.length})`));
  if(!active.length) ac.appendChild(el("p",{class:"muted"},"Aucun lot actif."));
  active.forEach(l=>{
    const item = el("div",{class:"lot-item"});
    item.appendChild(el("div",{style:"flex:1"},`<div class="title">${l.fermenter_name} — ${l.beer_name}${fruitIcon(l)}</div><div class="sub">Départ ${l.start_date?fmtDate(l.start_date):"?"} ${l.volume_hl!=null?`· ${l.volume_hl} hl`:""} ${l.og?`· DiM ${sgToAbbr(+l.og)}`:""}${l.dit!=null?` · DiT ${sgToAbbr(+l.dit)}`:""}${l.dft!=null?` · DfT ${sgToAbbr(+l.dft)}`:""}${l.style?` · ${l.style}`:""}</div>`));
    item.appendChild(el("span",{class:`badge ${phaseClass(l.phase)}`}, l.phase));
    if (canWrite()) {
      // Avancer d'une phase : tout opérateur. Reculer vers une phase antérieure : superviseur seulement.
      PHASES.forEach(target=>{
        const rc = phaseRank(l.phase), rt = phaseRank(target);
        if (rt === rc) return;
        const forward = rt > rc;
        if (!forward && !isSup()) return;
        const b = el("button",{class:"btn ghost sm"}, `${forward?"→":"←"} ${target}`);
        b.addEventListener("click", async ()=>{ try{
          const upd = { phase: target };
          if (target==="15°C" && !l.date_15c) upd.date_15c = today();
          if (target==="Garde" && !l.date_garde) upd.date_garde = today();
          await q(db.from("lots").update(upd).eq("id",l.id)); toast("Phase mise à jour"); await refreshData(); go("lots"); }catch(e){toast(e.message);} });
        item.append(b);
      });
      const tr = el("button",{class:"btn ghost sm"},"Transfert");
      tr.addEventListener("click", ()=> transferLot(l));
      item.append(tr);
      const close = el("button",{class:"btn ghost sm"},"Clôturer");
      close.addEventListener("click", async ()=>{
        let nCond = 0;
        try { nCond = (await q(db.from("packagings").select("id").eq("lot_id", l.id))).length; } catch(_){}
        if (nCond === 0){ toast("Ajoutez au moins un conditionnement avant de clôturer (onglet Courbes → Conditionnement)."); return; }
        modal("Clôturer le brassin", (body, done)=>{
          body.appendChild(el("p",{class:"hint"},`${l.fermenter_name} — ${l.beer_name}. Date de clôture = date de conditionnement.`));
          const d = inp("date", today());
          body.appendChild(lab("Date de clôture", d));
          const ok = el("button",{class:"btn primary mt"},"Clôturer");
          const cx = el("button",{class:"btn ghost mt",style:"margin-left:8px"},"Annuler");
          body.append(ok, cx); cx.addEventListener("click", done);
          ok.addEventListener("click", async ()=>{ try{ await q(db.from("lots").update({status:"Terminé", end_date:d.value||today()}).eq("id",l.id)); done(); toast("Lot clôturé"); await refreshData(); go("lots"); }catch(e){toast(e.message);} });
        });
      });
      item.append(close);
      if (isSup()) { const edit = el("button",{class:"btn ghost sm"},"Éditer"); edit.addEventListener("click", ()=> editLot(l)); item.append(edit); }
    }
    ac.appendChild(item);
  });
  left.appendChild(ac);

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
function normTxt(s){ return String(s==null?"":s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/°/g,"").toLowerCase().trim().replace(/\s+/g," "); }
function getSheet(wb, names){
  for (const n of names){ const hit = wb.SheetNames.find(s=> normTxt(s)===normTxt(n)); if (hit) return wb.Sheets[hit]; }
  return null;
}
function sheetRows(ws){ return XLSX.utils.sheet_to_json(ws, { header:1, raw:true, blankrows:false }); }

// Feuille "Brassin" : infos (colonne A = libellé, colonne B = valeur) + section "Transferts".
function parseBrassinSheet(rows, lk){
  const LABELS = {
    "biere":"beer","nom":"beer","nom de la biere":"beer",
    "style":"style",
    "fermenteur initial":"initFerm","fermenteur de depart":"initFerm","cuve initiale":"initFerm","fermenteur":"initFerm",
    "volume":"volume","volume (hl)":"volume","volume hl":"volume",
    "dim":"dim","dit":"dit","dft":"dft",
    "date de brassage":"start","date de depart":"start","date de mise en cuve":"start",
    "date mise a 15c":"date15","date mise a 15":"date15","date 15c":"date15","date de mise a 15c":"date15","date de mise a 15":"date15",
    "date mise en garde":"dateGarde","date de garde":"dateGarde","date de mise en garde":"dateGarde",
    "date de cloture":"end","date de conditionnement":"end","date de fin":"end",
  };
  const meta = {}; const transfers = []; const packagings = []; let section = null;
  for (let i=0;i<rows.length;i++){
    const r = rows[i]; if (!r) continue;
    const a = normTxt(r[0]);
    if (a==="transferts"){ section = "trans"; continue; }
    if (a==="conditionnement"){ section = "pack"; continue; }
    if (section==="trans"){
      if (a==="de" || a==="depart") continue; // entête du tableau
      const from = resolveFerm(r[0], lk), to = resolveFerm(r[1], lk), date = xlDateStr(r[2]);
      if (!from && !to && !date) continue;
      transfers.push({ from, to, date,
        equipment: r[3]!=null && String(r[3]).trim() ? String(r[3]).trim() : "Aucun",
        volume: (r[4]!=null && r[4]!=="") ? parseFloat(String(r[4]).replace(",",".")) : null,
        ebc: (r[5]!=null && r[5]!=="") ? parseFloat(String(r[5]).replace(",",".")) : null });
      continue;
    }
    if (section==="pack"){
      if (a==="format") continue; // entête du tableau
      const fmt = a; const date = xlDateStr(r[1]);
      const vol = (r[2]!=null && r[2]!=="") ? parseFloat(String(r[2]).replace(",",".")) : null;
      if (!PACK_FORMATS.includes(fmt)) continue;
      if (date==null && vol==null) continue; // format non renseigné
      packagings.push({ format: fmt, date, volume: vol });
      continue;
    }
    if (!a) continue;
    const key = LABELS[a]; if (!key) continue;
    let v = r[1];
    if (["start","date15","dateGarde","end"].includes(key)) v = xlDateStr(v);
    else if (["dim","dit","dft"].includes(key)) v = (v==null||v==="") ? null : parseDens(v);
    else if (key==="volume") v = (v==null||v==="") ? null : parseFloat(String(v).replace(",","."));
    else if (key==="initFerm") v = resolveFerm(r[1], lk);
    else v = (v==null) ? null : String(v).trim();
    meta[key] = v;
  }
  return { meta, transfers, packagings };
}
function releveSheetAOA(){
  const header = ["Date","Mesure", ...FERM_ORDER];
  const aoa = [header];
  const measures = ["Pression","Température","Densité","pH"];
  for (let d=0; d<25; d++) measures.forEach(mz => aoa.push(["", mz, ...FERM_ORDER.map(()=> "")]));
  return { aoa, header };
}
function downloadTemplate(mode){
  const { aoa, header } = releveSheetAOA();
  const wsR = XLSX.utils.aoa_to_sheet(aoa);
  wsR["!cols"] = header.map((_,i)=> ({ wch: i===0?12 : i===1?13 : 9 }));
  const wb = XLSX.utils.book_new();
  if (mode==="hist"){
    const info = [
      ["Brassin — informations",""],
      ["Bière",""],["Style",""],["Fermenteur initial",""],["Volume (hl)",""],
      ["DiM",""],["DiT",""],["DfT",""],
      ["Date de brassage",""],["Date mise à 15°C",""],["Date mise en Garde",""],["Date de clôture",""],
      ["",""],
      ["Transferts",""],
      ["De","Vers","Date","Équipement","Volume (hl)","EBC"],
      ["","","","","",""],["","","","","",""],["","","","","",""],
      ["",""],
      ["Conditionnement",""],
      ["Aide-mémoire formats :  " + PACK_FORMATS.map(f=> `${f} = ${PACK_LABELS[f]}`).join("   ·   "), ""],
      ["Une ligne par conditionnement (plusieurs du même format à des dates différentes sont possibles).", ""],
      ["Format","Date","Volume (hl)"],
      ...Array.from({length: 10}, ()=> ["","",""]),
    ];
    const wsB = XLSX.utils.aoa_to_sheet(info);
    wsB["!cols"] = [{wch:20},{wch:16},{wch:12},{wch:20},{wch:12},{wch:8}];
    XLSX.utils.book_append_sheet(wb, wsB, "Brassin");   // 1re position
    XLSX.utils.book_append_sheet(wb, wsR, "Relevés");   // 2e position
    XLSX.writeFile(wb, "modele_brassin_historique.xlsx");
  } else {
    XLSX.utils.book_append_sheet(wb, wsR, "Relevés");
    XLSX.writeFile(wb, "modele_releves.xlsx");
  }
}

function viewImport(root){
  if (!canWrite()){ root.appendChild(emptyBox("Accès restreint","Réservé aux opérateurs et superviseurs.")); return; }
  if (!window.XLSX){ root.appendChild(emptyBox("Composant indisponible","La librairie de lecture Excel n'a pas pu être chargée (vérifiez la connexion internet).")); return; }

  const card = el("div",{class:"card",style:"max-width:820px"});
  card.appendChild(el("h3",{},"Import d'un classeur Excel"));

  let mode = "actif";
  const modeOpts = [["actif","Standard — relevés rattachés au brassin actif de chaque cuve (feuille « Relevés »)"]];
  if (isSup()) modeOpts.push(["hist","Historique — crée le brassin depuis la feuille « Brassin » (infos, phases, transferts) + ses relevés"]);
  if (modeOpts.length > 1){
    const modeWrap = el("div",{class:"mt",style:"background:#faf9f7;border:1px solid #eee;border-radius:10px;padding:10px 12px"});
    modeWrap.appendChild(el("div",{style:"font-weight:600;font-size:13px;margin-bottom:4px"},"Type d'import"));
    modeOpts.forEach(([val,label])=>{
      const l = el("label",{style:"display:flex;align-items:center;gap:6px;font-size:14px;font-weight:400;margin:2px 0"});
      const rb = el("input"); rb.type="radio"; rb.name="impmode"; rb.value=val; if (val==="actif") rb.checked=true;
      rb.addEventListener("change", ()=>{ if(rb.checked){ mode=val; updateHint(); if(lastFile) handleFile(lastFile); else { summary.innerHTML=""; result.innerHTML=""; importBtn.classList.add("hidden"); } } });
      l.append(rb, document.createTextNode(label)); modeWrap.appendChild(l);
    });
    card.appendChild(modeWrap);
  }

  const hint = el("p",{class:"hint"});
  function updateHint(){
    hint.textContent = mode==="hist"
      ? "Feuille 1 « Brassin » : infos (bière, style, fermenteur initial, volumes, DiM/DiT/DfT, date de brassage, mise à 15°C, mise en Garde, clôture), tableau « Transferts » et « Conditionnement » (liste libre, une ligne par condi, codes format c33/c44/c50/b33/b75/kk/inox — voir aide-mémoire dans le fichier ; max 4). Feuille 2 « Relevés » : Pression / Température / Densité / pH par date, dans les cuves traversées. Le brassin (clôturé) et son historique sont créés automatiquement."
      : "Feuille « Relevés » : une colonne par fermenteur ; pour chaque date, 4 lignes (Pression, Température, Densité, pH). Densités en abrégé (59 = 1.059). Chaque relevé est rattaché au brassin ACTIF de la cuve.";
  }
  updateHint();
  card.appendChild(hint);

  const tmplBtn = el("button",{class:"btn ghost"},"⬇ Télécharger le modèle");
  tmplBtn.addEventListener("click", ()=> downloadTemplate(mode));
  card.appendChild(tmplBtn);

  const file = el("input",{class:"mt", type:"file", accept:".xlsx,.xls"});
  card.appendChild(el("div",{class:"mt"})); card.appendChild(file);

  const summary = el("div",{class:"mt"}); card.appendChild(summary);
  const importBtn = el("button",{class:"btn primary mt hidden"},"Importer");
  card.appendChild(importBtn);
  const result = el("div",{class:"mt"}); card.appendChild(result);
  root.appendChild(card);

  let toInsert = [];      // mode standard : mesures à insérer
  let hist = null;        // mode historique : { meta, transfers, measRows }
  let lastFile = null;

  file.addEventListener("change", ()=>{ lastFile = file.files[0] || null; if (lastFile) handleFile(lastFile); });

  async function handleFile(f){
    summary.innerHTML=""; result.innerHTML=""; importBtn.classList.add("hidden"); toInsert=[]; hist=null;
    let wb;
    try { wb = XLSX.read(await f.arrayBuffer(), { type:"array" }); }
    catch(e){ summary.innerHTML = `<p class="err">Lecture impossible : ${e.message}</p>`; return; }
    const lk = buildLookup(S.fermenters);
    if (mode==="hist") await prepHist(wb, lk); else await prepStd(wb, lk);
  }

  // ---------- MODE STANDARD ----------
  async function prepStd(wb, lk){
    const ws = getSheet(wb, ["Relevés","Releves"]) || wb.Sheets[wb.SheetNames[0]];
    const parsed = parseSheet(sheetRows(ws), lk);
    if (!parsed.length){ summary.innerHTML = `<p class="err">Aucun relevé détecté — vérifiez le format (entête « Date », libellés des mesures).</p>`; return; }
    const activeByFerm = {}; S.lots.filter(l=>l.status==="Active").forEach(l=> activeByFerm[l.fermenter_name]=l);
    const noLot = new Set(); const lotIds = new Set(); const candidates = [];
    for (const m of parsed){
      const lot = activeByFerm[m.ferm];
      if (!lot){ noLot.add(m.ferm); continue; }
      lotIds.add(lot.id); candidates.push({ m, lot });
    }
    let already = new Set();
    try { if (lotIds.size){ const ex = await q(db.from("measurements").select("lot_id,date").in("lot_id",[...lotIds]).eq("operator","Import xlsx")); ex.forEach(r=> already.add(r.lot_id+"||"+r.date)); } } catch(_){}
    let dupes = 0;
    for (const { m, lot } of candidates){
      if (already.has(lot.id+"||"+m.date)){ dupes++; continue; }
      toInsert.push({ lot_id: lot.id, ts: m.date+"T12:00:00Z", date: m.date,
        densite_sg: m.dens!=null ? parseDens(m.dens) : null,
        ph: m.ph ?? null, temp: m.temp ?? null, pressure: m.press ?? null, phase: lot.phase, operator: "Import xlsx" });
    }
    const dates = [...new Set(parsed.map(m=>m.date))].sort();
    const ferms = [...new Set(candidates.map(c=>c.lot.fermenter_name))].sort((a,b)=> fermRank(a)-fermRank(b));
    let html = `<p><strong>${parsed.length}</strong> relevés lus${dates.length?` · du ${fmtDate(dates[0])} au ${fmtDate(dates[dates.length-1])}`:""}.</p>`;
    html += `<p><strong>${toInsert.length}</strong> à importer sur ${ferms.length} fermenteur(s) actif(s)${dupes?` · ${dupes} déjà importés (ignorés)`:""}.</p>`;
    if (noLot.size) html += `<p class="err">Sans lot actif, donc ignorés : ${[...noLot].sort((a,b)=>fermRank(a)-fermRank(b)).join(", ")}</p>`;
    summary.innerHTML = html;
    importBtn.textContent = "Importer les relevés";
    if (toInsert.length) importBtn.classList.remove("hidden");
  }

  // ---------- MODE HISTORIQUE ----------
  async function prepHist(wb, lk){
    const wsB = getSheet(wb, ["Brassin","Brassins"]);
    const wsR = getSheet(wb, ["Relevés","Releves"]);
    if (!wsB){ summary.innerHTML = `<p class="err">Feuille « Brassin » introuvable. Téléchargez le modèle historique.</p>`; return; }
    const { meta, transfers, packagings } = parseBrassinSheet(sheetRows(wsB), lk);
    const readings = wsR ? parseSheet(sheetRows(wsR), lk) : [];
    const packCapped = packagings.slice(0, 4);
    hist = { meta, transfers, packagings: packCapped, readings };

    const nDates = new Set(readings.map(r=>r.date)).size;
    const froms = transfers.map(t=>t.from).filter(Boolean);
    const split = froms.some((f,i)=> froms.indexOf(f)!==i);   // 2 transferts partant de la même cuve = répartition
    const condTot = packCapped.reduce((s,p)=> s + (p.volume!=null?p.volume:0), 0);

    const errs = [];
    if (!meta.beer) errs.push("bière manquante");
    if (!meta.initFerm) errs.push("fermenteur initial manquant/inconnu");
    if (!meta.start) errs.push("date de brassage manquante");
    if (meta.end && packCapped.length === 0) errs.push("au moins un conditionnement est requis pour une bière clôturée");
    const fmt = (d)=> d?fmtDate(d):"—";
    let html = `<p><strong>${meta.beer||"(bière ?)"}</strong>${meta.style?` · ${meta.style}`:""}${(meta.style==="Sour/fruits")?" 🍓":""} — cuve initiale <strong>${meta.initFerm||"?"}</strong></p>`;
    html += `<p class="muted">Brassage ${fmt(meta.start)} · 15°C ${fmt(meta.date15)} · Garde ${fmt(meta.dateGarde)} · Clôture ${fmt(meta.end)}${meta.volume!=null?` · ${meta.volume} hl`:""}${meta.dim!=null?` · DiM ${sgToAbbr(meta.dim)}`:""}${meta.dit!=null?` · DiT ${sgToAbbr(meta.dit)}`:""}${meta.dft!=null?` · DfT ${sgToAbbr(meta.dft)}`:""}</p>`;
    html += `<p><strong>${transfers.length}</strong> transfert(s)${split?" · <strong>répartition détectée → 2 brassins</strong>":""} · <strong>${nDates}</strong> date(s) de relevé.</p>`;
    if (packCapped.length) html += `<p><strong>${packCapped.length}</strong> conditionnement(s)${packagings.length>4?" (max 4 — surplus ignoré)":""} · ${condTot.toFixed(1)} hl${meta.volume!=null?` · pertes ${(meta.volume-condTot).toFixed(1)} hl`:""}.</p>`;
    if (errs.length) html += `<p class="err">À compléter : ${errs.join(", ")}.</p>`;
    summary.innerHTML = html;
    importBtn.textContent = "Créer le brassin et importer";
    if (!errs.length) importBtn.classList.remove("hidden");
  }

  importBtn.addEventListener("click", async ()=>{
    importBtn.disabled = true; const label0 = importBtn.textContent; importBtn.textContent = "En cours…";
    try {
      if (mode==="hist") await runHist(); else await runStd();
      await refreshData();
    } catch(e){ result.innerHTML = `<p class="err">Échec : ${e.message}</p>`; importBtn.disabled=false; importBtn.textContent=label0; }
  });

  async function runStd(){
    for (let i=0; i<toInsert.length; i+=200) await q(db.from("measurements").insert(toInsert.slice(i,i+200)));
    result.innerHTML = `<p class="ok">${toInsert.length} relevés importés ✓</p>`;
    importBtn.classList.add("hidden"); toast("Import terminé ✓");
  }

  async function runHist(){
    if (!isSup()) throw new Error("Import historique réservé aux superviseurs");
    const { meta, transfers, readings } = hist;
    const fid = (name)=> (S.fermenters.find(f=>f.name===name)||{}).id || null;
    const initId = fid(meta.initFerm);
    if (!initId) throw new Error("fermenteur initial inconnu");
    const phase = meta.dateGarde ? "Garde" : (meta.date15 ? "15°C" : "Fermentation");
    const lotFields = {
      beer_name: meta.beer, style: meta.style || null,
      og: meta.dim ?? null, dit: meta.dit ?? null, dft: meta.dft ?? null,
      start_date: meta.start, date_15c: meta.date15 || null, date_garde: meta.dateGarde || null,
      phase, status: meta.end ? "Terminé" : "Active", end_date: meta.end || null,
      fruits: meta.style === "Sour/fruits" };

    // 1) brassin principal
    const main = await q(db.from("lots").insert({ ...lotFields, fermenter_id: initId, volume_hl: meta.volume ?? null }).select("id").single());
    const mainId = main.id;

    // 2) transferts : séquentiel = déplace le principal ; branche depuis une cuve déjà quittée = nouveau brassin (répartition)
    const fermToLot = { [meta.initFerm]: mainId };
    let curMain = meta.initFerm, mainVol = meta.volume ?? null;
    const splitLots = []; let splitDate = null;
    for (const t of transfers){
      const toId = fid(t.to); if (!toId) continue;
      const fromName = t.from || curMain; const fromId = fid(fromName) || fid(curMain);
      if (fromName === curMain){
        await q(db.from("transfers").insert({ lot_id: mainId, from_fermenter_id: fromId, to_fermenter_id: toId,
          equipment: t.equipment || "Aucun", volume_hl: t.volume, ebc: t.ebc,
          ts: (t.date||meta.start)+"T12:00:00Z", date: t.date || meta.start }));
        fermToLot[t.to] = mainId; curMain = t.to; if (t.volume!=null) mainVol = t.volume;
      } else {
        const sp = await q(db.from("lots").insert({ ...lotFields, fermenter_id: toId, volume_hl: t.volume ?? null }).select("id").single());
        await q(db.from("transfers").insert({ lot_id: sp.id, from_fermenter_id: fromId, to_fermenter_id: toId,
          equipment: t.equipment || "Aucun", volume_hl: t.volume, ebc: t.ebc,
          ts: (t.date||meta.start)+"T12:00:00Z", date: t.date || meta.start }));
        fermToLot[t.to] = sp.id; splitLots.push(sp.id);
        if (t.date && (!splitDate || t.date < splitDate)) splitDate = t.date;
      }
    }
    const finalMainId = fid(curMain);
    if (finalMainId !== initId || mainVol !== (meta.volume ?? null))
      await q(db.from("lots").update({ fermenter_id: finalMainId, volume_hl: mainVol }).eq("id", mainId));

    // 3) relevés routés par fermenteur ; le tronc commun (avant la répartition) est partagé par tous les brassins
    const phaseAt = (d)=> (meta.dateGarde && d>=meta.dateGarde) ? "Garde" : ((meta.date15 && d>=meta.date15) ? "15°C" : "Fermentation");
    const byLotDate = {};
    const put = (lotId, r)=>{ const k=lotId+"||"+r.date; (byLotDate[k] ??= { lot_id:lotId, date:r.date });
      if (r.dens!=null) byLotDate[k].dens=r.dens; if (r.ph!=null) byLotDate[k].ph=r.ph;
      if (r.temp!=null) byLotDate[k].temp=r.temp; if (r.press!=null) byLotDate[k].press=r.press; };
    for (const r of readings){
      if (splitDate && r.date < splitDate){ put(mainId, r); for (const id of splitLots) put(id, r); }
      else put(fermToLot[r.ferm] || mainId, r);
    }
    const rows = Object.values(byLotDate).map(m=>({ lot_id:m.lot_id, ts:m.date+"T12:00:00Z", date:m.date,
      densite_sg: m.dens!=null?parseDens(m.dens):null, ph:m.ph??null, temp:m.temp??null, pressure:m.press??null,
      phase: phaseAt(m.date), operator:"Import historique" }));
    for (let i=0;i<rows.length;i+=200) await q(db.from("measurements").insert(rows.slice(i,i+200)));

    // 4) conditionnements (rattachés au brassin principal)
    const { packagings } = hist;
    if (packagings && packagings.length){
      const pk = packagings.map(p=>({ lot_id: mainId, format: p.format, date: p.date || meta.end || null, volume_hl: p.volume }));
      for (let i=0;i<pk.length;i+=200) await q(db.from("packagings").insert(pk.slice(i,i+200)));
    }

    const nLots = 1 + splitLots.length;
    result.innerHTML = `<p class="ok">${nLots>1?`${nLots} brassins créés (répartition)`:`Brassin « ${meta.beer} » créé`} ✓ · ${transfers.length} transfert(s) · ${rows.length} relevé(s)${packagings&&packagings.length?` · ${packagings.length} conditionnement(s)`:""}.</p>`;
    importBtn.classList.add("hidden"); toast("Brassin historique importé ✓");
  }
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
