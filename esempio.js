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
