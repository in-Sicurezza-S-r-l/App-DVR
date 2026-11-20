// Bozza del sopralluogo: tutte le modifiche restano sul tablet finché non si preme "Invia"
import { leggi, scrivi, cancella } from "./store.js";

function due(n) { return String(n).padStart(2, "0"); }
export function nuovoIdSopralluogo(d = new Date()) {
  return "SOP-" + d.getFullYear() + due(d.getMonth() + 1) + due(d.getDate()) + "-" + due(d.getHours()) + due(d.getMinutes()) + due(d.getSeconds());
}
export const idBreve = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/-/g, "").slice(0, 8);

export function bozzaVuota(codice, tecnico) {
  return {
    codice, tecnico, idSopralluogo: nuovoIdSopralluogo(), iniziata: new Date().toISOString(),
    lavNuovi: [], cessati: {}, mansioni: {}, ruoli: {},
    corsiNuovi: [], attNuove: [], attDismesse: {}, sosNuove: [], sosEliminate: {},
    preNuove: [], preRisolte: {}, preFoto: {}, impianto: {}, valChimica: {}, media: [], note: ""
  };
}

export const leggiBozza = codice => leggi("bozza:" + codice);
export const salvaBozza = b => scrivi("bozza:" + b.codice, b);
export const eliminaBozza = codice => cancella("bozza:" + codice);

// Numero di modifiche (per il pulsante "Invia sopralluogo (n)")
export function contaModifiche(b) {
  if (!b) return 0;
  const n = o => Object.values(o || {}).filter(Boolean).length;
  return b.lavNuovi.length + n(b.cessati) + Object.keys(b.mansioni).length + Object.keys(b.ruoli).length +
    b.corsiNuovi.length + b.attNuove.length + n(b.attDismesse) + b.sosNuove.length + n(b.sosEliminate) +
    b.preNuove.length + n(b.preRisolte) + Object.values(b.preFoto).reduce((t, l) => t + l.length, 0) +
    (Object.keys(b.impianto).length ? 1 : 0) + Object.keys(b.valChimica || {}).length + b.media.length + (b.note.trim() ? 1 : 0);
}

export function riepilogo(b) {
  if (!b) return [];
  const n = o => Object.values(o || {}).filter(Boolean).length;
  return [
    ["Lavoratori nuovi", b.lavNuovi.length], ["Lavoratori cessati", n(b.cessati)],
    ["Cambi di mansione", Object.keys(b.mansioni).length], ["Ruoli (antincendio, primo soccorso, preposto)", Object.keys(b.ruoli).length],
    ["Corsi aggiunti", b.corsiNuovi.filter(c => !c.daFare).length], ["Corsi da fare", b.corsiNuovi.filter(c => c.daFare).length],
    ["Attrezzature nuove", b.attNuove.length], ["Attrezzature dismesse", n(b.attDismesse)],
    ["Sostanze nuove", b.sosNuove.length], ["Sostanze eliminate", n(b.sosEliminate)],
    ["Prescrizioni nuove", b.preNuove.length], ["Prescrizioni risolte", n(b.preRisolte)],
    ["Foto aggiunte a prescrizioni", Object.values(b.preFoto).reduce((t, l) => t + l.length, 0)],
    ["Valutazioni MoVaRisCh", Object.keys(b.valChimica || {}).length],
    ["Impianto elettrico aggiornato", Object.keys(b.impianto).length ? "sì" : 0],
    ["Foto e video del sopralluogo", b.media.length], ["Note", b.note.trim() ? "sì" : 0]
  ].filter(r => r[1]);
}

// ---------- Foto: ridotte a max 1600 px e salvate sul tablet ----------
export async function salvaFoto(file) {
  const id = "F" + idBreve();
  let blob = file;
  if (file.type.startsWith("image/")) {
    try {
      const img = await createImageBitmap(file);
      const scala = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scala); c.height = Math.round(img.height * scala);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      blob = await new Promise(ok => c.toBlob(ok, "image/jpeg", 0.82));
    } catch (_) { blob = file; }
  }
  await scrivi("foto:" + id, { blob, nome: file.name || id + ".jpg", tipo: blob.type, il: new Date().toISOString() });
  return id;
}

export const leggiFoto = id => leggi("foto:" + id);
