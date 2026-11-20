// Valutazione del rischio chimico MoVaRisCh 2026 – stesso modello dello strumento "MoVaRisCh 2026" dello studio
// P = punteggio massimo delle frasi H; E inalatoria = (CF+Q+U+C+T) × d × 0,5; E cutanea = (U+Contatto) × 1,5
// R = P × E; R cumulativo = √(R inal² + R cute²); classi: <15, <21, <40, <80, ≥80

// [codice, punteggio P, DPI]
const FRASI = [
  ["H200",3,"OCC;GUA"],["H201",3,"OCC;GUA"],["H202",3,"OCC;GUA"],["H203",3,"OCC;GUA"],["H204",2,"OCC;GUA"],["H205",2,"OCC;GUA"],
  ["H220",3,"OCC;GUA"],["H221",2,"OCC;GUA"],["H222",3,"OCC;GUA"],["H223",2,"OCC;GUA"],["H224",3,"OCC;GUA"],["H225",2,"OCC;GUA"],
  ["H226",2,"OCC;GUA"],["H228",2,"OCC;GUA"],["H240",3,"OCC;GUA"],["H241",3,"OCC;GUA"],["H242",2,"OCC;GUA"],
  ["H250",3,"GUA"],["H251",3,"GUA"],["H252",2,"GUA"],["H260",3,"OCC;GUA"],["H261",2,"OCC;GUA"],
  ["H270",3,"OCC;GUA"],["H271",3,"OCC;GUA"],["H272",2,"OCC;GUA"],["H280",2,"OCC"],["H281",2,"OCC;GUA"],["H290",2,"OCC;GUA"],
  ["H300",10,"GUA"],["H301",7,"GUA"],["H302",5,"GUA"],["H304",6,"APVR"],["H310",10,"GUA;TUT;APVR"],["H311",7,"GUA;TUT"],
  ["H312",5,"GUA"],["H314",8,"GUA;OCC;TUT"],["H315",3,"GUA"],["H317",5,"GUA"],["H318",6,"OCC"],["H319",3,"OCC"],
  ["H330",10,"APVR"],["H331",7,"APVR"],["H332",5,"APVR"],["H334",7,"APVR"],["H335",5,"APVR"],["H336",5,"APVR"],
  ["H340",0,"APVR;GUA;TUT;OCC"],["H341",6,"APVR;GUA;OCC"],["H350",0,"APVR;GUA;TUT;OCC"],["H350i",0,"APVR;GUA;TUT;OCC"],
  ["H351",6,"APVR;GUA;OCC"],["H360",0,"APVR;GUA;TUT"],["H360D",0,"APVR;GUA;TUT"],["H360F",0,"APVR;GUA;TUT"],["H360FD",0,"APVR;GUA;TUT"],
  ["H361",6,"APVR;GUA"],["H361d",6,"APVR;GUA"],["H361f",6,"APVR;GUA"],["H362",4,"GUA"],
  ["H370",8,"APVR;GUA;OCC"],["H371",6,"APVR;GUA"],["H372",8,"APVR;GUA;OCC"],["H373",6,"APVR;GUA"],
  ["H400",2,""],["H410",2,""],["H411",2,""],["H412",1,""],["H413",1,""],["H420",2,""],
  ["EUH014",3,"OCC;GUA"],["EUH018",3,"APVR;OCC;GUA"],["EUH019",3,"OCC;GUA"],["EUH029",5,"APVR;GUA"],["EUH031",5,"APVR;GUA"],
  ["EUH032",7,"APVR;GUA"],["EUH044",3,"OCC;GUA"],["EUH059",2,""],["EUH066",3,"GUA"],["EUH070",5,"OCC;GUA"],["EUH071",5,"APVR"],
  ["EUH201",3,"GUA"],["EUH202",3,"OCC;GUA"],["EUH203",5,"GUA"],["EUH204",5,"APVR;GUA"],["EUH205",4,"GUA"],["EUH208",3,"GUA"],
  ["EUH209",2,"OCC;GUA"],["EUH210",0,""],["EUH211",0,"APVR;OCC"],["EUH212",0,"APVR"],["EUH380",6,"APVR;GUA;TUT"],["EUH381",5,"APVR;GUA"]
];
const MAPPA = Object.fromEntries(FRASI.map(f => [f[0].toUpperCase(), f]));
// Frasi che escludono la sostanza dal Capo I (cancerogeni/mutageni/tossici per la riproduzione 1A/1B → Titolo IX Capo II)
const CAPO_II = ["H340", "H350", "H350I", "H360", "H360D", "H360F", "H360FD"];

