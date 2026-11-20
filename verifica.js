// Strumento di verifica: legge nomi e tipi delle colonne di tutte le liste PD_ (sezione 5 del documento di avvio)
import { initAuth, graphTutto, sito } from "./auth.js";

const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
const TIPI = ["text", "choice", "number", "dateTime", "boolean", "lookup", "personOrGroup", "calculated", "currency", "hyperlinkOrPicture"];
const NASCOSTE = /^(ContentType|Attachments|_|LinkTitle|Edit|DocIcon|ItemChildCount|FolderChildCount|AppAuthor|AppEditor|ComplianceAssetId)/;
let risultato = null;

async function avvio() {
  try {
    const acc = await initAuth();
    if (!acc) { $("stato").innerHTML = 'Prima accedi dall\'<a href="./">app</a>, poi torna qui.'; return; }
    const s = await sito();
    $("stato").innerHTML = "✔ " + esc(acc.username) + " · sito <b>" + esc(s.displayName) + "</b> – <code>" + esc(s.webUrl) + "</code>";
    $("leggi").disabled = false;
  } catch (e) {
    $("stato").innerHTML = '<div class="errore">' + esc(e.message) + "</div>";
  }
}

async function leggi() {
  $("leggi").disabled = true;
  $("esito").textContent = "Lettura in corso…";
  try {
    const s = await sito();
    const liste = await graphTutto("/sites/" + s.id + "/lists?$select=id,name,displayName&$top=200");
    const pd = liste.filter(l => /^PD_/i.test(l.displayName) || /^PD_/i.test(l.name))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    risultato = { data: new Date().toISOString(), sito: s.webUrl, liste: [] };
    for (const l of pd) {
      const colonne = await graphTutto("/sites/" + s.id + "/lists/" + l.id + "/columns");
      risultato.liste.push({
        nomeVisibile: l.displayName, nomeInterno: l.name, id: l.id,
        colonne: colonne
          .filter(c => (!c.readOnly || c.name === "Title") && !NASCOSTE.test(c.name))
          .map(c => ({
            nomeInterno: c.name, nomeVisibile: c.displayName,
            tipo: Object.keys(c).find(k => TIPI.includes(k)) || "?",
            scelte: c.choice ? c.choice.choices : undefined
          }))
      });
    }
    $("esito").innerHTML = risultato.liste.map(l =>
      "<details><summary><b>" + esc(l.nomeVisibile) + "</b> (" + l.colonne.length + " colonne)</summary><table><thead><tr>" +
      "<th>Nome interno (Graph)</th><th>Nome visibile</th><th>Tipo</th><th>Scelte</th></tr></thead><tbody>" +
      l.colonne.map(c => "<tr><td><code>" + esc(c.nomeInterno) + "</code></td><td>" + esc(c.nomeVisibile) +
        "</td><td>" + esc(c.tipo) + "</td><td>" + esc((c.scelte || []).join(" / ")) + "</td></tr>").join("") +
      "</tbody></table></details>").join("") || "Nessuna lista PD_ trovata.";
    $("scarica").hidden = false;
  } catch (e) {
    $("esito").innerHTML = '<div class="errore">' + esc(e.message) + "</div>";
  }
  $("leggi").disabled = false;
}

$("leggi").onclick = leggi;
$("scarica").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(risultato, null, 2)], { type: "application/json" }));
  a.download = "PD_liste_colonne.json";
  a.click();
};
avvio();
