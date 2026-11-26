/*
 * Rigwink Actions v0.7 — Action Registry (cahier Partie 9, sous-ensemble).
 * Outils déclarés et validés uniquement ; réponses {ok, tool, result|error}.
 * Nécessite RWJSON, RWCurves, RWEngine, RWInspect chargés avant.
 */
var RWActions = (function () {
  var VERSION = "0.7.0";

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
if (typeof module !== "undefined" && module.exports) module.exports = RWActions;
