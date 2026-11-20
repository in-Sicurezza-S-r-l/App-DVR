// Lettura delle schede di sicurezza (SDS) in PDF direttamente sul tablet, senza inviare il file a nessuno.
// Estrae: nome commerciale, produttore/fornitore, frasi H (sezione 2), stato fisico (sezione 9), data di revisione.
// Funziona con PDF che contengono testo; le SDS scansionate come immagine non si possono leggere.

let pdfjs = null;
async function libreria() {
  if (!pdfjs) {
    pdfjs = await import("./lib/pdfjs/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("./lib/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
  }
  return pdfjs;
}

export async function testoPdf(file) {
  const lib = await libreria();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  let testo = "";
  for (let n = 1; n <= Math.min(doc.numPages, 20); n++) {
    const pag = await doc.getPage(n);
    const c = await pag.getTextContent();
    for (const it of c.items) testo += it.str + (it.hasEOL ? "\n" : " ");
    testo += "\n";
  }
  return testo.replace(/[ \t]+/g, " ");
}

// Testo di una sezione della SDS (es. 2 = identificazione dei pericoli)
function sezione(testo, n) {
  const inizio = new RegExp("(SEZIONE|SECTION|Sezione|Section)\\s*" + n + "\\b|\\n\\s*" + n + "\\.\\s+[A-Z]", "m");
  const fine = new RegExp("(SEZIONE|SECTION|Sezione|Section)\\s*" + (n + 1) + "\\b|\\n\\s*" + (n + 1) + "\\.\\s+[A-Z]", "m");
  const a = testo.search(inizio);
  if (a < 0) return "";
  const resto = testo.slice(a + 5);
  const b = resto.search(fine);
  return b < 0 ? resto.slice(0, 6000) : resto.slice(0, b);
}

const STATI = [["aerosol", "aerosol"], ["gas", "gas"], ["polver", "polvere"], ["granul", "solido"], ["solid", "solido"],
  ["pasta", "solido"], ["liquid", "liquido"], ["gel", "liquido"]];

export function interpreta(testo) {
  const s2 = sezione(testo, 2) || testo;
  const frasi = [...new Set([...s2.matchAll(/\b(EUH\s?\d{3}|H\s?\d{3}(?:i|D|F|FD|Fd|Df|d|f)?)\b/g)]
    .map(m => m[1].replace(/\s/g, "")).map(h => h.replace(/^h/, "H")))]
    .filter(h => !/^H(0|1)/.test(h));                       // esclude falsi positivi (H0xx, H1xx non esistono)
  const s9 = (sezione(testo, 9) || testo).toLowerCase();
  let statoFisico = "";
  const riga = (s9.match(/(stato fisico|aspetto|forma)[^\n]{0,80}/) || [""])[0];
  for (const [k, v] of STATI) if (riga.includes(k)) { statoFisico = v; break; }
  if (!statoFisico && /aerosol|bomboletta spray/i.test(testo.slice(0, 4000))) statoFisico = "aerosol";
  const revisione = (testo.match(/(data di revisione|data revisione|revisione del|revisione|data di compilazione|versione)[^\d\n]{0,40}(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i) || [])[2] || "";
  const ETICHETTE = /^(?:\d[\d.]*\s*)?(identificatore del prodotto|nome commerciale|denominazione commerciale|nome del prodotto|nome prodotto|denominazione)\s*[:\-]?\s*/i;
  let nome = "";
  for (const et of ["nome commerciale", "denominazione commerciale", "nome del prodotto", "nome prodotto", "identificatore del prodotto"]) {
    const m = testo.match(new RegExp(et + "\\s*[:\\-]?\\s*([^\\n]{3,120})", "i"));
    if (m) { nome = m[1]; break; }
  }
  for (let i = 0; i < 3; i++) nome = nome.replace(ETICHETTE, "");
  nome = nome.split(/\s+(?:fornitore|produttore|codice|n\.? ?cas|cas|uso|ufi|1\.2)\b/i)[0].replace(/\s{2,}.*$/, "").slice(0, 80).trim();
  const produttore = ((testo.match(/(fornitore|produttore|ragione sociale|nome della societ[aà])\s*[:\-]?\s*([^\n]{3,80})/i) || [])[2] || "").trim();
  return { frasiH: frasi, statoFisico, revisione, nome, produttore, letto: testo.trim().length > 200 };
}

export async function leggiSDS(file) {
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) return { frasiH: [], letto: false, motivo: "non è un PDF" };
  try { return interpreta(await testoPdf(file)); }
  catch (e) { return { frasiH: [], letto: false, motivo: e.message }; }
}
