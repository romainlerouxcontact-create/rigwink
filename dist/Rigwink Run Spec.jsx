// Rigwink Rigwink Run Spec.jsx — fichier unique généré par build.js, ne pas éditer à la main.
// Sources : src/*.jsx | Statut : logique testée en Node (mock AE), NON exécutée dans After Effects.
/*
 * RWJSON v1.0 — parseur et sérialiseur JSON strict, ES3, SANS eval.
 * Pourquoi : une spec lue par eval exécuterait du code arbitraire avec les
 * droits de l'utilisateur. Ici, seul du JSON valide est accepté ; tout le
 * reste est une erreur de parsing. Testable en Node.
 */
var RWJSON = (function () {
  var VERSION = "1.0.0";
  var MAX_DEPTH = 200;

  /* ---------------- parse ---------------- */
  var s, i;

  function err(msg) { throw new Error("JSON: " + msg + " (caractère " + i + ")"); }
  function ws() { while (i < s.length && " \t\n\r".indexOf(s.charAt(i)) >= 0) i++; }
  function peek() { return i < s.length ? s.charAt(i) : ""; }

  function parseString() {
    if (peek() !== '"') err("chaîne attendue");
    i++;
    var out = "";
    while (i < s.length) {
      var c = s.charAt(i);
      if (c === '"') { i++; return out; }
      if (c === "\\") {
        i++;
        var e = s.charAt(i);
        if (e === '"' || e === "\\" || e === "/") { out += e; i++; }
        else if (e === "b") { out += "\b"; i++; }
        else if (e === "f") { out += "\f"; i++; }
        else if (e === "n") { out += "\n"; i++; }
        else if (e === "r") { out += "\r"; i++; }
        else if (e === "t") { out += "\t"; i++; }
        else if (e === "u") {
          var hex = s.substr(i + 1, 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) err("\\u invalide");
          out += String.fromCharCode(parseInt(hex, 16));
          i += 5;
        } else err("échappement invalide \\" + e);
      } else if (c < " ") {
        err("caractère de contrôle brut dans une chaîne");
      } else {
        out += c; i++;
      }
    }
    err("chaîne non terminée");
  }

  function parseNumber() {
    var start = i;
    if (peek() === "-") i++;
    if (peek() === "0") i++;
    else if (peek() >= "1" && peek() <= "9") { while (peek() >= "0" && peek() <= "9") i++; }
    else err("nombre invalide");
    if (peek() === ".") {
      i++;
      if (!(peek() >= "0" && peek() <= "9")) err("chiffre attendu après .");
      while (peek() >= "0" && peek() <= "9") i++;
    }
    if (peek() === "e" || peek() === "E") {
      i++;
      if (peek() === "+" || peek() === "-") i++;
      if (!(peek() >= "0" && peek() <= "9")) err("exposant invalide");
      while (peek() >= "0" && peek() <= "9") i++;
    }
    return Number(s.substring(start, i));
  }

  function parseValue(depth) {
    if (depth > MAX_DEPTH) err("imbrication trop profonde");
    ws();
    var c = peek();
    if (c === "{") {
      i++;
      var obj = {};
      ws();
      if (peek() === "}") { i++; return obj; }
      while (true) {
        ws();
        var key = parseString();
        ws();
        if (peek() !== ":") err("':' attendu");
        i++;
        obj[key] = parseValue(depth + 1);
        ws();
        if (peek() === ",") { i++; continue; }
        if (peek() === "}") { i++; return obj; }
        err("',' ou '}' attendu");
      }
    }
    if (c === "[") {
      i++;
      var arr = [];
      ws();
      if (peek() === "]") { i++; return arr; }
      while (true) {
        arr.push(parseValue(depth + 1));
        ws();
        if (peek() === ",") { i++; continue; }
        if (peek() === "]") { i++; return arr; }
        err("',' ou ']' attendu");
      }
    }
    if (c === '"') return parseString();
    if (c === "-" || (c >= "0" && c <= "9")) return parseNumber();
    if (s.substr(i, 4) === "true") { i += 4; return true; }
    if (s.substr(i, 5) === "false") { i += 5; return false; }
    if (s.substr(i, 4) === "null") { i += 4; return null; }
    err("valeur inattendue '" + c + "'");
  }

  function parse(text) {
    if (typeof text !== "string") throw new Error("JSON: texte attendu");
    s = text; i = 0;
    var v = parseValue(0);
    ws();
    if (i < s.length) err("contenu après la fin du document");
    return v;
  }

  /* ---------------- stringify ---------------- */
  function esc(str) {
    var out = "";
    for (var k = 0; k < str.length; k++) {
      var c = str.charAt(k), code = str.charCodeAt(k);
      if (c === '"') out += '\\"';
      else if (c === "\\") out += "\\\\";
      else if (c === "\b") out += "\\b";
      else if (c === "\f") out += "\\f";
      else if (c === "\n") out += "\\n";
      else if (c === "\r") out += "\\r";
      else if (c === "\t") out += "\\t";
      else if (code < 32) {
        var h = code.toString(16);
        while (h.length < 4) h = "0" + h;
        out += "\\u" + h;
      }
      else out += c;
    }
    return '"' + out + '"';
  }

  function ser(o, depth) {
    if (depth > MAX_DEPTH) throw new Error("JSON: imbrication trop profonde à l'écriture");
    if (o === null || o === undefined) return "null";
    var t = typeof o, k, parts;
    if (t === "number") return (isFinite(o) ? String(o) : "null");
    if (t === "boolean") return String(o);
    if (t === "string") return esc(o);
    if (Object.prototype.toString.call(o) === "[object Array]") {
      parts = [];
      for (k = 0; k < o.length; k++) parts.push(ser(o[k], depth + 1));
      return "[" + parts.join(",") + "]";
    }
    if (t === "object") {
      parts = [];
      for (k in o) {
        if (o.hasOwnProperty(k) && typeof o[k] !== "undefined" && typeof o[k] !== "function") {
          parts.push(esc(k) + ":" + ser(o[k], depth + 1));
        }
      }
      return "{" + parts.join(",") + "}";
    }
    return "null"; // function, etc.
  }

  function stringify(o) { return ser(o, 0); }

  return { parse: parse, stringify: stringify, VERSION: VERSION };
})();


