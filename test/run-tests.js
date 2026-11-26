"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const mock = require("./mock-ae.js");

let failures = 0, total = 0;
function check(name, cond, extra) {
  total++;
  if (cond) { console.log("ok   - " + name); }
  else { failures++; console.log("FAIL - " + name + (extra ? " :: " + extra : "")); }
}

const MODULES = ["json.jsx", "curves.jsx", "engine.jsx", "inspect.jsx", "actions.jsx", "bridge.jsx", "presets.jsx"];
function loadAll() {
  const app = mock.makeApp();
  const sandbox = {
    app, KeyframeEase: mock.KeyframeEase, AutoOrientType: mock.AutoOrientType, console
  };
  vm.createContext(sandbox);
  for (const f of MODULES) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8"), sandbox, { filename: f });
  }
  return {
    app,
    RWJSON: sandbox.RWJSON, RWCurves: sandbox.RWCurves, RWEngine: sandbox.RWEngine,
    RWInspect: sandbox.RWInspect, RWActions: sandbox.RWActions, RWBridge: sandbox.RWBridge,
    RWPresets: sandbox.RWPresets
  };
}

function baseSpec(moves, layers) {
  return {
    version: 1,
    comp: { name: "T", width: 1920, height: 1080, fps: 25, duration: 8 },
    layers: layers || [],
    camera: { moves: moves }
  };
}

/* ============ RWJSON : parseur strict, sans eval ============ */
{
  const { RWJSON } = loadAll();
  const doc = RWJSON.parse('{"a":1,"b":[1,-2.5,3e2],"c":"x\\n\\"y\\" \\\\ \\u00e9","d":true,"e":false,"f":null,"g":{"h":[]}}');
  check("parse objets/tableaux/chaînes/nombres", doc.a === 1 && doc.b[1] === -2.5 && doc.b[2] === 300 &&
    doc.c === 'x\n"y" \\ é' && doc.d === true && doc.f === null && doc.g.h.length === 0);
  check("parse whitespace autour", RWJSON.parse('  { "a" : 1 } ').a === 1);
  const bads = ['{"a":1,}', "{'a':1}", '{a:1}', '{"a":undefined}', '[1,]', '{"a":01}', '"abc',
    '{"a":1} garbage', '', '   ', '{"a":NaN}', 'function(){}', '1);alert(1'];
  bads.forEach((b, i) => {
    let threw = false;
    try { RWJSON.parse(b); } catch (e) { threw = true; }
    check("parse rejette entrée invalide #" + i, threw, b);
  });
  // preuve sans eval : une charge piégée ne s'exécute pas
  global.__PWNED__ = false;
  let threw2 = false;
  try { RWJSON.parse('{"x":1}]); global.__PWNED__ = true; //'); } catch (e) { threw2 = true; }
  check("charge piégée non exécutée (pas d'eval)", threw2 && global.__PWNED__ === false);

  // stringify : échappements complets (consigne multiline), NaN/Infinity
  const obj = { t: "ligne1\nligne2\t\"q\" \\ fin", n: NaN, inf: Infinity, u: undefined, ok: 1 };
  const str = RWJSON.stringify(obj);
  const back = JSON.parse(str);
  check("stringify échappe \\n \\t quotes backslash", back.t === obj.t);
  check("stringify NaN/Infinity -> null, undefined omis", back.n === null && back.inf === null && !("u" in back));
  check("round-trip profond", JSON.parse(RWJSON.stringify(doc)).c === doc.c);
}

