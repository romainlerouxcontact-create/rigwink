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
if (typeof module !== "undefined" && module.exports) module.exports = RWJSON;
