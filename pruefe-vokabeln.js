// Prüft vokabeln.js auf Doppelte, Formatfehler und Auswählbarkeit.
// Aufruf: node pruefe-vokabeln.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const datei = path.join(__dirname, "vokabeln.js");
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(datei, "utf8") + "\nthis.VOKABELN_STUFEN = VOKABELN_STUFEN;", ctx);
const STUFEN = ctx.VOKABELN_STUFEN;

const SOLL_PRO_STUFE = 300;
const WORTARTEN = ["v", "s", "a", "adv", "pron", "praep", "konj", "num"];
const VERB_ENDUNG = /(are|ere|ire|ari|eri|iri|i|esse|posse|isse|ferre|velle|nolle|malle)$/;
const LATEIN = /^[a-z]+$/;
const DEUTSCH = /^[A-Za-zÄÖÜäöüß ,()\-]+$/;

const fehler = [];
const warnungen = [];

// --- gleiche Logik wie in vokabel-quiz.html ---
function bedeutungen(deutsch) {
  return deutsch
    .replace(/\([^)]*\)/g, "")
    .split(",")
    .map(b => b.trim().toLowerCase().replace(/^sich /, ""))
    .filter(Boolean);
}
function istSynonym(a, b) {
  if (a.gruppe && a.gruppe === b.gruppe) return true;
  const bb = bedeutungen(b.deutsch);
  return bedeutungen(a.deutsch).some(x => bb.includes(x));
}
// ------------------------------------------------

if (!STUFEN || typeof STUFEN !== "object") {
  console.error("FEHLER: VOKABELN_STUFEN nicht gefunden.");
  process.exit(1);
}

const erwarteteStufen = ["beginner", "intermediate", "professional"];
for (const s of erwarteteStufen) if (!Array.isArray(STUFEN[s])) fehler.push(`Stufe "${s}" fehlt.`);
for (const s of Object.keys(STUFEN)) if (!erwarteteStufen.includes(s)) fehler.push(`Unbekannte Stufe "${s}".`);

const gesehen = new Map(); // latein -> "stufe #nr"
const gruppenZaehler = new Map();
const statistik = {};

for (const stufe of erwarteteStufen) {
  const liste = STUFEN[stufe] || [];
  statistik[stufe] = {};
  if (liste.length !== SOLL_PRO_STUFE) fehler.push(`${stufe}: ${liste.length} Einträge statt ${SOLL_PRO_STUFE}.`);

  const objekte = [];
  liste.forEach((e, i) => {
    const wo = `${stufe} #${i + 1}`;
    if (!Array.isArray(e) || e.length < 3 || e.length > 4) { fehler.push(`${wo}: kein Array mit 3–4 Feldern: ${JSON.stringify(e)}`); return; }
    if (e.some(f => typeof f !== "string" || f === "" || f !== f.trim())) { fehler.push(`${wo}: leeres Feld oder Leerzeichen am Rand: ${JSON.stringify(e)}`); return; }
    const [latein, deutsch, wortart, gruppe] = e;
    if (!LATEIN.test(latein)) fehler.push(`${wo}: Latein "${latein}" enthält ungültige Zeichen.`);
    if (!DEUTSCH.test(deutsch)) fehler.push(`${wo}: Deutsch "${deutsch}" enthält ungültige Zeichen.`);
    if (/  |, ,|,$|^,/.test(deutsch)) fehler.push(`${wo}: Deutsch "${deutsch}" hat doppelte Leerzeichen oder Kommas.`);
    if (!WORTARTEN.includes(wortart)) fehler.push(`${wo}: unbekannte Wortart "${wortart}".`);
    if (wortart === "v" && !VERB_ENDUNG.test(latein)) fehler.push(`${wo}: Verb "${latein}" ist nicht im Infinitiv.`);
    if (gesehen.has(latein)) fehler.push(`${wo}: "${latein}" doppelt (schon in ${gesehen.get(latein)}).`);
    else gesehen.set(latein, wo);
    if (gruppe) gruppenZaehler.set(`${stufe}:${gruppe}`, (gruppenZaehler.get(`${stufe}:${gruppe}`) || 0) + 1);
    statistik[stufe][wortart] = (statistik[stufe][wortart] || 0) + 1;
    objekte.push({ latein, deutsch, wortart, gruppe });
  });

  // gleiche deutsche Texte innerhalb der Stufe
  const deutschTexte = new Map();
  for (const o of objekte) {
    const k = o.deutsch.toLowerCase();
    if (deutschTexte.has(k)) warnungen.push(`${stufe}: "${o.latein}" und "${deutschTexte.get(k)}" haben denselben deutschen Text "${o.deutsch}".`);
    else deutschTexte.set(k, o.latein);
  }

  // Auswählbarkeit: mindestens 3 Ablenker in beiden Richtungen
  for (const frage of objekte) {
    const kandidaten = objekte.filter(v => v !== frage && !istSynonym(v, frage));
    for (const feld of ["deutsch", "latein"]) {
      const texte = new Set(kandidaten.map(v => v[feld]).filter(t => t !== frage[feld]));
      if (texte.size < 3) fehler.push(`${stufe}: "${frage.latein}" hat nur ${texte.size} mögliche falsche Antworten (${feld}).`);
    }
  }
}

for (const [k, n] of gruppenZaehler) if (n < 2) warnungen.push(`Gruppe "${k}" hat nur ein Mitglied.`);

// --- Ausgabe ---
console.log("Vokabelprüfung");
console.log("==============");
for (const stufe of erwarteteStufen) {
  const n = (STUFEN[stufe] || []).length;
  const arten = Object.entries(statistik[stufe]).map(([k, v]) => `${k}=${v}`).join(", ");
  console.log(`${stufe.padEnd(13)} ${String(n).padStart(3)} Einträge  (${arten})`);
}
console.log(`Gesamt:       ${gesehen.size} verschiedene lateinische Wörter`);
console.log("");
if (warnungen.length) {
  console.log(`Warnungen (${warnungen.length}):`);
  warnungen.forEach(w => console.log("  - " + w));
  console.log("");
}
if (fehler.length) {
  console.log(`FEHLER (${fehler.length}):`);
  fehler.forEach(f => console.log("  - " + f));
  process.exit(1);
}
console.log("Keine Fehler gefunden. ✓");
