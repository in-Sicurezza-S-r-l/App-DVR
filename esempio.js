// Dati di ESEMPIO, tutti inventati (persone e aziende), per vedere l'app senza accesso a SharePoint
const anno = new Date().getFullYear();
export const UTENTE_ESEMPIO = { name: "Anna Esempio", username: "anna.esempio@esempio.it" };

export const PACCHETTO_ESEMPIO = {
  scaricatoIl: new Date().toISOString(),
  haTecnico: true,
  haMese: true,
  tecnici: {
    "anna.esempio@esempio.it": "Anna Esempio",
    "bruno.prova@esempio.it": "Bruno Prova",
    "carla.demo@esempio.it": "Carla Demo"
  },
  aziende: [
    ["Officina Demo S.r.l.", "000000000000901", "anna.esempio@esempio.it", 10],
    ["Bar Esempio di Rossi Mario", "000000000000902", "anna.esempio@esempio.it", 10],
    ["Panificio Prova S.n.c.", "000000000000903", "anna.esempio@esempio.it", 11],
    ["Agriturismo Gamma", "000000000000904", "anna.esempio@esempio.it", 2],
    ["Ferramenta Delta", "000000000000905", "anna.esempio@esempio.it", 0],
    ["Studio Tecnico Alfa", "000000000000906", "bruno.prova@esempio.it", 11],
    ["Carpenteria Beta S.r.l.", "000000000000907", "carla.demo@esempio.it", 0],
    ["Lavanderia Epsilon", "000000000000908", "bruno.prova@esempio.it", 10]
  ].map(([nome, codice, tecnicoEmail, mese], i) => ({
    idLista: String(i + 1), nome, codice, cartella: "Clienti\\" + nome, attiva: true, tecnicoEmail, mese, note: ""
  })),
  sopralluoghi: [
    { id: "SOP-" + anno + "0312-093000", codice: "000000000000904", data: anno + "-03-12", tecnico: "Anna Esempio" }
  ]
};

export const BOZZE_ESEMPIO = new Set(["000000000000902"]);

// Date relative a oggi, così l'esempio mostra sempre corsi validi, in scadenza e scaduti
function d(anni, mesi = 0, giorni = 0) {
  const x = new Date(); x.setFullYear(x.getFullYear() + anni, x.getMonth() + mesi, x.getDate() + giorni);
  return x.toISOString().slice(0, 10);
}