/*
 * Rigwink Curves v0.3 — bibliothèque de courbes d'animation (ES3).
 * Corrections revue : index de clés via nearestKeyIndex (les clés sont triées
 * par temps, setValueAtTime remplace une clé au même temps), tableaux d'ease
 * dimensionnés selon la propriété (Scale 2D/3D exige une KeyframeEase par
 * dimension ; Position spatiale n'en prend qu'une ; influence bornée [0.1,100]).
 * Nécessite rien ; utilisé par engine.jsx.
 */
var RWCurves = (function () {
  var VERSION = "0.4.0";
  var SAMPLE_KEYS = 14;

  function clampInfluence(x) { return Math.min(100, Math.max(0.1, x)); }

  function kfe(speed, influence) { return new KeyframeEase(speed, clampInfluence(influence)); }

  // Nombre de KeyframeEase par clé : 1 pour les propriétés spatiales
  // (Position), sinon une par dimension de la valeur.
  function easeDims(prop) {
    try { if (prop.isSpatial) return 1; } catch (e) {}
    var v = prop.value;
    if (v !== null && typeof v === "object" && typeof v.length === "number" && v.length >= 2) return v.length;
    return 1;
  }

  function easeArr(e, dims) {
    var out = [];
    for (var d = 0; d < dims; d++) out.push(kfe(e[0], e[1]));
    return out;
  }

  // Pose une clé et retourne son VRAI index (triées par temps côté AE).
  function setKey(prop, t, v) {
    prop.setValueAtTime(t, v);
    return prop.nearestKeyIndex(t);
  }

  function hasKeyAt(prop, t) {
    for (var k = 1; k <= prop.numKeys; k++) {
      if (Math.abs(prop.keyTime(k) - t) < 0.0001) return true;
    }
    return false;
  }

  // Règle l'ease d'une clé de DÉPART de segment. Si la clé existait déjà
  // (jonction avec le segment précédent), on conserve son ease ENTRANT :
  // il appartient au mouvement précédent.
  function easeStartKey(prop, k, inArr, outArr, preExisting) {
    if (preExisting) {
      var oldIn = prop.keyInTemporalEase(k);
      prop.setTemporalEaseAtKey(k, oldIn, outArr);
    } else {
      prop.setTemporalEaseAtKey(k, inArr, outArr);
    }
  }

  var EASES = {
    linear:     { out: [0, 0.1], "in": [0, 0.1] },
    easeIn:     { out: [0, 75],  "in": [0, 0.1] },
    easeOut:    { out: [0, 0.1], "in": [0, 75] },
    easeInOut:  { out: [0, 75],  "in": [0, 75] },
    cubic:      { out: [0, 66],  "in": [0, 66] },
    quartic:    { out: [0, 75],  "in": [0, 75] },
    quintic:    { out: [0, 83],  "in": [0, 83] },
    exponential:{ out: [0, 90],  "in": [0, 90] },
    circular:   { out: [0, 55],  "in": [0, 55] }
  };

  function backOut(t, s) { s = s === undefined ? 1.70158 : s; var u = t - 1; return 1 + u * u * ((s + 1) * u + s); }
  function elasticOut(t, amp, freq) {
    amp = amp || 1; freq = freq || 4;
    if (t === 0 || t === 1) return t;
    return 1 + Math.pow(2, -10 * t * amp) * Math.sin((t * freq - 0.075) * (2 * Math.PI) / 0.3 * 0.25 * freq);
  }
  function bounceOut(t) {
    var n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) { t -= 1.5 / d1; return n1 * t * t + 0.75; }
    if (t < 2.5 / d1) { t -= 2.25 / d1; return n1 * t * t + 0.9375; }
    t -= 2.625 / d1; return n1 * t * t + 0.984375;
  }
  function springOut(t, damping, freq) {
    damping = damping === undefined ? 6 : damping; freq = freq || 8;
    if (t === 0 || t === 1) return t;
    return 1 - Math.exp(-damping * t) * Math.cos(freq * Math.PI * t);
  }

  var SAMPLED = {
    back:    function (o) { return function (t) { return backOut(t, o && o.overshoot); }; },
    elastic: function (o) { return function (t) { return elasticOut(t, o && o.amplitude, o && o.frequency); }; },
    bounce:  function () { return bounceOut; },
    spring:  function (o) { return function (t) { return springOut(t, o && o.damping, o && o.frequency); }; }
  };

  function lerpVal(v0, v1, f) {
    if (typeof v0 === "number") return v0 + (v1 - v0) * f;
    var out = [];
    for (var i = 0; i < v0.length; i++) out.push(v0[i] + (v1[i] - v0[i]) * f);
    return out;
  }

  function has(name) { return !!EASES[name] || !!SAMPLED[name] || name === "custom"; }
  function names() {
    var n = [], k;
    for (k in EASES) n.push(k);
    for (k in SAMPLED) n.push(k);
    n.push("custom");
    return n;
  }

  /*
   * apply(prop, t0, t1, v0, v1, name, opts) -> nombre de clés posées.
   * opts custom : {outInfluence, inInfluence} ; sampled : overshoot/amplitude/
   * frequency/damping.
   */
  function apply(prop, t0, t1, v0, v1, name, opts) {
    name = name || "easeInOut";
    var dims = easeDims(prop);
    var i, k1, k2;
    if (name === "custom" && opts) {
      var had0 = hasKeyAt(prop, t0);
      k1 = setKey(prop, t0, v0);
      k2 = setKey(prop, t1, v1);
      var outI = opts.outInfluence === undefined ? 75 : opts.outInfluence;
      var inI = opts.inInfluence === undefined ? 75 : opts.inInfluence;
      var in1 = opts.inInfluenceStart === undefined ? inI : opts.inInfluenceStart;
      var in2 = opts.inInfluenceEnd === undefined ? inI : opts.inInfluenceEnd;
      easeStartKey(prop, k1, easeArr([0, in1], dims), easeArr([0, outI], dims), had0);
      prop.setTemporalEaseAtKey(k2, easeArr([0, in2], dims), easeArr([0, outI], dims));
      return 2;
    }
    if (EASES[name]) {
      var had0b = hasKeyAt(prop, t0);
      k1 = setKey(prop, t0, v0);
      k2 = setKey(prop, t1, v1);
      var e = EASES[name];
      easeStartKey(prop, k1, easeArr(e["in"], dims), easeArr(e.out, dims), had0b);
      prop.setTemporalEaseAtKey(k2, easeArr(e["in"], dims), easeArr(e.out, dims));
      return 2;
    }
    if (SAMPLED[name]) {
      var fn = SAMPLED[name](opts);
      for (i = 0; i <= SAMPLE_KEYS; i++) {
        setKey(prop, t0 + (t1 - t0) * (i / SAMPLE_KEYS), lerpVal(v0, v1, fn(i / SAMPLE_KEYS)));
      }
      return SAMPLE_KEYS + 1;
    }
    throw new Error("RWCurves: courbe inconnue '" + name + "' (dispo: " + names().join(", ") + ")");
  }

  return { apply: apply, names: names, has: has, VERSION: VERSION };
})();