/* ============ courbes : dimensions d'ease, index réels ============ */
{
  const { RWCurves } = loadAll();
  const app = mock.makeApp();
  const comp = app.project.items.addComp("C", 1920, 1080, 1, 10, 25);
  const solid = comp.layers.addSolid([1, 1, 1], "S", 100, 100, 1, 10);

  let n = RWCurves.apply(solid.property("ADBE Opacity"), 0, 2, 0, 100, "easeInOut");
  check("ease 1D : 2 clés, 1 KeyframeEase", n === 2 && solid.property("ADBE Opacity").eases[1].inE.length === 1);

  n = RWCurves.apply(solid.property("ADBE Scale"), 0, 2, [100, 100, 100], [200, 200, 200], "easeOut");
  check("ease 3D (Scale) : 3 KeyframeEase par clé",
    solid.property("ADBE Scale").eases[1].outE.length === 3 && solid.property("ADBE Scale").eases[2].inE.length === 3);

  n = RWCurves.apply(solid.property("ADBE Position"), 0, 2, [0, 0, 0], [100, 0, 0], "easeIn");
  check("Position spatiale : 1 seule KeyframeEase", solid.property("ADBE Position").eases[1].outE.length === 1);

  // index réels : clés existantes + ordre inversé (t1 posée avant t0)
  const op = solid.property("ADBE Opacity");
  op.setValueAtTime(5, 50); // clé préexistante plus loin
  const before = op.numKeys;
  RWCurves.apply(op, 3, 4, 100, 0, "easeOut");
  check("ease posé sur les BONNES clés malgré clé préexistante",
    !!op.eases[op.nearestKeyIndex(3)] && !!op.eases[op.nearestKeyIndex(4)] && op.eases[op.nearestKeyIndex(5)] === undefined);

  // remplacement même temps : pas de doublon
  const rot = solid.property("ADBE Rotate Z");
  rot.setValueAtTime(1, 10); rot.setValueAtTime(1, 20);
  check("setValueAtTime au même temps remplace", rot.numKeys === 1 && rot.keyValue(1) === 20);

  // sampled overshoot
  n = RWCurves.apply(solid.property("ADBE Scale"), 3, 5, [100, 100, 100], [200, 200, 200], "back");
  const vals = solid.property("ADBE Scale").keys.map(k => k.value[0]);
  check("back : overshoot puis cible exacte", Math.max.apply(null, vals) > 200 && vals[vals.length - 1] === 200);

  // influence bornée
  let clamped = false;
  try { RWCurves.apply(op, 6, 7, 0, 1, "custom", { outInfluence: 500 }); clamped = true; } catch (e) {}
  check("influence >100 bornée (pas d'exception)", clamped);

  check("has() expose toutes les courbes du cahier 4.2",
    ["linear","easeIn","easeOut","easeInOut","cubic","quartic","quintic","exponential","circular","back","bounce","elastic","spring","custom"]
      .every(nm => RWCurves.has(nm)));
}

/* ============ validation moteur (négatifs) ============ */
{
  const { RWEngine } = loadAll();
  const bads = [
    null, {}, { version: 2, comp: {}, camera: {} },
    baseSpec([]),
    baseSpec([{ type: "teleport", t0: 0, t1: 2 }]),
    baseSpec([{ type: "pushIn", t0: 5, t1: 2 }]),
    baseSpec([{ type: "pushIn", t0: 0, t1: 20 }]),
    baseSpec([{ type: "pushIn", t0: 0, t1: 2, params: { amount: "beaucoup" } }]),
    baseSpec([{ type: "pushIn", t0: 0, t1: 2, params: { curve: "nope" } }]),
    baseSpec([{ type: "parallax", t0: 0, t1: 2, params: { depths: { A: "profond" } } }]),
    baseSpec([{ type: "orbit", t0: 0, t1: 4 }, { type: "pan", t0: 2, t1: 6 }]), // chevauchement rigRotY
    baseSpec([{ type: "truck", t0: 0, t1: 4 }, { type: "handheld", t0: 2, t1: 6 }]), // rigPos
    baseSpec([{ type: "dollyIn", t0: 0, t1: 4 }, { type: "parallax", t0: 3, t1: 6 }]), // camPos
    baseSpec([{ type: "tilt", t0: 0, t1: 4 }, { type: "crane", t0: 2, t1: 6 }]), // rigRotX (crane tilt)
    baseSpec([{ type: "zoomIn", t0: 0, t1: 2 }, { type: "zoomOut", t0: 1, t1: 3 }]),
    baseSpec([{ type: "rackFocus", t0: 0, t1: 2 }, { type: "rackFocus", t0: 1, t1: 3 }]),
    baseSpec([{ type: "pushIn", t0: 0, t1: 2 }], [{ type: "text", name: "A", text: "x" }, { type: "solid", name: "A" }]), // doublon
    baseSpec([{ type: "pushIn", t0: 0, t1: 2 }], [{ type: "text", name: "A", text: "x", animate: [{ property: "Hue", t0: 0, t1: 1, from: 0, to: 1 }] }]),
    baseSpec([{ type: "pushIn", t0: 0, t1: 2 }], [{ type: "text", name: "A", text: "x", animate: [{ property: "Opacity", t0: 0, t1: 1, from: 0, to: [1, 2] }] }]),
    baseSpec([{ type: "pushIn", t0: 0, t1: 2 }], [{ type: "text", name: "A", text: "x", animate: "pas un tableau" }]),
    Object.assign(baseSpec([{ type: "pushIn", t0: 0, t1: 2 }]), { comp: { name: "X", width: 2, height: 1080, fps: 25, duration: 8 } }),
    Object.assign(baseSpec([{ type: "pushIn", t0: 0, t1: 2 }]), { comp: { name: "X", width: 1920, height: 1080, fps: 200, duration: 8 } }),
    Object.assign(baseSpec([{ type: "pushIn", t0: 0, t1: 2 }]), { camera: { distance: -5, moves: [{ type: "pushIn", t0: 0, t1: 2 }] } })
  ];
  bads.forEach((b, i) => {
    let threw = false;
    try { RWEngine.validate(b); } catch (e) { threw = true; }
    check("validation rejette spec #" + i, threw);
  });
  // séquences légitimes acceptées
  [
    baseSpec([{ type: "orbit", t0: 0, t1: 4 }, { type: "pan", t0: 4, t1: 8 }]),
    baseSpec([{ type: "orbit", t0: 0, t1: 4 }, { type: "pushIn", t0: 1, t1: 3 }]), // propriétés différentes
    baseSpec([{ type: "truck", t0: 0, t1: 3 }, { type: "crane", t0: 3, t1: 6 }])
  ].forEach((s, i) => {
    let ok = true;
    try { RWEngine.validate(s); } catch (e) { ok = false; }
    check("validation accepte séquence légitime #" + i, ok);
  });
}

