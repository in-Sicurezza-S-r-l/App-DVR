// PILOTA DVR – App nuova: aziende, sopralluogo (anagrafica, lavoratori, attrezzature, sostanze, prescrizioni, altro) e invio
import { initAuth, login, logout } from "./auth.js";
import { scaricaAziende, aziendeSalvate, codiciConBozza, calcolaStato, nomeTecnico, MESI,
  scaricaAzienda, aziendaSalvata, scaricaFoto } from "./dati.js";
import { UTENTE_ESEMPIO, PACCHETTO_ESEMPIO, BOZZE_ESEMPIO, aziendaEsempio } from "./esempio.js";
import { SCALE, calcola, pericolo, trovaVoce } from "./movarisch.js";
import { leggiSDS } from "./sds.js";
import { bozzaVuota, leggiBozza, salvaBozza, eliminaBozza, contaModifiche, riepilogo, salvaFoto, leggiFoto, idBreve } from "./bozza.js";

const $app = document.getElementById("app");
const esc = v => String(v ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
const $ = id => document.getElementById(id);

// Stato dell'app: resta in memoria, così tornando indietro si ritrova tutto com'era
const S = {
  utente: null, esempio: false,
  pacchetto: null, aziende: [], errore: "", caricamento: false,
  schermata: "aziende", azienda: null, tab: "anagrafica", lavSel: null, pannello: null,
  dettaglio: null, bozza: null, caricamentoAz: false, erroreAz: "", inviato: false,
  q: "", mostraTutte: ricorda("mostraTutte") === "1", filtro: "tutti", scroll: 0,
  bozzeEsempio: {}, fotoUrl: {}, valSos: null, valMansExtra: []
};

function ricorda(k, v) {
  try { if (v === undefined) return localStorage.getItem("pd." + k); localStorage.setItem("pd." + k, v); } catch (_) { return null; }
}

// ---------- Date ----------
function data(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const d = new Date(s); return isNaN(d) ? null : d;
}
const fmt = v => { const d = data(v); return d ? d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) : ""; };
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const oggi = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const fineMeseTra = mesi => { const d = oggi(); return new Date(d.getFullYear(), d.getMonth() + mesi + 1, 0); };
const piuGiorni = (d, g) => { const x = new Date(d); x.setDate(x.getDate() + g); return x; };

// ---------- Avvio ----------
async function avvio() {
  // Modalità esempio: dall'indirizzo (?esempio) oppure ricordata sul dispositivo (utile per l'app installata sull'iPad)
  const qs = new URLSearchParams(location.search);
  if (qs.has("esci-esempio")) ricorda("esempio", "0");
  if (qs.has("esempio") || ricorda("esempio") === "1") { ricorda("esempio", "1"); return avviaEsempio(); }
  try {
    const acc = await initAuth();
    if (!acc) return disegnaAccesso();
    S.utente = { name: acc.name || nomeTecnico(null, acc.username.toLowerCase()), username: acc.username.toLowerCase() };
  } catch (e) {
    return disegnaAccesso(e.message);
  }
  const salvato = await aziendeSalvate().catch(() => null);
  if (salvato) await applica(salvato);
  disegna();
  aggiorna();
}

function avviaEsempio() {
  S.esempio = true;
  S.utente = UTENTE_ESEMPIO;
  S.pacchetto = PACCHETTO_ESEMPIO;
  for (const c of BOZZE_ESEMPIO) {
    const b = bozzaVuota(c, UTENTE_ESEMPIO.name);
    b.attDismesse.A5 = true; b.note = "Bozza di esempio iniziata sul tablet.";
    S.bozzeEsempio[c] = b;
  }
  ricalcolaStati();
  disegna();
}

async function applica(pacchetto) {
  S.pacchetto = pacchetto;
  await ricalcolaStati();
}

async function ricalcolaStati() {
  const bozze = S.esempio ? new Set(Object.keys(S.bozzeEsempio)) : await codiciConBozza().catch(() => new Set());
  S.aziende = calcolaStato(S.pacchetto, bozze);
}

async function aggiorna() {
  if (S.esempio) return;
  S.caricamento = true; S.errore = ""; disegna();
  try { await applica(await scaricaAziende()); }
  catch (e) {
    S.errore = navigator.onLine === false ? "Nessuna rete: uso i dati salvati sul tablet."
      : "Non riesco a leggere i dati da SharePoint.\n" + e.message;
  }
  S.caricamento = false;
  disegna();
}

// ---------- Bozza ----------
async function caricaBozza(codice) {
  if (S.esempio) return S.bozzeEsempio[codice] || null;
  return (await leggiBozza(codice).catch(() => null)) || null;
}
// Ogni modifica avvia (se serve) il sopralluogo e salva subito la bozza sul tablet
async function modifica(fn) {
  if (!S.bozza) S.bozza = bozzaVuota(S.azienda.codice, S.utente.name);
  completaBozza(S.bozza);
  fn(S.bozza);
  if (S.esempio) S.bozzeEsempio[S.azienda.codice] = S.bozza;
  else await salvaBozza(S.bozza);
  await ricalcolaStati();
  S.azienda = S.aziende.find(a => a.codice === S.azienda.codice) || S.azienda;
  disegna();
}

// ---------- Scheda azienda: viste che uniscono dati di SharePoint e modifiche della bozza ----------
// Bozze create con una versione precedente dell'app: aggiunge i campi nuovi
function completaBozza(b) {
  if (!b) return b;
  const v = bozzaVuota(b.codice, b.tecnico);
  for (const k of Object.keys(v)) if (b[k] === undefined) b[k] = v[k];
  return b;
}

function lavoratori() {
  const D = S.dettaglio, B = S.bozza || bozzaVuota("", "");
  const base = D.lavoratori.map(l => ({ ...l }));
  const nuovi = B.lavNuovi.map(n => ({ ...n, nuovo: true, stato: "ATTIVO" }));
  return base.concat(nuovi).map(l => {
    const r = B.ruoli[l.id] || {};
    return {
      ...l,
      mansioni: B.mansioni[l.id] || l.mansioni,
      mansioniCambiate: !!B.mansioni[l.id],
      cessato: !!B.cessati[l.id],
      addettoAI: r.addettoAI ?? l.addettoAI, addettoPS: r.addettoPS ?? l.addettoPS, preposto: r.preposto ?? l.preposto
    };
  }).sort((a, b) => a.nome.localeCompare(b.nome, "it"));
}

function famiglia(n) {
  const u = n.toUpperCase();
  if (/INCENDIO/.test(u)) return 2;
  if (/SOCCORSO|BLSD|DAE/.test(u)) return 3;
  if (/PREPOST|DATOR|DIRIGENT|RLS|QUOTA|CARRELL|PLE|GRU |SPAZI CONFINATI|TRATTORI|ESCAVATOR/.test(u)) return 4;
  return 1;
}
function chiaveCorso(n) {
  const u = n.toUpperCase();
  if (/INCENDIO/.test(u)) return "AI"; if (/SOCCORSO|BLSD/.test(u)) return "PS"; if (/CARRELL/.test(u)) return "CARR";
  if (/QUOTA/.test(u)) return "QUOTA"; if (/PREPOST/.test(u)) return "PREP"; if (/RLS/.test(u)) return "RLS";
  if (/DATOR/.test(u)) return "DL"; if (/GENERALE/.test(u)) return "GEN"; if (/PLE/.test(u)) return "PLE"; return "LAV";
}
const COLORI = { 1: "#CDEFF9", 2: "#F8C9C9", 3: "#D6EFBF", 4: "#FFEBA8" };
const TITOLI = { 1: "Formazione lavoratori", 2: "Antincendio", 3: "Primo soccorso", 4: "Altri corsi" };

function scadenzaCorso(c) {
  if (c.scadenza) return data(c.scadenza);
  const d = data(c.data); if (!d) return null;
  const k = (S.dettaglio.catalogoCorsi || []).find(x => x.nome.toLowerCase() === c.corso.toLowerCase());
  return k && k.giorni ? piuGiorni(d, k.giorni) : null;
}

function corsiDi(nome) {
  const B = S.bozza || bozzaVuota("", "");
  return S.dettaglio.formazione.filter(f => f.lavoratore.toLowerCase() === nome.toLowerCase())
    .concat(B.corsiNuovi.filter(c => c.lavoratore === nome).map(c => ({ ...c, nuovo: true })));
}

// Corsi di un lavoratore, raggruppati e colorati come nel Prospetto formativo
function gruppiCorsi(nome) {
  const cs = corsiDi(nome), oggiD = oggi(), ultimo = {};
  cs.forEach(c => { const d = data(c.data); if (d) { const k = chiaveCorso(c.corso); if (!ultimo[k] || d > ultimo[k]) ultimo[k] = d; } });
  return [1, 2, 3, 4].map(f => ({
    f, titolo: TITOLI[f],
    corsi: cs.filter(c => famiglia(c.corso) === f)
      .sort((a, b) => (data(a.data) || 9e15) - (data(b.data) || 9e15))
      .map(c => {
        const d = data(c.data), sup = d && ultimo[chiaveCorso(c.corso)] > d, sc = scadenzaCorso(c);
        let testo = sc ? "scade il " + fmt(sc) : "—", classe = "";
        if (c.stato === "DA FARE" || c.daFare) { testo = "DA FARE" + (sc ? " entro il " + fmt(sc) : ""); classe = "attenzione"; }
        else if (sup) { testo = "superato dal corso successivo"; classe = "spento"; }
        else if (sc && sc < oggiD) { testo = "SCADUTO il " + fmt(sc); classe = "scaduto"; }
        else if (sc && sc - oggiD < 90 * 864e5) classe = "attenzione";
        return { ...c, dataTesto: d ? "del " + fmt(d) : (c.stato === "DA FARE" || c.daFare ? "da fare" : ""), testo, classe, superato: sup };
      })
  })).filter(g => g.corsi.length);
}

