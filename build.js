/*
 * Assemble les modules + l'entrée en UN SEUL fichier .jsx auto-suffisant
 * (pas d'include à résoudre côté AE). Retire les lignes d'export Node.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const MODULES = ["json.jsx", "curves.jsx", "engine.jsx", "inspect.jsx", "actions.jsx", "bridge.jsx", "presets.jsx"];
const EXPORT_RE = /^if \(typeof module !== "undefined".*$/;

function readModule(f) {
  return fs.readFileSync(path.join(__dirname, "src", f), "utf8")
    .split("\n")
    .filter(l => !EXPORT_RE.test(l))
    .join("\n");
}

function bundle(entryFile, outName) {
  const parts = MODULES.map(readModule);
  parts.push(fs.readFileSync(path.join(__dirname, "src", entryFile), "utf8"));
  const header = "// Rigwink " + outName + " — fichier unique généré par build.js, ne pas éditer à la main.\n" +
    "// Sources : src/*.jsx | Statut : logique testée en Node (mock AE), NON exécutée dans After Effects.\n";
  fs.mkdirSync(path.join(__dirname, "dist"), { recursive: true });
  const out = path.join(__dirname, "dist", outName);
  fs.writeFileSync(out, header + parts.join("\n\n"));
  console.log("built dist/" + outName + " (" + fs.statSync(out).size + " octets)");
}

bundle("panel.jsx", "Rigwink.jsx");
bundle("run-spec.jsx", "Rigwink Run Spec.jsx");