/*
 * Rigwink Motion Engine v0.3 — agent Motion Design pour After Effects.
 * ES3 (ExtendScript), même fichier en AE et dans le harnais de test Node.
 * Dépendances : RWCurves (curves.jsx). Entrée : RWEngine.applySpec(spec).
 * Tout reste éditable : vrais calques, vrais keyframes, rig null.
 *
 * Corrections revue v0.3 :
 * - Accès propriétés par matchName (non localisé) avec repli nom d'affichage,
 *   et test null explicite (property() peut renvoyer null, pas d'exception).
 * - "Rotation" (2D) vs "Z Rotation" (3D) réglé par ADBE Rotate Z.
 * - addCamera(name, [x,y]) conforme au contrat ; autoOrient NO_AUTO_ORIENT
 *   (l'orientation est portée par le rig, pas par un POI parenté dont
 *   l'espace de coordonnées n'est pas confirmé par la doc — à tester en AE).
 * - TextDocument lire-modifier-setValue.
 * - Mouvements combinés : chevauchements sur une même propriété rejetés à la
 *   validation ; les mouvements successifs partent de la valeur courante.
 * - Échec en cours de construction : comp créée supprimée (pas d'orpheline),
 *   undo group toujours refermé.
 */
var RWEngine = (function () {
  var VERSION = "0.4.0";

  function fail(msg) { throw new Error("RWEngine: " + msg); }
  function isNum(n) { return typeof n === "number" && isFinite(n); }

  var MOVE_TYPES = {
    dollyIn: true, dollyOut: true, pushIn: true, pullOut: true,
    truck: true, pan: true, tilt: true,
    orbit: true, crane: true, pedestal: true, roll: true,
    zoomIn: true, zoomOut: true, whipPan: true,
    parallax: true, handheld: true, shake: true, rackFocus: true
  };

  // Propriétés animables de calques : nom public -> matchName
  var LAYER_PROPS = {
    "Position": "ADBE Position",
    "Scale": "ADBE Scale",
    "Opacity": "ADBE Opacity",
    "Rotation": "ADBE Rotate Z",
    "X Rotation": "ADBE Rotate X",
    "Y Rotation": "ADBE Rotate Y",
    "Z Rotation": "ADBE Rotate Z"
  };

  /* ---------------- accès propriétés ---------------- */

  // matchName d'abord (stable, non localisé), repli nom d'affichage.
  // property() peut renvoyer null SANS lever d'exception : on teste les deux.
  function propOf(layer, matchName, display) {
    var p = null;
    try { p = layer.property(matchName); } catch (e) { p = null; }
    if (!p && display) {
      try { p = layer.property(display); } catch (e2) { p = null; }
    }
    return p;
  }

  function needProp(layer, matchName, display) {
    var p = propOf(layer, matchName, display);
    if (!p) fail("propriété introuvable: " + (display || matchName) + " (calque '" + layer.name + "')");
    return p;
  }

  function camOpt(cam, matchName, display) {
    var p = propOf(cam, matchName, display);
    if (p) return p;
    var g = propOf(cam, "ADBE Camera Options Group", "Camera Options");
    if (g) {
      try { p = g.property(matchName); } catch (e) { p = null; }
      if (!p) { try { p = g.property(display); } catch (e2) { p = null; } }
    }
    if (!p) fail("option caméra introuvable: " + display);
    return p;
  }

  /* ---------------- validation ---------------- */

  function isColor(v) {
    if (!isVec(v) || v.length !== 3) return false;
    for (var i = 0; i < 3; i++) if (v[i] < 0 || v[i] > 1) return false;
    return true;
  }

  function isVec(v) {
    if (Object.prototype.toString.call(v) !== "[object Array]") return false;
    if (v.length < 2 || v.length > 3) return false;
    for (var i = 0; i < v.length; i++) if (!isNum(v[i])) return false;
    return true;
  }

  function isVal(v) { return isNum(v) || isVec(v); }

  // Quelles propriétés du rig/caméra chaque mouvement touche (anti-chevauchement)
  function moveProps(m) {
    switch (m.type) {
      case "truck": case "pedestal": return ["rigPos"];
      case "handheld": case "shake": return ["rigPos", "rigRotZ"];
      case "crane": return ["rigPos", "rigRotX"];
      case "pan": case "orbit": case "whipPan": return ["rigRotY"];
      case "tilt": return ["rigRotX"];
      case "roll": return ["rigRotZ"];
      case "dollyIn": case "pushIn": case "dollyOut": case "pullOut": case "parallax": return ["camPos"];
      case "zoomIn": case "zoomOut": return ["camZoom"];
      case "rackFocus": return ["camFocus"];
    }
    return [];
  }

  function checkOverlap(seen, propKey, m, idx) {
    var list = seen[propKey] || [];
    for (var i = 0; i < list.length; i++) {
      if (m.t0 < list[i].t1 && m.t1 > list[i].t0) {
        fail("move[" + idx + "] (" + m.type + ") chevauche move[" + list[i].idx + "] (" + list[i].type +
          ") sur la même propriété du rig/caméra — enchaîner plutôt que superposer");
      }
    }
    list.push({ t0: m.t0, t1: m.t1, idx: idx, type: m.type });
    seen[propKey] = list;
  }

  function optNum(p, name) {
    if (p[name] !== undefined && !isNum(p[name])) fail("params." + name + " doit être un nombre");
  }

  function validate(spec) {
    var i, j, m, a;
    if (!spec || typeof spec !== "object") fail("spec must be an object");
    if (spec.version !== 1) fail("spec.version must be 1");
    if (!spec.comp || typeof spec.comp !== "object") fail("spec.comp required");
    var c = spec.comp;
    if (c.name !== undefined && typeof c.name !== "string") fail("comp.name chaîne attendue");
    if (c.pixelAspect !== undefined && (!isNum(c.pixelAspect) || c.pixelAspect <= 0)) fail("comp.pixelAspect nombre > 0 attendu");
    if (c.bgColor !== undefined && !isColor(c.bgColor)) fail("comp.bgColor [r,g,b] dans [0,1] attendu");
    if (!isNum(c.width) || !isNum(c.height)) fail("comp.width/height numbers required");
    if (c.width < 4 || c.width > 30000 || c.height < 4 || c.height > 30000) fail("comp size hors bornes AE (4-30000)");
    if (!isNum(c.fps) || c.fps < 1 || c.fps > 99) fail("comp.fps dans [1,99] requis");
    if (!isNum(c.duration) || c.duration <= 0 || c.duration > 10800) fail("comp.duration dans ]0,10800] requis");

    if (spec.layers) {
      if (Object.prototype.toString.call(spec.layers) !== "[object Array]") fail("spec.layers must be an array");
      var namesSeen = {};
      for (i = 0; i < spec.layers.length; i++) {
        var L = spec.layers[i];
        if (!L || typeof L !== "object") fail("layer[" + i + "] doit être un objet");
        if (!L.type || (L.type !== "text" && L.type !== "solid")) fail("layer[" + i + "].type must be text|solid");
        if (!L.name) fail("layer[" + i + "].name required");
        if (namesSeen[L.name]) fail("nom de calque en double: '" + L.name + "'");
        namesSeen[L.name] = true;
        if (L.type === "text" && typeof L.text !== "string") fail("layer[" + i + "].text required for text layer");
        if (L.position !== undefined && !isVec(L.position)) fail("layer[" + i + "].position vecteur 2/3D attendu");
        if (L.scale !== undefined && !isVec(L.scale)) fail("layer[" + i + "].scale vecteur 2/3D attendu");
        if (L.opacity !== undefined && !isNum(L.opacity)) fail("layer[" + i + "].opacity nombre attendu");
        if (L.z !== undefined && !isNum(L.z)) fail("layer[" + i + "].z nombre attendu");
        if (L.color !== undefined && !isColor(L.color)) fail("layer[" + i + "].color [r,g,b] dans [0,1] attendu");
        if (L.fontSize !== undefined && (!isNum(L.fontSize) || L.fontSize <= 0)) fail("layer[" + i + "].fontSize nombre > 0 attendu");
        if (L.threeD !== undefined && typeof L.threeD !== "boolean") fail("layer[" + i + "].threeD booléen attendu");
        if (L.animate !== undefined) {
          if (Object.prototype.toString.call(L.animate) !== "[object Array]") fail("layer[" + i + "].animate tableau attendu");
          for (j = 0; j < L.animate.length; j++) {
            a = L.animate[j];
            if (!LAYER_PROPS[a.property]) fail("layer[" + i + "].animate[" + j + "]: propriété inconnue '" + a.property + "'");
            if (!isNum(a.t0) || !isNum(a.t1) || a.t1 <= a.t0) fail("layer[" + i + "].animate[" + j + "]: t0 < t1 requis");
            if (a.t0 < 0 || a.t1 > c.duration) fail("layer[" + i + "].animate[" + j + "]: hors durée de comp");
            if (!isVal(a.from) || !isVal(a.to)) fail("layer[" + i + "].animate[" + j + "]: from/to nombre ou vecteur 2/3D");
            if (isVec(a.from) !== isVec(a.to)) fail("layer[" + i + "].animate[" + j + "]: from/to de formes différentes");
            if (a.curve !== undefined && !RWCurves.has(a.curve)) fail("layer[" + i + "].animate[" + j + "]: courbe inconnue '" + a.curve + "'");
          }
        }
      }
    }

    if (!spec.camera || !spec.camera.moves || !spec.camera.moves.length) fail("spec.camera.moves must be a non-empty array");
    if (spec.camera.distance !== undefined && (!isNum(spec.camera.distance) || spec.camera.distance <= 0)) fail("camera.distance > 0 requis");
    if (spec.camera.targetPoint !== undefined && !isVec(spec.camera.targetPoint)) fail("camera.targetPoint vecteur attendu");
    if (spec.camera.target !== undefined && typeof spec.camera.target !== "string") fail("camera.target chaîne attendue");
    if (spec.camera.zoom !== undefined && (!isNum(spec.camera.zoom) || spec.camera.zoom <= 0)) fail("camera.zoom nombre > 0 attendu");
    if (spec.camera.focusDistance !== undefined && (!isNum(spec.camera.focusDistance) || spec.camera.focusDistance <= 0)) fail("camera.focusDistance nombre > 0 attendu");
    if (spec.camera.aperture !== undefined && (!isNum(spec.camera.aperture) || spec.camera.aperture <= 0)) fail("camera.aperture nombre > 0 attendu");
    if (spec.camera.depthOfField !== undefined && typeof spec.camera.depthOfField !== "boolean") fail("camera.depthOfField booléen attendu");

    var seen = {};
    for (i = 0; i < spec.camera.moves.length; i++) {
      m = spec.camera.moves[i];
      if (!MOVE_TYPES[m.type]) fail("unknown camera move '" + m.type + "'");
      if (!isNum(m.t0) || !isNum(m.t1) || m.t1 <= m.t0) fail("move[" + i + "] needs t0 < t1");
      if (m.t0 < 0 || m.t1 > c.duration) fail("move[" + i + "] outside comp duration");
      if (m.params !== undefined && (typeof m.params !== "object" || m.params === null)) fail("move[" + i + "].params objet attendu");
      var p = m.params || {};
      optNum(p, "amount"); optNum(p, "angle"); optNum(p, "from"); optNum(p, "to");
      optNum(p, "amplitude"); optNum(p, "seed");
      if (p.curve !== undefined && !RWCurves.has(p.curve)) fail("move[" + i + "]: courbe inconnue '" + p.curve + "'");
      if (p.depths !== undefined) {
        if (typeof p.depths !== "object") fail("move[" + i + "].params.depths objet attendu");
        for (var dn in p.depths) if (!isNum(p.depths[dn])) fail("move[" + i + "].params.depths['" + dn + "'] nombre attendu");
      }
      var props = moveProps(m);
      for (j = 0; j < props.length; j++) checkOverlap(seen, props[j], m, i);
    }
    return true;
  }

  /* ---------------- helpers runtime ---------------- */

  function findLayer(comp, name) {
    for (var i = 1; i <= comp.numLayers; i++) {
      if (comp.layer(i).name === name) return comp.layer(i);
    }
    return null;
  }

  // Valeur de départ d'un mouvement : dernière clé posée à t <= t0, sinon défaut.
  function valueBefore(prop, t0, dflt) {
    var best = null, bestT = -Infinity;
    for (var k = 1; k <= prop.numKeys; k++) {
      var kt = prop.keyTime(k);
      if (kt <= t0 + 0.0001 && kt > bestT) { bestT = kt; best = prop.keyValue(k); }
    }
    return best === null ? dflt : best;
  }

  function smoothNoise(i2, seed, chan) {
    var s2 = (seed || 1) * 100 + chan * 37;
    return Math.sin(i2 * 0.9 + s2) * 0.55 + Math.sin(i2 * 2.3 + s2 * 1.7) * 0.3 + Math.sin(i2 * 5.1 + s2 * 0.3) * 0.15;
  }

  /* ---------------- construction ---------------- */

  function buildComp(spec) {
    var c = spec.comp;
    var comp = app.project.items.addComp(
      c.name || "Rigwink Comp", c.width, c.height, c.pixelAspect || 1, c.duration, c.fps);
    if (c.bgColor) comp.bgColor = c.bgColor;
    return comp;
  }

  function buildLayers(comp, spec, createdSources) {
    var made = {};
    var list = spec.layers || [];
    for (var i = 0; i < list.length; i++) {
      var L = list[i];
      var layer;
      if (L.type === "solid") {
        layer = comp.layers.addSolid(L.color || [0.1, 0.1, 0.1], L.name,
          comp.width, comp.height, comp.pixelAspect, comp.duration);
        // addSolid crée aussi un item footage dans le projet : on le suit
        // pour pouvoir le supprimer au rollback.
        var src = null;
        try { src = layer.source; } catch (e0) { src = null; }
        if (src && createdSources) createdSources.push(src);
      } else {
        layer = comp.layers.addText(L.text);
        layer.name = L.name;
        if (L.fontSize) {
          // AE : lire-modifier-réécrire le TextDocument (mutation en place ignorée)
          var st = needProp(layer, "ADBE Text Document", "Source Text");
          var td = st.value;
          td.fontSize = L.fontSize;
          st.setValue(td);
        }
      }
      if (L.threeD !== false) layer.threeDLayer = true;
      var posP = needProp(layer, "ADBE Position", "Position");
      if (L.position) posP.setValue(L.position);
      if (L.z !== undefined) {
        var pv = posP.value;
        posP.setValue([pv[0], pv[1], L.z]);
      }
      if (L.scale) needProp(layer, "ADBE Scale", "Scale").setValue(L.scale);
      if (L.opacity !== undefined) needProp(layer, "ADBE Opacity", "Opacity").setValue(L.opacity);
      if (L.animate) {
        for (var j = 0; j < L.animate.length; j++) {
          var a = L.animate[j];
          var prop = needProp(layer, LAYER_PROPS[a.property], a.property);
          RWCurves.apply(prop, a.t0, a.t1, a.from, a.to, a.curve || "easeInOut", a.curveOptions);
        }
      }
      made[L.name] = layer;
    }
    return made;
  }

  function buildCamera(comp, spec, layers) {
    var camSpec = spec.camera;
    var target = [comp.width / 2, comp.height / 2, 0];
    if (camSpec.target && layers[camSpec.target]) {
      target = needProp(layers[camSpec.target], "ADBE Position", "Position").value;
    } else if (camSpec.targetPoint) {
      target = camSpec.targetPoint;
    }
    var dist = camSpec.distance || 1200;

    var rig = comp.layers.addNull(comp.duration);
    rig.name = "RW Rig";
    rig.threeDLayer = true;
    needProp(rig, "ADBE Position", "Position").setValue(target);

    // Contrat addCamera : centerPoint = [x, y] (z=0), valeurs initiales du POI.
    var cam = comp.layers.addCamera("WC Camera", [target[0], target[1]]);
    // Ordre critique : parenté D'ABORD. L'affectation de parent compense la
    // position pour éviter un saut apparent (doc Adobe, Layer.parent) ; on
    // pose ensuite la position LOCALE voulue par-dessus.
    cam.parent = rig;
    // Orientation portée par le rig : la caméra ne suit PAS son POI toute seule.
    // (Espace de coordonnées du POI d'une caméra parentée non confirmé par la
    // doc Adobe : à vérifier lors du premier test AE réel.)
    try { cam.autoOrient = AutoOrientType.NO_AUTO_ORIENT; } catch (e) {}
    needProp(cam, "ADBE Position", "Position").setValue([0, 0, -dist]); // local au rig
    var poi = propOf(cam, "ADBE Point of Interest", "Point of Interest");
    if (poi) poi.setValue(target);
    if (camSpec.zoom) camOpt(cam, "ADBE Camera Zoom", "Zoom").setValue(camSpec.zoom);
    if (camSpec.depthOfField) {
      camOpt(cam, "ADBE Camera Depth of Field", "Depth of Field").setValue(1);
      if (camSpec.focusDistance) camOpt(cam, "ADBE Camera Focus Distance", "Focus Distance").setValue(camSpec.focusDistance);
      if (camSpec.aperture) camOpt(cam, "ADBE Camera Aperture", "Aperture").setValue(camSpec.aperture);
    }
    return { cam: cam, rig: rig, target: target, dist: dist };
  }

  /* ---------------- mouvements ---------------- */

  function applyMove(ctx, m) {
    var cam = ctx.cam, rig = ctx.rig, t0 = m.t0, t1 = m.t1;
    var p = m.params || {};
    var i, n, t;

    var rigPos = needProp(rig, "ADBE Position", "Position");
    var rigRotX = needProp(rig, "ADBE Rotate X", "X Rotation");
    var rigRotY = needProp(rig, "ADBE Rotate Y", "Y Rotation");
    var rigRotZ = needProp(rig, "ADBE Rotate Z", "Z Rotation");
    var camPos = needProp(cam, "ADBE Position", "Position");

    switch (m.type) {
      case "dollyIn": case "pushIn": case "dollyOut": case "pullOut": {
        var sign = (m.type === "dollyIn" || m.type === "pushIn") ? 1 : -1;
        var amp = (p.amount !== undefined ? p.amount : 400) * sign;
        var start = valueBefore(camPos, t0, [0, 0, -ctx.dist]);
        RWCurves.apply(camPos, t0, t1, start, [start[0], start[1], start[2] + amp], p.curve || "easeInOut");
        break;
      }
      case "truck": {
        var dx = p.amount !== undefined ? p.amount : 400;
        var s1 = valueBefore(rigPos, t0, ctx.target);
        RWCurves.apply(rigPos, t0, t1, s1, [s1[0] + dx, s1[1], s1[2]], p.curve || "easeInOut");
        break;
      }
      case "pan": case "orbit": {
        var a1 = p.angle !== undefined ? p.angle : (m.type === "pan" ? 30 : 90);
        var r0 = valueBefore(rigRotY, t0, 0);
        RWCurves.apply(rigRotY, t0, t1, r0, r0 + a1, p.curve || "easeInOut");
        break;
      }
      case "tilt": {
        var ta = p.angle !== undefined ? p.angle : 15;
        var x0 = valueBefore(rigRotX, t0, 0);
        RWCurves.apply(rigRotX, t0, t1, x0, x0 + ta, p.curve || "easeInOut");
        break;
      }
      case "crane": case "pedestal": {
        var dy = p.amount !== undefined ? p.amount : -300;
        var s2 = valueBefore(rigPos, t0, ctx.target);
        RWCurves.apply(rigPos, t0, t1, s2, [s2[0], s2[1] + dy, s2[2]], p.curve || "easeInOut");
        if (m.type === "crane" && p.tilt !== false) {
          var tx0 = valueBefore(rigRotX, t0, 0);
          RWCurves.apply(rigRotX, t0, t1, tx0, tx0 - dy * 0.02, "easeInOut");
        }
        break;
      }
      case "roll": {
        var ra = p.angle !== undefined ? p.angle : 10;
        var z0r = valueBefore(rigRotZ, t0, 0);
        RWCurves.apply(rigRotZ, t0, t1, z0r, z0r + ra, p.curve || "easeInOut");
        break;
      }
      case "zoomIn": case "zoomOut": {
        // Zoom optique : focale, JAMAIS de déplacement physique (cahier 5.1).
        var zoomP = camOpt(cam, "ADBE Camera Zoom", "Zoom");
        var zCur = zoomP.value;
        var z0 = p.from !== undefined ? p.from : zCur;
        var z1 = p.to !== undefined ? p.to : (m.type === "zoomIn" ? z0 * 1.6 : z0 / 1.6);
        RWCurves.apply(zoomP, t0, t1, z0, z1, p.curve || "easeInOut");
        break;
      }
      case "whipPan": {
        var wa = p.angle !== undefined ? p.angle : 90;
        var w0 = valueBefore(rigRotY, t0, 0);
        RWCurves.apply(rigRotY, t0, t1, w0, w0 + wa, "custom",
          { outInfluence: 80, inInfluenceStart: 5, inInfluenceEnd: 80 });
        break;
      }
      case "parallax": {
        if (p.depths) {
          for (var name in p.depths) {
            var L = findLayer(ctx.comp, name);
            if (L) {
              var lp = propOf(L, "ADBE Position", "Position");
              if (lp) {
                var v = lp.value;
                lp.setValue([v[0], v[1], p.depths[name]]);
              }
            } else if (ctx.warnings) {
              ctx.warnings.push("parallax: calque '" + name + "' introuvable, profondeur ignorée");
            }
          }
        }
        var dir = p.out ? -1 : 1;
        var amp3 = (p.amount !== undefined ? p.amount : 400) * dir;
        var s3 = valueBefore(camPos, t0, [0, 0, -ctx.dist]);
        RWCurves.apply(camPos, t0, t1, s3, [s3[0], s3[1], s3[2] + amp3], p.curve || "easeInOut");
        break;
      }
      case "handheld": case "shake": {
        var ampPix = p.amplitude !== undefined ? p.amplitude : (m.type === "shake" ? 18 : 6);
        var steps = Math.max(4, Math.round((t1 - t0) * 12));
        var seed = p.seed || 7;
        var base = valueBefore(rigPos, t0, ctx.target);
        var rb = valueBefore(rigRotZ, t0, 0);
        for (i = 0; i <= steps; i++) {
          t = t0 + (t1 - t0) * (i / steps);
          rigPos.setValueAtTime(t, [
            base[0] + smoothNoise(i, seed, 0) * ampPix,
            base[1] + smoothNoise(i, seed, 1) * ampPix * 0.7,
            base[2]
          ]);
          rigRotZ.setValueAtTime(t, rb + smoothNoise(i, seed, 2) * ampPix * 0.02);
        }
        break;
      }
      case "rackFocus": {
        camOpt(cam, "ADBE Camera Depth of Field", "Depth of Field").setValue(1);
        var fP = camOpt(cam, "ADBE Camera Focus Distance", "Focus Distance");
        var f0 = p.from !== undefined ? p.from : ctx.dist;
        var f1 = p.to !== undefined ? p.to : ctx.dist / 2;
        RWCurves.apply(fP, t0, t1, f0, f1, p.curve || "easeInOut");
        break;
      }
    }
  }

  /* ---------------- point d'entrée ---------------- */

  // Tri stable par t0 : les mouvements s'appliquent dans l'ordre du temps,
  // même si la spec les liste dans le désordre (valueBefore en dépend).
  function sortMoves(moves) {
    var copy = [];
    var i, j;
    for (i = 0; i < moves.length; i++) copy.push(moves[i]);
    for (i = 1; i < copy.length; i++) {
      var m = copy[i];
      for (j = i - 1; j >= 0 && copy[j].t0 > m.t0; j--) copy[j + 1] = copy[j];
      copy[j + 1] = m;
    }
    return copy;
  }

  function applySpec(spec) {
    validate(spec);
    var comp = null, layers, ctx;
    var createdSources = [];
    var warnings = [];
    // Avertissement cible : nom inconnu -> repli centre de comp (signalé).
    if (spec.camera.target && spec.layers) {
      var found = false;
      for (var li = 0; li < spec.layers.length; li++) {
        if (spec.layers[li] && spec.layers[li].name === spec.camera.target) found = true;
      }
      if (!found) warnings.push("camera.target '" + spec.camera.target + "' introuvable dans spec.layers : cible = centre de la comp");
    }
    app.beginUndoGroup("Rigwink applySpec");
    try {
      comp = buildComp(spec);
      layers = buildLayers(comp, spec, createdSources);
      ctx = buildCamera(comp, spec, layers);
      ctx.comp = comp;
      ctx.warnings = warnings;
      var moves = sortMoves(spec.camera.moves);
      for (var j = 0; j < moves.length; j++) {
        applyMove(ctx, moves[j]);
      }
    } catch (e) {
      // Pas de comp à moitié construite ni de solides orphelins.
      try { if (comp) comp.remove(); } catch (e2) {}
      for (var si = 0; si < createdSources.length; si++) {
        try { createdSources[si].remove(); } catch (e3) {}
      }
      throw e;
    } finally {
      app.endUndoGroup();
    }
    return { comp: comp, camera: ctx.cam, rig: ctx.rig, warnings: warnings };
  }

  return { applySpec: applySpec, validate: validate, moveTypes: MOVE_TYPES,
           layerProps: LAYER_PROPS, VERSION: VERSION };
})();