/* ============ moteur : exemple complet ============ */
{
  const { RWEngine, app } = loadAll();
  const spec = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "examples", "orbit-text.json"), "utf8"));
  check("spec d'exemple valide", RWEngine.validate(spec) === true);
  const res = RWEngine.applySpec(spec);
  const comp = res.comp;
  check("comp dimensions/fps/durée", comp.width === 1920 && comp.frameRate === 25 && comp.duration === 8);
  check("caméra créée, parentée au rig 3D", res.camera.matchName === "ADBE Camera Layer" && res.camera.parent === res.rig && res.rig.threeDLayer === true);
  check("addCamera reçoit [x,y] et autoOrient NO_AUTO_ORIENT",
    res.camera.autoOrient === mock.AutoOrientType.NO_AUTO_ORIENT);
  check("POI posé sur la cible", JSON.stringify(res.camera.property("ADBE Point of Interest").value) === JSON.stringify([960, 540, 0]));
  check("caméra locale -distance", res.camera.property("ADBE Position").value[2] === -1200);
  check("undo équilibré", app._undoDepth() === 0);
  const title = comp.layers.list.find(l => l.name === "Title");
  check("texte + fontSize via setValue", title.property("ADBE Text Document").value.fontSize === 180 && title.property("ADBE Text Document").sets >= 1);
  check("animation opacité du calque", title.property("ADBE Opacity").numKeys === 2);
  check("animation scale overshoot (back)", title.property("ADBE Scale").numKeys > 2);
  const rotY = res.rig.property("ADBE Rotate Y");
  check("orbit 0 -> 90", rotY.numKeys === 2 && rotY.keyValue(2) === 90);
  const camPos = res.camera.property("ADBE Position");
  check("pushIn rapproche en z", camPos.numKeys === 2 && camPos.keyValue(2)[2] > camPos.keyValue(1)[2]);
}

