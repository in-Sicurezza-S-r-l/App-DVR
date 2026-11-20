// Impostazioni dell'app (registrazione Entra ID "in-Sicurezza").
// ATTENZIONE: questo file è pubblico. Non scrivere qui nomi, email, password o dati dei clienti.
window.PD_CONFIG = {
  clientId: "9d010eda-e546-4222-ab82-80f9ada0e529",
  tenantId: "7e9c9ac5-7a7f-4702-8466-d2e3b994b872",
  sitoHost: "insicurezzasrl.sharepoint.com",
  sitoPercorso: "/sites/InsicurezzaSRL",
  scopes: ["User.Read", "Sites.ReadWrite.All", "Files.ReadWrite.All"],
  // I nomi dei tecnici si leggono dopo l'accesso dalla lista SharePoint PD_Tecnici
  // (colonne: Title = nome, Email). Se la lista non c'è, il nome si ricava dall'email.
  listaTecnici: "PD_Tecnici"
};
