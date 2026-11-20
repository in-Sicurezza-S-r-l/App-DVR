// Accesso Microsoft (MSAL) e chiamate a Microsoft Graph
const C = window.PD_CONFIG;
const GRAPH = "https://graph.microsoft.com/v1.0";

const msalApp = new msal.PublicClientApplication({
  auth: {
    clientId: C.clientId,
    authority: "https://login.microsoftonline.com/" + C.tenantId,
    // la cartella dove si trova l'app (es. http://localhost:5173/ oppure https://nome.github.io/progetto/)
    redirectUri: new URL("./", window.location.href).href
  },
  cache: { cacheLocation: "localStorage" }
});

let account = null;

export async function initAuth() {
  await msalApp.initialize();
  const r = await msalApp.handleRedirectPromise();
  account = (r && r.account) || msalApp.getAllAccounts()[0] || null;
  if (account) msalApp.setActiveAccount(account);
  return account;
}

export const getAccount = () => account;
export const login = () => msalApp.loginRedirect({ scopes: C.scopes, prompt: "select_account" });
export const logout = () => msalApp.logoutRedirect({ account });

async function token() {
  try {
    const r = await msalApp.acquireTokenSilent({ scopes: C.scopes, account });
    return r.accessToken;
  } catch (e) {
    if (e instanceof msal.InteractionRequiredAuthError) {
      await msalApp.acquireTokenRedirect({ scopes: C.scopes, account });
    }
    throw e;
  }
}

export async function graph(percorso) {
  const url = percorso.startsWith("http") ? percorso : GRAPH + percorso;
  const r = await fetch(url, { headers: { Authorization: "Bearer " + (await token()) } });
  if (!r.ok) {
    let msg = r.status + " " + r.statusText;
    try { const j = await r.json(); msg += " – " + (j.error && j.error.message); } catch (_) {}
    const err = new Error(msg + "\n(" + percorso + ")");
    err.status = r.status;
    throw err;
  }
  return r.json();
}

// Legge tutte le pagine di un elenco Graph
export async function graphTutto(percorso) {
  let out = [], url = percorso;
  while (url) {
    const j = await graph(url);
    out = out.concat(j.value || []);
    url = j["@odata.nextLink"];
  }
  return out;
}

let sitoCache = null;
export async function sito() {
  if (!sitoCache) {
    sitoCache = await graph("/sites/" + C.sitoHost + ":" + C.sitoPercorso + "?$select=id,displayName,webUrl");
  }
  return sitoCache;
}