/* ============ sémantique des mouvements ============ */
{
  const { RWEngine } = loadAll();

  let r = RWEngine.applySpec(baseSpec([{ type: "zoomIn", t0: 0, t1: 3 }]));
  const zoomGroup = r.camera.property("ADBE Camera Options Group").property("ADBE Camera Zoom");
  check("zoomIn : optique seule, pas de clé Position", zoomGroup.numKeys === 2 && r.camera.property("ADBE Position").numKeys === 0);

  r = RWEngine.applySpec(baseSpec([{ type: "orbit", t0: 0, t1: 4, params: { angle: 90 } },
                                   { type: "pan", t0: 4, t1: 8, params: { angle: 30 } }]));
  const ry = r.rig.property("ADBE Rotate Y");
  // clé partagée au raccord (t=4 remplacée, valeur identique) : 3 clés, continuité 0->90->120
  check("mouvements enchaînés : le 2e part de la valeur atteinte",
    ry.numKeys === 3 && ry.keyValue(1) === 0 && ry.keyValue(2) === 90 && ry.keyValue(3) === 120,
    JSON.stringify(ry.keys));

  r = RWEngine.applySpec(baseSpec([{ type: "truck", t0: 0, t1: 2, params: { amount: 300 } },
                                   { type: "pedestal", t0: 2, t1: 4, params: { amount: -200 } }]));
  const rp = r.rig.property("ADBE Position");
  // clé de raccord partagée à t=2 : 3 clés [960] -> [1260] -> [1260, 340]
  check("truck puis pedestal : x conservé, y ajouté",
    rp.numKeys === 3 && rp.keyValue(2)[0] === 1260 && rp.keyValue(3)[0] === 1260 && rp.keyValue(3)[1] === 540 - 200,
    JSON.stringify(rp.keys));

  r = RWEngine.applySpec(baseSpec([{ type: "whipPan", t0: 0, t1: 0.4, params: { angle: -120 } }]));
  const wr = r.rig.property("ADBE Rotate Y");
  check("whipPan ease asymétrique (départ franc, arrivée douce)",
    wr.eases[1].outE[0].influence === 80 && wr.eases[1].inE[0].influence === 5 && wr.eases[2].inE[0].influence === 80);

  r = RWEngine.applySpec(baseSpec([{ type: "handheld", t0: 0, t1: 2, params: { amplitude: 6, seed: 3 } }]));
  const hp = r.rig.property("ADBE Position").keys;
  check("handheld : nombreuses clés bornées, rotation via Z (3D)",
    hp.length >= 20 && hp.every(k => Math.abs(k.value[0] - 960) <= 6.01) &&
    r.rig.property("ADBE Rotate Z").numKeys > 0);

  r = RWEngine.applySpec(baseSpec([{ type: "rackFocus", t0: 0, t1: 2, params: { from: 1200, to: 600 } }]));
  const g = r.camera.property("ADBE Camera Options Group");
  check("rackFocus : PdC activée + Focus Distance animée",
    g.property("ADBE Camera Depth of Field").value === 1 && g.property("ADBE Camera Focus Distance").numKeys === 2);

  r = RWEngine.applySpec(baseSpec(
    [{ type: "parallax", t0: 0, t1: 4, params: { amount: 500, depths: { FG: 0, BG: -800, GHOST: -1 } } }],
    [{ type: "solid", name: "FG" }, { type: "solid", name: "BG" }]));
  check("parallax : profondeurs posées, calque inconnu toléré",
    r.comp.layers.list.find(l => l.name === "BG").property("ADBE Position").value[2] === -800);

  r = RWEngine.applySpec(baseSpec([{ type: "roll", t0: 0, t1: 1, params: { angle: 8 } }]));
  check("roll sur ADBE Rotate Z (rig 3D)", r.rig.property("ADBE Rotate Z").keyValue(2) === 8);
}

/* ============ rollback et undo ============ */
{
  const { RWEngine, RWActions, app } = loadAll();
  const itemsBefore = app.project.items.list.length;
  let threw = false;
  try {
    // courbe valide à la validation mais erreur forcée en runtime via calque animé sans propriété :
    // on triche avec une spec valide puis on casse via depths sur propriété absente ? Non :
    // on utilise une spec valide dont la courbe calque est absente -> validation la refuse.
    // Pour tester le rollback runtime, on force via un mock : retirer la propriété Position du futur rig n'est pas possible.
    // À la place : move valide, mais params qui passent la validation et échouent à l'exécution n'existent plus ;
    // on teste donc le rollback via RWActions + spec dont la validation passe mais build échoue :
    RWEngine.applySpec(baseSpec([{ type: "pushIn", t0: 0, t1: 2 }], [{ type: "text", name: "A", text: "x" }]));
    // succès : pas de rollback attendu
  } catch (e) { threw = true; }
  check("spec saine : pas d'exception", !threw);
  check("comp saine conservée", app.project.items.list.length === itemsBefore + 1);

  // rollback réel : forcer l'échec après création de comp en sabotant addCamera
  const app2 = mock.makeApp();
  const sandbox2 = { app: app2, KeyframeEase: mock.KeyframeEase, AutoOrientType: mock.AutoOrientType, console };
  vm.createContext(sandbox2);
  for (const f of MODULES) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8"), sandbox2, { filename: f });
  const origAddCamera = Object.getPrototypeOf(app2.project.items.list).addCamera;
  let threw2 = false;
  // saboter : la prochaine comp créée lèvera dans addCamera
  const proto = Object.getPrototypeOf(app2.project.items);
  const orig = proto.addComp;
  proto.addComp = function () {
    const c = orig.apply(this, arguments);
    c.layers.addCamera = function () { throw new Error("panne simulée caméra"); };
    return c;
  };
  const before2 = app2.project.items.list.length;
  try { sandbox2.RWEngine.applySpec(baseSpec([{ type: "orbit", t0: 0, t1: 2 }])); }
  catch (e) { threw2 = /panne simulée/.test(e.message); }
  proto.addComp = orig;
  check("échec mid-build : exception propagée", threw2);
  check("échec mid-build : comp orpheline supprimée (rollback)", app2.project.items.list.length === before2);
  check("échec mid-build : undo équilibré", app2._undoDepth() === 0);

  const rr = RWActions.run("motion.apply", { spec: { version: 9 } });
  check("registry renvoie erreur de validation propre", rr.ok === false && /validation/.test(rr.error));
}