// Voci ESATTAMENTE come nei menu di Power Apps e in PD_ValChimica (verificate il 20/11/2026 sugli screenshot di Power Apps).
// StatoFisico di PD_ValChimica = proprietà chimico-fisiche (CF).
// PD_ValChimica non ha una colonna "tipo di esposizione": il calcolo è sempre cumulativo (inalatoria + cutanea).
export const SCALE = {
  cf: { titolo: "Stato fisico", voci: [["Solido/nebbie (largo spettro granulometrico)", 1], ["Liquido a bassa volatilità", 2],
    ["Liquido a media/alta volatilità o polveri fini", 3], ["Stato gassoso", 4]] },
  q: { titolo: "Quantità in uso", voci: [["< 0,1 kg", 1], ["0,1 - 1 kg", 2], ["1 - 10 kg", 3], ["10 - 100 kg", 4], ["> 100 kg", 5]] },
  u: { titolo: "Tipologia d'uso", voci: [["Uso in sistema chiuso", 1], ["Uso in inclusione in matrice", 2],
    ["Uso controllato e non dispersivo", 3], ["Uso con dispersione significativa", 4]] },
  c: { titolo: "Tipologia di controllo", voci: [["Contenimento completo", 1], ["Ventilazione - aspirazione locale", 2],
    ["Segregazione - separazione", 3], ["Diluizione - ventilazione", 4], ["Manipolazione diretta", 5]] },
  t: { titolo: "Tempo di esposizione", voci: [["Inferiore a 15 minuti", 1], ["Tra 15 minuti e 2 ore", 2],
    ["Tra 2 e 4 ore", 3], ["Tra 4 e 6 ore", 4], ["Più di 6 ore", 5]] },
  d: { titolo: "Distanza dalla sorgente", voci: [["Inferiore a 1 metro", 1], ["Da 1 a inferiore a 3 metri", 0.75],
    ["Da 3 a inferiore a 5 metri", 0.5], ["Da 5 a inferiore a 10 metri", 0.25], ["Maggiore o uguale a 10 metri", 0.1]] },
  k: { titolo: "Contatto cutaneo", voci: [["Nessun contatto", 1], ["Contatto accidentale", 2], ["Contatto discontinuo", 3], ["Contatto esteso", 4]] }
};

// Riconosce una voce anche se scritta in modo leggermente diverso (maiuscole, spazi, "Kg", vecchie etichette)
const norm = t => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/kg/g, "kg").replace(/[^a-z0-9<>,]+/g, "");
const SINONIMI = {
  q: { "menodi0,1kg": 1, "tra0,1e1kg": 2, "tra1e10kg": 3, "tra10e100kg": 4, "piudi100kg": 5 },
  c: { "aspirazionelocalizzata": 2, "ventilazionegenerale": 4 },
  cf: { "liquidoaltaomediavolatilita": 3, "liquidoadaltaomediavolatilita": 3, "gas": 4, "solidoonebbie": 1, "statosolido": 1 },
  t: { "tra2oree4ore": 3, "tra4oree6ore": 4, "oltre6ore": 5 },
  d: { "da1a3metri": 0.75, "da3a5metri": 0.5, "da5a10metri": 0.25 }
};
export function trovaVoce(scala, testo) {
  const n = norm(testo); if (!n) return null;
  const v = SCALE[scala].voci.find(x => norm(x[0]) === n);
  if (v) return v;
  const s = SINONIMI[scala] && Object.entries(SINONIMI[scala]).find(([k]) => n.startsWith(k) || n.includes(k));
  if (s) return SCALE[scala].voci.find(x => x[1] === s[1]);
  return SCALE[scala].voci.find(x => n.includes(norm(x[0])) || norm(x[0]).includes(n)) || null;
}

export const CLASSI = [
  null,
  { n: 1, testo: "Irrilevante per la salute", priorita: "Bassa" },
  { n: 2, testo: "Intervallo di incertezza", priorita: "Da approfondire" },
  { n: 3, testo: "Non irrilevante", priorita: "Alta" },
  { n: 4, testo: "Rischio elevato", priorita: "Molto alta" },
  { n: 5, testo: "Rischio grave", priorita: "Urgente" }
];
const DPI = { APVR: "protezione delle vie respiratorie", GUA: "guanti EN 374", OCC: "occhiali o visiera EN 166", TUT: "indumenti di protezione chimica" };

const valore = (scala, etichetta) => { const v = trovaVoce(scala, etichetta); return v ? v[1] : null; };
const arrot = n => Math.round(n * 100) / 100;

export function pericolo(frasiH) {
  const codici = (frasiH || []).map(h => String(h).trim().toUpperCase().replace(/\s+/g, ""));
  const capoII = codici.filter(c => CAPO_II.includes(c));
  const note = codici.filter(c => !MAPPA[c]);
  const p = Math.max(0, ...codici.map(c => (MAPPA[c] ? MAPPA[c][1] : 0)));
  const dpi = [...new Set(codici.flatMap(c => (MAPPA[c] ? MAPPA[c][2].split(";") : [])).filter(Boolean))];
  return { p, capoII, sconosciute: note, dpi: dpi.map(k => DPI[k]) };
}

export function classe(r) { return r < 15 ? 1 : r < 21 ? 2 : r < 40 ? 3 : r < 80 ? 4 : 5; }

// v = { cf, q, u, c, t, d, k } con le etichette delle scale (esposizione sempre cumulativa, come in PD_ValChimica)
export function calcola(frasiH, v) {
  const P = pericolo(frasiH);
  const cf = valore("cf", v.cf), q = valore("q", v.q), u = valore("u", v.u), c = valore("c", v.c),
    t = valore("t", v.t), d = valore("d", v.d), k = valore("k", v.k), tipo = "cum";
  const out = { p: P.p, dpi: P.dpi, capoII: P.capoII, eInal: null, eCute: null, rInal: null, rCute: null, r: null, classe: null, completa: false };
  if ([cf, q, u, c, t, d].every(x => x != null)) out.eInal = arrot((cf + q + u + c + t) * d * 0.5);
  if (u != null && k != null) out.eCute = arrot((u + k) * 1.5);
  if (tipo !== "cute" && out.eInal != null) out.rInal = arrot(P.p * out.eInal);
  if (tipo !== "inal" && out.eCute != null) out.rCute = arrot(P.p * out.eCute);
  const servonoInal = tipo !== "cute", servonoCute = tipo !== "inal";
  out.completa = (!servonoInal || out.rInal != null) && (!servonoCute || out.rCute != null);
  if (out.completa) {
    out.r = arrot(Math.sqrt((out.rInal || 0) ** 2 + (out.rCute || 0) ** 2));
    out.classe = CLASSI[classe(out.r)];
  }
  return out;
}
