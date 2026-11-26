/*
 * Mock du DOM After Effects v3 — plus proche du vrai comportement :
 * - property() renvoie NULL pour une propriété absente (pas d'exception),
 *   résout matchName ET nom d'affichage ;
 * - clés triées par temps, setValueAtTime remplace une clé au même temps,
 *   nearestKeyIndex/keyTime/keyValue fournis ;
 * - setTemporalEaseAtKey exige une KeyframeEase par dimension
 *   (spatiale = 1, sinon nombre de composantes de la valeur) ;
 * - options caméra UNIQUEMENT dans le groupe "Camera Options" (force le
 *   chemin de repli du moteur) ;
 * - addCamera(name, [x,y]) conforme au contrat documenté ;
 * - comp.remove() supporté.
 * Ce n'est TOUJOURS pas After Effects : ça vérifie la cohérence des appels,
 * pas le rendu.
 */
"use strict";

function KeyframeEase(speed, influence) {
  this.speed = speed; this.influence = influence;
  if (influence < 0.1 || influence > 100) throw new Error("KeyframeEase influence hors [0.1,100]: " + influence);
}

var AutoOrientType = { NO_AUTO_ORIENT: 0, ALONG_PATH: 1, CAMERA_OR_POINT_OF_INTEREST: 2 };

var DISPLAY = {
  "ADBE Position": "Position", "ADBE Scale": "Scale", "ADBE Opacity": "Opacity",
  "ADBE Rotate X": "X Rotation", "ADBE Rotate Y": "Y Rotation", "ADBE Rotate Z": "Z Rotation",
  "ADBE Orientation": "Orientation", "ADBE Text Document": "Source Text",
  "ADBE Point of Interest": "Point of Interest",
  "ADBE Camera Options Group": "Camera Options",
  "ADBE Camera Zoom": "Zoom", "ADBE Camera Depth of Field": "Depth of Field",
  "ADBE Camera Focus Distance": "Focus Distance", "ADBE Camera Aperture": "Aperture"
};
var ALIAS = {};
Object.keys(DISPLAY).forEach(function (k) { ALIAS[DISPLAY[k]] = k; });
ALIAS["Rotation"] = "ADBE Rotate Z"; // display 2D

function easeDims(prop) {
  if (prop.isSpatial) return 1;
  var v = prop.value;
  return (v && typeof v === "object" && typeof v.length === "number" && v.length >= 2) ? v.length : 1;
}

var HIDDEN_ERR = 'After Effects error: Can not "set value" with this property, because the property or a parent property is hidden.';
function Property(name, value, opts) {
  opts = opts || {};
  this.name = name;
  this.value = value;
  this.isSpatial = !!opts.spatial;
  this.keys = [];   // triés par time
  this.eases = {};
  this.sets = 0;
  this.hidden = false; // état dynamique AE : parent désactivé -> écriture interdite
}
Property.prototype._checkHidden = function () {
  if (this.hidden) throw new Error(HIDDEN_ERR);
};
Object.defineProperty(Property.prototype, "numKeys", { get: function () { return this.keys.length; } });
Property.prototype.setValue = function (v) { this._checkHidden(); this.value = v; this.sets++; };
Property.prototype.setValueAtTime = function (t, v) {
  this._checkHidden();
  for (var i = 0; i < this.keys.length; i++) {
    if (Math.abs(this.keys[i].time - t) < 1e-6) { this.keys[i].value = v; return; }
  }
  this.keys.push({ time: t, value: v });
  this.keys.sort(function (a, b) { return a.time - b.time; });
};
Property.prototype.nearestKeyIndex = function (t) {
  if (!this.keys.length) throw new Error("nearestKeyIndex: aucune clé");
  var best = 0, bd = Infinity;
  for (var i = 0; i < this.keys.length; i++) {
    var d = Math.abs(this.keys[i].time - t);
    if (d < bd) { bd = d; best = i; }
  }
  return best + 1;
};
Property.prototype.keyTime = function (k) { return this.keys[k - 1].time; };
Property.prototype.keyValue = function (k) { return this.keys[k - 1].value; };
Property.prototype.keyInTemporalEase = function (k) {
  if (k < 1 || k > this.keys.length) throw new Error("keyInTemporalEase: mauvais index " + k);
  if (this.eases[k]) return this.eases[k].inE;
  var d = easeDims(this), arr = [];
  for (var i = 0; i < d; i++) arr.push(new KeyframeEase(0, 0.1));
  return arr;
};
Property.prototype.keyOutTemporalEase = function (k) {
  if (k < 1 || k > this.keys.length) throw new Error("keyOutTemporalEase: mauvais index " + k);
  if (this.eases[k]) return this.eases[k].outE;
  var d = easeDims(this), arr = [];
  for (var i = 0; i < d; i++) arr.push(new KeyframeEase(0, 0.1));
  return arr;
};
Property.prototype.setTemporalEaseAtKey = function (k, inE, outE) {
  this._checkHidden();
  if (k < 1 || k > this.keys.length) throw new Error("setTemporalEaseAtKey: mauvais index " + k);
  var dims = easeDims(this);
  if (inE.length !== dims || outE.length !== dims) {
    throw new Error("setTemporalEaseAtKey: " + this.name + " attend " + dims + " KeyframeEase, reçu " + inE.length + "/" + outE.length);
  }
  this.eases[k] = { inE: inE, outE: outE };
};