/*
 * Rigwink Inspect v0.3 — Project Intelligence (sous-ensemble cahier Partie 8).
 * Typage par matchName de calque (fiable, non localisé) ; property() peut
 * renvoyer null sans exception, donc aucune détection par try/catch.
 * Nécessite RWJSON (json.jsx) pour la sérialisation.
 */
var RWInspect = (function () {
  var VERSION = "0.3.0";

  function fail(msg) { throw new Error("RWInspect: " + msg); }

  function layerType(L) {
    if (L.nullLayer) return "null";
    var mn = null;
    try { mn = L.matchName; } catch (e) { mn = null; }
    if (mn === "ADBE Camera Layer") return "camera";
    if (mn === "ADBE Text Layer") return "text";
    if (mn === "ADBE Light Layer") return "light";
    if (mn === "ADBE Vector Layer") return "shape";
    // Repli si matchName indisponible : sonde par propriété, en testant null.
    if (!mn) {
      var z = null;
      try { z = L.property("ADBE Camera Zoom"); } catch (e) { z = null; }
      if (z) return "camera";
      var st = null;
      try { st = L.property("ADBE Text Document"); } catch (e2) { st = null; }
      if (st) return "text";
    }
    return "layer";
  }

  function probe(layer, matchName, display) {
    var p = null;
    try { p = layer.property(matchName); } catch (e) { p = null; }
    if (!p && display) { try { p = layer.property(display); } catch (e2) { p = null; } }
    return p;
  }

  function layerInfo(L, index, deep) {
    var info = {
      index: index,
      name: L.name,
      type: layerType(L),
      threeD: !!L.threeDLayer
    };
    if (deep) {
      var pos = probe(L, "ADBE Position", "Position");
      if (pos) info.position = pos.value;
      var op = probe(L, "ADBE Opacity", "Opacity");
      if (op) info.opacity = op.value;
      try { info.parent = L.parent ? L.parent.name : null; } catch (e) {}
    }
    return info;
  }

  function isComp(item) {
    return item && item.layers && typeof item.layers.addCamera === "function";
  }

  function compInfo(comp, deep) {
    if (!isComp(comp)) fail("item is not a composition");
    var info = {
      name: comp.name, width: comp.width, height: comp.height,
      frameRate: comp.frameRate, duration: comp.duration,
      numLayers: comp.numLayers, layers: []
    };
    for (var i = 1; i <= comp.numLayers; i++) {
      info.layers.push(layerInfo(comp.layer(i), i, deep));
    }
    return info;
  }

  function activeCompInfo(deep) {
    var item = app.project.activeItem;
    if (!isComp(item)) fail("no active composition");
    return compInfo(item, deep);
  }

  function projectInfo() {
    var n = 0;
    try { n = app.project.items.list ? app.project.items.list.length : app.project.numItems; } catch (e) {}
    return { numItems: n };
  }

  function toJSON(o) { return RWJSON.stringify(o); }

  return {
    compInfo: compInfo, activeCompInfo: activeCompInfo,
    projectInfo: projectInfo, layerType: layerType, toJSON: toJSON,
    VERSION: VERSION
  };
})();