/* ============ inspection ============ */
{
  const { RWEngine, RWInspect } = loadAll();
  const res = RWEngine.applySpec(baseSpec([{ type: "orbit", t0: 0, t1: 2 }],
    [{ type: "text", name: "T1", text: "HELLO" }, { type: "solid", name: "BG" }]));
  const light = RWInspect.compInfo(res.comp, false);
  const types = {};
  light.layers.forEach(l => types[l.type] = (types[l.type] || 0) + 1);
  check("typage par matchName (text/camera/null/layer)",
    types.text === 1 && types.camera === 1 && types.null === 1 && types.layer === 1, JSON.stringify(types));
  check("inspection légère sans position", light.layers[0].position === undefined);
  const deep = RWInspect.compInfo(res.comp, true);
  check("inspection profonde : position + parent caméra",
    deep.layers.some(l => l.type === "camera" && l.parent === "RW Rig" && l.position));
  const json = RWInspect.toJSON(deep);
  check("toJSON (RWJSON) round-trip", JSON.parse(json).numLayers === 4);
  check("toJSON échappe un nom avec retour ligne", JSON.parse(RWInspect.toJSON({ n: "a\nb" })).n === "a\nb");
}

/* ============ registry ============ */
{
  const { RWActions } = loadAll();
  let r = RWActions.run("project.inspect");
  check("project.inspect ok", r.ok === true);
  r = RWActions.run("nope.nope");
  check("outil inconnu refusé", r.ok === false);
  r = RWActions.run("comp.create", { name: "A", width: 1920, height: 1080, fps: 25, duration: 5 });
  check("comp.create ok (avec undo group)", r.ok === true && r.result.name === "A");
  r = RWActions.run("comp.create", { name: "B", width: 2, height: 1080, fps: 25, duration: 5 });
  check("comp.create bornes validées", r.ok === false);
  r = RWActions.run("motion.apply", { spec: baseSpec([{ type: "pushIn", t0: 0, t1: 2 }]) });
  check("motion.apply ok", r.ok === true && r.result.numLayers === 2);
  r = RWActions.run("layer.animate", { layer: "RW Rig", property: "Y Rotation", t0: 0, t1: 2, from: 0, to: 45, curve: "easeOut" });
  check("layer.animate ajoute des clés", r.ok === true && r.result.keysAdded === 2);
  r = RWActions.run("layer.animate", { layer: "RW Rig", property: "Hue", t0: 0, t1: 1, from: 0, to: 1 });
  check("layer.animate propriété hors liste blanche refusée", r.ok === false && /non animable/.test(r.error));
  r = RWActions.run("layer.animate", { layer: "GHOST", property: "Opacity", t0: 0, t1: 1, from: 0, to: 1 });
  check("layer.animate calque absent -> erreur propre", r.ok === false && /introuvable/.test(r.error));
  r = RWActions.run("comp.inspect", { deep: true });
  check("comp.inspect deep", r.ok === true && r.result.layers.length > 0);
}