function PropertyGroup(name, props) { this.name = name; this._props = props; }
PropertyGroup.prototype.property = function (name) {
  var mn = ALIAS[name] || name;
  return this._props[mn] || null;
};

function TextDocument(text) { this.text = text; this.fontSize = 72; }

var layerCount = 0;
function Layer(name, kind) {
  this.name = name; this.kind = kind; this.id = ++layerCount;
  this.threeDLayer = false; this._parent = null; this.nullLayer = (kind === "null");
  this._autoOrient = AutoOrientType.CAMERA_OR_POINT_OF_INTEREST; // caméra 2 nœuds par défaut
  this.matchName = kind === "camera" ? "ADBE Camera Layer"
    : kind === "text" ? "ADBE Text Layer" : "ADBE AV Layer";
  this._props = {
    "ADBE Position": new Property("Position", [960, 540, 0], { spatial: true }),
    "ADBE Scale": new Property("Scale", [100, 100, 100]),
    "ADBE Opacity": new Property("Opacity", 100),
    "ADBE Rotate X": new Property("X Rotation", 0),
    "ADBE Rotate Y": new Property("Y Rotation", 0),
    "ADBE Rotate Z": new Property("Z Rotation", 0),
    "ADBE Orientation": new Property("Orientation", [0, 0, 0])
  };
  if (kind === "camera") {
    this._props["ADBE Point of Interest"] = new Property("Point of Interest", [960, 540, 0], { spatial: true });
    var camOpts = {
      "ADBE Camera Zoom": new Property("Zoom", 1200),
      "ADBE Camera Depth of Field": new Property("Depth of Field", 0),
      "ADBE Camera Focus Distance": new Property("Focus Distance", 1200),
      "ADBE Camera Aperture": new Property("Aperture", 2.8)
    };
    // En AE réel, ces options vivent dans le groupe ; PAS d'accès direct.
    this._props["ADBE Camera Options Group"] = new PropertyGroup("Camera Options", camOpts);
  }
  if (kind === "text") {
    this._props["ADBE Text Document"] = new Property("Source Text", new TextDocument(""));
  }
}
Layer.prototype.property = function (name) {
  var mn = ALIAS[name] || name;
  return this._props[mn] || null;
};
// Caméra one-node (NO_AUTO_ORIENT) : le Point of Interest devient masqué
// (ignoré par la caméra) ; toute écriture dessus lève l'erreur AE "hidden".
Object.defineProperty(Layer.prototype, "autoOrient", {
  get: function () { return this._autoOrient; },
  set: function (v) {
    this._autoOrient = v;
    var poi = this._props["ADBE Point of Interest"];
    if (poi) poi.hidden = (v === AutoOrientType.NO_AUTO_ORIENT);
  }
});
// Comme AE : affecter un parent compense la position (pas de saut apparent) ;
// seul setParentWithJump garderait les valeurs telles quelles.
Object.defineProperty(Layer.prototype, "parent", {
  get: function () { return this._parent; },
  set: function (p) {
    if (p && !this._parent) {
      var pp = null, my = this._props["ADBE Position"];
      try { pp = p.property("ADBE Position"); } catch (e) { pp = null; }
      if (pp && my) {
        var pw = pp.value, mw = my.value;
        my.value = [mw[0] - pw[0], mw[1] - pw[1], mw[2] - (pw[2] || 0)];
        for (var i = 0; i < my.keys.length; i++) {
          my.keys[i].value = [my.keys[i].value[0] - pw[0], my.keys[i].value[1] - pw[1], my.keys[i].value[2] - (pw[2] || 0)];
        }
      }
    }
    this._parent = p;
  }
});
Layer.prototype.setParentWithJump = function (p) { this._parent = p; };
// Position monde (translation seule, le rig n'a pas de rotation à la création)
Layer.prototype.worldPosition = function () {
  var v = this._props["ADBE Position"].value;
  var out = [v[0], v[1], v[2] || 0];
  var p = this._parent;
  while (p) {
    var pv = p._props["ADBE Position"].value;
    out = [out[0] + pv[0], out[1] + pv[1], out[2] + (pv[2] || 0)];
    p = p._parent;
  }
  return out;
};

