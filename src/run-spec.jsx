/*
 * Rigwink Run Spec v0.3 — exécute une spec JSON hors panneau.
 * NON testé dans AE à ce stade. Assemblé en un seul fichier par build.js
 * (dist/Rigwink Run Spec.jsx) : File > Scripts > Run Script File…
 * Le résultat (succès OU erreur) est écrit à côté de la spec en
 * result-<ts>.json pour que l'agent externe lise l'aller-retour.
 * Préférence AE requise : "Allow Scripts to Write Files and Access Network".
 */
(function () {
  var f = File.openDialog("Choisir une spec JSON", "*.json");
  if (!f) return;
  f.encoding = "UTF-8";
  if (!f.open("r")) {
    alert("Rigwink: lecture impossible. Vérifie la préférence AE " +
      "'Allow Scripts to Write Files and Access Network'.");
    return;
  }
  var txt = f.read(); f.close();
  var spec;
  try {
    spec = RWBridge.parseSpecText(txt);
  } catch (e) { alert("Rigwink: " + e.message); return; }
  var r = RWActions.run("motion.apply", { spec: spec });
  var res = RWBridge.makeResult("motion.apply", r.ok, r.ok ? r.result : r.error);
  var rf = new File(f.parent.fsName + "/result-" + new Date().getTime() + ".json");
  rf.encoding = "UTF-8";
  if (rf.open("w")) { rf.write(RWJSON.stringify(res)); rf.close(); }
  if (r.ok) {
    alert("Rigwink: comp \"" + r.result.comp + "\" construite (" + r.result.numLayers +
      " calques, moteur v" + r.result.engine + ").");
  } else {
    alert("Rigwink erreur [" + r.tool + "]: " + r.error);
  }
})();
