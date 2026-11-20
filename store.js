// Memoria sul tablet (IndexedDB): dati scaricati e bozze, disponibili anche senza rete
const DB = "pilota-dvr", ST = "kv";

function apri() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ST);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}

export async function leggi(chiave) {
  const db = await apri();
  return new Promise((ok, ko) => {
    const r = db.transaction(ST).objectStore(ST).get(chiave);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}

export async function scrivi(chiave, valore) {
  const db = await apri();
  return new Promise((ok, ko) => {
    const t = db.transaction(ST, "readwrite");
    t.objectStore(ST).put(valore, chiave);
    t.oncomplete = () => ok();
    t.onerror = () => ko(t.error);
  });
}

export async function chiavi(prefisso) {
  const db = await apri();
  return new Promise((ok, ko) => {
    const r = db.transaction(ST).objectStore(ST).getAllKeys();
    r.onsuccess = () => ok(r.result.filter(k => String(k).startsWith(prefisso)));
    r.onerror = () => ko(r.error);
  });
}

export async function cancella(chiave) {
  const db = await apri();
  return new Promise((ok, ko) => {
    const t = db.transaction(ST, "readwrite");
    t.objectStore(ST).delete(chiave);
    t.oncomplete = () => ok();
    t.onerror = () => ko(t.error);
  });
}