function attrezzature() {
  const B = S.bozza || bozzaVuota("", "");
  return S.dettaglio.attrezzature.map(a => ({ ...a, dismessa: !!B.attDismesse[a.id] }))
    .concat(B.attNuove.map(a => ({ ...a, nuova: true })));
}
function sostanze() {
  const B = S.bozza || bozzaVuota("", "");
  const agg = B.sosAggiornate || {};
  return S.dettaglio.sostanze.map(s => ({ ...s, ...(agg[s.id] || {}), aggiornata: !!agg[s.id], eliminata: !!B.sosEliminate[s.id] }))
    .concat(B.sosNuove.map(s => ({ ...s, nuova: true })));
}
function prescrizioni() {
  const B = S.bozza || bozzaVuota("", "");
  return S.dettaglio.prescrizioni.map(p => ({ ...p, risolta: !!B.preRisolte[p.id], fotoNuove: B.preFoto[p.id] || [] }))
    .concat(B.preNuove.map(p => ({ ...p, nuova: true, fotoNuove: p.foto, foto: [] })));
}
// ---- Valutazioni MoVaRisCh di una sostanza (SharePoint + bozza) ----
function valutazioniSostanza(sost) {
  const B = S.bozza || bozzaVuota("", "");
  const out = {};
  for (const v of S.dettaglio.valChimica || [])
    if (v.sostanza.toLowerCase() === sost.nome.toLowerCase()) out[v.mansione] = { ...v, origine: "salvata" };
  for (const [k, v] of Object.entries(B.valChimica || {}))
    if (k.startsWith(sost.id + "|")) out[v.mansione] = { ...v, origine: "bozza" };
  return out;
}
function esitoSostanza(sost) {
  const vals = Object.values(valutazioniSostanza(sost)).map(v => calcola(sost.frasiH, v)).filter(r => r.completa);
  if (!vals.length) return null;
  const peggiore = vals.reduce((a, b) => (b.r > a.r ? b : a));
  return { ...peggiore.classe, quante: vals.length };
}

function impianto() { return { ...S.dettaglio.impianto, ...((S.bozza && S.bozza.impianto) || {}) }; }

function dataSopralluogo() { const d = S.bozza ? new Date(S.bozza.iniziata) : oggi(); d.setHours(0, 0, 0, 0); return d; }

function scadenzeEntroAnno() {
  const out = [], oggiD = dataSopralluogo(), limite = piuGiorni(oggiD, 365);
  for (const l of lavoratori()) {
    if (l.cessato) continue;
    for (const g of gruppiCorsi(l.nome)) for (const c of g.corsi) {
      if (c.superato) continue;
      const sc = scadenzaCorso(c);
      if (c.stato === "DA FARE" || c.daFare) out.push({ lav: l.nome, corso: c.corso, quando: c.testo, ord: sc ? +sc : 0, classe: "attenzione" });
      else if (sc && sc <= limite) out.push({ lav: l.nome, corso: c.corso, quando: c.testo, ord: +sc, classe: sc < oggiD ? "scaduto" : "attenzione" });
    }
  }
  return out.sort((a, b) => a.ord - b.ord);
}

// ---------- Apertura di un'azienda ----------
async function apriAzienda(codice) {
  S.scroll = window.scrollY;
  const cambia = !S.azienda || S.azienda.codice !== codice;
  S.azienda = S.aziende.find(a => a.codice === codice);
  if (cambia) { S.tab = "anagrafica"; S.lavSel = null; S.pannello = null; S.dettaglio = null; S.inviato = false; }
  S.schermata = "azienda";
  S.bozza = completaBozza(await caricaBozza(codice));
  window.scrollTo(0, 0);
  if (S.esempio) { S.dettaglio = aziendaEsempio(S.azienda); return disegna(); }
  if (!S.dettaglio) S.dettaglio = await aziendaSalvata(codice).catch(() => null);
  disegna();
  S.caricamentoAz = true; S.erroreAz = ""; disegna();
  try { S.dettaglio = await scaricaAzienda(codice); }
  catch (e) {
    S.erroreAz = S.dettaglio ? "Senza collegamento: mostro i dati salvati sul tablet il " + fmt(S.dettaglio.scaricatoIl) + "."
      : "Non riesco a leggere i dati di questa azienda.\n" + e.message;
  }
  S.caricamentoAz = false;
  disegna();
}

// ---------- Disegno ----------
function disegna() {
  if (S.schermata === "azienda") return disegnaAzienda();
  disegnaElenco();
}

function disegnaAccesso(errore) {
  // L'approvazione dell'amministratore Microsoft non è ancora stata data: messaggio chiaro invece del codice d'errore
  const consenso = errore && /AADSTS65001|AADSTS90094|consent|approv|admin/i.test(errore);
  $app.innerHTML = `
    <main><div class="accesso">
      <img src="icone/logo-insicurezza.jpg" alt="in-Sicurezza S.r.l." class="logo-accesso">
      <h1>PILOTA DVR · Sopralluoghi</h1>
      <p>Accedi con l'account Microsoft 365 dello studio. Vedrai le aziende e i documenti che vedi già in SharePoint.</p>
      ${consenso ? `<div class="avviso">L'accesso ai dati veri è in attesa dell'approvazione dell'amministratore Microsoft dello studio. Intanto puoi provare l'app con i dati di esempio.</div>`
        : errore ? `<div class="errore">${esc(errore)}</div>` : ""}
      <a class="btn esempio" href="?esempio">Prova l'app con dati di esempio</a>
      <button class="btn2" id="accedi">Accedi con Microsoft (dati veri)</button>
    </div></main>`;
  $("accedi").onclick = login;
}

