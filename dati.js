// Dati delle aziende: lettura da SharePoint (PD_Aziende, PD_Sopralluoghi) con copia sul tablet
import { graphTutto, graphBlob, sito } from "./auth.js";
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

// ======================================================================
// Scheda completa di un'azienda (liste PD_ filtrate per CodiceAzienda)
// ======================================================================
const dividi = v => String(v ?? "").split(/\s*;\s*/).map(x => x.trim()).filter(Boolean);
const vero = v => v === true || /^(s[iì]|yes|true|1|x)$/i.test(String(v ?? "").trim());

// Righe di una lista per un'azienda: prova il filtro su SharePoint, altrimenti legge tutto e filtra qui
async function righeAzienda(base, lista, codice) {
  const prefer = { Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" };
  const mappa = i => ({ ...i.fields, _creato: i.createdDateTime, _modificato: i.lastModifiedDateTime, _idLista: i.id });
  try {
    const r = await graphTutto(base + lista + "/items?$expand=fields&$top=999&$filter=fields/CodiceAzienda eq '" + codice + "'", prefer);
    return r.map(mappa);
  } catch (e) {
    if (e.status === 404) return [];           // lista inesistente
    const tutte = await graphTutto(base + lista + "/items?$expand=fields&$top=999");
    return tutte.map(mappa).filter(f => normCodice(f.CodiceAzienda) === codice);
  }
}

async function righeTutte(base, lista) {
  try { return (await graphTutto(base + lista + "/items?$expand=fields&$top=999")).map(i => i.fields); }
  catch (_) { return []; }
}

export async function scaricaAzienda(codice) {
  const s = await sito();
  const base = "/sites/" + s.id + "/lists/";
  const [anag, lav, form, att, sos, mans, pre, imp, vc, catC, catP] = await Promise.all([
    righeAzienda(base, "PD_Anagrafica", codice), righeAzienda(base, "PD_Lavoratori", codice),
    righeAzienda(base, "PD_Formazione", codice), righeAzienda(base, "PD_Attrezzature", codice),
    righeAzienda(base, "PD_Sostanze", codice), righeAzienda(base, "PD_Mansioni", codice),
    righeAzienda(base, "PD_Prescrizioni", codice), righeAzienda(base, "PD_Impianti", codice),
    righeAzienda(base, "PD_ValChimica", codice),
    righeTutte(base, "PD_CatalogoCorsi"), righeTutte(base, "PD_CatalogoPrescrizioni")
  ]);
  const ultima = anag.sort((a, b) => String(b._modificato).localeCompare(String(a._modificato)))[0] || {};
  const i = imp[0] || {};
  const pacchetto = {
    codice, scaricatoIl: new Date().toISOString(),
    anagrafica: {
      sedeLegale: ultima.IndirizzoSedeLegale || "", sedeOperativa: ultima.IndirizzoSedeOperativa || "",
      partitaIva: ultima.PartitaIVA || "", email: ultima.Email || "", telefono: ultima.Telefono || "", cellulare: ultima.Cellulare || "",
      datoreLavoro: ultima.DatoreLavoro || "", rspp: ultima.RSPP || "", medicoCompetente: ultima.MedicoCompetente || "",
      rls: ultima.RLS || "", preposti: ultima.Preposti || ""
    },
    mansioni: mans.filter(m => m.Attiva === undefined || vero(m.Attiva)).map(m => m.Title).filter(Boolean).sort(),
    lavoratori: lav.filter(l => String(l.Stato || "ATTIVO").toUpperCase() !== "CESSATO").map(l => ({
      id: l.IDLavoratore || l._idLista, idLista: l._idLista, nome: l.Title || "", reparto: l.Reparto || "",
      mansioni: dividi(l.Mansione), stato: "ATTIVO", dataIngresso: l.DataIngresso || "",
      addettoAI: vero(l.AddettoAI), addettoPS: vero(l.AddettoPS), rls: vero(l.RLS), preposto: vero(l.Preposto)
    })),
    formazione: form.map(f => ({
      id: f.IDFormazione || f._idLista, idLista: f._idLista, lavoratore: f.Title || "", corso: f.Corso || "",
      data: f.DataCorso || "", scadenza: f.ScadenzaCorso || "", stato: String(f.Stato || "REGISTRATA").toUpperCase()
    })),
    attrezzature: att.filter(a => String(a.Stato || "ATTIVA").toUpperCase() !== "ELIMINATA").map(a => ({
      id: a.IDAttrezzatura || a._idLista, idLista: a._idLista, nome: a.Title || "", marca: a.MarcaModello || "",
      mansioni: dividi(a.Mansioni), stato: "ATTIVA"
    })),
    sostanze: sos.filter(x => !/ELIMINAT/i.test(String(x.Stato || ""))).map(x => {
      const valutazioni = vc.filter(v => String(v.Sostanza || "").toLowerCase() === String(x.Title || "").toLowerCase());
      return {
        id: x.IDSostanza || x._idLista, idLista: x._idLista, nome: x.Title || "", produttore: x.Produttore || "",
        statoFisico: x.StatoFisico || "", frasiH: dividi(String(x.IndicazioniPericolo || "").replace(/[,\s]+/g, ";")).filter(h => /^(EU)?H\d/i.test(h)),
        mansioni: dividi(x.Mansioni), sds: vero(x.SDSDisponibile) || !!x.FileSDS, revisione: x.RevisioneSDS || "",
        avvisi: x.AvvisiSDS || "", esito: valutazioni.length ? "valutata (" + valutazioni.length + " mansioni)" : ""
      };
    }),
    prescrizioni: pre.filter(p => String(p.Stato || "APERTA").toUpperCase() !== "RISOLTA").map(p => ({
      id: p.Title || p._idLista, idLista: p._idLista, zona: p.Zona || "", testo: p.Testo || "",
      foto: dividi(p.Foto), stato: "APERTA", dataApertura: p.DataApertura || ""
    })),
    valChimica: vc.map(v => ({
      idLista: v._idLista, sostanza: v.Sostanza || "", mansione: v.Mansione || "", cf: v.StatoFisico || "", q: v.Quantita || "",
      u: v.TipologiaUso || "", c: v.TipologiaControllo || "", t: v.TempoEsposizione || "", d: v.Distanza || "", k: v.LivelloContatto || "",
      tipo: v.TipoEsposizione || "", data: v.DataValutazione || "", tecnico: v.Tecnico || ""
    })),
    impianto: { dicoPresente: i.DicoPresente || "", dicoDitta: i.DicoDitta || "", dicoData: i.DicoData || "",
      terraData: i.TerraData || "", terraOrganismo: i.TerraOrganismo || "", terraPeriodicita: i.TerraPeriodicita || "" },
    catalogoCorsi: catC.map(c => ({ nome: c.Title || c.Corso || "", giorni: Number(c.PeriodicitaGiorni) || 0 })).filter(c => c.nome),
    catalogoPrescrizioni: catP.map(c => ({ zona: c.Zona || "", testo: c.Testo || c.Title || "" })).filter(c => c.testo)
  };
  await scrivi("azienda:" + codice, pacchetto);
  return pacchetto;
}

export const aziendaSalvata = codice => leggi("azienda:" + codice);

// Percorso di una foto nella cartella del cliente (libreria Documenti condivisi › Documenti › cartella cliente)
export async function scaricaFoto(cartella, nome) {
  const s = await sito();
  const percorso = ["Documenti", ...String(cartella).split(/[\\/]+/), "Foto sopralluogo", nome]
    .filter(Boolean).map(encodeURIComponent).join("/");
  return graphBlob("/sites/" + s.id + "/drive/root:/" + percorso + ":/content");
}