/*
 * Rigwink Actions v0.3 — Action Registry (cahier Partie 9, sous-ensemble).
 * Outils déclarés et validés uniquement ; réponses {ok, tool, result|error}.
 * Nécessite RWJSON, RWCurves, RWEngine, RWInspect chargés avant.
 */
var RWActions = (function () {
  var VERSION = "0.4.0";

  function isNum(n) { return typeof n === "number" && isFinite(n); }
  function req(p, name) { if (p[name] === undefined) throw new Error("paramètre requis: " + name); return p[name]; }

  var registry = {
    "project.inspect": {
      validate: function () { return true; },
      run: function () { return RWInspect.projectInfo(); }
    },
    "comp.inspect": {
      validate: function (p) { if (p.deep !== undefined && typeof p.deep !== "boolean") throw new Error("deep doit être booléen"); return true; },
      run: function (p) { return RWInspect.activeCompInfo(!!p.deep); }
    },
    "comp.create": {
      validate: function (p) {
        req(p, "name");
        var nums = ["width", "height", "fps", "duration"];
        for (var i = 0; i < nums.length; i++) { if (!isNum(req(p, nums[i]))) throw new Error(nums[i] + " doit être un nombre"); }
        if (p.width < 4 || p.width > 30000 || p.height < 4 || p.height > 30000) throw new Error("taille hors bornes AE (4-30000)");
        if (p.fps < 1 || p.fps > 99) throw new Error("fps dans [1,99]");
        return true;
      },
      run: function (p) {
        var comp;
        app.beginUndoGroup("Rigwink comp.create");
        try {
          comp = app.project.items.addComp(p.name, p.width, p.height, p.pixelAspect || 1, p.duration, p.fps);
        } finally {
          app.endUndoGroup();
        }
        return RWInspect.compInfo(comp, false);
      }
    },
    "motion.apply": {
      validate: function (p) { req(p, "spec"); RWEngine.validate(p.spec); return true; },
      run: function (p) {
        var r = RWEngine.applySpec(p.spec);
        return { comp: r.comp.name, numLayers: r.comp.numLayers, engine: RWEngine.VERSION,
                 warnings: r.warnings };
      }
    },
    "layer.animate": {
      validate: function (p) {
        req(p, "layer"); req(p, "property");
        if (!RWEngine.layerProps[p.property]) throw new Error("propriété non animable: " + p.property +
          " (dispo: Position, Scale, Opacity, Rotation, X/Y/Z Rotation)");
        var ts = ["t0", "t1"];
        for (var i = 0; i < ts.length; i++) { if (!isNum(req(p, ts[i]))) throw new Error(ts[i] + " doit être un nombre"); }
        if (p.t1 <= p.t0) throw new Error("t1 doit être > t0");
        if (p.from === undefined || p.to === undefined) throw new Error("from/to requis");
        if (p.curve !== undefined && !RWCurves.has(p.curve)) throw new Error("courbe inconnue: " + p.curve);
        return true;
      },
      run: function (p) {
        var comp = app.project.activeItem;
        if (!comp) throw new Error("no active composition");
        var layer = null;
        for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).name === p.layer) layer = comp.layer(i);
        if (!layer) throw new Error("calque introuvable: " + p.layer);
        var prop = null;
        try { prop = layer.property(RWEngine.layerProps[p.property]); } catch (e) { prop = null; }
        if (!prop) { try { prop = layer.property(p.property); } catch (e2) { prop = null; } }
        if (!prop) throw new Error("propriété '" + p.property + "' absente du calque '" + p.layer + "'");
        var before = prop.numKeys;
        RWCurves.apply(prop, p.t0, p.t1, p.from, p.to, p.curve || "easeInOut", p.curveOptions);
        return { layer: p.layer, property: p.property, keysAdded: prop.numKeys - before };
      }
    }
  };

  function list() { var n = []; for (var k in registry) n.push(k); return n; }

  function run(name, params) {
    params = params || {};
    var tool = registry[name];
    if (!tool) return { ok: false, tool: name, error: "outil inconnu (dispo: " + list().join(", ") + ")" };
    try {
      tool.validate(params);
    } catch (e) {
      return { ok: false, tool: name, error: "validation: " + e.message };
    }
    try {
      return { ok: true, tool: name, result: tool.run(params) };
    } catch (e) {
      return { ok: false, tool: name, error: e.message };
    }
  }

  return { run: run, list: list, VERSION: VERSION };
})();