function barraPrincipale() {
  const quando = S.pacchetto && !S.esempio
    ? "aggiornato " + new Date(S.pacchetto.scaricatoIl).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  return `
    <div class="barra">
      <span class="marchio"><img src="icone/marchio.png" alt=""></span>
      <span class="titolo">in-Sicurezza · PILOTA DVR</span>
      ${S.esempio ? `<span class="offline">DATI DI ESEMPIO</span>` : ""}
      ${navigator.onLine === false ? `<span class="offline">Senza rete</span>` : ""}
      <span class="info">${esc(quando)}</span>
      ${S.esempio ? `<a class="btn2" href="./?esci-esempio">Esci dall'esempio</a>`
        : `<button class="btn2" data-a="aggiorna" ${S.caricamento ? "disabled" : ""}>${S.caricamento ? "Aggiorno…" : "Aggiorna"}</button>
           <button class="btn2" data-a="esci">Esci</button>`}
    </div>`;
}

const pesoMese = m => m < 0 ? 99 : (m - new Date().getMonth() + 12) % 12;

function disegnaElenco() {
  const p = S.pacchetto, io = S.utente.username;
  const tutte = S.aziende.filter(a => a.attiva);
  const mie = p && p.haTecnico ? tutte.filter(a => a.tecnicoEmail === io) : tutte;
  const base = S.mostraTutte ? tutte : mie;
  const q = S.q.trim().toLowerCase();
  const cercate = base.filter(a => !q || (a.nome + " " + a.codice + " " + a.cartella).toLowerCase().includes(q));
  const conta = k => cercate.filter(a => k === "tutti" || a.stato === k).length;
  const elenco = cercate.filter(a => S.filtro === "tutti" || a.stato === S.filtro)
    .sort((a, b) => pesoMese(a.mese) - pesoMese(b.mese) || a.nome.localeCompare(b.nome, "it"));
  const avvisi = [];
  if (p && !p.haTecnico) avvisi.push("La lista PD_Aziende non ha ancora la colonna <b>TecnicoEmail</b>: per ora vedi tutte le aziende.");
  else if (p && !S.mostraTutte && mie.length === 0) avvisi.push("Non ci sono aziende assegnate a te. Attiva \"Mostra tutte le aziende\" per vederle tutte.");
  if (p && !p.haMese) avvisi.push("La lista PD_Aziende non ha ancora la colonna <b>MeseSopralluogo</b>: il mese del sopralluogo non viene mostrato.");
  const filtri = [["tutti", "Tutte"], ["dafare", "Da fare"], ["bozza", "Bozza"], ["fatto", "Fatto " + new Date().getFullYear()]];

  $app.innerHTML = `
    ${barraPrincipale()}
    <main>
      <div class="testa">
        <div class="cresce colonna">
          <div class="lbl">PILOTA DVR · Sopralluoghi</div>
          <h1>${S.mostraTutte ? "Tutte le aziende" : "Le mie aziende"}</h1>
          <div class="sotto">Accesso come ${esc(S.utente.name)} · ${base.length} aziende</div>
        </div>
        <label class="chk"><input type="checkbox" id="tutte" ${S.mostraTutte ? "checked" : ""}>Mostra tutte le aziende</label>
      </div>
      ${S.errore ? `<div class="errore">${esc(S.errore)}</div>` : ""}
      ${avvisi.map(t => `<div class="avviso">${t}</div>`).join("")}
      <label class="colonna"><span class="lbl">Cerca</span>
        <input type="search" id="cerca" placeholder="Nome, codice o cartella" value="${esc(S.q)}"></label>
      <div class="filtri">
        ${filtri.map(([k, t]) => `<button class="filtro ${S.filtro === k ? "on" : ""}" data-a="filtro" data-v="${k}">${t} (${conta(k)})</button>`).join("")}
      </div>
      <div class="griglia">
        ${!p ? `<div class="vuoto">${S.caricamento ? "Carico le aziende da SharePoint…" : "Nessun dato ancora scaricato."}</div>` :
          elenco.length === 0 ? `<div class="vuoto">Nessuna azienda trovata.</div>` :
          elenco.map(a => `
          <button class="card" data-a="apri-azienda" data-v="${esc(a.codice)}">
            <span class="nome">${esc(a.nome)}</span>
            <span class="det">${[a.mese >= 0 ? "sopralluogo " + MESI[a.mese] : "",
              (S.mostraTutte || !p.haTecnico) && a.tecnicoEmail ? nomeTecnico(p, a.tecnicoEmail) : "",
              "cod. " + a.codice.replace(/^0+/, "")].filter(Boolean).map(esc).join(" · ")}</span>
            <span class="chip ${a.stato}">${esc(a.testoStato)}</span>
          </button>`).join("")}
      </div>
      <div class="piede">${S.esempio ? "" : `<a href="verifica.html">Verifica colonne delle liste SharePoint</a>`}</div>
    </main>`;
  const cerca = $("cerca");
  cerca.oninput = () => { S.q = cerca.value; disegnaElenco(); const c = $("cerca"); c.focus(); c.setSelectionRange(c.value.length, c.value.length); };
  $("tutte").onchange = e => { S.mostraTutte = e.target.checked; ricorda("mostraTutte", S.mostraTutte ? "1" : "0"); disegnaElenco(); };
  window.scrollTo(0, S.scroll);
}

const TABS = [["anagrafica", "Anagrafica"], ["lavoratori", "Lavoratori"], ["attrezzature", "Attrezzature"],
  ["sostanze", "Sostanze"], ["prescrizioni", "Prescrizioni"], ["altro", "Altro"], ["note", "Note"]];

function disegnaAzienda() {
  const a = S.azienda, n = contaModifiche(S.bozza);
  const statoSop = S.bozza ? "sopralluogo in corso (" + S.bozza.idSopralluogo + ")" : a.testoStato;
  let corpo;
  if (!S.dettaglio) corpo = `<div class="box">${S.caricamentoAz ? "Carico i dati dell'azienda da SharePoint…" : esc(S.erroreAz || "Nessun dato.")}</div>`;
  else if (S.tab === "invia") corpo = vistaInvia();
  else if (S.tab === "lavoratori" && S.lavSel) corpo = vistaLavoratore();
  else if (S.tab === "sostanze" && S.valSos) corpo = vistaMovarisch();
  else corpo = ({ anagrafica: vistaAnagrafica, lavoratori: vistaLavoratori, attrezzature: vistaAttrezzature,
    sostanze: vistaSostanze, prescrizioni: vistaPrescrizioni, altro: vistaAltro, note: vistaNote })[S.tab]();
  $app.innerHTML = `
    <div class="barra azienda-barra">
      <span class="marchio"><img src="icone/marchio.png" alt=""></span>
      <button class="btn2" data-a="indietro-aziende">‹ Aziende</button>
      <div class="cresce" style="min-width:0">
        <div class="titolo-az">${esc(a.nome)}</div>
        <div class="info">cod. ${esc(a.codice.replace(/^0+/, ""))} · ${esc(statoSop)}${S.esempio ? " · DATI DI ESEMPIO" : ""}</div>
      </div>
      <button class="btn invia" data-a="tab" data-v="invia" ${n ? "" : "disabled"}>Invia sopralluogo (${n})</button>
    </div>
    <nav class="tabs">${TABS.map(([k, t]) => `<button class="tab ${S.tab === k ? "on" : ""}" data-a="tab" data-v="${k}">${t}</button>`).join("")}</nav>
    <main>
      ${S.caricamentoAz && S.dettaglio ? `<div class="avviso">Aggiorno i dati da SharePoint…</div>` : ""}
      ${S.erroreAz && S.dettaglio ? `<div class="avviso">${esc(S.erroreAz)}</div>` : ""}
      ${corpo}
    </main>`;
  caricaMiniature();
  if (S.tab === "invia") attivaFirma();
}

// ---- Anagrafica ----
function vistaAnagrafica() {
  const A = S.dettaglio.anagrafica, L = lavoratori().filter(l => !l.cessato);
  const campi = [["Ragione sociale", S.azienda.nome], ["Sede legale", A.sedeLegale], ["Sede operativa", A.sedeOperativa],
    ["Partita IVA", A.partitaIva], ["Email", A.email], ["Telefono", [A.telefono, A.cellulare].filter(Boolean).join(" · ")],
    ["Datore di lavoro", A.datoreLavoro], ["RSPP", A.rspp], ["Medico competente", A.medicoCompetente],
    ["RLS", A.rls], ["Preposti", L.filter(l => l.preposto).map(l => l.nome).join(", ") || A.preposti],
    ["Cartella SharePoint", S.azienda.cartella]];
  const chips = (k, cl) => L.filter(l => l[k]).map(l => `<span class="chip ${cl}">${esc(l.nome)}</span>`).join("") || `<span class="sotto">nessuno</span>`;
  return `
    <div class="riga-titolo">
      <h2>Anagrafica e figure</h2>
      <button class="btn" data-a="avvia-sopralluogo">${S.bozza ? "Continua sopralluogo ›" : "Nuovo sopralluogo ›"}</button>
    </div>
    <div class="griglia3">${campi.map(([k, v]) => `<div class="campo"><span class="lbl">${k}</span><span>${esc(v || "—")}</span></div>`).join("")}</div>
    <div class="griglia" style="margin-top:12px">
      <div class="box colonna"><span class="lbl">Addetti antincendio (scelti dai lavoratori)</span><div class="chips">${chips("addettoAI", "ai")}</div></div>
      <div class="box colonna"><span class="lbl">Addetti primo soccorso (scelti dai lavoratori)</span><div class="chips">${chips("addettoPS", "ps")}</div></div>
    </div>
    <div style="margin-top:12px">
      <button class="btn2" data-a="pannello" data-v="ruoli">${S.pannello === "ruoli" ? "Chiudi" : "Scegli addetti e preposti"}</button>
    </div>
    ${S.pannello === "ruoli" ? `
    <div class="box colonna" style="margin-top:12px">
      <span class="lbl">Tocca per assegnare o togliere un ruolo</span>
      ${L.map(l => `<div class="riga">
        <span class="cresce"><b>${esc(l.nome)}</b> <span class="sotto">${esc(l.mansioni.join(", "))}</span></span>
        ${[["addettoAI", "Antincendio", "ai"], ["addettoPS", "Primo soccorso", "ps"], ["preposto", "Preposto", "alt"]].map(([k, t, cl]) =>
          `<button class="scelta ${l[k] ? "on " + cl : ""}" data-a="ruolo" data-v="${esc(l.id)}" data-r="${k}">${t}</button>`).join("")}
      </div>`).join("")}
    </div>` : ""}`;
}

// ---- Lavoratori ----
function vistaLavoratori() {
  const L = lavoratori(), M = S.dettaglio.mansioni;
  return `
    <div class="riga-titolo">
      <h2>Lavoratori (${L.filter(l => !l.cessato).length})</h2>
      <button class="btn2" data-a="pannello" data-v="nuovo-lav">${S.pannello === "nuovo-lav" ? "Chiudi" : "+ Nuovo lavoratore"}</button>
    </div>
    ${S.pannello === "nuovo-lav" ? `
    <div class="box modulo">
      <label class="colonna"><span class="lbl">Nome e cognome</span><input type="text" id="f-nome" autocomplete="off"></label>
      <label class="colonna"><span class="lbl">Reparto</span><input type="text" id="f-reparto" autocomplete="off"></label>
      <label class="colonna"><span class="lbl">Data di assunzione</span><input type="date" id="f-ingresso" value="${iso(oggi())}"></label>
      <div class="colonna intero"><span class="lbl">Mansioni (una o più)</span>${sceltaMultipla("f-mans", M, [])}</div>
      <label class="chk intero"><input type="checkbox" id="f-corsi" checked>Aggiungi i corsi base da fare (formazione generale e specifica)</label>
      <div class="intero"><button class="btn" data-a="salva-lav">Aggiungi lavoratore</button></div>
    </div>` : ""}
    <div class="colonna">
      ${L.map(l => `
      <div class="riga ${l.cessato ? "spento" : ""}">
        <button class="apri" data-a="apri-lav" data-v="${esc(l.id)}">
          <span class="nome-riga">${esc(l.nome)}</span>
          <span class="chips">
            ${l.mansioni.map(m => `<span class="chip mans">${esc(m)}</span>`).join("")}
            ${l.nuovo ? `<span class="chip nuovo">NUOVO</span>` : ""}
            ${l.mansioniCambiate ? `<span class="chip bozza">MANSIONI CAMBIATE</span>` : ""}
            ${l.cessato ? `<span class="chip scaduto">CESSATO</span>` : ""}
          </span>
        </button>
        <span class="sotto nowrap">${corsiDi(l.nome).length} corsi</span>
        ${l.nuovo ? `<button class="btn2 piccolo" data-a="togli-lav" data-v="${esc(l.id)}">Togli</button>`
          : `<label class="chk"><input type="checkbox" data-a="cessato" data-v="${esc(l.id)}" ${l.cessato ? "checked" : ""}>Cessato</label>`}
        <span class="freccia" aria-hidden="true">›</span>
      </div>`).join("") || `<div class="vuoto">Nessun lavoratore.</div>`}
    </div>`;
}

function sceltaMultipla(nome, opzioni, scelte) {
  return `<div class="chips">${opzioni.map(o => `<label class="scelta-chk"><input type="checkbox" name="${nome}" value="${esc(o)}" ${scelte.includes(o) ? "checked" : ""}><span>${esc(o)}</span></label>`).join("")}</div>`;
}
const valoriScelti = nome => [...document.querySelectorAll(`input[name="${nome}"]:checked`)].map(i => i.value);

function vistaLavoratore() {
  const l = lavoratori().find(x => x.id === S.lavSel);
  if (!l) { S.lavSel = null; return vistaLavoratori(); }
  const M = S.dettaglio.mansioni, gruppi = gruppiCorsi(l.nome);
  return `
    <div class="riga-titolo">
      <button class="btn2" data-a="indietro-lav">‹ Lavoratori</button>
      <h2 class="cresce">${esc(l.nome)}</h2>
      ${l.nuovo ? `<span class="chip nuovo">NUOVO</span>` : `<label class="chk"><input type="checkbox" data-a="cessato" data-v="${esc(l.id)}" ${l.cessato ? "checked" : ""}>Cessato</label>`}
    </div>
    <div class="box colonna">
      <span class="lbl">Mansioni (tocca per aggiungere o togliere)</span>
      <div class="chips">${M.map(m => `<button class="scelta ${l.mansioni.includes(m) ? "on" : ""}" data-a="mansione" data-v="${esc(l.id)}" data-m="${esc(m)}">${esc(m)}</button>`).join("")}</div>
      <span class="sotto">${esc([l.reparto, l.dataIngresso ? "in azienda dal " + fmt(l.dataIngresso) : ""].filter(Boolean).join(" · "))}</span>
    </div>
    <div class="riga-titolo" style="margin-top:16px">
      <h3>Corsi</h3>
      <button class="btn" data-a="pannello" data-v="corso">${S.pannello === "corso" ? "Chiudi" : "+ Corso (fatto o da fare)"}</button>
    </div>
    ${S.pannello === "corso" ? `
    <div class="box modulo evidenza">
      <label class="colonna intero"><span class="lbl">Corso dal catalogo</span>
        <select id="f-corso">${S.dettaglio.catalogoCorsi.map(c => `<option>${esc(c.nome)}</option>`).join("")}</select></label>
      <label class="colonna"><span class="lbl">Data del corso</span><input type="date" id="f-data"></label>
      <label class="chk"><input type="checkbox" id="f-dafare">Da fare (senza data)</label>
      <div class="intero"><button class="btn" data-a="salva-corso" data-v="${esc(l.nome)}">Aggiungi corso</button></div>
    </div>` : ""}
    ${gruppi.map(g => `
      <div class="gruppo">
        <div class="titolo-gruppo"><span class="pallino" style="background:${COLORI[g.f]}"></span><span class="lbl">${g.titolo}</span></div>
        ${g.corsi.map(c => `
        <div class="corso ${c.superato ? "spento" : ""}" style="background:${COLORI[g.f]}">
          <span class="cresce"><b>${esc(c.corso)}</b>${c.nuovo ? ` <span class="chip nuovo">NUOVO</span>` : ""}</span>
          <span class="data-corso">${esc(c.dataTesto)}</span>
          <span class="scad ${c.classe}">${esc(c.testo)}</span>
        </div>`).join("")}
      </div>`).join("") || `<div class="vuoto">Nessun corso registrato.</div>`}`;
}

// ---- Attrezzature ----
function vistaAttrezzature() {
  const A = attrezzature(), M = S.dettaglio.mansioni.concat(S.dettaglio.mansioni.includes("Datore di lavoro") ? [] : ["Datore di lavoro"]);
  return `
    <div class="riga-titolo">
      <h2>Attrezzature (${A.filter(a => !a.dismessa).length})</h2>
      <button class="btn2" data-a="pannello" data-v="nuova-att">${S.pannello === "nuova-att" ? "Chiudi" : "+ Nuova attrezzatura"}</button>
    </div>
    ${S.pannello === "nuova-att" ? `
    <div class="box modulo">
      <label class="colonna"><span class="lbl">Attrezzatura</span><input type="text" id="f-nome" autocomplete="off"></label>
      <label class="colonna"><span class="lbl">Marca e modello</span><input type="text" id="f-marca" autocomplete="off"></label>
      <div class="colonna intero"><span class="lbl">Chi la usa</span>${sceltaMultipla("f-mans", M, [])}</div>
      <div class="intero"><button class="btn" data-a="salva-att">Aggiungi attrezzatura</button></div>
    </div>` : ""}
    <div class="colonna">
      ${A.map(a => `
      <div class="riga ${a.dismessa ? "spento" : ""}">
        <div class="cresce colonna">
          <span class="nome-riga">${esc(a.nome)} <span class="sotto">– ${esc(a.marca || "")}</span></span>
          <span class="chips">${a.mansioni.map(m => `<span class="chip mans">${esc(m)}</span>`).join("")}${a.nuova ? `<span class="chip nuovo">NUOVA</span>` : ""}</span>
        </div>
        ${a.nuova ? `<button class="btn2 piccolo" data-a="togli-att" data-v="${esc(a.id)}">Togli</button>`
          : `<label class="chk"><input type="checkbox" data-a="dismessa" data-v="${esc(a.id)}" ${a.dismessa ? "checked" : ""}>Dismessa</label>`}
      </div>`).join("") || `<div class="vuoto">Nessuna attrezzatura.</div>`}
    </div>`;
}

// ---- Sostanze ----
function vistaSostanze() {
  const X = sostanze(), M = S.dettaglio.mansioni;
  return `
    <div class="riga-titolo">
      <h2>Sostanze (${X.filter(s => !s.eliminata).length})</h2>
      <button class="btn2" data-a="pannello" data-v="nuova-sos">${S.pannello === "nuova-sos" ? "Chiudi" : "+ Nuova sostanza"}</button>
    </div>
    ${S.pannello === "nuova-sos" ? `
    <div class="box modulo">
      <label class="colonna"><span class="lbl">Nome commerciale</span><input type="text" id="f-nome" autocomplete="off"></label>
      <label class="colonna"><span class="lbl">Produttore</span><input type="text" id="f-prod" autocomplete="off"></label>
      <label class="colonna"><span class="lbl">Stato fisico</span><select id="f-stato">${["Liquido", "Solido", "Polvere", "Granulare", "Aerosol", "Gas", "Nebbia", "Fumi"].map(o => `<option>${o}</option>`).join("")}</select></label>
      <label class="colonna"><span class="lbl">Frasi H (separate da spazio)</span><input type="text" id="f-h" placeholder="H225 H304" autocomplete="off"></label>
      <div class="colonna intero"><span class="lbl">Chi la usa</span>${sceltaMultipla("f-mans", M, [])}</div>
      <label class="colonna intero evidenza-sds"><span class="lbl">1. Carica la scheda di sicurezza (PDF): l'app legge nome, produttore, frasi H e stato fisico</span><input type="file" id="f-sds" accept="application/pdf"></label>
      <div class="intero" id="f-sds-esito"></div>
      <div class="intero"><button class="btn" data-a="salva-sos">Aggiungi sostanza</button></div>
    </div>` : ""}
    <div class="colonna">
      ${X.map(s => `
      <div class="riga alto ${s.eliminata ? "spento" : ""}">
        <div class="cresce colonna">
          <span class="nome-riga">${esc(s.nome)} <span class="sotto">· ${esc(s.statoFisico || "")}${s.produttore ? " · " + esc(s.produttore) : ""}</span></span>
          <span class="chips">${s.frasiH.map(h => `<span class="chip acca">${esc(h)}</span>`).join("")}${s.nuova ? `<span class="chip nuovo">NUOVA</span>` : ""}</span>
          <span class="sotto">${s.sds ? "SDS presente" + (s.revisione ? " · revisione " + esc(s.revisione) : "") : "SDS mancante: da chiedere al fornitore"}${s.aggiornata ? " · <b>dati aggiornati dalla nuova SDS</b>" : ""}</span>
        </div>
        <div class="colonna destra">
          ${(e => e ? `<span class="chip classe${e.n}">MoVaRisCh: ${esc(e.testo)}</span>` : `<span class="chip bozza">MoVaRisCh: da valutare</span>`)(esitoSostanza(s))}
          ${s.eliminata ? "" : `<button class="btn2 piccolo" data-a="apri-mov" data-v="${esc(s.id)}">Valutazione MoVaRisCh</button>`}
          ${s.eliminata || s.nuova ? "" : `<label class="btn2 piccolo file">${s.sds ? "Aggiorna SDS" : "Carica SDS"}<input type="file" accept="application/pdf" data-sds-sos="${esc(s.id)}" hidden></label>`}
          ${s.nuova ? `<button class="btn2 piccolo" data-a="togli-sos" data-v="${esc(s.id)}">Togli</button>`
            : `<label class="chk"><input type="checkbox" data-a="sos-elimina" data-v="${esc(s.id)}" ${s.eliminata ? "checked" : ""}>Non più usata</label>`}
        </div>
      </div>`).join("") || `<div class="vuoto">Nessuna sostanza.</div>`}
    </div>`;
}

// ---- Valutazione MoVaRisCh di una sostanza ----
function risultatoHtml(r) {
  if (!r.completa) return `<span class="sotto">Compila i parametri per vedere il risultato.</span>`;
  return `<div class="risultato classe${r.classe.n}">
    <div><span class="lbl">R inalatorio</span><b>${r.rInal ?? "—"}</b></div>
    <div><span class="lbl">R cutaneo</span><b>${r.rCute ?? "—"}</b></div>
    <div><span class="lbl">R cumulativo</span><b class="grande">${r.r}</b></div>
    <div class="cresce"><span class="lbl">Esito</span><b>${r.classe.n} – ${esc(r.classe.testo)}</b><span>Priorità: ${esc(r.classe.priorita)}</span></div>
  </div>`;
}
function vistaMovarisch() {
  const sost = sostanze().find(x => x.id === S.valSos);
  if (!sost) { S.valSos = null; return vistaSostanze(); }
  const P = pericolo(sost.frasiH), V = valutazioniSostanza(sost);
  const mansioni = [...new Set([...sost.mansioni, ...Object.keys(V), ...S.valMansExtra])];
  const altre = S.dettaglio.mansioni.filter(m => !mansioni.includes(m));
  const sel = (m, k, val) => `<label class="colonna"><span class="lbl">${SCALE[k].titolo}</span>
    <select data-mv="${k}"><option value="">— scegli —</option>${SCALE[k].voci.map(([t]) => `<option ${val === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
  return `
    <div class="riga-titolo">
      <button class="btn2" data-a="chiudi-mov">‹ Sostanze</button>
      <h2 class="cresce">MoVaRisCh · ${esc(sost.nome)}</h2>
    </div>
    <div class="box colonna">
      <span class="chips">${sost.frasiH.map(h => `<span class="chip acca">${esc(h)}</span>`).join("") || `<span class="sotto">Nessuna frase H indicata</span>`}</span>
      <span>Pericolosità <b>P = ${P.p}</b> (punteggio più alto tra le frasi H) · ${esc(sost.statoFisico || "stato fisico non indicato")}</span>
      <div class="riga-sottile"><label class="colonna cresce"><span class="lbl">Correggi frasi H (dalla scheda di sicurezza)</span>
        <input type="text" id="f-frasi-mov" value="${esc(sost.frasiH.join(" "))}" placeholder="H225 H319"></label>
        <button class="btn2 piccolo" data-a="salva-frasi-mov">Salva frasi H</button></div>
      ${P.capoII.length ? `<div class="errore">Contiene ${esc(P.capoII.join(", "))}: sostanza cancerogena, mutagena o tossica per la riproduzione (Titolo IX Capo II). Non si valuta con MoVaRisCh.</div>` : ""}
      ${P.sconosciute.length ? `<span class="sotto">Frasi non riconosciute (non contano nel calcolo): ${esc(P.sconosciute.join(", "))}</span>` : ""}
      ${P.dpi.length ? `<span class="sotto">DPI indicati dalle frasi H: ${esc(P.dpi.join(", "))}</span>` : ""}
    </div>
    ${mansioni.map(m => {
      const v = V[m] || {}, r = calcola(sost.frasiH, v);
      return `
      <div class="box colonna mov" data-mans="${esc(m)}">
        <div class="riga-titolo" style="margin:0">
          <h3>${esc(m)}</h3>
          ${V[m] ? `<span class="chip ${V[m].origine === "bozza" ? "nuovo" : "fatto"}">${V[m].origine === "bozza" ? "valutata in questo sopralluogo" : "valutazione del " + esc(fmt(V[m].data))}</span>` : `<span class="chip bozza">da valutare</span>`}
        </div>
        <div class="modulo">${["cf", "q", "u", "c", "t", "d", "k"].map(k => sel(m, k, (trovaVoce(k, v[k]) || [])[0])).join("")}</div>
        <div class="esito-mov">${risultatoHtml(r)}</div>
        ${mansioni.length > 1 || altre.length ? `<div class="colonna"><span class="lbl">Applica anche a (stesse scelte)</span>
          ${sceltaMultipla("applica-" + m, S.dettaglio.mansioni.filter(x => x !== m), [])}</div>` : ""}
        <div><button class="btn" data-a="salva-mov" data-v="${esc(m)}">Salva valutazione</button></div>
      </div>`;
    }).join("") || `<div class="vuoto">Nessuna mansione usa questa sostanza: aggiungine una qui sotto.</div>`}
    ${altre.length ? `<div class="box riga-sottile"><span class="cresce">Valuta anche per un'altra mansione</span>
      <select id="f-altra-mans" style="max-width:320px">${altre.map(m => `<option>${esc(m)}</option>`).join("")}</select>
      <button class="btn2 piccolo" data-a="aggiungi-mans-mov">Aggiungi</button></div>` : ""}`;
}
const valoriMov = card => Object.fromEntries([...card.querySelectorAll("[data-mv]")].map(x => [x.dataset.mv, x.value]));

// ---- Prescrizioni ----
function miniature(nomi, nuove) {
  return `<div class="foto">
    ${nomi.map(n => `<div class="mini" data-foto-sp="${esc(n)}"><span>foto</span></div>`).join("")}
    ${nuove.map(id => `<div class="mini nuova" data-foto-id="${esc(id)}"><span>nuova</span></div>`).join("")}
  </div>`;
}
function vistaPrescrizioni() {
  const P = prescrizioni(), cat = S.dettaglio.catalogoPrescrizioni;
  const zone = [...new Set(cat.map(c => c.zona).filter(Boolean).concat(P.map(p => p.zona).filter(Boolean)))].sort();
  return `
    <div class="riga-titolo">
      <h2>Prescrizioni aperte (${P.filter(p => !p.risolta).length})</h2>
      <button class="btn2" data-a="pannello" data-v="nuova-pre">${S.pannello === "nuova-pre" ? "Chiudi" : "+ Nuova prescrizione"}</button>
    </div>
    ${S.pannello === "nuova-pre" ? `
    <div class="box modulo">
      <label class="colonna"><span class="lbl">Zona</span><input type="text" id="f-zona" list="zone" autocomplete="off">
        <datalist id="zone">${zone.map(z => `<option value="${esc(z)}">`).join("")}</datalist></label>
      <label class="colonna"><span class="lbl">Dal catalogo</span><select id="f-cat"><option value="">— scrivi il testo sotto —</option>
        ${cat.map((c, i) => `<option value="${i}">${esc((c.zona ? c.zona + ": " : "") + c.testo)}</option>`).join("")}</select></label>
      <label class="colonna intero"><span class="lbl">Testo della prescrizione</span><textarea id="f-testo" rows="3"></textarea></label>
      <label class="colonna intero"><span class="lbl">Foto</span><input type="file" id="f-foto" accept="image/*" capture="environment" multiple></label>
      <div class="intero"><button class="btn" data-a="salva-pre">Aggiungi prescrizione</button></div>
    </div>` : ""}
    <div class="colonna">
      ${P.map(p => `
      <div class="riga alto ${p.risolta ? "risolta" : ""}">
        <div class="cresce colonna">
          <span><b>${esc(p.zona || "Generale")}</b> – ${esc(p.testo)} ${p.nuova ? `<span class="chip nuovo">NUOVA</span>` : ""}</span>
          <span class="sotto">${p.nuova ? "aperta oggi" : "aperta il " + esc(fmt(p.dataApertura))} · ${p.foto.length + p.fotoNuove.length} foto</span>
          ${p.foto.length + p.fotoNuove.length ? miniature(p.foto, p.fotoNuove) : ""}
        </div>
        <div class="colonna destra">
          ${p.nuova ? `<button class="btn2 piccolo" data-a="togli-pre" data-v="${esc(p.id)}">Togli</button>`
            : `<button class="btn ${p.risolta ? "verde" : ""}" data-a="risolta" data-v="${esc(p.id)}">${p.risolta ? "Risolta ✓ · Riapri" : "Segna risolta"}</button>`}
          ${p.nuova ? "" : `<label class="btn2 file">+ Foto<input type="file" accept="image/*" capture="environment" data-foto-pre="${esc(p.id)}" hidden></label>`}
        </div>
      </div>`).join("") || `<div class="vuoto">Nessuna prescrizione aperta.</div>`}
    </div>`;
}

// ---- Altro ----
function vistaAltro() {
  const sc = scadenzeEntroAnno(), I = impianto(), X = sostanze().filter(s => !s.eliminata);
  const terra = data(I.terraData), anni = /5/.test(I.terraPeriodicita) ? 5 : 2;
  const prossima = terra ? new Date(terra.getFullYear() + anni, terra.getMonth(), terra.getDate()) : null;
  const statoTerra = !terra ? ["bozza", "Verifica di messa a terra non registrata"]
    : prossima < oggi() ? ["scaduto", "Verifica scaduta il " + fmt(prossima)] : ["fatto", "Prossima verifica entro il " + fmt(prossima)];
  const media = (S.bozza && S.bozza.media) || [];
  const v = k => esc(I[k] ? (/Data$/.test(k) ? iso(data(I[k]) || new Date(I[k])) : I[k]) : "");
  return `
    <div class="griglia">
      <div class="box colonna">
        <h3>Corsi in scadenza entro un anno</h3>
        <span class="sotto">Dalla data del sopralluogo (${esc(fmt(dataSopralluogo()))}) al ${esc(fmt(piuGiorni(dataSopralluogo(), 365)))}</span>
        ${sc.map(x => `<div class="riga-sottile"><span class="cresce"><b>${esc(x.lav)}</b> – ${esc(x.corso)}</span><span class="scad ${x.classe}">${esc(x.quando)}</span></div>`).join("")
          || `<span class="sotto">Nessun corso in scadenza.</span>`}
      </div>
      <div class="box colonna">
        <h3>Impianto elettrico</h3>
        <div class="modulo stretto">
          <label class="colonna"><span class="lbl">Dichiarazione di conformità</span>
            <select data-imp="dicoPresente">${["", "Sì", "No"].map(o => `<option ${I.dicoPresente === o ? "selected" : ""}>${o}</option>`).join("")}</select></label>
          <label class="colonna"><span class="lbl">Data dichiarazione</span><input type="date" data-imp="dicoData" value="${v("dicoData")}"></label>
          <label class="colonna intero"><span class="lbl">Ditta dichiarante</span><input type="text" data-imp="dicoDitta" value="${v("dicoDitta")}"></label>
          <label class="colonna"><span class="lbl">Ultima verifica messa a terra</span><input type="date" data-imp="terraData" value="${v("terraData")}"></label>
          <label class="colonna"><span class="lbl">Periodicità</span>
            <select data-imp="terraPeriodicita">${["2 anni", "5 anni"].map(o => `<option ${I.terraPeriodicita === o ? "selected" : ""}>${o}</option>`).join("")}</select></label>
          <label class="colonna intero"><span class="lbl">Organismo di verifica</span><input type="text" data-imp="terraOrganismo" value="${v("terraOrganismo")}"></label>
        </div>
        <span class="chip ${statoTerra[0]}">${statoTerra[1]}</span>
        ${[["dico", "Dichiarazione di conformità"], ["terra", "Verbale verifica messa a terra"]].map(([k, t]) => {
          const docs = ((S.bozza && S.bozza.impiantoDoc) || { dico: [], terra: [] })[k];
          return `<div class="riga-sottile"><span class="cresce">${t}${docs.length ? ` · <b>${docs.length} caricat${docs.length > 1 ? "i" : "o"}</b>` : ""}</span>
            <label class="btn2 piccolo file">Carica (PDF o foto)<input type="file" accept="application/pdf,image/*" capture="environment" data-imp-doc="${k}" hidden multiple></label></div>`;
        }).join("")}
      </div>
      <div class="box colonna">
        <h3>Schede di sicurezza (SDS)</h3>
        <span class="sotto">${X.filter(s => s.sds).length} presenti · ${X.filter(s => !s.sds).length} mancanti · ${X.filter(s => !esitoSostanza(s)).length} da valutare con MoVaRisCh</span>
        <button class="btn2" data-a="tab" data-v="sostanze">Apri sostanze</button>
      </div>
      <div class="box colonna">
        <h3>Foto e video del sopralluogo</h3>
        <span class="sotto">Salvati nella cartella del cliente, sottocartella "Media gg-mm-aaaa".</span>
        ${media.length ? miniature([], media) : ""}
        <label class="btn2 file">Scatta foto o video<input type="file" accept="image/*,video/*" capture="environment" data-foto-media="1" hidden multiple></label>
        <button class="btn2" data-a="tab" data-v="note">Scrivi le note del sopralluogo</button>
      </div>
    </div>`;
}

// ---- Note ----
function vistaNote() {
  return `
    <div class="riga-titolo"><h2>Note del sopralluogo</h2><span class="sotto">Si salvano da sole quando tocchi fuori dal riquadro</span></div>
    <textarea id="f-note" class="note-grandi" placeholder="Scrivi qui tutto quello che serve: osservazioni, cose da fare, richieste del cliente…">${esc((S.bozza && S.bozza.note) || "")}</textarea>`;
}

// ---- Ricevuta di sopralluogo (stesse voci del modello Word dello studio) ----
const VOCI_RICEVUTA = [["analisi", "analisi aziendale e del processo produttivo"], ["documentazione", "analisi documentazione tecnica"],
  ["dvr", "ritiro DVR esistente per aggiornamento"], ["attestati", "ritiro attestati corsi svolti"]];
function ricevuta() { return (S.bozza && S.bozza.ricevuta) || bozzaVuota("", "").ricevuta; }
function vistaRicevuta() {
  const R = ricevuta(), A = S.dettaglio.anagrafica;
  return `
    <div class="box colonna" style="margin-top:16px">
      <h3>Ricevuta di sopralluogo per il cliente</h3>
      <span class="sotto">Spunta le attività svolte e fai firmare il cliente sul tablet.</span>
      ${VOCI_RICEVUTA.map(([k, t]) => `<label class="chk"><input type="checkbox" data-ric-voce="${k}" ${R.voci[k] ? "checked" : ""}>${t}</label>`).join("")}
      <div class="modulo stretto">
        <label class="colonna"><span class="lbl">N° misurazioni fonometriche</span><input type="text" inputmode="numeric" data-ric="fonometriche" value="${esc(R.fonometriche)}"></label>
        <label class="colonna"><span class="lbl">N° misurazioni accelerometriche</span><input type="text" inputmode="numeric" data-ric="accelerometriche" value="${esc(R.accelerometriche)}"></label>
        <label class="colonna intero"><span class="lbl">Altro</span><input type="text" data-ric="altro" value="${esc(R.altro)}"></label>
        <label class="colonna"><span class="lbl">Tempo totale: ore</span><input type="text" inputmode="numeric" data-ric="ore" value="${esc(R.ore)}"></label>
        <label class="colonna"><span class="lbl">minuti</span><input type="text" inputmode="numeric" data-ric="minuti" value="${esc(R.minuti)}"></label>
        <label class="colonna intero"><span class="lbl">Email del cliente per l'invio</span><input type="email" data-ric="email" value="${esc(R.email || A.email || "")}"></label>
      </div>
      <span class="lbl">Firma del cliente per ricevuta</span>
      <canvas id="firma" class="firma" width="900" height="260"></canvas>
      <div class="chips">
        <button class="btn2 piccolo" data-a="cancella-firma">Cancella firma</button>
        <button class="btn2 piccolo" data-a="anteprima-ricevuta">${S.anteprima ? "Chiudi anteprima" : "Anteprima ricevuta"}</button>
      </div>
      ${S.anteprima ? letteraRicevuta() : ""}
    </div>`;
}
function letteraRicevuta() {
  const R = ricevuta(), A = S.dettaglio.anagrafica, q = b => (b ? "☒" : "☐");
  const giorno = new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  return `
    <div class="lettera" id="lettera">
      <img src="icone/logo-insicurezza.jpg" alt="in-Sicurezza S.r.l." class="logo-lettera">
      <div class="destinatario">Spett.le<br><b>${esc(S.azienda.nome)}</b><br>${esc(A.sedeLegale || "")}</div>
      <p>${esc(giorno)}</p>
      <p><b>OGGETTO: Ricevuta di sopralluogo</b></p>
      <p>In data odierna, è stato svolto il sopralluogo tecnico presso la vostra sede, durante il quale si è provveduto ad effettuare:</p>
      <p class="voci">${VOCI_RICEVUTA.map(([k, t]) => `${q(R.voci[k])} ${t}`).join("<br>")}<br>
        ${q(R.fonometriche)} n° ${esc(R.fonometriche || "___")} misurazioni fonometriche<br>
        ${q(R.accelerometriche)} n° ${esc(R.accelerometriche || "___")} misurazioni accelerometriche<br>
        ${q(R.altro)} altro: ${esc(R.altro || "______________________")}<br>
        ${q(R.ore || R.minuti)} tempo totale: ${esc(R.ore || "__")} ore ${esc(R.minuti || "__")} minuti</p>
      <p>Firma per ricevuta</p>
      ${R.firma ? `<img src="${R.firma}" alt="Firma del cliente" class="firma-lettera">` : "<p>__________________________</p>"}
      <p class="sotto">Tecnico: ${esc((S.bozza && S.bozza.tecnico) || S.utente.name)}</p>
    </div>
    <button class="btn2 piccolo" data-a="stampa-ricevuta">Stampa o salva in PDF</button>`;
}

// Firma con il dito sul tablet
function attivaFirma() {
  const c = $("firma"); if (!c) return;
  const ctx = c.getContext("2d"), R = ricevuta();
  ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.strokeStyle = "#1B2433";
  if (R.firma) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0); img.src = R.firma; }
  let giu = false, segnato = false;
  const pos = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
  c.onpointerdown = e => { giu = true; c.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pos(e)); e.preventDefault(); };
  c.onpointermove = e => { if (!giu) return; ctx.lineTo(...pos(e)); ctx.stroke(); segnato = true; e.preventDefault(); };
  c.onpointerup = () => { if (!giu) return; giu = false; if (segnato) modifica(b => { b.ricevuta.firma = c.toDataURL("image/png"); }); };
}

// ---- Invia ----
function vistaInvia() {
  if (S.inviato) return `
    <div class="box invio colonna">
      <h2>Sopralluogo inviato</h2>
      <div class="ok-box">${S.esempio ? "Esempio: nella versione vera i dati vanno nelle liste SharePoint e il motore aggiorna Valutazione, DVR e Prescrizioni." : "Dati inviati a SharePoint. Il motore aggiornerà Valutazione, DVR e Prescrizioni."}</div>
      <button class="btn2" data-a="indietro-aziende">Torna alle aziende</button>
    </div>`;
  const r = riepilogo(S.bozza);
  return `
    <div class="box invio colonna">
      <h2>Invia sopralluogo</h2>
      <span class="sotto">${esc(S.bozza ? S.bozza.idSopralluogo + " · tecnico " + S.bozza.tecnico : "")}</span>
      ${r.length ? r.map(([k, v]) => `<div class="riga-sottile"><span class="cresce">${esc(k)}</span><b>${esc(v)}</b></div>`).join("") : `<span class="sotto">Nessuna modifica.</span>`}
      ${vistaRicevuta()}
      <div class="avviso">All'invio l'app salverà nella cartella del cliente il riepilogo del sopralluogo e la ricevuta firmata, e li manderà per email al cliente.${S.esempio ? " (Nell'esempio non viene inviato nulla.)" : ""}</div>
      ${S.esempio ? "" : `<div class="avviso">L'invio ai dati veri si attiva dopo la prova sull'azienda BAR-BON con il motore. Intanto la bozza resta salvata sul tablet.</div>`}
      <div class="chips">
        <button class="btn" data-a="invia-conferma" ${S.esempio && r.length ? "" : "disabled"}>Conferma e invia</button>
        <button class="btn2" data-a="tab" data-v="lavoratori">Torna al sopralluogo</button>
        <button class="btn2" data-a="annulla-bozza">Annulla il sopralluogo</button>
      </div>
    </div>`;
}

// Nuova sostanza: compila il modulo leggendo la SDS
async function compilaDaSDS(file) {
  const out = $("f-sds-esito");
  out.innerHTML = `<span class="sotto">Leggo la scheda di sicurezza…</span>`;
  const r = await leggiSDS(file);
  if (!r.letto) { out.innerHTML = `<div class="avviso">Non riesco a leggere il testo di questa SDS (forse è una scansione). Compila tu i campi: la SDS viene comunque salvata.</div>`; return; }
  if (r.nome && !$("f-nome").value) $("f-nome").value = r.nome;
  if (r.produttore && !$("f-prod").value) $("f-prod").value = r.produttore;
  if (r.statoFisico) $("f-stato").value = r.statoFisico;
  if (r.frasiH.length) $("f-h").value = r.frasiH.join(" ");
  S.sdsLetta = r;
  out.innerHTML = `<div class="ok-box">Letti dalla SDS: ${r.frasiH.length ? r.frasiH.map(esc).join(" ") : "nessuna frase H"}${r.statoFisico ? " · " + esc(r.statoFisico) : ""}${r.revisione ? " · revisione " + esc(r.revisione) : ""}. Controlla i campi qui sopra.</div>`;
}

// ---------- Miniature delle foto ----------
async function caricaMiniature() {
  for (const el of document.querySelectorAll("[data-foto-id]")) {
    const id = el.dataset.fotoId;
    if (!S.fotoUrl[id]) {
      const f = await leggiFoto(id).catch(() => null);
      if (f && f.blob) S.fotoUrl[id] = { url: URL.createObjectURL(f.blob), video: (f.tipo || "").startsWith("video") };
    }
    mostra(el, S.fotoUrl[id]);
  }
  for (const el of document.querySelectorAll("[data-foto-sp]")) {
    const nome = el.dataset.fotoSp;
    if (S.esempio || navigator.onLine === false) continue;
    const k = "sp:" + S.azienda.codice + ":" + nome;
    if (!S.fotoUrl[k]) {
      try { S.fotoUrl[k] = { url: URL.createObjectURL(await scaricaFoto(S.azienda.cartella, nome)) }; }
      catch (_) { S.fotoUrl[k] = { errore: true }; }
    }
    mostra(el, S.fotoUrl[k]);
  }
}
function mostra(el, f) {
  if (!f || f.errore || !el.isConnected) return;
  el.innerHTML = f.video ? `<video src="${f.url}" muted playsinline></video>` : `<img src="${f.url}" alt="Foto">`;
}

// ---------- Azioni ----------
const azioni = {
  "aggiorna": () => aggiorna(),
  "esci": () => logout(),
  "filtro": v => { S.filtro = v; disegnaElenco(); },
  "apri-azienda": v => apriAzienda(v),
  "indietro-aziende": () => { S.schermata = "aziende"; S.pannello = null; disegna(); },
  "tab": v => { S.tab = v; S.lavSel = null; S.valSos = null; S.pannello = null; if (v !== "invia") S.inviato = false; window.scrollTo(0, 0); disegna(); },
  "pannello": v => { S.pannello = S.pannello === v ? null : v; disegna(); },
  "avvia-sopralluogo": () => modifica(() => {}).then(() => { S.tab = "lavoratori"; disegna(); }),
  "apri-lav": v => { S.lavSel = v; S.pannello = null; window.scrollTo(0, 0); disegna(); },
  "indietro-lav": () => { S.lavSel = null; S.pannello = null; disegna(); },
  "cessato": v => modifica(b => { if (b.cessati[v]) delete b.cessati[v]; else b.cessati[v] = iso(oggi()); }),
  "ruolo": (v, el) => modifica(b => {
    const l = lavoratori().find(x => x.id === v), r = el.dataset.r;
    b.ruoli[v] = { ...(b.ruoli[v] || {}), [r]: !l[r] };
  }),
  "mansione": (v, el) => modifica(b => {
    const l = lavoratori().find(x => x.id === v), m = el.dataset.m;
    const nuove = l.mansioni.includes(m) ? l.mansioni.filter(x => x !== m) : l.mansioni.concat(m);
    if (!nuove.length) return;
    const nuovo = b.lavNuovi.find(x => x.id === v);
    if (nuovo) nuovo.mansioni = nuove; else b.mansioni[v] = nuove;
  }),
  "salva-lav": () => {
    const nome = $("f-nome").value.trim(), mans = valoriScelti("f-mans");
    if (!nome || !mans.length) return alert("Scrivi il nome e scegli almeno una mansione.");
    const corsi = $("f-corsi").checked;
    S.pannello = null;
    modifica(b => {
      b.lavNuovi.push({ id: "N" + idBreve(), nome, reparto: $("f-reparto").value.trim(), mansioni: mans, dataIngresso: $("f-ingresso").value });
      if (corsi) {
        const termine = iso(fineMeseTra(2));
        for (const c of ["Formazione generale - 4 ore", "Formazione specifica"])
          b.corsiNuovi.push({ id: "C" + idBreve(), lavoratore: nome, corso: c, data: "", scadenza: termine, stato: "DA FARE", daFare: true });
      }
    });
  },
  "togli-lav": v => modifica(b => {
    const n = b.lavNuovi.find(x => x.id === v);
    b.lavNuovi = b.lavNuovi.filter(x => x.id !== v);
    if (n) b.corsiNuovi = b.corsiNuovi.filter(c => c.lavoratore !== n.nome);
  }),
  "salva-corso": v => {
    const daFare = $("f-dafare").checked, d = $("f-data").value, corso = $("f-corso").value;
    if (!daFare && !d) return alert("Indica la data del corso oppure spunta \"Da fare\".");
    const k = S.dettaglio.catalogoCorsi.find(c => c.nome === corso);
    const scad = daFare ? iso(fineMeseTra(2)) : (k && k.giorni ? iso(piuGiorni(data(d), k.giorni)) : "");
    S.pannello = null;
    modifica(b => b.corsiNuovi.push({ id: "C" + idBreve(), lavoratore: v, corso, data: daFare ? "" : d, scadenza: scad,
      stato: daFare ? "DA FARE" : "REGISTRATA", daFare }));
  },
  "salva-att": () => {
    const nome = $("f-nome").value.trim();
    if (!nome) return alert("Scrivi il nome dell'attrezzatura.");
    const marca = $("f-marca").value.trim(), mans = valoriScelti("f-mans");
    S.pannello = null;
    modifica(b => b.attNuove.push({ id: "N" + idBreve(), nome, marca, mansioni: mans, stato: "ATTIVA" }));
  },
  "togli-att": v => modifica(b => { b.attNuove = b.attNuove.filter(x => x.id !== v); }),
  "dismessa": v => modifica(b => { if (b.attDismesse[v]) delete b.attDismesse[v]; else b.attDismesse[v] = true; }),
  "salva-sos": async () => {
    const nome = $("f-nome").value.trim();
    if (!nome) return alert("Scrivi il nome della sostanza.");
    const file = $("f-sds").files[0];
    const sdsId = file ? await salvaFoto(file) : null;
    const s = { id: "N" + idBreve(), nome, produttore: $("f-prod").value.trim(), statoFisico: $("f-stato").value,
      frasiH: $("f-h").value.toUpperCase().split(/[\s,;]+/).filter(Boolean), mansioni: valoriScelti("f-mans"),
      sds: !!file, sdsFile: sdsId, revisione: (file && S.sdsLetta && S.sdsLetta.revisione) || "", esito: "" };
    S.sdsLetta = null;
    S.pannello = null;
    modifica(b => b.sosNuove.push(s));
  },
  "togli-sos": v => modifica(b => { b.sosNuove = b.sosNuove.filter(x => x.id !== v); }),
  "sos-elimina": v => modifica(b => { if (b.sosEliminate[v]) delete b.sosEliminate[v]; else b.sosEliminate[v] = true; }),
  "salva-pre": async () => {
    const i = $("f-cat").value, cat = i !== "" ? S.dettaglio.catalogoPrescrizioni[+i] : null;
    const testo = $("f-testo").value.trim() || (cat ? cat.testo : "");
    const zona = $("f-zona").value.trim() || (cat ? cat.zona : "") || "Generale";
    if (!testo) return alert("Scegli una prescrizione dal catalogo o scrivi il testo.");
    const foto = [];
    for (const f of $("f-foto").files) foto.push(await salvaFoto(f));
    S.pannello = null;
    modifica(b => b.preNuove.push({ id: "N" + idBreve(), zona, testo, foto, stato: "APERTA" }));
  },
  "togli-pre": v => modifica(b => { b.preNuove = b.preNuove.filter(x => x.id !== v); }),
  "risolta": v => modifica(b => { if (b.preRisolte[v]) delete b.preRisolte[v]; else b.preRisolte[v] = iso(oggi()); }),
  "apri-mov": v => { S.valSos = v; S.valMansExtra = []; window.scrollTo(0, 0); disegna(); },
  "chiudi-mov": () => { S.valSos = null; disegna(); },
  "salva-frasi-mov": () => {
    const frasi = $("f-frasi-mov").value.toUpperCase().split(/[\s,;]+/).filter(h => /^(EU)?H\d/.test(h));
    const id = S.valSos;
    modifica(b => {
      const nuova = b.sosNuove.find(x => x.id === id);
      if (nuova) nuova.frasiH = frasi;
      else b.sosAggiornate[id] = { ...(b.sosAggiornate[id] || {}), frasiH: frasi };
    });
  },
  "aggiungi-mans-mov": () => { S.valMansExtra.push($("f-altra-mans").value); disegna(); },
  "salva-mov": (m, el) => {
    const card = el.closest("[data-mans]"), v = valoriMov(card);
    const sost = sostanze().find(x => x.id === S.valSos);
    if (!calcola(sost.frasiH, v).completa) return alert("Compila tutti i parametri prima di salvare.");
    const anche = valoriScelti("applica-" + m);
    modifica(b => { b.valChimica = b.valChimica || {};
      for (const mm of [m, ...anche])
        b.valChimica[sost.id + "|" + mm] = { sostanza: sost.nome, mansione: mm, ...v, data: iso(oggi()), tecnico: S.utente.name }; });
  },
  "cancella-firma": () => modifica(b => { b.ricevuta.firma = ""; }),
  "anteprima-ricevuta": () => { S.anteprima = !S.anteprima; disegna(); },
  "stampa-ricevuta": () => { document.body.classList.add("stampa-lettera"); window.print(); setTimeout(() => document.body.classList.remove("stampa-lettera"), 500); },
  "annulla-bozza": async () => {
    if (!confirm("Annullare il sopralluogo? Tutte le modifiche di questa bozza andranno perse.")) return;
    if (S.esempio) delete S.bozzeEsempio[S.azienda.codice]; else await eliminaBozza(S.azienda.codice);
    S.bozza = null; S.tab = "anagrafica";
    await ricalcolaStati(); S.azienda = S.aziende.find(a => a.codice === S.azienda.codice) || S.azienda; disegna();
  },
  "invia-conferma": async () => {
    if (!S.esempio) return;
    S.pacchetto.sopralluoghi.push({ id: S.bozza.idSopralluogo, codice: S.azienda.codice, data: iso(oggi()), tecnico: S.utente.name });
    delete S.bozzeEsempio[S.azienda.codice];
    S.bozza = null; S.inviato = true; S.dettaglio = aziendaEsempio(S.azienda);
    await ricalcolaStati(); S.azienda = S.aziende.find(a => a.codice === S.azienda.codice) || S.azienda; disegna();
  }
};

document.addEventListener("click", e => {
  const el = e.target.closest("[data-a]");
  if (!el || el.tagName === "INPUT") return;
  const f = azioni[el.dataset.a];
  if (f) { e.preventDefault(); f(el.dataset.v, el); }
});

document.addEventListener("change", async e => {
  const el = e.target;
  if (el.matches("input[type=checkbox][data-a]")) { const f = azioni[el.dataset.a]; if (f) f(el.dataset.v, el); return; }
  if (el.dataset.mv) {
    const card = el.closest("[data-mans]"), sost = sostanze().find(x => x.id === S.valSos);
    card.querySelector(".esito-mov").innerHTML = risultatoHtml(calcola(sost.frasiH, valoriMov(card)));
    return;
  }
  if (el.dataset.ricVoce) return modifica(b => { b.ricevuta.voci[el.dataset.ricVoce] = el.checked; });
  if (el.dataset.ric) return modifica(b => { b.ricevuta[el.dataset.ric] = el.value.trim(); });
  if (el.dataset.impDoc) {
    const ids = []; for (const f of el.files) ids.push(await salvaFoto(f));
    if (ids.length) modifica(b => { b.impiantoDoc[el.dataset.impDoc] = b.impiantoDoc[el.dataset.impDoc].concat(ids); });
    return;
  }
  if (el.id === "f-sds" && el.files[0]) return compilaDaSDS(el.files[0]);
  if (el.dataset.sdsSos && el.files[0]) {
    const f = el.files[0], id = el.dataset.sdsSos, r = await leggiSDS(f), fileId = await salvaFoto(f);
    const sost = sostanze().find(x => x.id === id);
    if (!r.letto) alert("Ho salvato la SDS, ma non riesco a leggerne il testo (forse è una scansione): controlla tu frasi H e stato fisico.");
    const nuovi = { sds: true, sdsFile: fileId, revisione: r.revisione || sost.revisione };
    if (r.frasiH.length) nuovi.frasiH = r.frasiH;
    if (r.statoFisico) nuovi.statoFisico = r.statoFisico;
    if (r.letto && r.frasiH.length) alert("Dalla SDS: " + r.frasiH.join(" ") + (r.statoFisico ? " · " + r.statoFisico : "") + (r.revisione ? " · revisione " + r.revisione : "") + ". Controlla che siano corrette.");
    return modifica(b => { b.sosAggiornate[id] = nuovi; });
  }
  if (el.dataset.imp) return modifica(b => { b.impianto[el.dataset.imp] = el.value; });
  if (el.id === "f-note") return modifica(b => { b.note = el.value; });
  if (el.id === "f-cat" && el.value !== "") {
    const c = S.dettaglio.catalogoPrescrizioni[+el.value];
    if (c) { $("f-testo").value = c.testo; if (!$("f-zona").value) $("f-zona").value = c.zona; }
    return;
  }
  if (el.dataset.fotoPre || el.dataset.fotoMedia) {
    const ids = [];
    for (const f of el.files) ids.push(await salvaFoto(f));
    if (!ids.length) return;
    if (el.dataset.fotoPre) modifica(b => { b.preFoto[el.dataset.fotoPre] = (b.preFoto[el.dataset.fotoPre] || []).concat(ids); });
    else modifica(b => { b.media = b.media.concat(ids); });
  }
});

// App installabile: lavoro senza rete e richiesta di memoria persistente (iPad)
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

window.addEventListener("online", disegna);
window.addEventListener("offline", disegna);
avvio();
