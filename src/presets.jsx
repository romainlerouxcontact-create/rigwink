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
if (typeof module !== "undefined" && module.exports) module.exports = RWPresets;