// Scheda completa di un'azienda di esempio (la stessa per tutte, cambia solo il nome)
export function aziendaEsempio(azienda) {
  const L = (id, nome, mansioni, extra = {}) => ({ id, idLista: id, nome, reparto: "Produzione", mansioni, stato: "ATTIVO",
    dataIngresso: d(-4), addettoAI: false, addettoPS: false, rls: false, preposto: false, ...extra });
  const F = (lav, corso, data, scad, stato = "REGISTRATA") => ({ id: lav + corso + data, lavoratore: lav, corso, data, scadenza: scad, stato });
  return {
    codice: azienda.codice,
    scaricatoIl: new Date().toISOString(),
    anagrafica: {
      ragioneSociale: azienda.nome, sedeLegale: "Via dell'Esempio 12, Udine (UD)", sedeOperativa: "Via dell'Esempio 12, Udine (UD)",
      partitaIva: "01234567890", email: "info@esempio.it", telefono: "0432 000000", cellulare: "",
      datoreLavoro: "Mario Rossi", rspp: "Mario Rossi (datore di lavoro)", medicoCompetente: "Dott.ssa Laura Medici",
      rls: "Territoriale", preposti: "Luca Verdi"
    },
    mansioni: ["Meccanico", "Addetto_magazzino", "Impiegata_amm", "Datore di lavoro"],
    lavoratori: [
      L("L1", "Anna Bianchi", ["Impiegata_amm"], { reparto: "Ufficio", addettoAI: true, addettoPS: true }),
      L("L2", "Luca Verdi", ["Meccanico", "Addetto_magazzino"], { addettoAI: true, preposto: true }),
      L("L3", "Marta Neri", ["Meccanico"]),
      L("L4", "Sara Blu", ["Impiegata_amm"], { reparto: "Ufficio", dataIngresso: d(0, -3) })
    ],
    formazione: [
      F("Anna Bianchi", "Formazione Rischio BASSO - 8 ore", d(-7), ""),
      F("Anna Bianchi", "Aggiornamento formazione - 6 ore", d(-2), d(3)),
      F("Anna Bianchi", "ANTINCENDIO Livello 1 - 4 ore", d(-5, 0, -20), d(0, 0, -20)),
      F("Anna Bianchi", "PRONTO SOCCORSO Gruppo B - 12 ore", d(-2), d(1)),
      F("Luca Verdi", "Formazione Rischio ALTO - 16 ore", d(-4), d(1)),
      F("Luca Verdi", "ANTINCENDIO Livello 2 - 8 ore", d(-6), ""),
      F("Luca Verdi", "Aggiornamento ANTINCENDIO Livello 2 - 5 ore", d(-1), d(4)),
      F("Luca Verdi", "Carrelli elevatori - 12 ore", d(-5, 2), d(0, 2)),
      F("Luca Verdi", "Preposti - 12 ore", d(-1, -6), d(1, 6)),
      F("Marta Neri", "Formazione Rischio ALTO - 16 ore", d(-2), d(3)),
      F("Marta Neri", "Lavori in quota e DPI di III categoria", d(-3), d(2)),
      F("Sara Blu", "Formazione Rischio BASSO - 8 ore", "", "", "DA FARE")
    ],
    attrezzature: [
      { id: "A1", nome: "Ponte sollevatore", marca: "Rotary SPOA3", mansioni: ["Meccanico"], stato: "ATTIVA" },
      { id: "A2", nome: "Compressore", marca: "Fini", mansioni: ["Meccanico"], stato: "ATTIVA" },
      { id: "A3", nome: "Carrello elevatore", marca: "Linde H20", mansioni: ["Addetto_magazzino"], stato: "ATTIVA" },
      { id: "A4", nome: "Saldatrice", marca: "Telwin", mansioni: ["Meccanico", "Datore di lavoro"], stato: "ATTIVA" },
      { id: "A5", nome: "Videoterminale", marca: "-", mansioni: ["Impiegata_amm"], stato: "ATTIVA" }
    ],
    sostanze: [
      { id: "S1", nome: "Sgrassante spray", produttore: "Chimica Esempio", statoFisico: "aerosol", frasiH: ["H222", "H229", "H315"],
        mansioni: ["Meccanico"], sds: true, revisione: "03/2024", esito: "irrilevante per la salute" },
      { id: "S2", nome: "Olio motore 10W40", produttore: "Lubrificanti Prova", statoFisico: "liquido", frasiH: ["H304"],
        mansioni: ["Meccanico"], sds: true, revisione: "11/2023", esito: "irrilevante per la salute" },
      { id: "S3", nome: "Diluente nitro", produttore: "Vernici Demo", statoFisico: "liquido", frasiH: ["H225", "H304", "H336", "H373"],
        mansioni: ["Meccanico"], sds: false, revisione: "", esito: "" }
    ],
    prescrizioni: [
      { id: "P1", zona: "Officina", testo: "Ripristinare le protezioni laterali del ponte sollevatore", foto: ["esempio-1", "esempio-2"], stato: "APERTA", dataApertura: d(-1) },
      { id: "P2", zona: "Generale", testo: "Far eseguire la verifica periodica dell'impianto di messa a terra", foto: [], stato: "APERTA", dataApertura: d(-1) },
      { id: "P3", zona: "Magazzino", testo: "Delimitare a terra le corsie del carrello elevatore", foto: ["esempio-3"], stato: "APERTA", dataApertura: d(-1) }
    ],
    valChimica: [
      { sostanza: "Sgrassante spray", mansione: "Meccanico", cf: "Stato solido / nebbie", q: "< 0,1 kg",
        u: "Uso controllato e non dispersivo", c: "Diluizione - ventilazione", t: "Inferiore a 15 minuti", d: "Da 1 a 3 metri", k: "Contatto accidentale",
        data: d(-1), tecnico: "Anna Esempio" },
      { sostanza: "Olio motore 10W40", mansione: "Meccanico", cf: "Liquido a bassa volatilità", q: "1 - 10 kg",
        u: "Uso controllato e non dispersivo", c: "Diluizione - ventilazione", t: "Tra 15 minuti e 2 ore", d: "Inferiore a 1 metro", k: "Contatto discontinuo",
        data: d(-1), tecnico: "Anna Esempio" }
    ],
    impianto: { dicoPresente: "Sì", dicoDitta: "Elettrica Esempio S.n.c.", dicoData: "2014-01-15",
      terraData: d(-2, -5), terraOrganismo: "Organismo Esempio", terraPeriodicita: "2 anni" },
    catalogoCorsi: [
      { nome: "Formazione Rischio BASSO - 8 ore", giorni: 1826 }, { nome: "Formazione Rischio MEDIO - 12 ore", giorni: 1826 },
      { nome: "Formazione Rischio ALTO - 16 ore", giorni: 1826 }, { nome: "Aggiornamento formazione - 6 ore", giorni: 1826 },
      { nome: "ANTINCENDIO Livello 1 - 4 ore", giorni: 1826 }, { nome: "ANTINCENDIO Livello 2 - 8 ore", giorni: 1826 },
      { nome: "PRONTO SOCCORSO Gruppo B - 12 ore", giorni: 1095 }, { nome: "Aggiornamento PRONTO SOCCORSO - 4 ore", giorni: 1095 },
      { nome: "Preposti - 12 ore", giorni: 730 }, { nome: "Carrelli elevatori - 12 ore", giorni: 1826 },
      { nome: "Lavori in quota e DPI di III categoria", giorni: 1826 }
    ],
    catalogoPrescrizioni: [
      { zona: "Generale", testo: "Aggiornare la cassetta di primo soccorso secondo il D.M. 388/2003" },
      { zona: "Generale", testo: "Verificare la segnaletica delle vie di esodo e delle uscite di emergenza" },
      { zona: "Generale", testo: "Far eseguire la verifica periodica dell'impianto di messa a terra" },
      { zona: "Officina", testo: "Ripristinare le protezioni delle parti in movimento delle macchine" },
      { zona: "Magazzino", testo: "Fissare le scaffalature a parete e indicarne la portata massima" }
    ]
  };
}
