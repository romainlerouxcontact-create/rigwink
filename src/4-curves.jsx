/*
 * Rigwink Curves v0.7 — bibliothèque de courbes d'animation (ES3).
 * Corrections revue : index de clés via nearestKeyIndex (les clés sont triées
 * par temps, setValueAtTime remplace une clé au même temps), tableaux d'ease
 * dimensionnés selon la propriété (Scale 2D/3D exige une KeyframeEase par
 * dimension ; Position spatiale n'en prend qu'une ; influence bornée [0.1,100]).
 * Nécessite rien ; utilisé par engine.jsx.
 */
var RWCurves = (function () {
  var VERSION = "0.7.0";
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
if (typeof module !== "undefined" && module.exports) module.exports = RWCurves;