/*
 * Rigwink Bridge v0.3 — logique du dossier-pont, pure et testable hors AE.
 * Parsing STRICT via RWJSON : jamais d'eval (une spec n'est pas du code).
 * L'I/O fichier réelle reste dans panel.jsx et run-spec.jsx.
 */
var RWBridge = (function () {
  var VERSION = "0.4.0";

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


/*
 * Rigwink Presets v0.1 — bibliothèque de mouvements préconfigurés (cahier 5.4).
 * Chaque preset retourne des moves de spec JSON ; tous les paramètres sont
 * surchargeables via opts. Les valeurs par défaut sont des points de départ
 * calibrés, pas des vérités : l'utilisateur les modifie librement.
 */
var RWPresets = (function () {
  var VERSION = "0.1.0";

  function num(v, d) { return (typeof v === "number" && isFinite(v)) ? v : d; }

  var BUILDERS = {
    // Approche progressive, accélération maîtrisée, ralentissement final.
    "cinematic-push-in": function (o) {
      return [{ type: "pushIn", t0: num(o.t0, 0), t1: num(o.t1, 4),
                params: { amount: num(o.amount, 500), curve: "exponential" } }];
    },
    // Rotation autour du sujet, parallaxe et profondeur.
    "hero-orbit": function (o) {
      var moves = [{ type: "orbit", t0: num(o.t0, 0), t1: num(o.t1, 6),
                     params: { angle: num(o.angle, 120), curve: "easeInOut" } }];
      if (o.depths) {
        moves.push({ type: "parallax", t0: num(o.t0, 0), t1: num(o.t1, 6),
                     params: { amount: num(o.drift, 150), depths: o.depths, curve: "easeInOut" } });
      }
      return moves;
    },
    // Mouvement latéral rapide, arrêt net, stabilisation.
    "dynamic-whip-pan": function (o) {
      return [
        { type: "whipPan", t0: num(o.t0, 0), t1: num(o.t1, 0.5), params: { angle: num(o.angle, 120) } },
        { type: "handheld", t0: num(o.t1, 0.5), t1: num(o.settle, 1.2),
          params: { amplitude: num(o.settleAmplitude, 2), seed: num(o.seed, 11) } }
      ];
    },
    // Déplacement lent, révélation progressive, profondeur.
    "slow-dolly-reveal": function (o) {
      return [{ type: "dollyIn", t0: num(o.t0, 0), t1: num(o.t1, 8),
                params: { amount: num(o.amount, 300), curve: "circular" } }];
    },
    // Micro-mouvements irréguliers, amplitude contrôlée, sans jitter excessif.
    "handheld-cinematic": function (o) {
      return [{ type: "handheld", t0: num(o.t0, 0), t1: num(o.t1, 10),
                params: { amplitude: num(o.amplitude, 5), seed: num(o.seed, 7) } }];
    }
  };

  function names() { var n = []; for (var k in BUILDERS) n.push(k); return n; }

  // Retourne un fragment {camera:{moves:[...]}} à fusionner dans une spec.
  function build(name, opts) {
    var b = BUILDERS[name];
    if (!b) throw new Error("RWPresets: preset inconnu '" + name + "' (dispo: " + names().join(", ") + ")");
    return { camera: { moves: b(opts || {}) } };
  }

  return { build: build, names: names, VERSION: VERSION };
})();


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