/* ============ pont (bridge) ============ */
{
  const { RWBridge } = loadAll();
  const files = [
    { name: "spec-100.json", modified: 100 },
    { name: "result-200.json", modified: 200 },
    { name: "spec-300.json", modified: 300 },
    { name: "notes.txt", modified: 400 }
  ];
  check("newestJson : spec la plus récente, résultats ignorés", RWBridge.newestJson(files) === "spec-300.json");
  check("newestJson : null si rien", RWBridge.newestJson([{ name: "result-1.json", modified: 1 }]) === null);
  check("parseSpecText JSON valide", RWBridge.parseSpecText('{"version":1}').version === 1);
  let e1 = false, e2 = false;
  try { RWBridge.parseSpecText("{invalid"); } catch (e) { e1 = /illisible/.test(e.message); }
  try { RWBridge.parseSpecText("   "); } catch (e) { e2 = /vide/.test(e.message); }
  check("parseSpecText erreurs claires", e1 && e2);
  global.__PWNED2__ = false;
  try { RWBridge.parseSpecText('{"a":1}]); global.__PWNED2__=1; //'); } catch (e) {}
  check("parseSpecText n'exécute rien", global.__PWNED2__ === false);
  const res = RWBridge.makeResult("motion.apply", false, "boom");
  check("makeResult conserve l'erreur pour l'agent externe", res.ok === false && res.error === "boom");
}

/* ============ presets (cahier 5.4) ============ */
{
  const { RWPresets, RWEngine } = loadAll();
  const expected = ["cinematic-push-in", "hero-orbit", "dynamic-whip-pan", "slow-dolly-reveal", "handheld-cinematic"];
  expected.forEach(n => check("preset dispo: " + n, RWPresets.names().indexOf(n) >= 0));
  for (const n of expected) {
    const frag = RWPresets.build(n, n === "hero-orbit" ? { depths: { BG: -600 } } : {});
    let okRun = true, msg = "";
    try {
      RWEngine.applySpec({ version: 1, comp: { name: n, width: 1920, height: 1080, fps: 25, duration: 12 },
        layers: [{ type: "solid", name: "BG" }], camera: frag.camera });
    } catch (e) { okRun = false; msg = e.message; }
    check("preset '" + n + "' applicable", okRun, msg);
  }
  const frag = RWPresets.build("dynamic-whip-pan", { angle: -60, t1: 0.8, settle: 2 });
  check("presets surchargeables", frag.camera.moves[0].params.angle === -60 && frag.camera.moves[1].t1 === 2);
}

