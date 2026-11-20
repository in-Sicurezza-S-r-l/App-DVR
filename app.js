// PILOTA DVR – App nuova: avvio, schermata "Le mie aziende" e navigazione
import { initAuth, getAccount, login, logout } from "./auth.js";
import { scaricaAziende, aziendeSalvate, codiciConBozza, calcolaStato, nomeTecnico, MESI } from "./dati.js";
import { UTENTE_ESEMPIO, PACCHETTO_ESEMPIO, BOZZE_ESEMPIO } from "./esempio.js";

const C = window.PD_CONFIG;
const $app = document.getElementById("app");
const esc = v => String(v ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

// Stato dell'app: resta in memoria, così tornando indietro si ritrova tutto com'era
const S = {
  utente: null, esempio: false,
  pacchetto: null, aziende: [], errore: "", caricamento: false,
  schermata: "aziende", azienda: null, tab: "anagrafica",
  q: "", mostraTutte: ricorda("mostraTutte") === "1", filtro: "tutti", scroll: 0
};

function ricorda(k, v) {
  try { if (v === undefined) return localStorage.getItem("pd." + k); localStorage.setItem("pd." + k, v); } catch (_) { return null; }
}

// ---------- Avvio ----------
async function avvio() {
  if (new URLSearchParams(location.search).has("esempio")) return avviaEsempio();
  try {
    const acc = await initAuth();
    if (!acc) return disegnaAccesso();
    S.utente = { name: acc.name || nomeTecnico(null, acc.username.toLowerCase()), username: acc.username.toLowerCase() };
  } catch (e) {
    return disegnaAccesso(e.message);
  }
  // prima la copia sul tablet (immediata), poi l'aggiornamento da SharePoint
  const salvato = await aziendeSalvate().catch(() => null);
  if (salvato) await applica(salvato);
  disegna();
  aggiorna();
}

async function avviaEsempio() {
  S.esempio = true;
  S.utente = UTENTE_ESEMPIO;
  S.pacchetto = PACCHETTO_ESEMPIO;
  S.aziende = calcolaStato(PACCHETTO_ESEMPIO, BOZZE_ESEMPIO);
  disegna();
}

async function applica(pacchetto) {
  S.pacchetto = pacchetto;
  const bozze = await codiciConBozza().catch(() => new Set());
  S.aziende = calcolaStato(pacchetto, bozze);
}

async function aggiorna() {
  if (S.esempio) return;
  S.caricamento = true; S.errore = ""; disegna();
  try {
    await applica(await scaricaAziende());
  } catch (e) {
    S.errore = navigator.onLine === false
      ? "Nessuna rete: uso i dati salvati sul tablet."
      : "Non riesco a leggere i dati da SharePoint.\n" + e.message;
  }
  S.caricamento = false;
  disegna();
}

// ---------- Schermate ----------
function disegnaAccesso(errore) {
  $app.innerHTML = `
    <main><div class="accesso">
      <div class="lbl">in-Sicurezza · PILOTA DVR</div>
      <h1>Sopralluoghi</h1>
      <p>Accedi con l'account Microsoft 365 dello studio. Vedrai le aziende e i documenti che vedi già in SharePoint.</p>
      ${errore ? `<div class="errore">${esc(errore)}</div>` : ""}
      <button class="btn" id="accedi">Accedi con Microsoft</button>
      <a href="?esempio">Guarda l'app con dati di esempio</a>
    </div></main>`;
  document.getElementById("accedi").onclick = login;
}

function disegna() {
  if (S.schermata === "azienda") return disegnaAzienda();
  disegnaElenco();
}

function barraPrincipale() {
  const quando = S.pacchetto && !S.esempio
    ? "aggiornato " + new Date(S.pacchetto.scaricatoIl).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";
  return `
    <div class="barra">
      <span class="titolo">in-Sicurezza · PILOTA DVR</span>
      ${S.esempio ? `<span class="offline">DATI DI ESEMPIO</span>` : ""}
      ${navigator.onLine === false ? `<span class="offline">Senza rete</span>` : ""}
      <span class="info">${esc(quando)}</span>
      ${S.esempio ? `<a class="btn2" style="display:inline-flex;align-items:center;text-decoration:none" href="./">Esci dall'esempio</a>`
        : `<button class="btn2" id="aggiorna" ${S.caricamento ? "disabled" : ""}>${S.caricamento ? "Aggiorno…" : "Aggiorna"}</button>
           <button class="btn2" id="esci">Esci</button>`}
    </div>`;
}

// Ordine dei mesi: prima il mese corrente e i successivi, poi quelli già passati, infine senza mese
function pesoMese(m) {
  if (m < 0) return 99;
  const ora = new Date().getMonth();
  return (m - ora + 12) % 12;
}

function disegnaElenco() {
  const p = S.pacchetto;
  const io = S.utente.username;
  const tutte = S.aziende.filter(a => a.attiva);
  const mie = p && p.haTecnico ? tutte.filter(a => a.tecnicoEmail === io) : tutte;
  const base = S.mostraTutte ? tutte : mie;
  const q = S.q.trim().toLowerCase();
  const cercate = base.filter(a => !q || (a.nome + " " + a.codice + " " + a.cartella).toLowerCase().includes(q));
  const conta = k => cercate.filter(a => k === "tutti" || a.stato === k).length;
  const elenco = cercate
    .filter(a => S.filtro === "tutti" || a.stato === S.filtro)
    .sort((a, b) => pesoMese(a.mese) - pesoMese(b.mese) || a.nome.localeCompare(b.nome, "it"));

  const avvisi = [];
  if (p && !p.haTecnico) avvisi.push("La lista PD_Aziende non ha ancora la colonna <b>TecnicoEmail</b>: per ora vedi tutte le aziende. Quando la aggiungiamo, ognuno vedrà solo le sue.");
  else if (p && !S.mostraTutte && mie.length === 0) avvisi.push("Non ci sono aziende assegnate a te (" + esc(io) + "). Attiva \"Mostra tutte le aziende\" per vederle tutte.");
  if (p && !p.haMese) avvisi.push("La lista PD_Aziende non ha ancora la colonna <b>MeseSopralluogo</b>: il mese del sopralluogo non viene mostrato.");

  const filtri = [["tutti", "Tutte"], ["dafare", "Da fare"], ["bozza", "Bozza"], ["fatto", "Fatto " + new Date().getFullYear()]];

  $app.innerHTML = `
    ${barraPrincipale()}
    <main>
      <div class="testa">
        <div style="flex-grow:1;display:flex;flex-direction:column;gap:4px">
          <div class="lbl">PILOTA DVR · Sopralluoghi</div>
          <h1>${S.mostraTutte ? "Tutte le aziende" : "Le mie aziende"}</h1>
          <div class="sotto">Accesso come ${esc(S.utente.name)} · ${base.length} aziende</div>
        </div>
        <label class="chk"><input type="checkbox" id="tutte" ${S.mostraTutte ? "checked" : ""}>Mostra tutte le aziende</label>
      </div>
      ${S.errore ? `<div class="errore">${esc(S.errore)}</div>` : ""}
      ${avvisi.map(t => `<div class="avviso">${t}</div>`).join("")}
      <label style="display:flex;flex-direction:column;gap:6px">
        <span class="lbl">Cerca</span>
        <input type="search" id="cerca" placeholder="Nome, codice o cartella" value="${esc(S.q)}">
      </label>
      <div class="filtri">
        ${filtri.map(([k, t]) => `<button class="filtro ${S.filtro === k ? "on" : ""}" data-filtro="${k}">${t} (${conta(k)})</button>`).join("")}
      </div>
      <div class="griglia">
        ${!p ? `<div class="vuoto">${S.caricamento ? "Carico le aziende da SharePoint…" : "Nessun dato ancora scaricato."}</div>` :
          elenco.length === 0 ? `<div class="vuoto">Nessuna azienda trovata.</div>` :
          elenco.map(a => `
          <button class="card" data-codice="${esc(a.codice)}">
            <span class="nome">${esc(a.nome)}</span>
            <span class="det">${[
              a.mese >= 0 ? "sopralluogo " + MESI[a.mese] : "",
              (S.mostraTutte || !p.haTecnico) && a.tecnicoEmail ? nomeTecnico(p, a.tecnicoEmail) : "",
              "cod. " + a.codice.replace(/^0+/, "")
            ].filter(Boolean).map(esc).join(" · ")}</span>
            <span class="chip ${a.stato}">${esc(a.testoStato)}</span>
          </button>`).join("")}
      </div>
      <div class="piede">${S.esempio ? "" : `<a href="verifica.html">Verifica colonne delle liste SharePoint</a>`}</div>
    </main>`;

  const cerca = document.getElementById("cerca");
  cerca.oninput = () => { S.q = cerca.value; disegnaElenco(); const c = document.getElementById("cerca"); c.focus(); c.setSelectionRange(c.value.length, c.value.length); };
  document.getElementById("tutte").onchange = e => { S.mostraTutte = e.target.checked; ricorda("mostraTutte", S.mostraTutte ? "1" : "0"); disegnaElenco(); };
  document.querySelectorAll("[data-filtro]").forEach(b => b.onclick = () => { S.filtro = b.dataset.filtro; disegnaElenco(); });
  document.querySelectorAll("[data-codice]").forEach(b => b.onclick = () => apriAzienda(b.dataset.codice));
  const ag = document.getElementById("aggiorna"); if (ag) ag.onclick = aggiorna;
  const es = document.getElementById("esci"); if (es) es.onclick = logout;
  window.scrollTo(0, S.scroll);
}

function apriAzienda(codice) {
  S.scroll = window.scrollY;
  if (!S.azienda || S.azienda.codice !== codice) S.tab = "anagrafica";
  S.azienda = S.aziende.find(a => a.codice === codice);
  S.schermata = "azienda";
  window.scrollTo(0, 0);
  disegna();
}

const TABS = [["anagrafica", "Anagrafica"], ["lavoratori", "Lavoratori"], ["attrezzature", "Attrezzature"],
  ["sostanze", "Sostanze"], ["prescrizioni", "Prescrizioni"], ["altro", "Altro"]];

function disegnaAzienda() {
  const a = S.azienda;
  $app.innerHTML = `
    <div class="barra">
      <button class="btn2" id="indietro">‹ Aziende</button>
      <div style="flex-grow:1;min-width:0">
        <div style="font-size:20px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(a.nome)}</div>
        <div class="info">cod. ${esc(a.codice.replace(/^0+/, ""))} · ${esc(a.testoStato)}</div>
      </div>
      <button class="btn" style="background:var(--arancio);color:var(--testo)" disabled>Invia sopralluogo (0)</button>
    </div>
    <nav class="tabs">${TABS.map(([k, t]) => `<button class="tab ${S.tab === k ? "on" : ""}" data-tab="${k}">${t}</button>`).join("")}</nav>
    <main>
      <div class="box">
        <h2 style="margin:0 0 8px;font-size:22px;font-weight:900">${TABS.find(t => t[0] === S.tab)[1]}</h2>
        <p style="margin:0;color:var(--grigio)">Schermata in costruzione: arriva nei prossimi passi.</p>
        <p style="margin:12px 0 0;color:var(--grigio);font-size:14px">Cartella SharePoint: <code>${esc(a.cartella || "—")}</code></p>
      </div>
    </main>`;
  document.getElementById("indietro").onclick = () => { S.schermata = "aziende"; disegna(); };
  document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { S.tab = b.dataset.tab; disegnaAzienda(); });
}

// App installabile: lavoro senza rete e richiesta di memoria persistente (iPad)
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

window.addEventListener("online", disegna);
window.addEventListener("offline", disegna);
avvio();
