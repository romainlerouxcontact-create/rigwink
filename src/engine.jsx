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
if (typeof module !== "undefined" && module.exports) module.exports = RWEngine;
