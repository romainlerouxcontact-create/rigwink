/*
 * Rigwink — panneau dockable After Effects (ScriptUI), v0.7
 * NON testé dans AE à ce stade : la logique métier (json/curves/engine/
 * inspect/actions/bridge) est testée en Node contre un mock du DOM AE ;
 * l'affichage, le dockage et l'I/O fichier réels restent à vérifier dans AE.
 *
 * Ce fichier est assemblé en UN SEUL .jsx par build.js (modules + UI) :
 * aucun include à résoudre à l'exécution. Installer le fichier généré
 * (dist/Rigwink.jsx) dans <After Effects>/Support Files/Scripts/ScriptUI Panels/
 * puis Fenêtre > Rigwink. Préférence AE requise : "Allow Scripts to Write
 * Files and Access Network" (sinon le pont échoue et le panneau le nomme).
 *
 * Le panneau n'embarque ni IA ni réseau. Aller-retour pont :
 *   consigne -> ~/Rigwink-bridge/in/   (écrit par le panneau)
 *   spec     -> ~/Rigwink-bridge/out/  (écrite par l'agent externe, ex. Claude Code)
 *   résultat -> ~/Rigwink-bridge/out/result-<ts>.json (succès OU erreur)
 */
(function (thisObj) {
  var BRIDGE = new Folder("~/Rigwink-bridge");
  var BRIDGE_IN = new Folder(BRIDGE.fsName + "/in");
  var BRIDGE_OUT = new Folder(BRIDGE.fsName + "/out");

  function ensureBridge() {
    var ok = true;
    if (!BRIDGE.exists) ok = BRIDGE.create() && ok;
    if (!BRIDGE_IN.exists) ok = BRIDGE_IN.create() && ok;
    if (!BRIDGE_OUT.exists) ok = BRIDGE_OUT.create() && ok;
    return ok;
  }

  var PREF_HINT = "Vérifie la préférence AE : General > Allow Scripts to Write Files and Access Network.";

  function writeJson(file, obj) {
    file.encoding = "UTF-8";
    if (!file.open("w")) return false;
    file.write(RWJSON.stringify(obj));
    file.close();
    return true;
  }

  function status(win, msg) { win.statusRow.text = msg; }

  function applySpecObject(win, spec, origin, resultName) {
    var r = RWActions.run("motion.apply", { spec: spec });
    var res = RWBridge.makeResult("motion.apply", r.ok, r.ok ? r.result : r.error);
    if (ensureBridge()) {
      // Nom lié à la spec quand elle vient du pont : dédoublonnage.
      var fname = resultName || ("result-" + new Date().getTime() + ".json");
      writeJson(new File(BRIDGE_OUT.fsName + "/" + fname), res);
    }
    var warn = (r.ok && r.result && r.result.warnings && r.result.warnings.length)
      ? " — " + r.result.warnings.length + " avertissement(s) dans le fichier résultat" : "";
    status(win, r.ok
      ? "Comp \"" + r.result.comp + "\" construite (" + r.result.numLayers + " calques) [" + origin + "]" + warn + "."
      : "Erreur (" + origin + "): " + r.error);
    return r;
  }

  function applySpecFile(win) {
    var f = File.openDialog("Choisir une spec JSON", "*.json");
    if (!f) return;
    f.encoding = "UTF-8";
    if (!f.open("r")) { status(win, "Lecture impossible. " + PREF_HINT); return; }
    var txt = f.read(); f.close();
    var spec;
    try { spec = RWBridge.parseSpecText(txt); }
    catch (e) { status(win, e.message); return; }
    applySpecObject(win, spec, "fichier");
  }

  function applyLatestFromBridge(win) {
    if (!ensureBridge()) { status(win, "Pont inaccessible. " + PREF_HINT); return; }
    var raw = BRIDGE_OUT.getFiles("*.json");
    var files = [];
    for (var i = 0; i < raw.length; i++) {
      files.push({ name: raw[i].name, modified: raw[i].modified ? raw[i].modified.getTime() : 0 });
    }
    var name = RWBridge.newestJson(files);
    if (!name) { status(win, "Aucune spec en attente dans " + BRIDGE_OUT.fsName); return; }
    var f = new File(BRIDGE_OUT.fsName + "/" + name);
    f.encoding = "UTF-8";
    if (!f.open("r")) { status(win, "Lecture impossible: " + name + ". " + PREF_HINT); return; }
    var txt = f.read(); f.close();
    var spec;
    try { spec = RWBridge.parseSpecText(txt); }
    catch (e) { status(win, name + ": " + e.message); return; }
    applySpecObject(win, spec, name, RWBridge.resultNameFor(name));
  }

  function inspectActive(win) {
    var r = RWActions.run("comp.inspect", { deep: true });
    if (!r.ok) { status(win, "Inspection: " + r.error); return; }
    if (!ensureBridge()) { status(win, "Pont inaccessible. " + PREF_HINT); return; }
    var ok = writeJson(new File(BRIDGE_IN.fsName + "/inspect-" + new Date().getTime() + ".json"), r.result);
    status(win, ok ? ("Inspection écrite dans " + BRIDGE_IN.fsName) : ("Écriture impossible. " + PREF_HINT));
  }

  function sendConsigne(win) {
    var txt = win.consigneRow.field.text;
    if (!txt) { status(win, "Consigne vide."); return; }
    if (!ensureBridge()) { status(win, "Pont inaccessible. " + PREF_HINT); return; }
    var ok = writeJson(new File(BRIDGE_IN.fsName + "/consigne-" + new Date().getTime() + ".json"), {
      type: "consigne", text: txt, ts: new Date().toString()
    });
    status(win, ok ? ("Consigne déposée dans " + BRIDGE_IN.fsName) : ("Écriture impossible. " + PREF_HINT));
  }

  // Labels courts distincts (une lettre ne suffisait pas : C x3).
  var SECTIONS = [
    ["CH", "CHAT"], ["MO", "MOTION"], ["CA", "CAMERAS"], ["RE", "REFERENCES"],
    ["CO", "CONNECTEURS"], ["HI", "HISTORIQUE"], ["PA", "PARAMETRES"]
  ];

  function buildUI(thisObj) {
    var win = (thisObj instanceof Panel)
      ? thisObj
      : new Window("palette", "Rigwink", undefined, { resizeable: true });
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.margins = 10; win.spacing = 6;
    win.preferredSize.width = 340;

    var tabs = win.add("group"); tabs.orientation = "row"; tabs.spacing = 2;
    var pages = win.add("group"); pages.orientation = "stacked"; pages.alignChildren = ["fill", "fill"];
    win._pages = {};

    function addPage(name) {
      var g = pages.add("group"); g.orientation = "column"; g.alignChildren = ["fill", "top"];
      g.visible = false; win._pages[name] = g; return g;
    }
    function show(name) {
      for (var k in win._pages) win._pages[k].visible = (k === name);
      win.layout.layout(true);
    }

    var pChat = addPage("CHAT");
    pChat.add("statictext", undefined, "Consigne (traitée par l'agent externe via le dossier-pont) :");
    win.consigneRow = pChat.add("group"); win.consigneRow.orientation = "column";
    win.consigneRow.field = win.consigneRow.add("edittext", undefined, "", { multiline: true, scrolling: true });
    win.consigneRow.field.preferredSize.height = 90;
    var bSend = pChat.add("button", undefined, "Déposer la consigne");
    bSend.onClick = function () { sendConsigne(win); };
    var bApply = pChat.add("button", undefined, "Appliquer la dernière spec du pont");
    bApply.onClick = function () { applyLatestFromBridge(win); };
    var bApplyF = pChat.add("button", undefined, "Appliquer une spec (fichier)…");
    bApplyF.onClick = function () { applySpecFile(win); };

    var pMotion = addPage("MOTION");
    pMotion.add("statictext", undefined, "Moteur v" + RWEngine.VERSION + " — courbes : " + RWCurves.names().join(", "));
    var bSpec = pMotion.add("button", undefined, "Appliquer une spec…");
    bSpec.onClick = function () { applySpecFile(win); };

    var pCam = addPage("CAMERAS");
    pCam.add("statictext", undefined, "Mouvements : dollyIn/Out, push/pull, truck, pan, tilt,");
    pCam.add("statictext", undefined, "orbit, crane, pedestal, roll, zoom optique, whipPan,");
    pCam.add("statictext", undefined, "parallax, handheld, shake, rackFocus.");
    var bCam = pCam.add("button", undefined, "Appliquer une spec caméra…");
    bCam.onClick = function () { applySpecFile(win); };

    var pRef = addPage("REFERENCES");
    pRef.add("statictext", undefined, "Analyse de références vidéo : phase 5, pas encore implémentée.");

    var pConn = addPage("CONNECTEURS");
    pConn.add("statictext", undefined, "Aucun connecteur en v0.x. Aucune donnée ne quitte AE.");

    var pHist = addPage("HISTORIQUE");
    pHist.add("statictext", undefined, "Historique des opérations : à venir (phase 2).");

    var pSet = addPage("PARAMETRES");
    var bInsp = pSet.add("button", undefined, "Inspecter la comp active");
    bInsp.onClick = function () { inspectActive(win); };
    pSet.add("statictext", undefined, "Pont : ~/Rigwink-bridge (in/ consignes, out/ specs + résultats)");

    for (var i = 0; i < SECTIONS.length; i++) {
      (function (code, name) {
        var b = tabs.add("button", undefined, code);
        b.helpTip = name;
        b.preferredSize.width = 40;
        b.onClick = function () { show(name); };
      })(SECTIONS[i][0], SECTIONS[i][1]);
    }

    win.statusRow = win.add("statictext", undefined, "Prêt. Rigwink moteur v" + RWEngine.VERSION + " (logique testée hors AE).");
    win.statusRow.alignment = ["fill", "bottom"];

    win.onResizing = win.onResize = function () { this.layout.resize(); };
    show("CHAT");
    return win;
  }

  var ui = buildUI(thisObj);
  if (ui instanceof Window) { ui.center(); ui.show(); }
  else if (ui.layout) { ui.layout.layout(true); ui.layout.resize(); }
})(this);