function LayerCollection(comp) { this.comp = comp; this.list = []; }
LayerCollection.prototype.addSolid = function (color, name, w, h, pa, dur) {
  // AE crée aussi un item footage dans le projet (dossier Solids).
  var footage = { isFootage: true, name: name, _removed: false,
    remove: function () { this._removed = true; if (this._items) this._items.removeComp(this); } };
  var L = new Layer(name, "solid"); L.color = color; L.width = w; L.height = h; L.duration = dur;
  L.source = footage;
  if (this.comp._items) { footage._items = this.comp._items; this.comp._items.list.push(footage); }
  this.list.push(L); return L;
};
LayerCollection.prototype.addText = function (text) {
  var L = new Layer("text", "text");
  L._props["ADBE Text Document"].value = new TextDocument(text);
  this.list.push(L); return L;
};
LayerCollection.prototype.addCamera = function (name, centerPoint) {
  if (centerPoint && centerPoint.length !== 2) throw new Error("addCamera: centerPoint [x,y] attendu");
  var L = new Layer(name, "camera");
  if (centerPoint) L._props["ADBE Point of Interest"].value = [centerPoint[0], centerPoint[1], 0];
  this.list.push(L); return L;
};
LayerCollection.prototype.addNull = function (dur) {
  var L = new Layer("null", "null"); L.duration = dur; this.list.push(L); return L;
};

function CompItem(name, w, h, pa, dur, fps) {
  this.name = name; this.width = w; this.height = h; this.pixelAspect = pa;
  this.duration = dur; this.frameRate = fps; this.bgColor = [0, 0, 0];
  this.layers = new LayerCollection(this);
  this._removed = false;
}
Object.defineProperty(CompItem.prototype, "numLayers", { get: function () { return this.layers.list.length; } });
CompItem.prototype.layer = function (i) { return this.layers.list[i - 1]; };
CompItem.prototype.remove = function () {
  this._removed = true;
  if (this._items) this._items.removeComp(this);
};

function ItemCollection(app) { this.app = app; this.list = []; }
ItemCollection.prototype.addComp = function (n, w, h, pa, dur, fps) {
  if (w < 4 || w > 30000 || h < 4 || h > 30000) throw new Error("addComp: taille hors bornes");
  if (fps < 1 || fps > 99) throw new Error("addComp: fps hors bornes");
  var c = new CompItem(n, w, h, pa, dur, fps);
  c._items = this;
  this.list.push(c); this.app.project.activeItem = c; return c;
};
// remove() réel : retire de la liste (comme AE)
ItemCollection.prototype.removeComp = function (c) {
  var i = this.list.indexOf(c);
  if (i >= 0) this.list.splice(i, 1);
};

function makeApp() {
  var undoDepth = 0;
  var app = {
    project: { activeItem: null },
    beginUndoGroup: function () { undoDepth++; },
    endUndoGroup: function () { undoDepth--; if (undoDepth < 0) throw new Error("undo underflow"); },
    _undoDepth: function () { return undoDepth; }
  };
  app.project.items = new ItemCollection(app);
  return app;
}

module.exports = { makeApp: makeApp, KeyframeEase: KeyframeEase, AutoOrientType: AutoOrientType };