/* ============ régressions revue v0.3 (sondes A-H) ============ */
{
  const { RWEngine, RWCurves, RWBridge, RWActions } = loadAll();

  // A. parenté compensée : la caméra doit finir à target + [0,0,-dist] en MONDE
  const r = RWEngine.applySpec(baseSpec([{ type: "pushIn", t0: 0, t1: 2, params: { amount: 400 } }],
    [{ type: "text", name: "T", text: "X" }]));
  const wp = r.camera.worldPosition();
  check("A. caméra en monde = cible - distance (parenté compensée)",
    wp[0] === 960 && wp[1] === 540 && wp[2] === -1200, JSON.stringify(wp));
  const camKeys = r.camera.property("ADBE Position").keys;
  check("A. dolly depuis la position locale réelle, sans saut",
    camKeys[0].value[2] === -1200 && camKeys[1].value[2] === -800, JSON.stringify(camKeys));

  // B. moves dans le désordre -> appliqués en ordre temporel (sonde du relecteur)
  const rB = RWEngine.applySpec(baseSpec([
    { type: "orbit", t0: 4, t1: 6, params: { angle: 90 } },
    { type: "orbit", t0: 0, t1: 2, params: { angle: 45 } }
  ]));
  const ryB = rB.rig.property("ADBE Rotate Y").keys;
  check("B. spec désordonnée : clés continues 0->45->135, pas de saut",
    ryB.length === 4 && ryB[0].time === 0 && ryB[0].value === 0 &&
    ryB[1].time === 2 && ryB[1].value === 45 &&
    ryB[2].time === 4 && ryB[2].value === 45 &&
    ryB[3].time === 6 && ryB[3].value === 135, JSON.stringify(ryB));

  // C. roll + handheld simultanés rejetés (canal Rotate Z partagé)
  let cRej = false;
  try { RWEngine.validate(baseSpec([
    { type: "roll", t0: 0, t1: 2 }, { type: "handheld", t0: 1, t1: 3 }]));
  } catch (e) { cRej = /chevauche/.test(e.message); }
  check("C. roll + handheld qui se chevauchent rejetés", cRej);

  // D. jonction : l'ease entrant du 1er mouvement est préservé (sonde easeIn+easeOut)
  {
    const appD = mock.makeApp();
    const compD = appD.project.items.addComp("D", 1920, 1080, 1, 10, 25);
    const sD = compD.layers.addSolid([1,1,1], "S", 100, 100, 1, 10);
    const op = sD.property("ADBE Opacity");
    RWCurves.apply(op, 0, 2, 0, 100, "easeIn");
    RWCurves.apply(op, 2, 4, 100, 50, "easeOut");
    const kj = op.nearestKeyIndex(2);
    check("D. ease entrant de jonction préservé (0.1), sortant mis à jour",
      op.eases[kj].inE[0].influence === 0.1 && op.eases[kj].outE[0].influence === 0.1,
      JSON.stringify({ inE: op.eases[kj].inE[0].influence, outE: op.eases[kj].outE[0].influence }));
    check("D. ease entrant du 1er segment intact sur la fin de segment",
      op.eases[kj].inE[0].influence === 0.1);
  }

  // E. rollback : solides orphelins supprimés avec la comp
  {
    const appE = mock.makeApp();
    const sbE = { app: appE, KeyframeEase: mock.KeyframeEase, AutoOrientType: mock.AutoOrientType, console };
    vm.createContext(sbE);
    for (const f of MODULES) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8"), sbE, { filename: f });
    const proto = Object.getPrototypeOf(appE.project.items);
    const origE = proto.addComp;
    proto.addComp = function () {
      const c = origE.apply(this, arguments);
      c.layers.addCamera = function () { throw new Error("panne simulée"); };
      return c;
    };
    const beforeE = appE.project.items.list.length;
    let eE = false;
    try {
      sbE.RWEngine.applySpec(baseSpec([{ type: "orbit", t0: 0, t1: 2 }],
        [{ type: "solid", name: "BG" }, { type: "solid", name: "FG" }]));
    } catch (e) { eE = true; }
    proto.addComp = origE;
    check("E. rollback : comp ET items solides supprimés",
      eE && appE.project.items.list.length === beforeE,
      "items=" + appE.project.items.list.length + " avant=" + beforeE);
    check("E. rollback : undo équilibré", appE._undoDepth() === 0);
  }

  // F. warnings : cible inconnue + depths inconnues signalées, pas silencieuses
  {
    const rF = RWEngine.applySpec(Object.assign(
      baseSpec([{ type: "parallax", t0: 0, t1: 2, params: { depths: { GHOST: -100 } } }]),
      { camera: { target: "INCONNU", moves: [{ type: "parallax", t0: 0, t1: 2, params: { depths: { GHOST: -100 } } }] } }));
    check("F. cible inconnue -> avertissement", rF.warnings.some(w => /INCONNU/.test(w)));
    check("F. depths inconnues -> avertissement", rF.warnings.some(w => /GHOST/.test(w)));
    const rF2 = RWActions.run("motion.apply", { spec: baseSpec([{ type: "orbit", t0: 0, t1: 2 }],
      [{ type: "solid", name: "S" }]) });
    check("F. registry propage warnings (vide ici)", rF2.ok && rF2.result.warnings.length === 0);
    // validation des nouveaux types
    const badTypes = [
      Object.assign(baseSpec([{ type: "orbit", t0: 0, t1: 2 }]), { comp: { width: 1920, height: 1080, fps: 25, duration: 8, name: 42 } }),
      Object.assign(baseSpec([{ type: "orbit", t0: 0, t1: 2 }]), { comp: { width: 1920, height: 1080, fps: 25, duration: 8, bgColor: [2, 0, 0] } }),
      baseSpec([{ type: "orbit", t0: 0, t1: 2 }], [{ type: "solid", name: "S", color: [1, 1] }]),
      baseSpec([{ type: "orbit", t0: 0, t1: 2 }], [{ type: "text", name: "T", text: "x", fontSize: -3 }]),
      baseSpec([{ type: "orbit", t0: 0, t1: 2 }], [{ type: "solid", name: "S", threeD: "oui" }]),
      baseSpec([{ type: "orbit", t0: 0, t1: 2 }], [null, { type: "solid", name: "S" }]),
      Object.assign(baseSpec([{ type: "orbit", t0: 0, t1: 2 }]), { camera: { zoom: -1, moves: [{ type: "orbit", t0: 0, t1: 2 }] } }),
      Object.assign(baseSpec([{ type: "orbit", t0: 0, t1: 2 }]), { camera: { depthOfField: "oui", moves: [{ type: "orbit", t0: 0, t1: 2 }] } }),
      Object.assign(baseSpec([{ type: "orbit", t0: 0, t1: 2 }]), { camera: { target: 5, moves: [{ type: "orbit", t0: 0, t1: 2 }] } }),
      baseSpec([{ type: "orbit", t0: 0, t1: 2, params: "nope" }])
    ];
    badTypes.forEach((b, i) => {
      let rej = false;
      try { RWEngine.validate(b); } catch (e) { rej = true; }
      check("F. validation type étendue #" + i, rej);
    });
  }

  // G. pont : BOM, dédoublonnage, nom de résultat lié
  check("G. BOM UTF-8 tolérée", RWBridge.parseSpecText("\uFEFF" + '{"a":1}').a === 1);
  const filesG = [
    { name: "spec-100.json", modified: 100 },
    { name: "result-spec-100.json", modified: 150 },
    { name: "spec-300.json", modified: 300 }
  ];
  check("G. spec déjà traitée ignorée", RWBridge.newestJson(filesG) === "spec-300.json");
  check("G. toutes traitées -> null", RWBridge.newestJson([
    { name: "spec-1.json", modified: 10 }, { name: "result-spec-1.json", modified: 20 }]) === null);
  check("G. resultNameFor lie le résultat à la spec", RWBridge.resultNameFor("spec-300.json") === "result-spec-300.json");
}

