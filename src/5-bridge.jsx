/*
 * Rigwink Bridge v0.7 — logique du dossier-pont, pure et testable hors AE.
 * Parsing STRICT via RWJSON : jamais d'eval (une spec n'est pas du code).
 * L'I/O fichier réelle reste dans panel.jsx et run-spec.jsx.
 */
var RWBridge = (function () {
  var VERSION = "0.7.0";

  function baseOf(name) { return name.replace(/\.json$/i, ""); }

  // Choisit la spec la plus récente NON traitée : une spec ayant déjà son
  // result-<base>.json dans le dossier est ignorée (pas de double application).
  function newestJson(files) {
    var results = {};
    var i;
    for (i = 0; i < files.length; i++) {
      if (/^result-.*\.json$/i.test(files[i].name)) {
        results[baseOf(files[i].name).substring(7)] = true;
      }
    }
    var best = null;
    for (i = 0; i < files.length; i++) {
      var f = files[i];
      if (!/\.json$/i.test(f.name)) continue;
      if (/^result-/.test(f.name)) continue;
      if (results[baseOf(f.name)]) continue; // déjà traitée
      if (!best || f.modified > best.modified) best = f;
    }
    return best ? best.name : null;
  }

  // Nom du fichier résultat associé à une spec (dédoublonnage).
  function resultNameFor(specName) {
    return "result-" + baseOf(specName) + ".json";
  }

  function parseSpecText(txt) {
    if (typeof txt !== "string") throw new Error("texte attendu");
    if (txt.charAt(0) === "\uFEFF") txt = txt.substring(1); // BOM UTF-8
    var stripped = txt.replace(/^\s+|\s+$/g, "");
    if (!stripped) throw new Error("fichier vide");
    try {
      return RWJSON.parse(txt);
    } catch (e) {
      throw new Error("spec illisible: " + e.message);
    }
  }

  function makeResult(tool, ok, payload) {
    var r = { tool: tool, ok: !!ok, ts: new Date().toString() };
    if (ok) { r.result = payload; } else { r.error = String(payload); }
    return r;
  }

  return { newestJson: newestJson, parseSpecText: parseSpecText, makeResult: makeResult, resultNameFor: resultNameFor, VERSION: VERSION };
})();
if (typeof module !== "undefined" && module.exports) module.exports = RWBridge;
