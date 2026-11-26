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
if (typeof module !== "undefined" && module.exports) module.exports = RWInspect;