/* ============ régressions premier essai AE réel (erreur "propriété masquée") ============ */
{
  const { RWEngine: engine } = loadAll();

  // H1. Caméra one-node : AE masque le POI ; le moteur ne doit plus l'écrire.
  const rH = engine.applySpec(baseSpec([{ type: "orbit", t0: 0, t1: 2, params: { angle: 90 } }],
    [{ type: "text", name: "T", text: "X" }]));
  const poiH = rH.camera.property("ADBE Point of Interest");
  check("H1. NO_AUTO_ORIENT => POI masqué dans le mock (comportement AE)",
    poiH.hidden === true);
  check("H1. applySpec réussit sans écrire le POI", !!rH.comp && rH.warnings.length === 0);
  let poiThrows = false;
  try { poiH.setValue([960, 540, 0]); } catch (e) { poiThrows = /hidden/.test(e.message); }
  check("H1. écrire un POI masqué lève l'erreur AE (l'ancien code échouait ici)", poiThrows);

  // H2. contexte d'erreur : un échec nomme l'étape/le mouvement fautif
  {
    const appH = mock.makeApp();
    const sbH = { app: appH, KeyframeEase: mock.KeyframeEase, AutoOrientType: mock.AutoOrientType, console };
    vm.createContext(sbH);
    for (const f of MODULES) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8"), sbH, { filename: f });
    const proto = Object.getPrototypeOf(appH.project.items);
    const origNull = proto.addComp;
    proto.addComp = function () {
      const c = origNull.apply(this, arguments);
      const origAddNull = c.layers.addNull.bind(c.layers);
      c.layers.addNull = function (dur) {
        const rig = origAddNull(dur);
        rig.property("ADBE Rotate Y").hidden = true; // simule une propriété masquée
        return rig;
      };
      return c;
    };
    let errH = "";
    try {
      sbH.RWEngine.applySpec(baseSpec([{ type: "orbit", t0: 0, t1: 2, params: { angle: 45 } }],
        [{ type: "solid", name: "S" }]));
    } catch (e) { errH = e.message; }
    proto.addComp = origNull;
    check("H2. l'erreur nomme le mouvement fautif", /mouvement orbit/.test(errH), errH);
    check("H2. rollback malgré l'erreur contextée", appH.project.items.list.length === 0);
    check("H2. undo équilibré", appH._undoDepth() === 0);
  }
}

console.log("\n" + (failures === 0 ? "ALL " + total + " TESTS PASSED" : failures + "/" + total + " FAILURES"));
process.exit(failures === 0 ? 0 : 1);
