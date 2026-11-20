// Dati delle aziende: lettura da SharePoint (PD_Aziende, PD_Sopralluoghi) con copia sul tablet
import { graphTutto, sito } from "./auth.js";
import { leggi, scrivi, chiavi } from "./store.js";

export const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

export function normCodice(v) {
  let s = String(v ?? "").trim().replace(/\.0+$/, "");
  if (/^\d+$/.test(s)) s = s.padStart(15, "0");
  return s;
}

// Accetta "novembre", "11", 11 o una data: restituisce l'indice del mese (0-11) oppure -1
function indiceMese(v) {
  if (v === undefined || v === null || v === "") return -1;
  const s = String(v).trim().toLowerCase();
  const i = MESI.findIndex(m => s.startsWith(m.slice(0, 3)));
  if (i >= 0) return i;
  if (/^\d{1,2}$/.test(s)) { const n = +s; return n >= 1 && n <= 12 ? n - 1 : -1; }
  const d = new Date(s);
  return isNaN(d) ? -1 : d.getMonth();
}

function attiva(v) {
  if (v === undefined || v === null || v === "") return true;
  return !(v === false || /^(no|false|0|non attiva)$/i.test(String(v).trim()));
}

// Scarica da SharePoint e salva una copia sul tablet
export async function scaricaAziende() {
  const s = await sito();
  const base = "/sites/" + s.id + "/lists/";
  const [colonne, items, sop] = await Promise.all([
    graphTutto(base + "PD_Aziende/columns?$select=name"),
    graphTutto(base + "PD_Aziende/items?$expand=fields&$top=999"),
    graphTutto(base + "PD_Sopralluoghi/items?$expand=fields($select=Title,CodiceAzienda,DataSopralluogo,Tecnico)&$top=999")
  ]);
  const nomiColonne = colonne.map(c => c.name);
  // Elenco tecnici (facoltativo): lista PD_Tecnici con Title = nome ed Email
  const tecnici = {};
  try {
    const righe = await graphTutto(base + window.PD_CONFIG.listaTecnici + "/items?$expand=fields&$top=200");
    for (const r of righe) {
      const email = String(r.fields.Email || "").toLowerCase().trim();
      if (email) tecnici[email] = r.fields.Title || email;
    }
  } catch (_) { /* lista non ancora creata: si usa il nome ricavato dall'email */ }
  const pacchetto = {
    scaricatoIl: new Date().toISOString(),
    tecnici,
    haTecnico: nomiColonne.includes("TecnicoEmail"),
    haMese: nomiColonne.includes("MeseSopralluogo"),
    aziende: items.map(i => i.fields).map(f => ({
      idLista: f.id,
      nome: f.Title || "",
      codice: normCodice(f.CodiceAzienda),
      cartella: f.CartellaSharePoint || "",
      attiva: attiva(f.Attiva),
      tecnicoEmail: String(f.TecnicoEmail || "").toLowerCase().trim(),
      mese: indiceMese(f.MeseSopralluogo),
      note: f.Note || ""
    })),
    sopralluoghi: sop.map(i => i.fields).map(f => ({
      id: f.Title || "",
      codice: normCodice(f.CodiceAzienda),
      data: f.DataSopralluogo || "",
      tecnico: f.Tecnico || ""
    }))
  };
  await scrivi("aziende", pacchetto);
  return pacchetto;
}

export const aziendeSalvate = () => leggi("aziende");

// Nome da mostrare per un tecnico: dalla lista PD_Tecnici, altrimenti dall'email (mario.rossi@… → Mario Rossi)
export function nomeTecnico(pacchetto, email) {
  if (!email) return "";
  const dallaLista = pacchetto && pacchetto.tecnici && pacchetto.tecnici[email];
  if (dallaLista) return dallaLista;
  return email.split("@")[0].split(/[._-]+/).filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

export async function codiciConBozza() {
  return new Set((await chiavi("bozza:")).map(k => k.slice(6)));
}

// Stato del sopralluogo dell'anno in corso per ogni azienda
export function calcolaStato(pacchetto, bozze) {
  const anno = new Date().getFullYear();
  const fatti = new Map();
  for (const s of pacchetto.sopralluoghi) {
    if (!s.id.startsWith("SOP-") || s.id.endsWith("-VC")) continue;
    const d = new Date(s.data);
    if (isNaN(d) || d.getFullYear() !== anno) continue;
    if (!fatti.has(s.codice) || fatti.get(s.codice) < d) fatti.set(s.codice, d);
  }
  return pacchetto.aziende.map(a => {
    let stato = "dafare", testo = "Da fare";
    if (bozze.has(a.codice)) { stato = "bozza"; testo = "Bozza sul tablet"; }
    else if (fatti.has(a.codice)) {
      stato = "fatto";
      testo = "Fatto il " + fatti.get(a.codice).toLocaleDateString("it-IT");
    }
    return { ...a, stato, testoStato: testo };
  });
}
